# 交接文档：Algo Training Journal

## 最新交接（2026-09-21）：一万条记录容量升级

- 浏览器不再请求或生成 `site/data/all.json`。`manifest.json` 描述月份、成员年度和错题分片；分析页、成员页、错题本分别只加载当前视图需要的数据，并缓存已取分片。
- 成员、分析和错题列表每批只创建 40 个条目；首页到期复习最多携带 100 条，同时保留真实总数。
- `tag-index.json` 仅含摘要，记录列表拆到 `data/tags/<标签>.json`，标签详情按需加载。
- `.build-cache/site-state.json` 保存题目页、详情 JSON、成员页和标签页的依赖指纹。构建仍全量扫描轻量摘要以重算同题与标签反向索引，随后只生成失效的重型产物；删除记录会清理题目目录、详情 JSON和失效分片。不要把它改成“仅看当前日志文件 hash”，否则会破坏同题和标签双向链接。
- 新增 `test/data-shards.test.mjs` 和 `npm run smoke:scale`；后者用真实浏览器确认三类页面不请求 `all.json`、只走对应分片且首批 DOM 不超过 40 条。完整设计与验收边界见 `docs/SCALE-10000.md`。

## 最新交接（2026-09-21 补记）：AtCoder 算法标签与提交页链接

用户追加要求：测试能否正常爬取 AtCoder 的算法标签等信息。结论是**能，但只有一条来源**。

### 1. 先查清有哪些来源（结论：只有洛谷）

| 来源 | 结果 |
| --- | --- |
| AtCoder 官方题目页 | 没有标签；而且对机房出口整体 403（见下一节） |
| kenkoooo `merged-problems.json` | **没有 tags 字段**（实测字段：id/contest_id/problem_index/name/title/short_title/point/solver_count/最短-最快-首次提交 id 等） |
| kenkoooo `problem-models.json` | 只有难度模型，没有标签 |
| kenkoooo 其它资源（`tags.json`、`problem-tags.json`） | 404，不存在 |
| 社区 AtCoder Tags（`atcoder-tags.herokuapp.com`） | 已下线（Heroku 免费额度取消后没了，本机 DNS/连接均失败） |
| **洛谷 AtCoder 镜像** | ✅ 题目页与列表页都带数字标签，`/_lfe/tags` 提供 id→中文名 |

所以标签来自洛谷的社区标注（不是 AtCoder 官方标签），简单题常常没有标签，洛谷未收录的题目完全没有。

### 2. 三个上游都从 Cloudflare 边缘可达（临时探针实测，已删除）

- kenkoooo 提交 API：200 / 415 ms，返回 `{id, contest_id, problem_id, point, result, ...}`。
- kenkoooo `merged-problems.json`：200 / 38 ms，4.5 MB、9565 题。
- 洛谷 `/_lfe/tags`：200 / 335 ms，505 条（其中 262 条是算法标签）。
- 洛谷题目**列表页** `problem/list?keyword=<比赛>&type=AT`：200 / ~2 s，一次拿到整场比赛的题号与 tags。
- 洛谷单题页 `AT_<任务 ID>`：200 / 313 ms。

### 3. 实现

- `lib/luogu-tag-map.mjs`（纯函数）：洛谷标签名 → 站内标签。三条规则：能对上规范标签就映射（262 个算法标签里 223 个，含 `深度优先搜索 DFS`→DFS、`状压 DP`→状压DP 这类带后缀的写法）；分类名与「语言入门」语法标签丢弃（15 个）；站内确实没有的成熟技巧保留原名（24 个：莫队、笛卡尔树、bitset、反悔贪心…）。带分隔符的名字先拆开（`集合幂级数，子集卷积`），超过 30 字符的丢弃（站内单标签上限），绝不让标签在下次保存时被拆成两个或被拒。
- `workers/services/atcoder-tags.mjs`（网络）：字典按 isolate 缓存 6 小时；**按比赛批量**取列表页（一场一次请求，最多 6 场、并发 3），按 `AT_<比赛>_` 前缀过滤——列表页的 keyword 是模糊匹配，搜 `abc381` 会带回 `abc093`，只信搜索顺序会标错标签。
- `workers/services/luogu-page.mjs`（抽取）：C3VK 握手、限额读取、挑战页判定从 `problem-statement.mjs` 抽出来，题面与标签两条链路共用；`http-headers.mjs` 收拢 `BROWSER_HEADERS`。
- 导入：`fetchAtCoderAccepted` 顺带返回**提交页链接** `https://atcoder.jp/contests/<比赛>/submissions/<id>`（AtCoder 提交页公开可看源码，与 CF 的「📄 提交」一致）；`handleImport` 的 atcoder 分支再补标签。
- 题面：洛谷 AT_ 页在解析时把原始数字标签一并交出（`tagIds`），路由用同一份页面顺手换成站内标签后返回 `tags`（不再多抓一次页面）；`tagIds` 是内部细节，不出现在 API 响应里。
- 前端：抓取题面时把标签并入标签框（去重、不覆盖用户已填），并在提示里写「已带标签：…」；导入列表显示前 3 个标签，AtCoder 也显示「📄 提交」链接；导入提示语改成「标签取自洛谷镜像，洛谷未收录的题目需手动补充」。

### 4. 验证

- 单元测试新增 `test/atcoder-tags.test.mjs`（9 项：映射规则、长度/分隔符约束、字典缓存与失效、列表页前缀过滤、三种失败降级、批量补标签、字典不可用时不动数据）；`test/oauth-import.test.mjs` 补上提交页链接断言；`test/oauth-problem-statement.test.mjs` 补路由层「AT_ 镜像带标签」「字典取不到时题面无标签照常返回」。
- 本机真实网络（`node scripts/verify-import-live.mjs`）：字典 505 条；`abc340_e → [42] → 线段树`；`only_matthew` 近 120 天 2 题全部带提交链接与标签（`abc472_b=模拟/前缀和`、`abc472_a=模拟/字符串`）。
- 边缘探针（已删除）：导入链路 `dictionary.size=505`、一场比赛一次列表页拿到 `abc340_c/e/f/g/d` 的标签、2 题全部带标签与提交链接、整轮约 4.4 s；题面链路 `abc381_e → tagIds [45,254] → ["二分","前缀和"]`。
- 顺带发现：自定义域上的 Worker 响应会被 Cloudflare 边缘缓存——探针换代码后同一 URL 仍返回旧响应，加随机 query 才拿到新的。**排查线上行为时记得带 cache-buster**（本功能自身不受影响，生产 API 响应都带 `Cache-Control: no-store`）。
- 部署状态：前端 `74ba55c` 已推 `main` 并由 GitHub Actions 发布（线上入口 `app-R42MZZGI.js`，form 分包含「已带标签：」「标签取自洛谷镜像」标记）；Worker `algo-oauth` 最新版本 `28156591-7d52-42d1-ab57-a51a2f4cf6c6`。临时探针 `algo-tag-probe` 与 `tag-probe.xialiao.org` 已删除（DNS 确认不存在）。**仍差真人**：导入一次 AtCoder AC 记录，看列表里是否出现标签与「📄 提交」链接。

### 5. 为什么没走 vjudge（2026-09-21 评估，结论：不可用）

用户提议过用 vjudge 兜底。实测结论是**不能用，也不该用**：

- **题目页对匿名请求一律跳登录**：`https://vjudge.net/problem/AtCoder-abc381_a`、`POJ-1000`、`CodeForces-4A`、`AtCoder-typical90_a` 全部返回 `303 → /?login=1&continue=…`。本机与 Cloudflare 边缘（临时探针 `algo-src-probe`，已删除）结果一致；robots.txt 只禁 `/user/`，但题面本身在登录墙后面。
- `/problem/data` 对匿名请求返回空列表（`{"data":[],"recordsTotal":9999999}`，69 B），不是题面接口；`/problem/description/<id>` 是 404。
- 走它意味着要在 Worker 里保存并携带某个 vjudge 账号的会话，这正是项目明确划出的红线（不读取私人 Cookie、不绕过登录与验证码），也有 ToS 风险。**因此不实现。**
- 顺带评估了公开数据集 DeepMind CodeContests（HuggingFace `datasets-server`）：边缘可达（`rows` 接口 200 / 1.2 s），但 `search` 接口对该数据集返回 500，只能按 offset 顺序翻约 1.3 万行，Worker 里不可行，且只覆盖 2021 年前的题目。
- 覆盖率缺口的现状（只能用粘贴正文或上传 PDF 兜底）：Typical90 洛谷没有收录（用洛谷列表页搜 `typical90` 只返回无关题目，`AT_typical90_*` 全 404）；JOI 洛谷有部分收录但 pid 与 AtCoder 任务 ID 不同名（`AT_joi2011yo_f`、`AT_joi2021_yo1a_b` 等在，`AT_joi2019yo_a` 是 404），照任务 ID 猜 pid 会违反「不猜」原则，故不做。
- **补充（同一轮）**：该缺口已用「浏览器小书签回传页面源码」补上，见下一节。

### 7. 缺口兜底：浏览器小书签回传官方页源码

用户随后发来一个能正常抓 AtCoder 题面的 VS Code 插件（`yohan020/atcoder-helper`）作为参照。读了它的源码：它用 `axios.get('https://atcoder.jp/contests/<比赛>/tasks/<题目>')` + `cheerio` 读 `#task-statement` 的 `.lang-ja` / `.lang-en`——**没有任何代理或特殊技巧，区别只在于它跑在用户自己的电脑上**（住宅 IP），所以不受机房 IP 拦截。

据此把三条路都验了一遍：

| 路径 | 结果 |
| --- | --- |
| 服务器（Cloudflare Worker）直连 atcoder.jp | 403（IP 级拦截，见 §3.1） |
| 本站页面里用 `fetch` 读 atcoder.jp | 不可能：AtCoder 不返回 `Access-Control-Allow-Origin`（带 `Origin` 实测，只有 `content-type` / `vary` / `x-content-type-options`） |
| **跑在 atcoder.jp 上的代码（小书签/插件）** | ✅ 能拿到官方页 |

于是实现「从 AtCoder 页面导入」：

- 表单题面区新增一个可拖到书签栏的小书签（`javascript:`），在题目页点击时把 `document.documentElement.outerHTML` 复制到剪贴板（复制整份文档：服务端解析要 `<title>`、`og:url` 与 `#task-statement`）；旁边还有「复制小书签代码」按钮，以及 `Ctrl+U → Ctrl+A → Ctrl+C` 的无安装替代方案。
- 粘贴回来后点「解析并填入」→ `POST /api/problem-statement` 带 `html` 字段 → 服务端**不请求任何上游**，直接用 `statementFromAtCoderHtml()`（与官方页同一条解析路径，含 `og:url` 校验：粘错题会判 `parse-failed`），返回与抓取完全相同的结构，前端由同一个 `applyStatementResult()` 落地（描述、标签、来源、预览分支全一致）。
- 标注：`warnings` 加 `client-html`，表单提示「题面取自你浏览器抓回的 AtCoder 官方页面」；`source.url` 取页面自己声明的 `og:url`，`source.kind` 仍是 `atcoder-html`（schema 不用改）。图片仍会被归档层尝试下载，`img.atcoder.jp` 同样够不到 → 退回外链 + `external-images` 警告（正文照常可用）。
- 真实页面实测：`typical90_a`（1052 字符，标题 `001 - Yokan Party（★4）`，日文原题 + `ja-statement` 警告）、`typical90_br`（070）、`abc381_a`（英文原题）全部解析正常；`joi2019yo_a` 在 AtCoder 本身就是 404（该任务 ID 不存在，与来源无关）。
- 测试：`statementFromAtCoderHtml` 4 项（成功 / og:url 不符 / 题号非法 / 超限）+ 路由 2 项（接受源码且**零上游请求**、非 AtCoder 平台 400）+ 表单来源不变量 1 项。注意题面接口限流是「每账号 10 次/分钟且先计数后读 body」，用例变多会互相打爆配额，因此新用例换到第二个队员账号下。

### 8. 上线后修复：描述里已有内容时「解析出来了但没填入」

用户反馈小书签路径「解析出来了，但是没有填入」。用真实 Chromium 复现（`artifacts/repro-statement-import.mjs` + `scripts/preview-ui.mjs`）后定位到：`applyStatementResult()` 在**描述非空**时只把题面写进预览面板，**却不提供任何应用入口**——状态栏那句「请核对预览后再手动替换描述」是死胡同，用户只能手动从预览里抄。另外描述里如果被误粘了整页源码（很可能发生，两个框很容易搞混），同样落进这个分支，于是几百 KB 的源码留在描述里、真正的题面却没进去。

修法（`lib/form.mjs` + `style.css`）：

1. 新增 **「用这份题面替换描述」按钮**（预览分支才出现），点一下把 `dataset.statementPreview` 真正写进描述、登记来源、收起按钮与过期预览。
2. 描述里匹配 `PAGE_SOURCE`（`<!DOCTYPE` / `<html` / `<?xml` / `id="task-statement"`）时判定为「误粘的页面源码」，**直接替换**并说明原因。
3. 重复解析同一份题面时提示「描述里已经是这份题面，未重复写入」，不再弹预览。
4. 填入逻辑收敛到 `fillStatementDescription()`，服务端抓取与小书签两条路径共用；`applyStatementResult()` 的三种分支（空 / 源码 / 有内容）都有明确出口。

回归护栏：新增 `scripts/smoke-statement-import.mjs`（`npm run smoke:statement`，真实 Chromium + 预览服务，15 项断言覆盖上述四种情形与「点替换后真的替换」），以及 `test/form-drafts.test.mjs` 里的表单不变量断言。**这次的教训：只有 DOM 交互的路径，单测看不见，必须用浏览器冒烟脚本跑一遍。**
- 部署状态：`39fbeff` 已推 `main` 并由 GitHub Actions 发布（线上入口 `app-HA4J6USX.js`，form 分包含 `btn-bookmarklet` / `btn-parse-statement-html` / 小书签脚本 / `statement-html` / 「从 AtCoder 页面导入」全部标记）；Worker `algo-oauth` 版本 `11ba534a-0daa-4a1c-8f18-84768452d7c8`。临时探针 `algo-src-probe` 与 `src-probe.xialiao.org` 已删除（DNS 延迟约 1 分钟后回收，需二次确认）。**仍差真人**：在 AtCoder 题目页（如 `typical90_a`）拖动并使用小书签，验证「复制 → 粘贴 → 解析并填入」这一整条链路。

## 最新交接（2026-09-21）：AtCoder 题面抓取与预置 AtCoder 用户名

用户反馈：AtCoder 题面抓不下来；同时要求预置廖夏的 AtCoder 用户名 `only_matthew`。

### 1. 根因：抓取入口从来只认 Codeforces

`POST /api/problem-statement` 在路由层写死 `body.platform !== "Codeforces"` 就 400，前端 `lib/journal-api.js#fetchProblemStatement` 也把 `platform` 固定成 `Codeforces`，表单里的按钮更是先判 `platform !== "Codeforces"` 就提示「请先填写 Codeforces 题号」。也就是说 AtCoder 记录点「抓取」不是抓失败，而是**根本没有发出请求**。按钮文案「抓取 CF 题面」正是这个边界的写照。

### 2. 修法：一个入口，按平台分派来源

- `workers/services/problem-statement.mjs` 新增 `parseAtCoderProblemNumber()`（题号即任务 ID，比赛 ID 取最后一个下划线之前的部分，与 `lib/problem-links.mjs` 生成原题链接的口径一致）、`parseAtCoderStatement()` 与 `fetchAtCoderStatement()`；`fetchStatement({platform,...})` 按平台分派，两个平台都是「官方页优先、洛谷镜像兜底」。
- 路由 `handleProblemStatement` 的 `platform` 白名单扩为 `Codeforces` / `AtCoder`；AtCoder 题号拼不出题目页时直接 400，不发上游请求。
- `lib/journal-api.js`、`lib/form.mjs` 改按当前平台与题号抓取（按钮文案改为「抓取题面」），AtCoder 题号形状不对时在客户端就提示「要写成 `abc381_a` 这样的任务 ID」。
- `statementSource.kind` 新增 `atcoder-html`；洛谷 `AT_` 镜像复用 `luogu-mirror` kind，`lib/problem-enrichment-schema.mjs` 按 kind 与地址形态校验（`atcoder.jp/contests/<比赛>/tasks/<任务>`、`www.luogu.com.cn/problem/CF<场次><代号>`、`www.luogu.com.cn/problem/AT_<任务 ID>`）。

### 3. 解析保真：AtCoder 页面用到的结构

题面在 `#task-statement` 里同时内嵌日文与英文两套（`span.lang-ja` / `span.lang-en`），只取英文；只有日文的老题取日文原题并在 `warnings` 里加 `ja-statement`，表单提示「这道题没有英文题面，正文是日文原题」。页面用 `og:url` 声明身份，与请求题号不一致时判 `parse-failed`，绝不把别题正文写进记录。

公式写在 `<var>` 里、内容是裸 TeX（`\frac{|T|+1}{2}`、`1 \leq N \leq 100`），转成 `$...$` 交给站内 KaTeX；`<code>` 转行内代码；表格的 `<tr>` 包在 `<thead>/<tbody>` 里，原来的 `tableMarkdown` 只认直接子节点、会把整张表丢掉，改为递归收集并跳过空行。这几处都在共享解析器里，因此 CF 与洛谷的 `parserVersion` 一并升到 `cf-html-v4` / `luogu-mirror-v3`。

### 3.1 关键发现：atcoder.jp 对机房出口整体 403

第一版只取官方页，部署后立刻用临时探针 Worker（挂 `atcoder-probe.xialiao.org`，验证后已 delete）在边缘实测，结果是**每一道题都 `blocked`**，于是补做了诊断：

| 请求（Cloudflare 边缘） | 结果 |
| --- | --- |
| `https://atcoder.jp/`（首页） | **403**，Apache 错误页，`server: cloudflare` + `x-amz-cf-id` |
| `https://atcoder.jp/contests/abc381/tasks/abc381_a?lang=en`（浏览器请求头） | **403**，同上（5–15 ms，明显是边缘/shield 直接拒绝） |
| 同题，只发 `Accept: text/html` | **403** |
| 同题，补 `Sec-Fetch-*` / `Upgrade-Insecure-Requests` / `Connection` 等全套头 | **403** |
| `https://www.luogu.com.cn/problem/AT_abc381_a` | **200**，`lentille-context` 存在 |

结论：**这是 IP 级拦截，不是 UA 或请求头问题**——AtCoder 拒绝机房出口（含 Cloudflare Workers），换头、换路径都没用；本机住宅网络同一份代码却能拿到官方英文题面（所以本机 `verify-import-live` 走的是 `atcoder-html`）。若不做兜底，这个功能在生产环境等于没修。

### 3.2 兜底：洛谷的 `AT_` 镜像页

洛谷按 `AT_<任务 ID>` 收录 AtCoder 题目，正文取自同一份 `lentille-context` JSON，于是 `fetchStatement` 的 AtCoder 分支与 CF 完全同构：官方页（占一半预算，失败得很快）→ 洛谷 `AT_` 镜像。镜像成功时 `source.kind="luogu-mirror"`、`parserVersion="luogu-atcoder-mirror-v1"`，并带 `mirror-source` 警告；两个来源都失败时回给官方页的原因（`blocked`），表单会补一句「AtCoder 官方页在服务端被拦截，且洛谷没有这道题的镜像」。

顺带修了洛谷 AT_ 页面的两处形态差异（都是实测踩到的）：

1. **正文是纯 Markdown 文本，不是 HTML**。原来的 `render()` 一律 `parseHtml` + 折叠空白，会把 `> 引用`、`- 列表` 压成一行；而且正文里的 `<` 会被当成标签开头吃掉。现在先按 `HTML_LIKE` 判断形态，纯 Markdown 走 `markdownText()`（只解码实体、登记图片、归一 `$$$` 公式，保留换行）。
2. **样例是 `[in, out]` 数组对**，而旧代码只认 `{in,out}` 对象并显式过滤数组，导致 AT_ 镜像一条样例都没有；现在两种形态都接受。另外首行的 `[problemUrl]: <原题地址>` 是 Markdown 的链接引用定义、渲染时会整行消失，改写为可见的 `原题链接：<url>`。

覆盖面上洛谷只收了部分 AtCoder 题目：ABC / ARC / AGC / DP 常见题都在（抽查 12 道命中 11 道），**Typical90、JOI 等没有**（实测 `AT_typical90_a`、`AT_typical90_br`、`AT_joi2019yo_a` 均 404）。这些题目在生产环境拿不到题面，只能粘贴正文或上传 PDF；这是上游限制，不是可以绕的 bug。

### 4. 预置 AtCoder 用户名

`workers/oauth.mjs` 新增 `ATCODER_HANDLES = { "only-matthew": "only_matthew" }`（与 `CF_HANDLES` 并列，AtCoder 的 handle 与 CF 不同名），随会话响应下发 `atcoderHandle`，导入面板打开 AtCoder 时自动预填；没有预置的队员留空、可自行输入。已核实该 handle 在 AtCoder 与 kenkoooo API 上都存在且有提交。

### 5. 验证

- 单元测试：`test/problem-statement.test.mjs` 覆盖 AtCoder 题号解析、官方页解析（公式/行内代码/样例/表格）、日文兜底、`og:url` 不符判失败、AT_ 镜像解析（Markdown 结构 / `原题地址` / 数组样例 / pid 校验 / `<` 不被当标签）、官方页失败退回镜像、两源都失败保留官方原因、官方可达时不请求镜像；`test/oauth-problem-statement.test.mjs` 覆盖路由层 AtCoder 成功、题号非法 400、平台不支持 400；`test/problem-enrichment-schema.test.mjs` 覆盖 `atcoder-html` 与 `AT_` 镜像地址的接受与拒绝；`test/oauth-import.test.mjs` 覆盖 `/api/session` 下发 `cfHandle` / `atcoderHandle`。
- 本机真实网络（`node scripts/verify-import-live.mjs`）：官方页走通（1493 字符英文题面、无日文小节），AT_ 镜像单独调用也解析成功（931 字符、`mirror-source`），题号缺下划线仍 400。
- **边缘实测（临时探针 Worker，已删除）**：`abc381_a` / `abc337_e` / `abc340_e` / `dp_a` 全部 `ok · luogu-mirror · 300–800 ms`，`typical90_a` 如实报 `blocked`；`officialOnly` 全部 `blocked`、`mirrorOnly` 全部 `ok`，来源链的每一步都被单独验证过。
- **仍差真人**：登录后在界面里点一次「抓取题面」（选一条 AtCoder 记录、题号如 `abc381_a`）做最终确认。

### 6. 上线状态（2026-09-21 收尾）

- 前端：`c0735d0`、`5a5f522`、`6b7b01f` 均已推 `main`，GitHub Actions 三次构建全部 `completed success`；线上入口 `app-SWLYTDN6.js`，form 分包已含「抓取题面」/`atcoderHandle`/`atcoder-html`/「AtCoder 官方页在服务端被拦截」/「题面取自洛谷镜像（多为日文原题）」/「官方页与镜像都没取到」全部标记（`artifacts/verify-live-mirror.mjs` 可复核）。
- Worker：`algo-oauth` 最新版本 `e0d1573c-b507-40be-abfa-b5ed5f36d194`（100% 流量，2026-09-20T18:07:15Z），即「官方页 → 洛谷 AT_ 镜像」这一版；`https://algo-oauth.xialiao.org/api/session` 正常返回 `null`（未登录态）。
- 临时资源已回收：探针 Worker `algo-atcoder-probe` 与其自定义域 `atcoder-probe.xialiao.org` 已删除，DNS 查询确认「名称不存在」。

## 最新交接（2026-09-18）：题面图片随抓取归档到仓库

用户反馈：抓洛谷题面时正文里被插进了 `cdn.luogu.com.cn` 的外链图片，在本站加载不出来；要求修复抓取机制、把图片一并抓进仓库（「和 PDF 一样」），并顺带确认 Codeforces 有没有同样的问题。

### 1. 根因不是 referer，是站点 CSP

用户怀疑是洛谷 CDN 的 referer 限制。实测（`curl`，带浏览器 UA）**新旧两代洛谷图床都不校验 referer**：`/upload/pic/2262.png` 与 `/upload/image_hosting/oe7wpwsi.png` 在不带 referer、带 `example.com` referer、带本站 referer 三种情况下都是 200（新图床只是把 `Content-Type` 报成 `application/octet-stream`）。

真正的原因在 `index.html` 的 CSP：`img-src 'self' https://avatars.githubusercontent.com data:` ——任何外部图片域都被拦下，而与 referer 无关。Codeforces **有同样的问题**：官方题面里的图（`espresso.codeforces.com` 等）同样是外链，一样被这条 CSP 拦掉；`parserVersion=cf-html-v2` 只是给正文加了 `external-images` 警告，警告本身并不能让图片显示出来。顺带发现 CF 题面里的内联 `data:` 图（CSP 恰好放行）此前会被 `safeUrl` 直接丢弃，现在也会被解码归档。

所以两条链路（官方 CF 题面、洛谷镜像）都要把图片收进仓库；只放宽 CSP 不是好办法：图片仍然依赖上游可用性与防盗链策略。

### 2. 处置

命名与限额集中在 [lib/statement-images.mjs](lib/statement-images.mjs)：文件名 `statement-<sha256>.<ext>`（内容寻址、同名必然同内容、跨题自然去重），只收位图 `png/jpeg/gif/webp`（**不收 SVG**：同源 SVG 能执行脚本，等于给了自己一个 XSS 入口）；单张 1 MiB、每题最多 10 张、一次保存新增合计 2 MiB。正文里的引用写成 `./statement-<sha256>.<ext>`：`lib/render-safety.mjs` 的 `isSafeUrl` 只放行 `http(s)://`、`/`、`./`、`../`、`#` 开头，**裸文件名会被它丢掉**（实测过），显式 `./` 则在 GitHub 与站内渲染器里都能解析。

1. **解析层**（`workers/services/problem-statement.mjs`）：图片不再直接写成外链，而是记进 `context.images` 并在正文里留下占位符。洛谷正文是 HTML 与 Markdown 混排，裸的 `![](url)` 语法藏在文本节点里，此前会被当成普通文字原样写进描述——现在和 `<img src>` 走同一条登记路径。未开启归档时（直接调用解析函数、单元测试）保持原来的外链写法，`external-images` 警告语义不变。
2. **抓取层**：`archiveStatementImages()` 下载图片（4 并发、总预算 6 秒、流式截断到 1 MiB），按**魔数**判断类型（洛谷新图床的响应头不可信），按来源站补 `Referer`，算出 sha256 后把占位符替换成 `./statement-<sha256>.<ext>`。单张失败只影响它自己：正文保留原外链并保留 `external-images` 警告，题面照常返回。单张/总量/张数超限的图片同样退回外链——超过单张上限的图片会被保存接口拒绝，不能让整次保存因此失败。
3. **洛谷题号导入**（`fetchLuoguProblems`）：与 CF 镜像共用 `parseLuoguProblem()`，因此导入的描述由「纯文本 + 截断 20000 字」变成与抓取一致的 Markdown 全文（小节标题、公式、样例、图片），图片同样归档；一次导入的图片按 4 MiB 总量预算降级。
4. **保存链路**：走既有的 v2 multipart，新增的分区名就是仓库文件名（`statement-<sha>.png`），服务端按「文件名 = 内容哈希」逐张校验内容，拒绝名不符实的分区；payload 里每题的 `statementImages` 是这一题期望的完整集合，服务端据此写新文件、删这一天里不再被任何题目引用的图片；读取走 `GET /api/v2/logs/dates/:date/problems/:recordId/images/:fileName`（需会话、`nosniff`、`inline`）。旧 JSON 接口仍然不能写入图片字节：新增/变更引用返回 422 `ATTACHMENT_REQUIRES_V2`，`planLogChanges` 会把仍被引用的图片纳入保留集。
5. **构建期**（`scripts/generate-data.js`）：逐张校验哈希与字节数后复制到 `site/problem/<成员>/<日期>/<题号>/`，并把**站点数据里**的描述从相对文件名改写成绝对地址。仓库里的 `desc.md` 保持相对文件名（GitHub 页面能直接渲染）；「描述引用了 `statement-<sha>.<ext>` 却没有归档清单」会在构建期直接失败，不发布坏链接。
6. **schemaVersion 5 → 6**：新增 `problem.statementImages`。空数组表示「不再引用任何图片」（据此删文件），字段缺席表示「旧客户端不知道这件事」——服务端沿用旧引用，不把无知当删除。落盘时省略空数组。前端只在「服务端告知过这一题的图片」或「本次抓到新图片」时才声明该字段，并且把已归档的引用一起写进草稿：否则一份旧草稿恢复后，一次带附件的保存就会把正文还在引用的图片当孤儿删掉，构建期还会因为「引用了未归档图片」直接报错。

### 3. 设计取舍：图片跟随正文，而不是像 PDF 那样常驻

PDF 有独立的「替换 / 移除」按钮，因为它是一次性的原件归档。图片不同：它出现在正文里，**是否保留由正文决定**——保存时只声明「描述里仍然写着该文件名」的图片，其余不上传、并删除同名旧文件。这样 AI 概括（把描述压成一句话）之后不会在仓库里留下没人看的图片，用户想删图片也只需要删正文里的那行。表单状态区会写明「只有描述里仍引用的图片会随保存保留」以及当前有几张已不被引用。

### 4. 验证

- `npm run check:syntax`、`npm test`（383 + 58 项全过）、`npm run build` 均通过。
- 联网实测（本机住宅网络）：洛谷导入 `P3376 / P1904 / P1514` 三道题全部归档成功（图片字节哈希与文件名一致、正文不再有 `cdn.luogu.com.cn`）；CF 题面链路上游 403 时走洛谷镜像，`1710A` 归档 2 张图、其余题目无图但同样不再有外链。另做了一次真实数据端到端：抓 `P1514` → 写成日期目录 → `publishStatementImages()` → `renderMarkdown()`，得到 2 个同源 `<img src="/problem/…">`。
- 新增/更新测试：解析与归档（`test/problem-statement.test.mjs`：HTML 图片、洛谷 Markdown 图片语法、失败降级、`data:` 内联、SVG 拒绝、重复图片只下载一次、单张/总量/张数上限）、洛谷导入端到端（`test/oauth-import.test.mjs`）、schema 校验（`test/problem-enrichment-schema.test.mjs`）、服务端存取与孤儿清理（`test/logs-v2.test.mjs`）、Worker HTTP 端到端 multipart 与读回（`test/oauth-logs-v2.test.mjs`）、构建期发布与改写（`test/statement-image-publish.test.mjs`，含裸文件名容错）、渲染放行相对路径（`test/render-safety.test.mjs`）、浏览器本地存储（`test/attachment-store.test.mjs`）、表单接线（`test/form-drafts.test.mjs`）。
- **未验证**：① `espresso.codeforces.com` 等 CF 图床的真实下载（本机对 codeforces.com 及图床都是 403，只能验证洛谷域；代码按来源站补 referer，但没跑过真的 CF 官方题面）；② 部署到边缘后没有真人跑一遍「抓取 → 保存 → 等部署 → 看详情页图片」。上线前建议按这两条各跑一次。

### 5. 部署顺序：先 Worker，后前端

与 2026-09-15 那轮相反，这次是**前端先上会直接坏**：新前端发 `schemaVersion: 6`，旧 Worker 的 `checkLogVersion`/`validateLogInput` 会把 `> 5` 一律 422 `UNSUPPORTED_SCHEMA`（新旧接口都是），保存全失败。反过来没有风险：新 Worker 接受 v5 载荷，旧前端不带 `statementImages` 时按「沿用旧引用」处理。所以顺序是 **`wrangler deploy` → 推前端**。

## 最新交接（2026-09-16 补记二）：复习按钮排布与并发写入丢更新

### 1. 首页/详情页「结束复习 / 顺延 +3」恢复横排

用户报「首页复习栏目被改、顺延和结束竖着排」。核对后：复习区的**文字**（已掌握→结束复习、非错题→未安排复习、已掌握→已归档）来自 `3a93356`（当天 07:27，学习状态那一轮，早于本轮改动）；按钮竖排是这些**更长的按钮文字**撞上了既有的 `flex-wrap: wrap`（`.review-quick-actions` 来自 9-08 的 `7605d50`，`.problem-review-actions` 来自 9-09 的 `7065cb7`）。本轮两个 CF/表单提交都没有碰 `lib/renderer.mjs`、`style.css`、`index.html`；之所以看起来像刚发生，是本次重新构建改变了 Service Worker 的缓存版本，浏览器这才把此前累积的前端改动拉下来。

处置（`8387eaf`）：只改排布、不动文案——`.review-queue-item` 允许整组换行但按钮组内部 `nowrap`（并去掉只在该换行时才需要的上边框/上内边距），`.problem-review-actions` 同样 `nowrap` 且允许按钮收缩。验证方式是无头 Edge 加载真实产物样式量测：改前 430px 队列面板与 280px 侧栏三处按钮组 `sameRow=false`（复现竖排），改后三处 `sameRow=true` 且无横向溢出。

### 2. 索引过期导致 Pages 连续四次部署失败

现象：`11:35` 之后四次 `save(廖夏)` 提交后 CI 全红，`npm run check` 卡在 `training:reindex -- --check`：`training/members/only-matthew/indexes/legacy.json` 已过期。站点本身没挂（最后一次成功构建一直在服务），只是新数据发不出去。

证据：四次「顺延 +3」把 `reviewDue` 都写成了 `2026-09-19`（四份 meta.json 都是新值），但索引里 `2026-09-01`、`2026-09-07` 两条仍是旧值。也就是说四次保存都提交了索引，最终却丢了两条。

根因（legacy `/api/logs/date` 写路径）：`saveLog` 在请求开始读一次索引，`planLegacyIndexChange` 据此算出**整份**索引内容，然后交给 `commit()`；`commit()` 在非强制 ref 更新返回 422（有人抢先提交）时 `return commit(changes, ...)`——**用同一份旧内容重试**。并发保存落在不同日期时日期文件互不冲突，但共享的个人索引会被后完成的那次覆盖，先完成的改动就丢了。v2 路径（`logs-v2.mjs`）没有这个问题：它的重试循环每次都重新 `getHead` 并重新规划 `planAuxiliaryChanges`。

修复（Worker only，前端未动）：

- `content()` / `listDir()` / `resolveLogRoot()` 支持显式 `ref`（commit sha），以便「按将要提交到的那个 head」重读状态。
- `commit(changes, message, token, retry, recheck)`：每次尝试先跑 `recheck(head)` 重新校验前置条件，再把 `changes` 里的**函数项**按该 head 求值；派生文件（个人索引）改由函数给出，因此重试必然重读重算，函数返回 `null` 表示无需变更。
- `saveLog` / `deleteLog` 的索引变更改成函数；并新增 `assertFreshDateVersion()`：重试时若同一天被别人改过就直接 409，不再拿旧快照规划出的日期文件去覆盖。
- `assertLogVersionPlan` 与 `predictedRevision` 跳过函数项（它们的路径由 `allowedOutside` 声明）。

回归测试（`test/oauth-plan.test.mjs`，+2 项）：新增忠实一点的 Git Data API 替身（commit→tree→blob、ref 用 `force:false`，并能在第一次 ref 更新前插入「别人先提交成功」）。一条断言冲突重试后索引里同时保留并发写入的记录与本次保存的题目，另一条断言同一天被并发改动时抛 `VERSION_CONFLICT` 且不推进 ref。这两条在旧 Worker 上都会失败（已用 `git stash` 换回旧代码验证过）。

### 3. 这一轮的部署与善后

- `8387eaf`（复习按钮排布）、`a73cd5a`（重建索引，恢复 CI）已推送；前端由 CI 重新发布，线上四条记录均已显示 `reviewDue 2026-09-19`。
- Worker 随后按上面的修复重新 `wrangler deploy`。

教训（两次都成立）：**部署前要先列出「这次发布会让用户看到哪些此前未生效的变化」**——补记一里的 CF/代码框改动连带发布了此前累积的前端改动，补记二里的「顺延」则暴露了写路径的并发缺陷。

## 最新交接（2026-09-16 补记）：代码框默认展开与 CF 题面镜像兜底

两项用户反馈：提交表单的代码框要「展开」，「抓取 CF 题面」一直报 blocked。

### 1. 代码框默认展开

`lib/form.mjs` 里代码区仍是 `journal-disclosure` 折叠块（第三轮重排时刻意保留了折叠），现在加 `open`：打开表单即显示代码输入框，标题仍可点击收起。没有改成常驻——每题卡片已经很长，保留折叠入口更划算。

### 2. blocked 的根因与处置

先复查了 `workers/services/problem-statement.mjs`：`blocked` 有两条来源——HTTP 403（第 102 行）与「拿到了挑战页但解析不出 `.problem-statement`」（第 82 行）。

本机（住宅网络、走代理）实测：`fetch`（undici，HTTP/1.1）拿到 403 `Just a moment...` 挑战页；`http2.connect` 却拿到 200 的 61 KB 真实题面页。这条对比一度让人以为问题在出口 IP 与协议指纹，但**在 Cloudflare 边缘上做的对照实验推翻了它**。用同款生产代码临时部署了一个探针 Worker（`algo-statement-probe`，验证后已 delete），在边缘发同一条题面请求，只改请求头：

| 边缘请求 | 结果 |
| --- | --- |
| 带常规浏览器请求头（`User-Agent` + `Accept` + `Accept-Language`） | **200，59807 B 真题面页，`problem-statement` 存在** |
| 只有 `Accept: text/html`（就是旧代码发的头） | **403，`cf-mitigated: challenge`，正文是 `Just a moment...`** |
| 完全不带请求头 | 403，`cf-mitigated: challenge` |
| 洛谷同题页（带浏览器请求头） | 200，14328 B，含 `lentille-context` |

结论：**根因是旧代码只发 `Accept`、没有浏览器请求头**，codeforces.com 的 Cloudflare 因此返回 `cf-mitigated: challenge` 的 403；Worker 的机房出口本身是能直取 CF 题面的。所以「换来源」不是必需的，**补请求头才是真正的修复**（且不涉及验证码绕过），洛谷镜像作为第二来源保留：CF 换策略、单题被挑战或某天不可用时仍有兜底，而且探针证明这条兜底在边缘也确实能用。

处置：把抓取改成两个来源的顺序链，共用原有的 12 秒总预算（`fetchStatement`）。

1. 仍先请求官方英文题面，但改发常规浏览器请求头（`User-Agent` / `Accept` / `Accept-Language`）；拿到就还是 `kind="codeforces-html"`。边缘实测 4A / 158B / 1700A 均为 200，约 0.4–0.8 秒返回。
2. 被拦时退回洛谷同题页 `https://www.luogu.com.cn/problem/CF<contestId><index>`，复用洛谷导入那条链路：先是 `lentille-context` 内嵌 JSON，匿名请求会先收到 C3VK 挑战 cookie（302 回跳同 URL），带 cookie 重试一次。成功时 `kind="luogu-mirror"`、`parserVersion="luogu-mirror-v1"`，并在 `warnings` 里加 `mirror-source`。边缘实测镜像返回的仍是**英文原题**（不是翻译），正文 1.2 KB 左右，`$ n $` 这类公式原样保留。
3. `not-found` 不触发镜像（官方对题目存在性是权威的）；两个来源都失败时回主来源（CF）的 reason，镜像的失败原因不覆盖它。

洛谷镜像的解析按「兼容未知形态」写：`pid` 存在时必须是 `CF<contestId><index>`；`content` 兼容字符串与 `{background,description,formatI,formatO,hint}` 对象，按小节转 `## 题目描述` 等；样例既可能在正文 `pre` 里，也可能单列在 `samples`，后者只在正文没有代码块时补，避免重复。顺带给共用的 HTML→Markdown 转换器加了 GFM 表格、丢弃 `script`/`style`、按来源解析相对图片地址（`safeUrl` 的 base 参数，CF 行为不变）。

同一轮还修了探针暴露的解析瑕疵：CF 的限制块里嵌着 `.property-title`（"time limit per test"），旧代码把它一起拼进了正文，输出成「时间限制：time limit per test1 second」；现在剥掉它，得到「时间限制：1 second」。边缘复验已确认。

`lib/problem-enrichment-schema.mjs` 的 `statementSource` 白名单加了 `luogu-mirror`，并按 kind 校验地址：官方只认 codeforces.com 题目路径，镜像只认 `www.luogu.com.cn/problem/CF...`，防止把任意 URL 写成来源。表单侧把失败原因翻成中文可操作提示（`blocked` → 可上传 PDF 或手动粘贴），镜像结果提示「可能是中文翻译，建议对照原题核对」。

### 验证与仍然未验证的部分

- `test/problem-statement.test.mjs` 16 项全过：镜像小节转换/公式/图片/表格/`script` 丢弃、`samples` 补齐与去重、`pid` 不符与挑战页判 blocked、C3VK 挑战后带 cookie 重试、CF 成功时不访问镜像、CF 被拦时回退镜像、两者都失败时保留主来源原因、`not-found` 短路、`property-title` 不混入限制。
- `test/problem-enrichment-schema.test.mjs` 5 项全过：镜像来源地址的接受/拒绝与存取往返。
- `test/oauth-problem-statement.test.mjs`（3 项）直接驱动 Worker 的 `/api/problem-statement`：官方题面优先、403 挑战页时回退镜像（含 `kind`/`parserVersion`/`warnings`/正文）、题号非法时仍是 400 且不请求镜像。
- `npm run check` 全过：语法、训练索引校验、53 个测试文件（含此前在本沙箱因 `spawn EPERM` 跑不动的 `browser-build` 与 `generate-seo`）、构建 170 条记录。
- 边缘端到端实测（临时探针 Worker，跑的是同一份 `fetchStatement`）：上表的请求头对照、4A/158B/1700A 三题的官方题面、镜像解析，全部符合预期。
- 部署状态：前端已推 `main` 并由 GitHub Actions 发布（线上 `form-UUZM7OOA.js` 含 `journal-code-tools" open`、`luogu-mirror`、失败原因中文映射），Worker `algo-oauth` 已重新 `wrangler deploy`。**仍差真人在界面里点一次「抓取 CF 题面」**做最终确认——路由与会话这一层由 `test/oauth-problem-statement.test.mjs` 覆盖，网络这一层由探针覆盖，但没有真人的一次点击记录。
- 探针 Worker `algo-statement-probe` 用完即删；它的源码只在本地 `build/statement-probe/`（`build/` 已被忽略），不进仓库。

## 最新交接（2026-09-16）：训练状态拆分与提交表单重构

### 提交界面第三轮重排

- 桌面三个日期成组并排，下方为横向导入工具栏；手机训练日期独占一行，开始/结束并排，三个导入按钮等宽。
- 题目信息两行：名称/题号，平台/难度/标签。标签已移出训练状态区，四个状态输入保持独立。
- 移除每题及题面区重复边框和嵌套留白；题面与 AI 常驻，代码保留折叠。统一输入高度、按钮层级及底部保存条。
- 本轮实际查看桌面深/浅色和 390×844 手机截图，确认表单无横向溢出；选择独立完成、已掌握、待复习后，复习日期正确出现。截图位于本地 `artifacts/editor-redesign/`（不入库）。
- 本轮语法检查、构建与 6 项表单回归检查通过，布局扫描未报告问题。尚未部署。

本轮正在本地实现与验证，尚未提交或部署。用户已确认掌握自评独立；保留未完成题 15% 的活力权重，只消除复习、错题与完成结果的混淆。

- [设计方案](LEARNING-STATE-DESIGN.md)：复习题不等于错题，首次记录可自评已掌握，四项各自表达事实或安排。
- [专项规格](LEARNING-STATE-SPECIFICATION.md)：v5 字段、旧 mastered 兼容、活力不变量、表单与全链路验收。
- 本轮接续用户通过 DeepSeek 完成的题面与附件功能；保留相关链路。
- 根据界面反馈再次调整：日期/连续训练区间压缩为紧凑网格，快速导入按钮横向排列并可换行；题面与 AI 辅助改为常驻区域，不再折叠。
- 历史章节中的「非错题 / 待复习 / 已掌握」三态由本专项替代；历史部署记录不代表本轮已上线。

## 最新交接（2026-09-15）：题面归档与 AI 补全设计

**本轮已进入实现，未部署。** 先完成设计与 specification，随后由 Terra 子代理实现了部分业务链路；仍需在合并前完成一次人工 UI 冒烟和部署环境验证。

- [设计方案](PROBLEM-ENRICHMENT-DESIGN.md)：PDF 题面归档、复制提示词并打开 DeepSeek、粘贴 JSON 预览回填、Codeforces 题面补全，以及界面状态与实施顺序。
- [专项技术规格](PROBLEM-ENRICHMENT-SPECIFICATION.md)：v4 扩展字段、AI JSON 协议、附件保存/读取与条件事务、CF 解析规则、兼容和验收矩阵。
- 核查结论：`fetchCodeforcesAccepted` 只读提交 API，未抓题面；`planLogChanges` 会删除目标清单以外的文件，附件必须纳入完整保存链路，不能只加上传控件。
- 固定方向：不新增模型 API；用户自行在网页版上传 PDF/截图并粘贴回答。原题与 AI 分析分离；官方评分优先；已应用估计值保留来源。首期 PDF 沿用 Git，一题一份、单份 5 MiB、单次新增总量 10 MiB。
- 已实现：AI 分析绑定/严格 JSON 校验、v4 来源字段、CF 单题抓取与降级、PDF v2 保存服务/幂等版本检查、表单提示词预览与字段回填、静态详情/导出附件投影。仍需重点复核旧写入口兼容、浏览器 IndexedDB 附件选择和部署 Worker 的 multipart 实测；不得把未验证的外部网络能力当成已验收。
- 外部验证边界：已核查 Codeforces 官方 Problem 对象不含正文；DeepSeek 页面此次读取为 403，未验证登录后的附件能力、额度或部署 Worker 的抓取可达性。
- 本轮专项测试与语法检查已通过；完整验证曾因既有 LaTeX 长 URL 溢出失败，已修复并单独通过 `test/export-latex.test.mjs`。部署和真实浏览器操作尚未完成。

### 2026-09-15 补记：v2 日志保存链路已接线

前一轮的 `workers/services/logs-v2.mjs` 只被单元测试引用，Worker 里没有任何路由，前端也仍走不带版本的 `/api/logs/date`——「PDF v2 保存服务」当时并不可达。本轮把它接到真实入口：

- `workers/oauth.mjs` 新增 `/api/v2/logs/dates/:date`（GET 带 `version`/`ETag`；PUT 接受纯 JSON 或 multipart；DELETE 需 `expectedVersion`）与 `/api/v2/logs/dates/:date/problems/:recordId/statement`（`application/pdf` + `nosniff` + `attachment`）。
- GitHub 适配器补齐二进制能力：`readBytes`、`listFileEntries`（返回 `{path, sha}`，blob SHA 本地计算，不额外请求 Contents API）、`commit` 支持 base64 blob；删除仍用 null blob sha。
- 附件、正文与个人训练索引在同一 commit 落盘；索引缺失按既有语义返回 503 `INDEX_STALE`，不产生半提交。
- 前端仍使用旧写入口，尚未接入 v2；本轮只保证服务端闭环可用并有 Worker 级测试。

**同时修掉三个真实缺陷**（均由新增的 Worker 级测试暴露，不是测试替身问题）：

1. `gitBlobSha()` 在文本路径被传入字符串时，`bytes.length` 是 `undefined`，头部变成 `blob undefined\0`，所有文本文件的 blob SHA 全部算错。现已先按 UTF-8 编码再计算。
2. `logs-v2` 的日期版本指纹取的是「提交后的预测文件清单」，且把个人索引（位于日期目录之外、每次保存都会被重写）也算进去，导致保存返回值与随后的 GET 永不相等——客户端每次保存后都会看到幻影版本冲突。现在版本只覆盖该日期自己的文件（含该目录下的 PDF），与读取端计算一致。
3. `canonical()` 的叶子分支直接 `JSON.stringify(value)`，遇到 `undefined` 会输出裸 `undefined` 词元，而 `problem.outcome`、`log.updatedAt` 等可选字段经常就是 `undefined`——写出的幂等回执不是合法 JSON，重试时解析失败返回 502。`logs-v2.mjs` 与 `oauth.mjs` 两份实现都已按 `null` 归一。

本轮验证：`node scripts/check-syntax.mjs` 76 个文件通过；`node scripts/run-tests.mjs` 363 项全部通过（常规 325 + Worker 38）；`node scripts/reindex-training.mjs --check` 索引最新；`npm run build` 生成 167 条记录。新增 `test/oauth-logs-v2.test.mjs`（8 项）覆盖：缺失幂等键、PDF 落盘与哈希、statement 字节与响应头、过期版本冲突、同键重放不二次提交、删除、索引同 commit、索引缺失时 fail-closed。

仍待完成：前端改用 v2 并携带 `expectedVersion`（旧 `/api/logs/date` 目前仍是无版本旁路）；浏览器 IndexedDB 附件选择与恢复；部署环境 multipart 与 CF 抓取可达性实测。

### 2026-09-15 补记（二）：条件写入、附件链路与数据完整性

上一节的「仍待完成」三项本轮全部落地。这一轮的重点不是加功能，而是把**会静默出错的地方**堵住——下面 5 个缺陷里有 4 个是真实的数据损坏或静默失效，不是测试替身问题。

**1. 旧写入口不再是「无版本旁路」**

`/api/logs/date` 的 GET 现在返回 `revision`；PUT/DELETE 必须回传 `expectedVersion`（请求体字段，或 `If-Match`）。缺失 → 428 `PRECONDITION_REQUIRED`；过期 → 409 `VERSION_CONFLICT` 且带 `currentRevision`；格式非法 → 422。首次创建必须显式传 `null`，不允许靠缺省值蒙混。保存响应回传新 `revision`，因此连续编辑保存不必刷新页面。

前端所有写入口都已带上版本：整日保存与删除（`lib/form.mjs`）、首页复习队列的快捷流转（`lib/renderer.mjs`）。草稿恢复路径不知道服务端版本，保存前会先读一次，绝不拿猜测的版本去写。

**2. 版本范围收敛（两侧一致）**

版本只覆盖该日期目录自身的文件（含该目录内的 PDF），不含位于日期目录之外、每次保存都会被重写的个人索引。两条路径（旧接口的 Contents API 列表、v2 的 tree 列表）现在用同一个 `revisionFromEntries()`，并有测试双向断言「旧接口读到的版本 → v2 保存可用 → v2 返回的版本 → 旧接口读取复现」。这条不变量是「平时走旧接口、只有传 PDF 时才切 v2」这个设计成立的前提。

**3. 修掉 5 个真实缺陷**

1. `gitBlobSha()`（上一节已述）文本路径 blob SHA 全错。
2. `logs-v2` 日期版本指纹含提交后预测与个人索引，保存值与随后 GET 永不相等（幻影冲突）。
3. `canonical()` 输出裸 `undefined` 词元，幂等回执不是合法 JSON，重试 502。
4. **旧接口保存会删掉已归档的题面 PDF。** `planLogChanges` 把「不在期望清单里的既有文件」一律删除，而它从不认识 `*-statement-*.pdf`——于是只要对某天做一次普通保存，meta.json 里的附件引用就指向一个刚被删掉的文件。现已把被引用的 PDF 纳入保留集，并在引用消失时清理孤立 PDF。
5. **旧接口能写出悬空附件引用。** 它没有上传字节的能力，却接受任意合法的 `statementAttachment`。现在对「新增或变更引用」直接 422 `ATTACHMENT_REQUIRES_V2`，原样回传既有引用仍允许（表单编辑既有记录正是这个用法）。

另外修掉一个会让错误处理整体失效的问题：Worker 里有 5 个 handler 以 `return handleX(...)` 返回 promise 而没有 `await`，`try/catch` 根本看不到它们的 rejection——版本冲突不会返回 409 JSON，而是变成未处理的 rejection。这 5 处都已改为 `return await`。

**4. 浏览器端 PDF 附件**

- 新增 `lib/attachment-store.mjs`：IndexedDB 保存「已选好但还没保存」的 PDF（按 账号+日期 一条记录）。所有方法返回状态而不抛异常，隐私模式/配额/无 IndexedDB 时表单仍可正常填写与提交，只是失去本地恢复能力。
- `lib/form.mjs` 每题新增附件区：选择题面 PDF、替换、移除，并区分「已归档 / 待保存 / 已标记移除」三种状态；已归档的提供下载链接（走 v2 statement 路由）。
- 保存时若涉及附件，改走 `/api/v2/logs/dates/:date` 的 multipart（payload + 每个 PDF 一个分区 + `Idempotency-Key`）；不涉及附件时仍走旧 JSON 接口。v2 的 payload 必须**省略** `statementAttachment`（服务端对无动作题目沿用旧引用、对 replace 用上传结果的哈希覆盖、对 remove 要求引用缺席），旧接口则必须**原样回传**该引用。两者分工写在代码注释里，并有测试守着。
- 选择 PDF 时会同时持久化草稿：题目 id 是客户端生成的，只有草稿把它保留下来，刷新后重建表单才能拿到同一批 id。恢复时按 id 匹配，匹配不上的孤立文件会被清掉并如实提示，而不是显示「已恢复」却什么都没接上。

**5. 本轮验证（全部在本机实际执行）**

- `npm run verify`（即 CI 的 `npm run check`）退出码 0：语法检查 78 个文件、训练索引最新、测试 392 项全部通过（常规 342 + Worker/接口 50）、`npm run build` 生成 167 条记录。
- 新增浏览器冒烟 `scripts/smoke-attachment.mjs`（Playwright + msedge，`npm run preview` 起静态服务后运行）：16 项断言全过——附件区确实出现在构建产物里、选中 PDF 后落入 IndexedDB、**刷新页面后仍能恢复**、保存发出的是带幂等键的 multipart 条件写入、payload 含 `schemaVersion:4` 与 replace 动作与 PDF 字节、**不含** `statementAttachment`、成功后本地待上传记录被清除、无未捕获页面错误。
- 既有 UI 检查无回归：`scripts/check-ui.mjs` 无溢出无错误，`scripts/check-details-ui.mjs` SPA 与 Markdown 导出正常。
- 新增测试文件：`test/oauth-logs-date.test.mjs`（旧接口 6 项）、`test/attachment-store.test.mjs`（8 项）、`test/journal-api.test.mjs` 扩容（v2 multipart 请求构造）、`test/oauth-logs-v2.test.mjs` 增加跨路径版本一致性。

**仍未验证 / 未完成（不要当成已验收）**

- **Worker 尚未部署。** `.github/workflows/deploy.yml` 只发布静态站点到 GitHub Pages，Worker 需另行 `wrangler deploy`（本会话没有 Cloudflare 凭据）。在部署新 Worker 之前，前端发出的 `Idempotency-Key`、multipart 与 428/409 契约在线上都不存在。
- 部署环境的 multipart 实测、Codeforces 题面抓取可达性、网页版 DeepSeek 的附件能力仍未验证。
- `expectedVersion` 只在旧接口与 v2 之间互认，`/api/v2/me/*` 那套训练接口仍是独立的条件写入实现。
- 真实数据里仍没有任何 `statementAttachment` / `aiAnalysis` / `outcome` 字段：v4 特性全部是「代码已实现并有测试」，没有一条真实记录验证过。

### 2026-09-15 补记（三）：上线与回滚

上一节的三项「仍未验证」中有两项本轮落实了：**Worker 已部署上线**，**multipart 在真实 workerd 运行时上实测通过**。剩下的一项（CF 题面抓取可达性）仍未验证。

**部署记录（可按版本号回滚）**

| 版本 | 时间 | 说明 |
| --- | --- | --- |
| `671abdc5-3082-4630-973a-ad2f715c94c2` | 2026-09-13 | 本会话之前的线上版本，即回滚目标 |
| `3cffbb00-598b-49eb-8ce4-eb0fa5a36dcb` | 2026-09-15 | 本轮首次部署（**已回滚**，原因见下） |
| `0b56f682-7287-49f7-9a26-bca71f20b621` | 2026-09-15 | 前端上线后重新部署，**当前线上版本** |

前端发布走 `main` 分支 push → GitHub Actions（`npm run check` + Pages）。本轮两个提交：`27e97fe`（条件写入 + 附件 + 题目增强）、`c4329c7`（LaTeX 星标字形）。

**踩到的坑：破坏性 API 变更必须先于其客户端上线，顺序反了就是线上故障**

首次只部署了 Worker。但旧前端（`form-BQXMR5IY.js`）**完全不含 `expectedVersion`**，而新 Worker 的旧写入口是刻意不给「无版本 PUT」旁路的（见 `workers/oauth.mjs` 注释），于是所有队员保存记录都会拿到 **428 PRECONDITION_REQUIRED**——这是一次真实的生产故障，由部署顺序错误造成。

处置：立刻 `wrangler rollback` 回 `671abdc5` 恢复服务，然后按正确顺序重新发布——**先**把前端推上线（确认线上 `form-*.js` 与共享 chunk 已含 `expectedVersion`、`Idempotency-Key`、`btn-pick-statement`、`journal-attachments` 标记），**再**部署 Worker。两次部署都保留了既有 secret（`wrangler deploy` 不会清空既有 secret）。

**教训记在这里**：`/api/logs/date` 的版本要求是硬性的、没有兼容旁路，所以 Worker 不能单独先上线。若将来还要再收紧契约，正确做法是先在过渡期接受旧客户端（或双写／特性开关），而不是直接切换。

**顺带修正两个我先前说错的结论**

1. **「v2 路由返回 `AUTH_REQUIRED` 而不是 404，所以新代码已上线」是错的。** 实测 `/api/v2/definitely-not-a-real-route` 返回**完全相同**的结构化 401 与 `requestId`——鉴权闸在路由分发之前，匿名探测根本区分不出路由是否存在；而且那套 v2 错误信封在 `671abdc5` 上就已存在，不是本轮新增。判断线上跑的是哪个版本，只能看 `wrangler deployments list` / `rollback` 的输出。
2. **「LaTeX 缺字形会让 CI 失败」是错的。** CI（`ubuntu-latest`）没有装 TeX，`test/export-latex.test.mjs` 里 `if (!XELATEX) t.skip(...)` 会整段跳过；那两条 2026-09-14 日志在 CI 上是绿的。缺字形只在**装了 xelatex 的机器**上暴露（本地全量验证会红）。修仍然要修，但它当时并没有挡住 CI。

**修掉：洛谷难度星标 ★ 被 LaTeX 静默丢字形**

新导入的日志把难度写成 `"★ 1200"`，`★`(U+2605) 不在 `LATEX_SYMBOLS` 里，正文拉丁字体没有该字形，xelatex 只记一条 `Missing character` 就把字符丢掉（实测 2 个）。已映射 `★`→`\bigstar`、`☆`→`\star`（前导已加载 `amssymb`）。

这里也修掉了一个我自己写坏的测试：起初我加了一条「凡是非 CJK 非 ASCII 且未被映射的字符就报错」的全量扫描，它把 `†`(U+2020) 也报了出来——但 Latin Modern **有** `†` 字形。**「不在映射表里」不等于「缺字形」**，那条测试前提就错了，已删除；是否缺字形的判据交给既有的「整篇编译 + 断言 `missingCharacters === 0`」，它是实测而非猜测，且零误报。

**新增：workerd 跨运行时探针（`npm run probe:workerd`）**

`test/oauth-logs-v2.test.mjs` 是用 Node 的 `Request` 直接调 `worker.fetch`，走的是 undici 的 multipart 实现，**不是** Cloudflare 的 workerd。上传 PDF 依赖两个只有真实运行时才能证明的假设，本轮用 `wrangler dev`（生产同款运行时，本地跑）实测：

- workerd 能正确解析浏览器 `FormData` 生成的分区：分区名、`payload` JSON、`expectedVersion: null`、`replace` 动作、CJK 文件名、`application/pdf`、字节长度、`%PDF-` 魔数全部原样保留；
- **workerd 的 `crypto.subtle.digest("SHA-256")` 与客户端算出的哈希逐字节一致**——两边不一致，服务端就会把正常上传判成哈希不匹配。

11/11 通过。探针已提交为 `scripts/probe-workerd-multipart.mjs`，可随时重跑。

**本轮验证**

- `npm run verify`（即 CI 的 `npm run check`）退出码 0：语法 78 个文件、训练索引最新、**392 项测试全过**、构建 169 条记录。
- `node scripts/probe-workerd-multipart.mjs` 11/11 通过。
- GitHub Actions run [34979614977](https://github.com/only-matthew/Algo-Training-Journal/actions/runs/34979614977) `success`；线上 `form-RPNFSVV4.js`(59,846B) 与共享 chunk 均已含新标记。
- 浏览器冒烟 `scripts/smoke-attachment.mjs` 16 项断言全过（针对本地构建产物）。

**仍未验证（本轮之后）**

- Codeforces 题面抓取在 Cloudflare 出口的可达性（README 已说明 CF 有反爬，源码抓取本就不可用）、网页版 DeepSeek 的附件能力，均未验证。
- **附件上传（multipart + PDF）在线上还没有被真人跑过。** 普通文字保存已有真实证据（见下），但 `statementAttachment` 仍是零真实数据。
- 导入面板写入的 `difficulty: "★ 1200"` 与既有日志的 `普及-` / `1000-1199` 三种格式并存；报表与筛选是否都覆盖了星标格式，未逐一核对。

**意外的真实端到端证据：线上保存已跑通**

收尾时从 `origin/main` 拉到 `8551e44 save(王梓豪): training log for 2026-09-15`，提交时间 **2026-09-15T15:29:54Z**——比新 Worker `0b56f682` 上线（**14:10:46Z**）晚 79 分钟。也就是说这是**真人用真实 OAuth 会话、经过新前端 + 新 Worker 完成的一次真实条件写入**，不是推测：

- 写入的 `meta.json` 是 `schemaVersion: 4`，`id` 是客户端生成的 UUID，带 `outcome: "hinted"`、`difficultyRating: 1500`、`fileIndex: 0`；
- `training/members/wzzzzhhhhh/indexes/legacy.json` 与日志在**同一个 commit** 里更新——这正是「索引必须与日志同 commit 落盘，否则 503 INDEX_STALE」那条设计要求的线上验证；
- 该笔写入没有触发 428/409/422。

两点随之需要修正或注意：

1. 上一节写的「真实数据里仍无 `outcome` 字段」**已不成立**：这条真实记录带了 `outcome: "hinted"`。`statementAttachment` / `aiAnalysis` 仍是零真实数据。
2. 该记录的 `difficulty` 就是 `"★ 1500"`——说明星标**不是**某条日志的偶然写法，而是**当前线上写入路径的常规格式**。所以那个 `★` 字形修复不是修个例；不修的话，此后每条洛谷日志都会在 LaTeX 导出里丢掉一个字符。

真正仍未被真人验证的只剩**附件上传本身**（选择 PDF → multipart 上传 → 服务端落盘 → 回读下载）。请登录后传一份题面 PDF 确认。

更新时间：2026-08-28（架构整理）／2026-09-11（活力指数与难度统一，见文末「本轮改动」）

## 当前状态

项目是一个「Git 仓库保存训练日志 + 静态站点展示 + Cloudflare Worker 写入」的协作式算法训练日志。

（2026-08-28 那轮）仅做了技术与架构整理，**没有改变产品功能、日志格式、Worker API 或部署流程**。

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
| `lib/application.mjs` | 前端组合根：创建/替换渲染器、手动刷新、跨页面数据加载。 |
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

- 63 个 JS/MJS 源码文件通过语法检查。
- 290 个测试通过（业务测试 286 + Worker 测试 4；其中 `test/export-latex.test.mjs` 会真编译全部真实日志）。
- `node scripts/generate-data.js` 成功生成 159 条日志、3 位成员的静态站点。
- `git diff --check` 通过。

- 测试会重写受忽略的 `site/`；导出相关的回归测试会把中间产物写在受忽略的 `build/latex-test/` 下，仓库里不再有生成的 `.tex` 文件需要人工确认。

## 导出的回归测试

`test/export-latex.test.mjs` 直接 import `lib/export-content.mjs`（与浏览器共用同一份生成逻辑），并对 `logs/` 里的真实日志做真实编译：

- 若 `PATH` 里有 `xelatex`，会把**全部**真实日志拼成一份批量文档编译，断言零 `!` 错误、零 `Overfull \hbox`、零 `Missing character`；另有 8 个「历史故障样例」（题名含 `#`、单字符公式 `$n$`、`\boxed`、中文代码注释、代码里混入 `\end{lstlisting}`、Unicode 数学符号等）。
- 没有 TeX 发行版时自动 skip，不会让 CI 变红；此时仍会跑纯文本断言。
- 旧版 `test-latex.mjs` 把生成逻辑复制了一份，正是它掩盖了「题名里的 `#` 让 LaTeX 编译失败」等问题，已删除。

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

---

## 本轮改动（2026-09-13）：活力 v2、个人统计与区间契约

- 活力算法更新为 v2，所有带 Rating 的平台走同一条计分路径；个人页新增活力折线、平台计入明细和守恒校验。算法与局限见 [VITALITY-V2.md](VITALITY-V2.md)。
- 新增 `lib/vitality-summary.mjs`、`lib/member-vitality.mjs`、`lib/vitality-chart.mjs`；`site/data/all.json` 和个人静态页由构建自动生成，不能手改 `site/`。
- 新增 `lib/training-interval.mjs`：提供 `validateTrainingInterval`、`expandTrainingInterval`、`mergeTrainingDates`，已接入表单、Worker Schema 和热力图日期展开；结果字段 `outcome` 已接入表单、Schema、Worker 和构建，事件级同题结算仍未接入。
- [PENDING-FEATURES.md](PENDING-FEATURES.md) 已重写为评审版：`fileIndex` 与区间字段基础链路已完成，下一步接入事件级结果投影和同题结算。
- 当前验证：构建成功（165 条记录）；`npm test` 全部通过；专项活力、图表和区间测试全部通过；语法检查覆盖 72 个源码文件。

---

## 本轮改动（2026-09-11）：活力指数与难度统一

> 以下内容为 2026-09-11 那轮实现，与上文 2026-08-28 的架构整理相互独立。

本轮围绕三条队员反馈做了实现：**难度是「题 × 人 × 时间」的属性**、**同题判定错误**、**难度口径不直观**。完整的算法推导与依据见 [VITALITY-DESIGN.md](VITALITY-DESIGN.md)，尚未实施的区间打卡见 [PENDING-FEATURES.md](PENDING-FEATURES.md)。

### 0. 一句话摘要

新增「活力指数」：把每道题按 `(题目 Rating + 当时水平)` 折算成学习增量，**在累计题数完全不变的前提下并排展示**；同时把全站难度统一为 Codeforces Rating，并修掉一个会让不同场次题目被误判成同一道的真 bug。

### 1. 新增模块（纯函数，构建端与浏览器端共用）

| 文件 | 职责 | 关键导出 |
| --- | --- | --- |
| `lib/rating.mjs` | 难度统一为 CF Rating 的唯一入口与展示口径 | `resolveDifficultyRating()`、`ratingLabel()`、`ratingTone()`、`ratingOptions()`、`DIFFICULTY_LABEL_RATING`、`RATING_BAND_VALUES`、`STANDARD_RATINGS`、`parseRatingLabel()` |
| `lib/vitality.mjs` | 活力指数计算 | `problemVitality()`、`computeVitalityTimeline()`、`optimalRating()`、`abilityFromEvidence()`、`applyForgetting()`、`predictSuccess()`、`matchFactor()`、`abilityGain()`、`baseVitality()`、`ratingToDifficultyScale()`、`vitalityLevel()` |

两个模块都**不读时钟、不碰 DOM、无 IO**，因此可在 Node 里直接单测（`renderer.mjs` 依赖 DOM，测不了——`vitalityLevel` 就是为此从 renderer 移出来的）。

### 2. 修改的既有模块

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `lib/problem-identity.mjs` | 新增 `isCompleteProblemNumber()` 与 `COMPLETE_NUMBER_PATTERNS`；`canonicalProblemKey()` 增加**题号完整性校验**，残缺题号返回 `null` | **真 bug 修复**：原先只判断「平台和题号非空」，导致 `Codeforces` + `B` 成为合法 key，9 个不同场次的 A 题、8 个 B 题塌缩成同一道 |
| `lib/problem-links.mjs` | 新增导出 `resolveCodeforcesProblemNumber()`；`originalProblemUrl()` 在题号**残缺**（不只是为空）时回退到名称解析 | 同一 bug 的另一半：`题号=B` + `名称='Codeforces Round 1108 (Div. 2)'` 的记录原本链接为空 |
| `lib/log-schema.mjs` | 新增 `normalizeDifficultyRating()`；`normalizeMeta()` / `validateLogInput()` / `metaFromProblems()` 透传 `difficultyRating`（非正数视为缺失，不写 `null`） | 原先 `normalizeMeta` 是白名单，会把新字段过滤掉，导致构建产物里没有 Rating |
| `lib/ui.mjs` | 记录卡片难度徽章改用 `ratingLabel()/ratingTone()`；新增「活力 x.xx」徽章 | 展示统一为 `★ 1200` |
| `lib/problem-detail.mjs` | 详情页徽章与「题目信息 → 难度」改用 Rating | 同上 |
| `lib/form.mjs` | 难度下拉改为 Rating 档位（`★ 800`~`★ 2900`）；新增 `setDifficultyValue()`、`ratingDisplay()`；导入回填与导入列表都走 `resolveDifficultyRating()`；提交时带 `difficultyRating` | 表单是唯一还能产生旧格式标签的入口 |
| `lib/renderer.mjs` | 新增 `difficultyText()` 局部助手；难度筛选下拉与统计改为 Rating 口径；`renderHeatmap()` 增加活力口径参数；新增 `renderVitalityChart()` | 展示层统一 |
| `scripts/generate-data.js` | 新增 `buildVitality()`；`buildHeatmapCounts()` 增加活力口径（`valueAll`/`valueByMember`）；`overviewData` 增加 `vitality`/`vitalityAllDaily`/`totalVitality`；`logSummary`/`recordSummary`/`buildProblemIndex`/`buildReviewQueue` 带上 `difficultyRating` 与 `vitality` | 构建期一次算完，避免前端重复计算 |
| `index.html` | 累计题数卡片内并排加入活力徽章；新增「活力曲线」面板 | **题数展示一个字未改**，活力为并排新增 |
| `style.css` | 补齐 `entry`/`basic` 两个新难度档位的配色（含暗色主题）；新增 `.vitality-badge`、`.vitality-inline`、`.vitality-chart-*`、`.hint-inline` 样式 | 原先只有 easy/medium/hard/expert 四档 |

### 3. 新增运维脚本

三个脚本**都是默认 dry-run、`--write` 才落盘、幂等、保留原值便于回滚**：

| 脚本 | 作用 | 原值字段 | 来源字段 |
| --- | --- | --- | --- |
| `scripts/repair-problem-identity.mjs` | 按官方数据补全残缺题号 | `problemNumberLegacy` | 报告里说明依据 |
| `scripts/backfill-difficulty.mjs` | 为无难度的记录补难度 | `difficultyLegacy` | `difficultySource` |
| `scripts/backfill-rating.mjs` | 把一切难度口径换算为 Rating 数值 | `difficultyLegacy` | `difficultyRatingSource` |

**必须知道的坑**：

- **场次序号 ≠ contestId**。`Codeforces Round 1108` 的 contestId 是 `2246`，`Round 1114` 是 `2254`。开发早期曾把场次序号当题号写入，实测 24 条全部错误（官方 problemset 里不存在），已全部纠正。
- 官方数据来源：`codeforces.com/api/contest.list`（序号 ↔ contestId ↔ 开始时间）、`codeforces.com/api/problemset.problems`（题名 → 题号 + rating）、洛谷题目页内嵌 JSON 的 `difficulty` 字段（8 级）。
- 换算表集中在 `lib/rating.mjs`，脚本与表单共用同一份；**不要在两处各维护一份**。

### 4. 数据改动（`logs/`，需在提交信息里说明）

| 改动 | 规模 | 说明 |
| --- | --- | --- |
| 题号修正 | 44 条记录 | 补全残缺题号（如 `B` → `1108B`），并修正早期错误的 contestId |
| 难度补全 | 67 条记录 | 无难度记录按官方数据补全，其中 16 条为推断（校内自建题、尚未 rated 的场次），逐条注明依据 |
| 难度统一为 Rating | 165 条记录 | 每条带 `difficultyRating`，**全库难度覆盖率 100%**，`未标注` 归零 |
| `training/` 索引重建 | 3 个文件 | `subjectKey` 从记录级（`record:...:legacy-xxx`）升级为题目级（`problem:洛谷|P5143`） |

改动字段全部是**新增**的（`difficultyRating` / `problemNumberLegacy` / `difficultyLegacy` / `difficultyRatingSource`），旧的 `difficulty` 与 `problemNumber` 语义保留未删。

### 5. 新增测试

| 文件 | 覆盖 |
| --- | --- |
| `test/rating.test.mjs` | 非 CF 平台也能落到 Rating；数值优先于标签；历史脏值归位；档位配色与升序 |
| `test/vitality.test.mjs` | **目标难度随水平上移**；同一道题对不同水平价值不同；入门题上限低于提高题；匹配度峰值；未完成只给 30%；能力饱和与遗忘地板；时间线能力演进 |
| `test/vitality-heatmap.test.mjs` | 活力分档：1 道提高题与 3 道入门题颜色不同；分档单调不减 |
| `test/problem-identity-regression.test.mjs` | **场次序号 ≠ contestId**；残缺题号绝不生成聚合 key；平台标错不误聚合 |
| `test/problem-links.test.mjs` | 完整题号直接生成链接；两种残缺形态的名称回退；解析不出时留空不猜 |
| `test/aggregation.test.mjs`（改） | 新增断言：残缺题号不参与聚合，不同场次不被误判同题 |

### 6. 验证结果

- `npm run check` 全绿：**语法 68 文件、317 + 4 测试通过**、训练索引最新、构建 165 logs。
- 构建产物抽查：165 个题目页徽章**全部**为 `★ N`，非 Rating 与 `未标注` 均为 0。
- 三个脚本次幂等验证通过（重跑报告 0 条待处理）。

### 7. 本轮遗留与后续接手点

1. **完成质量未接入**：公式已有 `credit`（没做出来 = 0.3），但记录里暂无 `outcome` 字段，当前一律按「做出来了」处理。见 [PENDING-FEATURES.md](PENDING-FEATURES.md)。
2. **曲线开头活力为 0**：`θ₀ = 0.5`（零基础）面对 ★1000 的题匹配度≈0，导致入门期曲线平坦。可选调整：提高能力起点，或减少多标签均摊（当前多标签题的增益按标签数均摊，会让能力被低估）。**待队员反馈后再定。**
3. **目标难度带未可视化**：目前只用数据点颜色表达「是否达标」，若要更醒目的横带需另加。
4. **表单仍会丢新字段**：`metaFromProblems` 已透传 `difficultyRating`，但 `difficultyLegacy` / `difficultyRatingSource` 等审计字段不在 Schema 白名单里，**队员通过网页编辑某天记录后这些字段会消失**。功能不受影响（`difficultyRating` 在），但审计信息会丢。
5. **本轮未提交**：改动横跨代码、数据、文档三层；提交前建议先跑 `npm run check`，并确认 `logs/` 的批量改动在 commit message 里说明清楚。

6. **文件槽位已稳定化**：日志 `meta.json` 可选保存 `fileIndex`。表单加载和 Worker 读写都会优先使用该槽位，题目重排不会再让描述、题解串位；旧记录仍按数组序号兼容读取，新题目保存时自动分配未使用槽位。对应测试在 `test/log-schema.test.mjs` 与 `test/oauth-plan.test.mjs`。

**接手建议顺序**：先读 [VITALITY-DESIGN.md](VITALITY-DESIGN.md) 第 3–4 节搞清公式与参数，再看 `lib/vitality.mjs` 的实现，最后按 [PENDING-FEATURES.md](PENDING-FEATURES.md) 的 A–E 阶段做区间打卡。

