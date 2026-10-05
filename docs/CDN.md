# 阿里云 CDN 接入

更新：2026-10-05。`cdn.mirstar.net` 已完成阿里云 CDN、Cloudflare DNS 和 HTTPS 配置并验收。用户确认 `mirstar.net` 已备案，指定仅中国大陆使用阿里云加速，海外 IP 跳转 Cloudflare。发布构建已配置 CDN 资源引用，源码尚未提交／推送，因此线上页面尚未切换。

## 前端接入与测速

发布工作流设置 `CDN_ORIGIN=https://cdn.mirstar.net`。本地 `npm run build` 默认同源；PowerShell 显式 CDN 构建：`$env:CDN_ORIGIN='https://cdn.mirstar.net'; npm run build; Remove-Item Env:CDN_ORIGIN`。取消工作流的环境变量可回退同源模式。

切换范围：首页／成员／标签／地图／独立题目页的 JS（含相对导入的分块）、合并 CSS、背景图，以及运行时 Prism／KaTeX 和打印页依赖；数据 JSON、题目附件和登录／写入 API 保持原站。构建输出保留完整同源文件作为 CDN 回源。页面 meta 提供运行时静态资源域名；CSP 明确允许 CDN 的脚本、样式、字体、图片和连接。背景图预加载与 CSS 使用相同 URL 和请求模式。

Service Worker 仅接管指定 CDN 的 `/assets/`、`/vendor/` 和 `/style.css`，支持缓存 CORS 响应及背景图 opaque 响应，拒绝接管 CDN 数据和任意第三方 URL。切换模式会改变缓存版本；激活时迁移当前哈希资源。厂商固定路径资源仍按整次部署失效浏览器离线缓存；将来更新 Prism／KaTeX 时需刷新 CDN `/vendor/` 缓存，防止边缘保留旧库。

测速命令：`node scripts/compare-cdn.mjs`，默认各 5 次；`CDN_TRIALS` 可改变次数。完整原始结果在本地 `artifacts/cdn-comparison.json`。2026-10-05 17:38 UTC+8，本机大陆网络、无节流、每次全新 Chromium、交替顺序。捕获同一份线上 HTML，固定文档和未登录会话响应，实际请求线上同版本静态资源及原站数据；关闭 Service Worker，浏览器缓存为空，CDN 边缘缓存未主动清除。这是资源域名 A/B，并非已发布新页面的端到端导航测速，也不是全国／海外多节点结果。

| 中位数（各 5 次） | 原站 | CDN |
| --- | ---: | ---: |
| 首次内容绘制 FCP | 360 ms | 392 ms |
| 最大内容绘制 LCP | 376 ms | 396 ms |
| 应用路由就绪 | 654 ms | 679 ms |

10 次均无请求或页面运行错误。CDN 首轮 LCP 为 2624 ms，原站首轮为 1000 ms；后续 CDN 有更快样本，但总体中位数未测出提速（LCP 慢约 5.3%）。不能据此承诺所有地区改善。

`scripts/smoke-cdn.mjs` 在 CDN 构建及本地预览启动后校验新版本：首页、按需标签模块、独立题目公式、字体及 PDF。未发布的新脚本映射本地镜像，PDF 供应商依赖使用真实 CDN，区别于上述测速。浏览器回归仍仅本地运行，未加入 CI。

## 当前配置

| 项目 | 配置 |
| --- | --- |
| 加速域名 | `cdn.mirstar.net` |
| 类型／区域／状态 | `web` / `domestic` / `online` |
| 源站／Host／SNI | `train.xialiao.org`，HTTPS 443 |
| Cloudflare CNAME | `cdn.mirstar.net.w.kunlunaq.com`，DNS only，TTL 60 秒 |
| 国内访问 | 阿里云中国大陆节点返回内容 |
| 海外访问 | EdgeScript 判断 `client_country()!=CN`，302 到 `https://train.xialiao.org` 的相同路径，保留查询参数，响应 `Cache-Control: no-store` |
| HTTPS | Let's Encrypt；证书名称 `cdn-mirstar-20261005`；HTTP 强制跳转 HTTPS，HTTP/2 已启用 |
| 证书到期 | 2027-01-03 16:26:11（UTC+8） |
| 压缩／跨域 | Gzip、Brotli；`Access-Control-Allow-Origin: *`；仅用于公开静态资源，不开启携带凭证的跨域访问 |
| 缓存 | 默认路径 60 秒；`/assets/js/` 内容哈希脚本 31536000 秒；CSS、图片、字体 604800 秒；未配置忽略查询参数 |
| 计费 | 已开通服务的 `PayByTraffic`；未购买负载均衡或新增套餐 |

公开功能配置保存在 [cdn-functions.json](../config/cdn-functions.json)，13 项均已写入。重复调整已有功能时先查询 ConfigId，按功能实例更新，避免重复添加多实例规则。

海外跳转是 HTTP 层跳转，首次请求仍接触阿里云节点；它不是 DNS 地理分流。IP 定位由阿里云判断，地理定位可能受代理／运营商 NAT 影响。`Scope=domestic` 是节点覆盖范围，不能单独替代海外跳转规则。

## 验收证据

- Cloudflare API 读取确认 CNAME 指向正确且 `proxied=false`；域名验证 TXT 已写入，阿里云 VerifyDomainOwner 成功。
- DescribeCdnDomainDetail 返回 `online`、`domestic`、证书开启。回源 Host/SNI、海外规则、压缩、缓存与 HTTPS 功能状态成功。
- 国内 HTTPS CSS、背景图、发布中的 `assets/js/app-56RMWGYW.js` 和 KaTeX 字体均返回 200，MIME 和跨域响应头正确；第二次 CSS／背景图访问返回 `X-Cache: HIT TCP_MEM_HIT`。脚本边缘 TTL 为 31536000，字体边缘 TTL 约 604800。边缘 TTL 不等于浏览器 Cache-Control 时长。
- 国内 HTTP 返回 301 到同域名 HTTPS，保留 `v` 参数。
- 临时 Cloudflare Worker 从边缘发起真实请求，返回 302，Location 为 `https://train.xialiao.org/style.css?v=overseas-probe-20261005`，Cache-Control 为 `no-store`，跨域响应头为 `*`。探测 Worker 已删除，无残留探测服务。
- HTTPS 正常验证证书，未跳过证书校验；DNS 证书挑战记录在签发后已清理。

## CLI 与证书维护

阿里云 CLI 3.5.1 使用 OAuth 登录，程序为 `C:/Users/onlym/AppData/Local/AliyunCLI/aliyun.exe`。该登录配置没有默认地域，CDN API 显式指定 `--region cn-hangzhou`。Cloudflare 后续 DNS 操作已改用 REST API / CLI；Wrangler OAuth 不具有 DNS 权限。

本轮 DNS 令牌仅允许编辑 `mirstar.net`，到期为 2026-10-07 07:59:59（UTC+8）。本地副本通过 Windows DPAPI 加密保存在 `%LOCALAPPDATA%/AlgoJournalCdn/cloudflare-token.dpapi`。证书私钥、ACME 账户密钥与维护工具位于同目录，目录 ACL 限于当前用户与 SYSTEM；不在仓库中保存凭证或私钥。

证书签发工具为本机 `issue-certificate.cjs`，使用该目录 runtime 中的 acme-client 和 DNS-01 验证。未配置自动续期。续期前需要有效 DNS 令牌，签发后通过 SetCdnDomainSSLCertificate 上传新的完整证书链和私钥，再核对 HTTPS；临时令牌过期后不能直接自动续期。应在证书到期前完成续期，或另行配置具有受限长期权限的自动续期方案。

站点资源接入时需同时调整静态资源地址、CSP 的脚本／样式／图片／字体允许来源，以及离线缓存行为；Worker 登录和写入接口保持原站点 Origin。不能直接把整个站点域名替换为 CDN 域名后假定登录写入可用。

参考：[阿里云添加域名 API](https://www.alibabacloud.com/help/en/cdn/developer-reference/api-cdn-2018-05-10-addcdndomain)、[域名功能参数](https://help.aliyun.com/en/cdn/developer-reference/parameters-for-configuring-features-for-domain-names)、[EdgeScript 重定向](https://www.alibabacloud.com/help/en/cdn/user-guide/request-processing-functions)。
