# Algo Training Journal

队伍算法训练日志 — 热力图 + 训练统计 + 在线提交。

队员**无需学习 Git**，在页面上用 GitHub 账号登录后即可填写训练记录，自动产生 Git commit。

---

## 队员使用方式

1. 打开 `https://train.xialiao.org`
2. 点击右上角 **「🔐 使用 GitHub 登录」**
3. 登录后点击 **「📝 提交记录」**
4. 填写日期、题目（可添加多道题）→ 点击提交
5. 等待约 1 分钟后刷新页面即可看到更新

---

## 管理员部署指南

### 前置条件

1. 拥有此仓库的管理权限
2. 拥有 Cloudflare 账户（且域名 `train.xialiao.org` 走 Cloudflare）

### 第一步：注册 GitHub OAuth App

1. 打开 [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. 点击 **New OAuth App**
3. 填写：
   - **Application name**: `Algo Training Journal`（任意）
   - **Homepage URL**: `https://train.xialiao.org`
   - **Authorization callback URL**: `https://algo-oauth.YOUR_SUBDOMAIN.workers.dev`
     （先随便填一个，等创建 Worker 后再改）
4. 注册完成后，点击 **Generate a new client secret**
5. 记录 `Client ID` 和 `Client Secret`

### 第二步：部署 Cloudflare Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages → Create → Create Worker**
3. 给 Worker 起个名字（如 `algo-oauth`）
4. 点击 **Edit code**，将 `workers/oauth.js` 的内容粘贴进去
5. 在 Worker 设置 → **Variables and Secrets** 中添加两个 Secret：
   - `GITHUB_CLIENT_ID` = 第一步的 Client ID
   - `GITHUB_CLIENT_SECRET` = 第一步的 Client Secret
6. 点击 **Deploy**
7. 记下 Worker 的 URL（如 `https://algo-oauth.YOUR.workers.dev`）

### 第三步：配置 Worker 路由（可选，用自己的子域名）

1. 在 Cloudflare Dashboard 进入你的域名 → **Workers Routes**
2. 添加路由：`oauth.train.xialiao.org/*` → 指向刚才的 Worker

### 第四步：更新 OAuth App 的回调地址

回到 GitHub OAuth App 设置，将 **Authorization callback URL** 改为 Worker 的真实地址。

### 第五步：修改 `app.js` 中的配置

打开 `app.js`，修改文件开头的两行：

```js
const GITHUB_CLIENT_ID = "___YOUR_GITHUB_CLIENT_ID___";  // 改为真实的 Client ID
const OAUTH_WORKER_URL = "https://algo-oauth.YOUR.workers.dev"; // 改为 Worker URL
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

访问 `http://localhost:3000`，此时 OAuth 不可用（需要 Worker），但可以查看已有的训练记录。

---

## 队员目录管理

队员使用 GitHub 用户名作为目录名（如 `only-matthew`）。首次提交时脚本会自动创建对应目录。

如果队员之前没有 GitHub 账号，可以：
- 直接用命令行方式提交 `logs/队员名/YYYY-MM-DD.md` 文件
- 目录名不需要和 GitHub 用户名一致（命令行方式）

---

## 项目结构

```
├── .github/workflows/deploy.yml  # GitHub Actions 自动部署
├── workers/oauth.js               # Cloudflare Worker（OAuth token 交换）
├── index.html                     # 主页面
├── app.js                         # 前端逻辑（OAuth、提交、渲染）
├── style.css                      # 样式
├── scripts/generate-data.js       # 从 Markdown 生成 data.json
├── logs/                          # 队员训练日志
│   ├── 廖夏/
│   ├── 郭一鸣/
│   └── 王梓豪/
└── site/                          # 构建产物（.gitignore）