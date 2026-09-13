# 交接文档：Algo Training Journal

更新时间：2026-08-28（架构整理）／2026-09-11（活力指数与难度统一，见文末「本轮改动」）

## 当前状态

项目是一个「Git 仓库保存训练日志 + 静态站点展示 + Cloudflare Worker 写入」的协作式算法训练日志。

（2026-08-28 那轮）仅做了技术与架构整理，**没有改变产品功能、日志格式、Worker API 或部署流程**。

已完成：

- 前端解除 `data.mjs` 与 `renderer.mjs` 的循环依赖。
- 新增 `lib/application.mjs` 作为前端应用协调层。
- 构建脚本自动发现 `lib/` 下的浏览器模块，不再维护手工复制清单。
- 拆分开发验证命令，并补充 `.editorconfig`、`jsconfig.json`。
- 构建测试增加对协调层和单向依赖的断言。

## 当前前端分层

```text
app.js
  │ 初始化认证、主题、DOM 事件和首个路由
  ▼
application.mjs
  │ 页面协调、刷新、渲染器切换、加载状态提示
  ├──────────────► data.mjs
  │                 请求、缓存、数据状态、题目详情加载
  ▼
renderer.mjs
  │ 总览、成员、分析、复习、详情、路线、标签、导出 UI
  ▼
DOM / 预渲染 HTML
```

依赖规则：

- `data.mjs` 不得导入渲染器，不得直接修改 DOM。
- `renderer.mjs` 可读取数据仓库的低层加载函数，但页面切换通过 `application.mjs` 注入的 `navigation` 回调完成。
- `application.mjs` 是唯一可以同时依赖数据层和渲染层的浏览器模块。
- `app.js` 保持为启动入口，避免再次承载页面级状态。

## 关键文件

| 文件 | 职责 |
| --- | --- |
| `app.js` | 应用启动、认证、全局事件绑定、按初始 URL 选择页面。 |
| `lib/application.mjs` | 前端组合根：创建/替换渲染器、定时刷新、跨页面数据加载。 |
| `lib/data.mjs` | JSON 请求与缓存、刷新标记、题目与路线数据加载。 |
| `lib/renderer.mjs` | 所有浏览器端 UI 渲染；当前仍是下一步最大的拆分对象。 |
| `scripts/generate-data.js` | 日志聚合、静态预渲染、SEO、资源复制、模块版本化。 |
| `test/generate-seo.test.mjs` | 生成产物与前端模块边界的回归测试。 |

## 构建与验证

```bash
npm run check:syntax  # 自动检查全部源码语法
npm test              # Node.js 测试
npm run build         # 生成 site/
npm run verify        # 顺序运行以上三项
```

`npm run check` 是 `npm run verify` 的兼容别名，GitHub Actions 仍可正常使用。

最近一次验证结果：

- 63 个 JS/MJS 源码文件通过语法检查。
- 290 个测试通过（业务测试 286 + Worker 测试 4；其中 `test/export-latex.test.mjs` 会真编译全部真实日志）。
- `node scripts/generate-data.js` 成功生成 159 条日志、3 位成员的静态站点。
- `git diff --check` 通过。

- 测试会重写受忽略的 `site/`；导出相关的回归测试会把中间产物写在受忽略的 `build/latex-test/` 下，仓库里不再有生成的 `.tex` 文件需要人工确认。

## 导出的回归测试

`test/export-latex.test.mjs` 直接 import `lib/export-content.mjs`（与浏览器共用同一份生成逻辑），并对 `logs/` 里的真实日志做真实编译：

- 若 `PATH` 里有 `xelatex`，会把**全部**真实日志拼成一份批量文档编译，断言零 `!` 错误、零 `Overfull \hbox`、零 `Missing character`；另有 8 个「历史故障样例」（题名含 `#`、单字符公式 `$n$`、`\boxed`、中文代码注释、代码里混入 `\end{lstlisting}`、Unicode 数学符号等）。
- 没有 TeX 发行版时自动 skip，不会让 CI 变红；此时仍会跑纯文本断言。
- 旧版 `test-latex.mjs` 把生成逻辑复制了一份，正是它掩盖了「题名里的 `#` 让 LaTeX 编译失败」等问题，已删除。

## 接入浏览器后的优先冒烟测试

本轮环境没有可用浏览器连接，以下流程尚未做真实交互验证。请在本地启动静态站点后执行。

```bash
npm run build
npx serve site --listen 4173
```

按下列顺序检查，重点观察浏览器 Console 是否有模块加载、循环初始化或未捕获 Promise 错误：

1. 打开 `/`：总览可加载，成员筛选、标签筛选、搜索、手动刷新可用。
2. 从总览跳转 `/analysis/`、`/review/`、`/member/<成员>/`，再浏览器后退；确认全量数据只在首次需要时加载，页面不会空白。
3. 从总览跳转 `/roadmap/` 与 `/tags/`，再分别跳回总览和分析页；确认 SPA 切换后内容重新渲染。
4. 直接打开一个 `/problem/<成员>/<日期>/<题目ID>/` URL，检查预渲染正文可见；点击刷新，确认详情能重新请求 JSON。
5. 在路线和标签页切换成员、进入子路由、浏览器前进/后退，检查页面标题与内容同步。
6. 打开“提交/修改记录”但不保存，确认动态导入表单模块正常；如具备测试账号，再验证读取已有日期、保存和删除。
7. 在 DevTools Network 中确认：
   - `app.js` 导入 `lib/application.mjs?v=...`；
   - `application.mjs`、`data.mjs`、`renderer.mjs` 均带内容哈希；
   - `site/lib/data.mjs` 不包含 `renderer.mjs` 导入；
   - 路线/标签的预渲染直链首次打开不额外请求其索引 JSON。

## 后续技术重构建议

优先级从高到低：

1. **拆分 `lib/renderer.mjs`（1278 行）**：按 `journal`、`analysis`、`problem-detail`、`roadmap`、`tags`、`export` 分模块；仅保留共享 DOM/格式化辅助函数在公共位置。
2. **拆分 `scripts/generate-data.js`（约 1100 行）**：分离日志读取/聚合、静态资源构建、预渲染与 SEO 输出。先保持函数签名兼容，再移动实现。
3. **为应用协调层加 DOM 路由测试**：可选用浏览器 E2E 或轻量 DOM 测试，覆盖 SPA 页面互切、刷新和后退。
4. **统一模块格式**：`lib/journal-api.js` 是 ESM 语法但扩展名为 `.js`，Node 测试会产生 `MODULE_TYPELESS_PACKAGE_JSON` 警告。后续可评估改为 `.mjs` 并统一更新引用；不要仅添加 package-level `"type": "module"`，因为构建与迁移脚本仍使用 CommonJS `require`。
5. **引入成熟构建工具前先做基准**：当前自定义构建可用且产物可控。若迁移 Vite/esbuild，需要保留预渲染、多中文路径、Service Worker 和 GitHub Pages 静态部署行为，避免为了工具替换而扩大风险。

## 注意事项

- `site/` 是生成目录，受 `.gitignore` 忽略，不应手工修改。
- 训练源数据唯一来源是 `logs/`。
- Worker 配置和成员白名单目前在 `workers/oauth.mjs`；不要把密钥写入仓库。
- 构建脚本会安全地清空 `site/`，不要把人工文件放进该目录。
- 当前工作区含有本轮尚未提交的架构、开发体验与文档改动；交接前应先运行 `git status --short` 确认范围。

---

## 本轮改动（2026-09-13）：活力 v2、个人统计与区间契约

- 活力算法更新为 v2，所有带 Rating 的平台走同一条计分路径；个人页新增活力折线、平台计入明细和守恒校验。算法与局限见 [VITALITY-V2.md](VITALITY-V2.md)。
- 新增 `lib/vitality-summary.mjs`、`lib/member-vitality.mjs`、`lib/vitality-chart.mjs`；`site/data/all.json` 和个人静态页由构建自动生成，不能手改 `site/`。
- 新增 `lib/training-interval.mjs`：提供 `validateTrainingInterval`、`expandTrainingInterval`、`mergeTrainingDates`，已接入表单、Worker Schema 和热力图日期展开；结果字段 `outcome` 已接入表单、Schema、Worker 和构建，事件级同题结算仍未接入。
- [PENDING-FEATURES.md](PENDING-FEATURES.md) 已重写为评审版：`fileIndex` 与区间字段基础链路已完成，下一步接入事件级结果投影和同题结算。
- 当前验证：构建成功（165 条记录）；`npm test` 全部通过；专项活力、图表和区间测试全部通过；语法检查覆盖 72 个源码文件。

---

## 本轮改动（2026-09-11）：活力指数与难度统一

> 以下内容为 2026-09-11 那轮实现，与上文 2026-08-28 的架构整理相互独立。

本轮围绕三条队员反馈做了实现：**难度是「题 × 人 × 时间」的属性**、**同题判定错误**、**难度口径不直观**。完整的算法推导与依据见 [VITALITY-DESIGN.md](VITALITY-DESIGN.md)，尚未实施的区间打卡见 [PENDING-FEATURES.md](PENDING-FEATURES.md)。

### 0. 一句话摘要

新增「活力指数」：把每道题按 `(题目 Rating + 当时水平)` 折算成学习增量，**在累计题数完全不变的前提下并排展示**；同时把全站难度统一为 Codeforces Rating，并修掉一个会让不同场次题目被误判成同一道的真 bug。

### 1. 新增模块（纯函数，构建端与浏览器端共用）

| 文件 | 职责 | 关键导出 |
| --- | --- | --- |
| `lib/rating.mjs` | 难度统一为 CF Rating 的唯一入口与展示口径 | `resolveDifficultyRating()`、`ratingLabel()`、`ratingTone()`、`ratingOptions()`、`DIFFICULTY_LABEL_RATING`、`RATING_BAND_VALUES`、`STANDARD_RATINGS`、`parseRatingLabel()` |
| `lib/vitality.mjs` | 活力指数计算 | `problemVitality()`、`computeVitalityTimeline()`、`optimalRating()`、`abilityFromEvidence()`、`applyForgetting()`、`predictSuccess()`、`matchFactor()`、`abilityGain()`、`baseVitality()`、`ratingToDifficultyScale()`、`vitalityLevel()` |

两个模块都**不读时钟、不碰 DOM、无 IO**，因此可在 Node 里直接单测（`renderer.mjs` 依赖 DOM，测不了——`vitalityLevel` 就是为此从 renderer 移出来的）。

### 2. 修改的既有模块

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `lib/problem-identity.mjs` | 新增 `isCompleteProblemNumber()` 与 `COMPLETE_NUMBER_PATTERNS`；`canonicalProblemKey()` 增加**题号完整性校验**，残缺题号返回 `null` | **真 bug 修复**：原先只判断「平台和题号非空」，导致 `Codeforces` + `B` 成为合法 key，9 个不同场次的 A 题、8 个 B 题塌缩成同一道 |
| `lib/problem-links.mjs` | 新增导出 `resolveCodeforcesProblemNumber()`；`originalProblemUrl()` 在题号**残缺**（不只是为空）时回退到名称解析 | 同一 bug 的另一半：`题号=B` + `名称='Codeforces Round 1108 (Div. 2)'` 的记录原本链接为空 |
| `lib/log-schema.mjs` | 新增 `normalizeDifficultyRating()`；`normalizeMeta()` / `validateLogInput()` / `metaFromProblems()` 透传 `difficultyRating`（非正数视为缺失，不写 `null`） | 原先 `normalizeMeta` 是白名单，会把新字段过滤掉，导致构建产物里没有 Rating |
| `lib/ui.mjs` | 记录卡片难度徽章改用 `ratingLabel()/ratingTone()`；新增「活力 x.xx」徽章 | 展示统一为 `★ 1200` |
| `lib/problem-detail.mjs` | 详情页徽章与「题目信息 → 难度」改用 Rating | 同上 |
| `lib/form.mjs` | 难度下拉改为 Rating 档位（`★ 800`~`★ 2900`）；新增 `setDifficultyValue()`、`ratingDisplay()`；导入回填与导入列表都走 `resolveDifficultyRating()`；提交时带 `difficultyRating` | 表单是唯一还能产生旧格式标签的入口 |
| `lib/renderer.mjs` | 新增 `difficultyText()` 局部助手；难度筛选下拉与统计改为 Rating 口径；`renderHeatmap()` 增加活力口径参数；新增 `renderVitalityChart()` | 展示层统一 |
| `scripts/generate-data.js` | 新增 `buildVitality()`；`buildHeatmapCounts()` 增加活力口径（`valueAll`/`valueByMember`）；`overviewData` 增加 `vitality`/`vitalityAllDaily`/`totalVitality`；`logSummary`/`recordSummary`/`buildProblemIndex`/`buildReviewQueue` 带上 `difficultyRating` 与 `vitality` | 构建期一次算完，避免前端重复计算 |
| `index.html` | 累计题数卡片内并排加入活力徽章；新增「活力曲线」面板 | **题数展示一个字未改**，活力为并排新增 |
| `style.css` | 补齐 `entry`/`basic` 两个新难度档位的配色（含暗色主题）；新增 `.vitality-badge`、`.vitality-inline`、`.vitality-chart-*`、`.hint-inline` 样式 | 原先只有 easy/medium/hard/expert 四档 |

### 3. 新增运维脚本

三个脚本**都是默认 dry-run、`--write` 才落盘、幂等、保留原值便于回滚**：

| 脚本 | 作用 | 原值字段 | 来源字段 |
| --- | --- | --- | --- |
| `scripts/repair-problem-identity.mjs` | 按官方数据补全残缺题号 | `problemNumberLegacy` | 报告里说明依据 |
| `scripts/backfill-difficulty.mjs` | 为无难度的记录补难度 | `difficultyLegacy` | `difficultySource` |
| `scripts/backfill-rating.mjs` | 把一切难度口径换算为 Rating 数值 | `difficultyLegacy` | `difficultyRatingSource` |

**必须知道的坑**：

- **场次序号 ≠ contestId**。`Codeforces Round 1108` 的 contestId 是 `2246`，`Round 1114` 是 `2254`。开发早期曾把场次序号当题号写入，实测 24 条全部错误（官方 problemset 里不存在），已全部纠正。
- 官方数据来源：`codeforces.com/api/contest.list`（序号 ↔ contestId ↔ 开始时间）、`codeforces.com/api/problemset.problems`（题名 → 题号 + rating）、洛谷题目页内嵌 JSON 的 `difficulty` 字段（8 级）。
- 换算表集中在 `lib/rating.mjs`，脚本与表单共用同一份；**不要在两处各维护一份**。

### 4. 数据改动（`logs/`，需在提交信息里说明）

| 改动 | 规模 | 说明 |
| --- | --- | --- |
| 题号修正 | 44 条记录 | 补全残缺题号（如 `B` → `1108B`），并修正早期错误的 contestId |
| 难度补全 | 67 条记录 | 无难度记录按官方数据补全，其中 16 条为推断（校内自建题、尚未 rated 的场次），逐条注明依据 |
| 难度统一为 Rating | 165 条记录 | 每条带 `difficultyRating`，**全库难度覆盖率 100%**，`未标注` 归零 |
| `training/` 索引重建 | 3 个文件 | `subjectKey` 从记录级（`record:...:legacy-xxx`）升级为题目级（`problem:洛谷|P5143`） |

改动字段全部是**新增**的（`difficultyRating` / `problemNumberLegacy` / `difficultyLegacy` / `difficultyRatingSource`），旧的 `difficulty` 与 `problemNumber` 语义保留未删。

### 5. 新增测试

| 文件 | 覆盖 |
| --- | --- |
| `test/rating.test.mjs` | 非 CF 平台也能落到 Rating；数值优先于标签；历史脏值归位；档位配色与升序 |
| `test/vitality.test.mjs` | **目标难度随水平上移**；同一道题对不同水平价值不同；入门题上限低于提高题；匹配度峰值；未完成只给 30%；能力饱和与遗忘地板；时间线能力演进 |
| `test/vitality-heatmap.test.mjs` | 活力分档：1 道提高题与 3 道入门题颜色不同；分档单调不减 |
| `test/problem-identity-regression.test.mjs` | **场次序号 ≠ contestId**；残缺题号绝不生成聚合 key；平台标错不误聚合 |
| `test/problem-links.test.mjs` | 完整题号直接生成链接；两种残缺形态的名称回退；解析不出时留空不猜 |
| `test/aggregation.test.mjs`（改） | 新增断言：残缺题号不参与聚合，不同场次不被误判同题 |

### 6. 验证结果

- `npm run check` 全绿：**语法 68 文件、317 + 4 测试通过**、训练索引最新、构建 165 logs。
- 构建产物抽查：165 个题目页徽章**全部**为 `★ N`，非 Rating 与 `未标注` 均为 0。
- 三个脚本次幂等验证通过（重跑报告 0 条待处理）。

### 7. 本轮遗留与后续接手点

1. **完成质量未接入**：公式已有 `credit`（没做出来 = 0.3），但记录里暂无 `outcome` 字段，当前一律按「做出来了」处理。见 [PENDING-FEATURES.md](PENDING-FEATURES.md)。
2. **曲线开头活力为 0**：`θ₀ = 0.5`（零基础）面对 ★1000 的题匹配度≈0，导致入门期曲线平坦。可选调整：提高能力起点，或减少多标签均摊（当前多标签题的增益按标签数均摊，会让能力被低估）。**待队员反馈后再定。**
3. **目标难度带未可视化**：目前只用数据点颜色表达「是否达标」，若要更醒目的横带需另加。
4. **表单仍会丢新字段**：`metaFromProblems` 已透传 `difficultyRating`，但 `difficultyLegacy` / `difficultyRatingSource` 等审计字段不在 Schema 白名单里，**队员通过网页编辑某天记录后这些字段会消失**。功能不受影响（`difficultyRating` 在），但审计信息会丢。
5. **本轮未提交**：改动横跨代码、数据、文档三层；提交前建议先跑 `npm run check`，并确认 `logs/` 的批量改动在 commit message 里说明清楚。

6. **文件槽位已稳定化**：日志 `meta.json` 可选保存 `fileIndex`。表单加载和 Worker 读写都会优先使用该槽位，题目重排不会再让描述、题解串位；旧记录仍按数组序号兼容读取，新题目保存时自动分配未使用槽位。对应测试在 `test/log-schema.test.mjs` 与 `test/oauth-plan.test.mjs`。

**接手建议顺序**：先读 [VITALITY-DESIGN.md](VITALITY-DESIGN.md) 第 3–4 节搞清公式与参数，再看 `lib/vitality.mjs` 的实现，最后按 [PENDING-FEATURES.md](PENDING-FEATURES.md) 的 A–E 阶段做区间打卡。

