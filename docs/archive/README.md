# 历史归档

本目录保存已被替换的文档原文。归档内容用于追溯决策依据与实现演变，**不作为当前实施指令**；当前文档入口见 [../README.md](../README.md)。

## 快照

| 快照 | 内容 |
| --- | --- |
| [2026-09-28-pre-rewrite/](2026-09-28-pre-rewrite/) | 改写前的全部文档与 `assets/project-history/` 图片；现行文档已重写，本快照保留原文以便对照 |
| [2026-09-28-signoff/](2026-09-28-signoff/) | 被 2026-09-28 新一轮技术审计取代的 `PROBLEM-AUDIT.md`（改写后的 22 项签收状态表）原文 |
| [2026-09-29-pre-refresh/](2026-09-29-pre-refresh/) | 被 2026-09-29 复核版取代的技术审计原文，含安全、数据正确性、测试诚实性与复习快捷操作追加记录 |

三处归档里都有名为 `PROBLEM-AUDIT.md` 的文件，含义不同：`2026-09-28-pre-rewrite/` 是改写前那 487 行的完整问题清单，`2026-09-28-signoff/` 是随后产生的 22 项签收状态表，`2026-09-29-pre-refresh/` 是本轮复核前的技术审计。当前审计见 [../PROBLEM-AUDIT.md](../PROBLEM-AUDIT.md)。

## 链接口径

归档文件里的相对链接**按写入时的仓库结构理解，不保证可以点击**：

- 归档前这些文件位于 `docs/`，其中的 `lib/…`、`scripts/…`、`docs/…` 等链接按当时的仓库根或 `docs/` 相对位置书写，移入本目录后不再解析。
- 已知 **34 条**此类失效链接，全部位于 `2026-09-28-pre-rewrite/`：`PRODUCT-AUDIT.md` 16 条、`VITALITY-DESIGN.md` 9 条、`SPECIFICATION.md` 7 条、`HANDOFF.md` 与 `PROBLEM-ENRICHMENT-SPECIFICATION.md` 各 1 条。
- 另有若干处是正文里的 Markdown 语法示例（行内代码 `` ![](url) ``、`` [...](...) ``），**不是失效链接**。朴素的链接检查不识别行内代码，会把这些示例一并报出；任何引用该写法的文档都会增加这类误报，不必处理。
- **不批量改写**：归档的价值是证据保真，改写会掩盖当时的目录结构。
- 唯一例外是指向**现行**文档的链接，已按新位置修正（例如 `CURRENT-STATE.md` → `../../CURRENT-STATE.md`）。

需要当前状态时读 [docs/CURRENT-STATE.md](../CURRENT-STATE.md)；需要当前契约时读 [docs/SPECIFICATION.md](../SPECIFICATION.md)。
