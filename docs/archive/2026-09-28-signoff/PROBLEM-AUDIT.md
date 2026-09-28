# 技术问题审计签收版

签收日期：2026-09-28。原始 22 项问题、复现材料、2026-09-26 的首次签收和 2026-09-27 的 R1–R4 收口，完整保留在[原审计归档](../2026-09-28-pre-rewrite/PROBLEM-AUDIT.md)。（链接已按归档后的相对位置修正，正文其余部分保持原样。）以下状态以历史签收加当前工作区核对为准；不把未发布改动标成线上完成。

## 原 22 项状态

| 原编号 | 问题摘要 | 当前签收 |
| --- | --- | --- |
| 1–3 | 越界/未来训练区间与重叠统计 | 已修复并曾发布；区间感知训练日、热力图和活力口径一致。 |
| 4 | 复习快捷操作整日覆盖 | 已修复并曾发布；现走单题 PATCH，包含服务端成功及拒绝测试。 |
| 5–6 | 身份键分裂、缺成员配置 | 已修复并曾发布；`config/members.json` 以 GitHub 数字 ID 绑定稳定 `memberId`，日志目录继续兼容中文名。 |
| 7 | v2 路由只有部分实现 | **部分关闭**；补过关键 attempts/evidence 读改接口，通用 records 增删改与 `plan-links` 未实现。v2 无生产前端并冻结，旧目标契约不作为已交付功能。 |
| 8 | 活力结果字段口径过期 | 已修复并曾发布；缺失 `outcome` 保持未知。 |
| 9–13 | 功能清单、schema、权威文件与数字/产品文案失真 | 旧版本曾修正；本轮以新的 [PRODUCT.md](PRODUCT.md)、[DESIGN.md](DESIGN.md)、[SPECIFICATION.md](SPECIFICATION.md) 收口当前入口。历史数值保留日期，不作现值。 |
| 14–15 | Worker 入口过重、跨目录依赖 | 入口、服务、存储已拆分，QQ 共用模块已移至 `lib/`；本地验证及 2026-09-28 自动发布通过。 |
| 16 | v2 有 API 无前端消费者 | 产品边界已明确：冻结，不宣称已上线工作台。 |
| 17–18 | 语法检查误报、Action 版本不齐 | 已修复并发布；额外加入 ESLint 与单次构建工作流，`794cf9f` 的 CI 已通过。 |
| 19 | 一次性产物与巨型追加文档 | **文档部分本轮收口**：旧稿原文归档、现行文档重写、HANDOFF 仅续写；本地忽略产物此前清理过，不作为仓库交付物。 |
| 20–22 | 区间活力分摊、v1/v2 结果优先级、CSS 管线 | 已修复或定出口径并曾发布；v2 迁移优先级是未来规则，事件投影尚无生产消费者。 |

原审计的 R1–R4 已在提交 `8f65c55` 收口：旧区间可读、单题 PATCH 服务端用例、`config/` 目录契约和本地草稿清理。原稿的“20 完成、2 部分”是 2026-09-27 签收快照；本轮第 19 项的文档治理进一步完成，第 7 项仍是有意冻结的部分实现。

## 本轮新增工程处理及发布状态

| 项 | 本地证据 | 发布判断 |
| --- | --- | --- |
| Worker/Pages 兼容门禁 | `workers/oauth.mjs` 的 `/api/capabilities`、`scripts/check-worker-compatibility.mjs`、`.github/workflows/deploy.yml` | 已上线：`794cf9f` 的能力接口 HTTP 200，`buildCommit` 与该提交一致，Pages 门禁与发布通过。 |
| 静态检查 | `eslint.config.mjs`、`package.json` 的 `check:lint` / `verify` | 本地 `npm run verify` 与主分支 CI 已通过。 |
| Worker 分层 | `workers/routes/`、`workers/services/`、`workers/storage/`、`lib/qq-*.mjs` | 本地测试与 Worker dry-run 通过，已随 `794cf9f` 自动部署。 |
| 发布工作流 | `.github/workflows/deploy.yml` 复用一次构建并检查线上 Worker | 首次主分支自动发布已完成。**2026-09-28 修订**：门禁不再对每次推送都要求同提交 Worker——只有本推送改动 Worker 输入（六类：`workers/`、`lib/`、`config/members.json`、`scripts/stamp-worker-commit.mjs`、`package.json`、`package-lock.json`）时才校验提交号并等待；其余推送只做兼容性检查且不等待，Worker 不需要重建。Cloudflare 的 build watch paths 已设为同一组路径。 |
| 文档治理 | `docs/archive/2026-09-28-pre-rewrite/` 保留旧稿与图片，现行七份文件统一入口 | `CURRENT-STATE.md` 已归位，现行入口已更新；历史事实仍按原文日期理解。 |

## 验收与遗留

2026-09-28 的 `794cf9f` 已完成 `npm run verify`、13 个浏览器回归、Worker dry-run 和生产发布核验。后续推送由 Cloudflare Workers Builds 与 GitHub Actions 分别触发；Pages 在上传产物前做兼容性检查（Worker 输入有变化时追加同提交校验），发布后仍应核对匿名 `/api/capabilities`、`/api/session` 与页面版本。

**静态检查已知盲区**：当前 ESLint 的 `no-unused-vars` 不识别“导出但生产代码无人调用”的函数；`lib/roadmap.mjs` 的 `roadmapTreeHtml` 等仍需按真实引用和构建产物复核。测试中的引用不能单独证明功能已上线。

遗留的第 7 项取决于是否重新启用 v2，当前不补无消费者的通用写接口。产品审计的空心得、复习默认入队与使用报告是**产品待办**，不属于本审计历史 22 项已修复的证明，见 [PRODUCT-AUDIT.md](PRODUCT-AUDIT.md)。
