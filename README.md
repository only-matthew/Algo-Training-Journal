# Algo Training Journal

这是一个面向 ICPC / ACM 竞赛队伍的协作式算法训练日志。队员不需要学习 Git，可以直接使用 GitHub 账号登录、填写训练记录和查看队伍统计；日志仍以普通文件保存在 Git 仓库中，通过 GitHub Actions 构建为静态网站。

线上地址：[https://train.xialiao.org](https://train.xialiao.org)

## 项目总览

### 项目背景

算法竞赛训练需要长期记录做题数量、知识点、错误原因和复习进度。直接维护 Markdown 或 Git 文件便于沉淀和追踪历史，但对不熟悉 Git 的队员不够友好；普通在线表格又难以同时提供代码展示、题目详情、训练热力图和稳定的历史版本。

本项目将“网页表单的易用性”和“Git 仓库的可追踪性”结合起来：

- **对队员简单**：通过 GitHub 登录后在网页中新增、修改或删除训练记录，无需手动执行 Git 命令。
- **对数据可靠**：训练日志以结构化文件保存在 `logs/` 中，每次修改形成 Git commit，可审查、可迁移、可长期归档。
- **对展示轻量**：公开读取由 GitHub Pages 提供静态托管，无需常驻数据库或传统应用服务器。
- **对写入安全**：Cloudflare Worker 负责 OAuth 和受限 API，只允许白名单成员修改自己的日志目录。

### 技术方案

项目采用“**仓库即数据库、静态站点负责展示、Worker 负责写入**”的架构：

1. `logs/` 保存所有队员的训练源数据。
2. `scripts/generate-data.js` 聚合日志并生成首页摘要、全量轻量元数据、可索引的成员页与单题 HTML、单题 JSON、热力图和近 30 天统计。
3. GitHub Actions 将 `site/` 发布到 GitHub Pages。
4. Cloudflare Worker 完成 GitHub OAuth、会话校验和 Git Data API 写入。
5. 每次网页提交产生一个 Git commit，并触发站点重新构建和部署。

### 核心组成

| 组成 | 主要职责 |
| --- | --- |
| 静态前端 | 日志浏览、筛选、统计分析、错题复盘、表单提交和独立页面路由。 |
| `logs/` 数据目录 | 保存按队员和日期组织的题目元数据、描述、题解和代码。 |
| 数据构建脚本 | 校验并聚合日志，计算统计信息，生成可部署的 `site/`。 |
| Cloudflare Worker | 处理 GitHub OAuth、加密会话、成员授权和原子 Git commit。 |
| GitHub Actions / Pages | 在日志变化后自动构建并发布公开站点。 |

下文分别说明[项目功能](#项目功能)、[整体架构](#整体架构)、[数据存储](#数据存储)、[项目结构](#项目结构)和[部署配置](#部署配置)。

## 项目功能

### 训练记录

- 使用 GitHub OAuth 登录，并限制为队伍白名单成员。
- 按日期新增、加载、覆盖和删除当天的训练记录。
- 一天可提交多道题，每道题可记录名称、题号、平台、难度、标签、描述、心得/题解和 C++ 代码。
- 每个日期最多提交 15 道题，总提交内容不超过 1.5 MB；超限会明确提示，不会静默截断。
- 洛谷和 Codeforces 题目可通过题号从详情页直接跳转到原题；旧记录的题号默认留空。
- 使用永久题目 ID 保持详情链接稳定，不依赖题目在当天记录中的顺序。
- 将题目标记为“非错题”“待复习”或“已掌握”，形成团队共享的复盘状态。
- 标记“待复习”时可设定复习日期（默认 +3 天），到期题目自动出现在首页“今日复习队列”，逾期高亮提醒，形成“记录 → 复习 → 掌握”的闭环。
- 提交表单支持快速导入：输入 Codeforces 用户名一键拉取最近 AC 记录（列表内可直接打开 AC 提交页复制源码，CF 提交页受反爬保护无法服务端自动抓取）；或粘贴洛谷题号自动补全题名（洛谷提交记录接口需登录态，故采用题号补全的半自动方案）。导入的 CF 英文标签会自动合并为中文标签（如 `graphs` → 图论），并优先填入未填写的空题目位。
- 描述、心得和代码分文件保存，Markdown 或代码内容不会干扰其他字段解析。
- 题目描述填写至少 20 字后，可调用 AI 将题意压缩为一句简短概括；表单强烈建议先概括再提交，以减少题面篇幅，生成结果回填后仍可人工修改。

### 总览与检索

- 展示全队或单个队员的年度训练热力图。
- 汇总近 30 天题数、活跃天数、周均题数、平台和难度分布。
- 首页展示"今日复习队列"：到期待复习题按日期排序，逾期题目高亮提醒。
- 按队员、算法标签和错题状态筛选全部训练记录。
- 训练卡片可展开查看题目描述、心得和代码。
- 题目详情使用 Marked 渲染 GFM Markdown，支持标题、列表、表格、链接和代码块。
- 使用 Prism 提供 C++ 语法高亮，使用 KaTeX 渲染 `$...$` 与 `$$...$$` LaTeX 公式。
- 支持浅色/深色主题和移动端响应式布局。

### 训练分析与错题复盘

- 按队员及自定义日期范围汇总训练数据。
- 提供“今天 / 本周 / 本月”快捷范围；本周按周一至周日计算。
- 单日范围不显示周趋势图，改为提示选择更大的时间范围。
- 统一展示题数、训练天数、参与队员、待复习题数、标签分布和复习进度。
- 团队错题本支持按队员、状态和标签过滤。
- 训练明细支持勾选题目并批量导出。
- 题目详情页展示"全队同题记录"：按平台+题号聚合，同一道题被谁、何时做过、当前复盘状态一目了然，方便二刷对比。
### 导出与分享

- 题目详情页支持导出为 Markdown、PDF（打印友好的 HTML）或 LaTeX 文件。
- 训练分析页支持勾选多道题目，批量导出为 Markdown、PDF 或 LaTeX；Markdown 和 LaTeX 单次最多 500 题，PDF 单次最多 100 题。
- PDF 导出窗口会加载 Prism C++ 语法高亮，并将长代码行自动换行，避免打印或另存为 PDF 时截断。
- LaTeX 导出使用 `ctexart` 文档类，代码段通过 `listings` 宏包高亮，可直接编译。

### 独立页面与分享

- 每名队员拥有个人主页，可查看累计统计、热力图和全部训练题目。
- 每道题拥有可直接访问和分享的独立详情 URL；构建产物已包含题名、题目描述、题解与代码，无需等待 JavaScript 加载即可被搜索引擎读取。
- 构建时生成 `sitemap.xml`、`robots.txt`、canonical、页面摘要和 Schema.org `Article` 结构化数据，帮助搜索引擎发现并正确归一化题目 URL。
- 页面采用标准 URL 路径，并由构建脚本生成 GitHub Pages 可直接访问的静态入口，例如：

```text
/member/廖夏/
/problem/廖夏/2026-07-24/题目永久ID/
```

## 使用方式

1. 打开训练日志页面。
2. 点击右上角“使用 GitHub 登录”。
3. 登录后点击“提交/修改记录”。
4. 选择训练日期，填写一道或多道题目。
5. 点击“提交到 GitHub”。
6. 等待 GitHub Actions 完成部署，页面数据会自动更新，也可以点击刷新按钮。

如果所选日期已有记录，表单会自动加载原内容，可以覆盖更新或删除该日期的全部记录。“训练分析”位于顶部导航中；点击记录中的队员姓名可进入个人主页，点击“查看题目详情”可打开该题的独立页面。

## 整体架构

项目由静态展示、仓库数据、自动构建和认证写入服务四部分组成：

```text
                              公开读取
logs/ 训练源数据 ── npm run generate ──▶ site/data/ 分层 JSON + 静态资源
       ▲                                      │
       │                                      ▼
GitHub Git Data API                    GitHub Pages
       ▲                                      │
       │                                      ▼
Cloudflare Worker ◀──── 受限 API ─────── 浏览器
       │                                      │
       └──────────── GitHub OAuth ────────────┘
```

### 读取流程

1. 构建脚本读取 `logs/` 中所有成员和日期目录。
2. 脚本通过共享 Schema 规范化元数据，并生成热力图和近 30 天汇总。
3. 前端资源与分层 JSON 数据输出到 `site/`；构建时为入口资源和 `data.mjs` 引用的 `renderer.mjs` 添加内容哈希，避免浏览器使用旧模块缓存。
4. GitHub Actions 将 `site/` 发布到 GitHub Pages。
5. 浏览器读取静态数据并在本地完成筛选和统计；首页、成员页与单题页同时带有构建期预渲染内容，搜索引擎不执行 JavaScript 也能读取主要正文和链接。

### 写入流程

1. 浏览器跳转到 Worker 发起 GitHub OAuth。
2. Worker 校验 GitHub 用户是否属于 `MEMBERS` 白名单，并创建 8 小时加密会话。
3. 浏览器通过受限 API 提交某一天的题目数据。
4. Worker 只向当前成员对应的 `logs/<姓名>/YYYY/MM/DD/` 写入文件。
5. 一次新增、更新或删除通过 Git Data API 合并为一个 commit。
6. commit 触发 GitHub Actions，重新生成并发布静态站点。

因此，站点展示的是最近一次成功构建的仓库数据，而不是直接实时读取 GitHub API。提交后通常需要等待约 1 分钟完成部署。

## 数据存储

每个队员使用姓名作为一级目录，日期使用年、月、日三级目录：

```text
logs/
└── 廖夏/
    └── 2026/
        └── 07/
            └── 24/
                ├── meta.json
                ├── 0-desc.md
                ├── 0-takeaway.md
                └── 0-solution.cpp
```

文件含义：

- `meta.json`：题目永久 ID、名称、题号、平台、难度、标签、错题状态，以及该打卡记录的 `updatedAt`（最后更新时间，ISO 格式时间戳）。
- `N-desc.md`：第 N 道题的题目描述。
- `N-takeaway.md`：第 N 道题的心得或题解。
- `N-solution.cpp`：第 N 道题的 C++ 代码。

打卡记录的「最后更新时间」由 `meta.json` 中的 `updatedAt` 保存，统一使用 **UTC+8 时区**（如 `2026-08-11T01:09:44.000+08:00`）：通过站点 API 提交/更新时由后端自动写入；旧记录可用 `npm run backfill:updated-at`（[scripts/backfill-updated-at.js](scripts/backfill-updated-at.js)）从 git 提交历史回填——每次保存都会产生一次 commit，因此 git 提交时间比文件修改时间可靠（文件 mtime 会被 clone/pull 重置）。构建脚本也会在缺失时优先回退到 git 提交时间，并在记录卡片、题目详情页和编辑弹窗中展示（格式如「最后更新 2026.8.10」，始终按 UTC+8 显示）。

描述、心得和代码分别保存，因此其中包含 Markdown 标题、分隔线或代码块时，不会影响其他字段的读取。

### 数据迁移

旧的 `logs/姓名/YYYY-MM-DD/` 目录可以迁移到新结构：

```bash
npm run migrate:date-layout
```

迁移脚本只移动旧日期目录；如果目标目录已经存在，会直接报错并停止，不会覆盖数据。

项目还保留了 [migrate-logs.js](scripts/migrate-logs.js)，用于更早期的单文件 Markdown 格式迁移。

## 提交流程

Worker 收到前端的受限日志请求后会：

1. 使用姓名和日期生成 `logs/姓名/YYYY/MM/DD/` 路径。
2. 为所有要写入的文件创建 Git blob。
3. 创建新的 Git tree。
4. 创建一个 commit。
5. 更新 `main` 分支指针。

因此，一次新增或更新多文件记录只会产生一个 Git commit。目录不需要单独创建，Git tree 会自动建立路径。

构建脚本仍兼容旧日期目录；通过网页新增和编辑的记录统一写入年月日路径。

## 安全认证与自动部署

当前版本不再把 GitHub access token 放进 URL 或 `localStorage`。OAuth code 由 Cloudflare Worker 交换，token 仅保存在加密、`HttpOnly`、`Secure` 会话 Cookie 中；浏览器只调用受限的日志 API。

题目描述旁的“概括”按钮会调用 Worker 的 `POST /api/summarize` 接口。接口使用 Workers AI binding 运行 `@cf/qwen/qwen3-30b-a3b-fp8`，要求模型只输出题目对象、计算或判断目标以及关键约束，不猜测题解。Worker 会清理模型可能附带的思考标签、标题和引号，并限制输入不超过 20,000 字。

Worker 部署前需要配置三个 secret：

```bash
cd workers
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```

`SESSION_SECRET` 建议使用至少 32 字节随机值。GitHub OAuth App 的 callback URL 应设为：

```text
https://algo-oauth.xialiao.org/auth/callback
```

允许登录的 GitHub 用户与日志目录映射维护在 `workers/oauth.mjs` 的 `MEMBERS` 中。前端不再拥有通用 GitHub API 凭据，Worker 只允许已登录用户写入自己的 `logs/<姓名>/YYYY/MM/DD/` 路径。新增队员时，需要在 `MEMBERS` 中加入映射、授予该账号仓库写权限，并让队员接受 Collaborator 邀请。

工作流位于 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)。当 `main` 或 `master` 分支收到 push 后，Actions 会：

1. 使用 Node.js 24 检出仓库。
2. 执行 `npm run check`（语法检查 + 单元测试 + 生成 site）。
3. 生成 `site` 部署目录。
4. 上传 GitHub Pages artifact。
5. 使用 `actions/deploy-pages` 发布网站。

Actions 只负责构建和部署，不执行 `git commit` 或 `git push`，也不会修改训练日志。

### 安全边界

- OAuth authorization code 由 Worker 交换，access token 不返回前端 JavaScript。
- token 仅存放在 AES-GCM 加密且带 `HttpOnly`、`Secure` 属性的会话 Cookie 中。
- OAuth state 使用随机 nonce 和有效期，避免未经校验的回调请求。
- API 校验请求 Origin，只接受配置的线上域名和本地开发来源。
- 登录用户必须存在于 `MEMBERS` 白名单中，并只能写入映射到自己的日志目录。
- AI 概括接口与日志写入接口使用同一套登录会话和成员白名单，未登录用户不能调用模型。
- 日志输入在写入前通过共享 Schema 校验和清洗。
- Markdown 渲染会转义原始 HTML，仅为安全的 HTTP(S)、站内相对路径和锚点生成链接；公式内容也会先转义再交给 KaTeX 渲染。
- Git 分支更新不使用强制覆盖；发生引用冲突时最多自动重试两次。

## 部署配置

### GitHub OAuth App

在 GitHub 的 **Settings → Developer settings → OAuth Apps** 创建 OAuth App：

- Homepage URL：`https://train.xialiao.org`
- Authorization callback URL：`https://algo-oauth.xialiao.org/auth/callback`
- Scope：`public_repo`

### Cloudflare Worker

在 Worker 的 Secrets 中配置：

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET`

AI 概括不需要把模型密钥写入前端或仓库；`workers/wrangler.toml` 中的 `[ai]` 配置会把 Workers AI 暴露为 `env.AI`。如后续改用第三方模型，应通过 Worker Secret 或 AI Gateway BYOK 配置密钥，不得写入 `app.js` 或 Wrangler 配置文件。

对应代码和 Wrangler 配置分别位于：

- [workers/oauth.mjs](workers/oauth.mjs)
- [workers/wrangler.toml](workers/wrangler.toml)

如果迁移到其他域名或仓库，还需要同步修改：

- `workers/oauth.mjs` 中的 `REPO`、`BRANCH`、`MEMBERS` 和 `ORIGINS`。
- `lib/journal-api.js` 中的 `JOURNAL_API_URL`。
- `CNAME`、OAuth Homepage URL 和 callback URL。

### GitHub Pages

仓库设置中选择 **Settings → Pages → Source = GitHub Actions**。

## 本地开发

环境要求：Node.js 24 或更高版本。

```bash
git clone https://github.com/only-matthew/Algo-Training-Journal.git
cd Algo-Training-Journal
npm install

# 语法检查、单元测试并生成 site/
npm run check

# 本地预览
npx serve site
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `npm test` | 运行 Node.js 单元测试。 |
| `npm run generate` | 从 `logs/` 生成完整 `site/`。 |
| `npm run check` | 检查主要脚本语法、运行测试并生成站点。 |
| `node scripts/verify-import-live.mjs` | 本地真实网络集成测试「自动导入」：直接驱动 Worker 全链路（鉴权/CSRF/Origin + 真实请求 Codeforces 与洛谷），无需 GitHub 登录或云端密钥。 |
| `npm run migrate:date-layout` | 将旧日期目录迁移为 `YYYY/MM/DD`。 |

更早期的单文件 Markdown 日志可使用 `node scripts/migrate-logs.js` 迁移。执行迁移前建议创建分支或备份，并在迁移后运行 `npm run check` 和 `git diff --check`。

## 项目结构

```text
.
├── .github/
│   └── workflows/deploy.yml      # GitHub Pages 构建与部署
├── lib/
│   ├── auth.mjs                  # GitHub 登录状态与会话管理
│   ├── constants.mjs             # 日期、平台、状态等共享常量
│   ├── data.mjs                  # 数据加载、缓存与自动刷新
│   ├── form.mjs                  # 日志提交表单与草稿管理
│   ├── journal-api.js            # 浏览器端 Worker API 客户端
│   ├── log-schema.mjs            # 日志校验、清洗和永久 ID 规则
│   ├── problem-detail.mjs        # 题目详情正文共享模板（构建与浏览器共用）
│   ├── render-safety.mjs         # 安全的 Markdown、链接和公式文本渲染
│   ├── renderer.mjs             # UI 渲染、导出与热力图
│   ├── router.mjs               # 客户端路由与历史栈管理
│   └── theme.mjs                # 浅色/深色主题切换
├── logs/                          # 按成员和日期组织的训练源数据
├── scripts/
│   ├── generate-data.js          # 聚合 logs/、计算统计并生成 site/ 与路由入口
│   ├── migrate-date-layout.js    # YYYY-MM-DD → YYYY/MM/DD
│   └── migrate-logs.js           # 旧单文件 Markdown 格式迁移
├── test/
│   ├── aggregation.test.mjs      # 同题聚合与复习队列构建测试
│   ├── generate-seo.test.mjs    # SEO 与构建产物测试
│   ├── journal-api.test.mjs      # 浏览器端 API client 测试
│   ├── log-schema.test.mjs       # Schema、日期、标签、复习日期和稳定 key 测试
│   ├── oauth-import.test.mjs     # Codeforces / 洛谷导入解析测试
│   ├── oauth-plan.test.mjs       # Worker 保存/读取/删除规划与增量写入测试
│   ├── oauth-summary.test.mjs   # AI 概括与 Worker 边界测试
│   ├── render-safety.test.mjs    # Markdown、公式和链接安全测试
│   └── tag-normalize.test.mjs    # 标签规范化与别名测试
├── vendor/                        # 随静态站点发布的 Marked、KaTeX 与 Prism
├── workers/
│   ├── oauth.mjs                 # OAuth、加密会话、受限日志 API 与 AI 概括
│   └── wrangler.toml             # Worker 配置
├── app.js                         # 应用入口：路由、渲染、筛选、表单和主题初始化
├── index.html                     # 单页应用页面结构
├── style.css                      # 组件、主题与响应式样式
├── OPTIMIZATION.md               # 优化清单与完成状态
├── package.json                   # 构建、测试与迁移命令
├── CNAME                          # GitHub Pages 自定义域名
└── site/                           # 构建产物，已被 .gitignore 忽略
```

各模块之间通过明确的数据边界协作：`logs/` 是唯一源数据，`lib/log-schema.mjs` 由前端、Worker 与生成脚本共享，`site/` 只作为可重新生成的部署产物，不应直接维护。

构建后的数据按用途拆分：`site/data/overview.json` 只包含近 30 天题目和首屏统计，`site/data/all.json` 包含全部轻量题目元数据，`site/data/problems/<成员>/<日期>/<题目ID>.json` 保存单题描述、题解和代码。首页不下载正文；分析与错题本按需加载全量元数据；成员页和题目详情页拥有可直接索引的预渲染 HTML，浏览器交互或刷新时仍可从对应 JSON 更新内容。

## 当前边界

- 页面展示使用构建后的 `site/data/` 分层 JSON，不是实时读取 GitHub 仓库。
- 记录提交由 Worker 使用当前队员的 GitHub 授权完成，因此队员仍需拥有仓库写权限。
- OAuth 会话有效期为 8 小时；会话到期后需要重新登录。
- AI 概括依赖 Cloudflare Workers AI 的可用性和账户配额，生成结果应在提交前由使用者检查。
- Worker 会在分支引用冲突时自动重试两次；高并发持续冲突时仍可能需要稍后重试。
- 新增、更新和删除都使用 Git Data API 合并为单个 commit。
- 成员白名单、仓库地址和允许来源目前直接维护在 Worker 源码中。
- 当前代码字段按 C++ 展示，保存文件扩展名固定为 `.cpp`。
