# Lighthouse 优化记录（2026-09-10）

用户提供的线上报告：性能 86、无障碍 100、最佳实践 96、SEO 100，LCP 2.4 秒。

## 已完成

- 将山水背景从 PNG 转为 WebP，保留 2172×724 分辨率。文件从 1,687,129 字节降至 66,798 字节，减少 96.0%。原 PNG 保留为源素材，页面改为加载 WebP。
- 在 HTML 中高优先级预加载背景图；构建时让预加载与 CSS 引用使用同一内容哈希 URL。浏览器检查确认图片只请求一次，优先级为 High。
- 构建时按原有顺序合并 `style.css`、`assets/final.css`、`assets/details.css`，再用 esbuild 压缩。页面的同步样式请求从 3 个降到 1 个，合并后的内容决定缓存版本。源文件继续分开维护。
- 压缩浏览器 JS 模块。第二轮进一步改为带内容哈希的 ES 模块打包，保留动态导入，详见下文。构建使用仓库原已间接依赖的 esbuild 0.28.1，并将其声明为直接开发依赖。
- 访客不再空闲预加载提交表单及其依赖；队员登录后仍可预加载，预加载失败可在下次打开时重试。
- Worker 的 `GET /api/session` 对匿名、失效和过期会话返回 `200 null`，并对所有会话查询设置 `Cache-Control: no-store`。前端将匿名结果归一为 null，同时清理旧 CSRF token。受保护的数据接口仍要求身份认证，写入继续校验 CSRF。

图片发现和优先级处理参考 [web.dev 的 LCP 优化说明](https://web.dev/articles/optimize-lcp)，构建压缩使用 [esbuild 的 minify API](https://esbuild.github.io/api/#minify)。

## 本地验证

同一台机器、同一静态预览服务器、Lighthouse 桌面预设进行前后各一次冷加载检查：

| 指标 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 性能 | 82 | 98 |
| FCP | 0.8 秒 | 0.7 秒 |
| LCP | 2.2 秒 | 0.8 秒 |
| TBT | 180 毫秒 | 90 毫秒 |
| CLS | 0 | 0 |
| 页面传输量 | 2,240 KiB | 519 KiB |
| 无障碍 / SEO | 100 / 100 | 100 / 100 |

CSS 未压缩体积从 116,305 字节降到 99,589 字节；gzip 后由三份共 24,978 字节降到一份 18,577 字节（约减少 25.6%）。

`npm run verify` 完成语法检查、训练索引校验、267 项测试及站点构建。额外浏览器检查覆盖 1440px/390px 的首页、档案、复习、知识地图、标签和成员页，以及题目详情和深色模式；12 组页面检查无横向溢出、无未捕获脚本异常。会话浏览器检查使用本地 Worker 真实处理函数的匿名响应，验证访客状态、表单不预加载、背景只下载一次及主题切换。

本地报告位于 `artifacts/lighthouse-before.report.html` 和 `artifacts/lighthouse-after.report.html`，JSON 同目录。功能检查结果位于 `artifacts/lighthouse-ui-check.json`、`artifacts/lighthouse-session-check.json`，完整检查日志为 `artifacts/lighthouse-verify.log`。

## 发布边界与剩余项

- 尚未发布站点或 Worker。前端随 GitHub Pages 构建发布，会话接口修复需要另行部署 OAuth Worker。
- 本地 Lighthouse 仍访问尚未更新的线上 OAuth 服务；127.0.0.1 不在该服务的允许来源中，预览服务器也没有 favicon.ico，因此本地最佳实践仍为 96。会话修复由接口测试和浏览器检查独立验证，不能将其记为线上已消除的错误。
- 本地预览没有生产 CDN 的压缩和缓存响应头，分数存在环境与单次运行波动，不能把本地分数当成线上结果。发布后需按原报告配置复测。
- HTTP 缓存时间由 GitHub Pages / 前置 CDN 控制，此次没有修改线上缓存规则。不要对 HTML、数据 JSON 或会话接口统一设置长期缓存。报告中的剩余共享 CSS/JS、模块依赖链和未归因重排尚未全部消除；没有按单页覆盖率盲删其他页面需要的样式或功能。

## 第二轮：模块打包与依赖缓存

用户要求离开后持续构建优化，本线程已建立每小时接续的自动任务（automation-2）。目前仍仅修改本地代码和验证，不推送或部署。

新增 `scripts/build-browser.js`，使用 esbuild 的 ES 模块拆包、未使用代码消除及 UTF-8 输出。生产脚本现在位于 `assets/js/app-<hash>.js` 与 `assets/js/chunks/`，不再逐一复制 `lib/*.mjs`。入口文件名包含依赖内容的影响，解决仅对模块自身源码取哈希时，父模块可能继续引用旧依赖版本的问题。构建只对静态依赖插入 modulepreload，表单动态入口不预加载给访客。

| 桌面指标 | 第一轮后 | 第二轮后 |
| --- | ---: | ---: |
| 性能评分 | 98 | 99 |
| LCP | 0.8 秒 | 0.7 秒 |
| TBT | 90 毫秒 | 30 毫秒 |
| 页面传输量 | 519 KiB | 497 KiB |
| 启动脚本请求数 | 20 | 2 |
| 启动脚本资源体积 | 148,348 字节 | 129,061 字节 |

以上仍为本地同一预览服务器的单次桌面预设检查，不能替代发布后的线上指标。报告为 `artifacts/lighthouse-bundle-desktop.report.html` / `.json`。

全量验证增加到 270 项测试。新增测试确认：重复构建的文件名稳定；静态依赖和动态依赖变化均更新入口版本；延迟加载模块与主入口共享状态；动态表单不进入静态预加载清单。浏览器额外验证了真实 Worker 处理函数签发的测试会话能够驱动延迟表单，预填正确的 Codeforces 用户名，打开关闭表单且没有任何写入请求。SPA 深层跳转与 Markdown 下载通过，桌面/手机 12 组页面检查无横向溢出及未捕获异常。

验证文件：`artifacts/lighthouse-bundle-verify.log`、`artifacts/lighthouse-bundle-ui-check.json`、`artifacts/lighthouse-bundle-details-check.json`、`artifacts/lighthouse-session-check.json`。

后续接续优先检查移动端报告，确认是否值得继续拆分首页暂不需要的 Markdown、题目正文或路线模板；若改成异步加载，需要同时验证路由竞争、导出窗口的用户手势及登录状态共享，不能只看文件体积。部署和 CDN 配置仍待用户明确要求。

移动端本地默认预设补测：性能 86、无障碍 100、SEO 100；FCP 2.8 秒、LCP 3.4 秒、TBT 60 毫秒、CLS 0.001。报告为 `artifacts/lighthouse-bundle-mobile.report.html` / `.json`。其渲染阻塞样式估算 450 毫秒，未使用 CSS 69 KiB、未使用 JS 79 KiB；该预览服务器不做 gzip，因此这里的传输体积和节省估算高于生产压缩后的实际值。

## 第三轮：把 Markdown 与题目模板移出首页静态图

首页卡片只需要轻量 HTML 转义和题目链接，却会通过共享模板间接带入 Marked Markdown 解析器。已将转义、题目链接和更新时间拆到 `escape-html.mjs` / `problem-links.mjs`；完整题目模板、Marked 和路线详情模板只在对应页面或操作需要时加载。PDF 打印改为在用户点击时先保留弹窗，再异步加载 Markdown，避免浏览器拦截弹窗；打印失败和用户关闭弹窗也有回归覆盖。

| 指标 | 第二轮后 | 第三轮后 |
| --- | ---: | ---: |
| 桌面性能评分 | 99 | 100 |
| FCP | 0.7 秒 | 0.5 秒 |
| LCP | 0.7 秒 | 0.7 秒 |
| TBT | 30 毫秒 | 0 毫秒 |
| 页面传输量 | 497 KiB | 453 KiB |
| 移动性能评分 | 86 | 88 |
| 移动 FCP / LCP | 2.8 / 3.4 秒 | 2.6 / 3.2 秒 |

第三轮报告为 `artifacts/lighthouse-lazy-desktop.report.html` / `.json` 和 `artifacts/lighthouse-lazy-mobile.report.html` / `.json`。浏览器检查为 `artifacts/lighthouse-lazy-ui-check.json`、`artifacts/lighthouse-lazy-details-check.json` 和更新后的 `artifacts/lighthouse-session-check.json`。所有已加载的功能路径仍通过，首页初始依赖图不包含 `vendor/marked` 或 `lib/problem-detail.mjs`，这些代码仍保留在延迟模块中。

目前最有价值的剩余工作是发布到真实 CDN 后复测移动端，因为本地预览服务器没有生产压缩和缓存响应头。继续删除共享 CSS 或重排 HTML 的收益已经较小，且更容易影响详情页与路线页；下一轮接续会先检查真实部署配置是否能提供长期缓存给内容哈希资源，再决定是否继续改动。

## 第四轮：减少首页静态首屏布局

移动端报告进一步显示，首页构建产物在脚本接管前包含了近 30 天的全部训练卡片；运行时分页实际上只展示前 4 张，导致浏览器先为多余卡片做 HTML 解析、样式计算和布局，再立即清空并重绘。构建阶段现在只预渲染前 4 张，并保留总记录数提示，后续记录继续由现有 overview JSON 和“加载更多”机制提供。

本地预览服务器同时增加 gzip 协商，用于让 Lighthouse 的传输量更接近线上静态托管。该设置只影响本地验证工具，线上压缩仍由 GitHub Pages / CDN 提供。

| 指标 | 第三轮后 | 第四轮后（gzip 预览） |
| --- | ---: | ---: |
| 桌面性能评分 | 100 | 100 |
| 桌面 FCP / LCP | 0.5 / 0.7 秒 | 0.31 / 0.41 秒 |
| 移动性能评分 | 88 | 97 |
| 移动 FCP / LCP | 2.6 / 3.2 秒 | 1.97 / 1.97 秒 |
| 移动 TBT | 10 毫秒 | 29 毫秒 |
| 页面传输量 | 453 KiB（未压缩预览） | 133 KiB（gzip 预览） |

首页生成后的 HTML 从约 174 KB 降到约 45 KB，静态首屏卡片固定为 4 张。`npm test` 的 270 项测试、语法检查、桌面/移动端 12 组页面检查、题目详情与 Markdown 导出检查均通过；首页分页结果为 4 张卡片，未发现横向溢出或未捕获脚本异常。报告与检查文件为 `artifacts/lighthouse-home-paged-desktop.report.json`、`artifacts/lighthouse-home-paged-mobile.report.json`、`artifacts/lighthouse-home-paged-ui-check.json` 和 `artifacts/lighthouse-home-paged-details-check.json`。

## 第五轮：修正成员页移动端布局

移动端成员页的旧响应式规则把面包屑强制设为纵向排列，导致“首页 / 成员 / 队员”占据多行并把个人英雄区推到首屏下方。现在成员页面包屑在手机上保持单行横向滚动，过长的队员名称使用省略号；账户菜单限制在视口内，避免窄屏横向溢出。390px 成员页截图复查通过，英雄区、统计卡片、内容标签和底部导航的顺序恢复正常，页面无横向溢出或脚本异常。

## 第六轮：重做个人主页趋势图

按个人主页设计图调整训练趋势模块：趋势图改为自适应周柱状图，补充横向网格线、纵轴刻度、柱顶数值、日期标签和训练汇总；个人页统计范围固定为最新训练日向前 30 天，避免用“第 30 条记录”近似时间范围。桌面卡片完整展示，手机在 6 周以内压缩到卡片宽度，较长范围才启用图表内部横向滚动。

桌面和 390px 手机页面均通过回归检查，柱状图数据、统计卡片、最近记录、难度分布与平台分布保持正常，页面无横向溢出。实现位于 `lib/renderer.mjs` 和 `assets/final.css`。
