// bot/qq-message.mjs
// 从站点数据（data/overview.json）构建 QQ 群提醒/回复文本。

// 当前 UTC+8 日期（站点数据与训练日志均按 UTC+8）
export function todayUtc8() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 今日复习队列（含逾期高亮）
export function buildReviewMessage(overview, today = todayUtc8()) {
  const queue = overview && overview.reviewQueue;
  const due = Array.isArray(queue) ? queue.filter((item) => item.reviewDue <= today) : [];
  if (!due.length) {
    return `✅ 今日复习队列（${today}）：暂无待复习题目，继续保持！`;
  }
  const lines = due.map((item, index) => {
    const number = item.problemNumber ? `${item.platform || ""} ${item.problemNumber}` : item.platform || "";
    const name = item.problem || "";
    const overdue = item.reviewDue < today ? "（已逾期）" : "";
    return `${index + 1}. ${number} ${name} —— ${item.member}（复习日 ${item.reviewDue}${overdue}）`;
  });
  return `📚 今日复习队列（${today}）：共 ${due.length} 题\n${lines.join("\n")}`;
}

// 今日打卡情况（哪些成员已打卡、哪些未打卡）
export function buildCheckinMessage(overview, today = todayUtc8()) {
  const byMember = (overview && overview.heatmap && overview.heatmap.byMember) || {};
  const members = (overview && overview.members) || Object.keys(byMember);
  const done = members.filter((member) => (byMember[member] || {})[today] > 0);
  const notDone = members.filter((member) => !((byMember[member] || {})[today] > 0));
  const doneLines = done.length
    ? done.map((member) => `✅ ${member}：${byMember[member][today]} 题`).join("\n")
    : "（今天还没有人打卡）";
  const notLine = notDone.length ? `\n❌ 今日未打卡：${notDone.join("、")}` : "\n全员已打卡 🎉";
  return `📝 今日打卡情况（${today}）\n${doneLines}${notLine}`;
}

// 近 30 天统计
export function buildStatsMessage(overview) {
  const recent = (overview && overview.recent30) || {};
  const byMember = recent.byMember || {};
  const members = (overview && overview.members) || Object.keys(byMember);
  const lines = members
    .filter((member) => member !== "all")
    .map((member) => {
      const stat = byMember[member] || {};
      return `· ${member}：${stat.totalLogs || 0} 题 / ${stat.activeDays || 0} 天（周均 ${stat.avgPerWeek || 0}）`;
    });
  const all = byMember.all || {};
  const allLine = all.totalLogs
    ? `全体：${all.totalLogs} 题 / ${all.activeDays} 天（周均 ${all.avgPerWeek}）\n`
    : "";
  return `📊 近 30 天统计（${recent.start || ""} ~ ${recent.end || ""}）\n${allLine}${lines.join("\n")}`;
}

export const HELP_TEXT = `🤖 训练日志助手指令\n· 今日复习 / 复习：查看今日复习队列\n· 今日打卡 / 打卡：查看今日打卡情况\n· 统计 / 近30天：查看近 30 天训练统计\n· 帮助：显示本列表`;

// 按指令文本返回回复内容；无法识别返回 null
export async function buildReply(cmdText, fetchOverview) {
  if (/^(今日复习|复习|复习队列|待复习)/.test(cmdText)) {
    return buildReviewMessage(await fetchOverview());
  }
  if (/^(今日打卡|打卡|今天打卡|出勤)/.test(cmdText)) {
    return buildCheckinMessage(await fetchOverview());
  }
  if (/^(统计|近30天|近三十天|近况|汇总)/.test(cmdText)) {
    return buildStatsMessage(await fetchOverview());
  }
  if (/^(帮助|help|菜单|指令)/.test(cmdText)) {
    return HELP_TEXT;
  }
  return null;
}
