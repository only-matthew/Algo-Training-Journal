# 技术问题审计签收版

签收日期：2026-09-28。原始 22 项问题、复现材料、2026-09-26 的首次签收和 2026-09-27 的 R1–R4 收口，完整保留在[原审计归档](archive/2026-09-28-pre-rewrite/PROBLEM-AUDIT.md)。以下状态以历史签收加当前工作区核对为准；不把未发布改动标成线上完成。

## 原 22 项状态

| 原编号 | 问题摘要 | 当前签收 |
| --- | --- | --- |
| 1–3 | 越界/未来训练区间与重叠统计 | 已修复并曾发布；区间感知训练日、热力图和活力口径一致。 |
| 4 | 复习快捷操作整日覆盖 | 已修复并曾发布；现走单题 PATCH，包含服务端成功及拒绝测试。 |
| 5–6 | 身份键分裂、缺成员配置 | 已修复并曾发布；`config/members.json` 以 GitHub 数字 ID 绑定稳定 `memberId`，日志目录继续兼容中文名。 |
| 7 | v2 路由只有部分实现 | **部分关闭**；补过关键 attempts/evidence 读改接口，通用 records 增删改与 `plan-links` 未实现。v2 无生产前端并冻结，旧目标契约不作为已交付功能。 |
| 8 | 活力结果字段口径过期 | 已修复并曾发布；缺失 `outcome` 保持未知。 |
| 9–13 | 功能清单、schema、权威文件与数字/产品文案失真 | 旧版本曾修正；本轮以新的 [PRODUCT.md](PRODUCT.md)、[DESIGN.md](DESIGN.md)、[SPECIFICATION.md](SPECIFICATION.md) 收口当前入口。历史数值保留日期，不作现值。 |
| 14–15 | Worker 入口过重、跨目录依赖 | 本地进一步处理：入口、服务、存储拆分，QQ 共用模块移至 `lib/`；本地验证通过，**待发布**。 |
| 16 | v2 有 API 无前端消费者 | 产品边界已明确：冻结，不宣称已上线工作台。 |
| 17–18 | 语法检查误报、Action 版本不齐 | 已修复并曾发布；当前额外加入 ESLint 与单次构建工作流，后者**待发布观察**。 |
| 19 | 一次性产物与巨型追加文档 | **文档部分本轮收口**：旧稿原文归档、现行文档重写、HANDOFF 仅续写；本地忽略产物此前清理过，不作为仓库交付物。 |
| 20–22 | 区间活力分摊、v1/v2 结果优先级、CSS 管线 | 已修复或定出口径并曾发布；v2 迁移优先级是未来规则，事件投影尚无生产消费者。 |

原审计的 R1–R4 已在提交 `8f65c55` 收口：旧区间可读、单题 PATCH 服务端用例、`config/` 目录契约和本地草稿清理。原稿的“20 完成、2 部分”是 2026-09-27 签收快照；本轮第 19 项的文档治理进一步完成，第 7 项仍是有意冻结的部分实现。

## 本轮新增工程处理及发布状态

| 项 | 本地证据 | 发布判断 |
| --- | --- | --- |
| Worker/Pages 兼容门禁 | `workers/oauth.mjs` 的 `/api/capabilities`、`scripts/check-worker-compatibility.mjs`、`.github/workflows/deploy.yml` | 2026-09-28 线上能力接口返回 401；新门禁在本地，Worker 必须先发布。 |
| 静态检查 | `eslint.config.mjs`、`package.json` 的 `check:lint` / `verify` | 本地 `npm run verify` 通过；随提交进入 CI。 |
| Worker 分层 | `workers/routes/`、`workers/services/`、`workers/storage/`、`lib/qq-*.mjs` | 本地测试与 Worker dry-run 通过；未据此宣称线上已更新。 |
| 发布工作流 | `.github/workflows/deploy.yml` 复用一次构建并检查线上 Worker | 首次主分支运行后才能签收生产效果。 |
| 文档治理 | `docs/archive/2026-09-28-pre-rewrite/` 保留旧稿与图片，现行六份文件统一入口 | 本地归档与链接检查通过后签收；历史事实仍按原文日期理解。 |

## 验收与遗留

当前工作区在上一轮完成了 `npm run verify`、13 个浏览器回归和 Worker dry-run。本文档改写后应再做链接与版本状态核对；代码未因文档改写新增功能。正式发布仍要依次完成 Worker 部署、匿名 `/api/capabilities` 与 `/api/session` 检查、Pages CI 与生产页面核验。

遗留的第 7 项取决于是否重新启用 v2，当前不补无消费者的通用写接口。产品审计的空心得、复习默认入队与使用报告是**产品待办**，不属于本审计历史 22 项已修复的证明，见 [PRODUCT-AUDIT.md](PRODUCT-AUDIT.md)。
