# 施工计划：2026-08 功能优化（P0–P3）

> 依据：`docs/OPTIMIZATION.md`「2026-08 功能审查」；执行方式：subagent 分工构建 + 独立验证。
> 本文件是施工任务书：每个任务的改动文件、验收标准与验证命令均在此定义。

## 0. 基线

- 分支：`main`；工作区未提交改动：`scripts/curriculum.mjs`、`test/curriculum.test.mjs`（掌握度数据形状重构）、`lib/mastery.mjs`、`test/mastery.test.mjs`（新增）、`docs/OPTIMIZATION.md`（审查报告）。
- 基线测试：`test/mastery.test.mjs` + `test/curriculum.test.mjs` 14/14 通过。
- 关键接口（改动方必须遵守）：
  - `assessMastery(evidence, referenceDate)`：`lib/mastery.mjs`，纯函数，Node/浏览器通用；`evidence` 需含 `totalRecords / masteredRecords / todoDueDates / lastTrainedAt`。
  - `buildNodeTrainingEvidence(node, logs)`：`scripts/curriculum.mjs`，输出 `{ totalRecords, relatedRecords, masteredRecords, todoRecords, todoDueDates, lastTrainedAt, byMember, records, related }`，**不含 `coverage/confidence`**。
  - `loadDateLog(date)` → `{ problems: [...], updatedAt? }`；`saveDateLog(date, problems)`（PUT 整日覆盖）；见 `lib/journal-api.js`。
  - `currentUser`：`lib/auth.mjs`，登录后含 `login / member（中文名）/ avatar_url / cfHandle`。
  - `REVIEW_STATUSES = { NONE: "none", TODO: "todo", MASTERED: "mastered" }`（`lib/constants.mjs`）。
  - UTC+8 今日：`toUtc8(new Date().toISOString()).slice(0, 10)`。

## 1. 任务分解

### 任务 A（P0）· 知识点掌握度接线 —— 构建端 + 路线渲染 + 样式 + 测试

改动文件：

| 文件 | 改动 |
| --- | --- |
| `scripts/generate-data.js` | 顶部导入 `assessMastery`；`generateRoadmapData` 中为整体 evidence 与 `evidence.byMember` 每项调用 `assessMastery(evidence, refDate)`（`refDate = toDateString(new Date())`）；`trainingEvidence` 输出 `{ totalRecords, relatedRecords, masteredRecords, todoRecords, todoDueDates, lastTrainedAt, state, confidence, reason, action, daysSinceTraining?, byMember }`，byMember 每项同样带 `state/confidence/reason/action/daysSinceTraining?`。**必须移除对 `evidence.coverage/confidence` 的读取**（当前 731-737 行）。 |
| `lib/roadmap.mjs` | `trainingEvidenceBadgeHtml`：徽标用 `evidence.state`（如「🧭 较熟练 · 训练 5」），无记录时「未接触」；`trainingEvidenceSectionHtml`：展示「当前判断 / 置信度 / 原因 / 建议动作」，保留题单外相关训练提示；徽标加 `data-state="<state>"` 供样式挂钩。 |
| `style.css` | **只能追加到文件末尾**，新增 `mastery-` 前缀唯一类名：`建议复习` 警示色、`较熟练` 强调色、其余中性。 |
| `test/curriculum.test.mjs` | 补断言：`buildNodeTrainingEvidence` 输出含 `masteredRecords/todoRecords/todoDueDates/lastTrainedAt` 且不含 `coverage/confidence`。 |
| `test/generate-seo.test.mjs` | 补断言：构建产物 `site/data/roadmap/nodes/*.json` 的 `node.trainingEvidence` 含 `state/confidence/reason/action`（整体与 byMember），`coverage` 键不存在。 |

验收：`npm run build` 后抽查 `site/data/roadmap/nodes/algo-greedy.json` 等文件，`trainingEvidence.state` 为五个状态之一；`npm test` 全绿。

### 任务 B（P1）· 复习闭环快捷操作 —— 前端交互

改动文件：

| 文件 | 改动 |
| --- | --- |
| `lib/review-utils.mjs`（新增） | 纯函数：`patchProblemReview(problems, problemId, patch)`（不可变更新）、`dueDateInDays(days)`（UTC+8 日期字符串）。独立小模块，供 form.mjs 与 renderer.mjs 共用，避免 renderer 静态引入 form.mjs（约 50KB）。 |
| `lib/form.mjs` | ① 导出 `openModalForDate(date, problemId?)`：打开模态框、设置 `submit-date`、`await onDateChange()` 加载该日记录、随后滚动并高亮定位到指定题目块（`problemId` 可选）；② `export { patchProblemReview, dueDateInDays } from "./review-utils.mjs"`（保留对外 API）。 |
| `lib/renderer.mjs` | ① `renderReviewQueue`：每条仅当 `currentUser?.member === item.member` 且已登录时，追加「✓ 已掌握」「⏰ 顺延 +3」按钮；点击 → `loadDateLog(item.date)` → `patchProblemReview` 定位 `problemId` → `saveDateLog(date, problems)`（mastered 时 `reviewDue: undefined` 以省略该键）→ 成功后触发 `document.getElementById("btn-refresh")?.click()` 刷新数据（路由无关、复用现有刷新链路）；按钮加载期间 disabled 防重复。② 题目详情页渲染完成后，若 `currentUser?.member === log.member`，注入「✏️ 编辑此题」按钮，onclick 用 **动态 `await import("./form.mjs")`** 调 `openModalForDate(log.date, log.problemId)`（保持表单模块按需加载）。 |
| `index.html` | 可选：详情页 `export-bar` 预留编辑按钮挂载点；renderer 注入亦可，避免改骨架则跳过。 |
| `style.css` | **只能追加到文件末尾**（追加前重新读取文件末尾，追加自己的 `review-quick-` 前缀块，不得改动既有选择器）。 |
| `test/review-quick.test.mjs`（新增） | 测 `patchProblemReview`（按 id 命中 / 未命中原样返回 / 不可变）与 `dueDateInDays`。 |

验收：登录且记录属于本人时，复习队列与详情页出现快捷按钮；点击后保存成功并触发数据刷新；未登录或他人记录不显示按钮。

### 任务 C（P2+P3）· 表单草稿持久化 + 分析默认范围 + 小项优化

改动文件：

| 文件 | 改动 |
| --- | --- |
| `lib/form.mjs` | ① **草稿持久化**：`dateDrafts` 增加 localStorage 层（key `journal-drafts`，JSON map `date → { problems, exists }`）；`captureProblemDrafts` 后 debounce 写入（沿用现有 300ms debounce），写入前检查序列化体积（>1.2MB 跳过持久化仅留内存）；`onDateChange` 恢复优先级：localStorage > 内存 > 服务端；提交成功（`handleSubmit`）与删除成功（`handleDelete`）后清除该日期草稿；**`closeModal`/`openModal` 不再无条件 `clear()` 内存草稿**（仅提交/删除后清除）。② `openModal` 设置 `submit-date` 的 `max` 为 UTC+8 今天。③ `handleSubmit` 的「更新/提交」判定改用 `activeFormExists` 标志，不再用按钮文案。 |
| `lib/renderer.mjs` | ① 训练分析默认范围改为「本月」（复用 `presetRange("month")`），快捷按钮高亮同步；② 总览 `renderLogs` 增加分页：「加载更多」按钮，每批 50 条，筛选/搜索/成员变化时重置；③ `renderReviewBook`：待复习题按 `reviewDue` 升序、逾期高亮并显示「逾期 N 天」。 |
| `index.html` | 训练分析页与错题本页各增加一个搜索输入框（复用 `search-input` 样式类），供对应页内过滤。 |
| `workers/oauth.mjs` | `/api/logs/date` 保存/删除时校验 `date <= UTC+8 今天`，超未来返回 400（错误信息中文）。 |
| `README.md` | 快速导入段落补充 AtCoder（拉取最近 3 天 AC、标签需手动补充）；若任务 B 已实现编辑入口，核对「复习队列可跳转详情/编辑」表述。 |
| `style.css` | **只能追加到文件末尾**，`draft-`/`page-` 前缀唯一类名。 |

验收：填一半关掉模态框再打开草稿仍在；刷新页面草稿仍在；提交成功后该日草稿清除；分析页默认本月且趋势图可见；总览分页可用；错题本按到期排序；Worker 拒绝未来日期；README 与实现一致。

### 任务 T · 独立验证（最后一个执行）

- 运行 `npm run check:syntax`、`npm test`、`npm run build`（三者必须全绿，`npm run verify` 等价）。
- 产物断言：`site/data/roadmap/nodes/*.json` 的 `trainingEvidence` 含 `state`（整体与 byMember）且无 `coverage` 键；`site/data/roadmap.json` 节点摘要同样透传。
- 抽查 `site/roadmap/...` 预渲染 HTML 含新状态文案（如「当前判断」）。
- `git diff --check` 通过；输出 `git status --short` 与关键 diff 摘要。

## 2. 执行顺序与文件所有权（避免并发写冲突）

所有 subagent **顺序执行**，串行提交到同一工作区：

```
任务 A（构建端/路线/测试）→ 任务 B（复习交互）→ 任务 C（草稿+小项）→ 任务 T（全量验证）
```

- 任务 A 与 B/C 互不重叠的文件：A 只动 `scripts/generate-data.js`、`lib/roadmap.mjs`、`test/curriculum.test.mjs`、`test/generate-seo.test.mjs`、`style.css`（仅追加）；B/C 动 `lib/form.mjs`、`lib/renderer.mjs`、`index.html`、`workers/oauth.mjs`、`README.md`、`style.css`（仅追加）。
- `style.css` 是唯一共享文件，规则：**任何任务只能向文件末尾追加带唯一前缀的类名块，不得修改既有选择器**；因此即便串行执行也不互相破坏。
- 每个任务完成后由下一个任务先 `git diff` 确认现场，再继续。

## 3. 验证策略

- 每个构建任务自行运行受影响测试：`node --test test/<相关>.mjs`（沙箱内若 `node --test` 子进程被 EPERM 拦截，改用单文件执行或说明无法执行，由任务 T 统一验证）。
- 任务 T 做最终全量验证（语法 + 单测 + 构建 + 产物断言）。
- 禁止修改 `site/`（生成目录）与 `logs/`（训练源数据）；`test-output.tex` 若被测试更新，属预期副作用，保留并说明。

## 4. 风险与回滚

- 掌握度接线若漏改 `generate-data.js` 会劣化线上显示 → 任务 T 必须断言 `state` 存在且 `coverage` 消失。
- 复习快捷操作依赖整日读改写 → 并发风险与表单提交一致（Worker 已有 commit 冲突重试）；按钮加载期间禁用防重复。
- 草稿持久化体积超限 → 只跳过持久化不丢内存草稿。
- 回滚：全部改动均在 `main` 未提交；若需回退，`git checkout -- <文件>` 即可，`lib/mastery.mjs` 等新文件直接删除。

## 5. 交付物

- 代码改动：任务 A/B/C 涉及文件。
- 文档：`docs/OPTIMIZATION.md`（审查报告）、`docs/CONSTRUCTION-PLAN.md`（本计划）、`docs/PRODUCT.md`（产品文档更新）。
- 验证报告：任务 T 输出（测试计数、构建结果、产物断言、diff 摘要）。

## 6. 执行记录（2026-08-28）

| 任务 | 执行方式 | 结果 |
| --- | --- | --- |
| 任务 A（P0 掌握度接线） | subagent（一次完成） | ✅ 19/19 相关测试；构建产物 `state/confidence/reason/action` 齐全、无 `coverage` |
| 任务 B（P1 复习闭环） | subagent 两次派发均长时间零落盘后，由主控直接实施 | ✅ `lib/review-utils.mjs`（新增）、form/renderer 快捷操作与编辑入口、style.css 追加、`test/review-quick.test.mjs` 5/5 |
| 任务 C（P2+P3） | 主控直接实施（与 B 同轮完成） | ✅ 草稿 localStorage、分析默认本月、分析/错题本搜索、总览分页、错题本到期排序、未来日期限制（表单 + Worker）、README AtCoder |
| 任务 T（全量验证） | 主控执行 | ✅ `check:syntax` 37 文件通过；`npm test` 199/199 通过；`node scripts/generate-data.js` 生成 125 条日志站点；`git diff --check` 通过；产物断言全部通过（renderer 无静态 form 导入、动态导入带版本哈希、index 含搜索框、form 含草稿键与日期上限、Worker 拒绝未来日期） |

> 说明：任务 B 的 subagent 两轮（首轮 4 个目标轮、次轮 2 个目标轮）均未落盘任何文件改动，判定卡死，为确保在目标轮次内交付，由主控直接实施 B/C 代码改动并完成全量验证；任务 A 由 subagent 独立完成且通过独立复核。subagent 的停滞与沙箱无关（任务 A 在其环境内成功运行了 node --test 与完整构建）。
