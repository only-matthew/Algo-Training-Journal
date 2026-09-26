// 洛谷书系题单 → 知识点节点的归属计算（纯函数，构建端与测试共用）。
//
// 口径（2026-09-27 定）：**按算法标签归并**，不按书籍章节搬运。
//   - 每题在洛谷的算法标签（lib/luogu-tag-map.mjs 已归一到站内标签）与节点标签匹配；
//   - 匹配按「标签独特性」加权：一个标签在越多节点上出现，区分力越弱。
//     例如 `DP` 同时挂 dp-intro 与 dp-tree-graph，权重只有 1/2；
//     `背包` 只挂 dp-linear，权重 1。于是「DP+背包」的采药归 dp-linear，
//     而不是被泛化的 dp-intro 抢走（此前按命中标签个数排序会得出这种结果）；
//   - 一道题可以同时属于多个节点（SPECIFICATION「同一道题可支持多个相关节点」），
//     但最多 MAX_NODES_PER_PROBLEM 个，避免弱匹配把题目撒得到处都是。
//     题号在单个节点内本来就只计一次，全队总题数另有去重口径；
//   - 标签缺失（实测约 4%）或匹配不上任何节点的题不猜归属，计入 dropped。
// 以知识标签而不是书的目录为准：《进阶指南》「动态规划-例题」里的位运算题会进
// algo-simulation-bigint，而同题单里的背包题进 dp-linear。

/** 书系 key → 题单里 `source` 字段显示的名字。 */
export const BOOK_SERIES_LABELS = Object.freeze({
  "book.jinjiezhinan": "洛谷·进阶指南",
  "book.luogujingxi": "《洛谷精析》",
  "book.shizhanbiji": "《实战笔记》",
});

/** 一个节点的题单上限（含书系并入的题）。 */
export const MAX_PROBLEMS_PER_NODE = 120;

/** 一道题最多并入几个节点（按匹配得分从高到低取）。 */
export const MAX_NODES_PER_PROBLEM = 3;

/** 低于该得分的匹配视为弱匹配，不并入（得分 = Σ 1/标签节点数）。 */
const MIN_MATCH_SCORE = 0.5;

const normalizeTag = (tag) => String(tag == null ? "" : tag).trim();

/**
 * 计算书系题目到节点的归属。
 *
 * @param {object} dataset  curriculum/luogu-training-problems.json 的内容
 * @param {Array<{id: string, tags?: string[]}>} nodeMeta 节点元数据（顺序即并列时的优先级）
 * @returns {{ byNode: Map<string, Array<object>>, assigned: number, dropped: Array<object> }}
 */
export function assignBookProblemsToNodes(dataset, nodeMeta) {
  const byNode = new Map();
  const dropped = [];
  const nodes = (nodeMeta || []).map((meta, index) => ({
    id: meta.id,
    index,
    tags: new Set((meta.tags || []).map(normalizeTag).filter(Boolean)),
  }));
  const hasTag = new Map();
  for (const node of nodes) {
    for (const tag of node.tags) hasTag.set(tag, (hasTag.get(tag) || 0) + 1);
  }
  const seriesLabel = new Map(Object.entries(BOOK_SERIES_LABELS));
  const collectionSeries = new Map();
  for (const collection of dataset?.collections || []) {
    collectionSeries.set(Number(collection.id), String(collection.series || ""));
  }

  let assigned = 0;
  for (const problem of dataset?.problems || []) {
    const pid = normalizeTag(problem?.pid);
    if (!pid) continue;
    const tags = (problem.tags || []).map(normalizeTag).filter(Boolean);
    if (!tags.length) {
      dropped.push({ pid, reason: "no-tags" });
      continue;
    }
    const scored = [];
    for (const node of nodes) {
      let score = 0;
      for (const tag of tags) {
        if (!node.tags.has(tag)) continue;
        score += 1 / (hasTag.get(tag) || 1);
      }
      if (score > 0) scored.push({ node, score });
    }
    // 得分高的优先；并列时按节点元数据顺序（与路线顺序一致），保证结果稳定可复现。
    scored.sort((a, b) => (b.score - a.score) || (a.node.index - b.node.index));
    const chosen = scored.filter((item) => item.score >= MIN_MATCH_SCORE).slice(0, MAX_NODES_PER_PROBLEM);
    if (!chosen.length) {
      dropped.push({ pid, reason: "no-node-match", tags });
      continue;
    }
    const series = (problem.collections || []).map((id) => collectionSeries.get(Number(id))).find(Boolean);
    for (const { node } of chosen) {
      const entry = {
        platform: "洛谷",
        number: pid,
        name: String(problem.name || ""),
        source: seriesLabel.get(series) || "洛谷·书系题单",
        role: "练习",
        note: "",
        tags,
      };
      if (problem.difficulty) entry.difficulty = String(problem.difficulty);
      if (!byNode.has(node.id)) byNode.set(node.id, []);
      byNode.get(node.id).push(entry);
      assigned += 1;
    }
  }

  return { byNode, assigned, dropped };
}
