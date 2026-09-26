// 洛谷书系题单并入知识点的口径回归：按算法标签归属、多命中取优先、缺标签不猜。
import test from "node:test";
import assert from "node:assert/strict";

import { BOOK_SERIES_LABELS, MAX_NODES_PER_PROBLEM, assignBookProblemsToNodes } from "../lib/curriculum-book-problems.mjs";
import { parseTrainingProblems } from "../scripts/fetch-luogu-training.mjs";

const NODE_META = [
  { id: "algo-greedy", tags: ["贪心", "排序"] },
  { id: "dp-linear", tags: ["线性DP", "背包", "DP"] },
  { id: "graph-shortest-path", tags: ["最短路", "图论"] },
];

function dataset(problems, collections = [{ id: 1, series: "book.jinjiezhinan" }]) {
  return { collections, problems };
}

test("书系来源短名固定为约定写法（用户明确指定，不得随意改动）", () => {
  assert.deepEqual(BOOK_SERIES_LABELS, {
    "book.jinjiezhinan": "洛谷·进阶指南",
    "book.luogujingxi": "《洛谷精析》",
    "book.shizhanbiji": "《实战笔记》",
  });
});

test("按算法标签把题目归入节点，并带上书系来源", () => {
  const { byNode, assigned, dropped } = assignBookProblemsToNodes(
    dataset([{ pid: "P1223", name: "排队接水", difficulty: "普及-", tags: ["贪心"], collections: [1] }]),
    NODE_META,
  );
  assert.equal(assigned, 1);
  assert.deepEqual(dropped, []);
  const entry = byNode.get("algo-greedy")[0];
  assert.equal(entry.number, "P1223");
  assert.equal(entry.platform, "洛谷");
  assert.equal(entry.source, BOOK_SERIES_LABELS["book.jinjiezhinan"]);
  assert.equal(entry.difficulty, "普及-");
  assert.deepEqual(entry.tags, ["贪心"]);
  assert.deepEqual(entry.collections, undefined);
});

test("泛化标签不抢走归属：DP+背包 归 dp-linear，而不是同为 DP 的 dp-intro", () => {
  const { byNode } = assignBookProblemsToNodes(
    dataset([{ pid: "P1048", name: "采药", difficulty: "普及-", tags: ["DP", "背包"], collections: [1] }]),
    NODE_META,
  );
  assert.deepEqual([...byNode.keys()], ["dp-linear"]);
});

test("一道题可同时并入多个节点，但最多 MAX_NODES_PER_PROBLEM 个", () => {
  const meta = [
    { id: "a", tags: ["背包"] },
    { id: "b", tags: ["线性DP"] },
    { id: "c", tags: ["DP"] },
    { id: "d", tags: ["贪心"] },
  ];
  const { byNode, assigned } = assignBookProblemsToNodes(
    dataset([{ pid: "P9", tags: ["背包", "线性DP", "DP", "贪心"], collections: [1] }]),
    meta,
  );
  assert.equal(assigned, MAX_NODES_PER_PROBLEM);
  assert.deepEqual([...byNode.keys()], ["a", "b", "c"]);
});

test("多个节点共享同一泛化标签时保持稳定顺序，弱匹配也不会丢失", () => {
  const one = assignBookProblemsToNodes(
    dataset([{ pid: "P1", tags: ["贪心"], collections: [1] }]),
    NODE_META,
  );
  assert.deepEqual([...one.byNode.keys()], ["algo-greedy"]);

  // 「背包 + 线性DP」两个独有标签都只挂 dp-linear → 只归 dp-linear
  const two = assignBookProblemsToNodes(
    dataset([{ pid: "P2", tags: ["背包", "线性DP"], collections: [1] }]),
    NODE_META,
  );
  assert.deepEqual([...two.byNode.keys()], ["dp-linear"]);

  // 两个节点共享「图论」，题目只有这一个标签 → 两边都算命中（1/2 分，达到下限），按元数据顺序输出
  const three = assignBookProblemsToNodes(
    dataset([{ pid: "P3", tags: ["图论"], collections: [1] }]),
    [{ id: "a", tags: ["最短路", "图论"] }, { id: "b", tags: ["网络流", "图论"] }],
  );
  assert.deepEqual([...three.byNode.keys()], ["a", "b"]);
});

test("缺标签或对不上任何节点的题目不猜归属，计入 dropped", () => {
  const { byNode, assigned, dropped } = assignBookProblemsToNodes(
    dataset([
      { pid: "P1", tags: [], collections: [1] },
      { pid: "P2", tags: ["量子计算"], collections: [1] },
      { pid: "P3", tags: ["贪心"], collections: [1] },
    ]),
    NODE_META,
  );
  assert.equal(assigned, 1);
  assert.deepEqual(dropped.map((d) => [d.pid, d.reason]), [["P1", "no-tags"], ["P2", "no-node-match"]]);
  assert.deepEqual([...byNode.keys()], ["algo-greedy"]);
});

test("标签首尾空白被归一，空题号条目被忽略", () => {
  const { byNode, assigned } = assignBookProblemsToNodes(
    dataset([
      { pid: " P4 ", tags: [" 贪心 "], collections: [1] },
      { pid: "", tags: ["贪心"], collections: [1] },
    ]),
    NODE_META,
  );
  assert.equal(assigned, 1);
  assert.equal(byNode.get("algo-greedy")[0].number, "P4");
});

test("未知书系回落到通用来源名，不会写出空 source", () => {
  const { byNode } = assignBookProblemsToNodes(
    dataset([{ pid: "P5", tags: ["贪心"], collections: [999] }], []),
    NODE_META,
  );
  assert.equal(byNode.get("algo-greedy")[0].source, "洛谷·书系题单");
});

test("题单详情页只认带链接的题号行，说明区里的纯文本题号不算", () => {
  const html = `
    <section>
      <p>返回《算法竞赛进阶指南》题单目录：见 P1226 与 P10446 这两道题。</p>
      <ul><li>P2879 [USACO07JAN] Tallest Cow S</li></ul>
    </section>
    <hr>
    <section>
      <ol>
        <li><a href="/problem/P1226">P1226 - 【模板】快速幂</a></li>
        <li><a href="/problem/CF670C">CF670C - Cinema</a></li>
        <li><a href="/problem/P1226">P1226 - 【模板】快速幂</a></li>
      </ol>
    </section>`;
  const problems = parseTrainingProblems(html);
  assert.deepEqual(problems, [
    { pid: "P1226", name: "【模板】快速幂" },
    { pid: "CF670C", name: "Cinema" },
  ]);
});

test("题号行没有「 - 」分隔符时，标题按题号前缀剥离", () => {
  const problems = parseTrainingProblems('<ol><li><a href="/problem/B3621">B3621 枚举元组</a></li></ol>');
  assert.deepEqual(problems, [{ pid: "B3621", name: "枚举元组" }]);
});
