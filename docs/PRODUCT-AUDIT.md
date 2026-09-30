# 产品审计签收版

## 2026-09-29 修复进展（当前工作区）

以下是签收后的实现状态；下文保留当时的审计、独立复核与纠偏记录。改动尚未提交和发布，历史审计的百分比不作为当前产品使用量。

| 编号 | 当前状态 | 实现与边界 |
| --- | --- | --- |
| P0-1、P2-1 | 本地完成，待发布及使用复核 | 成员可在训练档案维护最多 30 题的个人清单；进度仅按本人已发布的完成记录计算，完整课程目录保留为参考。没有实际清单使用数据时，不宣称使用率改善。 |
| P0-2 | 本地完成，待发布 | `npm run report:period -- --from YYYY-MM-DD --to YYYY-MM-DD` 从源记录生成带窗口、提交号和数据哈希的报告；无法从源数据得知的页面浏览与按钮点击明确标“未知”。 |
| P0-3 | 本地完成，待发布及新记录复核 | 新记录遇失误、提示后完成、看题解完成或未完成时直接安排 3 天后复习；成员可不安排、改期，或把未完成题设为超纲待做。旧记录不批量改写。真实入队率仍要在发布后的新记录上复算；Web Push 未立项。 |
| P1-1 | 本地完成，待发布 | 新写入保持空心得为空，读侧、页面和导出忽略纯占位；42 个历史纯“未填写”文件已精确清理，可从 `archive/2026-09-29-takeaway-placeholders.json` 恢复。 |
| P1-2 | 本地完成，待发布 | 页面改展示近 30 天训练场次；周期报告同时输出估算场次和成员记录日，同日多场缺区间时无法准确拆分。 |
| P1-3 | 已完成 | 产品方向仍为个人训练闭环。 |
| P2-2 | 本地完成提示，效果待复核 | 同题卡片显示队内记录并可直达详情；是否促进重做仍需发布后观察，不能从日志反推出点击或转化。 |
| P2-3 | 本地完成，待发布 | 构建前清理站点资源镜像里的旧文件，零记录标签页不进入 sitemap；页面仍可访问。搜索结果表现需发布后复核。 |
| P3-1 | 本地完成，待发布 | 旧 `mastered` 映射增加来源标记并在详情说明，保留旧值，不伪装为本人新自评。 |
| P3-2 | 持续约束 | v2 后端继续冻结，新清单及重做沿用现行日志写入链路。彻底拆除与数据归档不是本次已交付事项。 |

本地 `npm run verify` 通过，浏览器回归增加个人清单增删后通过 15 项。发布后仍需重新生成指定时间窗的报告，检查新记录的复习进入、实际重做与清单使用；这些效果没有线上证据前保持待复核。

签收日期：2026-09-28；维护更新：2026-09-29。原始审计及完整计算、证据和建议见 [2026-09-27 原稿](archive/2026-09-28-pre-rewrite/PRODUCT-AUDIT.md)。本文件只确认处理状态，不重算原稿数字。用户已选择“个人训练闭环”作为现行方向，见 [PRODUCT.md](PRODUCT.md)。

## 基线与判定口径

原审计基于 2026-07-21 至 2026-09-27 的日志快照：3 名成员、157 个成员记录日、194 条题目记录、127 道唯一题；题单命中 141/2857，待复习 6/194，心得空或占位 42/194。仓库没有用户行为埋点，因此这些是数据后果，不是浏览量、按钮使用次数或功能转化率。审计时的代码投入行数和站点文件数也只代表当时快照。

状态：**签收**表示问题和处理方向被接受；**本地完成**表示改动在当前工作区且已本地验证；**待实现**表示产品效果尚未交付；**待发布**表示线上仍未生效。签收不等于关闭。

## 产品问题逐项签收

| 编号 | 问题 | 状态 | 签收处理与关闭条件 |
| --- | --- | --- | --- |
| P0-1 | 大题单与题面归档投入高、使用低 | 签收，待实现 | 完整题单定位为参考；目标是成员 20–30 题可管理清单。题面抓取进入维护模式，停止无证据扩面。清单上线并重算使用后关闭。 |
| P0-2 | 成功指标不可测 | 签收，待实现 | 先做源数据周期报告，行为事件计数另行决定；报告能复算并标“未知”后关闭。 |
| P0-3 | 复习队列几乎为空 | 签收，待实现 | 新记录按失误/结果给可覆盖的默认复习建议；实际入队、退出、重做可验证后关闭。Web Push 仍是备选，未立项。 |
| P1-1 | 空心得被写成“未填写”并进入展示/导出 | 签收，待实现 | 停止占位写入、清理历史纯占位、修读侧与导出；全链路验收后关闭。 |
| P1-2 | 使用节奏从每日记录转向训练场次 | 签收，待实现 | 指标同时报告场次与天数；设计中的“本次训练”不以连续打卡考核。场次视图上线后关闭。 |
| P1-3 | 旧产品计划与交付分叉 | 文档层已处理 | 本轮明确选择个人闭环，并将旧产品/规格稿归档；闭环功能是否交付仍按 P0-3 等项验收。 |
| P2-1 | 2857 题目录不适合作个人进度分母 | 签收，待实现 | 个人小清单有明确分母，完整目录改作覆盖参考后关闭。 |
| P2-2 | 协作只靠进入详情页被动发现 | 签收，暂缓 | 先验证同题提示是否促进重做；现行产品只承诺共享日志与同题回看。 |
| P2-3 | 本地产物残留、零记录标签页入 sitemap | 签收，待实现 | 构建资源清理和索引策略分别核验；先测零记录页搜索表现，再决定 noindex。 |
| P3-1 | 旧 mastered 状态迁移没有来源标记 | 签收，待实现 | 历史来源显示或数据字段须能区分机械映射与本人自评；不能凭推测修改旧自评。 |
| P3-2 | 冻结 v2 仍有维护成本 | 签收，持续约束 | v2 后端保留且无生产前端；新增消费者须先过产品与迁移评审。未做彻底拆除或数据归档。 |

审计建议的先后顺序仍有效：先修空心得，再有报告，再让队列形成，再交付可完成的选题与重做历史。文档决策已作出，不能据此把上述功能标为完成。

## 技术建议 T1–T6 签收

| 编号 | 当前工作区处理 | 尚需完成 |
| --- | --- | --- |
| T1 发布顺序靠人工约定 | 已上线匿名 `GET /api/capabilities`；Pages 部署前校验 Worker 的提交号、schema 范围与 `/api/session` | `794cf9f` 已通过 Cloudflare Builds 与 Pages 生产核验；门禁只覆盖指定协议。 |
| T2 静态检查不足 | `npm run verify` 纳入 ESLint 未定义与未使用变量检查，本地通过 | 主分支 CI 已通过；导出但无人调用的代码仍属已知盲区。 |
| T3 Worker 入口职责过重 | `oauth.mjs` 缩为路由/鉴权入口，服务、路由、存储分层；QQ 共享实现移至 `lib/`；本地测试通过 | 已随 `794cf9f` 自动部署并通过匿名接口冒烟。 |
| T4 重复构建与浏览器安装 | PR 与主分支运行快速 Node 验证和单次站点构建；Chromium 回归改为本地按需执行 | `70042ea` 的 Pages Action 已通过，本地浏览器回归 14/14 通过；该提交未触发 Worker 重建。 |
| T5 文档多处重复且状态混用 | 现行文档集中到根目录七份，旧稿与专项稿完整归档，交接继续按日期记录 | 以后更新契约时维护现行规格和对应签收，不再把归档当指令。 |
| T6 目录契约与代码冲突 | 新 [DESIGN.md](DESIGN.md) 写明模块职责与数据流；历史目录契约归档，README 更新入口 | 新增目录时同步现行设计与 README。 |

## 签收结论与下一次复核

工程可靠性改动已通过 `794cf9f` 的生产发布核验；后续复习操作与 `PATCH` 跨域修复已随 `66f25b4` 上线，CI 精简由 `70042ea` 验证。产品主问题没有因技术修复自动消失。下一次复核应在新功能发布后从源数据重新计算 P0-2/P0-3/P1-1 的新记录口径，记录时间窗与提交版本。不要把 2026-09-27 的百分比沿用为实时值。

---

# 独立复核签收（2026-09-28，外部复核）

以下保留外部复核原文；其“上方文档仍写待发布”等判断针对纠偏前版本，纠偏结果见文末维护者处理记录。

复核对象：`HEAD = 794cf9f`，工作区干净，`git log 26b91f4..HEAD` 共 4 个提交、79 个文件。**以上正文由维护者书写，本节由独立复核追加，不改动上文的任何判定值。**

## 复核方式

不采信任何改动声明，只核对三类证据：① 可执行的本地门禁与生产代码；② 构建产物与仓库数据；③ **线上实际响应**。所有"已上线/待发布"的判断以线上探测为准，不以文档表述为准。

复核基线（全部实测）：

| 项目 | 结果 |
| --- | --- |
| `npm run verify` | 通过，97.6s（语法 90 文件 → ESLint → 训练索引校验 → 单测 → 构建 194 条日志） |
| 单元测试 | **467 + Worker 77 = 544 全绿**（较审计时 539 增加 5 条，即 `test/worker-compatibility.test.mjs`） |
| 浏览器回归 | `e2e/journal.spec.mjs` 13 个用例 |
| Worker dry-run | 通过，Total Upload 337.20 KiB / gzip 84.25 KiB |
| 线上 `GET /api/capabilities` | **HTTP 200**，`{"logSchema":{"min":1,"max":6},"buildCommit":"794cf9f3c5bf50a67dc93313e6eeebf3db075ce8"}`；带随机 cache-buster 复测 2 次一致 |
| 线上 `GET /api/session` | HTTP 200，`null`（匿名只读冒烟通过） |
| 构建产物一致性 | 本地入口 `app-XSORF6LK.js` **等于**线上入口 `app-XSORF6LK.js` |
| 线上首页页脚 | `v2.0.1 · 2026-09-28 20:39 UTC+8 · 794cf9f` |
| 现行文档体量 | 有效文档 7 份 123 KB；归档 2.9 MB（含原 447 KB 旧稿与 3.8 MB 图片） |

## 技术项 T1–T6 独立判定

| 编号 | 我的独立判定 | 与本文上方"尚需完成"列的差异 |
| --- | --- | --- |
| T1 发布顺序 | **已完成且已上线**，方案强于原建议 | ❌ 文档写"**待发布 Worker**／线上返回 401"，实测为 200 且提交号等于 HEAD |
| T2 静态检查 | 已完成，且实测清出真实死代码 | ✅ 一致 |
| T3 职责边界 | 已完成（`oauth.mjs` 1215 → **318** 行；`bot/qq-*.mjs` → `lib/`） | ✅ 一致 |
| T4 重复构建 | 已完成（主分支单 job、单次构建、单次 Chromium、`cache: npm` 已加） | ✅ 一致 |
| T5 文档治理 | 大体完成；一处**归档错位** | ⚠️ 文档自称"本地归档与链接检查通过后签收" |
| T6 目录契约 | 已完成（README 结构树补齐 `oi-wiki/`、`e2e/`、`training/`、`build/`、`artifacts/`） | ✅ 一致 |

**T1 的关键证据（与文档相反）**：`workers/oauth.mjs:278` 的匿名 `/api/capabilities` 已上线；`scripts/check-worker-compatibility.mjs` 在 `deploy.yml` 中位于"上传 Pages artifact"**之前**，因此门禁失败必然阻断发布；线上探测显示 Worker 提交号就是当前 `HEAD`，且线上页面已带新页脚——说明 Worker 与 Pages 均已按新链路发布成功。**这不是"待发布"，而是已经跑通了一整轮。**

## 产品项 P0–P3 独立判定

逐项反查源数据与代码，**上方"待实现"标注全部属实，没有把未交付说成已交付**：

| 编号 | 独立核对方式 | 结果 |
| --- | --- | --- |
| P1-1 空心得占位 | 搜 `\|\| "未填写"` 写入/读取点 + 统计纯占位文件 + 用生产代码实测导出 | 占位写入点 3 处原样保留（`log-planning.mjs:43`、`logs-v2.mjs:242`、`generate-data.js:128`）；`generate-data.js:611` 仍在特判该字面量；历史纯占位 **42 个文件未动**；`buildSingleLatexDocument()` 实测仍输出占位正文；产物 123 个文件、189 处 |
| P0-2 使用报告 | 查 `scripts/usage-report.mjs`、`docs/USAGE.md` | 均不存在 |
| P0-3 复习默认入队 / PWA | 查默认值、`site/manifest.json`、`sw.js` 的 push 处理 | 无默认入队；无 manifest；SW 无 push |
| P0-1 / P2-1 个人清单 | 查 `myList` / `selectedProblems` 等标识符 | 0 命中 |
| P1-2 场次视图 | 查 session 视图相关实现 | 无 |
| P2-3 索引与产物 | 统计标签页 noindex + 查 `copyDirRecursive` | 0 个标签页 noindex；`copyDirRecursive("src/assets", …)` 仍只复制不清理 |
| P3-1 迁移来源 | 搜 `masteryStatusSource` | 0 命中 |
| P3-2 v2 冻结 | 查 v2 前端消费者 | 仍无生产消费者，冻结表述属实 |
| P1-3 计划分叉 | 读新版 `PRODUCT.md` | 已明确选择"个人训练闭环"并归档旧稿，**文档层已处理** |

## 本轮新发现

### 需处理

**R1 · 已上线的发布链路被四处现行文档写成"待发布/401/会阻断发布"。** 实测线上返回 200 且提交号等于 HEAD。下一任维护者按文档执行会得到相反的结论（以为必须重发 Worker、以为一旦触发 Pages 就会被门禁挡住）。需更正的现行位置：`docs/DESIGN.md:51`、`docs/HANDOFF.md:25`、`docs/PROBLEM-AUDIT.md:27`、`docs/PRODUCT-AUDIT.md:33`（本节上方表格）。这正是 T5 要消除的"文档状态失真"，在本轮以**相反方向**复发了一次。

**R2 · `CURRENT-STATE.md` 被放进归档目录，而它的内容是改写后的状态。** `git log --diff-filter=A` 显示该文件在 `aa92513` 中**新增**于 `docs/archive/2026-09-28-pre-rewrite/`（从未存在于 `docs/` 根）。它描述的是 `capabilities` 接口、ESLint、新分层等**改写后**的实现，却与"pre-rewrite"归档同处，且 `docs/README.md` 的六份现行清单不含它、又声明"归档文件不作为当前实施指令"。结果是：全仓库最完整的"现在是什么"描述失去了权威地位。建议归位为 `docs/CURRENT-STATE.md` 并列入入口清单，或把其内容并入 `SPECIFICATION.md` §1。

**R3 · README 宣称一个已不渲染的功能。** `README.md:92–93` 写着节点页有「📎 相关训练记录」区、「📎 相关记录 N」热度徽标与知识树。实测：全站 902 个产物页与浏览器 bundle 中 `roadmap-tree`、`roadmap-evidence`、`📎`、`roadmap-node-card` **均为 0 次**，线上 `/roadmap/` 同样为 0。该区块在 `26b91f4` 时就已是死代码（本轮只是删掉残骸），**不是本轮引入**；但本轮新增的 ESLint 抓不到它——`no-unused-vars` 只覆盖模块内未使用，不覆盖"**导出但无人调用**"，`roadmapTreeHtml` / `roadmapNodeCardHtml` 仍属导出死代码且仅被 `test/roadmap-badges.test.mjs` 调用。建议二选一：恢复渲染，或从 README 删除该描述并纳入导出死代码清单。

### 登记备查（不阻断签收）

- **R4 · 被跟踪的生成文件**：`workers/build-commit.mjs` 由 `scripts/stamp-worker-commit.mjs` 就地改写，且 `.gitignore` 未覆盖。Cloudflare 构建环境是临时的故无影响，但本地执行 `npm run deploy:worker` 会让工作区变脏；若被顺手提交，仓库里会留下一个过期 SHA。当前提交值为 `null`，尚属安全。
- **R5 · README 的 Worker 目录说明已过期**：仍写 `oauth.mjs # …AI 概括与题目导入`，而这两项已迁至 `services/summary.mjs` 与 `services/problem-import.mjs`。
- **R6 · 门禁的可用性代价（已被后续修订消除）**：原设计下 Cloudflare Builds 未触发或构建失败时，Pages 等待 15 分钟后失败并保留旧站——站点可用性与 Worker 构建绑定。这条不是不可避免的取舍，而是把兼容性问题误做成同一性问题的后果；2026-09-28 已改为两级门禁（见文末《门禁设计修订》），Worker 未变时不再校验提交号、不再等待。
- **R7 · ESLint 覆盖面**：不检查 `test/`、`e2e/`；`globals` 同时注入 browser + node + serviceworker，会削弱 `no-undef` 的判别力（浏览器模块误用 `process` 不会报错）。
- **R8 · 版本页脚的时间戳**：`scripts/generate-data.js:346` 用 `Date.now()` 生成构建时间，`index.html` 与 `sw.js` 每次构建必变（页脚时间会随部署更新，符合预期）；重型产物仍确定——连续两次构建 `570 reused, 0 rebuilt`。

## 无回归的验证

本轮对核心模块的改动（`log-schema.mjs` −8、`ui.mjs` −9、`renderer.mjs` ±12、`vitality.mjs` ±3、`form.mjs` ±2、`roadmap.mjs` ±77、`generate-data.js` ±34）逐条读过，全部是 lint 驱动的等价改写：删除未使用的包装函数与死局部（`normalizeReviewStatus`、`normalizeOutcome`、`ui.mjs` 的 `paths`、`form.mjs` 的 `apiRequest`）、解构剩余项改为 clone + `delete`、`Prism`/`renderMathInElement` 改为 `globalThis.*` 引用。抽查被删的 5 个 roadmap 函数，其中 4 个在 `26b91f4` 全仓库仅出现 1 次（即自身定义），确为死代码。544 单测 + 13 浏览器回归通过，本地与线上入口哈希一致，**未发现功能回归**。

## 签收意见

**接受（有条件）**。技术侧 T1–T4、T6 达到或超出原建议（T1 的"同提交门禁"比原建议的"兼容性契约化或自动部署"更强，且已被生产验证）；T5 方向正确、体量从 447 KB 降到 123 KB。产品侧 P0–P3 全部如实标注为待实现，**没有一处把本地改动说成线上交付**——这是本轮最值得肯定的部分，也说明上一轮审计的"状态用语"要求已经生效。

条件（请处理 R1–R3 后即可完全关闭本次签收）：

1. **更正 4 处现行文档的发布状态**，改为实测结论：Worker `/api/capabilities` 已上线并返回当前提交号，Pages 已按新门禁发布成功。
2. **给 `CURRENT-STATE.md` 归位**（移出归档并列入 `docs/README.md`，或并入 `SPECIFICATION.md` §1）。
3. **处理 README:92–93 的功能描述**（恢复渲染或删除描述），并把"导出死代码"列入已知盲区。

R4–R8 登记备查，不阻断签收。

## 复现命令

```powershell
# 线上状态（决定 T1 判定的关键证据）
curl.exe -s https://algo-oauth.xialiao.org/api/capabilities   # 期望 200 + buildCommit = HEAD
curl.exe -s -o NUL -w "%{http_code}" https://algo-oauth.xialiao.org/api/session

# 本地门禁与产物一致性
npm run verify
(Get-ChildItem site/assets/js -Filter 'app-*.js').Name          # 应与线上 /assets/js/ 入口同名
npx wrangler deploy --dry-run --config workers/wrangler.toml

# R2：CURRENT-STATE.md 的位置来历
git log --oneline --diff-filter=A --name-status -- 'docs/**/CURRENT-STATE.md'

# R3：功能是否真的渲染
Get-ChildItem -Recurse site -Filter *.html | Select-String -SimpleMatch 'roadmap-tree','roadmap-evidence','📎'
Get-ChildItem -Recurse site/assets/js -File | Select-String -SimpleMatch 'roadmap-tree','roadmap-evidence'

# P1-1：占位链路是否仍在
Select-String -Path lib,workers,scripts -Include *.mjs,*.js -Pattern '\|\| "未填写"'
```

## 维护者处理记录（2026-09-28）

外部复核提出的文档问题 R1–R3 已处理，复核原文与当时的证据保持原样：

1. **R1 关闭**：更正 [DESIGN.md](DESIGN.md)、[PROBLEM-AUDIT.md](PROBLEM-AUDIT.md) 和本文件上方 T1–T4 的现行状态；[HANDOFF.md](HANDOFF.md) 顶部续写生产核验，明确旧“待发布／401”段落是历史快照。[SPECIFICATION.md](SPECIFICATION.md) 与 [CURRENT-STATE.md](CURRENT-STATE.md) 同步改为已上线口径。证据为 `794cf9f` 的 Worker 能力接口 HTTP 200、同提交 Pages 成功及线上页脚。
2. **R2 关闭**：`CURRENT-STATE.md` 从误置的 `pre-rewrite` 目录移到 [现行文档目录](CURRENT-STATE.md)，加入 [文档入口](README.md)；其中手动部署与 401 的旧状态一并更正。
3. **R3 关闭**：[仓库 README](../README.md) 删除未渲染的“📎 相关训练记录”和热度徽标描述，只保留已交付的标签与知识点关联；[PROBLEM-AUDIT.md](PROBLEM-AUDIT.md) 登记 ESLint 无法识别“导出但生产代码无人调用”的盲区。

本次处理仅修正文档与文件位置，不把 P0–P3 的产品待办标为完成。R5 的 Worker 目录说明也已随 README 更新；R4、R6–R8 保持备查。

---

# 二次复核（2026-09-28，外部复核）

复核对象：`HEAD = 9f579e7`（`Close product audit documentation findings`），`main` 领先 `origin/main` 1 个提交（**尚未推送**，故线上仍为 `794cf9f`）。方式不变：只核对文档、代码、产物与线上响应。

## R1–R3 关闭确认（独立复验）

| 项 | 复验方式 | 结论 |
| --- | --- | --- |
| R1 发布状态 | 逐文件搜 `返回 401｜尚未上线｜待发布`，并读改后段落 | **关闭**。[DESIGN.md](DESIGN.md)、[SPECIFICATION.md](SPECIFICATION.md)、[PROBLEM-AUDIT.md](PROBLEM-AUDIT.md)、本文件上方 T1–T4 表、[CURRENT-STATE.md](CURRENT-STATE.md) 均已改为已上线口径并附 `794cf9f` 证据；[HANDOFF.md](HANDOFF.md) 顶部新增"发布验收与文档纠偏"段，明确旧"待发布／401"段是历史快照。现行文档已无生效中的陈旧断言 |
| R2 状态文档归位 | `git mv` 结果 + 入口清单计数 | **关闭**。`CURRENT-STATE.md` 已在 `docs/` 根（3.2 KB，低于 10 KB 上限），列入 `docs/README.md` 与 README 的 docs 树；三处均写"七份"，与实际一致 |
| R3 未渲染功能描述 | 重新核对替代措辞是否属实 | **关闭**。README 已删除「📎 相关训练记录」「📎 相关记录 N」与"知识树行"。替代措辞**逐条复验为真**：标签页确有 42 条 `/roadmap/` 节点链接与"覆盖"文案；节点页 `roadmap-problem-done` 实际渲染「队内记录 · 廖夏」；`#member-select` + `data-members` + `lib/application.mjs:114` 构成本人/全队切换。`PROBLEM-AUDIT.md` 已登记 ESLint 的导出死代码盲区 |
| R5 Worker 目录说明 | 读 README 结构树 | 已随本轮更新（`oauth.mjs` 改为"鉴权与 API 路由入口"，`services/` 补"AI 概括与题目导入"） |

## 残留问题

### C1 · 本轮新增 2 条断链（断链总数 37 → 39）

`CURRENT-STATE.md` 移出归档时，归档内两条**指向现行文档**的链接随之失效，恰好是最容易被点击的两条：

- `docs/archive/2026-09-28-pre-rewrite/PRODUCT.md:3` → `[CURRENT-STATE.md](CURRENT-STATE.md)`
- `docs/archive/2026-09-28-pre-rewrite/SPECIFICATION.md:3` → 同上

改为 `../../CURRENT-STATE.md` 即可。

### C2 · 归档内 37 条既有断链没有免责说明

这些断链**不是本轮引入**（`794cf9f` 时同样是 37 条），全部位于 `docs/archive/2026-09-28-pre-rewrite/`，目标是按当时仓库结构书写的路径（`lib/…`、`scripts/…`、`docs/…`），移入归档后无法解析。而 `HANDOFF.md` 写着"旧交接段落中的相对链接已改指归档"——只做到了一部分，且归档目录没有 README 说明链接口径。

**建议**：新增 `docs/archive/README.md`，声明"归档内的相对链接按当时仓库结构理解，不保证可点击"；然后只修 C1 的两条。**不要**批量改写那 37 条——归档的价值是证据保真，改写反而会掩盖当时的目录结构。

### C3 · `HANDOFF.md:31` 仍有与新横幅相反的操作指令

该段结尾写着"……不要直接触发带新门禁的 Pages 发布"，而文件顶部的新段已声明它被取代。按 `HANDOFF.md` 自述的"按时间续写、旧段落是历史快照"规则，这不算错误；但同一文件内存在**方向相反的直接指令**，读到中部的人可能照做。建议在该句后加一行括注「（已由上方 2026-09-28 发布验收段取代）」——一处一行即可。

## 状态与规模观察

- **未推送**：`9f579e7` 仍在本机（`ahead 1`）。文档中所有"已上线"表述都指向 `794cf9f`，与实际相符，无误导。**提醒**：推送后 Pages 门禁会要求 Cloudflare 为 `9f579e7`（纯文档提交）产出同提交 Worker；若 Cloudflare Builds 对文档类提交做了路径忽略，站点会等满 15 分钟后失败并保留旧站（即 R6 已登记的取舍）。
- **体量分布**：现行文档合计 138.4 KB，其中 `HANDOFF.md` 占 95.7 KB（**69%**）。`CURRENT-STATE.md` 3.2 KB 已达成"单一状态权威"的目标；但 HANDOFF 同时是"体量最大"与"唯一含有被取代的相反指令"的文件。建议后续交接段落只写"本轮结论 + 指向 CURRENT-STATE / SPECIFICATION"，细节留在对应文档，避免该文件继续线性增长。
- **备查项状态**：R4 未变（`workers/build-commit.mjs` 仍被跟踪、无 `.gitignore`、提交值为 `null`）；R7 已文档化但配置未改（ESLint 仍不检查 `test/`、`e2e/`，`globals` 仍混合注入 browser+node+serviceworker）；R8 未变（页脚时间戳使 `index.html`/`sw.js` 每次构建必变，重产物仍确定）。

## 二次复核意见

**接受。** 上一轮的三个必办项均已按实测证据更正，且改后措辞经逐条复验为真（含我特意反查的三条 roadmap 声明），没有出现"为了消掉问题而写得更含糊"的情况。剩余 C1–C3 都属于**收尾性**问题：C1 是移文件时漏掉的两条链接，C2 缺一份归档链接口径说明，C3 少一行括注。三项合计改动不超过十行，不影响本轮的签收结论。

复核基线：`git status` 干净、`npm run verify` 通过（467 + 77 = 544 单测全绿）、线上 `/api/capabilities` 返回 200 且 `buildCommit = 794cf9f3…`（与 `origin/main` 一致）、相对链接检查 173 条中 39 条断链（37 条为归档既有）。

## C1–C3 修复记录（2026-09-28，外部复核执行）

三项均由复核方直接修复，只改 Markdown，未触碰任何代码：

| 项 | 处置 | 验证 |
| --- | --- | --- |
| C1 | `archive/2026-09-28-pre-rewrite/PRODUCT.md:3`、`SPECIFICATION.md:3` 的链接改为 `../../CURRENT-STATE.md` | 断链数 **39 → 37**，两条目标均已解析 |
| C2 | 新增 [archive/README.md](archive/README.md)：说明归档用途、快照清单与链接口径，登记 34 条失效链接的分布，并标出 `![](url)`／`[...](...)` 属正文语法示例、朴素链接检查会误报 | 归档内链接无需逐条改写，读者与后续自动检查都有据可依 |
| C3 | `HANDOFF.md` 原第 31 段后追加"本段已被取代"括注，指明该段是部署前快照、当前状态见顶部「发布验收与文档纠偏」段与 CURRENT-STATE | 同文件内不再存在无标注的相反指令；更早的描述性段落（如"可能阻断本次部署"）由顶部横幅统一覆盖 |

修复后链接全量复核：相对链接 192 条，朴素链接检查报出 44 条，其中 **34 条是归档内既有的真实失效链接，其余全部是 `` ![](url) ``／`` [...](...) `` 语法示例造成的误报**（该误报数随引用此写法的文档增加而增加，故不固定）。**归档外不存在真实失效链接**（`docs/HANDOFF.md` 的 `![](url)` 亦属示例误报）。

至此二次复核提出的 C1–C3 全部关闭，**本次签收无未决项**。代码未改动，因此未重跑 `npm run verify`；如需与代码变更一起发布，仍按 `CURRENT-STATE.md` 的发布顺序执行。

---

# 门禁设计修订（2026-09-28，外部复核执行）

## 我先前的判断是错的

我在首次签收里把"同提交门禁"评价为**"强于原建议"**（见上方《签收意见》）。这个评价不成立，特此更正，原文保留不改。

同提交门禁把一个**兼容性**问题实现成了**同一性**问题。真正的不变量只有一条：*线上 Worker 必须接受本站当前发送的日志格式*。而"线上 Worker 是不是本次提交构建的"是另一个问题，只在**本次推送确实改了 Worker 代码**时才有意义。把它设成无条件要求，代价是：

- **每次推送都逼着 Worker 重建**——包括队员的 `save(...)` 打卡提交和纯文档提交，而 Worker 理想状态下根本不需要变；`aa92513` 那次 `failure`、`b270a61` 那次 `cancelled` 就是这么来的。
- **每次推送都要空等**：即使 Worker 一秒就构建完，Pages 也必须等到它上线；构建慢或没触发时白等 15 分钟。
- **站点可用性与 Worker 构建耦合**：Cloudflare 侧任何一次失败都会让静态站点发不出去，而这本可以完全避免。

我在 R6 里只把它记成"知情取舍"，没有指出**这个取舍本身是设计造成的、可以消除**。这是判断上的错误，不是记录不足。

## 修订内容

门禁改为两级（`scripts/check-worker-compatibility.mjs` + `.github/workflows/deploy.yml`）：

| 本次推送 | 兼容性检查（schema 范围 + 匿名 `/api/session`） | 提交号校验 | 等待 |
| --- | --- | --- | --- |
| 未改动 Worker 输入（日志、文档、纯前端） | **执行**，不满足立即拒绝 | 跳过 | **0** |
| 改动了 Worker 输入（`workers/`、`lib/`、`package.json`、`package-lock.json`） | 执行 | 要求等于本次提交 | 最多 15 分钟 |

> **追记（2026-09-28，提交 `03f452d`）**：输入集后来补齐为**六类**，另含 `config/members.json`（Worker 直接导入的成员配置）与 `scripts/stamp-worker-commit.mjs`（部署命令执行的构建脚本）；Cloudflare 的 build watch paths 也已设为同一组路径，并实测生效（纯文档提交 `03f452d` 未触发 Worker 重建，`/api/capabilities` 的 `buildCommit` 保持在上一次 Worker 部署 `7ed3045`）。遍历 Worker 的 38 个传递依赖，六类路径全部覆盖、无遗漏。当前口径见 [SPECIFICATION.md](SPECIFICATION.md) §1.4 与 [CURRENT-STATE.md](CURRENT-STATE.md)。

实现要点：

- `checkWorkerCompatibility({ requireCommit })`：提交号校验改为**显式开启**，默认不校验；返回值增加 `commitChecked`，日志会写明本次是否校验了提交号。
- 工作流新增 `Detect Worker input changes` 步骤，用 `git diff "$before" "$sha" -- $WORKER_PATHS` 判断；非 push 事件、`before` 全零、`before` 不在克隆里（历史被改写）三种情况一律降级为**只做兼容性检查**，避免为不确定的情况白等。
- 检出改为 `fetch-depth: 0`：既让上述 diff 可靠，也修正了构建脚本用 `git log` 回溯旧记录 `updatedAt` 时在浅克隆下失效的问题。
- `WORKER_PATHS` 必须与 Cloudflare Workers Builds 的 **build watch paths** 一致（建议设为同一组路径）。否则会出现"门禁在等一个永远不会到来的 Worker 构建"。这条已写入 SPECIFICATION §1.4 与 README。

## 验证

- **单元测试 7/7 通过**（`test/worker-compatibility.test.mjs`），新增覆盖：Worker 提交号落后但 schema 兼容时**放行**；`requireCommit` 开启时提交号不符/未打戳**拒绝**；不确定身份时跳过校验。
- **检测逻辑在真实提交上验证**（`git diff --quiet <before> <sha> -- workers lib package.json package-lock.json`）：

  | 提交 | 内容 | 判定 |
  | --- | --- | --- |
  | `c6255c7` | 纯文档 | 不等待 ✓ |
  | `9f579e7` | 文档修订 | 不等待 ✓ |
  | `304edfa` | `save(廖夏)` 仅日志 | 不等待 ✓ |
  | `794cf9f` | 页脚 + `package.json` | 等待同提交 Worker ✓ |

- 全量 `npm run verify`（语法 + ESLint + 索引 + 单测 + 构建）在本修订后通过。

## 这条修订没有放开的边界

兼容性检查仍是**强制**的：本站 `LOG_SCHEMA_VERSION` 不在线上 Worker 公布的范围内时，Pages 立即拒绝发布。也就是说，"前端需要更新的 Worker"这一真实风险仍被拦住，放开的只是"Worker 没变也要等它重建一遍"。门禁依然不覆盖其他写入协议的变更——这一点与修订前一致，仍需单独回归。
