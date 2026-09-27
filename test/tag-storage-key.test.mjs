// 标签文件路径编码回归。
// 背景：标签分片与标签页此前直接用 `encodeURIComponent(tag)` 拼路径，而 encodeURIComponent
// 按 RFC 3986 保留 `*`，于是标签 `A*` / `IDA*` 在 Windows 上变成通配符路径，
// 构建直接 ENOENT 失败（实测 site/data/tags/A*.json）。这些用例守住修复。
import test from "node:test";
import assert from "node:assert/strict";

import { categoryForTag, matchesTagFilter, tagHref, tagStorageKey } from "../lib/tag-index.mjs";

test("通配符与保留字符都被编码，不再进入文件路径", () => {
  assert.equal(tagStorageKey("A*"), "~412a");
  assert.equal(tagStorageKey("IDA*"), "~4944412a");
  assert.equal(tagStorageKey("C++"), "~432b2b");
  assert.equal(tagStorageKey("a/b"), "~612f62");
  assert.equal(tagStorageKey("slope trick"), "~736c6f706520747269636b");
});

test("常规中英文标签以原名落盘，静态托管解码后能找到文件", () => {
  assert.equal(tagStorageKey("DP"), "DP");
  assert.equal(tagStorageKey("two-pointers"), "two-pointers");
  assert.equal(tagStorageKey("线段树"), "线段树");
  assert.equal(decodeURIComponent(tagHref("线段树").split("/")[2]), tagStorageKey("线段树"));
  assert.equal(tagStorageKey("~412a"), "~7e34313261");
});

test("tagHref 生成的地址与落盘目录一致", () => {
  assert.equal(tagHref("二分"), "/tags/%E4%BA%8C%E5%88%86/");
  assert.equal(tagHref("A*"), "/tags/~412a/");
  assert.notEqual(tagHref("A*"), `/tags/${encodeURIComponent("A*")}/`);
});

test("编码结果里不含任何文件系统不安全字符", () => {
  for (const tag of ["A*", "IDA*", 'q"uote', "back\\slash", "pipe|char", "colon:char", "问号?", "space tag"]) {
    const key = tagStorageKey(tag);
    assert.doesNotMatch(key, /[<>:"/\\|?*\s]/, `${tag} 的编码仍含不安全字符：${key}`);
  }
});

test("空值与 undefined 不会抛错", () => {
  assert.equal(tagStorageKey(undefined), "");
  assert.equal(tagStorageKey(null), "");
  assert.equal(tagStorageKey(""), "");
});

test("编码改造不影响标签分类与筛选", () => {
  assert.equal(categoryForTag("A*"), "algorithm");
  assert.equal(matchesTagFilter("A*", "all", "a*"), true);
});
