// bot/qq-bot.mjs
// QQ 开放平台机器人 API 客户端（Node 20+，内置 fetch）。
// 文档：https://bot.qq.com/wiki/develop/api-v2/
// 注意：QQ 平台自 2025-04-21 起不再提供「主动推送」能力，主动消息接口可能返回错误；
//       本客户端同时支持被动回复（携带 msg_id / event_id 回复群消息）。

const API_BASE = "https://api.sgroup.qq.com";

// 获取访问凭证（access_token 有效期 7200 秒，进程内缓存，过期自动刷新）
export async function fetchAccessToken({ appId, clientSecret }) {
  const response = await fetch("https://bots.qq.com/app/getAppAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId: String(appId), clientSecret: String(clientSecret) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`获取 QQ access_token 失败（HTTP ${response.status}）：${JSON.stringify(data)}`);
  }
  return { token: data.access_token, expiresIn: Number(data.expires_in) || 7200 };
}

// 获取 WebSocket 网关地址
export async function getGatewayUrl({ token }) {
  const response = await fetch(`${API_BASE}/gateway`, {
    headers: { Authorization: `QQBot ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    throw new Error(`获取网关地址失败（HTTP ${response.status}）：${JSON.stringify(data)}`);
  }
  return { url: data.url, shards: data.shards, sessionStartLimit: data.session_start_limit };
}

// 发送群聊消息。
// msgId 存在时按被动回复发送（需在收到消息后 5 分钟内、每条最多回复 5 次）。
export async function sendGroupMessage(groupOpenid, content, { token, msgId, eventId } = {}) {
  const body = { msg_type: 0, content: String(content) };
  if (msgId) body.msg_id = String(msgId);
  if (eventId) body.event_id = String(eventId);
  const response = await fetch(`${API_BASE}/v2/groups/${encodeURIComponent(groupOpenid)}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `QQBot ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  // 22009 = 消息发送超频；code 非 0 视为失败
  if (!response.ok || (data.code && data.code !== 0)) {
    throw new Error(`发送群消息失败（HTTP ${response.status}）：${JSON.stringify(data)}`);
  }
  return data;
}

// 通用 LLM 对话（OpenAI 兼容接口，如 DeepSeek / 通义 / OpenAI）。
// 供 Worker（Webhook）与本地监听（listen.mjs）共用。
export async function chatCompletion({ baseUrl, apiKey, model, messages, maxTokens = 600, temperature = 0.6 }) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base || !apiKey) return null;
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: String(model || "deepseek-chat"), messages, max_tokens: maxTokens, temperature }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`LLM 请求失败（HTTP ${response.status}）：${text.slice(0, 200)}`);
  }
  const data = await response.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return String(content || "").trim() || null;
}
