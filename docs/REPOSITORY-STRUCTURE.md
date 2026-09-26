# 仓库目录约定

本仓库按“浏览器源码、共享模块、服务端、数据、工具、测试、文档”分区。根目录只保留项目配置、部署入口和这些一级职责目录，避免页面文件、生成产物与业务数据混在一起。

## 目录职责

| 路径 | 内容 | 维护规则 |
| --- | --- | --- |
| `src/` | 浏览器入口、HTML、样式及随站点发布的资源 | 仅放浏览器直接使用或构建时复制的文件 |
| `config/` | 成员身份与平台账号配置（`members.json`） | 部署期事实来源；OAuth 按 `githubUserId` 匹配，`memberId` 与 `logDirectory` 不随 GitHub 改名变化 |
| `lib/` | 前端、Worker、构建脚本和测试共享的业务模块 | 不依赖具体页面 DOM 的能力优先放这里 |
| `vendor/` | Marked、KaTeX、Prism 等固定版本的第三方浏览器库 | 与自有源码分离，由构建脚本复制或打包 |
| `workers/` | Cloudflare Worker、服务层和 Wrangler 配置 | API、鉴权、抓取和仓库写入逻辑集中维护 |
| `bot/` | QQ 机器人监听、提醒及消息处理 | 不与 Worker 共用的机器人运行入口放这里 |
| `scripts/` | 构建、迁移、校验、抓取和冒烟脚本 | 脚本应从仓库根目录执行，不写死本机绝对路径 |
| `test/` | Node.js 单元与回归测试 | 文件名使用 `*.test.mjs` |
| `e2e/` | Playwright 端到端测试 | 面向构建后的 `site/` 验证完整交互 |
| `logs/` | 训练日志源数据 | 唯一业务事实来源，不从 `site/` 反向修改 |
| `training/`、`curriculum/` | 训练方案与课程结构化数据 | 由对应维护或转换脚本校验 |
| `know-tree/` | 课程与知识树源资料 | 与生成后的课程数据分开存放 |
| `docs/` | 产品、规格、设计、交接和运维文档 | 路径引用以当前仓库结构为准 |

## `src/` 内部结构

```text
src/
├── app.js              # 主站浏览器入口
├── problem-page.js     # 独立题目页入口
├── index.html          # 页面骨架
├── style.css           # 主样式
└── assets/             # 图片与拆分维护的补充样式
```

构建脚本从 `src/` 读取自有页面资源，从 `vendor/` 读取固定版本的第三方库，并将浏览器产物写入 `site/`。页面中的 `assets/...`、`vendor/...` 等 URL 是构建后站点路径，因此不需要带 `src/` 前缀。

## 依赖边界

```text
src/ ──────┐
           ├──> lib/
workers/ ──┤
scripts/ ──┤
test/ ─────┘

scripts/verify-import-live.mjs ──> workers/oauth.mjs  # 仅真实网络全链路验证入口

logs/ + training/ + curriculum/ ──> scripts/generate-data.js ──> site/
```

- `src/` 可以导入 `lib/`，但 `lib/` 不应反向导入页面入口。
- Worker 和构建脚本可以复用 `lib/`，不要从 `src/app.js` 或 `src/index.html` 获取业务规则。当前唯一的 `scripts/ → workers/` 例外是 `verify-import-live.mjs`，它有意驱动完整 Worker 鉴权与路由链路；普通解析脚本不得照抄该依赖。
- `site/`、`build/`、`.build-cache/`、`artifacts/`、测试报告和工具缓存均为忽略项，不直接提交或手工维护。
- 新增共享规则前先检查 `lib/` 是否已有相同能力，避免浏览器、Worker 与构建脚本各自实现一份。
- 已完成的一次性迁移不要长期留在 `scripts/`；先确认仓库中已无旧格式数据，再删除脚本并在交接文档记录可恢复的提交。

## 新文件放置速查

- 新页面入口、浏览器专用样式或图片：`src/`
- 可被多个运行环境复用的纯逻辑：`lib/`
- API 路由、鉴权、外部题面抓取：`workers/`
- 一次性迁移或可重复运行的维护任务：`scripts/`
- 单元测试：`test/`；真实浏览器流程：`e2e/`
- 产品需求、设计决策或交接记录：`docs/`

修改目录或入口后至少运行：

```bash
npm run verify
```
