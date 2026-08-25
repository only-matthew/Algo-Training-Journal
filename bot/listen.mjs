// bot/listen.mjs
// QQ 机器人 WebSocket 常驻监听（指令式提醒）。
//
// 背景：QQ 平台自 2025-04-21 起不再提供「主动推送」，机器人无法定时直接给群发消息；
// 因此采用被动回复模式：群成员 @机器人 + 指令（如「今日复习」），机器人即时回复。
//
// 运行方式（需常驻，可用 pm2 / systemd / nohup）：
//   QQ_APP_ID=xxx QQ_CLIENT_SECRET=xxx QQ_BOT_TOKEN=xxx QQ_BOT_NAME=训练日志助手 \
//   node bot/listen.mjs
//
// 环境变量：
//   QQ_APP_ID       开放平台机器人 AppID（q.qq.com 控制台）
//   QQ_CLIENT_SECRET 开放平台客户端密钥（控制台 - 开发设置）
//   QQ_BOT_TOKEN     机器人令牌（Identify 使用 "Bot {appid}.{token}"，控制台 - 开发设置）
//   QQ_BOT_NAME      机器人昵称，用于从消息内容中剔除 @提及（可选，默认空）
//   QQ_DATA_URL      站点数据地址，默认 https://train.xialiao.org
//
// 首次运行：把机器人拉进目标群后，在群里 @机器人 发任意消息，
// 控制台会打印该群的 group_openid（后续配置定时/其他用途需要）。

import { fetchAccessToken, getGatewayUrl, sendGroupMessage } from "./qq-bot.mjs";
import { buildReply } from "./qq-message.mjs";

const APP_ID = process.env.QQ_APP_ID;
const CLIENT_SECRET = process.env.QQ_CLIENT_SECRET;
const BOT_TOKEN = process.env.QQ_BOT_TOKEN;
const BOT_NAME = process.env.QQ_BOT_NAME || "";
const DATA_URL = (process.env.QQ_DATA_URL || "https://train.xialiao.org").replace(/\/+$/, "");

const INTENTS_GROUP_AND_C2C = 1 << 25; // GROUP_AND_C2C_EVENT：群 @ 消息 / 加群事件等
const RECONNECT_DELAY_MS = 5000;

if (!APP_ID || !CLIENT_SECRET || !BOT_TOKEN) {
  console.error("缺少环境变量：需要 QQ_APP_ID、QQ_CLIENT_SECRET、QQ_BOT_TOKEN");
  process.exit(1);
}

let accessToken = null;
let lastSeq = null;

async function ensureToken() {
  if (!accessToken) {
    const result = await fetchAccessToken({ appId: APP_ID, clientSecret: CLIENT_SECRET });
    accessToken = result.token;
  }
  return accessToken;
}

async function fetchOverview() {
  const response = await fetch(`${DATA_URL}/data/overview.json`);
  if (!response.ok) throw new Error(`站点数据加载失败（HTTP ${response.status}）`);
  return response.json();
}

// 剔除消息中的 @机器人 提及与多余空白，得到指令文本（与 Worker 版共用 buildReply 的 extractCommand）
async function handleGroupAtMessage(event) {
  const data = event.d || {};
  const content = data.content || "";
  const groupOpenid = data.group_openid;
  const msgId = data.id;
  if (!groupOpenid) return;

  // 打印群 openid 便于首次部署收集
  console.log(`[群消息] group=${groupOpenid} author=${data.author ? data.author.member_openid : "?"} content=${content}`);

  let reply;
  try {
    reply = await buildReply(content, fetchOverview, BOT_NAME);
  } catch (error) {
    reply = `⚠️ 查询失败：${error.message}`;
  }
  if (!reply) return;

  const token = await ensureToken();
  try {
    await sendGroupMessage(groupOpenid, reply, { token, msgId });
    console.log(`[回复] ${groupOpenid}: ${reply.slice(0, 60)}…`);
  } catch (error) {
    console.error(`[回复失败] ${error.message}`);
  }
}

async function connect() {
  const token = await ensureToken();
  const gateway = await getGatewayUrl({ token });
  console.log(`连接网关：${gateway.url}`);

  const ws = new WebSocket(gateway.url);
  let heartbeatTimer = null;

  ws.onopen = () => {
    console.log("WS 已连接，发送 Identify…");
    ws.send(JSON.stringify({
      op: 2,
      d: {
        token: `Bot ${APP_ID}.${BOT_TOKEN}`,
        intents: INTENTS_GROUP_AND_C2C,
        shard: [0, 1],
        properties: { $os: "linux", $browser: "atj-bot", $device: "atj-bot" },
      },
    }));
  };

  ws.onmessage = async (message) => {
    let payload;
    try {
      payload = JSON.parse(message.data);
    } catch {
      return;
    }
    if (payload.s != null) lastSeq = payload.s;

    if (payload.op === 10) {
      const interval = (payload.d && payload.d.heartbeat_interval) || 45000;
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: lastSeq }));
      }, interval);
      console.log(`心跳周期 ${interval}ms`);
    } else if (payload.op === 0) {
      if (payload.t === "READY") {
        console.log(`READY：${payload.d && payload.d.user ? payload.d.user.username : "?"} 已上线`);
      } else if (payload.t === "RESUMED") {
        console.log("会话已恢复");
      } else if (payload.t === "GROUP_AT_MESSAGE_CREATE") {
        try {
          await handleGroupAtMessage(payload);
        } catch (error) {
          console.error("处理群消息失败：", error);
        }
      }
    }
    // op 11 为心跳 ACK，无需处理
  };

  ws.onclose = (event) => {
    console.log(`连接关闭（code=${event.code}），${RECONNECT_DELAY_MS}ms 后重连…`);
    clearInterval(heartbeatTimer);
    setTimeout(connect, RECONNECT_DELAY_MS);
  };

  ws.onerror = (error) => {
    console.error("WS 错误：", error && error.message ? error.message : error);
  };
}

connect().catch((error) => {
  console.error("启动失败：", error);
  process.exit(1);
});
