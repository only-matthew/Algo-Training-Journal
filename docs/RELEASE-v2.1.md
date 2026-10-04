# v2.1.0 发布前检查与维护交接

检查日期：2026-10-03～04（UTC+8）。本轮已快进同步远端新增记录到 `d97dc9d`，修改保留在本地工作区；没有提交、推送、创建发布标签或部署。未改写 `logs/`、`training/` 或成员配置。浏览器测试不进入日常 Action、未变更 Worker 时跳过 Worker 检查的策略保持不变。

## 本轮修复

| 问题 | 修复与回归 |
| --- | --- |
| 深色首页山水背景出现矩形边缘，手机尤其明显 | 山水层左右与底部同时渐隐；手机取消 22% 左侧截断。保留原图、主题与文案。 |
| 手机活力曲线固定至少 850px，近期数据藏在横向滚动区 | 按容器实际宽度生成坐标轴；ResizeObserver 处理旋转、缩放和隐藏页面重新显示，首尾日期始终可见。 |
| 曲线只能通过 SVG 原生 title 看数据，触屏不便操作 | 悬停按横坐标选择最近训练日；点击固定日期，显示每日与累计活力。支持方向键、Home、End、Escape，提示框保持在图内。 |
| 图表日期仅检查格式，允许 2 月 30 日 | 使用共享的严格日期校验；空数据、单点、非有限数与日期间隔有回归。活力计算公式和源数据未变。 |
| 离线缓存写入没有绑定 Service Worker 事件生命周期 | 用 waitUntil 保留写入；缓存配额失败不影响网络响应；只清理本应用旧缓存；离线且无缓存时返回可读的 503。6 条执行真实模板的回归。 |
| Wrangler 开发依赖链包含 4 个 high 审计条目 | Wrangler 4.114.0 → 4.147.0，更新锁文件，Worker dry-run 打包通过。 |
| 静态 KaTeX 0.16.9 不在 npm 审计范围内 | 更新到 0.18.2，显式关闭 trust 并限制宏展开；锁定 npm 依赖，增加同步命令、许可证、完整字体与逐文件一致性测试。递归宏通过独立子进程超时测试，题面与 PDF 打印增加浏览器回归。 |
| 直接打开题目后首次 PDF 导出可能被弹窗规则阻止 | 在原始点击事件里预留打印窗口，再异步读取题目详情；补充回归验证窗口先于数据请求打开。 |
| 打印页的 C++ 高亮缺少 C 语法依赖，多行公式或高亮失败时跳过数学渲染 | 页面与打印共享 C 语法初始化；高亮加载失败仍继续处理公式，支持只有多行展示公式的文档；打印窗口验证公式、代码 token 与脚本错误。 |
| 版本号与浏览器断言固定为 2.0.1 | package 与 lock 对齐 2.1.0，页脚测试从 package 读取版本。 |
| 同题重做与个人思考重复，长心得被截成摘要又重复展示 | 合并为“思考与重做”，当前记录完整 Markdown 只出现一次；保留日期顺序、完成结果、卡点、更新时间、其他记录链接，以及两个旧锚点。 |
| 输入输出像多行行内代码，正文提前换行 | 源 Markdown 的围栏没有损坏，是新详情区缺少 pre 样式；补齐整块背景、内距与横向溢出处理，移除段落 75ch 限宽。 |
| 代码滚动卡住、下半页右侧大片空白 | 取消代码区 620px 高度限制，纵向随页面滚动；题目描述与元数据保留首行双栏，思考、分析与代码使用整行宽度。 |
| 语法检查逐文件启动 Node；成功 Action 仍刷出模拟故障的 Error | 单进程使用 V8 解析模块／CommonJS，不执行源码；单测统一调度，成功输出统计，完整诊断上传为 unit-test-diagnostics（保留 7 天），真实失败仍打印完整诊断并阻止发布。 |

安全依据：[KaTeX 宏展开限制绕过](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-cvr6-37gx-v8wc)、[KaTeX 继承 trust 配置](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7)、[sharp 上游图像解析漏洞](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)、[undici 缓存指令问题](https://github.com/advisories/GHSA-4cwx-7wf7-3272)。Wrangler 链上的审计条目属于开发工具依赖，不能直接等同于线上 Worker 可被这些路径利用。

## 验收记录

2026-10-04 最终本地验收：

- `npm run verify` 通过：215 个源码文件语法检查、ESLint、训练索引一致性、639 项单测（0 失败、0 跳过）和 200 条日志的静态构建。
- 浏览器回归 31/31 通过（13.8 秒），覆盖首页图表、触屏选择、详情样例、合并心得、代码区域滚轮推动页面、公式与 PDF，以及原有编辑／保存／冲突保护链路。
- 官方 npm registry 审计 0 项漏洞；Worker dry-run 成功（356.35 KiB，gzip 88.66 KiB），没有部署。
- 两组历史失败用例在 `TZ=UTC` 下再次通过，10/10。
- 同机语法检查从 7.04 秒降到 0.31 秒；这是本地该步骤的对比，不是整条 Action 的线上加速承诺。
- Chromium 1440px 迷宫详情：代码可见高度／内容高度由 620/2464px 变为 2464/2464px，代码区域宽度由 881px 变为 1318px；段落取消约 566px 上限。2.2 秒滚动采样前后均未出现 >50ms 主线程长任务，帧间隔 P95 约 16.7ms。修复了可复现的嵌套滚动与布局问题；没有把截图当作 GPU 渲染故障的证据，也没有宣称复现了所有设备上的卡顿。

可重跑：

```sh
npm ci --no-audit --no-fund
npm run verify
npm run test:e2e:ci
npm audit --registry=https://registry.npmjs.org
npx wrangler deploy --dry-run --outdir .build-cache/worker-dryrun --config workers/wrangler.toml
```

浏览器测试保持本地按需执行，不加入日常 Action。测试覆盖真实静态构建与受控 API 响应；保存、删除、冲突等回归不会改写生产仓库。浏览器范围为 Chromium（含触屏模拟），没有宣称实机 iOS、Safari 或 Firefox 已验收。

界面检查覆盖 1440、768、375、320px 的浅色和深色主题。桌面和手机截图保存在 `artifacts/release/`；日志、依赖审计和打包输出保存在 `artifacts/`，均为忽略的可重建产物。设计扫描只有两条既有的知识地图进度条 width 动画提示，本轮没有新增此类问题；为避免扩大修改范围保留原行为。

## Action 日志核对

最近 [发布 run 37135802541](https://github.com/only-matthew/Algo-Training-Journal/actions/runs/37135802541) 成功：验证构建 job 约 27 秒，其中完整检查与构建约 16 秒；Pages 部署 job 约 11 秒。Worker 输入未变化，正确跳过。最近补全难度任务也成功。

成功日志中的 GitHub API 500、非法日期、版本冲突等 Error 是对应失败分支用例主动触发的诊断。未关闭生产 console.error，也没有用 continue-on-error 绕过测试。测试输出完整保留在 `artifacts/unit-tests.log`，CI 上传独立诊断产物；失败时直接展开全部输出。回归验证了“模拟错误可成功、真实失败必须非零退出”。产物保留参数依据 [upload-artifact 官方文档](https://github.com/actions/upload-artifact)。

历史 [run 37028672412](https://github.com/only-matthew/Algo-Training-Journal/actions/runs/37028672412) 确实因复习日期测试的时区输入失败；[run 37018109863](https://github.com/only-matthew/Algo-Training-Journal/actions/runs/37018109863) 因测试硬编码事件月份目录失败。当前基线已修复，这次只复核，没有将历史真失败误归为日志噪声。

语法加速使用 [Node VM 解析 API](https://nodejs.org/docs/latest-v24.x/api/vm.html)：只构造 SourceTextModule 或编译 CommonJS 函数，不链接、不求值。模块解析需要实验开关，仅在检查子进程启用；通过坏语法、顶层 await/return、不存在的 import 与禁止执行副作用等输入，与 node --check 对照验证。

## 线上只读核验

10 月 3 日首次只读核验：首页 HTTP 200，页脚为 `v2.0.1 · 2026-10-03 00:51 UTC+8 · 3376aa9`；Worker capabilities HTTP 200，支持日志 schema 1–8，buildCommit 为 `4a2071b04f8c9421a13062cba5169699735430ef`；匿名 session HTTP 200，返回 null。随后新增训练记录已由成功 Action 发布到 `d97dc9d`，与用户最新截图一致。上述结果**不是 v2.1 已部署的证明**。未使用生产账号执行登录、写入或删除，也未发送 QQ 消息。

## 发布与回退

1. 将本轮代码、测试、依赖锁文件及 vendor 文件一起纳入发布提交；不要提交 site、artifacts、测试报告或本地凭据。
2. 本轮改动 lib 与 package，属于现有 Worker watch paths。推送 main 后，等待 Workers Builds 与 GitHub Pages 都成功；Pages 按既定规则等待相同提交的 Worker。
3. 检查首页页脚为 v2.1.0 和发布提交号，capabilities 的 buildCommit 为该提交且接受 schema 8，匿名 session 返回 null；复核首页、训练档案、复习、提交入口与公式详情。
4. 登录后的真实保存链路仍需在发布后由成员用一条真实训练记录确认，检查保存提示、Git commit 和静态站点更新。不要为验收伪造训练记录。
5. 如需回退，针对本次发布的代码提交执行 revert 并重新发布 Worker 与 Pages；不要 reset 主分支到旧时点，否则可能丢弃期间新增的训练记录。schema 没有升级，不需要数据迁移或反向迁移。

## 三个月维护期

- 停止新增功能不影响日常训练写入和静态发布；现有补全难度任务维持原计划。未创建新的自动化或提醒。
- 仓库源数据是备份基础。保留 Git 远端与历史；不要用旧 site 产物覆盖源日志，也不要清理用户草稿来排查保存失败。
- 发生登录故障先检查 GitHub OAuth、Cloudflare Secret 和成员配置；写入 409 保留草稿并重新加载对照，不能绕过版本检查自动覆盖。
- 导入平台风控、第三方接口或 AI 服务故障时，继续使用手动输入；不依赖题面抓取才能保存训练记录。
- 若收到安全告警或遇到阻断训练的故障，按维护修复处理。npm 审计使用官方 registry（当前本机镜像不提供 audit endpoint）。未来更新 KaTeX 后必须运行 `npm run sync:katex` 并提交对应 vendor 变更，一致性测试会阻止只改依赖不改静态文件。
- 恢复开发时先读 [CURRENT-STATE.md](CURRENT-STATE.md) 和 [HANDOFF.md](HANDOFF.md)，不要重新启用已冻结的 training v2 前端或擅自改变现有 CI 取舍。
