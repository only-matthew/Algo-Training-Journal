import assert from "node:assert/strict";
import test from "node:test";
import { extractCommand, buildReply } from "../bot/qq-message.mjs";

test("extractCommand 识别各种 @提及 前缀下的指令", () => {
  assert.equal(extractCommand("今日复习"), "今日复习");
  assert.equal(extractCommand("  打卡  "), "打卡");
  assert.equal(extractCommand("@机器人 统计"), "统计");
  assert.equal(extractCommand("训练日志助手 今日复习", "训练日志助手"), "今日复习");
  assert.equal(extractCommand("我的机器人昵称 近30天"), "近30天"); // 无 botName 也能去掉前缀 token
  assert.equal(extractCommand("帮助"), "帮助");
  assert.equal(extractCommand("晚上好"), "晚上好"); // 非指令原样返回
});

test("buildReply 按指令返回对应消息，未知指令返回 null", async () => {
  const overview = {
    members: ["甲"],
    reviewQueue: [{ member: "甲", problem: "P1", problemNumber: "P1001", platform: "洛谷", reviewDue: "2026-08-25" }],
    heatmap: { byMember: {} },
    recent30: { start: "2026-07-26", end: "2026-08-25", byMember: {} },
  };
  const fetchOverview = async () => overview;

  const review = await buildReply("昵称A 今日复习", fetchOverview);
  assert.ok(review.includes("今日复习队列"));
  assert.ok(review.includes("P1001"));

  const checkin = await buildReply("打卡", fetchOverview);
  assert.ok(checkin.includes("今日打卡"));

  const stats = await buildReply("统计", fetchOverview);
  assert.ok(stats.includes("近 30 天统计"));

  assert.equal(await buildReply("随便聊聊", fetchOverview), null);
  assert.equal(await buildReply("", fetchOverview), null);
});
