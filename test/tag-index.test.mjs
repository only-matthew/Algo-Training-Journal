import test from "node:test";
import assert from "node:assert/strict";
import { load } from "cheerio";
import { tagIndexHtml } from "../lib/roadmap.mjs";
import { categoryForTag, matchesTagFilter, filterTagIndex } from "../lib/tag-index.mjs";

test("tag categories distinguish algorithms, structures and implementation notes", () => {
  for (const tag of ["贪心", "DP", "二分答案", "DFS", "数学", "树形DP", "拓扑排序"])
    assert.equal(categoryForTag(tag), "algorithm", tag);
  for (const tag of ["并查集", "哈希表", "线段树", "单调队列", "Trie", "ST表"])
    assert.equal(categoryForTag(tag), "structure", tag);
  for (const tag of ["模拟", "细节", "边界处理", "高精度", "STL", "自定义心得"])
    assert.equal(categoryForTag(tag), "implementation", tag);
});

test("tag search intersects the selected category and ignores case and whitespace", () => {
  assert.equal(matchesTagFilter("树形DP", "algorithm", " dp "), true);
  assert.equal(matchesTagFilter("树形DP", "structure", "dp"), false);
  assert.equal(matchesTagFilter("线段树", "structure", "队列"), false);
  assert.equal(matchesTagFilter("线段树", "all", "树"), true);
  assert.equal(matchesTagFilter("模拟", "implementation", ""), true);
});

test("prerendered tag cards safely expose searchable names and a no-results state", () => {
  const $ = load(tagIndexHtml({tags:[{tag:'"><script>alert(1)</script>',recordCount:2}]}));
  assert.equal($("script").length, 0);
  assert.equal($(".tag-index-card").attr("data-tag-name"), '"><script>alert(1)</script>');
  assert.equal($("#tag-filter-status").attr("role"), "status");
  assert.ok($("#tag-filter-empty").is("[hidden]"));
  assert.equal(load(tagIndexHtml({tags:[]}))("#tag-filter-empty").is("[hidden]"), false);
});

test("category changes, clearing search and replaced cards retain the same filtering rules", () => {
  let cards = ["DP", "队列", "模拟"].map(tagName => ({dataset:{tagName},hidden:false}));
  const search = {value:""};
  const active = {dataset:{tagCategory:"implementation"}};
  const status = {};
  const empty = {};
  const root = {
    querySelector(selector) { return selector === "#tag-filter-status" ? status : selector === "#tag-filter-empty" ? empty : {}; },
    querySelectorAll() { return cards; },
  };
  const doc = {getElementById: id => id === "tag-content" ? root : search, querySelector: () => active};
  const visible = () => cards.filter(card=>!card.hidden).map(card=>card.dataset.tagName);
  filterTagIndex(doc);
  assert.deepEqual(visible(), ["模拟"]);
  search.value = "DP";
  filterTagIndex(doc);
  assert.deepEqual(visible(), []);
  assert.equal(empty.hidden, false);
  active.dataset.tagCategory = "all";
  filterTagIndex(doc);
  assert.deepEqual(visible(), ["DP"]);
  search.value = "";
  filterTagIndex(doc);
  assert.equal(visible().length, 3);
  assert.equal(status.hidden, true);
  active.dataset.tagCategory = "structure";
  cards = ["堆", "贪心"].map(tagName => ({dataset:{tagName},hidden:false}));
  filterTagIndex(doc);
  assert.deepEqual(visible(), ["堆"]);
  assert.equal(status.textContent, "显示 1 / 2 个标签");
});
