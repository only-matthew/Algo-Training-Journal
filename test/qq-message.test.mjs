import assert from "node:assert/strict";
import test from "node:test";
import { extractCommand, buildReply, buildTreeProgressMessage } from "../bot/qq-message.mjs";

test("extractCommand 识别各种 @提及 前缀下的指令", () => {
  assert.equal(extractCommand("今日复习"), "今日复习");
  assert.equal(extractCommand("  打卡  "), "打卡");
  assert.equal(extractCommand("@机器人 统计"), "统计");
  assert.equal(extractCommand("训练日志助手 今日复习", "训练日志助手"), "今日复习");
  assert.equal(extractCommand("我的机器人昵称 近30天"), "近30天"); // 无 botName 也能去掉前缀 token
  assert.equal(extractCommand("知识树"), "知识树");
  assert.equal(extractCommand("帮助"), "帮助");
  assert.equal(extractCommand("晚上好"), "晚上好"); // 非指令原样返回
});

const overview = {
  members: ["甲"],
  reviewQueue: [{ member: "甲", problem: "P1", problemNumber: "P1001", platform: "洛谷", reviewDue: "2026-08-25" }],
  heatmap: { byMember: {} },
  recent30: { start: "2026-07-26", end: "2026-08-25", byMember: {} },
};

// 两阶段知识树：甲在第 0 阶段完成 1/2 节点，第 1 阶段全未开始
const roadmap = {
  members: ["甲"],
  stats: { totalProblems: 100, done: 10, pct: 10, byMember: [] },
  phases: [
    {
      id: "p0", index: 0, title: "基础算法", nodes: [
        { id: "a", title: "模拟", stats: { totalProblems: 4, done: 4, pct: 100, byMember: [{ member: "甲", done: 4, pct: 100 }] } },
        { id: "b", title: "排序", stats: { totalProblems: 4, done: 1, pct: 25, byMember: [{ member: "甲", done: 1, pct: 25 }] } },
      ],
    },
    {
      id: "p1", index: 1, title: "搜索", nodes: [
        { id: "c", title: "DFS", stats: { totalProblems: 3, done: 0, pct: 0, byMember: [] } },
        { id: "d", title: "BFS", stats: { totalProblems: 3, done: 0, pct: 0, byMember: [] } },
      ],
    },
  ],
};

test("buildReply 按指令返回对应消息，未知指令返回 null", async () => {
  const fetchers = { overview: async () => overview, roadmap: async () => roadmap };

  const review = await buildReply("昵称A 今日复习", fetchers);
  assert.ok(review.includes("今日复习队列"));
  assert.ok(review.includes("P1001"));

  const checkin = await buildReply("打卡", fetchers);
  assert.ok(checkin.includes("今日打卡"));

  const stats = await buildReply("统计", fetchers);
  assert.ok(stats.includes("近 30 天统计"));

  const tree = await buildReply("知识树", fetchers);
  assert.ok(tree.includes("知识树进度"));

  assert.equal(await buildReply("随便聊聊", fetchers), null);
  assert.equal(await buildReply("", fetchers), null);
});

test("buildTreeProgressMessage 知识点覆盖制：选做 3 题算覆盖，下一步指向未覆盖节点", () => {
  const message = buildTreeProgressMessage(roadmap);
  // 甲：模拟 4 题（≥3 已覆盖），排序 1 题（<3 未覆盖）→ 当前阶段为基础算法，下一步排序
  assert.ok(message.includes("基础算法（第 0 阶段）已覆盖 1/2 知识点"));
  assert.ok(message.includes("下一步：排序（已做 1 题）"));
  assert.ok(message.includes("全队：已覆盖 2/4 知识点")); // 全树 4 节点，模拟+排序都有人做过题
  assert.ok(!message.includes("搜索（第 1 阶段）"));
});

test("buildReply AI 指令：有 aiReply 时调用、无时返回提示、异常返回错误", async () => {
  const fetchers = { overview: async () => overview, roadmap: async () => roadmap };
  const aiReply = async (question) => `AI 回答：${question}`;

  const reply = await buildReply("AI 图论怎么学", fetchers, { aiReply });
  assert.equal(reply, "AI 回答：图论怎么学");

  assert.ok((await buildReply("AI", fetchers, { aiReply })).includes("请带上问题"));
  assert.ok((await buildReply("问答 背包问题", fetchers, {})).includes("未配置"));
  assert.ok((await buildReply("AI 测试", fetchers, { aiReply: async () => { throw new Error("boom"); } })).includes("AI 出错了"));
  assert.equal(await buildReply("随便聊聊", fetchers, { aiReply }), null);
});
