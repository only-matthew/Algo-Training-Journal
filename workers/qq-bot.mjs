// workers/qq-bot.mjs
// QQ 开放平台机器人 Webhook 处理（部署于 Cloudflare Worker，无需常驻服务器）。
//
// 接入方式：在 q.qq.com 控制台 - 开发设置 - 消息接收 选择 Webhook，
// 回调地址填写本 Worker 的 `https://algo-oauth.xialiao.org/api/qq-bot`，
// 并订阅「群聊消息」事件（GROUP_AT_MESSAGE_CREATE）。
//
// 需要的 Worker Secret（`npx wrangler secret put`）：
//   QQ_APP_ID          机器人 AppID
//   QQ_CLIENT_SECRET   客户端密钥（用于获取 access_token）
//   QQ_BOT_SECRET      Bot Secret（用于 Webhook 签名验证与回调验证，控制台 - 开发设置）
// 可选 Vars（wrangler.toml [vars]）：
//   QQ_BOT_NAME        机器人昵称（从群消息内容中剔除 @提及，便于识别指令）
//   QQ_DATA_URL        站点数据地址，默认 https://train.xialiao.org
//
// 协议要点（QQ 官方文档）：
//   - op 13 回调地址验证：返回 { plain_token, signature }，signature = ed25519(event_ts + plain_token)
//   - op 0 事件推送：先回 HTTP 200 + op 12 ACK，业务处理放后台（ctx.waitUntil）
//   - 请求签名：X-Signature-Ed25519 对 timestamp + raw body 做 ed25519 验签，公钥由 Bot Secret 派生

import { sha512 } from "@noble/hashes/sha2.js";
import * as ed from "@noble/ed25519";
ed.hashes.sha512 = sha512;

import { fetchAccessToken, sendGroupMessage, chatCompletion } from "../lib/qq-bot.mjs";
import { buildReply } from "../lib/qq-message.mjs";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

// ── 重放与滥用防护 ──────────────────────────────────────────────────────────
// 站点数据请求的时限：没有超时的话被动回复会在上游抖动时永久挂住（审计 §3.3）。
const DATA_TIMEOUT_MS = 10000;
// 签名时效窗口（±300 s）：ed25519 签名本身没有时效，截获一份已签名请求就能无限重放
// （重复回复、重复消耗 LLM 额度，审计 §4.2）。验签通过后还要看时间戳。
const SIGNATURE_WINDOW_MS = 300 * 1000;
// 事件去重表（isolate 内存态，与 workers/oauth.mjs 的限流表同性质：跨冷启动与
// 多 isolate 不共享）。只用来挡住同一个 payload.id 的重复投递，不保存任何业务数据。
const EVENT_TTL_MS = 10 * 60 * 1000;
const MAX_TRACKED_EVENTS = 500;
const processedEvents = new Map();
// AI 指令的群级频控：群成员可以无限 @ 机器人触发付费 LLM（审计 §4.2）。
const AI_RATE_LIMIT = { max: 6, windowMs: 60 * 1000 };
const aiRateMap = new Map();

/** 时间戳是否超出允许的重放窗口。QQ 的 X-Signature-Timestamp 是秒级 epoch，毫秒也认。 */
function signatureExpired(timestamp, now = Date.now()) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return true;
  const stampMs = value > 1e12 ? value : value * 1000;
  return Math.abs(now - stampMs) > SIGNATURE_WINDOW_MS;
}

/** 这个 payload.id 是否已经处理过；首次出现时登记。 */
function duplicateEvent(id, now = Date.now()) {
  if (typeof id !== "string" || !id) return false;
  if (processedEvents.size >= MAX_TRACKED_EVENTS) {
    for (const [key, at] of processedEvents) if (now - at > EVENT_TTL_MS) processedEvents.delete(key);
    // 仍然满就淘汰最老的一条：宁可漏挡一次重复投递，也不让内存无界增长。
    if (processedEvents.size >= MAX_TRACKED_EVENTS) processedEvents.delete(processedEvents.keys().next().value);
  }
  if (processedEvents.has(id)) return true;
  processedEvents.set(id, now);
  return false;
}

/** 群级 AI 频控（与 oauth 的 rateExceeded 同算法，key 换成 group_openid）。 */
function aiRateExceeded(groupOpenid, now = Date.now()) {
  const entry = aiRateMap.get(groupOpenid);
  if (!entry || now - entry.since > AI_RATE_LIMIT.windowMs) {
    aiRateMap.set(groupOpenid, { count: 1, since: now });
    return false;
  }
  entry.count += 1;
  return entry.count > AI_RATE_LIMIT.max;
}

// Bot Secret → ed25519 seed：repeat 至 32 字节后取前 32 字节（与官方 Go 实现一致）
function seedFromSecret(secret) {
  let seed = String(secret || "");
  while (seed.length < 32) seed += seed;
  return new TextEncoder().encode(seed.slice(0, 32));
}

function hexToBytes(hex) {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 回调地址验证签名：ed25519(event_ts + plain_token)，十六进制返回
export async function qqValidationSignature(secret, eventTs, plainToken) {
  const message = new TextEncoder().encode(`${String(eventTs)}${String(plainToken)}`);
  const signature = await ed.signAsync(message, seedFromSecret(secret));
  return bytesToHex(signature);
}

// 请求签名验证：X-Signature-Ed25519 对 timestamp + raw body 验签
export async function qqVerifySignature(secret, sigHex, timestamp, bodyBytes) {
  try {
    if (!sigHex || !timestamp) return false;
    const signature = hexToBytes(sigHex);
    const tsBytes = new TextEncoder().encode(String(timestamp));
    const message = new Uint8Array(tsBytes.length + bodyBytes.length);
    message.set(tsBytes, 0);
    message.set(bodyBytes, tsBytes.length);
    const publicKey = await ed.getPublicKeyAsync(seedFromSecret(secret));
    return await ed.verifyAsync(signature, message, publicKey);
  } catch {
    return false;
  }
}

async function fetchOverview(dataUrl) {
  const response = await fetch(`${dataUrl}/data/overview.json`, { signal: AbortSignal.timeout(DATA_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`站点数据加载失败（HTTP ${response.status}）`);
  return response.json();
}

async function fetchRoadmap(dataUrl) {
  const response = await fetch(`${dataUrl}/data/roadmap.json`, { signal: AbortSignal.timeout(DATA_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`知识树数据加载失败（HTTP ${response.status}）`);
  return response.json();
}

const AI_SYSTEM_PROMPT =
  "你是算法竞赛教练（ICPC/NOI/蓝桥杯方向），熟悉 C++ 算法与数据结构。用简洁中文回答，必要时给简短代码片段；回答控制在 300 字以内；不确定时明确说明。不要使用 Markdown 表格。";

// AI 指令：优先走配置的 OpenAI 兼容端点（QQ_LLM_API_KEY），否则回退 Workers AI（env.AI）
export async function qqAiReply(question, env) {
  const messages = [
    { role: "system", content: AI_SYSTEM_PROMPT },
    { role: "user", content: `${question}\n/no_think` },
  ];
  let content = null;
  if (env.QQ_LLM_API_KEY) {
    content = await chatCompletion({
      baseUrl: env.QQ_LLM_BASE_URL || "https://api.deepseek.com",
      apiKey: env.QQ_LLM_API_KEY,
      model: env.QQ_LLM_MODEL || "deepseek-chat",
      messages,
      maxTokens: 1500,
      temperature: 0.6,
    });
  } else if (env.AI) {
    const result = await env.AI.run(env.QQ_LLM_MODEL || "@cf/qwen/qwen3-30b-a3b-fp8", {
      max_tokens: 1500,
      temperature: 0.6,
      messages,
    });
    content = result && result.response ? String(result.response) : null;
  }
  if (!content) return "AI 指令未配置：请设置 QQ_LLM_API_KEY（及 QQ_LLM_BASE_URL / QQ_LLM_MODEL）。";
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
}

// 处理群 @ 消息：识别指令 → 拉取站点数据 → 被动回复
async function processGroupAtMessage(data, env) {
  const groupOpenid = data && data.group_openid;
  const msgId = data && data.id;
  if (!groupOpenid) return;
  const dataUrl = env.QQ_DATA_URL || "https://train.xialiao.org";
  const reply = await buildReply(
    data.content,
    {
      overview: () => fetchOverview(dataUrl),
      roadmap: () => fetchRoadmap(dataUrl),
    },
    {
      botName: env.QQ_BOT_NAME || "",
      // AI 指令按群限流：超限时不再调用付费 LLM，直接把提示当回答返回（buildReply 会照常成文）。
      aiReply: (question) => (aiRateExceeded(groupOpenid)
        ? `AI 指令请求过于频繁，请稍后再试（每分钟最多 ${AI_RATE_LIMIT.max} 次）。`
        : qqAiReply(question, env)),
    },
  );
  if (!reply) return;
  const { token } = await fetchAccessToken({ appId: env.QQ_APP_ID, clientSecret: env.QQ_CLIENT_SECRET });
  await sendGroupMessage(groupOpenid, reply, { token, msgId });
}

// Webhook 入口：验签 → op 13 回调验证 / op 0 事件推送（ACK 先行，处理放后台）
export async function handleQqBotWebhook(request, env, ctx) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: JSON_HEADERS });
  }
  const secret = env.QQ_BOT_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ error: "QQ_BOT_SECRET 未配置" }), { status: 500, headers: JSON_HEADERS });
  }
  const bodyText = await request.text();
  const bodyBytes = new TextEncoder().encode(bodyText);
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return new Response(JSON.stringify({ error: "无效的 JSON" }), { status: 400, headers: JSON_HEADERS });
  }

  // 签名校验（回调验证与事件推送均带签名头）
  const sigHex = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!sigHex || !timestamp || !(await qqVerifySignature(secret, sigHex, timestamp, bodyBytes))) {
    return new Response(JSON.stringify({ error: "签名校验失败" }), { status: 403, headers: JSON_HEADERS });
  }
  // 验签通过不代表请求是新的：签名没有时效，必须再看时间戳窗口。
  if (signatureExpired(timestamp)) {
    return new Response(JSON.stringify({ error: "请求时间戳超出允许范围" }), { status: 403, headers: JSON_HEADERS });
  }

  // 回调地址验证：返回 plain_token + 签名
  if (payload.op === 13) {
    const botAppId = request.headers.get("X-Bot-Appid");
    if (botAppId && env.QQ_APP_ID && String(botAppId) !== String(env.QQ_APP_ID)) {
      return new Response(JSON.stringify({ error: "AppID 校验失败" }), { status: 403, headers: JSON_HEADERS });
    }
    const data = payload.d || {};
    const signature = await qqValidationSignature(secret, data.event_ts, data.plain_token);
    return new Response(JSON.stringify({ plain_token: data.plain_token, signature }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  // 事件推送：先回 op 12 ACK，业务处理放后台
  if (payload.op === 0) {
    const eventId = payload.id || "";
    // 同一个事件重复投递只处理一次；仍然回 ACK，否则 QQ 会一直重推。
    if (duplicateEvent(eventId)) {
      return new Response(JSON.stringify({ op: 12, d: { id: eventId } }), { status: 200, headers: JSON_HEADERS });
    }
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        (async () => {
          if (payload.t === "GROUP_AT_MESSAGE_CREATE") {
            await processGroupAtMessage(payload.d, env);
          }
        })().catch((error) => console.error("QQ 事件处理失败：", error)),
      );
    }
    return new Response(JSON.stringify({ op: 12, d: { id: eventId } }), { status: 200, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ error: "不支持的 op" }), { status: 400, headers: JSON_HEADERS });
}
