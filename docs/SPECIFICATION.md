# 队员自主算法训练平台：技术规格

## 2026-09-27 专项规格（v2.1）：知识地图徽标配色与洛谷书系题单

### 1. 徽标配色只有一个来源

知识地图上的难度徽标与训练证据徽标，**底色与前景色都不得在样式表里声明第二遍**。色阶集中在 [lib/roadmap-badges.mjs](lib/roadmap-badges.mjs)，由模板内联到徽标上；样式表只保留排版属性。

- `NODE_DIFFICULTY_PALETTE`（知识点难度 1-10，五档）与 `LUOGU_DIFFICULTY_PALETTE`（洛谷官方 8 级 + 暂无评定）各定义一次底色。
- `foregroundFor(background)` 按 WCAG 2.1 相对亮度在深墨 `#10231c` 与白色之间选前景，**保证每个底色上的文字对比度 ≥ 4.5:1**；`auditBadgeContrast()` 是可被测试调用的自检入口，要求返回空数组。
- 禁止把近黑底色（如原来的 `#111827`）用于徽标：深色主题下它会与页面底色 `#0b1511` 糊在一起。
- 掌握度状态色以 `--evidence-light` / `--evidence-dark` 两个自定义属性下发，样式表仅用 `color-mix` 计算底色；**未登记的状态必须回落到中性配色**（`#4f5c56` / `#cbd5e1`），不得出现"新增状态没有颜色"或落到 `var(--muted)`（后者在混色底上只有 4.04:1）的静默失效。
- 12px 小字的标签芯片同样要过 AA：`.tag-chip` 的字色用 `--tag-chip-ink`（浅色 `#57655f`、深色沿用 `--muted`），不得直接依赖 `--muted`（浅色主题下只有 4.37:1）。修改芯片字色时注意：标签芯片既可能是 `<a>` 也可能是 `<span>`，且 `src/assets/final.css` 的 token（`--hard`、`--medium`…）会覆盖同名语义的状态色 —— 依据是**构建后 `site/style.css` 里的实际取值**，不是源文件里的字面值。

历史教训：`src/style.css` 末尾曾有一条 `.roadmap-luogu-difficulty{color:var(--text);background:var(--surface-soft)}` 的兼容规则，位置更靠后、特异性相同，把整条 8 级色阶折叠成灰底；`data-level="8"` 因此变成深字落近黑底，实测对比度 **1.08:1**。任何"为兼容而追加"的覆盖规则都必须先确认它没有抹掉另一处声明的分级语义。

### 2. 洛谷书系题单的并入口径

数据源：洛谷三个官方书系题单 —— 李煜东《算法竞赛进阶指南》（14 个题单）/ 罗勇军《算法竞赛试炼场：洛谷 300 题精析》（8 个）/《算法竞赛实战笔记》（4 个）。

**抓取**（[scripts/fetch-luogu-training.mjs](scripts/fetch-luogu-training.mjs)）：题单目录页与标签字典 `/_lfe/tags` 匿名可读；**题单详情页需要登录态**，匿名请求返回 401 `UserUnloginException`，`/problem/list?trainingId=` 之类参数会被静默忽略。因此凭证只从环境变量 `LUOGU_COOKIE` 读取（不落盘、不进仓库），请求走与题面抓取相同的 C3VK 挑战握手。题目清单从详情页正文的 `<ol><li><a href="/problem/…">题号 - 名称</a></li>` 提取，**只认带链接的行**；题单说明区里的纯文本题号不是题单成员，不得计入。产出 `curriculum/luogu-training-problems.json`（`schemaVersion`、`series`、`collections`、`problems`，每题含 `pid/name/difficulty/tags/collections`）。

**归属**（[lib/curriculum-book-problems.mjs](lib/curriculum-book-problems.mjs)）：按**算法标签**而非书籍章节合并。

| 规则 | 口径 |
| --- | --- |
| 匹配 | 题目的站内标签（经 `lib/luogu-tag-map.mjs` 归一）与节点标签求交 |
| 排序 | 按标签独特性加权：`Σ 1 / 该标签所属节点数`。泛化标签（如 `DP` 同时挂两个节点）权重减半，独有标签权重为 1 |
| 下限 | 得分 < 0.5 的弱匹配不并入 |
| 多归属 | 一道题最多并入 `MAX_NODES_PER_PROBLEM = 3` 个节点，按得分降序、并列按节点元数据顺序 |
| 缺标签 | 不猜归属，计入 `dropped`（`no-tags` / `no-node-match`）并输出计数 |

节点题单上限 `MAX_PROBLEMS_PER_NODE = 120`，**只截断书系并入的题**（书系题排在列表末尾），既有「深入浅出 / 罗勇军 / 刘汝佳 / CF」题单必须保持完整。题目条目新增 `tags`（洛谷算法标签）与 `source`，来源短名固定为 `洛谷·进阶指南` / `《洛谷精析》` / `《实战笔记》`（`BOOK_SERIES_LABELS`，用户指定写法，见 `test/curriculum-book-problems.test.mjs` 的固定断言）；题目卡片新增 `data-problem-source` 供节点页「全部来源」下拉筛选。注意区分「书籍全名」（用于 `collections[].seriesName` 与抓取脚本日志）与「来源短名」（用于题目 `source`），两者不要互相替代。

### 3. 标签文件路径必须用 `tagStorageKey`

标签分片与标签页目录的路径**不得直接用标签原名或 `encodeURIComponent(tag)`**：`encodeURIComponent` 按 RFC 3986 保留 `! ~ * ' ( )`，而 `*` 在 Windows 上是通配符（`data/tags/A*.json` 实测 ENOENT，构建直接失败），`/`、空格等字符跨平台也不安全。[lib/tag-index.mjs](lib/tag-index.mjs) 的 `tagStorageKey(tag)` 只保留字母/数字/连字符/下划线/点，其余按 UTF-8 字节百分号编码；构建端（分片写入、标签页目录、路由 index 与 sitemap）与浏览器端（取分片、`tagHref()` 生成链接）必须共用同一份实现。链接生成也必须走 `tagHref()`：`encodeURIComponent("A*")` 仍是 `A*`，浏览器访问 `/tags/A*/` 时路径会被规范化成字面星号，与按 `%2A` 落盘的目录对不上。

## 2026-09-21 专项规格补充：AtCoder 算法标签与提交页链接

AtCoder 导入结果新增 `submissionUrl`（`https://atcoder.jp/contests/<比赛>/submissions/<id>`，取自 kenkoooo 提交记录的 id + contest_id）与 `tags`。AtCoder 官方与 kenkoooo 都不提供算法标签，`tags` 来自洛谷的 AtCoder 镜像：`/_lfe/tags` 提供 id→中文名的字典（按 isolate 缓存 6 小时），题目**列表页** `problem/list?keyword=<比赛>&type=AT` 一次给出整场比赛的题号与数字标签（按 `AT_<比赛>_` 前缀过滤，因为 keyword 是模糊匹配），单题页 `AT_<任务 ID>` 在抓题面时顺带给出该题标签。数字标签经 [lib/luogu-tag-map.mjs](lib/luogu-tag-map.mjs) 映射为站内标签：能对上规范标签的映射过去（262 个里 223 个），分类名与「语言入门」语法标签丢弃，站内没有的成熟技巧保留原名，带分隔符的先拆开，超过 30 字符的丢弃。标签是增强项：字典或列表页失败只是没有标签，导入与题面抓取照常成功。实现见 [最新交接](HANDOFF.md)、抓取服务 [workers/services/atcoder-tags.mjs](workers/services/atcoder-tags.mjs)。

## 2026-09-21 专项规格：AtCoder 题面抓取

`POST /api/problem-statement` 的 `platform` 从只有 `Codeforces` 扩为 `Codeforces` 与 `AtCoder`：AtCoder 按题号（任务 ID，如 `abc381_a`）先试官方题目页 `atcoder.jp/contests/<比赛>/tasks/<任务>?lang=en`（只取 `span.lang-en` 题面，`<var>` 的裸 TeX 转 `$...$`，图片按 `Referer: https://atcoder.jp/` 归档），实测该站对机房出口整体返回 403，因此失败后退回洛谷的 `AT_<任务 ID>` 镜像页（`parserVersion="luogu-atcoder-mirror-v1"`，带 `mirror-source` 警告）；洛谷也没收录的题目（Typical90 等）可由浏览器小书签在 AtCoder 题目页复制整页源码，回到表单粘贴后经请求体的可选 `html` 字段交给 `statementFromAtCoderHtml()` 解析——这条路径不请求上游、用同一个解析器、以 `og:url` 校验题目身份，并带 `client-html` 警告。`statementSource.kind` 新增 `atcoder-html`，洛谷 `AT_` 镜像复用 `luogu-mirror`，来源地址按 kind 与平台形态校验。共享解析器同时补齐 `<code>`、`<var>`、`<thead>/<tbody>` 表格、`<blockquote>`，以及纯 Markdown 正文与 `[in, out]` 数组样例（洛谷 AT_ 页形态），因此 CF / 洛谷解析版本升级为 `cf-html-v4` / `luogu-mirror-v3`。导入面板从 `config/members.json` 读取队员的 AtCoder 用户名（廖夏 `only_matthew`）。接口与取舍见 [题面归档规格](PROBLEM-ENRICHMENT-SPECIFICATION.md) §5.1/§5.3 与 [最新交接](HANDOFF.md)。

## 2026-09-18 专项规格：题面图片归档

新增 `problem.statementImages`（schemaVersion 5 → 6）：抓取 CF 题面与洛谷题面时，正文里的图片一并下载、按 `statement-<sha256>.<ext>` 落到该日目录，与题面 PDF 同一套保存/读取/发布链路；站点 CSP 只允许 `img-src 'self'`，外链图片（洛谷 CDN、Codeforces 图床）在站内本来就加载不出来。命名、类型与限额集中在 [lib/statement-images.mjs](lib/statement-images.mjs)，接口与取舍见 [题面归档规格](PROBLEM-ENRICHMENT-SPECIFICATION.md) §4.1/§4.2/§5.1 与 [最新交接](HANDOFF.md)。

## 2026-09-16 专项规格：训练状态拆分

新增 [训练状态与提交表单规格](LEARNING-STATE-SPECIFICATION.md) 及 [设计方案](LEARNING-STATE-DESIGN.md)。该轮写入 v5，保留已有题面与附件字段（题面图片后于 2026-09-18 追加，当前写入版本为 v6）。完成结果、掌握自评、复习安排与错题标记独立；涉及旧 reviewStatus 三态的冲突以此专项为准。活力 outcome 权重保持不变。实现与验证进展见 [最新交接](HANDOFF.md)。

## 2026-09-15 专项规格补充（待实现）

新增 [题面归档与 AI 元数据补全规格](PROBLEM-ENRICHMENT-SPECIFICATION.md)，产品流程见 [设计方案](PROBLEM-ENRICHMENT-DESIGN.md)。覆盖 PDF 归档、网页版 DeepSeek 提示词与 JSON 回填、Codeforces 单题题面抓取。此补充只完成设计，未实施。

本专项定义 v4 的附件与来源扩展，实施时必须与本文已有 v4 规划合并；不可创建两个不兼容的 v4。附件限额、协议、保存事务与专项验收以补充文件为准，本文其他功能边界保持不变。现有源码核查和下一步见 [最新交接](HANDOFF.md)。

版本：1.0-draft · 日期：2026-09-05 · 状态：实现依据，功能尚未实施。

> **实现状态（2026-09-15，第二轮）**：§4.1 的 v2 日志接口已落地并被 Worker 级测试覆盖：`/api/v2/logs/dates/:date`（GET/PUT/DELETE）与题面附件读取路由已在 `workers/oauth.mjs` 接线，`workers/services/logs-v2.mjs` 不再只是被单元测试引用的死代码。
>
> **条件写入已覆盖全部写入口**：旧 `/api/logs/date` 的 GET 返回 `revision`，PUT/DELETE 必须回传 `expectedVersion`（请求体字段或 `If-Match`），缺失 428、过期 409、格式非法 422；首次创建必须显式传 `null`。前端整日保存/删除与首页快捷复习均已带版本，草稿恢复路径会先补读一次版本。保存响应回传新 `revision`，连续保存无需刷新页面。
>
> 落地时对 **日期版本范围** 做了一处明确收敛：`version` 只覆盖该日期目录自身的文件（含目录内的 PDF blob），**不包含**位于日期目录之外、每次保存都会被重写的个人训练索引，也不含幂等回执。否则保存返回值与随后 GET 的版本永不相等，客户端每次保存后都会遇到幻影冲突。旧接口与 v2 现在共用同一个 `revisionFromEntries()`，并有跨路径双向一致性测试。这与本节「不取整个仓库 HEAD」的意图一致，是该原则在目录层面的具体化。
>
> 附件只能通过 v2 写入：旧 JSON 接口对「新增或变更 `statementAttachment`」返回 422 `ATTACHMENT_REQUIRES_V2`，但允许原样回传既有引用（表单编辑既有记录的做法）。v2 的 payload 则必须**省略** `statementAttachment`（keep 由服务端沿用旧引用、replace 用上传结果的哈希覆盖、remove 要求引用缺席）。
>
> §5.2 表中的多数路由、§4.2 的事件投影、§6.4 的索引体系仍未实现。浏览器端附件选择/替换/移除与 IndexedDB 恢复已实现并有 Playwright 冒烟覆盖。
>
> **上线状态（2026-09-15）**：前端（GitHub Pages）与 Worker（`algo-oauth.xialiao.org`）**均已发布**。顺序很重要：旧写入口的 `expectedVersion` 是硬性要求、没有兼容旁路，先单独部署 Worker 会让旧前端保存全部 428（本轮真的发生过，已回滚后按「先前端后 Worker」重发）。另：Worker 级测试用的是 Node 的 `Request`（undici），**不是** workerd；multipart 解析与 `crypto.subtle` 哈希已用 `npm run probe:workerd` 在真实运行时上单独验证。
>
> **但附件上传尚未被真人验证**：线上已有真人条件写入成功的记录（`8551e44`，新 Worker 上线 79 分钟后，写入 `schemaVersion: 4` 且索引同 commit 更新），但那条记录没有附件。匿名探测也**无法**判断路由是否存在（未知 `/api/v2/*` 同样返回结构化 401）。以 `docs/HANDOFF.md` 的核查记录为准，不要把本规格当作现有 API 文档。

产品背景见 [PRODUCT.md](PRODUCT.md)。本文件中的“必须”是验收要求，“应”是默认实现，“可”是可选增强。技术冲突以本规格为准，产品角色和用户边界以 PRODUCT.md 为准。旧 CONSTRUCTION-PLAN.md 记录的是历史施工，不作为本轮任务书。

已实现功能的算法与展示设计见 [VITALITY-DESIGN.md](VITALITY-DESIGN.md)（活力指数、难度统一为 CF Rating、同题判定）；尚未实施的区间打卡与同日多次打卡见 [PENDING-FEATURES.md](PENDING-FEATURES.md)。

## 1. 范围和固定决策

### 1.1 版本边界

| 版本 | 必须交付 | 不包含 |
| --- | --- | --- |
| v1.0 | 账号草稿隔离、条件写入、单题记录、尝试历史、个人计划、重做记录、证据卡、保存反馈 | 在线评测、实时聊天、自动代做、强制训练 |
| v1.1 | 自主约赛、个人/小队赛果、个人补题、同题讨论、共享资料 | 私密讨论、组织层级、实时协同编辑 |
| v1.2 | 导入增强、可选通知、分级 AI 提示 | AI 修改事实、自评或代替队员完成复习 |

本规格将 v1.0 定义到接口和状态级别；第 13 节为 v1.1 的实体、接口及权限契约。v1.2 只定义接入约束，外部消息平台的发送权限需实施时单独验证，不能把现有定时脚本视为推送可用的证明。

### 1.2 架构决策

1. 保留原生 ES modules、GitHub Pages、Git 日志与 Cloudflare Worker；不引入前端框架、数据库或自有 OJ。
2. `logs/` 是日志正文的权威来源；`training/` 是新增计划、事件、自评的权威来源。`site/data/` 全部可重建，不接受写入。
3. 所有成功变更先写 Git，再返回保存成功；多文件业务变更使用同一个 Git commit。
4. 静态页面用于公开阅读；已登录个人工作台通过 Worker 读取最新仓库快照，避免依赖部署完成。
5. 不存在教练、审核人、考核管理员等业务角色。队员只能写自己的记录；活动发起人不能修改他人报名、自评或个人赛果。
6. v1 存入当前仓库的数据按公开数据设计。“个人”表示归属，不表示私密。同步设置仅含训练偏好，不含秘密、联系方式或令牌。界面首次保存新增计划/自评时说明其公开属性；不提供虚假的“仅自己可见”开关。未来私密存储必须另立规格，不能直接落入公开 Git 历史。
7. 自评与机器规则分开，系统输出是训练证据描述，不给出成员能力总排名。

## 2. 现有实现与必须兼容的边界

| 源文件 | 当前行为 | 本轮要求 |
| --- | --- | --- |
| `lib/log-schema.mjs` | 当前写入 schemaVersion=6，最多 15 题/日，1,500,000 字节/次；兼容无版本及 v1–v5 | 未知未来版本拒绝；缺失版本按 legacy 读取，不回写时不强制迁移 |
| `workers/oauth.mjs` | 白名单、加密会话、CSRF；按日期整份读写 | 加入 v2 路由、快照读取、条件写入、幂等 |
| `lib/journal-api.js` | 简单 GET/PUT/DELETE，无版本参数 | 保留文件入口，新增 v2 客户端；支持结构化错误 |
| `lib/form.mjs` | 日期草稿放在 `journal-drafts-v1` | 按成员隔离；冲突时保留本地输入 |
| `lib/renderer.mjs` | 复习按钮调用单题 PATCH 命令 | 不向客户端暴露整日替换；保留条件写入保护 |
| `lib/mastery.mjs` | 以记录数/掌握标记/日期判定熟练 | 替换为第 8 节证据规则，不伪造独立完成 |
| `scripts/generate-data.js` | 静态页面、数据、Service Worker 生成 | 增加事件投影与发布回执索引；不得手改 site/ |
| `.github/workflows/deploy.yml` | Pages 构建发布；新提交取消进行中的旧构建 | 保留构建发布；产物必须声明输入提交 SHA |

日志版本兼容表：缺失版本视作最早期 legacy 格式，只读时兼容；首次重新保存会写成当前版本。v1–v3 是早期日志字段演进，v4 加入题面附件、来源与 AI 元数据，v5 加入 `outcome/masterySelfAssessment/reviewStatus/isMistake`，v6 加入 `statementImages`。任何高于 v6 的未知版本都拒绝读取或回写，避免静默丢字段。

保留 `/`、`/analysis/`、`/report/`、`/review/`、`/roadmap/**`、`/tags/**`、`/member/**`、`/problem/**`。中文成员目录和现有 problemId 不迁移、不重新生成。日志排序变化不能改变详情链接。

所有现有写入通道必须纳入版本检查，包括整日编辑、删除和快捷复习；不能保留一个无版本 PUT 旁路。

## 3. 标识、时间与文件布局

### 3.1 标识

- `memberId`：新增成员配置中固定的非空 slug，正则 `[a-z0-9][a-z0-9-]{0,47}`，部署后不随姓名或 GitHub login 变化。
- `config/members.json` 存 `{memberId, githubUserId, login, logDirectory}` 数组。迁移时从 GitHub 验证数字用户 ID，不猜测；`logDirectory` 对应已有中文目录。OAuth 必须按固定 githubUserId 匹配，不信任客户端 memberId。
- `recordId`：沿用日志内 `id`；唯一作用域为成员+日期。`recordRef={memberId,date,recordId}` 是完整引用。
- 新 `attemptId/eventId/itemId/operationId`：UUID v4，由客户端生成后服务端验证；服务器也可生成未提前引用的 ID。
- `problemKey`：统一函数 `canonicalProblemKey(platform, number)` 输出 `canonicalPlatform + '|' + normalizedNumber`。复用现有平台别名并抽到共享模块，CF `123a` 归一成 `123A`，AtCoder task ID 大写用于键、小写用于外链，洛谷题号大写；去首尾/内嵌空白，不删除下划线或连字符。
- 无平台或题号时 `problemKey=null`；内部 `subjectKey='record:' + memberId + ':' + date + ':' + recordId`，不按题名自动合并。已知题则 `subjectKey='problem:' + problemKey`。
- 修正日志题号只影响新关联与当前日志目录索引；不悄悄重写历史事件的 subjectKey。跨身份合并在 v1 不支持，UI 明确提示旧事件仍保留原身份。

### 3.2 时间

日历日期必须为真实的 `YYYY-MM-DD`，按 Asia/Shanghai（UTC+8）计算。时间戳统一保存 UTC RFC3339，例如 `2026-09-05T02:00:00.000Z`；兼容读取现有 +08:00 时间。

服务端生成 `createdAt/updatedAt/recordedAt`。队员填写的 `performedOn` 不能晚于服务端今天；计划日期可为今天至未来 365 天，也可读取、编辑既有历史计划。复习下一日期必须晚于本次 performedOn，允许已到期的历史补录日期。跨零点以服务端返回的 `today` 为准。

### 3.3 权威文件

下列布局分为“当前已有”和“目标布局”。当前仓库已落地 `profile.json`、`operations/` 与 `indexes/legacy.json`；其他路径只有在对应 v2 功能重新启用后才创建。`indexes/legacy.json` 是现有日志保存时同 commit 更新的个人记录索引。

```text
config/members.json
logs/<原成员目录>/YYYY/MM/DD/meta.json       # 当前写入 v6，正文分文件保留
training/members/<memberId>/profile.json
training/members/<memberId>/indexes/legacy.json       # 当前已使用
training/members/<memberId>/plans/YYYY-MM-DD.json
training/members/<memberId>/events/YYYY-MM/<eventId>.json
training/members/<memberId>/reviews/<subjectHash>.json
training/members/<memberId>/assessments/<nodeId>.json
training/members/<memberId>/operations/<operationId>.json
training/members/<memberId>/sequence.json
training/members/<memberId>/indexes/summary.json
training/members/<memberId>/indexes/attempts/YYYY-MM.json
```

当前产品决策（2026-09-26）：`/training/` 前端已下线，`/api/v2/me/*` 为冻结的试验接口，不承诺完整路由集。恢复工作台前不得宣称这些接口已有用户入口。现有日志里的 `outcome` 是当前计分来源；未来完成事件迁移后，事件投影优先，日志字段降为兼容快照。

`subjectHash=SHA256(UTF8(subjectKey))` 的 64 位小写十六进制。保存的 JSON 仍带原始 subjectKey，读取须校验一致。所有路径由服务端映射生成，用户不能传入路径、Git ref 或仓库名。节点 ID 必须存在于 curriculum 白名单。

事件是权威历史；review 和 indexes 文件是可重建投影，但在保存事件时同步更新以便快速读取。operations 是不可变成功回执，v1 不自动清理，以保证重复请求能确定结果。文件数量增长后再设计归档，不能静默缩短幂等保证。

## 4. 数据契约

### 4.1 通用验证

新增实体 `schemaVersion:1`。新增写入拒绝未知字段，枚举值错误返回 422，不能默默回退。字符串长度以 Unicode code point 计数，载荷大小按 UTF-8 字节计数。读取未知的未来 schemaVersion 应报 `UNSUPPORTED_SCHEMA`，不能降级写回导致字段丢失。

所有以下可选字段省略表示未提供；PATCH 中 `null` 仅用于明确可清空字段，其他 null 非法。正文使用现有安全 Markdown 渲染链；外链只允许 https/http，自动导入的上游 host 使用固定白名单。

| 实体 | 必需字段与限制 | 可选字段 |
| --- | --- | --- |
| ProblemSnapshot | `name` 1..200，`platform` 1..50，`problemNumber` 0..50 | `difficulty` ≤50，`tags` 最多10个且每个≤30 |
| Profile | `schemaVersion, memberId, updatedAt`（后两项服务端） | `focusNodeIds` 最多3个，`dailyBudgetMinutes` 15..240整数（默认60），`dailyItemLimit` 1..10（默认3），`cfHandle/atcoderHandle` 各≤50，`goalNote` ≤200 |
| Plan | `schemaVersion, memberId, date, items, updatedAt` | `algorithmVersion, evidenceSnapshot` |
| PlanItem | `id, subjectKey, problem, kind, status` | `recordRef, nodeId, reasonCodes, plannedMinutes, linkedAttemptId, deferredTo` |
| SelfAssessment | `schemaVersion, memberId, nodeId, level, updatedAt` | `note` ≤500 |

Profile 平台账号只作为导入预填，不证明账号所有权。cfHandle 的历史硬编码作为读取默认值，不自动写入。

PlanItem `kind=review|upsolve|practice|advance|manual`，`status=queued|started|completed|deferred|removed`；每个计划最多20项（包含移除项），每个 subjectKey 最多一个 queued/started/completed 项。`plannedMinutes` 为5..240整数，仅为预算。`level=unknown|learning|comfortable|needs_review`；level 为本人自评，不映射成独立完成事实。

### 4.2 日志 v4 与尝试事件

日志 v4 保留 v3 字段，新增可选 `initialAttemptId`，不在 meta 中再存一份 outcome。结果来自事件投影，避免两个可写的结果来源。

```json
{
  "schemaVersion": 1,
  "id": "4fd06885-a6ed-43b4-9ba6-ec8875638cdf",
  "type": "attempt.recorded",
  "memberId": "member-example",
  "subjectKey": "problem:Codeforces|123A",
  "recordRef": {"memberId": "member-example", "date": "2026-09-05", "recordId": "existing-record-id"},
  "problem": {"name": "示例题", "platform": "Codeforces", "problemNumber": "123A"},
  "performedOn": "2026-09-05",
  "recordedAt": "2026-09-05T02:00:00.000Z",
  "sequence": 8,
  "mode": "review",
  "outcome": "independent",
  "durationMinutes": 35,
  "errorTags": [],
  "note": "先证明排序后相邻交换不会更差",
  "source": {"kind": "manual"}
}
```

`mode=practice|review|upsolve|contest`；`outcome=unfinished|independent|hinted|editorial|unknown`。手动新增必须选择前四项之一；unknown 只允许旧数据投影和不具备独立性证据的导入。

`durationMinutes` 可省略，提供时为1..1440整数；`errorTags` 最多5个，取 `understanding|modeling|proof|complexity|implementation|boundary|knowledge|other`；note≤2000。事件 JSON 最多16KiB；代码仍放日志正文，不放事件。

`source.kind=manual|import`；import 必须有 `platform, handle, submissionId, verdict`，服务端从导入结果生成，不接受伪造的 imported independence。导入 AC 只表示 verdict，不自动填写 independent。去重键为成员+平台+归一化handle+submissionId，在同一快照检查；同题不同真实提交可保留不同尝试。

事件不可原位改写。纠错使用 `attempt.corrected`，字段为 `id, memberId, recordedAt, targetAttemptId, patch`；patch 仅允许 outcome、performedOn、durationMinutes、errorTags、note，不允许改身份或来源提交。作废使用 `attempt.voided`，附 targetAttemptId、reason≤500。目标必须属于本人且未作废。

纠正事件按 Git 快照中的提交先后应用，同一事务每个目标最多一个纠正事件。为避免同毫秒排序歧义，事件含服务端单调 `sequence`（见第 6 节）；投影按 sequence 排序。

v3 日志可投影为 `legacy:<recordRef>` 的未知结果，不落盘伪事件、不计入重做次数。不把 reviewStatus=mastered 推导为独立完成。

### 4.3 复习投影

```json
{
  "schemaVersion": 1,
  "memberId": "member-example",
  "subjectKey": "problem:Codeforces|123A",
  "state": "scheduled",
  "dueOn": "2026-09-08",
  "successStreak": 1,
  "lastAttemptId": "4fd06885-a6ed-43b4-9ba6-ec8875638cdf",
  "lastReviewedOn": "2026-09-05",
  "appliedSequence": 8
}
```

`state=scheduled|paused|archived`；scheduled 要求 dueOn，其他状态 dueOn=null。`successStreak` 非负整数。仅 mode=review 的未作废尝试更新 lastReviewedOn 与连续通过数；普通练习不冒充重做。

非尝试事件：`review.scheduled`（dueOn）、`review.deferred`（dueOn）、`review.paused`、`review.archived`。均含本人、subjectKey、id、sequence、recordedAt。归档表示暂时移出队列，不宣称掌握；延期不增加通过次数。

存在旧待复习记录但没有新事件时，按同一 subjectKey 合并，选最早 reviewDue；无日期者进入“未安排日期”。有新 review 事件后以事件投影为准。事件投影只影响展示，不批量覆盖旧 meta 的 reviewStatus。

## 5. API 契约

### 5.1 通用协议

新接口前缀 `/api/v2`，继续 cookie 会话与 X-CSRF-Token。客户端不得传 memberId 作为写入授权依据；`/me` 从会话解析。

每次变更必须带 `Idempotency-Key: <UUID>`，所有依赖已有资源的修改必须带资源版本。单资源用 `If-Match: "<revision>"`；不存在资源的创建用 `If-None-Match: *`。跨资源命令在 body.preconditions 中列明每个目标版本，缺失返回428。追加尝试虽然新增事件，仍须检查记录、计划和复习等依赖版本。读取返回 `ETag` 和 body.revision；版本是 opaque string，客户端不得自行计算。

新 CORS 必须允许 PATCH、If-Match、If-None-Match、Idempotency-Key、X-CSRF-Token，并 expose ETag、Retry-After。仅允许既有可信 origin，credentials=true，Vary:Origin。

API、会话和发布查询全部 `Cache-Control: no-store`。GET 无副作用，不保存计划、修改日期或刷新自评。

```json
{
  "data": {"recordId": "existing-record-id"},
  "revision": "sha256:example-opaque-revision",
  "operation": {"id": "0f7674cf-7366-4c0b-9df4-8b548c537385", "state": "saved", "replayed": false},
  "snapshotCommitSha": "0123456789012345678901234567890123456789",
  "serverTime": "2026-09-05T02:00:00.000Z",
  "today": "2026-09-05"
}
```

GET 无 operation；列表返回 data.items、data.nextCursor。cursor 是编码的快照SHA+最后排序键，读取后续页仍固定该快照；limit 默认50、上限100。不接受任意外部 commit SHA 作为可写分支。

| 状态 | code | 客户端动作 |
| --- | --- | --- |
| 400 | MALFORMED_REQUEST | 显示请求格式错误 |
| 401 | AUTH_REQUIRED | 保留草稿，引导重新登录 |
| 403 | FORBIDDEN / CSRF_FAILED | 禁止写入，不能靠切换前端成员绕过 |
| 404 | NOT_FOUND | 刷新列表，保留未提交输入 |
| 409 | VERSION_CONFLICT / IDEMPOTENCY_REUSE / DUPLICATE_IMPORT / WRITE_CONTENTION / REFERENCED_RECORD | 按 code 展示冲突、已有记录或显式删除入口 |
| 413 | PAYLOAD_TOO_LARGE | 显示字节上限 |
| 422 | VALIDATION_FAILED / UNSUPPORTED_SCHEMA | 定位 fieldErrors |
| 428 | PRECONDITION_REQUIRED | 升级或刷新客户端，不自动无条件重试 |
| 429 | RATE_LIMITED | 遵循 Retry-After，不连续点击 |
| 502/503 | UPSTREAM_UNAVAILABLE / SAVE_UNCONFIRMED / INDEX_STALE | 保存未确认时保留原幂等键；索引过期时暂停推荐并保留已有计划 |

错误统一 `{error:{code,message,fieldErrors?,currentRevision?,operationId?},requestId}`，不返回令牌、GitHub响应正文或其他队员数据。

### 5.2 v1.0 路由

表中所有 PUT/PATCH/POST/DELETE 默认遵循5.1；P 表示跨资源 preconditions。

实现状态（2026-09-26）：已实现 profile、workbench/reviews/recommendations、plans、plan-actions、attempt 新增/分页列表/不可变纠错/作废、专题 evidence 分页、review-actions、assessments、operations，以及 `/api/v2/logs/dates/:date` 整日读写和附件；新增的单题 PATCH 当前仅支持 `reviewStatus`/`reviewDue` 快捷命令。records 通用增删改与 plan-links 仍未实现。下表是目标契约，不代表每一行均已上线。

| 方法与路径 | 请求/返回 | 约束 |
| --- | --- | --- |
| GET `/me/profile` | Profile + revision | 缺省配置返回 exists=false、revision=null |
| PUT `/me/profile` | 可写 Profile 字段 | 首次 If-None-Match，后续 If-Match |
| GET `/me/workbench?date=` | profile、plan、dueReviews、近期证据、resourceVersions、snapshotCommitSha | date 缺省今天；聚合使用同一快照 |
| GET `/me/logs/dates/:date` | 全日 problems（含正文）+ revision | 不存在返回空数组、exists=false、revision=null |
| PUT `/me/logs/dates/:date` | `{problems:[...]}` | 保留整日编辑；仅更改日志，不覆盖事件；不能隐式移除仍有有效尝试引用的记录 |
| DELETE `/me/logs/dates/:date` | `{cascadeOwnedAttempts:true}` | 需全日版本；同事务作废引用本日记录的本人尝试、移除对应计划关联 |
| POST `/me/records` | `{date,problem,attempt?,planLink?,preconditions}` | 原子新增日志、可选首次尝试、可选计划关联；P |
| GET `/me/logs/dates/:date/records/:id` | 单题完整正文、有效结果摘要、revision | 为单题编辑提供版本 |
| PATCH `/me/logs/dates/:date/records/:id` | `{patch:{name?,platform?,problemNumber?,difficulty?,tags?,description?,takeaway?,code?}}` | 使用该记录版本，不允许 patch 别题或复习投影 |
| DELETE `/me/logs/dates/:date/records/:id` | `{cascadeOwnedAttempts:true}` | 使用记录版本；作废本人引用、移除计划关联，与正文删除原子提交 |
| GET `/me/attempts?subjectKey=&cursor=` | 有效尝试及纠正/作废摘要 | 按 sequence 倒序；可追溯原事件 |
| POST `/me/attempts` | `{recordRef,mode,outcome,performedOn,...,planLink?,preconditions}` | 已有记录追加尝试；P；review 同事务更新投影 |
| POST `/me/attempts/:id/corrections` | `{patch}` | If-Match 目标有效尝试版本；重算相关投影 |
| POST `/me/attempts/:id/void` | `{reason}` | If-Match 目标有效尝试版本；重算关联计划与复习 |
| GET `/me/reviews` | 有效复习队列与 revision | 先到期、再未来、再无日期 |
| GET `/me/evidence/:nodeId?cursor=` | 节点统计、自评、分页训练引用 | 使用同一快照；完整证据通过分页读取 |
| POST `/me/review-actions` | `{subjectKey,action,dueOn?,preconditions}` | action=schedule/defer/pause/archive；P |
| GET `/me/plans/:date` | Plan + revision | 不存在同 profile 约定 |
| PUT `/me/plans/:date` | `{items,removeItemIds?,algorithmVersion?,evidenceSnapshot?}` | 首次创建/手工维护；不得伪造 completed/linkedAttemptId |
| POST `/me/plan-actions` | `{date,itemId,action,targetDate?,preconditions}` | start/reopen/remove/defer；跨日延期同时写两日计划；P |
| POST `/me/plan-links` | `{date,itemId,attemptId,preconditions}` | 将已有有效尝试关联本人计划，需record和plan条件；不制造第二次尝试 |
| GET `/me/recommendations?date=&exclude=` | 候选、reasonCodes、evidenceSnapshot、algorithmVersion | exclude 最多50个 subjectKey；只读、不保存 |
| GET `/me/assessments/:nodeId` | SelfAssessment + revision | 不存在按缺省规则 |
| PUT `/me/assessments/:nodeId` | `{level,note?}` | 本人自评；不修改事件 |
| GET `/me/operations/:id` | 成功回执或404 | 鉴权且只读本人的回执 |

单题 GET 的版本包含该题内容及删除依赖；全日 GET 版本包含当天所有日志文件与所有引用该日的有效事件状态。每个单题和队列项目都返回resourceKey/revision，使客户端无需猜测目标版本。删除采用显式 cascade 命令，不能使有效事件指向失踪记录；整日PUT移除有引用记录返回409 REFERENCED_RECORD，未引用记录可以直接移除。对缺失正文的历史外部 Git 删除，构建保留题目快照并标记 sourceMissing。

`preconditions` 为资源到版本的对象，资源键限定为 `date:YYYY-MM-DD`、`record:YYYY-MM-DD:id`、`plan:YYYY-MM-DD`、`review:<subjectHash>`。null 表示必须不存在。服务端根据命令计算必需资源集合，缺少、多余或不匹配都拒绝；版本格式只接受服务端返回的值。

新增记录所需 date 条件不可省略（并发新增也不能突破15题上限）。追加尝试需 record 条件，review 模式还需 review 条件，planLink 还需对应 plan 条件。review-actions 需 review 条件。跨日 defer 需来源和目标 plan 条件。attempt 修正/作废采用目标版本并在同一事务重算最新投影，不由客户端上传投影。

planLink 只能指向本人且 subjectKey 相同、状态 queued/started 的项目；performedOn 必须等于计划日期。仅完成结果 independent/hinted/editorial 将项目标为 completed；unfinished 保持 started。unknown 导入不自动完成计划，队员可纠正结果后再关联。

### 5.3 命令载荷细则

`RecordCreate.problem` 为现有日志可写字段，新增id可选（省略由服务器生成）；`initialAttemptId`只能由服务器设置或从原值保留，不接受客户端修改。attempt可省略以允许“先记题、后补结果”；提供时包含 `{id?, mode, outcome, performedOn, durationMinutes?, errorTags?, note?}`，recordRef、subjectKey、problem快照由服务端派生。planLink为 `{date,itemId}`，只有同时提供attempt时才可用于RecordCreate。

```json
{
  "date": "2026-09-05",
  "problem": {"name": "示例题", "platform": "Codeforces", "problemNumber": "123A", "tags": ["贪心"]},
  "attempt": {"mode": "practice", "outcome": "independent", "performedOn": "2026-09-05", "durationMinutes": 35},
  "planLink": {"date": "2026-09-05", "itemId": "3d02d1a6-ddd3-4ff0-8d56-a0bbec564cc8"},
  "preconditions": {"date:2026-09-05": null, "plan:2026-09-05": "sha256:example-plan-revision"}
}
```

上例表示该日期日志必须尚不存在而计划已存在；如果当天已有日志，客户端必须传当天读取的revision。初次attempt若mode=review且problemKey已知，还须带对应review条件；缺题号的新记录不得在创建命令中作为review，须先建记录获得subjectKey，再安排重做。

普通POST `/me/attempts` 采用上述attempt字段加recordRef、可选planLink、preconditions，不接受客户端problem快照。GET已有尝试返回targetRevision，供corrections/void的If-Match。修正/作废会检查并更新所有仍绑定该尝试的计划：独立/辅助完成变成unfinished/unknown则completed退回started；作废则退回queued并清空linkedAttemptId；若用户已reopen/remove/defer而解除绑定，则不更改该计划。

日志已有有效事件时，整日PUT必须保留服务器管理的initialAttemptId，且不能以修改旧reviewStatus/reviewDue覆盖新投影。客户端若试图改变这些兼容字段返回422并提示使用复习操作；无新事件的旧记录仍可编辑旧复习字段，直到首次通过新复习接口管理该subjectKey。不存在的initialAttemptId或指向他人的ID一律拒绝。

PUT计划只允许创建queued项和修改题目备注/顺序/预算；已有状态、linkedAttemptId和deferredTo必须由服务端保留。删除/换题通过先remove旧项、再新增queued项完成，可在一个PUT中以 `removeItemIds`（最多20个）声明仅queued/started项移除；不得删除completed历史。状态迁移统一由plan-actions或有效尝试关联处理。

单请求JSON载荷：日志创建/整日保存保留1,500,000字节，其他命令上限64KiB；GET不复用写入载荷上限。日期PUT每个字段长度仍依现有LOG_LIMITS，正文保留原空白规则；训练note长度依4.2。新事件id跨该成员全部事件唯一，重用id但不是同一operation视为409。

## 6. 并发、原子写入与幂等

### 6.1 快照与版本

每个 GET 或业务事务先读取分支 head H，此后所有目录、正文、事件均按 H 读取，禁止混用随时变化的 main。对两个历史日期路径，若同时存在则返回 `VERSION_CONFLICT`，不能选择一个并静默删除另一个。

资源 revision 为 `sha256:` + SHA256(canonical JSON of resource dependency manifest)。manifest 包含逻辑资源键与依赖文件的路径/blob SHA；记录子资源按解析后的该记录内容和相关事件规范化计算，不能因同日另一题的序号变化无谓冲突。规范化按键字典序、数组保持业务顺序、UTF-8、无空白；缺省与 null 依4.1处理。

### 6.2 提交流程

```text
验证会话/CSRF/格式
→ 在快照H查询本人operationId
→ 已有回执：比较请求指纹，匹配则返回成功重放
→ 校验客户端目标资源版本、所有权与引用
→ 基于H计算最终文件差异、事件与投影
→ 同一个tree/commit写入业务文件和成功回执
→ 非force更新main引用
→ 成功才返回saved
```

实现 `runGitTransaction(command)`，最多3次尝试。引用更新竞争失败后重新读 H、重新查询回执、重新验证版本、重新计算差异；不能复用旧 `changes` 直接覆盖。非竞争类422、权限错误和限流不作冲突重试。第三次竞争失败返回409 WRITE_CONTENTION。

不同成员/不同记录操作可在重新读取后安全合并；同一资源过期版本返回409。资源依赖和业务验证必须全部在该次快照中执行，避免检查与写入之间丢失更新。Git 非 force 引用更新提供提交竞争检测，本规格的资源版本提供业务内容冲突检测，两者缺一不可。

每成员维护 `training/members/<id>/sequence.json`，内容 `{next:整数}`。所有新事件在同事务分配递增序号，同一个命令的多事件连续编号；分支重试重新分配。该计数器是服务端内部依赖，不要求客户端发送版本，也不能覆盖其他事务已分配的序号。

### 6.3 成功回执

回执字段：`schemaVersion, operationId, memberId, requestHash, recordedAt, result`；result 保存创建的ID、目标资源版本和必要业务摘要，不存题解、代码或令牌。requestHash 为 method+规范化路径+业务body+preconditions 的 SHA256；排除cookie、CSRF和传输requestId。

重放检查在版本检查之前。同键同请求返回原结果、operation.replayed=true；同键不同请求返回409 IDEMPOTENCY_REUSE。并发相同请求只产生一份事件与回执。回执不存自身所在 commit SHA，避免自引用；响应 snapshotCommitSha 为确认回执存在的快照，不冒充“首次提交SHA”。

引用更新超时不等于失败。服务端尽力读取新快照确认回执；不能确认返回503 SAVE_UNCONFIRMED。客户端保持同键查询/重试；网络恢复后不得自动生成新键重复提交。401后恢复请求同样保留原键。

持久化成功必须在响应前 await，不能依赖 ctx.waitUntil 完成核心保存。v1 不使用 isolate 内存锁或内存幂等表保证正确性。

### 6.4 索引与读取成本

工作台不能逐个下载所有历史事件。新增派生索引：

- `indexes/attempts/YYYY-MM.json` 按原事件recordedAt月份分片，保存每次原始尝试的有效字段、原event路径、纠正/作废事件路径、最后应用sequence与recordRef；performedOn纠正不移动原月份。分页先扫描分片元数据，再取需要的有效条目。
- `indexes/summary.json` 包含 `schemaVersion, appliedSequence, curriculumHash, totals, byNode, activeReviewSubjects, attemptMonths`。byNode存统计和最多20条近期recordRef；完整证据走分页接口，不把所有正文塞进工作台。
- `training/members/<id>/indexes/subjects/<subjectHash>.json` 保存该成员该subjectKey的记录引用、尝试索引位置、导入去重键及最新投影版本；单题操作依此定位，不全仓扫描正文。

原事件、纠正、作废、日志标签/题号修改和删除，都在同事务更新受影响索引及summary。索引不允许独立用户写入。仓库直接编辑训练源数据或curriculum时，维护流程必须运行拟新增 `npm run training:reindex -- --write` 并随源数据一同提交；普通 `npm run build` 只校验/生成site，不静默提交Git。

重建脚本支持默认dry-run、显式--write和--check，--write仅写training下派生文件；生成结果必须与从所有事件完全重放一致。CI使用--check阻止过期投影发布。成员第一次没有新增事件、没有索引时，Worker可从已有日志的轻量meta生成读取结果但不产生写入；首次业务写入同时建立索引。

summary与curriculumHash不符时工作台仍展示日志/计划，但推荐返回503 `INDEX_STALE` 并提示数据正在更新，不使用过期规则假装推荐有效。

容量验收使用3成员、每人10,000条尝试和100个知识节点的合成数据。GET工作台正常路径不得逐条获取事件正文；返回体目标≤256KiB。此数值是本项目验收预算，不是平台限制。若摘要超过预算，移除近期引用并分页获取，不能截断真实计数；月分片超过1MiB时按原事件ID前2位继续分片，attemptMonths列明文件路径与条数。

## 7. 今日计划与推荐规则

### 7.1 状态机

`queued → started → completed`；queued/started 可 remove 或 defer；completed 可 reopen 回到 queued，清空当前linkedAttemptId，历史仍可从事件追溯。removed/deferred 可reopen，但同日已有相同subjectKey有效项时返回409；deferred的reopen不会撤销目标日项目，界面须提示需单独处理。开始训练仅更新计划状态，不制造尝试结果；外链打开失败可重试。

defer 要求 targetDate 晚于来源日期且不超过今天+365天；原项目置deferred并记deferredTo，目标创建 queued 项。目标已存在相同 subjectKey 时复用，不重复增加；来源与目标在一个事务保存。GET 跨天不自动延期，用户确认后才写入。

### 7.2 确定性算法 `recommend-v1`

输入：服务端today、Profile、当前计划、全部本人轻量训练证据、复习投影、curriculum、exclude。输出最多 dailyItemLimit 个尚未入计划的候选（总有效项不超过10）；未登录不调用本人推荐接口。

1. 候选池按优先级：到期scheduled复习（dueOn升序）→ 本人显式标记的待补题 → focusNodeIds中的未独立完成题 → 可进入的后继节点题。
2. v1.0待补题来源为 mode=upsolve 的未完成尝试或本人手工加入的upsolve项；v1.1再接比赛待补清单。
3. 普通新题排除本人任何历史日志已出现的subjectKey；已知做过但需要巩固者只能进入明确的review/upsolve候选，不能包装成新题。
4. 无focusNodeIds时选择现有路线阶段顺序中第一个可进入节点。前置可进入条件为每个前置节点有独立完成证据，或本人自评comfortable；自评只影响导航资格，不增加事实数量。队员手动选节点可越过前置提示。
5. 节点内按原题单顺序稳定排序，跨节点按Profile顺序或路线顺序，再以subjectKey破同序。v1不使用随机数、不混排跨平台难度、不根据题量猜测CF rating。
6. 没有可进入节点或已耗尽候选时返回空列表和明确reasonCode，不无穷循环，不伪造诊断题。
7. 默认每项预算取20分钟，允许手动改；累计达到dailyBudgetMinutes即停止添加，首项即使预算不足也可返回一项并注明可调整。预算只用于控制数量，不表示预计真实耗时。

reasonCodes 固定为 `REVIEW_DUE, UPSOLVE_PENDING, FOCUS_NODE, NEXT_NODE, PREREQUISITE_SELF_ASSESSED, NO_EVIDENCE, NO_CANDIDATES`。每个推荐附支持它的recordRef/节点ID/到期日；文案由模板渲染，不让AI生成依据。

候选只在用户接受时写入Plan，并保存algorithmVersion、evidenceSnapshot。刷新只读已接受计划；换题是重新获取排除当前题的候选，再由用户选择并保存。保存时再次校验候选题身份，若已被其他端完成，返回冲突提示，不静默重新安排。

## 8. 复习算法与证据卡

### 8.1 复习间隔 `review-v1`

按 performedOn 升序、同日sequence升序折叠有效重做；纠正和作废先应用，再重算。

| 本次结果 | 连续独立通过数 | 建议下一次 |
| --- | --- | --- |
| unfinished | 重置0 | performedOn+1天 |
| hinted / editorial | 重置0 | performedOn+3天 |
| independent | 上次连续数+1 | 第1/2/3/4次及以上分别+3/+7/+14/+30天 |
| unknown | 不改变 | 不自动调整 |

先按performedOn分组，每日取sequence最大的有效已知结果，再按日期从旧到新折叠上表；因此同日最多贡献1次连续通过，unknown不遮蔽当天较早的已知结果。“连续”指连续有重做结果的日期，不要求每天重做；没有训练的日期不重置。规则由唯一纯函数实现，旧待复习没有事件时连续数为0。

显式schedule/defer/pause/archive按sequence记录调度意图。重算时先计算有效重做的成绩与默认日期，以performedOn最大的日期为“最近重做”，该日最终结果的原事件sequence与最后显式调度事件sequence比较：较新的决定当前调度。历史补录不得把当前日程退回历史补录日期；它可改变连续通过数，因此在最近重做仍主导调度时，重新计算的间隔始终从最近重做日期起算。纠正事件自身sequence不抢占显式调度；按被纠正尝试的有效performedOn和原sequence计算。

没有有效重做时使用最后显式调度；两者都不存在时回退旧日志状态。若最后一次重做被作废，则重新按上述规则选最近仍有效的重做，不保留已作废结果产生的虚假进度。schedule/defer的dueOn必填且必须晚于服务端今天（手工调度）；历史补录产生的默认日期允许已到期。

从计划保存重做结果，必须在同事务更新事件、review投影与计划状态。旧“已掌握”快捷按钮改成“记录重做结果”与“暂不复习”，避免一次点击伪装成独立通过。

### 8.2 证据描述 `evidence-v1`

每成员/节点输出 `distinctProblems, attempts, independentProblems, assistedProblems, legacyUnknownRecords, dueReviews, lastPracticedOn, selfAssessment, state, reasons, recordRefs`。

节点关联仍沿用题单匹配与规范标签并集，同一subjectKey在同一节点只计一道题；同一道题可支持多个相关节点，但全队总题数再次去重。重复重做增加attempts，不增加distinctProblems。小队AC不是个人independent证据。

状态优先级：有到期复习→`review_due`；无任何训练→`no_evidence`；至少一道有效independent题→`independent_evidence`；否则→`practiced`。本人自评不改变state，只并列显示；超过90天未练只加“近期证据不足”提示，不抹掉历史。

取消high/medium/low“能力置信度”，改展示可核对的证据数量与缺失项。v1不输出“熟练”“能力评分”或已验证诊断成功。

## 9. 页面、草稿与离线行为

新增 `/today/`、`/me/`；v1.1新增 `/team/`、`/contests/:id/`。登录成功且从首页发起登录时进入today；从详情编辑发起登录时返回原详情。`/`仍是公开总览，不强制把所有访问跳走。

today页面状态：`loading / ready / empty / offline / error / saving / conflict`。保存中禁用同一操作按钮，其他不相关内容仍可浏览；失败保留输入；冲突面板显示本地与最新版本差异，支持复制本地输入、重新加载或手动合并后用新版本提交，不提供无条件覆盖。

草稿使用 `journal-drafts-v2:<memberId>:<date>`，包含 `{draftVersion:2,memberId,date,baseRevision,problems,savedAt}`。300ms debounce，本地总配额预预算4MiB，单日最多1.2MiB UTF-8；超额保留内存并明确提示未持久化，不静默宣称已保存。先写成功再替换旧草稿，提交成功仅清除已提交版本，避免删除提交期间的新输入。

旧v1草稿不能证明归属：提供查看/复制入口，不自动绑定当前账号。切号/logout清空内存中的数据、请求、CSRF和正在展示的个人视图，保留各自隔离的磁盘草稿；异步响应必须校验发起时memberId和请求序号，旧账号响应不能回填新账号页面。使用storage事件提示另一标签页已更新草稿。

离线允许读已有静态页面与编辑本地草稿，不自动排队后台写入、不把草稿当作云端成功。计时只是本地辅助，重载后恢复开始时间，提交耗时由队员确认；不采集键盘操作或监控训练。

Service Worker在构建脚本中修改：只缓存允许的静态资源；`/api/**`、带credentials的工作台数据、`/data/publications/**`和`/data/build-info.json`必须network-only。导航fallback缓存应用壳，不能把任意详情HTML写成“/”的离线替身。API no-store与Service Worker绕过需要分别测试。

## 10. 保存与发布确认

用户状态分为“本地草稿→正在保存→已保存，网页发布中→已发布”，另有保存未确认、发布失败/发布状态未知。静态发布失败不回滚已成功保存的Git数据。

构建生成：

- `/data/build-info.json`：`{schemaVersion:1,sourceCommitSha,builtAt}`；CI必须使用真实checkout SHA，本地无SHA则null，不伪造。
- `/data/publications/<memberId>/<prefix>.json`：prefix为operationId去连字符后的前2位；内容为本快照存在的成功operationId数组，排序去重。只有实际写入Git的成功回执才进入此索引。

浏览器用cache:no-store查询对应分片，确认operationId存在才标为published。依次在保存后2、5、10、20、30秒查询，再每30秒一次，累计5分钟后停止并显示“已保存，暂未确认发布”，提供手动刷新；标签隐藏时暂停。

回执来自某次构建即可证明变更曾被纳入发布，但不保证此后没有再次编辑；本人最新内容仍以Worker快照为准。连续提交、取消旧构建、后续构建合并发布均可用operationId确认，不要求构建SHA恰好等于某次保存SHA。

v1不通过超时断言发布失败。只有将来可靠查询到相应发布任务失败才使用failed；上游查询不可用显示unknown。发布轮询必须取Worker配置的固定站点，不接受任意URL。

## 11. 模块与实现拆分

| 模块 | 职责 |
| --- | --- |
| `lib/problem-identity.mjs` | 平台别名、problemKey/subjectKey统一，浏览器/Node/Worker共用 |
| `lib/training-schema.mjs` | Profile/Plan/Event/Review/SelfAssessment与命令验证 |
| `lib/training-projections.mjs` | 纠错、作废、复习和证据纯函数投影 |
| `lib/recommendations.mjs` | recommend-v1，无DOM/网络/随机副作用 |
| `lib/draft-store.mjs` | 账号草稿、容量校验、跨标签通知 |
| `lib/training-api.mjs` | v2 API、版本、幂等、错误类型和请求取消 |
| `lib/views/today.mjs`, `lib/views/me.mjs` | 新页面渲染，数据由application协调 |
| `workers/storage/git-transaction.mjs` | 固定快照、版本验证、原子commit、回执重放 |
| `workers/services/training.mjs` | 业务命令、权限、事件序号、投影和计划关联 |
| `workers/routes/training.mjs` | 路由与HTTP状态，不复制领域规则 |
| `scripts/training-data.mjs` | 构建聚合、发布索引、兼容历史日志 |
| `scripts/reindex-training.mjs` | 新增training:reindex命令，重放索引、dry-run/--check/--write |

不把浏览器DOM模块导入Worker；共享模块不得依赖node:fs。构建复制器当前处理lib目录，实施时必须验证是否支持新增子目录的递归发现、相对import重写与内容哈希；若不支持，先补构建能力再增加views目录。禁止只在开发环境能导入、生成站点404。

## 12. 迁移、发布与回退

1. 新增配置与只读解析、v4兼容、共享投影；对全部既有日志做dry-run检查，不修改源数据。
2. 后端先上线v2读写能力；旧写接口短期仍存在时新功能不开放，避免老客户端丢字段。旧日期GET可增添revision字段但保留problems/updatedAt的顶层结构，便于过渡客户端发送If-Match；不存在日期返回revision=null。
3. 前端、构建和Service Worker升级就绪后，统一要求旧 `/api/logs/date` PUT/DELETE 携带版本；旧客户端缺版本返回428和刷新提示，GET继续兼容。复习、机器人及其他写通道逐一检索验证。
4. 只有所有写入口都条件化后启用v4写入与个人工作台。新功能用独立配置开关 `trainingV2Enabled` 控制入口；关闭开关不恢复无版本写入。
5. v3字段缺失按unknown处理；保留旧ID、路径、标签、Markdown和代码。首次编辑按v4保存，但不生成历史尝试证明。
6. 删除新事件或批量重写旧Git历史不作为回退手段。回退到具备v4兼容和版本保护的最后稳定构建；若没有安全写版本，暂时只读并保留本地草稿。

验证日志数量、稳定链接和正文哈希未因迁移改变；派生统计变化须能由明确的新去重/证据规则解释。姓名、GitHub login变更通过成员配置映射，不搬迁旧目录。

## 13. v1.1 协作契约

继续Git存储与条件写入；内容公开、仅队员可发言。v1.1不承诺即时聊天，刷新获取最新快照。若要求私密或高频实时协作，必须先设计独立存储与迁移规格。

### 13.1 实体与文件

| 实体/路径 | 字段 | 权限和约束 |
| --- | --- | --- |
| `training/contests/<id>/activity.json` | id,creatorId,title≤120,url,startAt,endAt,mode,status,problemSnapshots≤100 | mode=individual/team；status=open/closed/cancelled；任何成员可建，仅发起人改活动；startAt<endAt |
| `.../registrations/<memberId>.json` | memberId,status,teamId?,updatedAt | status=joined/withdrawn；只改本人；发起人不能代报名 |
| `.../teams/<teamId>.json` | id,creatorId,name≤80 | 创建者改名称；队员自愿在报名中选择teamId；小队人数≤3 |
| `.../results/<resultId>.json` | id,authorId,scope,memberId?/teamId?,solvedKeys,score?,note≤2000 | scope=individual/team；个人本人写；小队成员可各自提交署名赛果报告，报告仅作者可改 |
| `training/members/<id>/backlog/<itemId>.json` | id,contestId,subjectKey,problem,status,linkedAttemptId? | 本人选择加入；status=open/resolved/removed；resolved须关联有效完成尝试 |
| `training/discussions/<threadId>/thread.json` | id,authorId,subjectKey?/nodeId?,title≤120,status | 至少一种关联；status=open/resolved；仅作者改线程信息 |
| `.../posts/<postId>.json` | id,authorId,body≤10000,spoiler,createdAt,updatedAt,deletedAt? | 登录队员回复；正文仅作者改/软删；默认spoiler=true |
| `training/resources/<id>.json` | id,authorId,kind,title≤120,body≤30000,nodeIds≤10,problemKeys≤100,updatedAt | kind=template/problemset/note；仅作者直接修改，其他人通过讨论建议 |

所有实体schemaVersion=1。服务端分配createdAt/updatedAt和作者，ID采用UUID。逻辑删除保留关联与Git历史，不宣称彻底抹除公开内容。

### 13.2 路由

均位于 `/api/v2`，沿用第5/6节；列表GET默认50上限100并用快照cursor。

| 路由 | 行为 |
| --- | --- |
| GET/POST `/contests`，GET/PATCH `/contests/:id` | 列表、创建、详情、修改本人活动 |
| PUT `/contests/:id/registration` | 本人报名或退出；校验活动open、队伍存在且人数容量，事务内重查 |
| POST `/contests/:id/teams`，PATCH `/contests/:id/teams/:teamId` | 创建小队、创建者改名；不代成员报名 |
| POST `/contests/:id/results`，PATCH `/contests/:id/results/:resultId` | 创建/修订本人署名赛果；报告间冲突并列展示，不冒充官方共识 |
| GET/POST `/me/backlog`，PATCH `/me/backlog/:id` | 查看、主动加入、移除补题项；完成由尝试命令原子关联 |
| GET/POST `/discussions`，GET/PATCH `/discussions/:id` | 列表/发起/详情/作者修改；subjectKey,nodeId可过滤 |
| POST `/discussions/:id/posts`，PATCH/DELETE `/discussions/:id/posts/:postId` | 回复、作者改/软删 |
| GET/POST `/resources`，GET/PATCH `/resources/:id` | 资料列表、创建、详情、作者修订 |

活动改时间、取消和停止报名不删除现有赛果；报名时检查活动和目标队伍的最新状态，写入冲突后重新验证。赛果仅记录声明，不生成个人尝试、不改变能力证据；个人补题完成后才通过尝试计入个人记录。score仅允许非负有限数，不在跨比赛间比较。

活动问题快照提供统一候选，成员自行选择补题；禁止赛后自动给全体成员生成强制任务。资料共同编辑、官方赛果确认和通知发送均不在v1.1。

## 14. 验收矩阵

| ID | 场景 | 必须结果 |
| --- | --- | --- |
| ID-01 | 改题目顺序、读取旧v3 | 详情链接不变，结果unknown，不生成独立完成 |
| ID-02 | CF平台别名/大小写、AtCoder下划线、缺题号 | 同题归一一致，未知身份不误合并 |
| AUTH-01 | A提交B的memberId/recordRef | 403或422，无文件变更 |
| AUTH-02 | 切号时A的请求晚返回 | 不进入B页面或草稿 |
| SAVE-01 | 两页同资源同版本保存 | 一次成功、另一次409，不覆盖 |
| SAVE-02 | 不同成员/不同题同时提交 | 竞争重算后均保留，不重放旧changes |
| SAVE-03 | 多次同幂等键、首次响应丢失 | 仅一个逻辑事件/回执，重放成功 |
| SAVE-04 | 同幂等键不同body | 409，无第二次变更 |
| SAVE-05 | Git更新ref超时且实际上成功 | 查询回执恢复，不重复新增 |
| SAVE-06 | 第16题、未来日志、畸形日期、超字节 | 拒绝且不产生部分commit |
| SAVE-07 | 缺版本旧PUT/DELETE | 428，不能成为旁路 |
| SAVE-08 | 直接Git改日志/事件后索引过期 | reindex --check失败；重建后与完整重放一致 |
| PLAN-01 | 同快照同输入重复推荐 | 完全相同排序/原因；GET不写入 |
| PLAN-02 | 刷新已接受计划、跨日延期、目标同题 | 计划稳定，延期原子且不重复 |
| PLAN-03 | 只开始/未完成/题解完成 | 分别started/started/completed；仅最后一个为完成，仍非独立证据 |
| REVIEW-01 | 延期、归档、自评mastered旧记录 | 独立重做数均不增加 |
| REVIEW-02 | 同题多次重做和同日多次独立 | 题数不膨胀，同日连续数最多+1 |
| REVIEW-03 | 纠正/作废/历史补录 | 历史可追溯，投影可重建，当前日程符合8.1 |
| BUILD-01 | 子目录模块、所有深链接、Markdown/公式/代码 | 构建后可读，无缺失模块，无渲染回归 |
| PUB-01 | 连续commit取消旧构建 | 后续产物含operationId即确认发布 |
| PUB-02 | 发布慢/失败、旧SW缓存 | 保存仍成功，不误报已发布或超时失败 |
| PERF-01 | 每成员10,000次尝试工作台加载 | 不逐条获取历史事件，返回体符合6.4预算，计数不被截断 |
| DRAFT-01 | 刷新、配额满、切号、提交时继续输入 | 可恢复或明确降级，不串号，不删新草稿 |
| TEAM-01 | 发起人修改他人报名或赛果 | 拒绝；小队结果不进入个人独立完成 |

单元测试覆盖共享验证、身份、纯函数投影和推荐；Worker使用可控Git适配器模拟ref竞争、超时和幂等；浏览器测试覆盖真实登录状态切换、冲突输入保留、草稿、路由、CORS及SW。不得用真实队员日志执行破坏性测试。

功能交付前运行 `npm run check:syntax`、`npm test`、`npm run build` 和上述关键浏览器用例。本次仅编写规格，不把这些测试列为已通过。

## 15. 工作包与完成定义

| 工作包 | 实现范围 | 前置 | 退出条件 |
| --- | --- | --- | --- |
| W1 | 标识、成员映射、Schema、Git事务与回执 | 无 | ID/AUTH/SAVE测试通过 |
| W2 | 单题日志、尝试、草稿与旧写入口保护 | W1 | 旧日志兼容，冲突和切号可靠 |
| W3 | 复习与证据纯函数、事件纠错/作废 | W2 | REVIEW矩阵和重建一致性通过 |
| W4 | 推荐、计划API、today/me视图 | W3 | PLAN矩阵及移动端操作通过 |
| W5 | 静态投影、发布确认、SW与灰度开关 | W1，可与W2-W4并行 | BUILD/PUB通过；启用前汇合W2-W4 |
| W6 | 自主约赛、补题、讨论、资料 | v1.0稳定 | TEAM矩阵与作者权限通过 |

v1.0完成须同时满足W1-W5、全部对应验收项、历史链接/数据兼容和可回退部署；不能用“首页已经画出来”替代数据闭环完成。

## 16. 外部依据与限制

本规格的业务参数（题量、预算、间隔、重试次数）是产品初始规则，不是平台限额或科学测量结论。

- Git非force引用更新及其冲突/校验返回码依据 [GitHub Git references](https://docs.github.com/en/rest/git/refs#update-a-reference)。不能把所有422当成并发冲突。
- 核心保存需在响应前完成，不使用响应后任务保证持久性；运行期背景见 [Cloudflare Workers context](https://developers.cloudflare.com/workers/runtime-apis/context/)。
- 当前API限流使用isolate内存，不能当作全局准确限流；正确性由Git事务保障。尚未选择新的Cloudflare存储产品，亦未声明任何费用或额度承诺。
