# 产品审计签收版

签收日期：2026-09-28。原始审计及完整计算、证据和建议见 [2026-09-27 原稿](archive/2026-09-28-pre-rewrite/PRODUCT-AUDIT.md)。本文件只确认处理状态，不重算原稿数字。用户已选择“个人训练闭环”作为现行方向，见 [PRODUCT.md](PRODUCT.md)。

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
| T4 重复构建与浏览器安装 | 主分支验证、浏览器回归、上传同一构建产物；PR 保留回归 | 主分支首次完整自动发布已通过。 |
| T5 文档多处重复且状态混用 | 现行文档集中到根目录七份，旧稿与专项稿完整归档，交接继续按日期记录 | 以后更新契约时维护现行规格和对应签收，不再把归档当指令。 |
| T6 目录契约与代码冲突 | 新 [DESIGN.md](DESIGN.md) 写明模块职责与数据流；历史目录契约归档，README 更新入口 | 新增目录时同步现行设计与 README。 |

## 签收结论与下一次复核

工程可靠性改动已通过 `794cf9f` 的生产发布核验；产品主问题没有因技术修复自动消失。下一次复核应在新功能发布后从源数据重新计算 P0-2/P0-3/P1-1 的新记录口径，记录时间窗与提交版本。不要把 2026-09-27 的百分比沿用为实时值。

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
- **R6 · 门禁的可用性代价（知情取舍）**：Cloudflare Builds 未触发或构建失败时，Pages 等待 15 分钟后失败并保留旧站。维护者已在 HANDOFF 中声明，此处仅登记：站点可用性从此与 Worker 构建绑定。
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
