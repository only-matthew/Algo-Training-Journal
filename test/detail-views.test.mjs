import test from "node:test";
import assert from "node:assert/strict";
import { load } from "cheerio";
import { problemDetailHtml } from "../lib/problem-detail.mjs";
import { tagPageHtml, roadmapNodeHtml, roadmapOverviewHtml } from "../lib/roadmap.mjs";
import { categoriesForTopic } from "../lib/detail-ui.mjs";

test("problem detail preserves thoughts and code safely, including missing fields", () => {
  const html = problemDetailHtml({member:"甲", date:"2026-09-08", problem:"题目", platform:"洛谷", problemNumber:"P2678", takeaway:"思考：a < b", code:'</code><script>alert(1)</script>'});
  const $ = load(html);
  assert.match($("#problem-thoughts").text(), /思考：a < b/);
  assert.equal($("#problem-code code").text(), '</code><script>alert(1)</script>');
  assert.equal($("script").length,0);
  assert.equal($("#problem-related").length,1);
  assert.equal($(".problem-source-link").attr("href"),"https://www.luogu.com.cn/problem/P2678");
  const empty = load(problemDetailHtml({member:"甲", problem:"题目"}));
  assert.match(empty("#problem-code").text(),/尚未附上代码/);
  assert.match(empty("#problem-thoughts").text(),/尚未填写个人思考/);
});

test("knowledge categories classify subjects, retain all topics, and escape search metadata", () => {
  assert.ok(categoriesForTopic({title:"背包动态规划"}).includes("dp"));
  assert.ok(categoriesForTopic({title:"最短路"}).includes("graph"));
  assert.ok(categoriesForTopic({title:"KMP"}).includes("string"));
  assert.deepEqual(categoriesForTopic({title:"竞赛环境"}),["other"]);
  const $ = load(roadmapOverviewHtml({phases:[{id:"phase-0",nodes:[{id:"one",title:"二分",tags:['"><script>']},{id:"two",title:"DP"}]}]},"all"));
  assert.equal($(".knowledge-topic-card").length,2);
  assert.equal($(".topic-nav a").length,0);
  assert.ok($("[data-knowledge-category=all]").length);
  assert.equal($("script").length,0);
});

test("tag examples use the latest record and node stats deduplicate linked records", () => {
  const newest = {member:"甲",date:"2026-09-08",problemId:"a",problemNumber:"P2678",platform:"洛谷",problem:"跳石头"};
  const oldest = {...newest, date:"2026-09-07",problemId:"b"};
  const $ = load(tagPageHtml({tag:"二分",recordCount:2,records:[oldest,newest],nodes:[]}));
  assert.equal($("#tag-problems .detail-record-preview").length,1);
  assert.ok($("#tag-problems .detail-record-preview").attr("href").includes("2026-09-08"));
  assert.equal($("#tag-records tbody tr").length,2);
  const node = load(roadmapNodeHtml({node:{title:"二分",relatedRecords:[newest]},problems:[{number:"P2678",platform:"洛谷",name:"跳石头",doneBy:[newest]}]},"all"));
  assert.equal(node("#node-records .detail-record-preview").length,1);
  assert.equal(node(".detail-stat strong").last().text(),"1");
});
