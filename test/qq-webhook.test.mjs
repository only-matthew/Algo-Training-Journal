import assert from "node:assert/strict";
import test from "node:test";
import { sha512 } from "@noble/hashes/sha2.js";
import * as ed from "@noble/ed25519";
ed.hashes.sha512 = sha512;

import {
  qqValidationSignature,
  qqVerifySignature,
  handleQqBotWebhook,
} from "../workers/qq-bot.mjs";

function seedFromSecret(secret) {
  let seed = String(secret);
  while (seed.length < 32) seed += seed;
  return new TextEncoder().encode(seed.slice(0, 32));
}

function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));
}

// 用 Bot Secret 派生私钥对 timestamp + body 签名（模拟 QQ 平台）
async function signRequestBody(secret, timestamp, bodyText) {
  const tsBytes = new TextEncoder().encode(String(timestamp));
  const bodyBytes = new TextEncoder().encode(bodyText);
  const message = new Uint8Array(tsBytes.length + bodyBytes.length);
  message.set(tsBytes, 0);
  message.set(bodyBytes, tsBytes.length);
  const sig = await ed.signAsync(message, seedFromSecret(secret));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}

test("qqValidationSignature 与官方回调验证示例一致", async () => {
  // 官方文档示例：secret=DG5g3B4j9X2KOErG, event_ts=1725442341, plain_token=Arq0D5A61EgUu4OxUvOp
  const signature = await qqValidationSignature("DG5g3B4j9X2KOErG", "1725442341", "Arq0D5A61EgUu4OxUvOp");
  assert.equal(
    signature,
    "87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706",
  );
});

test("qqVerifySignature 自签自验通过、篡改与缺头失败", async () => {
  const secret = "naOC0ocQE3shWLAfffVLB1rhYPG7";
  const body = '{ "op": 0,"d": {}, "t": "GATEWAY_EVENT_NAME"}';
  const bodyBytes = new TextEncoder().encode(body);
  const sigHex = await signRequestBody(secret, "1725442341", body);
  assert.equal(await qqVerifySignature(secret, sigHex, "1725442341", bodyBytes), true);
  // 篡改 body
  const tampered = new TextEncoder().encode('{ "op": 0,"d": {"x":1}, "t": "OTHER"}');
  assert.equal(await qqVerifySignature(secret, sigHex, "1725442341", tampered), false);
  // 缺失签名头
  assert.equal(await qqVerifySignature(secret, "", "1725442341", bodyBytes), false);
  assert.equal(await qqVerifySignature(secret, sigHex, "", bodyBytes), false);
  // 非法十六进制
  assert.equal(await qqVerifySignature(secret, "not-hex!!", "1725442341", bodyBytes), false);
});

test("Webhook op 13 回调地址验证返回签名", async () => {
  const env = { QQ_BOT_SECRET: "DG5g3B4j9X2KOErG", QQ_APP_ID: "11111111" };
  const body = JSON.stringify({ op: 13, d: { plain_token: "Arq0D5A61EgUu4OxUvOp", event_ts: "1725442341" } });
  const request = new Request("https://example.com/api/qq-bot", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bot-Appid": "11111111" },
    body,
  });
  const response = await handleQqBotWebhook(request, env, { waitUntil() {} });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.plain_token, "Arq0D5A61EgUu4OxUvOp");
  assert.equal(
    data.signature,
    "87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706",
  );
});

test("Webhook op 13 AppID 不匹配被拒绝", async () => {
  const env = { QQ_BOT_SECRET: "DG5g3B4j9X2KOErG", QQ_APP_ID: "11111111" };
  const body = JSON.stringify({ op: 13, d: { plain_token: "x", event_ts: "1725442341" } });
  const request = new Request("https://example.com/api/qq-bot", {
    method: "POST",
    headers: { "X-Bot-Appid": "99999999" },
    body,
  });
  const response = await handleQqBotWebhook(request, env, { waitUntil() {} });
  assert.equal(response.status, 403);
});

test("Webhook 事件推送：验签失败 403、通过则 ACK 并被动回复", async () => {
  const secret = "naOC0ocQE3shWLAfffVLB1rhYPG7";
  const env = {
    QQ_BOT_SECRET: secret,
    QQ_APP_ID: "11111111",
    QQ_CLIENT_SECRET: "cs",
    QQ_BOT_NAME: "训练日志助手",
    QQ_DATA_URL: "https://example.com",
  };
  const payload = {
    id: "event-001",
    op: 0,
    s: 1,
    t: "GROUP_AT_MESSAGE_CREATE",
    d: {
      id: "msg-001",
      group_openid: "GROUP_OPENID_123",
      author: { member_openid: "member-1" },
      content: "训练日志助手 今日复习",
      msg_type: 0,
      timestamp: "1725442341",
    },
  };
  const bodyText = JSON.stringify(payload);
  const timestamp = "1725442341";
  const sigHex = await signRequestBody(secret, timestamp, bodyText);

  // --- 验签失败场景 ---
  const badRequest = new Request("https://example.com/api/qq-bot", {
    method: "POST",
    headers: { "X-Signature-Ed25519": "00".repeat(64), "X-Signature-Timestamp": timestamp },
    body: bodyText,
  });
  const badResponse = await handleQqBotWebhook(badRequest, env, { waitUntil() {} });
  assert.equal(badResponse.status, 403);

  // --- 正常场景：mock fetch（overview → token → 发消息）---
  const overview = {
    members: ["郭一鸣", "廖夏", "王梓豪"],
    reviewQueue: [
      { member: "廖夏", problem: "P1001 A+B", problemNumber: "P1001", platform: "洛谷", reviewDue: "2026-08-25" },
    ],
    heatmap: { byMember: {} },
    recent30: { start: "2026-07-26", end: "2026-08-25", byMember: {} },
  };
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body });
    if (String(url).includes("overview.json")) {
      return new Response(JSON.stringify(overview), { status: 200 });
    }
    if (String(url).includes("getAppAccessToken")) {
      return new Response(JSON.stringify({ access_token: "TOKEN_123", expires_in: "7200" }), { status: 200 });
    }
    if (String(url).includes("/v2/groups/")) {
      return new Response(JSON.stringify({ id: "send-1", timestamp: 1 }), { status: 200 });
    }
    return new Response(JSON.stringify({ code: 404 }), { status: 404 });
  };

  let backgroundPromise = null;
  const request = new Request("https://example.com/api/qq-bot", {
    method: "POST",
    headers: {
      "X-Signature-Ed25519": sigHex,
      "X-Signature-Timestamp": timestamp,
    },
    body: bodyText,
  });
  const response = await handleQqBotWebhook(request, env, {
    waitUntil(promise) { backgroundPromise = promise; },
  });

  // 先回 ACK
  assert.equal(response.status, 200);
  const ack = await response.json();
  assert.equal(ack.op, 12);
  assert.equal(ack.d.id, "event-001");

  // 等待后台处理
  await backgroundPromise;

  // 应发出被动回复：URL 含群 openid，body 携带 msg_id 与回复内容
  const sendCall = calls.find((c) => c.url.includes("/v2/groups/GROUP_OPENID_123/messages"));
  assert.ok(sendCall, "应调用群消息发送接口");
  const sendBody = JSON.parse(sendCall.body);
  assert.equal(sendBody.msg_id, "msg-001");
  assert.ok(sendBody.content.includes("今日复习队列"));
  assert.ok(sendBody.content.includes("P1001"));

  delete globalThis.fetch;
});

test("Webhook 知识树指令：拉取 roadmap.json 并回复进度", async () => {
  const secret = "naOC0ocQE3shWLAfffVLB1rhYPG7";
  const env = { QQ_BOT_SECRET: secret, QQ_APP_ID: "11111111", QQ_CLIENT_SECRET: "cs", QQ_BOT_NAME: "", QQ_DATA_URL: "https://example.com" };
  const roadmap = {
    members: ["廖夏"],
    stats: { totalProblems: 100, done: 5, pct: 5, byMember: [] },
    phases: [
      {
        id: "p0", index: 0, title: "基础算法", nodes: [
          { id: "a", title: "模拟", stats: { totalProblems: 4, done: 4, pct: 100, byMember: [{ member: "廖夏", done: 4, pct: 100 }] } },
          { id: "b", title: "排序", stats: { totalProblems: 4, done: 1, pct: 25, byMember: [{ member: "廖夏", done: 1, pct: 25 }] } },
        ],
      },
    ],
  };
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body });
    if (String(url).includes("overview.json")) return new Response(JSON.stringify({ members: ["廖夏"] }), { status: 200 });
    if (String(url).includes("roadmap.json")) return new Response(JSON.stringify(roadmap), { status: 200 });
    if (String(url).includes("getAppAccessToken")) return new Response(JSON.stringify({ access_token: "T", expires_in: "7200" }), { status: 200 });
    if (String(url).includes("/v2/groups/")) return new Response(JSON.stringify({ id: "s" }), { status: 200 });
    return new Response(JSON.stringify({ code: 404 }), { status: 404 });
  };

  const payload = { id: "evt2", op: 0, s: 1, t: "GROUP_AT_MESSAGE_CREATE", d: { id: "msg2", group_openid: "G2", author: { member_openid: "u" }, content: "知识树", msg_type: 0 } };
  const bodyText = JSON.stringify(payload);
  const sigHex = await signRequestBody(secret, "1725442341", bodyText);

  let bg = null;
  const response = await handleQqBotWebhook(
    new Request("https://example.com/api/qq-bot", {
      method: "POST",
      headers: { "X-Signature-Ed25519": sigHex, "X-Signature-Timestamp": "1725442341" },
      body: bodyText,
    }),
    env,
    { waitUntil(p) { bg = p; } },
  );
  assert.equal(response.status, 200);
  await bg;
  const sendCall = calls.find((c) => c.url.includes("/v2/groups/G2/messages"));
  assert.ok(sendCall, "应回复知识树进度");
  const body = JSON.parse(sendCall.body);
  assert.ok(body.content.includes("知识树进度"));
  assert.ok(body.content.includes("下一步：排序"));

  delete globalThis.fetch;
});

test("Webhook AI 指令：走配置的 OpenAI 兼容端点", async () => {
  const secret = "naOC0ocQE3shWLAfffVLB1rhYPG7";
  const env = {
    QQ_BOT_SECRET: secret, QQ_APP_ID: "11111111", QQ_CLIENT_SECRET: "cs", QQ_BOT_NAME: "",
    QQ_DATA_URL: "https://example.com",
    QQ_LLM_API_KEY: "sk-test", QQ_LLM_BASE_URL: "https://llm.example.com", QQ_LLM_MODEL: "deepseek-chat",
  };
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body });
    const u = String(url);
    if (u.includes("overview.json")) return new Response(JSON.stringify({ members: ["廖夏"] }), { status: 200 });
    if (u.includes("getAppAccessToken")) return new Response(JSON.stringify({ access_token: "T", expires_in: "7200" }), { status: 200 });
    if (u.includes("/v2/groups/")) return new Response(JSON.stringify({ id: "s" }), { status: 200 });
    if (u.includes("chat/completions")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "建议先掌握 DFS 与 BFS。" } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ code: 404 }), { status: 404 });
  };

  const payload = { id: "evt3", op: 0, s: 1, t: "GROUP_AT_MESSAGE_CREATE", d: { id: "msg3", group_openid: "G3", author: { member_openid: "u" }, content: "AI 搜索怎么入门", msg_type: 0 } };
  const bodyText = JSON.stringify(payload);
  const sigHex = await signRequestBody(secret, "1725442341", bodyText);

  let bg = null;
  const response = await handleQqBotWebhook(
    new Request("https://example.com/api/qq-bot", {
      method: "POST",
      headers: { "X-Signature-Ed25519": sigHex, "X-Signature-Timestamp": "1725442341" },
      body: bodyText,
    }),
    env,
    { waitUntil(p) { bg = p; } },
  );
  assert.equal(response.status, 200);
  await bg;

  const llmCall = calls.find((c) => c.url.includes("chat/completions"));
  assert.ok(llmCall, "应调用 LLM 端点");
  const llmBody = JSON.parse(llmCall.body);
  assert.equal(llmBody.model, "deepseek-chat");
  assert.ok(llmBody.messages.some((m) => m.content.includes("搜索怎么入门")));

  const sendCall = calls.find((c) => c.url.includes("/v2/groups/G3/messages"));
  assert.ok(sendCall, "应回复 AI 结果");
  assert.ok(JSON.parse(sendCall.body).content.includes("DFS 与 BFS"));

  delete globalThis.fetch;
});
