# 交接文档：Algo Training Journal

更新时间：2026-08-28

## 当前状态

项目是一个「Git 仓库保存训练日志 + 静态站点展示 + Cloudflare Worker 写入」的协作式算法训练日志。

本轮仅做了技术与架构整理，**没有改变产品功能、日志格式、Worker API 或部署流程**。

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

- 35 个 JS/MJS 源码文件通过语法检查。
- 186 个测试通过。
- `node scripts/generate-data.js` 成功生成 122 条日志、3 位成员的静态站点。
- `git diff --check` 通过。

测试会重写受忽略的 `site/`，并会更新已跟踪的 `test-output.tex`；后者通常是 `test-latex.mjs` 的正常副作用，提交前请确认其差异是否预期。

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
