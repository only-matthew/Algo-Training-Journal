# 当前实现与验收口径

**2026-10-05 CDN 接入已实现（本地完成，待发布）**：`cdn.mirstar.net` 的阿里云国内节点、Cloudflare DNS、HTTPS 和海外 302 回 Cloudflare 均已完成真实请求验收。发布构建设置 CDN_ORIGIN，将 JS／CSS／背景图／公式与高亮库及打印依赖切换到 CDN，CSP 和离线缓存同步接入；本地默认同源。650 项单测、47 项浏览器回归通过；CDN 构建额外验证首页、标签页、独立题目公式、字体和 PDF。线上同版本资源 A/B 各 5 轮，本机 LCP 中位数原站 376 ms、CDN 396 ms，未测出稳定提速。线上页面尚未切换，详细条件、证书到期与续期边界见 [CDN.md](CDN.md)。

**2026-10-05 工作区优化（本地完成，未发布）**：页面骨架复用、JSON 缓存命中跳过正文读取、首页预渲染与预加载、目录渲染器及导出转换器按需加载、统计与索引并行请求、Service Worker 迁移仍有效的内容哈希资源。性能测量条件和历史对比见 README 的项目结构说明。续修知识地图和标签页手动刷新：同时替换渲染器内的快照，题单详情和标签详情强制重新请求；题单详情刷新不额外下载整份地图索引。完整 `npm run verify` 通过，648 项单测无失败或跳过，203 条日志、635 个可缓存产物构建成功；浏览器验收见 HANDOFF 最新记录。未更改日志格式、写入接口或日常 CI 的浏览器策略。

**2026-10-04 v2.1.0 已发布**：`c2a9c99` 的 Pages 与 Worker 发布均成功。修复山水背景接缝、移动图表与数值提示、详情样例代码框、正文限宽、嵌套滚动及 PDF；合并思考与重做记录，修复离线缓存并升级 Wrangler／KaTeX。语法检查改为单进程解析，线上约 3.28 → 0.13 秒；639 项单测和 31 项浏览器回归通过。按用户发布时反馈，思考和代码保留与题目描述同宽的双栏布局，追加四项专项回归。发布验收、Action 日志核对和维护交接见 [RELEASE-v2.1.md](RELEASE-v2.1.md)。以下旧验收数字保留为历史快照。

更新日期：2026-10-02。这里记录当前可核对的实现；线上是否生效以部署结果为准。[PRODUCT.md](PRODUCT.md) 是产品方向，[SPECIFICATION.md](SPECIFICATION.md) 是实现契约与验收，[HANDOFF.md](HANDOFF.md) 是按日期保存的交接记录。带日期的审计数字以 [Audit/PRODUCT-AUDIT.md](Audit/PRODUCT-AUDIT.md) 为快照，不代表实时使用量；最近一次全栈审计与修复记录见 [Audit/AUDIT-2026-10-02.md](Audit/AUDIT-2026-10-02.md)。

当前工作区包含两轮修复：第一轮是两份审计中的安全入口、构建正确性、默认复习建议、同题重做、个人清单、空心得清理、场次展示、周期报告、同题提示和旧状态来源标记，已在 2026-10-02 提交（`9b2fa2c`）并发布；第二轮按当天的[全栈审计](Audit/AUDIT-2026-10-02.md)逐项修复了题面解析 DoS、保存丢审计字段、三套"今天"口径、写入层重复实现、网络无超时、门禁覆盖面等问题，逐项状态与验收证据见该报告 §8。第二轮验收：`npm run verify` 通过（**2026-10-02 第二轮单测 616 项全绿**），`npx playwright test` **17/17 通过**，PR 浏览器回归配置在 `checks.yml`；该时点尚未覆盖主分支直推发布，后续工作区补修见下文门禁说明。详见 [技术审计当前进展](Audit/PROBLEM-AUDIT.md)与[产品审计当前进展](Audit/PRODUCT-AUDIT.md)。

## 现在是什么

- 站点是从 `logs/` 和 `curriculum/` 构建的静态 GitHub Pages 页面；`site/` 是可重建产物。Cloudflare Worker 处理 GitHub OAuth、登录后日志写入、题目导入和题面抓取。
- 日志写入格式的当前版本由 `lib/log-schema.mjs` 的 `LOG_SCHEMA_VERSION` 定义，当前工作区为 **8**。v7 增加 `reviewStatus=deferred`（超纲待做），只允许搭配“未完成”且不能设置复习日期；v8 把“超纲待做”移到 `masteryStatus=beyond_scope`（掌握自评的一个取值），不再占用复习状态，旧记录的 `reviewStatus=deferred` 在归一化时映射为该自评值，复习安排随之退出近期队列（除非原本就带复习日期）。Worker 的匿名只读 `GET /api/capabilities` 公布可接受范围和构建提交号，`GET /api/session` 可做发布后只读冒烟。Pages 部署**只有本次推送改动了 Worker 输入**（六类：`workers/`、`lib/`、`config/members.json`、`scripts/stamp-worker-commit.mjs`、`package.json`、`package-lock.json`）时才核对 schema、匿名会话与同提交版本，最多等待 15 分钟；其他推送完全跳过 Worker 接口检查与等待。
- 当前用户入口为首页、训练档案、复习、知识地图、标签、独立提交页 `/submit/`。`/training/` 已下线。日志按 `logs/<姓名>/YYYY/MM/DD/` 保存；题目详情与导出由构建数据生成。
- `npm run verify` 依次运行语法检查、ESLint、训练索引校验、单测和站点构建。按用户明确选择，日常发布和 PR Action 不安装 Chromium、不执行浏览器回归；浏览器测试仅保留为本地按需验收。主分支发布只构建一次。复核报告关于恢复浏览器 CI 的建议未采纳，不能把这项取舍描述为已恢复门禁。

## 冻结与维护范围

- `training/` v2 数据、`lib/training-*.mjs` 与 `/api/v2/me/*` 后端没有生产前端消费者；不应把它们描述成已上线训练工作台。
- 题面抓取支持现有平台，新增来源前先检查真实使用和维护成本。`workers/services/` 存放日志读写、版本校验、平台导入和 AI 概括；`workers/routes/` 承接 v2 HTTP 请求；`workers/storage/` 封装 GitHub 访问。`workers/oauth.mjs` 是路由、鉴权与协议适配入口。
- Cloudflare Workers Builds 已连接本仓库 `main` 分支并自动部署现有 `algo-oauth`；GitHub Pages 的发布门禁区分两种情况：**Worker 输入未变**（大多数推送）完全跳过 Worker 检查与等待；**Worker 输入已变**则等待同一提交的 Worker 上线。2026-09-28 的 `66f25b4` 改动 Worker 并成功上线；其后的训练日志提交和 2026-09-29 的 CI 精简提交 `70042ea` 均未重建 Worker，Pages 发布成功。2026-10-02 的 `9b2fa2c` 改动了 `lib/`（schema 升到 v8），按上述规则等待并成功上线，线上 `buildCommit` 已核验为 `9b2fa2c`（`/api/capabilities` 公布 `logSchema.max = 8`）；之后的日志或文档推送不改 Worker 输入，线上 `buildCommit` 会保持该值。今后改动日志格式时应先确保 Worker 向后兼容；不兼容会被门禁挡住。门禁仅验证日志 schema 范围、会话读接口，以及（仅在 Worker 变更时）提交号，其他写入协议变化仍需单独验证。

## 验收与观察

- 完整本地门禁：`npm run verify`；浏览器回归：首次准备好 Chromium 后运行 `npm run test:e2e`，已有站点构建时可用 `npm run test:e2e:ci`。推送 `main` 后：若本次推送改动了 Worker 输入，确认 Workers Builds 成功且 `GET /api/capabilities` 返回本次提交；否则不检查 Worker。两种情况都核对 GitHub Pages 发布与首页页脚版本。
- 产品使用数据以 2026-09-27 的 [Audit/PRODUCT-AUDIT.md](Audit/PRODUCT-AUDIT.md) 为基线：3 名队员、157 个记录日、194 条题目记录；题单命中 141/2857，待复习 6/194，心得空或占位 42/194。这些是日志反推指标，不是页面点击量。
- 不把打卡数量用作个人排名或问责；缺失状态按未知处理。下一次审计应重新从源数据计算，不复制旧数字作为现值。
