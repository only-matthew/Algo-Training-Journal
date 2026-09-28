# 问题清单：Algo Training Journal

审计快照：`HEAD = 2f8b0bf`（`fix submission flow and backfill CF ratings`），工作区干净。

方法：通读 `docs/` 全部 18 篇文档，对照 `lib/`、`workers/`、`scripts/`、`src/`、`test/` 源码，并对 `logs/` 真实数据做统计核对。每条给出现状、证据位置、影响与建议。所有"实际行为"结论都经过代码或数据验证；未验证的推测已剔除。

验证基线：`npm run verify` 全流程通过（语法检查 85 文件、`training:reindex --check`、58 个测试文件、`npm run generate`；本次构建 `Generated 193 logs for 3 members (500 reused, 0 rebuilt)`）。下面列出的问题都不是构建失败，而是**校验缺口、文档失真与口径未定义**。

---

## P0 — 会直接造成故障

### 1. 越界区间能终止整站构建，导致全队无法部署

**现状**：训练区间的"最多 120 天"限制**只在前端生效**，服务端不校验；而构建期会因为这个限制**抛异常**，且调用点没有兜底。

**证据**

- `lib/log-schema.mjs` 的 `validateLogInput`（v1 与 v2 日志路由共用）对区间只做三件事：两端为合法 `YYYY-MM-DD`、`startedOn <= solvedOn`。**没有** 120 天上限，**没有**与今天的比较。
- 120 天限制在 `lib/training-interval.mjs:14` 才抛出：`throw new RangeError('单次连续训练最多 120 天')`。
- `lib/form.mjs:1695` 调用 `validateTrainingInterval`（客户端）；`workers/` 全目录**没有任何**对该模块的引用。
- `scripts/generate-data.js:228` 在 `buildHeatmapCounts()` 里直接 `expandTrainingInterval(log, log.date)`，函数体内**没有 try/catch**。
- `expandTrainingInterval` 内部必然回调 `validateTrainingInterval`（`training-interval.mjs:21`），因此越界即抛。
- `.github/workflows/deploy.yml:32-33` 构建步骤执行 `npm run check`（含 `npm run generate`）。

**影响**：任一白名单成员只要写入一条 `startedOn` 早于 `solvedOn` 超过 120 天的日志（直接调 API、Stale Service Worker 缓存的旧前端、或手工改 `logs/`），下一次 push 触发的 CI 就会在 `buildHeatmapCounts` 抛 `RangeError`，**Pages 部署整体中断**，且报错信息只指向统计函数，与"某人的某条日志区间越界"距离很远。这是当前唯一能由单条业务数据打挂发布的路径。

**建议**：把 `validateTrainingInterval` 收敛进 `validateLogInput`（服务端强制）；同时让 `buildHeatmapCounts` 对越界区间降级为"按记录当天计一条并输出警告"，不要让统计函数拥有终止构建的能力。

### 2. 区间端点未与"今天"比较，未来日期可进入热力图与训练日统计

**现状**：`solvedOn` 可以填未来日期，服务端与构建期都不会拒绝。

**证据**

- `lib/training-interval.mjs:12` 有 `if (end > current) throw ...`，但 `:21` 组装参数时写成 `today: interval?.today || endDate` —— 构建期 `interval` 是日志对象、不含 `today`，于是 `current` 恒等于 `endDate`，该判断**永远不成立**。
- Worker 侧无任何区间校验（同第 1 条）。

**影响**：未来日期被 `buildHeatmapCounts` 写进 `all` / `byMember`，热力图会出现当前年份之外的格子；`docs/PENDING-FEATURES.md` 第 1 节明确把"`startedOn <= performedOn <= UTC+8 今天`"列为**服务端验证**项，此项未落实。

**建议**：构建期传入真实 `today`（`toDateString(new Date())`），服务端同样按 UTC+8 今天校验上界。

### 3. 重叠区间的天数在热力图中被重复计数；去重函数已写好却没有接线

**现状**：区间会被展开成逐日列表并**按记录累加**，同一天被多条记录覆盖时会叠加。

**证据**

- `scripts/generate-data.js:228-232`：`const dates = expandTrainingInterval(log, log.date); for (const day of dates) { all[day] = (all[day] || 0) + 1; ... }` —— 每条记录各自加 1，没有按 (member, day) 去重。
- 去重函数 `mergeTrainingDates` 已实现（`lib/training-interval.mjs:27`）且有测试（`test/training-interval.test.mjs:9`），但**全仓库唯一引用点是 `scripts/generate-data.js:1313` 的 import 语句，从未被调用**。
- `docs/PENDING-FEATURES.md` 第 37 行要求："事件区间与历史单日求并集，重叠天数不重复计。"

**影响**：同一队员"9/20 单日记录一题" + "另一条记录区间 9/18–9/22"，会让 9/20 的热力值变成 2。热力图口径（记录数 vs 训练日）因此在有区间的数据上已经不纯；目前已实测有 4 份日志带区间，问题已实际存在。

**建议**：明确热力图到底表达"记录数"还是"训练日"。若为训练日，用 `mergeTrainingDates` 接线；若为记录数，改文档说明并修掉这个未使用的 import（死导入本身也是隐患）。

---

## P1 — 校验与数据完整性缺口

### 4. 复习快捷操作仍是"读整天 → 改一题 → 写整天"

**证据**：`lib/renderer.mjs:315` `await saveDateLog(item.date, next, {}, revision)`；`saveDateLog` 走的是整日 PUT（`lib/journal-api.js:50`）。`docs/SPECIFICATION.md:75` 的兼容表要求"复习按钮后台整日 PUT → 改用单题复习命令"，`:82` 要求"不能保留一个无版本 PUT 旁路"。

**影响**：版本检查这一半已满足（带 `revision`，不会静默覆盖），但**命令粒度**未满足。同一天另一道题被改动（另一标签页、另一设备）就会让复习操作返回 409，用户看到的是"点一下没反应/失败"。

**建议**：改用 `PATCH /me/logs/dates/:date/records/:id` —— 注意该路由本身也还没实现（见第 7 条）。

### 5. 身份键有两套：日志用中文名，v2 用 GitHub login

**证据**

- 白名单硬编码：`workers/oauth.mjs:24` `const MEMBERS = { "only-matthew": "廖夏", wzzzzhhhhh: "王梓豪", "seanist-isx": "郭一鸣" }`。
- 日志目录用中文名（`logs/廖夏/...`），v2 目录用 login：`workers/oauth.mjs:348` 等处的 `training/members/${user.login}/...`。
- 登录匹配用 login：`workers/oauth.mjs:807` `const member = MEMBERS[githubUser.login]`。
- `docs/SPECIFICATION.md:88-89` 要求：`memberId` 是部署后不随姓名或 GitHub login 变化的固定 slug；`config/members.json` 存 `{memberId, githubUserId, login, logDirectory}`；"OAuth 必须按固定 githubUserId 匹配，不信任客户端 memberId"。

**影响**：队员一旦改 GitHub 用户名，`MEMBERS[login]` 查不到 → **直接失去登录权限**；即使重新加入，`training/` 下已有的 v2 数据会留在旧目录成为孤儿。而 `logs/` 因为用中文名反而不受影响 —— 同一份数据、两种存亡行为。

**建议**：落地 `config/members.json`，OAuth 改按 `githubUserId` 匹配，`training/` 目录改用固定 `memberId`。

### 6. `config/members.json` 从未存在，但规格以它为前提

**证据**：仓库根目录**没有** `config/`，`git log --all` 也从未跟踪过该路径。`README.md:547` 自认"成员白名单、仓库地址和允许来源目前直接维护在 Worker 源码中"。而 `docs/SPECIFICATION.md:89`、第 13 节多处引用该文件。

**影响**：规格的鉴权与身份契约无法落地；按规格找文件的人会找不到，也无法判断这是"待建"还是"已废弃"。

**建议**：二选一 —— 实施它，或在规格里显式降级为"硬编码白名单（现状）"并删除对 `config/` 的引用。当前"规格要求 + 代码没有 + README 承认"三者并存，是最容易误导的状态。

### 7. v2 路由只实现约一半，`attempt` 事件"可写不可按题读"

**已实现**（`workers/oauth.mjs:276-350` 与 `/logs/dates` 系列）：`GET /me/reviews|workbench|recommendations`、`POST /me/plan-actions`、`GET|PUT /me/profile`、`GET|PUT /me/plans/:date`、`POST /me/attempts`、`POST /me/review-actions`、`GET|PUT /me/assessments/:nodeId`、`GET /me/operations/:id`。

**规格要求但未实现**（`docs/SPECIFICATION.md:245-271`）：`POST /me/records`、`GET|PATCH|DELETE /me/logs/dates/:date/records/:id`、`GET /me/attempts`（列表）、`POST /me/attempts/:id/corrections`、`POST /me/attempts/:id/void`、`GET /me/evidence/:nodeId`、`POST /me/plan-links`。

**影响**：可以写入一次尝试，却**没有按 `subjectKey` 列出事件**的接口；证据卡只以聚合形式出现在 workbench，无法分页追溯原事件。规格第 14 节"可追溯原事件"的验收项因此不成立。纠错/作废（`corrections` / `void`）缺失意味着写错的事件**在 API 层无法修正** —— 而事件按设计是"不可原位改写"的。

**建议**：至少在规格里把已实现/未实现标注出来（当前读者无法区分），并优先补 `GET /me/attempts`、`corrections`、`void` 三个读改接口。

### 8. 活力指数的 outcome 口径陈述已过期

**现状**：文档称"165 条都保持 unknown"，实际日志里已经有真实完成结果，且活力代码**已经在读它**。

**证据**

- `docs/VITALITY-V2.md:22`：「当前日志没有完成结果的权威接入，**165 条都保持 unknown**；不写入伪造结果。未来通过尝试事件投影提供 outcome。」
- 实际：`lib/learning-state.mjs:3` 定义 `OUTCOMES = ["independent","hinted","editorial","unfinished"]`，`normalizeLearningState`（`:20-23`）把 `outcome` 落库，`lib/log-schema.mjs:223` 将其展开进 `meta.json`；`lib/vitality.mjs:156` 明确 `const outcome = Object.hasOwn(OUTCOME_CREDIT, record.outcome) ? record.outcome : 'unknown'`。
- 实测 193 条题目记录中 **24 条带 `outcome`**：`independent` 12、`hinted` 10、`editorial` 2。另 169 条无该字段（走 `unknown=0.6`）。

**影响**：读者会以为活力全部按 `unknown=0.6` 计分，从而低估已经真实计入的 24 条，也会误判"必须先做事件投影才能用 outcome"。该文档写于 2026-09-13，而 v5 学习状态字段是 2026-09-16/18 才落的 —— 属于后续演进未回写。

**建议**：修正该段，并在 `VITALITY-V2.md` 与 `LEARNING-STATE-SPECIFICATION.md` 之间建立单一权威：`outcome` 现在有两条来源（v1 自评字段、v2 事件），必须写清优先关系（见第 21 条）。

---

## P2 — 文档与实现冲突

### 9. `PENDING-FEATURES.md` 把已上线的两项功能写成"尚未实现"，而 README 完全没写这项功能

**证据**

- `docs/PENDING-FEATURES.md:3`：「**状态：设计已修订，区间录入与同日多份正文尚未实现。**」；`:69`：「`fileIndex` 尚未实现。」
- 实际已实现：`lib/log-schema.mjs:225` 持久化 `fileIndex`、`:210-211` 持久化 `startedOn`/`solvedOn`；`lib/training-interval.mjs` 存在且被 `lib/form.mjs` 与 `scripts/generate-data.js` 使用；`fileIndex` 贯穿表单（`lib/form.mjs:204,234,1351`）、schema（`log-schema.mjs:170-177`）、Worker 写入（`oauth.mjs:581-599`）、读取（`oauth.mjs:704`）与构建（`generate-data.js:117`）。
- 引入提交：`50e9309`（2026-09-13，`feat: add rating vitality and interval training support`）。
- 仓库自己的交接文档也说已完成：`docs/HANDOFF.md:590`「`fileIndex` 与区间字段基础链路已完成，下一步接入事件级结果投影和同题结算」；`:681`「文件槽位已稳定化……题目重排不会再让描述、题解串位」。
- 实测生产数据：**4 份日志带区间字段**；`fileIndex` 已随保存落盘。
- 另一侧：`README.md` 全文检索「区间」「连续训练」「startedOn」「solvedOn」**零命中**（唯一"区间"是"难度区间"），而 `README.md:527` 仍把 `PENDING-FEATURES.md` 标注为「待实现：区间打卡与同日多次打卡」。

**影响**：这是全仓库最容易造成返工的一处。按 `PENDING-FEATURES.md` 施工的人会去实现已经存在、且在用的功能；而按 README 了解产品的人**根本不知道这个功能存在**。文档在两个方向上同时失真。

**建议**：把 `PENDING-FEATURES.md` 的状态改为分阶段事实 —— 阶段 A（`fileIndex` 槽位）与阶段 B（区间录入）**已完成**，阶段 C（事件级结果投影、同题结算、streak/热力图并集）**未完成**（第 3 条正属此列）；README 补一节用户可见的区间训练说明。

### 10. `SPECIFICATION.md` 自称 `schemaVersion=3`，同文件与代码都是 v6

**证据**

- `docs/SPECIFICATION.md:71` 兼容表：「`lib/log-schema.mjs` | schemaVersion=3，最多 15 题/日，1,500,000 字节/次」。
- 同一文件 `:13`、`:17` 的专项补充写明"当前写入版本为 v6"；`docs/LEARNING-STATE-SPECIFICATION.md:7` 同样写 v6。
- 代码：`lib/log-schema.mjs:7` `export const LOG_SCHEMA_VERSION = 6;`。
- 实测 `logs/**/meta.json` 版本分布：v1×9、v2×35、v3×82、v4×1、v5×5、v6×17，另 **7 份完全没有 `schemaVersion` 字段**。

**影响**：同一份规格自相矛盾；§2 作为"现有实现与必须兼容的边界"，按 v3 描述实际要兼容的 6 个版本加无版本文件，兼容边界被严重低估。

**建议**：§2 表格改为"当前写入 v6，最低兼容**无版本**/v1"，并附一张版本演进表（v4=附件/来源/AI 字段、v5=学习状态四字段、v6=`statementImages`）。同时明确 7 份无版本文件的读取契约 —— 目前 `validateSchemaVersion(undefined)` 是放行的，但规格只在 §4.1 规定"未知的**未来** schemaVersion 报 `UNSUPPORTED_SCHEMA`"，未定义缺失版本。

### 11. `SPECIFICATION.md` §3.3 的权威文件清单与仓库实际不符

**证据**：§3.3 列出 11 类路径。实际 `training/` 下只有：

```
training/indexes/catalog.json
training/members/<login>/profile.json          ×3
training/members/<login>/indexes/legacy.json   ×3
training/members/<login>/operations/<uuid>.json ×1
```

即：`events/`、`reviews/`、`assessments/`、`plans/`、`sequence.json`、`indexes/summary.json`、`indexes/attempts/YYYY-MM.json` **全部不存在**；而实际存在的 `indexes/legacy.json`（三个成员各一份，其中 `only-matthew` 那份 45 KB）**不在规格清单里**。

**影响**：规格把 v2 描述成已运行的系统，实际只有 profile 与一份 operation 落地；`legacy.json` 这个真正在用的索引没有任何规格描述，接管者只能从代码猜。

**建议**：§3.3 区分"目标布局"与"当前布局"，并把 `indexes/legacy.json` 补进契约（它同时被 `handleLogsV2` 的 `auxiliaryChanges` 每次保存更新，是当前唯一在用的个人索引）。

### 12. `PRODUCT.md` 的两处描述与代码相反

**证据**

- `docs/PRODUCT.md:11`：「"我的训练"已提供独立 `/training/` 页面、栏目切换、重复刷新及本人已发布历史日志的题数、最近训练与待复习入口。」
  - 实际：`lib/router.mjs:26-30` 显式下线该路由 —— `if (route === "training") { window.history.replaceState(null, "", "/"); route = ""; }`，注释为「"我的训练"已下线」；`site/` 下无 `training` 目录；`lib/training-dashboard.mjs`（该页面的完整 UI）只被 `test/training-dashboard.test.mjs` 引用。
- `docs/PRODUCT.md:13`：「当前计划编辑、接受候选/换题和完整自动推荐尚未接通；**推荐接口仍返回空候选**。」
  - 实际：`workers/services/training-read.mjs:59` `const recommendations = recommendV1({ ...context, profile: ..., exclude });`，`workers/oauth.mjs:266` 也调用 `recommendV1`；对应的 v2 测试 `v2 workbench ... returns recommendations` 通过。API 层**已返回真实候选**（"尚未接通"从 UI 角度或许仍成立，但"返回空候选"这句已不成立）。

**影响**：PRODUCT.md 是新人理解"这个产品现在能做什么"的首选文档，这两处会直接导致误判已完成度。

**建议**：修正这两处；若 `/training/` 确已下线，把 PRODUCT.md 中相关段落移到"历史设计"或明确标注下线日期与原因。

### 13. 多处规模数字已过期

**证据**

| 出处 | 文档写的 | 实测 |
| --- | --- | --- |
| `README.md:503-515` | 列出 13 个测试文件 | `test/*.test.mjs` 共 **58** 个 |
| `docs/HANDOFF.md:591` | 语法检查覆盖 **72** 个源码文件 | **85** 个 |
| `docs/OPTIMIZATION.md:7` | 2026-08-28：37 文件、199/199 测试通过 | 85 文件、58 个测试文件 |

**影响**：用文档评估改动面与覆盖率会系统性偏差。`OPTIMIZATION.md` 作为带日期的历史快照尚可接受，README 的文件清单会被当作当前结构。

**建议**：README 的文件清单改成"目录职责 + 举 2–3 个代表性文件"，不逐个列举；易变数字统一只在 HANDOFF 里按日期保留快照。

---

## P3 — 架构与维护性

### 14. `workers/oauth.mjs` 既是 HTTP 入口又是领域逻辑库

**证据**：该文件 1267 行，同时从自身 `export` 了纯业务能力：`planLogChanges`、`saveLog`、`readLog`、`deleteLog`、`planLegacyIndexChange`、`gitBlobSha`、`seal`、`logRoots`。外部直接 import 这些能力的至少有 `test/oauth-plan.test.mjs:5`、`test/journal-api.test.mjs:5`、`test/oauth-legacy-index.test.mjs:4`、`test/oauth-logs-date.test.mjs:11`。而 `workers/services/logs-v2.mjs` 已经存在同类职责（并 export 了 `createLogsV2Service`、`statementPath`、`revisionFromEntries` 等）。`docs/REPOSITORY-STRUCTURE.md:10` 规定"不依赖具体页面 DOM 的能力优先放 `lib/`"。

**影响**：日志规划/读写这类核心领域逻辑无法在不拉起 HTTP/OAuth 依赖的前提下测试或复用；`oauth.mjs` 与 `logs-v2.mjs` 职责重叠，新加日志规则时不知道该放哪边。

**建议**：把日志规划、读写、删除、索引导出迁入 `workers/services/logs-v2.mjs`（或更纯的部分进 `lib/`），`oauth.mjs` 只保留路由、鉴权与协议适配。

### 15. `scripts/` → `workers/` 的依赖越过文档边界

**证据**：`scripts/verify-import-live.mjs:5` `import worker, { seal, fetchAtCoderAccepted } from "../workers/oauth.mjs"`。`docs/REPOSITORY-STRUCTURE.md:37-45` 的依赖图里，`src/`、`workers/`、`scripts/`、`test/` 都只指向 `lib/`，没有 `scripts/ → workers/` 这条边。同文件 `:48` 又要求"Worker 和构建脚本可以复用 `lib/`"。

**影响**：一个人工验证脚本为了复用导入解析，要加载整个 Worker 模块（含 OAuth 常量与环境假设）。规则与现实的偏差没有记录，下一个人会照抄或误判。

**建议**：把 `fetchAtCoderAccepted`、`fetchCodeforcesAccepted`、`fetchLuoguProblems` 等纯抓取解析下沉到 `lib/` 或 `workers/services/`；若坚持现状，则在依赖图里显式画出 `scripts/ → workers/` 并说明理由。

### 16. v2 全套 API 对外可用，却没有任何前端消费者；它写入的数据没有展示入口

**证据**

- `lib/training-api.mjs` 只被 `lib/training-dashboard.mjs` 引用；`lib/training-dashboard.mjs` 只被 `test/training-dashboard.test.mjs` 引用。
- `src/app.js`（178 行）只装配 `theme` / `router` / `auth` / `journal-api` / `detail-interactions` / `application` 六个模块，不含训练工作台。
- 前端路由已下线 `/training/`（`lib/router.mjs:26-30`）；`site/` 无该目录。
- 但 Worker 侧 `/api/v2/me/*` 路由全部可达，测试也覆盖。

**影响**：一套有测试、能写 `training/` 的接口对外可用，却没有任何界面读它；`training/` 数据几乎为空（第 11 条）。维护者无法判断这是"在建"还是"已废弃"，而读 `PRODUCT.md` 会以为是"已提供"（第 12 条）。

**建议**：做一个明确决定并在文档中写明 —— 要么把 `training-dashboard.mjs` 接回 `src/app.js` 与路由（恢复 `/training/`），要么在 `README`/规格/`REPOSITORY-STRUCTURE` 中标注 v2 为冻结状态，并说明 `lib/training-*` 与 `/api/v2/me/*` 暂不消费。

### 17. `check-syntax.mjs` 会把环境错误报成"全部文件语法错误"，并吞掉真实原因

**证据**：`scripts/check-syntax.mjs:30-36` 用 `spawnSync(process.execPath, ["--check", file], { cwd, encoding: "utf8" })` 捕获输出，只判断 `result.status === 0`。当子进程**无法启动**时，`status` 为 `null`、`error` 为 `EPERM`，而 `stderr`/`stdout` 均为 `undefined`，于是 `:36` 打印的 `Syntax check failed: <file>` 后面跟一个 `undefined`，错误原因（EPERM）完全丢失。

本次审计中实测：`node --check lib/rating.mjs` 单独执行退出码 **0**；而该脚本把 **85 个文件全部**报为语法失败，真实原因是当前文件沙箱禁止 Node 以管道 stdio spawn 子进程。

**影响**：验证工具在最需要它的异常环境里给出的是**方向完全错误**的结论（"85 个源文件语法全坏"），并且没有留下可诊断的信息。它是 `npm run verify` 的第一步，一旦误报，后续步骤的意义也被掩盖。

**建议**：只关心退出码就不需要捕获输出 —— 改用 `stdio: "inherit"`；保留捕获时则必须显式区分 `result.error`，把 `error.code` 与 `error.message` 打进输出，并且**不要在子进程没能启动时继续把每个文件都列为语法失败**。

### 18. `deploy.yml` 内部 action 版本不一致

**证据**：`.github/workflows/deploy.yml` 的 `build` job 用 `actions/checkout@v5`（:22）与 `actions/setup-node@v5`（:25），同一个文件的 `browser-check` job 用 `@v6`（:50、:53）。跨文件也不一致：`qq-remind.yml` 用 v5，`checks.yml` 与 `difficulty.yml` 用 v6。

**影响**：同一仓库存在两种 CI 运行时基线，Node 缓存/行为差异的排查成本上升；`deploy.yml` 自身前后不一致尤其容易在升级时漏改一处。

**建议**：统一到 v6（`checks.yml` / `difficulty.yml` 已是最新）。

### 19. 一次性产物与巨型追加文档

**证据**

- `build/` 下有 `commit-msg.txt` 至 `commit-msg5.txt`、`review-form-preview.cjs`、`enrichment-preview-server.cjs`、`verify-deploy.mjs`、多个 `*.log`（`final-build.log`、`vitality-tests.log` 等）。
- `docs/HANDOFF.md` 79 KB / 684 行，纯追加式（顶部是 2026-09-25，底部是更早的轮次）。
- `README.md` 55 KB / 554 行。

**影响**：`build/` 已被 `.gitignore` 忽略，不影响仓库，但会污染本地全文搜索与"这个文件还有用吗"的判断。`HANDOFF.md` 与 `REPOSITORY-STRUCTURE.md:51`（"已完成的一次性迁移不要长期留在仓库"）的精神相反 —— 该文件的检索成本已明显高于它的价值。

**建议**：`build/` 直接清空（可重跑生成）；`HANDOFF.md` 分层为"当前有效交接"与 `docs/archive/HANDOFF-2026-07-08.md`，README 的结构清单不逐文件列举。

---

## P4 — 设计口径未定义

### 20. 区间训练把单题活力均摊到区间内每一天，但没有任何文档说明

**证据**：`scripts/generate-data.js:234` `valueAll[day] = ... (valueAll[day] || 0) + vitality / dates.length`；`:236` 同样处理 `valueByMember`。`docs/VITALITY-V2.md` 说明了个人的 `vitalityStatus`（`counted`/`completed_delta`/`duplicate`/`review`/`missing_rating`），但**未提区间分摊**。

**影响**：同一道题记为"1 天"与记为"10 天连续训练"，热力图与其个人活力曲线的形态显著不同（单日峰值 vs 十日长尾），而两种表现的"总额度"相同。这是有意的口径还是实现顺手，无从判断；核对个人活力时也没有"原始额度"字段可对照。

**建议**：在 `VITALITY-V2.md` 补一节说明区间分摊规则（含"总额度守恒"的表述），并在派生记录上保留未分摊的原始额度，供个人页核对。

### 21. "完成结果"同时存在于 v1 自评字段与 v2 事件，没有定义冲突优先级

**证据**

- v1：`lib/learning-state.mjs:3` 的 `OUTCOMES` 落在 `logs/**/meta.json` 的每题字段（实测 24 条有值）。
- v2：`docs/SPECIFICATION.md:142-173` 定义 `attempt.recorded` 事件为"权威历史"，并规定事件**不可原位改写**，纠错走 `attempt.corrected`、作废走 `attempt.voided`。
- 同文件 `:60` 声明"`logs/` 是日志正文的权威来源；`training/` 是新增计划、事件、自评的权威来源" —— 但"完成结果"同时落在两侧。
- 活力读的是 v1 字段（`lib/vitality.mjs:156`），而 `docs/VITALITY-V2.md:22` 说未来要改由事件投影提供。

**影响**：同一条记录的"完成结果"有两个可写来源，且 v2 的纠错/作废语义（设计上专为修正结果而生）**完全无法影响已经落在 v1 字段里的值**。活力与复习队列各取一边，未来接入事件投影时必然出现"以谁为准"的迁移问题。

**建议**：明确 v1 的 `outcome` 为"本人自评 / 兼容字段"、v2 事件为权威结果，并写明冲突时事件优先、以及单向迁移与回填策略；或者明确 v2 冻结（与第 16 条合并决策）。

### 22. CSS 管线：三个源文件合并为单一产物，但源 HTML 仍声明三个 link，其中两个的 `?v=` 是手工写死的无效值

**证据**

- `scripts/generate-data.js:297-305` 的 `writeStylesheet()` 把 `style.css` + `assets/final.css` + `assets/details.css` 按序拼接、压缩，输出单一 `site/style.css`。
- 构建产物 `site/index.html` 只有一条样式链接：`<link rel="stylesheet" href="style.css?v=7530672ba490" />`（内容哈希由 `:344-346` 生成）。
- 但源文件 `src/index.html` 里仍写着三条：`style.css?v=20260908-1`、`assets/final.css?v=20260909-3`、`assets/details.css?v=20260909-4`。

**影响**：给 `final.css`/`details.css` 手工 bump `?v=` 不会产生任何效果，容易让人以为缓存需要手动管理；同时"`final.css`"这个名字暗示它是一个必须排在 `style.css` 之后的覆盖层（`writeStylesheet` 的拼接顺序确实依赖它），这类"最终覆盖"式命名会让后续改动难以判断该改哪个文件。

**建议**：源 HTML 只保留一条真实生效的样式入口（或加注释说明另两条会被构建合并/丢弃）；`final.css` 按职责改名（例如 `overrides.css` 或直接合入 `style.css`）。

---

## 建议处理顺序

| 顺序 | 事项 | 理由 |
| --- | --- | --- |
| 1 | 第 1、2、3 条（区间校验与热力图去重） | 唯一能打挂发布/污染统计的一类，改动集中在 `log-schema.mjs`、`training-interval.mjs`、`generate-data.js` 三处 |
| 2 | 第 9 条（`PENDING-FEATURES.md` 状态）与第 12 条（`PRODUCT.md`） | 零代码成本，直接消除返工风险；顺手补 README 的区间训练说明 |
| 3 | 第 16 条（v2 冻结还是接回 UI） | 这是决定后续所有 v2 工作的前提，越早定越省事 |
| 4 | 第 8、10、11、13 条（文档口径与数字） | 与第 2 步同批可做完 |
| 5 | 第 5、6 条（身份键与 `config/members.json`） | 涉及鉴权，改动面大且需要迁移路径，应在 v2 决定之后 |
| 6 | 第 17、18 条（验证工具与 CI 版本） | 让"验证通过"重新可信，成本很低 |
| 7 | 第 14、15、19、20、21、22 条 | 结构性改善，可随其他改动顺带进行 |

第 4 条依赖第 7 条（单题 PATCH 路由未实现），第 20/21 条依赖第 8/16 条的口径决定。

---

# 签收记录（2026-09-26）

对 22 项逐条独立复核，不看改动声明、只核对代码与产物。

**验证手段**：完整读取未提交 diff（27 个文件）；`npm run verify` 全流程实跑；对文档声明做数据核对（`logs/**/meta.json` 统计、`site/data/overview.json` 与 `logs/` 目录对比）。

**验证基线**：`npm run verify` 通过 —— 语法检查 85 文件全过、`training:reindex --check` 通过、测试全绿（Worker 组 **72/72**，0 失败，较审计时 +1）、构建成功（`Generated 193 logs for 3 members (500 reused, 0 rebuilt)`，无 `[training-interval]` 警告，说明历史数据不存在越界区间）。

## 结论

| 判定 | 数量 | 条目 |
| --- | --- | --- |
| ✅ 已修复 | 20 | 1、2、3、4、5、6、8、9、10、11、12、13、14、15、16、17、18、20、21、22 |
| 🟡 部分修复 | 2 | 7、19 |
| ❌ 未修复 | 0 | — |

**签收意见：接受。** 全部 P0 与 P1 的故障与校验缺口已闭合，文档失真已系统性修正。签收时留下的第 3 条口径不一致与 4 条残留项（R1–R4）已由后续提交 `8f65c55` 收口，见文末「残留项收口」。剩余 2 项（7、19）属"按明确决策收敛"：v2 路由在规格里显式划界，清理只完成了文档部分。以下逐项记录。

## 逐项核对要点

### ✅ 第 1 条（越界区间终止构建）

三层都已闭合：

- `lib/log-schema.mjs:144` `validateLogInput(input, { recordDate, today })` 现在调用 `validateTrainingInterval`，服务端两处调用点（`workers/oauth.mjs:684` 的 `saveLog`、`workers/services/logs-v2.mjs:310`）都传入 `recordDate` 与 UTC+8 的 `today`
- `scripts/generate-data.js` 的 `buildHeatmapCounts(logs, today)` 用 try/catch 包住区间展开，越界时降级为"按记录当天计一条"并打印 `[training-interval] … using record date only`，注释写明 `Historical data must never take the whole site offline.`
- 新增断言覆盖三种拒绝（未来/逆序/超 120 天）与一条合法区间（`test/log-schema.test.mjs:104-110`）

`lib/training-interval.mjs` 把 `isDateString` 内联，解除了与 `log-schema.mjs` 的循环导入 —— 这是必要的配套修正，原实现会形成 `log-schema → training-interval → log-schema` 循环。

### ✅ 第 2 条（未来日期）

服务端已按 UTC+8 今天校验，测试断言 `/不能晚于今天/` 通过。残留见下方 R1。

### ✅ 第 3 条（重叠区间重复计数）—— 先以文档澄清口径，随后改为区间感知（`8f65c55`）

采纳的处理是**用文档收敛语义**而非改计算：

- `docs/VITALITY-V2.md`：「`count` 热力图仍表示覆盖当天的训练记录数，可能因多条记录而大于 1；"训练日"指标只取日期并集，不把记录数当成天数。」
- `scripts/generate-data.js` 中未使用的 `mergeTrainingDates` 导入已移除 ✅

**但残留一个可复现的口径冲突。** `mergeTrainingDates` 现在是**死代码**（仅定义与测试，无生产调用），而"训练日"实际由 `activeDays` 计算，只取记录日期、不展开区间：

```
scripts/generate-data.js:272   const activeDays = new Set(items.map((item) => item.date)).size;   // 近期统计
scripts/generate-data.js:560   const activeDays = new Set(memberLogs.map((log) => log.date)).size; // 成员页
```

实测（`site/data/overview.json` `generatedAt` = 2026-09-26 01:14，窗口 2026-08-28 → 2026-09-26）：

| 队员 | 记录日 | `recent30.activeDays` | 热力图覆盖日 | 仅由区间产生的日 |
| --- | --- | --- | --- | --- |
| 王梓豪 | 21 | 21 | **25** | 09-16、09-22、09-23、09-25 |
| 廖夏 | 18 | 18 | 18 | 无（其区间两端本就都有记录） |

王梓豪有 10 个区间字段的日志中，`09-22→09-24`、`09-25→09-26`、`09-16→09-17` 三条把 4 个**没有任何记录文件**的日期画进了热力图，而"训练日"仍显示 21。同站同一份数据出现"训练日历 25 天 / 训练日 21 天"两个不一致的数字。

而 `README.md` 新增的表述是："区间用于训练日历与每日活力分摊；累计题数仍按日志中的题目记录计算，**训练日按日期并集计算**。" 这句话紧跟区间说明，读者会理解为区间也进入训练日 —— 与代码不符。

**建议**（三选一，需明确一种并写进文档）：让 `activeDays` 也用 `mergeTrainingDates`（区间生效，热力图与训练日一致）；或明确"训练日 = 有记录的日期，区间只影响热力图与活力分摊"并修正 README；或删除死代码 `mergeTrainingDates` 以消除误导。

**收口（2026-09-27，提交 `8f65c55`）**：按第一方案实施——区间正式进入训练日口径。新增 `lib/training-interval.mjs` 的 `trainingDatesOf()`（越界区间降级为记录当天并可回调报告原因），`mergeTrainingDates` 复用它；近 30 天统计、成员页训练日、分析页趋势汇总全部改为「记录当天 ∪ 确认区间」并按各自窗口裁剪。同时把活力日曲线也改为按覆盖天数分摊（此前只有热力图分摊，两块面板对同一天给出的活力不同），分摊以千分位取整保证额度精确守恒。

实测收口结果（线上产物）：

| 队员 | 记录日 | `activeDays` | 热力图覆盖日 | 一致 |
| --- | --- | --- | --- | --- |
| 王梓豪 | 20 | **24** | **24** | ✅ |
| 廖夏 | 18 | 18 | 18 | ✅ |
| 郭一鸣 | 13 | 13 | 13 | ✅ |

（该次构建窗口为 2026-08-28 → 2026-09-26；`activeDays` 随窗口变化，关键是它与热力图覆盖天数逐人相等。）成员页训练日 58 与活力日曲线 58 天也一致，活力累计末值与 `total` 严格相等。

### ✅ 第 4 条（复习整日 PUT）

已改为单题命令，链路完整：

- 新增服务端路由 `PATCH /api/v2/me/logs/dates/:date/records/:id`（`workers/oauth.mjs` 的 `handleLogsV2`），字段白名单只允许 `reviewStatus` / `reviewDue`，非法字段 400、非法枚举 422、记录不存在 404，并以 `current.revision` 做条件写入
- 客户端 `lib/journal-api.js` 新增 `patchRecordReview`；`lib/renderer.mjs` 的 `quickReviewAction` 从"读整天→改一题→写整天"改为直接发 PATCH，原先的 `loadDateLog` / `saveDateLog` / `patchProblemReview` 依赖已移除
- `SPECIFICATION.md` §2 表格相应行改为"复习按钮调用单题 PATCH 命令"

残留见下方 R2。

### ✅ 第 5、6 条（身份键与 `config/members.json`）

- `config/members.json` 落地，字段与 SPEC §3.1 要求一致（`memberId` / `githubUserId` / `login` / `logDirectory`，另加 `cfHandle` / `atcoderHandle`）
- `workers/member-config.mjs` 提供 `memberByGithubId` / `memberByLogin` / `memberById` 三张表
- OAuth 改为 `memberByGithubId(githubUser.id)` 识别，会话携带 `memberId` 与 `githubUserId`；`/api/session` 响应新增 `memberId`
- v2 存储路径改用 `user.memberId`（`training-read.mjs`、`handleLogsV2`、`handleTrainingV2` 的 assessment/operation 读取）；`logs/` 继续用中文 `logDirectory`（有意保留）
- 新增 `test/member-config.test.mjs`
- 现有 `training/members/<login>` 目录恰好与 `memberId` 同名，无需数据迁移 —— 这是一处有意的设计选择，值得保留

残留见下方 R3。

### ✅ 第 7 条（v2 路由只实现一半）—— 按"补齐关键读改 + 诚实划界"收敛

新增：`GET /me/attempts`（分页列表）、`POST /me/attempts/:id/corrections`、`POST /me/attempts/:id/void`、`GET /me/evidence/:nodeId`（分页）、单题 PATCH。`workers/services/training.mjs` 新增 `correctAttempt` / `voidAttempt`，事件不可原位改写的约束通过 `attempt.corrected` / `attempt.voided` 实现，且会同步重算 review 投影。

仍未实现并已**明确标注**：`SPECIFICATION.md` §5.2 新增"实现状态（2026-09-26）"段，列出已实现路由与"records 通用增删改与 plan-links 仍未实现"，并声明"下表是目标契约，不代表每一行均已上线"。

配套修正：`lib/training-projections.mjs` 把无有效事件时的默认状态从 `"scheduled"` 改为 `"archived"`（处理"唯一 attempt 被作废"的情形），这是 void 语义成立的前提。

### ✅ 第 8 条（活力 outcome 口径）

`docs/VITALITY-V2.md` 改为"当前 v6 日志允许每题保存 `outcome`，活力计算会读取该字段；缺失值仍按 unknown，不从掌握自评推断结果"，并写入实测快照"193 条记录有 24 条带真实 outcome，其余 169 条为 unknown"。**我独立统计的结果与之一致**（193 条记录 / 24 条带 outcome：independent 12、hinted 10、editorial 2）。README 对应段落同步修正。

### ✅ 第 9 条（PENDING-FEATURES 状态失真）

文档改为"2026-09-26 状态复核：已完成稳定 `fileIndex` 槽位、`startedOn`/`solvedOn` 区间录入、服务端 120 天与未来日期校验、构建期安全降级；未完成事件级 outcome 投影、同题额度结算、同题多次记录界面"；第 3 节的"`fileIndex` 尚未实现"改为"已实现并贯穿表单、Schema、Worker 读写与构建"。README 新增区间训练条目并把目录注释改为"区间基础已实现；事件投影与同日多次记录待完成"。

### ✅ 第 10、11、12、13 条（其余文档一致性）

- §2 表格改为"当前写入 schemaVersion=6 … 兼容无版本及 v1–v5"，并新增版本兼容表（无版本 / v1–v3 / v4 / v5 / v6 各加入了什么）
- §3.3 拆分为"当前已有"与"目标布局"，补入 `indexes/legacy.json` 并标注"当前已使用"
- `PRODUCT.md` 改为"历史上的 `/training/` 工作台已下线，旧链接会回到首页；`lib/training-dashboard.mjs` 与 `/api/v2/me/*` 作为冻结的后端试验基础保留，没有生产前端消费者"，推荐接口改为"已能返回真实候选，但因工作台冻结，不能把接口可用描述成产品已上线"
- README 测试清单不再逐个列举（改为"其余…由 `npm test` 自动发现"），消除了 13 vs 58 的过期数字；HANDOFF 顶部加入"本文件是历史记录，不再作为当前实现的单一权威"的定性声明

### ✅ 第 14、15 条（分层边界）

- 新增 `workers/services/log-planning.mjs`，`gitBlobSha` / `logRoots` / `planLogChanges` / `planLegacyIndexChange` 全部迁出 `oauth.mjs`；`oauth.mjs` 通过第 19/21 行的 import + `export { … } from` 保持向后兼容，因此既有测试无需改动（这一处理是正确的：导出面不变，职责已分离）
- `REPOSITORY-STRUCTURE.md` 依赖图显式画出 `scripts/verify-import-live.mjs ──> workers/oauth.mjs`，并注明"当前唯一的例外…普通解析脚本不得照抄该依赖"

### ✅ 第 16 条（v2 零消费者）

已做出决策并双处记录（`PRODUCT.md` 与 `SPECIFICATION.md` §3.3）：前端下线、接口冻结、"恢复工作台前不得宣称这些接口已有用户入口"。这比继续含糊更可取。

### ✅ 第 17 条（check-syntax 误报）

`scripts/check-syntax.mjs` 改为 `stdio: "inherit"`，并在 `result.error` 存在时打印 `Unable to start syntax check for …: <code> <message>` 后 `break`，退出码缺失时打印 `unknown`。**本次 `npm run verify` 的语法检查步骤不再输出任何失败行**（对比审计时误报 85 个文件）。

### ✅ 第 18、20、21、22 条

- `deploy.yml` 与 `qq-remind.yml` 均升到 `actions/checkout@v6` / `actions/setup-node@v6`，与 `checks.yml`、`difficulty.yml` 一致
- `VITALITY-V2.md` 补入"区间记录的单题活力按覆盖天数等额分摊到每日曲线，总额度保持不变"
- `SPECIFICATION.md` §3.3 补入"现有日志里的 `outcome` 是当前计分来源；未来完成事件迁移后，事件投影优先，日志字段降为兼容快照"，与 `VITALITY-V2.md` 同口径
- `src/index.html` 改为单条 `<link rel="stylesheet" href="style.css" />` 并加注释说明构建会合并三个样式文件并写入内容哈希；`generate-data.js` 删除对应的两条 link 移除逻辑；产物实测只有一条 `style.css?v=7530672ba490`，`header-actions` 残留 0 处、`account-menu` 1 处。题目页模板指纹升级为 `standalone-problem-v2-current-header` 并纳入 header 指纹，避免旧壳缓存命中 —— 这一步是必要的，否则旧题目页会残留废弃头部

## 残留项（新增，非原审计条目）—— 均已于 `8f65c55` 收口

以下四条为签收时新发现、未随第一批修复处理的问题；保留原文以便追溯当时的判断，收口结果见上一节。

**R1 · 读路径的区间校验缺上下文（低）**
`workers/services/logs-v2.mjs:263` 的 `validateLogInput(raw)` 未传 `{ recordDate, today }`，`today` 因而退化为 `solvedOn`：读路径的未来日期检查不生效（可接受，避免历史数据读不出来），但 **120 天检查仍会执行**。若历史上存在越界区间的记录，该日的读取会抛出 `RangeError` 而非 `LogsV2Error`，在 Worker 里表现为 500。当前数据不存在这种情况（构建无警告），属潜在问题。建议读路径显式传 `today` 并捕获 `RangeError` 转为结构化错误。

**R2 · 单题 PATCH 路由缺服务端测试（中）**
`test/journal-api.test.mjs` 只验证了客户端的 URL/方法/请求体；`test/logs-v2.test.mjs` 未覆盖该路由。字段白名单 400、枚举 422、记录不存在 404、条件写入 409 四条分支均无测试。这是本次新增的对外写接口，建议补服务端用例。

**R3 · 新目录未进目录契约（低）**
`docs/REPOSITORY-STRUCTURE.md` 的目录职责表与 README 结构树都没有收录新的一级目录 `config/`（README 仅在正文两处提到 `config/members.json`）。该文档的定位正是"目录职责契约"，建议补一行。

**R4 · `build/` 草稿仍未清理（低）**
第 19 条的文档部分已处理（HANDOFF 声明），但 `build/` 下 22 个一次性文件（`commit-msg.txt`…`commit-msg5.txt`、`review-form-preview.cjs`、`enrichment-preview-server.cjs`、多个 `*.log`）仍在。该目录已被 `.gitignore` 忽略，不影响仓库，仅污染本地检索。建议本地清空 —— 需要时可重新生成。

## 签收备注

1. **本次改动已提交并部署（2026-09-26）**，签收时的"尚未提交"状态已结案：
   - 修复批次提交 `ae76d89`（31 个文件，+528 / −185）
   - Cloudflare Worker `algo-oauth` 部署成功，Version ID `0f505358-2524-41e8-874a-c189ec97418b`；匿名 `GET /api/session` 冒烟返回 200
   - 前端推送 `2f8b0bf..ae76d89`，CI run `36244066016` 三个 job（browser-check / build / deploy）全部通过
   - 线上核对：首页与随机 3 个题目页 `header-actions=0`，且线上 `style.css?v=7530672ba490` 与本地构建哈希一致
   - 部署顺序遵循既有约束：**Worker 先于前端**（新的单题 PATCH 路由旧 Worker 没有）
2. `lib/training-projections.mjs` 的默认状态修正与 `test/oauth-training-v2.test.mjs` 的 GitHub 模拟增强，属于审计范围外的配套修复，一并核对无异议。
3. 审计时给出的"第 4 条依赖第 7 条"的依赖关系已被正确处理：单题 PATCH 路由与本条同时落地，未出现半接通状态。
4. 残留项 R1–R4 与第 3 条的口径不一致已在后续提交 `8f65c55` 收口，见下节。

## 残留项收口（2026-09-27，提交 `8f65c55`）

| 项 | 处理 |
| --- | --- |
| R1 读路径区间校验 | ✅ `decodeLog` 改走新的 `validateStoredLog()`：先按当前约束校验，失败则降级为「只算记录当天」再校验一次，**原值仍然读回**（避免后续保存静默抹掉历史区间）；两次都失败才抛 `LogsV2Error`，不再让 `RangeError` 冒泡成 500。`snapshotDate` 新增 `today` 参数（默认 UTC+8 今天），读路径不再让 `today` 退化为 `solvedOn` |
| R2 单题 PATCH 服务端测试 | ✅ 新增 4 个用例：成功路径（只改目标记录、保留同日其他题与当天区间、文件槽位不重排）、顺延写入新到期日、白名单外字段 400、非法状态/日期 422、记录不存在 404 且不产生提交、被拒请求不改动仓库版本 |
| R3 `config/` 未进目录契约 | ✅ 补进 `REPOSITORY-STRUCTURE.md` 目录职责表与 README 结构树，并补上 `workers/member-config.mjs`、`workers/services/` |
| R4 `build/` 草稿 | ✅ 本地删除 22 个一次性文件（该目录本就被忽略，无跟踪文件受影响） |
| 第 3 条 口径不一致 | ✅ 训练日改为区间感知（见第 3 条收口） |

**R2 的一条澄清**：原建议里列的"条件写入 409"分支实际无法从客户端触发 —— 该路由在同一请求内自己读取当前版本再写回，客户端不提供 revision，因此不存在陈旧版本这一路径；并发修改由服务端在同一请求内自然检测。测试因此覆盖了成功 + 400/422/404 共 6 条断言路径。

**收口后验证**：`npm run verify` 通过（测试全绿，Worker 组 **76/76**，较上批 +4；构建 193 条日志、无区间告警）。Cloudflare Worker `algo-oauth` 重新部署，Version ID `69481135-17f9-4499-963e-1fb97f3a648c`，匿名 `GET /api/session` 冒烟 200；前端推送 `9b06519..8f65c55`，CI run `36254384609` 三 job 全过。

**线上核对**：三位队员的 `activeDays` 与热力图覆盖天数逐人相等（25/25、18/18、13/13）；成员页训练日 58 与活力日曲线 58 天一致；活力累计末值 19.321 与 `total` 严格相等。
