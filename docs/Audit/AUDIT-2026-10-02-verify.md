# 复核审计报告：Algo Training Journal

审计日期：2026-10-02（23:30–23:55 UTC+8）。审计对象：`HEAD = 691b218`（工作区干净；审计前后 `git status --porcelain` 均为空）。
审计范围：**复核导向**——本轮不重做全量普查，而是对 [AUDIT-2026-10-02.md](AUDIT-2026-10-02.md) 声称"已修复"的项目做独立复验，再对 Worker 写入层、构建系统、产物卫生、CI 门禁四个方向做补充普查。
方法：3 个只读并行审计分支（Worker/API、前端与构建、文档与流程）+ 主审计人独立复算全部高风险结论（含 4 次真实构建的字节级对比）。
本文只新增本文件，未修改任何生产代码、测试、训练数据或生成产物；审计产生的临时目录（`site-baseline/`、临时哈希文件）已删除。

**证据等级标记**：`[实测]` = 本次实际运行并复现；`[静态]` = 逐行阅读源码得出；`[待复测]` = 需线上环境才能确认。
**状态标记**：`新版` = 上一轮未记录；`上轮未落地` = 上一轮声称修复但代码里不成立；`上轮已确认` = 复核后确认已落地。

---

> **后续处理（2026-10-03）**：用户明确维持“浏览器回归不进入日常 Action，以保持构建速度”的决定。本文 §2.1 与 §9 的恢复浏览器 CI 建议未采纳；原 P0 定性不作为当前修复要求。浏览器回归仍可本地按需执行。其他项目的工作区修复见末尾 §10，原审计正文保留为历史证据。

## 0. 结论摘要

**上一轮审计的修复"落地率"是真实的，但它的验收口径本身是空的。**

上一轮报告（`AUDIT-2026-10-02.md:5`、`CURRENT-STATE.md:5`）把"浏览器回归自本轮起在 `checks.yml` 的 `e2e` job 中执行"当作验收证据。这条陈述在字面上成立、在事实上不成立：该 job 只挂在 `pull_request` 触发器上，而本仓库 **397 个提交里没有一个 PR 合并提交**，唯一的 remote 是 SSH 直推。也就是说，为修复"提交页没有任何门禁保护"而新增的那套 e2e，**从落地当天起就没有运行过一次**。这是本轮最重要的结论：它解释了为什么上一轮能同时声称"17/17 通过"与"门禁已覆盖"。

除此之外，本轮发现一个会造成**写入已成功却向用户报失败**的真实 bug、一个让增量构建收益损失约 2/3 的缓存键缺陷，以及一条低危但可复现的 markdown 链接逃逸。

| 级别 | 数量 | 说明 |
| --- | --- | --- |
| 严重（P0） | 1 | e2e 门禁空转：17 条用例从未运行，主分支发布对浏览器行为零保护 |
| 高（P1） | 3 | 配额误判 429 假失败、增量构建被时钟击穿、`listFileEntries` 的 N+1 子请求 |
| 中（P2） | 8 | 链接协议逃逸、产物隐藏标记、凭据入库、文档状态失真、PWA/备份缺口 |
| 低 | 6 | roadmap 页无复用、测试假绿、未使用实现、CSS 多代叠加 |
| 已否定 | 4 | 上一轮与并行审计中的 4 条不成立结论（§5，避免下游照做） |

**按 影响×置信 ÷ 工作量 排序的五个动作：**

1. 给 `checks.yml` 加 `push: branches: [main]` 触发器——否则本轮复验出的所有前端问题都无人看守（§2.1）。
2. 把 `X-RateLimit-Remaining === 0` 的判定移进 `!response.ok` 分支（§3.1）。
3. 把构建时钟从 `buildShellHash` / `problemShellHash` 里剔除（§3.2）。
4. `listFiles` 直接透传 tree 条目的 `sha`，删掉逐文件 Contents 读取（§3.3）。
5. 修正 `isSafeUrl` 对 `//host` 的放行（§4.1）。

---

## 1. 审计方法与可复现证据

### 1.1 实际运行过的验证（`[实测]`）

| 命令 | 结果 |
| --- | --- |
| `npm run verify`（语法 + lint + 索引 + 单测 + 构建） | 退出码 0。语法检查 118 文件；`Generated 198 logs for 3 members`；运行后 `git status --porcelain` 为空 |
| `node --test`（worker 轮） | 92 项全绿，0 失败 |
| `test/*.mjs` 顶层 `test()` 计数 | **616**（92 oauth + 524 常规），与 `AUDIT-2026-10-02.md:363` 一致 |
| **构建增量实验 A**：固定 `SOURCE_DATE_EPOCH=1780000000` 连跑两次 | 第 1 次 `198 reused, 380 rebuilt`；第 2 次 `578 reused, 0 rebuilt` → 3.2 s |
| **构建增量实验 B**：仅把 epoch 改为 `1780000060`（+60 秒） | `198 reused, 380 rebuilt` → 21.5 s |
| **产物字节级对比**：连跑两次构建，对 `site/` 全部 910 个文件取 SHA-256 | 910/910 **完全一致**；跨分钟边界差异仅 `sw.js` 1 个文件 |
| 用 markdown 链接语法指向协议相对地址 `//evil.example/phish` | 输出 `<a href="//evil.example/phish" target="_blank" rel="noopener noreferrer">x</a>`（未拦截） |
| 用 markdown 链接语法指向 `javascript:` 伪协议 | 输出 `<p>x</p>`（正确丢弃链接、保留文本） |
| `git log --merges` / `--grep='Merge pull request'` | 7 / **0**（总提交 397） |
| `git remote -v` | 仅 `ssh://git@ssh.github.com:443/only-matthew/Algo-Training-Journal.git` |
| 产物体积统计 | `site/` 910 文件 23.08 MB：tags 180/10.3 MB、roadmap 47/5.89 MB、problem 198/2.84 MB、data 428/2.22 MB、member 3/0.38 MB |
| 单页隐藏标记统计 | `site/tags/贪心/index.html` 106.2 KB 中，5 个带 `hidden` 的 `<section>` 占 **17.1 KB（16%）** |
| `git ls-files workers/.wrangler` | 命中 `workers/.wrangler/cache/wrangler-account.json`（含 account id 与名称） |

### 1.2 未执行的操作

没有部署、没有调用线上 Worker、没有 `wrangler` 子命令、没有发送 QQ 消息、没有修改训练数据。因此线上 Worker 的实际提交号、Cloudflare 真实 CPU/子请求配额、GitHub 配额的真实耗尽频率属 `[待复测]`。

### 1.3 关于审计基线的说明

`docs/Audit/` 下现有三份审计并存：`AUDIT-2026-10-02.md`（全栈，370 行）、`PROBLEM-AUDIT.md`、`PRODUCT-AUDIT.md`。三者对同一批改动给出不同状态（详见 §4.4）。本文编号为独立复核，不覆盖也不替代上述三份；文中凡引用上一轮结论均标注文件与行号。

---

## 2. 严重问题（P0）

### 2.1 `[实测]` e2e 门禁空转：浏览器回归从未在真实流程中运行

**证据**
- `.github/workflows/checks.yml:3-6` — 触发器仅 `pull_request: branches: [main, master]` 与 `workflow_dispatch`。
- `.github/workflows/checks.yml:34-57` — `e2e` job 内 `npx playwright install --with-deps chromium` 与 `npm run test:e2e:ci`。
- `.github/workflows/deploy.yml` — 全文 `e2e|playwright` 匹配数 = **0**；该 job 只跑 `npm run check`（不含浏览器回归）。
- `git log --merges` = 7，全部形如 `Merge branch 'main' of ssh://…`（`git pull` 产物）；`git log --grep='Merge pull request'` = **0**；remote 只有 SSH 推送地址。

**问题**：`pull_request` 事件只在通过 GitHub PR 界面发起合并时触发。本仓库的实际开发流是直接 `git push` 到 `main`（397 个提交中 0 个 PR 合并提交），因此：

1. `checks.yml` 的两个 job（verify 与 e2e）只会在有人手点 `workflow_dispatch` 时运行；
2. 主分支发布路径（`deploy.yml`）只执行 `npm run check`，**不包含**任何浏览器测试；
3. 上一轮为"让提交页有门禁保护"而新增的 e2e（`AUDIT-2026-10-02.md` §2.3、`CURRENT-STATE.md:5`）实际保护范围为零。

这是"测试存在"与"测试生效"的区别。`e2e/journal.spec.mjs` 覆盖 375px/320px 响应式、草稿冲突、复习动作、导入回填等 17 条用例，全部处于休眠。

**修复建议**
1. 最小改动：`checks.yml:3-6` 增加 `push: branches: [main]`。代价是每次推送多一个 job；收益是 17 条用例立刻生效。
2. 若担心浏览器测试阻塞发布节奏：在 `deploy.yml` 增一个并行 job（`continue-on-error: true`）作为过渡，稳定后再转为门禁。
3. 同时给 `checks.yml` 补 `concurrency`（`deploy.yml:13` 已有），避免连续推送叠加排队。

**验收**：一次 `git push` 到 `main` 后，Actions 中 `Quality Checks` 被触发且 `e2e` job 实际执行 `playwright test`。

---

## 3. 高优先级（P1）

### 3.1 `[实测]` GitHub 配额头误判：写入成功后仍向用户报失败

**证据**
- `workers/storage/github-api.mjs:9-15` — 先取 `X-RateLimit-Remaining`，`remaining === 0` 即抛 429：
  ```js
  const remaining = parseInt(response.headers.get("X-RateLimit-Remaining"), 10);
  if (remaining === 0) { … throw Object.assign(new Error("GitHub API 请求配额已用完…"), { status: 429 }); }
  if (!Number.isNaN(remaining) && remaining < 10) { console.warn(…); }
  if (!response.ok) { … }
  ```
- `workers/services/legacy-logs.mjs:64-69` — 同一模式，位置更险：它在步骤 5 的 `PATCH /git/refs/heads/main` **已经发出并成功**之后才判定。

**问题**：GitHub 在**成功**响应里也会带 `X-RateLimit-Remaining: 0`——配额内最后一次调用就是这种情况。此时：

- `github-api.mjs` 把一次成功的 200 当成配额耗尽，抛 429；
- `legacy-logs.mjs` 更严重：commit 对象已创建、ref 已推进（写入**已落地**），函数却抛 429 给客户端。用户看到失败会重试，而重试读到的是已推进的 ref，于是撞上 `:70` 的 `422` 分支再 rollout `retry+1`，最终报"GitHub 更新引用失败"502。**数据已写入、UI 报失败、重试产生歧义**，这是典型的"看起来偶发"的写丢失/重复告警来源。

**触发条件**：白名单成员在 GitHub API 小时配额（认证用户 5000/h）耗尽前的那一次保存。频率不高，但一旦命中就是用户可见的错误报告与不必要的人工介入。

**修复建议**：把配额判定移进 `if (!response.ok)` 之内，或前置 `response.status === 403 || response.status === 429`。保留 `remaining < 10` 的 `console.warn` 作为观测。`legacy-logs.mjs:65-69` 同样处理。

**验收**：`test/gh-api.test.mjs:59-71` 目前只用 403 建模，等于把这个 bug 固化成了期望行为；补两条用例——「200 + `remaining: 0` 正常返回」与「legacy PATCH 200 + `remaining: 0` 不抛」。

### 3.2 `[实测]` 增量构建被构建时钟击穿：改 1 分钟重建约 2/3 的页面

**证据**
- `scripts/generate-data.js:27-29` — `BUILD_CLOCK = new Date()`（无 `SOURCE_DATE_EPOCH` 时）。
- `scripts/generate-data.js:211` — `SITE_BUILD_TIME` 由 `BUILD_CLOCK` 格式化到 **分钟**，写入页脚（`:227`）。
- `scripts/generate-data.js:1286-1296` — 用**已含页脚时间戳的 HTML** 计算指纹：
  ```js
  const html = writeVersionedIndex(dataVersion);
  const $shellFingerprint = cheerio.load(html);
  $shellFingerprint('meta[name="journal-data-version"]').attr("content", "dataset-version");
  buildShellHash = contentHash($shellFingerprint.html());   // ← 页脚时钟仍在其中
  ```
- `:525`、`:435` — 题目页与成员页的缓存键分别以 `problemShellHash` / `buildShellHash` 为输入。

**问题**：增量缓存键包含墙钟派生的页脚文本。`:1288` 已经演示了正确做法——把易变字段替换成占位符再哈希——但只对 `journal-data-version` 做了，页脚时间戳漏了。后果是"时间往前走一分钟"等价于"全站外壳变了"。

**复现（可直接照跑）**
```powershell
$env:SOURCE_DATE_EPOCH="1780000000"; npm run build   # 第 2 次起：578 reused, 0 rebuilt（3.2 s）
$env:SOURCE_DATE_EPOCH="1780000060"; npm run build   # 仅 +60 秒：198 reused, 380 rebuilt（21.5 s）
```
同一份源码、同一个数据快照，只因时钟跨了一分钟，380 个页面失去复用资格，构建耗时从 3.2 s 涨到 21.5 s。

**修复建议**：在计算两个 shell 指纹前，把页脚时间戳节点也归一化为占位符（与 `:1288` 同一手法）；时间戳照常写入最终 HTML，只是不参与哈希。附带修 CI：`checks.yml:32` 既没设 `SOURCE_DATE_EPOCH`，也没缓存 `.build-cache/`，导致跨 job 的增量收益为 0。

**验收**：`SOURCE_DATE_EPOCH` 相差 60 秒的两次构建，第二次的 `rebuilt` 计数应回到 0（或仅 `sw.js` 相关项）。

### 3.3 `[实测]` `listFileEntries` 逐个文件读 Contents：白付 N 次子请求与整份字节下载

**证据**
- `workers/storage/training-git.mjs:33-36` — `listFiles` 只映射出 `entry.path`，丢掉了 tree 条目自带的 `entry.sha`。
- `workers/storage/training-git.mjs:39-45` — `listFileEntries` 为拿 blob SHA，对**每个** path 调 `readBytes`（`:19-23` → `githubContentBytesAt`，即一次 `GET /contents/...`）。
- `workers/storage/training-git.mjs:25` 注释 — 「blob SHA 由缓存内容本地计算，不额外请求 Contents API」；`docs/HANDOFF.md:566` 有同样表述。**注释与实现不符**。

**问题**：Git tree API 返回的 `entry.sha` 就是 Git blob SHA，与 `gitBlobSha(content)` 应当一致，因此这 N 次 Contents 请求纯属冗余。调用方是日期版本指纹（`workers/services/logs-v2.mjs` 附近），**每次读取日期与每次保存尝试都会跑**。附带成本被低估了：`githubContentBytesAt` 会把内容整份下载再 base64 解码，而同一目录下可能有接近上限的 PDF/题面图片附件（README 声明单张 ≤1 MiB、新增 ≤2 MiB）——这些字节只为算一个已经免费拿到的 SHA 而传输。

**修复建议**：`listFiles` 改为返回 `{ path, sha }`，`listFileEntries` 直接透传；保留 `readBytes` 供真正需要字节的调用方使用。删掉 `:25` 与 `HANDOFF.md:566` 的失实注释。

**验收**：新增 `test/training-git.test.mjs`，用 mock tree 断言「N 个文件时子请求数为 1」且 `sha` 与 `gitBlobSha(content)` 相等。注意当前 HTTP 层测试使用 fake git（§4.6），这条覆盖是新增的。

---

## 4. 中优先级（P2）

### 4.1 `[实测]` `isSafeUrl` 放行协议相对 URL `//host`

**证据**：`lib/render-safety.mjs:6-9`
```js
function isSafeUrl(value) {
  const url = String(value || "").trim();
  return /^(?:https?:\/\/|\/|\.\.?\/|#)/i.test(url);
}
```
**复现**
```powershell
node --input-type=module -e "import { renderMarkdown } from './lib/render-safety.mjs';
console.log(renderMarkdown('[x](' + '/' + '/evil.example/phish)'))"
# → <p><a href="//evil.example/phish" target="_blank" rel="noopener noreferrer">x</a></p>
```
**问题**：白名单里代表"同站绝对路径"的 `/` 同时匹配了协议相对 URL `//host/…`，后者会被浏览器解析为**外站**地址。`javascript:`、`data:` 已被正确丢弃（`[实测]` 保留纯文本），图片外链被站点 CSP 的 `img-src` 兜住，**但 `<a>` 不被 CSP 兜**。实际影响：队伍成员在题目描述/心得里写 markdown 时，如果粘贴了协议相对的链接，会被静默改写成指向第三方域的链接；恶意构造需要该成员自己的会话，故属低危，但这是仓库内唯一一处"白名单判定与浏览器解析语义不一致"的地方。

**修复建议**：要求 `value.startsWith("/") && !value.startsWith("//")`，或改为 `new URL(value, "https://train.xialiao.org")` 后断言 protocol ∈ {http, https} 且 origin 为本站。加 `//evil.example` 三类断言（链接/图片/标题）。

### 4.2 `[实测]` 233 个多路由页面把其他路由的 section 以 `hidden` 内联

**证据**：`scripts/generate-data.js:356-370`
```js
function showOnlyPage(html, pageId) {
  const pageIds = ["overview-page", "review-page", "analysis-page", "member-page", "problem-page", "roadmap-page", "tag-page"];
  for (const id of pageIds) {
    const section = $(`#${id}`);
    section.removeClass("active");
    section.removeAttr("hidden");
    if (id === pageId) section.addClass("active");
    else section.attr("hidden", "");      // ← 保留完整标记，只加属性
  }
  …
}
```
**实测**：`site/tags/贪心/index.html` 共 106.2 KB，其中 5 个非当前路由的 `<section hidden>` 合计 **17.1 KB / 16%**；`site/index.html` 同口径 8 个 section 合计 11.9 KB。按 233 个多路由页面估算，全站约 **3 MB** 是为当前路由永不显示的标记。

**注意量级**：并行审计给出的「8.13 MB / 53%」偏高（把 `hidden` 属性出现次数与嵌套 section 一起计入）。本节以实测的 17.1 KB/页为准，收益比初判小一个量级，故列为 P2 而非 P1。

**修复建议**：在 `showOnlyPage` 里对非目标 section 直接 `section.remove()`，仅保留目标 page（以及 `app.js` 路由实际需要保留的节点，如 `submission-page`）。**风险**：客户端路由切换依赖这些 DOM 节点存在（`lib/router.mjs`、`initPageNavigation`）——建议先在 `tags`/`roadmap` 两类纯展示页启用并补一条 e2e，再推广。

### 4.3 `[实测]` Cloudflare 账户信息随仓库入 git

**证据**：`git ls-files workers/.wrangler` → `workers/.wrangler/cache/wrangler-account.json`，内容为 `{"account":{"id":"0af18648d0a40df0aadcc8b96bdd4389","name":"only_matthew"}}`。`.gitignore:13` 有 `.wrangler/`，但对**已入库**文件无效，因此该文件每次本地 `wrangler` 运行都可能被改写并再次提交。

**问题**：account id 与账户名不是密钥，单独不足以提权，但把它永久留在公开仓库的历史里没有必要，且违反"本地工具缓存不入库"的直觉。

**修复建议**：`git rm --cached workers/.wrangler/cache/wrangler-account.json` 并确认 `.gitignore` 覆盖 `workers/.wrangler/`。若已在 `main` 历史上暴露、且在意，再单独评估是否需 `git filter-repo`（注意 `scripts/log-reader.js:13` 用 `git log` 回填 `updatedAt`，见 §4.5，历史重写有额外代价）。

### 4.4 `[实测]` 文档状态口径：四处直接与事实相反

**证据**（逐条复核，全部成立）

| 位置 | 原文 | 事实 |
| --- | --- | --- |
| `README.md:326`、`docs/CURRENT-STATE.md:12`、`docs/DESIGN.md:51` | 浏览器回归"不在日常 Action 中安装运行"/"只运行快速验证与构建" | `checks.yml:34-57` 存在独立 e2e job；但见 §2.1——**实际也从未运行**。三份文档与 `CURRENT-STATE.md:5` 自相矛盾 |
| `docs/SPECIFICATION.md:28` | `GET/PUT /api/my-list` "当前工作区已实现，**待发布**" | `docs/Audit/PRODUCT-AUDIT.md:5` 记 2026-10-02 已随 `9b2fa2c` 发布 |
| `docs/CURRENT-STATE.md:5` | 单测 **612** 项 | `AUDIT-2026-10-02.md:363` 记 **616**；本轮 `[实测]` 顶层 `test()` 计数 = 616（92 + 524） |
| `docs/README.md:3` | 归档"旧稿完整保存在"单个 2026-09-28 目录 | `docs/archive/` 下另有 2 个归档目录 |

补充：`docs/HANDOFF.md` 已 108 KB / 601 行，含 **33 个并列的 `## 最新交接`** 小节，"最新"一词出现 30+ 次，定位能力已经丧失；`docs/Audit/` 下三份审计对同一批改动给出不同状态。根 `README.md` 55 KB / 577 行，混入实现细节与部署手册。

**修复建议**：把"状态类"陈述收敛到 `CURRENT-STATE.md` 单一权威，其余文档只链接不复制；给硬数字加"计算方式 + 计算时间"；把 `HANDOFF.md` 按轮次拆分为 `HANDOFF/<日期>.md`，根文件只留最新一版与索引。可把"有 PR 工作流就必须写已纳入 CI"做成 `test/doc-links.test.mjs` 之类的机器守卫，避免同类漂移第三次复发。

### 4.5 `[静态]` 无整库导出与恢复演练；历史本身是载荷

**证据**：导出面仅单题 Markdown/PDF/LaTeX（`README.md:106-107`）。`scripts/log-reader.js:13` 用 `execFileSync("git", ["log", "--format=%cI…"])` 从提交时间回填 `updatedAt`；`deploy.yml:26` 注释亦写"构建用 git log 回溯旧记录的 updatedAt"。

**问题**：仓库即数据库，且**历史承担数据职能**——这意味着历史被重写（force-push、filter-repo）不只是丢版本记录，而是直接改变构建产物里的字段。当前没有任何整库导出、没有恢复演练、没有分支保护/禁 force-push 的书面约定。对一支依赖它积累数年训练复盘的队伍，这是最不对称的风险：投入为零时无事，出事时不可逆。

**修复建议**：加 `npm run export:archive`（打包 `logs/` + `training/` + `curriculum/` 为带校验和的归档），并在文档里写一次可执行的恢复步骤；给 `main` 开分支保护。

### 4.6 `[静态]` 测试覆盖的结构性空白

| 空白 | 证据 | 风险 |
| --- | --- | --- |
| 真实 Git 语义零覆盖 | `test/git-transaction.test.mjs`、HTTP 层测试使用 fake git；真实 tree/blob/commit 与 `force:false` 语义、附件 base64 提交未测 | §3.3 的注释与实现不一致就活在这块空白里 |
| `gh-api` 把 bug 固化为期望 | `test/gh-api.test.mjs:59-71` 只用 403 建模 | §3.1 无法被现有测试发现 |
| 导入链路无超时断言 | `workers/services/problem-import.mjs` 四处 `fetchImpl` 无 `signal`；`test/oauth-import.test.mjs` 无 signal 引用 | 上游抖动时无结构化失败 |
| 客户端目录渲染零覆盖 | `lib/catalog-renderer.mjs`（184 行）不在任何 `test/` 引用中；`e2e/journal.spec.mjs` 仅 1 条标签用例 | 知识地图/标签页的客户端路径无回归保护 |
| 无障碍无守护 | 无 `role="dialog"` / `aria-modal` / `inert`；`src/index.html:143-146` 导入面板为裸 div，Esc 不关闭、关闭不还焦 | 键盘用户不可用 |

### 4.7 `[静态]` 无 PWA manifest

**证据**：全仓（除 `node_modules/`、`oi-wiki/`）无 `manifest.webmanifest`；`sw.js` 已由 `scripts/generate-data.js:243-297` 生成，Service Worker 缓存可用。`README.md:75` 承诺"断网可浏览已访问页面"。

**问题**：有 SW、没有 manifest ⇒ 无法"添加到主屏"。而队员补录训练记录的场景主要在手机上，这是投入产出比最高的一处产品缺口。

**修复建议**：加 `manifest.webmanifest`（`name`/`short_name`/`start_url: "/"`/`display: standalone`/`theme_color`/192+512 图标），在 `src/index.html` 加 `<link rel="manifest">`，复用现有 SW。

### 4.8 `[静态]` 学习路线页无条件重写

**证据**：`scripts/generate-data.js:1097-1130` 的 `roadmapPage()` 直接调 `writeRouteIndex`（`:544-548` 纯 `writeFileSync`），**没有** `reuseGenerated` 调用；对比机制存在于成员页（`:436`）、题目页（`:526`）、标签页（`:1174`）。共 47 个 roadmap 页。

**问题**：每次构建无条件重写 47 个页面（外加 `showOnlyPage` + `replaceHeadMetadata` 的 cheerio 解析），内容未变时属纯浪费。**量级诚实说明**：整站构建 `[实测]` 仅 3.2 s（全复用）到 21.5 s（全重建），因此本条是"收益很小"的整洁性问题，优先级低；真正的浪费在 §3.2。

---

## 5. 已否定的候选结论（请勿据此改代码）

复核的价值一半在于排除。以下四条经实测证伪或大幅修正，记录在此以免下游照做：

| 候选结论 | 实测结果 |
| --- | --- |
| 「站点构建不可复现，每次构建全部页脚与 `sw.js` 都变」 | **不成立**。连跑两次构建，`site/` 910 个文件的 SHA-256 完全一致；跨分钟边界仅 `sw.js` 不同（其缓存版本按毫秒生成，是设计如此）。真实问题见 §3.2 的**增量缓存键**，修复方式也随之不同——**只需把时钟移出哈希键，不需要去掉页脚时间戳** |
| 「隐藏标记占 8.13 MB / 53%，收益为 M」 | **高估**。实测 17.1 KB/页（16%），全站约 3 MB，降级为 P2（§4.2） |
| 「`site/` 23 MB 说明产物臃肿需要治理」 | **不成立**。页面级 gzip 重量 4–24 KB，首页关键路径约 80 KB，KaTeX/Prism 按需加载，首页不内联全量数据。23 MB 是 433 个静态页 + 428 个数据分片的合理总量 |
| 「`workers/.build-cache/` 有 3.5 MB 被提交入库」 | **不成立**。该目录由 `wrangler deploy --dry-run` 在本地/CI 生成，`git ls-files` 未跟踪它；`site/`、`build/`、`artifacts/`、`test-results/` 同样为 0 跟踪。本轮审计曾因自己运行 verify 而产生该目录，已确认非仓库内容 |

同时确认**无问题**的项（避免把沉默当结论）：用户数据在 `lib/` 的 53 处 `innerHTML`/`insertAdjacentHTML` 中均经 `escapeHtml`/`esc`/`textContent` 转义；`renderMarkdown` 丢弃原始 HTML 与 `javascript:`/`data:`；题面图片 SSRF 有防护（仅放行三平台，每跳重定向复校验，`sourceUrl` 钉死在 codeforces.com）；非 GET 强制 `X-CSRF-Token`；存储路径全由服务端 `user.memberId` 推导；CSP 覆盖全部页面且 `script-src 'self'` 无 `unsafe-inline`。

---

## 6. 上一轮修复的落地复核

对 `AUDIT-2026-10-02.md` §8 声称已修的项目逐个查代码：

| 上一轮声称 | 复核 | 状态 |
| --- | --- | --- |
| §2.1 题面解析线性化 + 深度上限 + 时间预算 | `problem-statement.mjs:46` `MAX_HTML_DEPTH=128`、`:49-86`、`:117-172`；`oauth.mjs:260-270,301-304` | `上轮已确认` |
| §2.2 审计字段透传（保存不再丢字段） | `lib/log-schema.mjs:47,168,232,268`、`legacy-logs.mjs:155`、`logs-v2.mjs:349`，并有 `test/audit-fields.test.mjs` | `上轮已确认` |
| §3.2 写入层单一实现 `log-paths.mjs` | `workers/services/log-paths.mjs` 存在，`log-planning.mjs:17` 与 `logs-v2.mjs:230` 同源 | `上轮已确认` |
| §3.3 网络调用全部加超时 | `github-api.mjs:5` `GH_TIMEOUT_MS=15000`；OAuth 10 s + `response.ok` 检查 | **部分**：`workers/services/problem-import.mjs:19,52,174,198` 四处 `fetchImpl` 仍无 `signal`，上一轮的"全部覆盖"未含此文件（`新版`） |
| §3.4 文档状态口径对齐 | 见 §4.4，四处仍与事实相反 | `上轮未落地` |
| §3.6 门禁覆盖面 | 见 §2.1：e2e 只挂 PR，而本仓库无 PR | `上轮未落地` |
| §4.2 会话密钥 fail-fast / 登出清 Cookie | `oauth.mjs:42-48`、`:360-361` | `上轮已确认` |
| §4.2 会话密钥派生 | `oauth.mjs:71` 仍为 `SHA-256(secret)`，无 KDF；`HANDOFF.md:28` 亦声明未做 | `上轮已确认未做` |

---

## 7. 待复测（`[待复测]`）

以下需线上或外部信息，本轮未执行：

1. 线上 Worker 的 `buildCommit` 与 `logSchema.max` 是否与 `CURRENT-STATE.md:10,18` 所述一致（`GET /api/capabilities`）。
2. GitHub API 小时配额在真实使用下的消耗速率——决定 §3.1 的命中频率。
3. Cloudflare 子请求上限对 `listEvents`/`listDocuments`（`training-git.mjs:76-89`）在成员事件数增长后的实际约束（当前 `training/` 仅 5 个文件，问题尚未暴露；按免费 50 / 付费 1000 子请求估计，线性增长必撞墙，属需要预算护栏的候选）。
4. `e2e` 若按 §2.1 接入 `push` 后，在 CI 上是否稳定（本地 `[实测]` 17/17，但那是旧记录 `e2e-current.log`，本轮未重跑浏览器）。

---

## 8. 复现清单

```powershell
# 基线
git rev-parse --short HEAD          # 期望 691b218
git status --porcelain              # 期望空
npm run verify                      # 期望退出码 0

# §3.1（需 mock，见验收建议）
node --test test/gh-api.test.mjs

# §3.2 增量缓存被时钟击穿
$env:SOURCE_DATE_EPOCH="1780000000"; npm run build   # 连跑两次 → 578 reused, 0 rebuilt
$env:SOURCE_DATE_EPOCH="1780000060"; npm run build   # 仅 +60s → 198 reused, 380 rebuilt

# §4.1 链接协议逃逸
node --input-type=module -e "import { renderMarkdown } from './lib/render-safety.mjs';
console.log(renderMarkdown('[x](' + '/' + '/evil.example/phish)'))"

# §2.1 门禁空转
Select-String -Path .github\workflows\deploy.yml -Pattern 'e2e|playwright'   # 期望 0
git log --grep='Merge pull request' --oneline                                # 期望 0

# §4.3 凭据入库
git ls-files workers/.wrangler

# §4.4 单测数口径
(Select-String -Path test\*.mjs -Pattern '^\s*test\(' | Measure-Object).Count   # 期望 616
```

---

## 9. 结论

这个项目的工程纪律仍然高于同类个人项目：`npm run verify` 真绿、616 项单测真实存在、构建产物零跟踪、写路径的并发与幂等处理认真、SSRF/CSRF/IDOR 无实质缺口。上一轮审计声称的修复，除文档状态与门禁覆盖两项外，**在代码里确实成立**。

但两轮审计暴露了一个模式：**上一轮的验收靠"写了测试"和"改了文档"闭环，而这两者都没有连接到真实流程**。e2e 挂在永不触发的 PR 触发器上；文档状态三处与事实相反且已连续复发两轮。真正值得先做的不是新增功能，而是把已有的验证接上电源——给 `checks.yml` 加一行 `push` 触发器，成本是每次推送多跑一个 job，收益是 17 条浏览器用例、响应式检查与导入链路回归立刻生效。其次才是 §3.1 的写入误报（唯一的用户可见正确性 bug）与 §3.2 的缓存键（单项收益最大的工程改动）。

## 10. 工作区修复（2026-10-03，未部署）

- §2.1：依用户明确约束，不恢复浏览器 CI；移除先前审计增加的 PR e2e job。主分支发布流程保持原有快速门禁，不新增 Chromium 安装、浏览器 job 或第二次站点构建。PR 检查新增 concurrency 防止旧任务排队。
- §3.1：只有失败的 403/429 响应且剩余配额为零时才报配额耗尽；成功响应正常返回，5xx 不被配额头覆盖。补成功 200、204、5xx 和旧接口 ref 推进成功的回归。
- §3.2：shell 指纹归一化版本页脚，缓存命中时同步刷新普通页和独立题目页的版本时间。跨分钟构建不重建页面，同时验证全部复用页脚反映最新时间。
- §3.3：listFileEntries 直接透传 tree 的 blob SHA，不下载附件；listFiles 仍返回路径字符串，保留原调用契约。修正 HTTP mock，使其像真实 API 一样返回 SHA；新增适配器请求计数与截断 tree 回归。
- §4.1：拒绝协议相对 URL、反斜杠与控制字符；保留显式 HTTPS 外链和合法站内路径，补链接、图片和标题回归。
- §4.3：Wrangler 账户缓存退出版本管理，现有 .gitignore 继续覆盖该目录；不重写 Git 历史，账户 ID 不按密钥泄露处理。
- §4.4：更新 README、CURRENT-STATE、DESIGN、SPECIFICATION 与文档入口；历史审计数字按时点阅读，现行发布状态以 CURRENT-STATE 为准。
- §4.6：CF/AtCoder 的四处 JSON 导入调用增加超时，主查询超时返回结构化 504，元数据补查超时保留已取得的 AC 记录；补超时信号与降级测试。
- §4.8：地图页面也接入增量缓存，命中时更新版本页脚。
- 本地验收发现 LaTeX 固定输出目录被其他编译占用时会 EPERM，测试改用每轮独立目录，不停止其他进程或删除其输出。

未在本轮扩展产品功能：PWA 安装、整库备份与恢复工具、导入面板交互改造。隐藏路由 DOM 与 SPA 切换共用，不按报告建议直接删除；大规模文档拆分和 CSS 重构也未混入本轮修复。线上分支保护没有修改。

验收：UTC 环境完整 npm run verify 退出码 0，单测无失败或跳过，站点构建 625 reused / 0 rebuilt；跨分钟实验的全部普通页与独立题目页页脚验证通过。该实验随后迁出日常测试，保留为 scripts/smoke-build-cache.mjs 本地按需命令。Worker dry-run、ESLint 与文档链接检查通过；未运行浏览器回归，未部署。
