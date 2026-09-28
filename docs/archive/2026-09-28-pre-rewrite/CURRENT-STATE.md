# 当前实现与验收口径

更新日期：2026-09-28。这里记录本地待发布代码可核对的状态；线上是否生效以部署结果为准。[PRODUCT.md](PRODUCT.md) 是产品设想，[SPECIFICATION.md](SPECIFICATION.md) 是分阶段形成的规格与设计记录，[HANDOFF.md](HANDOFF.md) 和 [PROJECT-HISTORY.md](PROJECT-HISTORY.md) 是历史记录。带日期的审计数字以 [PRODUCT-AUDIT.md](PRODUCT-AUDIT.md) 为快照，不代表实时使用量。

## 现在是什么

- 站点是从 `logs/` 和 `curriculum/` 构建的静态 GitHub Pages 页面；`site/` 是可重建产物。Cloudflare Worker 处理 GitHub OAuth、登录后日志写入、题目导入和题面抓取。
- 日志写入格式的当前版本由 `lib/log-schema.mjs` 的 `LOG_SCHEMA_VERSION` 定义，当前为 **6**。Worker 的匿名只读 `GET /api/capabilities` 公布可接受范围，`GET /api/session` 可做发布后只读冒烟。Pages 部署在浏览器回归通过后检查线上 Worker 的版本范围，检查失败时阻止发布。
- 当前用户入口为首页、训练档案、复习、知识地图、标签、独立提交页 `/submit/`。`/training/` 已下线。日志按 `logs/<姓名>/YYYY/MM/DD/` 保存；题目详情与导出由构建数据生成。
- `npm run verify` 依次运行语法检查、ESLint 的未定义引用与未使用变量检查、训练索引校验、单测和站点构建。PR 与主分支发布都运行浏览器回归；主分支发布只构建一次。

## 冻结与维护范围

- `training/` v2 数据、`lib/training-*.mjs` 与 `/api/v2/me/*` 后端没有生产前端消费者；不应把它们描述成已上线训练工作台。
- 题面抓取支持现有平台，新增来源前先检查真实使用和维护成本。`workers/services/` 存放日志读写、版本校验、平台导入和 AI 概括；`workers/routes/` 承接 v2 HTTP 请求；`workers/storage/` 封装 GitHub 访问。`workers/oauth.mjs` 是路由、鉴权与协议适配入口。
- Worker 仍由维护者手动发布。2026-09-28 读取线上 `/api/capabilities` 得到 401，说明新能力尚未上线；启用本门禁前必须先发布 Worker。今后改动日志格式时也应先部署兼容的 Worker，再发布 Pages；自动化门禁会阻止不兼容的前端上线。当前门禁仅验证日志 schema 范围和会话读接口，其他写入协议变化仍需单独验证。

## 验收与观察

- 完整本地门禁：`npm run verify`；浏览器回归：`npm run test:e2e:ci`（先构建站点并安装 Chromium）。Worker 上线后确认 `GET /api/capabilities` 的范围和 `GET /api/session` 的匿名 200，再触发 Pages 发布。
- 产品使用数据以 2026-09-27 的 [PRODUCT-AUDIT.md](PRODUCT-AUDIT.md) 为基线：3 名队员、157 个记录日、194 条题目记录；题单命中 141/2857，待复习 6/194，心得空或占位 42/194。这些是日志反推指标，不是页面点击量。
- 不把打卡数量用作个人排名或问责；缺失状态按未知处理。下一次审计应重新从源数据计算，不复制旧数字作为现值。
