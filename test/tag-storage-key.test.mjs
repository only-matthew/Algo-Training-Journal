// 标签文件路径编码回归。
// 背景：标签分片与标签页此前直接用 `encodeURIComponent(tag)` 拼路径，而 encodeURIComponent
// 按 RFC 3986 保留 `*`，于是标签 `A*` / `IDA*` 在 Windows 上变成通配符路径，
// 构建直接 ENOENT 失败（实测 site/data/tags/A*.json）。这些用例守住修复。
import test from "node:test";
import assert from "node:assert/strict";

import { categoryForTag, matchesTagFilter, tagHref, tagStorageKey } from "../lib/tag-index.mjs";

test("通配符与保留字符都被编码，不再进入文件路径", () => {
  assert.equal(tagStorageKey("A*"), "A%2A");
  assert.equal(tagStorageKey("IDA*"), "IDA%2A");
  assert.equal(tagStorageKey("C++"), "C%2B%2B");
  assert.equal(tagStorageKey("a/b"), "a%2Fb");
  assert.equal(tagStorageKey("slope trick"), "slope%20trick");
});

test("安全字符原样保留，中英文都可逆", () => {
  assert.equal(tagStorageKey("DP"), "DP");
  assert.equal(tagStorageKey("two-pointers"), "two-pointers");
  assert.equal(tagStorageKey("线段树"), "%E7%BA%BF%E6%AE%B5%E6%A0%91");
  assert.equal(decodeURIComponent(tagStorageKey("线段树")), "线段树");
  assert.equal(decodeURIComponent(tagStorageKey("A*")), "A*");
});

test("tagHref 生成的地址与落盘目录一致", () => {
  assert.equal(tagHref("二分"), "/tags/%E4%BA%8C%E5%88%86/");
  assert.equal(tagHref("A*"), "/tags/A%2A/");
  // encodeURIComponent 会漏掉 `*`，正是这个差异导致 404：两者必须不同
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
