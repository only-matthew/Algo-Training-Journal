# 优化清单

## 功能迭代（2026-08）

### 1. 错题复习队列（间隔重复）

- [x] **数据层** — `meta.json` 每题增加 `reviewDue`（复习日期，`YYYY-MM-DD`），`log-schema.mjs` 校验透传，Worker 写入（`lib/log-schema.mjs`, `workers/oauth.mjs`）
- [x] **构建聚合** — `overview.json` 新增 `reviewQueue`（全量待复习题，按 due 升序），前端按本地日期过滤"今日到期"（`scripts/generate-data.js`）
- [x] **首页队列卡片** — 总览页展示"今日复习队列"，每题可跳转详情/编辑；空状态与提示（`lib/renderer.mjs`, `index.html`, `style.css`）
- [x] **表单复习日期** — 状态为"待复习"时显示日期输入（默认 +3 天），加载已有记录回填（`lib/form.mjs`）

### 2. 同题聚合 / 二刷关联

- [x] **稳定 key** — `problemStableKey(platform, problemNumber)` 归一化（平台+题号，CF 题号统一 `123A` 形式）（`lib/log-schema.mjs`）
- [x] **构建聚合** — `generate-data.js` 聚合同 key 记录，单题 JSON 嵌入 `related`（全队做过几次、谁做过、状态）（`scripts/generate-data.js`）
- [x] **详情页展示** — 题目详情页显示"全队同题记录"历史列表（`lib/renderer.mjs`, `index.html`, `style.css`）

### 3. 刷题记录自动导入

- [x] **Codeforces** — Worker `/api/import` 调用 `user.status` 官方 API，过滤 AC、按题目去重，**仅返回最近 3 天内的 AC 记录**（自动翻页覆盖窗口，避免一次性拉取全部历史），并携带提交页链接（`workers/oauth.mjs`）
- [x] **洛谷** — 粘贴题号列表，Worker 抓取题目页内嵌 `lentille-context` JSON 解析**题名、官方难度（8 级）与题目描述**；标签为数字 ID 且平台无公开名称接口故不返回（`workers/oauth.mjs`）
- [x] **CF 代码替代方案** — CF 提交页有 Cloudflare managed challenge 反爬（无头 HTTP 客户端一律 403，实测 curl/Node 均被拦截），服务端自动抓取源码不可行；改为导入列表提供「📄 提交」直达链接，浏览器中可正常查看源码（`lib/form.mjs`）
- [x] **导入位置** — 导入的题目优先填入未填写的空题目块，而不是盲目追加到末尾（`lib/form.mjs`）
- [x] **标签中英合并** — CF 英文标签（`graphs`/`shortest paths`/`dfs and similar` 等 30+ 项）在 `lib/tag-catalog.mjs` 中映射为中文标签，导入回填与提交校验统一归一化（`lib/tag-catalog.mjs`, `lib/form.mjs`）
- [x] **限流与安全** — 导入接口复用会话鉴权 + 独立限流（`workers/oauth.mjs`）
- [x] **表单 UI** — 提交表单新增"从 Codeforces 导入"与"粘贴洛谷题号"入口，勾选结果回填为题目块（`lib/form.mjs`, `lib/journal-api.js`, `index.html`, `style.css`）
- [x] **预置 CF handle** — `workers/oauth.mjs` 新增 `CF_HANDLES`（廖夏 onlymatt / 王梓豪 hnuwang / 郭一鸣 ymguo），会话接口下发 `cfHandle`，导入面板自动预填可修改
- [x] **导入输入框过窄** — `.import-input-row` 由 flex 改为 grid（`1fr auto auto`），实测输入框宽度从 26px 修复为占满面板
- [x] **测试** — `test/oauth-import.test.mjs`（CF 3 天窗口/去重/非 AC 过滤/翻页、洛谷难度与题面解析、错误处理与输入校验）；`test/tag-normalize.test.mjs`（CF 标签合并）；`scripts/verify-import-live.mjs` 本地真实网络全链路验证（鉴权/CSRF/Origin + 真实 Codeforces API 与洛谷页面，无需登录与密钥，不进 CI）

## 安全

- [x] **缺少 CSP 头** — 无 Content-Security-Policy，存在 XSS 风险（`index.html`）
- [x] **`innerHTML` 拼接用户数据** — `updateAuthUI()` 直接拼接头像 URL 和用户名（`app.js:26`）
- [x] **Worker `/api/summarize` 无调用频率限制** — 可能耗尽 AI 配额（`workers/oauth.js`）
- [x] **Worker 错误信息泄露** — GitHub API 完整错误返回客户端（`workers/oauth.js:24`）
- [x] **无 CSRF token** — 写入类 API 仅依赖 `SameSite=Lax`（`workers/oauth.js`, `lib/journal-api.js`）
- [x] **CSP 过宽** — `script-src 'unsafe-inline'` 无必要（全站仅一个外部脚本），已收紧为 `script-src 'self'`（`index.html`）
- [x] **Worker 限流表仅内存态** — `rateMap` 在 Workers 各 isolate/冷启动间不共享，严格防滥用需 KV 或 Durable Object（`workers/oauth.mjs`）；已加注释说明边界

## 性能

- [x] **每次按键触发 `logInputBytes`** — 添加 300ms debounce（`lib/form.mjs`）
- [ ] **全量加载 `all.json`** — 概览/评估页无分页、无服务端过滤（`lib/data.mjs`）
- [x] **筛选切换全部卡片重建** — 改用 DocumentFragment + replaceChildren（`lib/renderer.mjs`）
- [x] **Prism + KaTeX（~600KB）同步加载** — 改为 Prism 与 KaTeX 并行加载（`lib/renderer.mjs`）
- [ ] **热力图 365 单元格每次重建** — 可通过 CSS class 更新优化，当前影响较小
- [x] **学习路线首屏重复拉 JSON 重渲染** — 预渲染内容被丢弃、每次直链都重新拉 roadmap.json/节点 JSON 并整页重建；已改为构建时写入 `data-route`/`data-members` 标记，首屏命中预渲染内容时零 JSON 请求（`scripts/generate-data.js`, `lib/renderer.mjs`, `lib/data.mjs`）
- [x] **KaTeX/Prism CSS 无条件加载** — JS 已按内容条件加载，CSS（~25KB）仍在 shell 无条件 `<link>`；已改为与 JS 一起按需注入（`index.html`, `lib/renderer.mjs`）
- [x] **表单模块静态加载** — `form.mjs`（含 tag-catalog/log-schema 依赖 ~57KB）被 app.js 顶层静态导入，学习路线等页面也全量加载；已改为按需动态导入，非学习路线页面空闲时预加载（`app.js`）
- [x] **无 Service Worker** — 静态资源与数据 JSON 受 GitHub Pages/Vercel 默认缓存策略限制；已新增构建期生成 `sw.js`（缓存版本随代码+数据哈希+构建时间自动失效），导航网络优先、静态资源缓存优先，二次访问秒开且可离线（`scripts/generate-data.js`, `app.js`）
- [x] **标签筛选栏/云每次重建** — 切队员时跳过全局标签重渲染（`lib/renderer.mjs`）
- [x] **后台 refresh timer 无休眠** — visibilitychange 事件暂停/恢复（`lib/data.mjs`）
- [ ] **构建脚本同步 I/O** — 数据集较小，保持同步 I/O 可接受
- [ ] **独立文件写入** — 每题写入独立 HTML + JSON，可批量处理
- [x] **重复遍历日志** — 已添加注释标注优化方向（`scripts/generate-data.js`）
- [x] **KaTeX + Prism 无条件加载** — 详情页无公式/无代码时仍加载 ~600KB；已改为内容含 `$` 才加载 KaTeX、含代码块才加载 Prism（`lib/renderer.mjs`）
- [x] **Worker 保存时 GitHub API 调用爆炸** — 保存一天 15 题约 140 次调用（46 次串行存在性探测 + 46 次 blob 创建）；已改为目录列表一次性判定存在性 + 本地 SHA-1 对比跳过未变更文件（`workers/oauth.mjs`）
- [x] **Worker 读取日志逐文件请求** — 每题 3 个文件各一次 Contents API；已改为先用目录列表过滤不存在的文件（`workers/oauth.mjs`）
- [x] **构建脚本 `lastCommitDate` 每文件 spawn 一次 git** — 已改为批量 `git log --name-only` 一次取全部（`scripts/generate-data.js`）
- [x] **构建脚本 `buildRecentStats` 对每个成员重复过滤** — O(m×n) 已改为单遍分组 O(n)（`scripts/generate-data.js`）

## 代码质量

- [x] **`app.js` 单体 1335 行** — 拆分为 6 个模块（`lib/auth.mjs`, `theme.mjs`, `form.mjs`, `renderer.mjs`, `router.mjs`, `data.mjs`）
- [x] **`renderJournal()` 520 行闭包** — 拆解为独立可组合函数（`lib/renderer.mjs`）
- [x] **热力图代码重复** — `renderHeatmap` 统一接受 root 参数，`renderMemberPage` 复用
- [x] **`collectProblems` 与 `captureProblemDrafts` 几乎相同** — 合并核心逻辑到 `extractProblemFields`（`lib/form.mjs`）
- [x] **`toDateString` 重复定义** — 提取到 `lib/constants.mjs`，app.js 和 generate-data.js 统一导入
- [x] **构建脚本正则 HTML 替换脆弱** — 用 cheerio 替换所有正则 HTML 操作（`scripts/generate-data.js`）
- [x] **Worker 路由 if/else 链** — 提取为命名 handler 函数（`workers/oauth.mjs`）
- [x] **魔数字符串分散** — 平台名/复习状态提炼到 `lib/constants.mjs`
- [x] **Worker `commit` 链式调用密集** — 拆解为 6 步清晰可读（`workers/oauth.mjs`）
- [x] **字段命名不一致** — `metaFromProblems` 兼容 `name`/`problem` 别名（`lib/log-schema.mjs`）
- [x] **Worker 文件名与新 ESM 风格不一致** — 重命名为 `oauth.mjs`
- [x] **题目详情 HTML 模板重复三处** — 构建脚本、`renderProblemPageFromLog`、运行时闭包各一份；已提取共享 `lib/problem-detail.mjs`（`scripts/generate-data.js`, `lib/renderer.mjs`）
- [x] **`renderProblemPageFromLog` 死代码** — 导出后从未被引用，已删除（`lib/renderer.mjs`）
- [x] **`renderCountMap` 与 `renderStats` 内嵌 `renderMap` 重复** — 已合并为一个函数（`lib/renderer.mjs`）
- [x] **`SITE_ORIGIN` / `SITE_NAME` 重复定义** — 已统一从 `lib/constants.mjs` 导入（`scripts/generate-data.js`）
- [x] **commit 第 5 步 ref PATCH 绕过 `gh()`** — 未做限流检测；已补齐限流检查（`workers/oauth.mjs`）

## 功能缺口

- [x] **无搜索功能** — 添加搜索栏，支持题目名/标签/平台/难度/题号筛选（`index.html`, `lib/renderer.mjs`, `style.css`）
- [x] **无进度趋势图** — 分析页增加周题量 SVG 柱状图（`index.html`, `lib/renderer.mjs`, `style.css`）
- [ ] **无批量操作** — 不能批量为多题修改标签/状态/难度
- [ ] **无撤销删除** — 删除操作永久清除，无软删除或回收机制
- [ ] **不支持 C++ 以外的语言** — 代码文件扩展名总是 `.cpp`
- [x] **无 Open Graph 元标签** — 添加 og/twitter 标签，构建时更新各页面（`index.html`, `scripts/generate-data.js`）
- [x] **无目标/打卡功能** — 概览页增加连续打卡计数（`index.html`, `lib/renderer.mjs`）
- [x] **无导出功能** — 添加 PDF 打印 + Markdown 文件下载（`index.html`, `lib/renderer.mjs`, `style.css`）
- [ ] **无部署完成通知** — 提交后只有"等待约 1 分钟"提示
- [ ] **无团队对比视图** — 不能并排比较队员进度
- [ ] **API 无版本前缀** — 缺少 `/api/v1/...`，未来变更即破坏
- [ ] **Worker 无结构化日志** — 无 request ID、延迟追踪、错误聚合
- [ ] **Worker 无健康检查端点** — 缺少 `/health` 或 `/api/health`
- [x] **AI 概括无重试逻辑** — 已在 Worker 端添加 3 次重试 + 指数退避（`workers/oauth.mjs`）

## 可访问性

- [x] **表单 label 缺少 `for` 属性** — 动态表单 9 组 label-input 全部添加 `for`/`id` 关联（`lib/form.mjs`）
- [x] **模态框无焦点捕获** — Tab/Shift+Tab 在模态框内循环，关闭后焦点回归触发按钮（`lib/form.mjs`）
- [x] **无跳过导航链接** — "跳到内容" link 作为 body 首个元素（`index.html`, `style.css`）
- [x] **未考虑 `prefers-reduced-motion`** — 全局 `@media` 查询抑制动画/过渡（`style.css`）
- [x] **热力图单元格无 `aria-label`** — 每个 cell 增加 `aria-label`、`role="img"`、活动日 `tabindex="0"`（`lib/renderer.mjs`）
- [x] **表单错误未关联 `aria-describedby`** — 校验失败时关联第一个 `.problem-name` + 聚焦（`lib/form.mjs`）
- [x] **可展开卡片无 `aria-expanded`** — 当前实现无展开卡片，无需修改
- [x] **仅颜色区分的信息无替代** — 热力图添加 `.sr-only` 图例说明色阶含义（`lib/renderer.mjs`, `style.css`）
- [x] **热力图 tab 停靠点过多** — 365 个活跃日各一个 `tabindex="0"`，键盘用户需按数百次 Tab；已改为容器单一可聚焦 + `role="group"`（`lib/renderer.mjs`）

## 开发体验

- [ ] **无 JSDoc 类型注释** — 函数参数和返回值无类型说明（全部 `.js`/`.mjs`）
- [ ] **无 ESLint/Prettier 配置** — 代码风格不一致
- [ ] **无 `jsconfig.json`** — VS Code 路径别名和模块解析不可用
- [ ] **`npm run check` 过重** — 语法检查+测试+全量构建一体化，开发迭代慢
- [ ] **无 watch 模式** — 开发时需全量构建
- [ ] **限定 Node 24+** — 应支持 20/22 LTS
- [ ] **无 `.editorconfig`** — 跨编辑器缩进/空白不一致

## 测试覆盖

- [ ] **`log-schema.test.mjs` 欠缺** — 日期、标签、题目 ID 等边缘情况未覆盖
- [ ] **`render-safety.test.mjs` 欠缺** — HTML 注入、空值、大文件等边缘情况未覆盖
- [x] **无 `journal-api.test.mjs`** — 已补（`test/journal-api.test.mjs`）
- [x] **无 `tag-normalize.test.mjs`** — 已补（`test/tag-normalize.test.mjs`）
- [ ] **无前端渲染测试** — `app.js` 无 DOM 测试
- [ ] **无 Worker 集成测试** — `oauth.js` HTTP 处理无测试
- [ ] **无构建脚本单元测试** — `generate-data.js` 各函数无独立测试
- [x] **Worker 保存/读取规划逻辑无测试** — 已补 `test/oauth-plan.test.mjs`（`gitBlobSha`、`planLogChanges`、save→read→增量→delete 全流程 mock）

- [x] **AI 概括无重试逻辑** — 添加 3 次重试 + 指数退避（`workers/oauth.mjs`）

## 架构

- [x] **前端模块变量状态混乱** — 拆分为独立模块，各自管理自身状态（`lib/auth.mjs`, `lib/form.mjs`, `lib/data.mjs`）
- [x] **构建脚本 `fs.rmSync` 无防护** — 添加路径校验守卫（`scripts/generate-data.js`）
- [ ] **热点数据无请求缓存/去重** — 已有 promise 复用，可进一步增强
- [ ] **`crypto.randomUUID` 降级有碰撞风险** — 毫秒内连续调用可能重复
- [ ] **重复请求无重试/退避** — `fetchJson()` 失败直接抛出
- [ ] **路由脆弱** — 纯字符串 `split` 解析，不支持成员名含特殊字符

- [x] **AI 概括无重试逻辑** — 已在 Worker 端添加 3 次重试 + 指数退避（`workers/oauth.mjs`）

## SEO

- [x] **缺少 `og:title / og:description / og:image`** — 添加 Open Graph + Twitter Card 标签，构建时各页面动态更新
- [x] **`description` 的 `truncate` 可能在句中截断** — 社交分享 description 使用已有摘要，题目页用 takeaway/description
- [x] **HTML 中无 `<link rel="sitemap">`** — 添加（`index.html`）

## 边界情况

- [x] **并发表单提交竞态** — 添加 `submitting` 标志位，阻止并发提交（`lib/form.mjs`）
- [x] **浏览器后退 + 模态框打开** — popstate 拦截：先关模态框再导航，用户取消则回推 state（`lib/router.mjs`, `lib/form.mjs`）
- [x] **GitHub API 限流无处理** — 读取 `X-RateLimit-Remaining`，低配额预警，耗尽时抛友好错误（`workers/oauth.mjs`）
- [x] **多人同时写入同一日期** — commit 已有 422 重试逻辑，错误信息已中文化
- [x] **Session cookie 尺寸** — 验证约 600-800 字节，远低于 4KB 上限（`workers/oauth.mjs`）
- [x] **日志重复条目** — 按 `(member, date, problemIndex)` Set 去重（`scripts/generate-data.js`）
- [x] **空成员目录** — `writeCrawlerFiles` 首页 fallback 当前日期作为 lastmod（`scripts/generate-data.js`）
