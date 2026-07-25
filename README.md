# Algo Training Journal

这是一个面向 ICPC 队伍的算法训练日志网站。队员不需要学习 Git，可以直接使用 GitHub 账号登录、填写训练记录和查看队伍统计。

线上地址：[https://train.xialiao.org](https://train.xialiao.org)

## 功能概览

- GitHub OAuth 登录，并限制为队伍白名单成员。
- 提交、修改和删除每日训练记录。
- 记录题目名称、平台、难度、题目描述、心得和 C++ 代码。
- 总览页面：训练记录、队员筛选、年度热力图、近 30 天统计。
- 训练分析页面：按队员查看某日、某月或自定义时间段的做题情况。
- 每名队员拥有独立主页，可查看累计统计、热力图和全部训练题目。
- 每道题拥有可直接访问和分享的独立详情 URL。
- Markdown 标题、代码块、C++ 语法高亮和 LaTeX 公式渲染。
- 记录内容分区显示，题目描述、心得和代码之间只在相邻内容存在时显示分割线。

## 使用方式

1. 打开训练日志页面。
2. 点击右上角“使用 GitHub 登录”。
3. 登录后点击“提交/修改记录”。
4. 选择训练日期，填写一道或多道题目。
5. 点击“提交到 GitHub”。
6. 等待 GitHub Actions 完成部署，页面数据会自动更新，也可以点击刷新按钮。

“训练分析”位于页面顶部导航中。选择队员和时间范围后，可以查看该范围内的题数、训练天数、涉及队员和具体题目明细。

点击训练记录中的队员姓名可进入个人主页；点击“查看题目详情”可进入该题的独立页面。页面采用兼容 GitHub Pages 的 hash URL，例如：

```text
#member/廖夏
#problem/廖夏/2026-07-24/0
```

## 整体架构

项目的展示层是静态站点，认证和受限写入由 Cloudflare Worker 提供：

```text
logs/姓名/年/月/日/
        │
        │ npm run generate
        ▼
site/data.json + site/index.html + site/app.js + site/style.css
        │
        │ GitHub Pages
        ▼
训练日志网站
```

登录和写入流程与静态展示分开：

```text
浏览器 → Cloudflare Worker → GitHub OAuth
浏览器 → Worker 受限 API → GitHub Git Data API
GitHub push → Actions 构建 → GitHub Pages 部署
```

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

- `meta.json`：题目名称、平台和难度。
- `N-desc.md`：第 N 道题的题目描述。
- `N-takeaway.md`：第 N 道题的心得或题解。
- `N-solution.cpp`：第 N 道题的 C++ 代码。

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

## 安全认证与 Worker 部署

当前版本不再把 GitHub access token 放进 URL 或 `localStorage`。OAuth code 由 Cloudflare Worker 交换，token 仅保存在加密、`HttpOnly`、`Secure` 会话 Cookie 中；浏览器只调用受限的日志 API。

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

允许登录的 GitHub 用户与日志目录映射维护在 `workers/oauth.js` 的 `MEMBERS` 中。前端不再拥有通用 GitHub API 凭据，Worker 只允许已登录用户写入自己的 `logs/<姓名>/YYYY/MM/DD/` 路径。

工作流位于 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)。当 `main` 或 `master` 分支收到 push 后，Actions 会：

1. 使用 Node.js 24 检出仓库。
2. 执行 `npm run generate`。
3. 生成 `site` 部署目录。
4. 上传 GitHub Pages artifact。
5. 使用 `actions/deploy-pages` 发布网站。

Actions 只负责构建和部署，不执行 `git commit` 或 `git push`，也不会修改训练日志。

## OAuth 配置

OAuth 交换由 [workers/oauth.js](workers/oauth.js) 完成。Worker 使用 GitHub OAuth App 的 client secret 将授权码换成 access token，并将 token 封装在 AES-GCM 加密的 `HttpOnly` 会话 Cookie 中；token 不会返回给前端 JavaScript。

GitHub 用户名和日志姓名映射位于 [workers/oauth.js](workers/oauth.js) 的 `MEMBERS`：

```js
const MEMBERS = {
  "only-matthew": "廖夏",
  "wzzzzhhhhh": "王梓豪",
  "seanist-isx": "郭一鸣",
};
```

新增队员需要同时完成：

1. 在 `MEMBERS` 中加入映射。
2. 为该账号授予仓库写权限。
3. 让队员接受 GitHub Collaborator 邀请。

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

对应代码和 Wrangler 配置分别位于：

- [workers/oauth.js](workers/oauth.js)
- [workers/wrangler.toml](workers/wrangler.toml)

### GitHub Pages

仓库设置中选择 **Settings → Pages → Source = GitHub Actions**。

## 本地开发

环境要求：Node.js 24 或更高版本。

```bash
git clone https://github.com/only-matthew/Algo-Training-Journal.git
cd Algo-Training-Journal

# 生成 site/ 和 site/data.json
npm run generate

# 本地预览
npx serve site
```

目录迁移命令：

```bash
npm run migrate:date-layout
```

## 项目结构

```text
├── .github/workflows/deploy.yml  # GitHub Pages 构建与部署
├── index.html                    # 总览和训练分析页面结构
├── app.js                        # 页面交互、提交表单、渲染和刷新逻辑
├── lib/                          # Schema 与 Worker API 客户端
├── style.css                     # 页面、表单、记录和分析视图样式
├── scripts/
│   ├── generate-data.js           # logs/ → site/data.json
│   ├── migrate-date-layout.js     # YYYY-MM-DD → YYYY/MM/DD
│   └── migrate-logs.js            # 旧单文件 Markdown 格式迁移
├── workers/
│   ├── oauth.js                   # OAuth、加密会话与受限日志 API
│   └── wrangler.toml              # Worker 配置
├── logs/                          # 训练日志源数据
└── site/                          # 构建产物，已被 .gitignore 忽略
```

## 当前边界

- 页面展示使用构建后的 `site/data.json`，不是实时读取 GitHub 仓库。
- 记录提交由 Worker 使用当前队员的 GitHub 授权完成，因此队员仍需拥有仓库写权限。
- OAuth 会话有效期为 8 小时；会话到期后需要重新登录。
- Worker 会在分支引用冲突时自动重试两次；高并发持续冲突时仍可能需要稍后重试。
- 新增、更新和删除都使用 Git Data API 合并为单个 commit。
