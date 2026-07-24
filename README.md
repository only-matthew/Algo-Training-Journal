# Algo Training Journal

这是我们的 **ICPC 算法训练记录打卡仓库**，用于记录每一次刷题、见证每一步前进。

队员**无需学习 Git**，在页面上用 GitHub 账号登录后即可填写训练记录，自动产生 Git commit。

---

## 队员使用方式

1. 打开 [训练日志页面](https://train.xialiao.org)
2. 点击右上角 **「🔐 使用 GitHub 登录」**
3. 登录后点击 **「📝 提交/修改记录」**
4. 填写日期、题目名称、平台、难度（支持 **洛谷分级** 和 **Codeforces Rating 范围**）、题目描述、收获、代码
5. 点击提交 → 自动写入 GitHub 仓库
6. 数据每 **5 分钟自动刷新**（也可手动点击 🔄 刷新按钮）

> 支持 **代码语法高亮**（Prism.js）和 **LaTeX 数学公式**（KaTeX）
>
> 点击左侧的 🌙/☀️ 按钮可手动切换**浅色/暗色模式**（默认跟随系统）

---

## 存储格式

每条训练记录存储为一个日期目录，题目信息、描述、心得、代码分别存放：

```
logs/廖夏/2026-07-24/
├── meta.json              # 题目元数据（名称、平台、难度）
├── 0-desc.md              # 第 1 题题目描述
├── 0-takeaway.md          # 第 1 题收获/心得（Markdown）
├── 0-solution.cpp         # 第 1 题代码
├── 1-desc.md              # 第 2 题 …
└── ...
```

这样即使描述中包含 `#`、`##`、`---` 等 Markdown 语法（如粘贴 洛谷 原题），也不会与元数据混淆。

---

## 管理员部署指南

### 前置条件

1. 拥有此仓库的管理权限
2. 拥有 Cloudflare 账户（且域名走 Cloudflare）
3. 在 `app.js` 的 `MEMBER_MAP` 中配置队员的 GitHub 用户名 → 真实姓名映射

### 第一步：注册 GitHub OAuth App

1. 打开 [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. 点击 **New OAuth App**
3. 填写：
   - **Application name**: `Algo Training Journal`（任意）
   - **Homepage URL**: `https://train.xialiao.org`
   - **Authorization callback URL**: `https://algo-oauth.YOUR.workers.dev`（先随便填，创建 Worker 后再改）
4. 注册完成后生成 `Client Secret`，记录 `Client ID` 和 `Client Secret`

### 第二步：部署 Cloudflare Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages → Create → Create Worker**
3. 将 `workers/oauth.js` 的内容粘贴进去
4. 在 Worker 设置 → **Variables and Secrets** 中添加两个 Secret：
   - `GITHUB_CLIENT_ID` = 第一步的 Client ID
   - `GITHUB_CLIENT_SECRET` = 第一步的 Client Secret
5. 点击 **Deploy**

### 第三步：配置 Worker 路由

在 Cloudflare Dashboard 进入你的域名 → **Workers Routes**，添加路由指向刚才的 Worker。

### 第四步：更新 OAuth App 回调地址

回到 GitHub OAuth App 设置，将 **Authorization callback URL** 改为 Worker 的真实地址。

### 第五步：修改 `app.js` 中的配置

```js
const GITHUB_CLIENT_ID = "___YOUR_GITHUB_CLIENT_ID___";
const OAUTH_WORKER_URL = "https://algo-oauth.YOUR.workers.dev";
```

### 第六步：启用 GitHub Pages

仓库 Settings → Pages → Source = **GitHub Actions**

---

## 本地开发

```bash
git clone https://github.com/only-matthew/Algo-Training-Journal.git
cd Algo-Training-Journal

# 生成静态站点（需要 Node.js 24+）
npm run generate

# 本地预览
npx serve site
```

---

## 项目结构

```
├── .github/workflows/deploy.yml  # GitHub Actions 自动部署
├── workers/oauth.js               # Cloudflare Worker（OAuth token 交换）
├── index.html                     # 主页面
├── app.js                         # 前端逻辑（OAuth、主题切换、提交、渲染、刷新）
├── style.css                      # 样式（含浅色/暗色模式）
├── scripts/
│   ├── generate-data.js           # 从日志目录生成 site/data.json
│   └── migrate-logs.js            # 旧格式 .md → 新目录格式的一次性迁移脚本
├── logs/                          # 队员训练日志
│   ├── 廖夏/
│   │   ├── 2026-07-24/
│   │   │   ├── meta.json
│   │   │   ├── 0-desc.md
│   │   │   ├── 0-takeaway.md
│   │   │   └── 0-solution.cpp
│   │   └── ...
│   ├── 郭一鸣/
│   └── 王梓豪/
└── site/                          # 构建产物（.gitignore）