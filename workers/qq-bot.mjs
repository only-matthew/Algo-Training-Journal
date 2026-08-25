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

import { fetchAccessToken, sendGroupMessage } from "../bot/qq-bot.mjs";
import { buildReply } from "../bot/qq-message.mjs";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

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
  const response = await fetch(`${dataUrl}/data/overview.json`);
  if (!response.ok) throw new Error(`站点数据加载失败（HTTP ${response.status}）`);
  return response.json();
}

// 处理群 @ 消息：识别指令 → 拉取站点数据 → 被动回复
async function processGroupAtMessage(data, env) {
  const groupOpenid = data && data.group_openid;
  const msgId = data && data.id;
  if (!groupOpenid) return;
  const reply = await buildReply(data.content, () => fetchOverview(env.QQ_DATA_URL || "https://train.xialiao.org"), env.QQ_BOT_NAME || "");
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
  if (sigHex || timestamp) {
    const ok = await qqVerifySignature(secret, sigHex, timestamp, bodyBytes);
    if (!ok) {
      return new Response(JSON.stringify({ error: "签名校验失败" }), { status: 403, headers: JSON_HEADERS });
    }
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
