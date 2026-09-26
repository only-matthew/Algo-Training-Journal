# 项目发展史：Algo Training Journal

依据：`git log` 全部 356 个提交（2026-07-23 → 2026-09-27）与 `docs/` 全部文档。凡引用提交均给出短哈希，凡引用文档均给出文件与日期。

---

## 概览

| 指标 | 值 |
| --- | --- |
| 时间跨度 | 2026-07-23 → 2026-09-27（66 天，含首尾 67 天） |
| 提交总数 | 356 |
| 其中数据提交 | 217（`save(<队员>)`，即队员通过网页表单写入日志，由 Worker 以本人身份提交） |
| 其中工程提交 | 139 |
| 跟踪文件数 | 22（首提交）→ 939（09-25 清理后）→ 965（HEAD） |
| 工程提交分布 | 7 月 31 · 8 月 45 · 9 月 63 |
| 代码模块 | `lib/` 48 个 · `workers/` 14 个 · `scripts/` 21 个 · `test/` 59 个测试文件 |
| 文档 | `docs/` 20 篇 |

**提交作者构成**（这是理解项目性质的关键）：

| 作者 | 工程提交 | 日志提交 |
| --- | --- | --- |
| only-matthew（廖夏，维护者） | **130**（另有 4 个用了另一种名字拼写） | 98 |
| wzzzzhhhhh（王梓豪） | 3 | 63 |
| Yiming Guo（郭一鸣） | 2 | 56 |

即：**这是一个近乎单人维护的项目**，另外两名队员主要通过网页表单贡献训练数据，偶尔提交少量修复。356 个提交里有 217 个（61%）是**应用自己写出来的数据**，不是人写的代码 —— 这正是"仓库即数据库"架构在版本史上的直接体现。

**开发节奏**：整条时间线（含日志提交）**每天都有提交**，无一日中断。仅看工程提交则存在 5 段空档：`08-01→08-05`、`08-05→08-09`、`08-11→08-15`、`08-15→08-19`（各 4 天）与 `08-31→09-06`（6 天，最长）。最密集的一天是 **2026-08-26（18 个提交，其中 14 个工程）**，其次是 09-21（19 个提交，其中 13 个工程）与 09-16（15 个提交，其中 6 个工程）。

---

## 阶段一：MVP 与数据布局定型（07-23 → 07-24）

**`db60eab`（07-23）`feat: build the algorithm training journal`** —— 单次提交 2254 行，奠定了整个项目：

```
app.js                848 行单体前端
index.html            117 行
scripts/generate-data.js  191 行
workers/oauth.js       47 行（CommonJS）
logs/<队员>/YYYY-MM-DD.md   单文件/天
.github/workflows/deploy.yml
```

第一版的数据形态是**每人每天一个 Markdown 文件**（`logs/廖夏/2026-07-21.md`，42 行），配 `TEMPLATE.md` 模板。这解释了项目名称里的 "Journal"：起点是一份**手写 Markdown 训练日志**，网页只是它的展示层。

**次日就改了数据布局。** `7131b25`（07-24）引入 `logs/<队员>/YYYY/MM/DD/` 日期目录，`a282a03`（07-24）删除旧单文件布局，同时新增两个迁移脚本 `scripts/migrate-logs.js` 与 `scripts/migrate-date-layout.js`。

值得注意的是：**这两个一次性迁移脚本在仓库里存活了整整两个月**，直到 `1152394`（09-25，`chore: remove obsolete scripts and unused assets`）才被删除 —— 而 `docs/REPOSITORY-STRUCTURE.md` 后来才把"完成的一次性迁移不要长期留在仓库"写成规则。规则是这次清理的产物，不是前提。

同期还落了：二级页面（`7131b25`）、错题本与 tags（`6ee6f39`，07-25）、OAuth 完善（`f25a720`，07-25）。

---

## 阶段二：功能补齐与工程化重构（07-25 → 08-01）

这 8 天把"能用的展示页"变成"有工程结构的项目"。

**功能线**：

- `3049ec9`（07-28）题号记录与原题链接
- `4bbd95f`（07-28）CDN 改本地加载、轻量化 data.json 与懒加载 —— 首次引入**产物分层**的思路
- `a52079a`（07-29）标签云 + AI 概括（Worker AI 首次接入）
- `436d79f`（07-30）SEO 与页面渲染增强
- `3aa61ab`（07-31）训练分析批量导出（Markdown / PDF / LaTeX）
- `efb540f`（08-01）标签别名归一与建议
- `50b17da`（08-01）tag catalog 进入构建与校验

**工程线**：

- `1fad257`（07-31）`重构：拆分前端模块、Worker 迁移至 ESM、安全与性能优化` —— **这是项目的第一次大重构**：848 行的 `app.js` 拆成 `lib/` 模块，`workers/oauth.js` → `workers/oauth.mjs`。跟踪文件数从 22 跳到 **167**，`lib/` 的分层结构由此而来。
- `465f969`（08-01）强化 OAuth 会话安全、兼容旧版日志路径

**文档线的起点**：这一阶段没有任何设计文档，`README.md` 是唯一记录（首提交即带 97 行）。

---

## 阶段三：检索、导入与学习路线（08-05 → 08-31）

这是**战线最长、产出最多的阶段**（45 个工程提交），也是产品形态从"日志展示"转向"训练平台"的转折。

### 3.1 时间口径统一（08-05 → 08-15）

- `4ac485e`（08-05）修复跨时区"最近统计"漏掉最新日志
- `4360787`（08-09）记录并展示日志最后更新时间
- `d3ebdf3`（08-11）**统一 `updatedAt` 为 UTC+8 并回填缺失记录** —— 配套脚本 `scripts/backfill-updated-at.js`（08-11 加入，09-25 删除）
- `2b99503`（08-15）更新洛谷难度分级选项并**校正历史记录**

这一段的关键词是**数据一致性回填**：功能跑起来之后，才发现早期数据的时间与难度口径不统一。

### 3.2 检索与导入（08-19 → 08-23）

- `5096017`（08-19）**复习队列、同题聚合、导入 API + Worker/性能优化** —— 一次性引入三个至今仍是核心的能力
- `bc65554` / `c92aa19` / `e20f45b` / `d1d52ee`（08-19）洛谷 `lentille-context` 取难度与描述、CF 3 天 AC 窗口分页、CF 标签合并为中文、提交页链接替代被反爬的源码抓取
- `bf3bcd7`（08-23）快速导入支持 AtCoder

至此确立了一个**反复出现的技术主题：上游站点攻防**。CF 有 Cloudflare 反爬、AtCoder 对机房出口整体 403、洛谷有配额与风控 —— 后续 09 月的题面抓取工作全部是在这条既有限制上继续找路。

### 3.3 学习路线（08-25 → 08-26）

- `7587cfa`（08-25）**新增「学习路线」模块（算法知识树 + 分阶段路线 + 题单）** —— 跟踪文件数从 167 跳到 **543**，因为引入了 `know-tree/`（教材原文）与 `curriculum/`（生成后的结构化数据）
- `490e535`（08-25）CF 题单扩到 545 题
- `71a1923`（08-26）NOI 大纲与蓝桥杯考点标签并入知识树节点
- `c1f81f5`（08-26）**知识树 × 题目标签打通** + 暗黑模式修复 + 标签云去重

### 3.4 8 月 26 日的爆发（14 个工程提交）

单日之内落了一整套侧翼能力：

| 提交 | 内容 |
| --- | --- |
| `1cc0a3e` | Service Worker 缓存加速 + QQ 机器人（指令式） |
| `9ffd4e4` | QQ 机器人改走 **Webhook + Cloudflare Worker**（免服务器） |
| `b6eae65` | 机器人指令识别增强（无需配置昵称识别 @提及） |
| `20730d2` | 知识树督促与 AI 教练指令 |
| `4bfe1fd` | 督促改为知识点覆盖制 + AI 模型切到 deepseek-v4-flash |
| `f36abef` | 新增「点评」指令 —— LLM 解读知识树进度 |
| `3a28319` | 学习路线首屏零 JSON 请求（直接用预渲染 HTML） |
| `e98d296` | 前端瘦身：路线页不再加载 KaTeX/Prism CSS 与表单模块 |

后两条是**同一天内的自我修正**：功能刚上线就发现路线页过重，立刻做了性能瘦身。`6d00e30`（08-27）又把机器人「今日」日界改成 UTC+8 凌晨 4 点（凌晨打卡算前一天）—— 一个只有真实使用者才会提出来的需求。

### 3.5 掌握度闭环与第一次系统性审查（08-28 → 08-31）

- `2623349`（08-28）`surface knowledge training evidence`
- `089dafd`（08-28）**`separate frontend application coordinator`** —— 抽出 `lib/application.mjs` 作为协调层，「`data.mjs` 数据仓库 → `application.mjs` 协调层 → `renderer.mjs` 视图」的单向依赖由此确立
- **`docs/OPTIMIZATION.md` + `docs/PRODUCT.md` + `docs/HANDOFF.md` 同于 08-28 诞生** —— 项目第一次做完整的自我审查（OPTIMIZATION 列出 P0–P3 问题清单）
- `9373b78`（08-29）知识点掌握度接线与复习闭环
- **`docs/CONSTRUCTION-PLAN.md`（08-29）** 把审查结论改写成施工任务书，并明确写着：**"执行方式：subagent 分工构建 + 独立验证"**，任务按 A/B/C/T 拆分，T 是独立的验证任务。这是仓库里最早的"多智能体分工 + 独立验证"工作流记录。
- `4626d70`（08-31）隐藏内部掌握到期日

从 `OPTIMIZATION.md` 的自述可看到当时的验证基线：**37 个源码文件、199/199 测试通过**（对比今天：85 个文件、58 个测试文件）。

---

## 阶段四：v2 训练平台 —— 快速上线，两天后下线（09-06 → 09-11）

**这是全项目最值得记录的一段。**

长达 6 天的工程空档（08-31 → 09-06）之后，09-06 一天之内落了 14 个提交，引入了一整套 **v2「队员训练工作台」**：

| 提交 | 引入的持久结构 |
| --- | --- |
| `e854e6c` | `feat: add member training workspace` —— `workers/services/training.mjs`、`workers/storage/git-transaction.mjs`、`lib/training-api.mjs`、`lib/recommendations.mjs`、`training/indexes/catalog.json` |
| `217874a` | `feat: complete personal training workflow` |
| — | **`docs/SPECIFICATION.md` 诞生**（09-06）：事件溯源、内容寻址 revision、幂等、条件写入 |
| `8e98009` / `9040aad` / `c9e61ee` | CI 隔离 Worker 测试（Worker 测试装全局 `fetch` mock，必须独立进程串行） |
| `f950cc2` | 补上遗漏的 training v2 Worker 路由 |
| `d6a18b2` | 修复 training 页导航与历史证据 |
| `81db3c3` | 限制 workbench 的仓库读取量 |

这套设计与既有 v1 日志**并行**：`logs/` 是正文权威，`training/` 是计划、事件、自评的权威（`SPECIFICATION.md` §1.2）。

**然后 09-08 它就被下线了。**

```
b686198（09-08）更新UI
  - lib/router.mjs   17 行改动
      + // 「我的训练」已下线；让旧链接落回仍然有效的训练记录首页。
      + if (route === "training") { window.history.replaceState(null, "", "/"); route = ""; }
      - if (route === "training") pageId = "training-page";
      - const render = route === "training" ? window.trainingRouteRenderer : window.journalRouteRenderer;
  - index.html / app.js / renderer.mjs / roadmap.mjs / style.css（+488 行）
```

同一天还有 `7605d50 更新了UI-beta0.1` 与 `37faa1e 修复题单列表为卡片`。也就是说：**v2 工作台从上线到下线只有两天**，被一次以视觉为主的 UI 改版顺手摘掉。

后果一直留到今天：`lib/training-dashboard.mjs`（该页面的完整 UI，含控制器、仪表盘、图表）成为**孤儿模块**，只有它自己的测试引用它；`/api/v2/me/*` 路由仍然可达且有测试；而 `training/` 目录里最终只有 3 份 `profile.json`、3 份 legacy 索引和 1 份 operation —— v2 的事件、计划、复习、自评存储**几乎没有数据**。产品文档则长期停留在"已提供 `/training/` 页面"的描述上。

**同期推进**：`1bfdfb3` / `91541b1`（09-10）Lighthouse 性能优化（产出 `docs/lighthouse-optimization-2026-09-10.md`）；`0aba5e6`（09-11）LaTeX 导出重构。

---

## 阶段五：可靠性与内容规模化（09-13 → 09-26）

v2 下线后，项目的重心明确转向**把 v1 做扎实**：写入可靠性、题面内容、以及容量。

### 5.1 活力指数与区间训练（09-13）

`50e9309` `feat: add rating vitality and interval training support` —— 单次提交同时带来两件大事：

- **活力 v2**：跨平台 Rating 折算 + 同题去重的训练活力评分（`lib/vitality.mjs`、`vitality-chart.mjs`、`vitality-summary.mjs`、`member-vitality.mjs`），文档 `VITALITY-DESIGN.md` + `VITALITY-V2.md`
- **区间训练**：`startedOn`/`solvedOn` 字段、`lib/training-interval.mjs`、`fileIndex` 稳定文件槽位；文档 `PENDING-FEATURES.md`

同日还有 `ui-repair-2026-09-13.md`（首页活力展示修复）。这两项功能是本项目**从"记录训练"走向"评估训练"**的分界。

### 5.2 写入可靠性（09-15 → 09-16）

- `27e97fe`（09-15）**日志条件写入、题面 PDF 附件与题目增强** —— 引入 `revision` / `If-Match` 语义与附件链路；配套 `docs/PROBLEM-ENRICHMENT-*`、`fbe8d9d` 记录上线/回滚经过并新增 `workerd` multipart 跨运行时探针
- `c4329c7`（09-15）洛谷难度星标 `★` 在 LaTeX 导出被静默丢字形
- `3a93356`（09-16）**学习状态模型重构**：把 `reviewStatus` 一个字段拆成「完成结果 / 掌握自评 / 复习安排 / 错题标记」四个独立字段（v5），产出 `LEARNING-STATE-DESIGN.md` + `LEARNING-STATE-SPECIFICATION.md`
- `c86c756`（09-16）CF 题面 blocked 的真实根因是缺浏览器请求头
- **`60c3b0e`（09-16）`fix(worker): 并发保存不再用旧快照覆盖个人索引（Pages 连续四次部署失败的根因）`** —— 提交信息本身就记录了一次线上事故：连续四次部署失败，根因是并发保存用旧快照覆盖索引
- `8387eaf`（09-16）复习按钮排布回退修复

### 5.3 题面内容与图片归档（09-18 → 09-21）

- `fa09850`（09-18）移除自动定时刷新与切回标签页补刷
- `0976aa0`（09-19）**题面图片随抓取归档到仓库**（v6，`statementImages`），不再插入外链
- `c0735d0` / `6b7b01f` / `74ba55c` / `39fbeff`（09-21）AtCoder 题面抓取 → 官方页被 403 时退回洛谷 `AT_` 镜像 → 导入带算法标签与 AC 提交页链接 → 洛谷未收录题目用**浏览器小书签回传源码**兜底

这一串是**上游攻防主题的最终形态**：CF 用请求头绕过、AtCoder 彻底放弃服务端直连改用"官方页 → 洛谷镜像 → 用户浏览器回传"三级降级。`940ebbd` 还记录了 vjudge 方案的评估结论（题目页有登录墙，不采用）。

### 5.4 容量与部署（09-21 → 09-22）

- `648c402`（09-21）**Scale journal build to 10000 records** —— 废弃单体 `all.json`，改分片产物；`docs/SCALE-10000.md` 记录了实测：**Docker（4C/4G）下 10 名成员 × 1000 条记录，冷构建 40.2s、热构建 11.7s，20,420 个文件共 388 MiB**，低于 GitHub Pages 的 1 GiB 上限
- `docs/REPOSITORY-STRUCTURE.md`、`docs/SUBMISSION-PAGE-SPECIFICATION.md`、`docs/SUBMISSION-PAGE-HANDOFF.md`（09-21）
- `caf49cf`（09-21）提交表单 UI 更新；`e2afa2d` 修复提交页无法跳转
- `875a343` / `bb04bc5` / `f516e2e`（09-22）Improve journal reliability and deployment checks、部署时补 CF/洛谷难度、修复 CF rating 导入与表单布局

### 5.5 收尾（09-24 → 09-26）

- `cc600de` / `a3980e8`（09-24）分析页全局搜索与日期范围选择
- `500e456`（09-25）提交页 UI 精修 + 洛谷题面优先中文 `contenu`
- `5252785`（09-25）陈旧重叠草稿需二次确认
- `b125c6d`（09-25）整日保存预览 + 展示题目活力
- `d3ef648` / `2c9f7d7` / `1152394`（09-25）恢复 09-24 题目、修复洛谷导入与代码编辑器标题、**无用文件清理**（删除三个迁移脚本与旧 PNG 源图，跟踪文件数回落）
- **`500e456`（09-25）同时完成仓库目录整理**：根级 `app.js` 等浏览器入口统一移入 `src/`，`docs/REPOSITORY-STRUCTURE.md` 随后诞生为目录契约
- `2f8b0bf`（09-26，HEAD）`fix submission flow and backfill CF ratings`

---

## 三条贯穿主线

### 主线一：数据布局迁移了三次

| 时间 | 布局 | 触发 |
| --- | --- | --- |
| 07-23 | `logs/<队员>/YYYY-MM-DD.md`（单文件/天） | MVP |
| 07-24 | `logs/<队员>/YYYY/MM/DD/` + 分文件正文 | 一天就发现单文件解析不可靠 |
| 09-13 | 同日多题用 `fileIndex` 固定文件槽位 | 删除中间项会让正文串位 |
| 09-19 | 附件（PDF / 图片）与正文同链路归档 | 外链图床被 CSP 拦截 |

迁移脚本 `migrate-logs.js`、`migrate-date-layout.js`、`backfill-updated-at.js` 都**存续到 09-25 才被删除**。

### 主线二：写入可靠性逐级加固

```
整日覆盖 PUT                      07-24 起
→ 条件写入（revision / If-Match）  09-15
→ 幂等键 + 快照一致性             09-15 ~
→ 并发保存不覆盖个人索引           09-16（因 Pages 连续四次部署失败）
→ v2 事件溯源 + 不可变操作回执      09-06 设计，09-08 UI 下线后未投入使用
```

### 主线三：上游站点攻防

```
CF 3 天 AC 导入          08-19
→ CF 提交页被 Cloudflare 拦，改为跳转链接    08-19
→ AtCoder 导入           08-23
→ AtCoder 标签只能取自洛谷镜像               09-21
→ 题面三级降级：官方页 → 洛谷镜像 → 浏览器回传 09-21
→ 题面图片归档进仓库（外链被 CSP 拦截）       09-19
```

---

## 文档体系的演化

| 时间 | 事件 |
| --- | --- |
| 07-23 → 08-27 | **只有 README**，无设计文档（约 5 周） |
| 08-28 | `OPTIMIZATION.md`（自我审查）、`PRODUCT.md`（产品方案）、`HANDOFF.md`（交接）同一天诞生 |
| 08-29 | `CONSTRUCTION-PLAN.md` 把审查改写成施工任务书（subagent 分工 + 独立验证） |
| 09-06 | `SPECIFICATION.md` —— 技术规格与验收矩阵 |
| 09-10 | `lighthouse-optimization-2026-09-10.md` |
| 09-13 | `VITALITY-DESIGN.md`、`VITALITY-V2.md`、`PENDING-FEATURES.md`、`ui-repair-2026-09-13.md` |
| 09-15 | `PROBLEM-ENRICHMENT-DESIGN.md`、`PROBLEM-ENRICHMENT-SPECIFICATION.md` |
| 09-16 | `LEARNING-STATE-DESIGN.md`、`LEARNING-STATE-SPECIFICATION.md` |
| 09-21 | `SCALE-10000.md`、`SUBMISSION-PAGE-*` |
| 09-25 | `REPOSITORY-STRUCTURE.md` |

一个明显规律：**文档是跟着"出过事"长的**。OPTIMIZATION 出现在功能审查之后，LEARNING-STATE 出现在 `reviewStatus` 语义混乱之后，SCALE-10000 出现在容量担忧之后，REPOSITORY-STRUCTURE 出现在目录整理之后。

`HANDOFF.md` 是纯追加式的（79 KB / 684 行），但**有日期的小节只覆盖 09-11 之后**，更早的 7 周到 9 月初没有任何叙事记录 —— 那一段时间的历史只能从提交信息里还原（本文档的工作之一）。

---

## 阶段六：外部审计与修复批次（09-26）

**这是项目第一次被外部独立审计，也是第一次按"审计 → 修复 → 签收 → 部署"的闭环走完一轮。**

审计产出 `docs/PROBLEM-AUDIT.md`：22 项问题，分五档（P0 故障级 / P1 校验缺口 / P2 文档冲突 / P3 架构维护 / P4 设计口径）。每一项都带 `file:line` 证据，且**先验证再落笔** —— 审计过程中有两个原本准备列入的问题在查证后被自行否掉（资产版本号机制、日志 schemaVersion 的版本上限校验）。

审计发现的最严重一项是**一条业务数据可以打挂整站发布**：训练区间的"最多 120 天"限制只存在于前端，而构建期的 `buildHeatmapCounts` 会直接调用 `expandTrainingInterval` 并让它抛异常，且无 try/catch。任一白名单成员写入一条越界区间，下一次 push 触发的 CI 就会在统计函数里抛错，**全队 Pages 部署中断**，报错还指向与病因相距很远的函数。

第二类发现是**文档漂移的规模**：22 项里约一半是文档与实现脱节。最典型的是 `PENDING-FEATURES.md` 把已经端到端上线、生产数据里已在使用的 `fileIndex` 与区间训练写成"尚未实现"，而 README 全文没有任何一处提到区间训练 —— 文档在**两个方向上同时失真**。

**修复批次（`ae76d89`，2026-09-26）**：31 个文件，+528 / −185，新增 4 个文件。

```
config/members.json               三人白名单：memberId / githubUserId / login / logDirectory / cfHandle / atcoderHandle
workers/member-config.mjs         按 githubUserId / login / memberId 三张查表
workers/services/log-planning.mjs 从 oauth.mjs 迁出的日志规划领域逻辑
test/member-config.test.mjs       新增测试
```

主要改动：

| 类别 | 内容 |
| --- | --- |
| P0 校验下沉 | 区间校验进入 `validateLogInput`，v1 与 v2 两处调用点都传 UTC+8 今天；构建期区间展开加降级，历史越界数据只按记录当天计入并告警 |
| P0/P1 命令粒度 | 新增 `PATCH /api/v2/me/logs/dates/:date/records/:id` 单题复习命令，复习快捷操作不再整日 PUT |
| P1 身份 | 成员识别改为按 `githubUserId`，会话与 v2 存储使用固定 `memberId`，GitHub 改名不再导致失去登录权限 |
| P1 路由补齐 | `GET /me/attempts`、`attempts/:id/corrections`、`attempts/:id/void`、`GET /me/evidence/:nodeId` |
| 结构 | 日志规划逻辑迁出 `oauth.mjs`（保留 re-export 维持导出面）；`check-syntax` 改用 `stdio: inherit` 并区分 spawn 失败；CI action 版本统一 v6 |

**签收（独立复核，不看改动声明）**：19 项已修复、3 项部分修复、0 项未修复，另记 4 条残留项 R1–R4；其中第 3 条与 R1–R4 于次日收口，最终为 20 项已修复、2 项部分修复（见本节补记）。复核方式包括完整读取 diff、实跑 `npm run verify`、以及对文档声明做数据核对 —— 例如验证 `VITALITY-V2.md` 新写的"193 条记录有 24 条带真实 outcome"，独立统计结果完全一致。

签收时的部分修复项：

- **重叠区间计数**：采纳"澄清口径"方案（`count` 表示覆盖当天的记录数，可能 >1），但 `mergeTrainingDates` 变成死代码，且"训练日"(`activeDays`) 只取记录日期、不展开区间。实测王梓豪近 30 天：记录日 21、热力图覆盖 25 天，其中 4 天纯由区间产生 —— 同站出现"训练日历 25 天 / 训练日 21 天"两个不一致的数字。
- **v2 路由**：补齐关键读改接口，未实现的 `records` 通用增删改与 `plan-links` 已在规格里显式标注为"目标契约，不代表每一行均已上线"。
- **清理**：HANDOFF 加了"不再作为当前实现单一权威"的声明，但 `build/` 下 22 个一次性草稿文件仍在。

**部署（2026-09-26）**：按 HANDOFF 记录过的既有约束，**Worker 必须先于前端上线**（新的单题 PATCH 路由旧 Worker 没有；前端先上会让复习按钮失效）。

| 步骤 | 结果 |
| --- | --- |
| Cloudflare Worker | `wrangler deploy algo-oauth` 成功，上传 334.29 KiB（gzip 83.92 KiB），Version ID `0f505358-2524-41e8-874a-c189ec97418b` |
| Worker 冒烟 | 匿名 `GET /api/session` → HTTP 200，body `null` |
| 前端推送 | `2f8b0bf..ae76d89` → `main` |
| CI（run `36244066016`） | 三个 job 全过：browser-check（Playwright 回归）、build（`npm run check` + Pages artifact）、deploy |
| 线上核对 | 首页 HTTP 200；线上 `style.css?v=7530672ba490` **与本地构建哈希完全一致**；首页与随机 3 个题目页 `account-menu=1 / header-actions=0`（旧头部标记已清除） |

部署前的一次预检值得一提：本机 wrangler 的 OAuth token `expiration_time` 已过期（2026-09-25），但 wrangler 用 refresh token 自动刷新成功；SSH 推送在受限沙箱下曾因 `couldn't create signal pipe` 失败，属环境限制而非仓库问题。

### 阶段六补记：残留项收口（09-27，`8f65c55`）

签收留下的第 3 条与 4 条残留项在同一天被收口。11 个文件、+248 / −26，测试 76/76（较上批 +4）。

**最重要的是第 3 条，它被证明不是"文档措辞"问题而是真口径分叉。** 热力图早就把区间展开成逐日（`valueAll[day] += vitality / dates.length`），而"训练日"走 `activeDays`、只数记录日期 —— 同一个站点对同一份数据给出两个不一致的数字：王梓豪近 30 天"训练日历 25 天 / 训练日 21 天"。第三张时间线图里那句"区间用于训练日历与每日活力分摊"是对的，但它没说完：训练日并不认区间，而这恰恰是 `PENDING-FEATURES.md` 原始设计里写明的口径（"训练日 = 本人确认区间与历史单日的并集"）。

收口方式是让区间正式进入训练日口径：

| 改动 | 内容 |
| --- | --- |
| 共享助手 | `lib/training-interval.mjs` 新增 `trainingDatesOf()`：越界区间降级为"只算记录当天"并可回调报告原因；原先的死代码 `mergeTrainingDates` 改为复用它 |
| 训练日口径 | 近 30 天统计、成员页训练日、分析页趋势汇总全部改为「记录当天 ∪ 确认区间」，并按各自窗口裁剪 |
| 活力日曲线 | 也改为按覆盖天数等额分摊 —— 此前只有热力图分摊，两块面板对同一天给出的活力不同。分摊以千分位取整，保证各日之和与单题额度精确相等 |
| R1 读路径 | `decodeLog` 改走 `validateStoredLog()`：校验失败先降级重试、原值仍读回，两次都失败才抛结构化错误，不再让 `RangeError` 冒泡成 500 |
| R2 接口测试 | 单题 PATCH 路由补 4 个服务端用例（该接口已对生产开放却只有客户端断言）。同时澄清：原以为需要覆盖的"条件写入 409"无法从客户端触发，因为服务端在同一请求内自己读取版本 |
| R3/R4 | `config/` 补进目录契约；删除 `build/` 下 22 个一次性草稿 |

线上核对：三位队员的 `activeDays` 与热力图覆盖天数**逐人相等**（25/25、18/18、13/13），成员页训练日 58 与活力日曲线 58 天一致，活力累计末值 19.321 与 `total` 严格相等。

这一轮印证了阶段六开头那个判断：**文档与实现的脱节往往不是"忘了改文档"，而是口径本身分裂成了两半，而两边各自都有一份文档在为它背书。** 第 3 条之所以在签收时被判为"部分修复"，正是因为当时采纳的是"澄清措辞"而非"统一计算"。

---

## 从历史看出的几个模式

1. **单人维护 + 数据即提交**。维护者承担了 93% 的工程提交，另外两名队员的 119 个日志提交全部由 Worker 代写。项目的"协作"发生在数据层，不在代码层。

2. **每次大功能之后都有一次自我修正**。08-26 上午上功能、下午做性能瘦身；09-06 上 v2 工作台、09-08 因 UI 改版下线；09-15 上线条件写入、09-16 修并发覆盖。修正速度很快，但**修正的结论往往没有回写到设计文档**，这是文档与实现脱节的历史根源。

3. **v2 是本项目最大的一笔沉没成本，也是最清醒的一次决策**。09-06 用一天建起完整的事件溯源平台并写下 55 KB 规格，09-08 就被一次 UI 改版摘掉入口。此后所有工程精力都回到 v1。这不是失败 —— 但它留下了一套无人消费的 API、一个孤儿 UI 模块和一份长期领先于实现的规格，三者至今还在仓库里。

4. **上游限制塑造了产品形状**。CF 的反爬、AtCoder 的整体 403、洛谷的配额与风控，直接决定了"导入 → 标签 → 题面 → 图片"每一层都要有降级路径，最终演化出"浏览器小书签回传源码"这种非常规设计。

5. **打磨密度集中在最后两周**。09-13 → 09-26 的 61 个工程提交里，绝大部分是可靠性、口径与容量的收紧，而不是新功能 —— 项目在末期进入了"把已有东西做对"的阶段。

6. **审计批次打破了"修正不回写文档"的旧循环，但代价已经付出**。阶段六的 22 项问题里，代码缺陷只占少数（P0/P1 合计 8 项），其余大半是文档与实现脱节 —— 而脱节的成因正是模式 2 描述的那种"快速修正但不回写"。这一轮首次把文档修正与代码修正放进同一个提交，`PENDING-FEATURES.md`、`SPECIFICATION.md`、`PRODUCT.md`、`VITALITY-V2.md` 与代码在同一次部署里对齐。值得记录的是：让文档与实现脱节很容易（一个 UI 改版顺手摘掉页面、一个字段口径事后变化），而重新对齐需要一次完整的外部审计。这也解释了为什么 v2 的孤儿 UI 从 09-08 下线到 09-26 才被审计发现 —— 近三周里没有任何外部视角去核对"这个模块还有人用吗"。
