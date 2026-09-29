# 技术问题审计：Algo Training Journal

审计日期：2026-09-28。审计快照：`HEAD = 466163f`（`docs: sync the Worker input set to the six paths now in effect`），工作区干净，`main` 与 `origin/main` 同步。

上一版签收（改写后的 22 项状态表）原文已归档到 [2026-09-28-signoff/PROBLEM-AUDIT.md](archive/2026-09-28-signoff/PROBLEM-AUDIT.md)；改写前的 487 行完整问题清单（含 2026-09-26 首次签收与 R1–R4 收口）仍在 [2026-09-28-pre-rewrite/PROBLEM-AUDIT.md](archive/2026-09-28-pre-rewrite/PROBLEM-AUDIT.md)。

## 方法与状态用语

本轮为「探索 + 审计」，只读仓库源码，**未修改任何生产代码**；复现脚本全部写在系统临时目录，不进入仓库。

| 用语 | 含义 |
| --- | --- |
| **已实证** | 在本机执行过可复现脚本或真实命令，结论有运行输出支撑 |
| **已核对** | 逐行读源码确认，读代码即可判定，无需运行 |
| **待核** | 读代码指向该结论，但未运行验证；或依赖无法在当前环境确认的外部条件 |
| **已驳回** | 审计过程中出现过、但被本机实证否定的结论（保留在此，以免后人重提） |

方法分两层：四个子代理分块静态审计（构建链路、脚本与 curriculum、测试诚实性、渲染安全），随后由主审计对**每一条高严重度结论**做本机复现。子代理结论中**有两条被实证驳回、一条由其自行撤回**，已列入第 4 节——静态分析结论不直接进台账。

## 1. 本轮验证基线

| 项目 | 结果 |
| --- | --- |
| `npm test` | **469 + 77 = 546 项通过，0 失败，0 跳过** |
| `npm run verify` | 通过（语法 + ESLint + 训练索引校验 + 546 单测 + 站点构建） |
| 站点构建 | 成功：3 名成员、196 条日志（196 复用 / 378 重建） |
| LaTeX 编译测试 | 本机装了 TeX Live 2026（`C:\Data\texlive`），三条真实编译用例**在本机真的编译**（17.2 s / 20.4 s / 1.3 s） |
| 生产 CI 对照 | 同一提交 `466163f` 的 `Deploy Training Journal` **success**；其中 `Check and generate site` 步骤只用了 **19 秒** |

最后一行是本轮新得到的硬证据：那 19 秒**装不下**本机单条 LaTeX 编译用例（17–20 秒），因此生产 runner 上没有 TeX 引擎，这三条用例在生产 CI 中被静默跳过（见 5.2）。

## 2. 安全问题

### 2.1 题面图片抓取可被引导到任意地址（SSRF）

- **状态**：已实证，未修复
- **位置**：`workers/services/problem-statement.mjs:233`（图片下载）、`:50` `safeUrl`、`:66-70` `safeImageUrl`；入口 `workers/oauth.mjs:203-231`，其中 `:218-220` 是「小书签回传页面源码」分支
- **结论**：图片下载用 `redirect: "follow"`，且 `safeImageUrl` 只要求「https + 主机名非空」，**没有主机白名单，也不校验重定向落点**。已登录成员回传一段 HTML，即可让 Worker 向任意地址发起请求；响应字节还会写进响应体的 `images[].data` 返回给调用方，因此这是一个可读内网服务的代理。客户端回传 HTML 那条路径连页面 URL 校验都不经过。
- **复现**：真实本地 HTTP 服务端发出 302，仅把攻击者域名接到本地（`ssrf-image-real.mjs`）：

  ```text
  server hits    : ["attacker GET /collect.png","internal GET /metadata"]
  archived images: [{"file":"statement-...png","bytes":12}]
  ```

- **为什么测试没拦住**：`test/oauth-problem-statement.test.mjs:194`、`:207` 在客户端回传路径上断言 `fetchImpl.calls.length === 0`（"客户端路径不应访问任何上游"），但夹具 `CF_HTML`(`:20`)、`ATCODER_HTML`(`:27`) **本身不含 `<img>`**，所以断言恒真，对抓取逻辑的任何改动都免疫。
- **最小修法**：图片主机白名单（洛谷 / Codeforces / AtCoder 图床）+ `redirect: "manual"` 逐跳复核主机。不建议直接 `redirect: "error"`：洛谷 CDN 存在跳转，会牺牲正常抓取。

### 2.2 `/api/qq-bot` 验签可被整体跳过，任意人可驱动机器人发群消息

- **状态**：已实证，未修复
- **位置**：`workers/qq-bot.mjs:155-162`
- **结论**：签名校验被放在「请求自带签名头」的条件里：

  ```js
  if (sigHex || timestamp) { /* 校验失败即 403 */ }
  ```

  **两个头都不带 = 完全不校验**，请求继续进入 `op: 0` 事件分支，`ctx.waitUntil` 在后台执行 `processGroupAtMessage`，用 Worker 持有的机器人凭证换取 `access_token` 并调用发消息接口。攻击者可自选 `group_openid`，因此能用机器人身份往任意群发消息，并借 `AI <问题>` 把机器人 LLM 密钥的额度当免费代理。
- **复现**（未签名请求；仅 mock 出网、不 mock 验签。脚本 `qq-unsigned-poc.mjs`）：

  ```text
  response status : 200   ack : {"op":12,"d":{"id":"attacker-1"}}
    -> https://bots.qq.com/app/getAppAccessToken | body={"appId":...,"clientSecret":...}
    -> https://api.sgroup.qq.com/v2/groups/ATTACKER_CHOSEN_GROUP/messages
       body={"msg_type":0,"content":"✅ 今日复习队列…","msg_id":"msg-1"}
  SENT GROUP MSG  : true
  ```

- **为什么测试没拦住**：`test/qq-webhook.test.mjs` 只覆盖「带错误签名 → 403」，**没有任何一条用例不带签名头**，该分支从未被执行。
- **最小修法**：`QQ_BOT_SECRET` 已配置时必须强制验签，缺失签名头一律 403。
- **附注**（已核对，单独看无危害）：`/api/session` 会把 `csrfToken` 返回给任何匿名访客（`workers/oauth.mjs:290`）。它与本节叠加会放大影响，但 CSRF 校验依赖 Origin 检查，未发现可直接利用的越权路径。

### 2.3 OAuth 握手零测试覆盖

- **状态**：已核对
- **位置**：全仓 grep 无 `auth/login`、`auth/callback`、`OAUTH_COOKIE`、`api/logout` 的测试引用；测试一律用 `seal()` 直接伪造会话 cookie（如 `test/journal-api.test.mjs:10,32`）
- **结论**：`workers/oauth.mjs:120-157` 的握手完全无覆盖——`state.nonce ↔ cookie` 绑定（`:135`）、非成员 403（`:141`）、`safeReturnTo` 防跳转（`:54`）、`OAUTH_COOKIE` 只设 600 秒且从不清除（`:131`，state 在 10 分钟内可重放）。其中任何一处被改坏都能静默上线。
- **建议用例**：缺失 / 不匹配 / 过期 state、站外 `returnTo`、白名单外用户、同一 state 二次使用。

### 2.4 成员与目录绑定、跨成员隔离无测试

- **状态**：已核对
- **位置**：`workers/oauth.mjs:104-119`（要求 `member.logDirectory === data.member`）、`test/member-config.test.mjs:14`（只断言 `assert.ok(member.logDirectory)`）
- **结论**：没有测试构造 `member` 与 `config/members.json` 不一致的会话，也没有测试让成员 A 读写成员 B 的日期路径。配置写错一个目录名，或会话逻辑被改坏，可以让 A 的日志写进 B 的 `logs/…`，而全套测试依旧全绿。
- **建议用例**：seal 一个 `member` 与配置不一致的会话并断言 401；成员 A 用 B 的日期路径做 PUT/GET/PATCH，断言不会落到 B 的目录。

## 3. 数据正确性

### 3.1 同日两套日期目录并存时，记录被静默丢弃且无任何警告

- **状态**：已实证
- **位置**：`scripts/generate-data.js:191-197`（去重键）对比 `:115`（读取文件用的槽位）
- **结论**：去重键是 `${member}|${date}|${problemIndex}`，即**数组序号**；而读取 `N-desc.md` / `N-solution.cpp` 用的是 `fileIndex`。两套口径不一致，一旦同一天同时存在 `logs/<成员>/YYYY/MM/DD/` 与 `logs/<成员>/YYYY-MM-DD/`，其中一份会被整份丢掉，且不报错、不告警（构建期只是少一条记录）。代码本身同时支持这两种目录布局，所以这是真实可达的状态。
- **复现**（`readlogs-dedupe-poc.mjs`，跑完自动清理；提取生产源码的 `readLogs()` 对真实 `logs/` 运行）：

  ```text
  baseline logs       : 196
  logs after duplicate: 196
  VERDICT: 两个目录中的一个被静默丢弃（无警告、无报错）
  ```

- **最小修法**：槽位与去重键统一到同一来源（优先 `fileIndex`，缺失时回退序号），并在两套目录并存时告警。

### 3.2 构建原地改写 `site/`，且构建状态最后才落盘

- **状态**：已核对
- **位置**：`scripts/generate-data.js:1398-1443`
- **结论**：没有暂存目录，`site/` 被逐步原地覆盖，而 `.build-cache/site-state.json` 直到最后才写。中途抛错（例如 `:840-843` 缺附件直接 throw）会留下新旧混合的产物树，而状态文件仍描述上一次成功构建，下一次增量构建会信任已经对不上的哈希。
- **待核**：线上访客是否真能观察到这个中间态，取决于 Pages 产物上传与 CDN 时序，未确认。
- **修法方向**：先构建到 `site.next/` 再整体替换，或至少先写状态并标记 `inProgress`。

### 3.3 `curriculum/` 的 `--force` 无差异检查、无备份

- **状态**：已核对
- **位置**：`scripts/convert-curriculum.js:1568-1574`（覆盖判定）、`:1604-1607`
- **结论**：`--force` 会用 `know-tree/` 与 sidecar JSON 重新生成全部 39 个节点文件与 `roadmap.json`，没有 diff、备份或合并。而 `README.md:100` 明确把「或直接编辑 `curriculum/*.json`」写成可选工作流——两条指引互相冲突，按 README 手改过的内容会在下一次 `--force` 静默丢失。
- **修法方向**：磁盘内容与生成结果不一致时拒绝覆盖（除非另给显式开关），或先写 `*.new` 要求人工提升。

### 3.4 `--all` 被文档承诺但未实现；`--count` 缺值会静默空跑

- **状态**：已实证
- **位置**：`scripts/fetch-codeforces.js:7-10`（用法注释）、`:23`（唯一的 argv 处理）
- **结论**：全文没有 `--all` 的任何处理，实测 `--all` 只按默认每节点取 8 道；`--count` 后面没有值时 `COUNT` 变 `NaN` → `slice(0, NaN)` 为空，脚本打印「生成补充 0 个节点共 0 道题」，紧接着仍打印「已写入 …（含既有精选）」这种误导性的成功信息。
- **说明**：正确写法是 `--count 12`；默认无参路径**没有**问题（见 4.1）。
- **修法方向**：`indexOf` 判断后显式解析并校验整数；要么实现 `--all`，要么从用法注释里删掉。

### 3.5 其它已核对、严重度较低的数据风险

| 项 | 位置 | 说明 |
| --- | --- | --- |
| 分片加载无降级 | `lib/data.mjs:48-57`、`:65-76` | 用 `Promise.all` 加载分片，任一分片 404 会让整个路由失败，同时页面下半部仍留着上一次预渲染的卡片，形成混合状态。 |
| Service Worker 缓存无上限 | `scripts/generate-data.js:378-430` | 按完整请求 URL 缓存，而刷新路径带 `?v=Date.now()`；长时间开着的标签页每次刷新都多存一份，直到下次部署才清理。 |
| roadmap 节点产物永不清理 | `scripts/generate-data.js:1203-1208` 对比 `:1223` | 节点 JSON 与预渲染页没有登记进构建状态，`removeUnlistedFiles` 不覆盖它们；删掉一个节点后旧页面仍可访问。 |
| `updatedAt` 回退到 mtime | `scripts/generate-data.js:95-99` | 仅在浅克隆 / git 不可用时触发，但会让相同日志产出不同的 `overview.json` 字节，并使题目页缓存整体失效。 |
| 无重试 | `scripts/fetch-codeforces.js:99` | 单次 fetch + 60 秒超时，一次瞬时 5xx 即整轮失败（失败发生在写盘之前，因此安全但需手工重跑）。 |
| 去重与哈希的重复开销 | `scripts/generate-data.js:191-200`、`:827-865` | `logs.length = 0; push(...)` 复制整个数组；每条记录的 `contentHash` 重复计算；每个题面附件在每次构建都被重新哈希。数据量小时无感，属可预期的规模问题。 |

## 4. 已驳回的结论（保留以便追溯）

审计过程中出现过、但被本机实证否定，**不应**写进修复清单：

| # | 曾出现的结论 | 实证结果 | 错因 |
| --- | --- | --- | --- |
| 4.1 | 无参运行 `node scripts/fetch-codeforces.js` 会把 `curriculum/cf-supplement.json` 里的 502 条精选清空 | **驳回**。无参与 `--all` 实跑后 `curated=502` 均完好（`api` 由 1 变 169，是补入了 API 题） | 误判了 `Number(argv[indexOf("--count")+1] \|\| 8)`：无参时取到的是 argv[0]（脚本路径），能正常转成 8；真正异常的是 `--all` 与缺值 `--count`（见 3.4） |
| 4.2 | 图片抓取「重定向不会被跟随」，因此 2.1 不可利用 | **驳回（主审计第一版 PoC 就是错的）**。用 mock 的 `Response` 构造 302 时确实不跟随；换成真实本地 HTTP 服务器后确认**会跟随**（`redirect-control.mjs`） | 拿 mock 对象验证重定向语义不可靠；涉及协议行为必须用真实服务端 |
| 4.3 | 书系题单标签在 `--force` 后会丢失 | **由提出者自行撤回**：`convert-curriculum.js:1360-1366` 的 `push` 确实会带上 `extra.tags` | 静态阅读时漏看 `push` 的参数 |

## 5. 测试诚实性与覆盖缺口

规模：63 个 `test/*.test.mjs` + `e2e/journal.spec.mjs`（13 条浏览器回归）；`npm test` 实际执行 546 项，全部通过。以下问题**不改变「测试全绿」这一事实**，而是说明绿色覆盖不到哪里。

| 项 | 位置 | 说明 | 状态 |
| --- | --- | --- | --- |
| 空断言 | `test/oauth-problem-statement.test.mjs:194,207` | 夹具不含 `<img>`，`calls.length === 0` 恒真，正是 2.1 漏网的原因 | 已核对 |
| 生产 CI 静默跳过 | `test/export-latex.test.mjs:362,372,384` | 找不到引擎就 `skip`，而 `.github/workflows/checks.yml` 不装 TeX Live。本机装了所以真的编译（17–20 s），生产 CI 的 `Check and generate site` 总共只有 19 s——跳过被生产耗时反证 | 已实证 |
| 正则断言当功能测试 | `test/form-drafts.test.mjs`（11 项全是对 `lib/form.mjs` 源码文本做 `assert.match`）、`test/reliability-regressions.test.mjs:15-44`、`test/generate-seo.test.mjs:149-153` | 把调用挪到死分支、或对调两个分支的执行顺序，断言依旧通过 | 已核对 |
| 恰好为真的目录断言 | `test/generate-seo.test.mjs:204` | `site/data/roadmap/nodes/` 不存在就提前 `return`，恰好在「构建没产出节点」时变成空操作 | 已核对 |
| 契约自证 | `test/worker-compatibility.test.mjs:8,13,17-18` | 期望值由 `LOG_SCHEMA_VERSION` 现算，站点↔Worker 约定被改坏时测不出来 | 已核对 |
| 计数型变更探测器 | `test/training-read-index.test.mjs:33-35` | 写死 `reads === 4`、`nodes.length === 39`；加一个知识点节点就会红，而 `legacyRecords.length > 40` 对名义上要防的回归永远为真 | 已核对 |
| 增量性无覆盖 | `scripts/reindex-training.mjs:103-128` | `--check` 的非零退出码分支从未被执行；哈希只在「必须变化」方向断言过，没有「重复构建应为空操作」 | 已核对 |
| 真实 git 失败无覆盖 | `test/git-transaction.test.mjs:23-37,110` | 失败只由假实现注入；收据与 `git.commit` 同批落盘的顺序（`workers/services/logs-v2.mjs:421-425`）没有失败路径用例 | 已核对 |
| 共享状态与全局 mock | `test/oauth-problem-statement.test.mjs:54-56`（限流表无法重置，只好换账号）、`test/qq-webhook.test.mjs` 多处赋 `globalThis.fetch` 无 `try/finally` | 用例顺序与失败会互相污染 | 已核对 |
| 计数集中 | `test/tag-normalize.test.mjs` | 588 行 / 110 项（占全套约 20%），每项一条断言，覆盖面被计数放大 | 已核对 |
| 运行器分组靠文件名 | `scripts/run-tests.mjs:10-12` | 只有 `test/oauth-*.test.mjs` 进隔离批次，但 `qq-webhook`、`journal-api`、`logs-v2`、`training-api`、`git-transaction` 同样 import Worker 模块、也替换全局 fetch；`node --test` 本身按文件隔离进程，因此真正起作用的是一条没人强制的命名约定 | 已核对 |

## 6. 优先级与下一步

| 顺序 | 项 | 理由 |
| --- | --- | --- |
| 1 | 2.2 QQ 端点强制验签 | 公网可打、无需登录、可造成对外发消息与 LLM 额度消耗；修法是一行条件 |
| 2 | 2.1 图片抓取主机白名单 + 禁跨主机重定向 | 已登录成员即可发起，可读内网 |
| 3 | 为 1、2 各补一条**会失败**的回归用例 | 当前缺口正是「测试全绿但没人测这条」 |
| 4 | 3.1 统一槽位与去重口径，并在并存时告警 | 静默丢记录，且两种目录布局都在代码支持范围内 |
| 5 | 2.3 / 2.4 OAuth 握手与成员目录绑定用例 | 认证边界目前完全没有回归网 |
| 6 | 3.2 构建改为暂存后替换 | 影响发布产物一致性 |
| 7 | 3.3 `--force` 加差异检查；3.4 修 `--count` / 删 `--all` | 属工具链误导，代价小 |

## 7. 未核实项（不当作结论）

- 3.2 的中间态是否真的对线上访客可见——取决于 Pages 产物上传与 CDN 时序，未实测。
- Service Worker 缓存增长的真实幅度，以及是否仍有客户端持有带时间戳的旧 worker。
- 生产 runner 上是否装了 TeX 引擎——只能由 19 秒的步骤耗时**反证其未执行编译**，没有直接读取 CI 日志确认跳过计数。
- 除 4.1 之外，`curriculum/` 各 sidecar JSON 在 `--force` 后是否真的逐字不变（需要跑一次生成再比对；本轮未做，以免写入仓库）。

## 8. 本轮未改动任何生产代码

审计只读；所有复现脚本位于系统临时目录（`%TEMP%\dsh-audit\`：`qq-unsigned-poc.mjs`、`ssrf-image-real.mjs`、`redirect-control.mjs`、`readlogs-dedupe-poc.mjs`），仓库内没有新增或修改代码文件。上文各「最小修法」均**未实施**，不要按已修复理解。

## 9. 追加复核：复习快捷操作（2026-09-28）

本节是上述只读审计之后的独立修复记录；第 8 节只描述原审计当时的状态。依据用户提供的首页、题目页截图，并用线上 Worker 的真实 `OPTIONS` 响应核对。

| 编号 | 问题与证据 | 影响 | 本次处理 |
| --- | --- | --- | --- |
| R5-1 | `src/problem-page.js` 与 `lib/renderer.mjs` 的题目详情分支只检查是否为本人，未检查 `reviewStatus`。截图中 P1036 明示“未安排复习”，却仍显示“结束复习 / 顺延 +3”；已结束的安排也会重复显示“结束复习”。 | 无意义的操作可把未安排题目直接归档，或让用户重复结束复习。 | 仅待复习显示“结束复习”；已结束只显示“重新安排 +3”；未安排不显示复习操作。待复习但无日期时按钮标成“安排 +3”。两个题目详情实现已同步。 |
| R5-2 | `workers/oauth.mjs` 的 CORS 预检响应只允许 `GET,PUT,POST,DELETE,OPTIONS`，但单题复习接口 `PATCH /api/v2/me/logs/dates/:date/records/:id` 使用 `PATCH`。2026-09-28 对线上 `algo-oauth.xialiao.org` 发送带 `Origin: https://train.xialiao.org` 和 `Access-Control-Request-Method: PATCH` 的 `OPTIONS`，响应为 204，`Access-Control-Allow-Methods` 确实缺少 `PATCH`。 | 浏览器拦截首页及题目页的保存请求，显示“操作失败：Failed to fetch”；复习页同受影响。 | Worker 允许列表补入 `PATCH`，并添加真实入口预检回归测试。`66f25b4` 部署后线上预检已返回 `GET,PUT,PATCH,POST,DELETE,OPTIONS`；登录后的真实写入仍需人工验收。 |
| R5-3 | `renderReviewBook` 对全队每张复习卡片都显示快捷写入按钮，仅到点击时才由服务端拒绝其他成员；且“已结束安排”的卡片也继续显示“结束复习”。 | 展示了当前用户无权或无意义的操作。 | 只给本人记录显示写入按钮；待复习可结束或延后，已结束只可重新安排；所有记录仍可查看详情。 |
| R5-4 | 首页复习队列仅按 `reviewDue` 过滤，未核对 `reviewStatus`；若旧数据保留日期但状态已结束，仍可能被当作今日待复习。 | 队列可能出现并非待复习的题。 | 加入“待复习”状态过滤。 |
| R5-5 | 快捷写入成功后立即刷新页面，但页面读取的题目详情与队列是静态生成的 JSON，要等下一次站点构建才更新。 | 成功的操作可能马上又显示为“待复习”，用户以为仍未结束，并重复点击。 | 本浏览器会话暂存成功写入的单题复习状态，读取旧静态数据时覆盖显示；静态数据追上后自动清除暂存。 |

**范围说明**：第 2、3、5 节列出的 SSRF、QQ webhook 验签和其他新审计项仍维持原状态；本次没有把这些问题记作已修复。

2026-09-29 补充：第 R5-1 的浏览器回归曾直接引用仓库中的真实待复习记录。该记录随后被队员更新，导致两次日常发布在 Chromium 测试处失败，源码校验和站点构建均通过。测试现固定模拟两种复习状态，不再依赖队员实时数据；完整浏览器回归在本机 14/14 通过。日常 Pages 和 PR 工作流已移除 Chromium 安装与浏览器测试，浏览器回归保留供本地按需运行。
