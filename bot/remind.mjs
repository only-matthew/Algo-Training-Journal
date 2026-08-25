// bot/remind.mjs
// 单次生成并发送训练提醒（今日复习 + 近 30 天统计）。
//
// ⚠️ 重要：QQ 平台自 2025-04-21 起不再提供「主动推送」能力，
// 主动调用发消息接口可能返回错误（消息推送策略调整通知）。
// 本脚本保留作为：
//   1) 已验证主动推送权限的机器人/频道场景；
//   2) 或与被动回复配合、手动触发的巡检工具。
// 日常提醒建议使用 bot/listen.mjs（群成员 @机器人 即查即回）。
//
// 用法：
//   QQ_APP_ID=xxx QQ_CLIENT_SECRET=xxx QQ_GROUP_OPENID=xxx node bot/remind.mjs
// 环境变量：
//   QQ_APP_ID / QQ_CLIENT_SECRET / QQ_GROUP_OPENID（群 openid，来自 listen 输出或群消息事件）
//   QQ_DATA_URL 可选，默认 https://train.xialiao.org

import { fetchAccessToken, sendGroupMessage } from "./qq-bot.mjs";
import { buildReviewMessage, buildStatsMessage } from "./qq-message.mjs";

const APP_ID = process.env.QQ_APP_ID;
const CLIENT_SECRET = process.env.QQ_CLIENT_SECRET;
const GROUP_OPENID = process.env.QQ_GROUP_OPENID;
const DATA_URL = (process.env.QQ_DATA_URL || "https://train.xialiao.org").replace(/\/+$/, "");

if (!APP_ID || !CLIENT_SECRET || !GROUP_OPENID) {
  console.error("缺少环境变量：需要 QQ_APP_ID、QQ_CLIENT_SECRET、QQ_GROUP_OPENID");
  process.exit(1);
}

const overview = await (await fetch(`${DATA_URL}/data/overview.json`)).json();
const { token } = await fetchAccessToken({ appId: APP_ID, clientSecret: CLIENT_SECRET });
const text = `${buildReviewMessage(overview)}\n\n${buildStatsMessage(overview)}`;

try {
  await sendGroupMessage(GROUP_OPENID, text, { token });
  console.log(`已发送到 ${GROUP_OPENID}：\n${text}`);
} catch (error) {
  console.error(`发送失败（可能因平台限制主动推送）：${error.message}`);
  process.exit(1);
}
