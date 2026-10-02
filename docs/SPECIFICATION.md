# 规格：现行契约与下一阶段验收

版本：2026-09-29。本文件把**当前工作区实现**与**拟议变更**分开记录。生产环境是否生效须以发布证据核验。历史版本、完整 v2 目标接口与专项设计见 [归档](archive/2026-09-28-pre-rewrite/)。产品目标见 [PRODUCT.md](PRODUCT.md)。

## 1. 当前实现契约

### 1.1 数据、身份与时间

- 日志源目录是 `logs/<logDirectory>/YYYY/MM/DD/`，元数据为 `meta.json`，每题正文分文件保存。`config/members.json` 的 `githubUserId` 绑定登录身份，`memberId` 是稳定机器键，`logDirectory` 对应现有中文日志目录。不得从可变 GitHub login 推断成员所有权。
- 日志写入版本以 `lib/log-schema.mjs` 的 `LOG_SCHEMA_VERSION` 为准，当前工作区为 **8**；同模块负责大小、题数、字段与区间校验。每次写入最多 15 题、请求 JSON 最多 1.5 MB；题目 ID 在当日内不可重复。v7 增加 `reviewStatus=deferred`（超纲待做），只允许搭配 `outcome=unfinished`，且不接受 `reviewDue`；v8 把“超纲待做”改为 `masteryStatus=beyond_scope`（掌握自评取值），复习状态不再承担该语义，旧 `reviewStatus=deferred` 在归一化时映射为该自评值。旧版本可读并归一，未知的更新版本被拒绝。
- `outcome` 是做题结果，`masteryStatus` 是掌握自评，`isMistake` 是失误事实，`reviewStatus`/`reviewDue` 是复习安排。缺失结果保持未知。旧 `reviewStatus=mastered` 的兼容映射保留，并以 `masteryStatusSource` 标记其历史来源；详情页提示该状态不是可核实的本人新自评。
- 训练区间影响热力图、训练日和活力日分摊，日期按 UTC+8 约束；统计按记录日与有效区间的日期并集计算，不重复累计重叠天数。无效历史区间在读侧降级处理以保证记录仍可访问。
- `training/` v2 数据、`/api/v2/me/*` 后端保留且**冻结**，没有生产前端消费者；其中记录通用增删改与 `plan-links` 等旧目标契约并未全部实现。不要把归档规格中的目标路由表理解为当前可用清单。

### 1.2 浏览器与构建

构建器 `scripts/generate-data.js` 从 `logs/` 和 `curriculum/` 生成 `site/`。当前页面包括首页、训练档案、复习、知识地图、标签、题目详情和独立提交页 `/submit/`。页面读取 `site/data/` 的概览、按月/成员/标签/题目分片；`site/` 不直接编辑。静态页面可能滞后于刚保存到 GitHub 的新记录，UI 应把保存回执与公开页面刷新分开表述。

`curriculum/` 是选题参考源，不能拿全部条目的覆盖率代表个人训练目标。标签页和课程页仍随站点构建。构建时清理站点资源镜像中的旧文件，并从 sitemap 排除零记录标签页；其他生成资源仍应在发布前核对。

### 1.3 Worker 接口与写入保护

| 接口 | 当前用途 | 状态 |
| --- | --- | --- |
| `GET /api/session` | 匿名读取会话状态，已登录时下发会话与 CSRF 所需信息 | 已上线；仍需发布后冒烟 |
| `GET /api/capabilities` | 公布 Worker 接受的日志 schema 范围与构建提交号 | 已上线；2026-09-28 的 `66f25b4` 已核验 HTTP 200 与提交号一致 |
| `GET/PUT/DELETE /api/logs/date?date=...` | 按日期读取、写入与删除现行日志 | 已有接口 |
| `GET/PUT /api/my-list` | 读取、条件保存当前成员的个人清单，最多 30 题 | 当前工作区已实现，待发布 |
| `PATCH /api/v2/me/logs/dates/:date/records/:id` | 只修改单题复习状态与到期日 | 已有接口，字段白名单 |
| `PUT /api/v2/logs/dates/:date` | 新格式日期日志和附件保存 | 已有接口，条件版本与幂等要求以实现为准 |
| `POST /api/import`、`POST /api/problem-statement`、`POST /api/summarize` | 已授权的导入、抓题面与概括 | 已有接口，非核心闭环 |

GitHub OAuth 只允许配置成员写自己的日志。写接口校验 Origin、会话与 `X-CSRF-Token`；适用的 v2 写请求使用版本前提与 `Idempotency-Key`，并返回结构化错误。具体路由、字段白名单和错误码以 `workers/oauth.mjs`、`workers/routes/`、`workers/services/` 的测试与代码为准。对外新接口需补鉴权、拒绝分支、并发和成功路径测试。

### 1.4 验证与发布

- `npm run verify`：语法、ESLint 未定义/未使用检查、训练索引一致性、Node 测试和站点构建。
- `npm run test:e2e`：本地构建站点、启动预览并运行 Chromium 浏览器回归；`npm run test:e2e:ci` 用于已有构建。浏览器回归按需执行，不在日常 PR 与主分支 Action 中重复安装 Chromium。
- Cloudflare Workers Builds 已连接本仓库 `main` 分支；build watch paths 已设为 `workers/*`、`lib/*`、`config/members.json`、`scripts/stamp-worker-commit.mjs`、`package.json`、`package-lock.json`。仅这些 Worker 输入变化时运行 `npm run deploy:worker`，把 `WORKERS_CI_COMMIT_SHA` 编入 Worker，再通过仓库内 `workers/wrangler.toml` 部署现有服务。Pages 门禁使用相同输入集；两侧路径必须同步维护，否则可能漏部署或等待不会到来的构建。
- 主分支 Pages 工作流只构建一次，并在上传页面产物前运行 `scripts/check-worker-compatibility.mjs`。门禁分两级：**始终**要求线上 Worker 能接受本站的 `LOG_SCHEMA_VERSION` 且匿名会话读接口可用，不满足立即拒绝；**仅当本次推送改动 Worker 输入**（同上六类路径）时才额外要求线上 Worker 的提交号等于本次 `github.sha`，并最多等待 15 分钟。Worker 没变就不校验提交号、不等待——否则每次日志或文档推送都要白等一轮 Worker 构建。它不能代替其他写入协议的回归测试。
- 首页与独立题目页底部显示 `package.json` 版本、构建时间（UTC+8）和提交短号。2026-09-28 的 `66f25b4` 已完成 Worker 与 Pages 发布；线上 CORS 预检允许 `PATCH`。2026-09-29 的 `70042ea` 只精简 Action，Pages 发布成功且没有触发 Worker 重建。2026-10-02 的 `9b2fa2c` 改了 `lib/`（schema → v8），触发 Worker 重建并成功上线，线上 `buildCommit` 已核验为该提交。

## 2. 本轮产品闭环交付与验收

以下功能已在当前工作区实现并通过本地测试，尚未据此认定线上可用。验收条款保留为发布后复核依据。

### A. 空心得与历史占位

新写入不得把空心得转成字面量“未填写”；读侧把缺文件、空文件及历史纯占位视作缺失；展示与导出只在真实内容存在时渲染正文。对现有占位文件先做可恢复备份，再精确匹配全文件内容清理，报告数量，避免误改用户确实写下的其他内容。平台缺省标签与心得缺失语义需分别处理。验收：空心得保存、读取、页面、Markdown/LaTeX 导出全链路均不出现假正文；已有非空心得逐字保留。

### B. 默认复习建议

仅对新记录：当 `isMistake=true` 或 `outcome` 为 `hinted`、`editorial`、`unfinished` 且用户尚未手动选择时，表单直接切换为 `reviewStatus=todo` 并填入记录日后三天；界面不再暴露中间态“按结果建议”。用户的 `none`、`deferred`、`archived` 或自选日期优先。`deferred` 表示未完成题目的超纲待做，不进入近期复习队列；旧记录不批量改写。验收：四种触发信号、无信号、手动覆盖、跨月/跨年日期、超纲约束、单题 PATCH 和并发写入均有测试；保存后的队列可见且可撤销。

### C. 个人清单与重做

成员自选清单上限先按 20–30 题设计，稳定题目键沿用 `lib/problem-identity.mjs`；完整课程库继续保留。清单显示可解释的分母与完成证据。重做必须新增尝试记录并关联原题，旧尝试不可覆盖。存储方案需在实现前比较扩展现有 `logs/` 与恢复冻结 v2 的迁移成本；两者只能确定一种权威写入路径。验收：同题多次尝试顺序、跨平台题号归一、取消与修改计划、历史数据兼容和成员隔离。

### D. 周期使用报告

报告从 `logs/`、`curriculum/` 及必要的 Git 历史生成，输出统计时间窗、成员数、训练场次/记录日、题目数、有效复盘、待复习/完成复习、个人清单进度与不可测项。数据反推不能伪称按钮点击量；没有事件源时显示“未知”。验收：同一提交与同一窗口重复生成结果一致，关键去重规则有测试，报告保留生成提交与口径版本。

## 3. 不变量与变更纪律

- 保留原始训练记录与审计证据。数据迁移必须可回退，并说明历史口径与新口径的断点。
- 新页面不得依赖冻结 v2 路由，除非先完成产品决策、迁移方案和端到端验收。
- 个人统计不做成员排名；复习到期不等于失败，缺失结果不推断为完成。
- 变更 `LOG_SCHEMA_VERSION` 或写入协议时，同步前端、Worker、构建器、测试和发布顺序；先部署兼容 Worker。
