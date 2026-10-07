# 文档入口

更新：2026-10-07。现行文档以本目录下列出的文件为准（审计报告与两份审计签收统一放在 `Audit/` 子目录）；历史稿按轮次保存在 [archive](archive/)，其中包含 [2026-09-28 改写前归档](archive/2026-09-28-pre-rewrite/)。

| 文件 | 作用 |
| --- | --- |
| [PRODUCT.md](PRODUCT.md) | 产品方向、优先级与成效口径 |
| [DESIGN.md](DESIGN.md) | 使用流程、页面与系统边界 |
| [SPECIFICATION.md](SPECIFICATION.md) | 已实现契约、拟议变更和验收 |
| [CURRENT-STATE.md](CURRENT-STATE.md) | 当前已上线实现、冻结范围与核验入口 |
| [CDN.md](CDN.md) | 阿里云 CDN 与 Cloudflare DNS 接入状态 |
| [RELEASE-v2.1.md](RELEASE-v2.1.md) | v2.1.0 发布前修复、验收证据、回退与三个月维护交接 |
| [Audit/AUDIT-2026-10-02.md](Audit/AUDIT-2026-10-02.md) | 全栈审计报告（安全 / 质量 / 测试 / 文档一致性）与修复记录 |
| [Audit/DATA-DISPLAY-AUDIT-2026-10-07.md](Audit/DATA-DISPLAY-AUDIT-2026-10-07.md) | 数据显示一致性审计与修复：缓存、异步路由、复习摘要、筛选和日期口径；6 项本地完成、未发布 |
| [Audit/PRODUCT-AUDIT.md](Audit/PRODUCT-AUDIT.md) | 产品审计逐项签收与待办 |
| [Audit/PROBLEM-AUDIT.md](Audit/PROBLEM-AUDIT.md) | 技术问题逐项签收与发布状态 |
| [HANDOFF.md](HANDOFF.md) | 按日期延续的交接记录；旧段落是历史快照 |

阅读顺序：先看产品方向，再看设计与规格；核对线上现状时读 CURRENT-STATE；需要判断问题是否已解决时读对应审计签收。归档文件保留原文及其相对图片资源，作为决策与实现演变的证据，不作为当前实施指令。

**状态用语**：`已上线` 有生产发布证据；`本地完成` 指当前工作区有实现与本地验证；`待实现` 指尚无实现；`冻结` 指保留现有代码或数据、不继续扩展。不能把本地完成写成已上线。
