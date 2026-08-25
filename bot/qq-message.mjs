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

export const HELP_TEXT = `🤖 训练日志助手指令\n· 今日复习 / 复习：今日复习队列\n· 今日打卡 / 打卡：今日打卡情况\n· 统计 / 近30天：近 30 天统计\n· 知识树 / 进度：知识树当前进度与下一步\n· AI <问题>：AI 教练答疑（如：AI 图论怎么学）\n· 帮助：显示本列表`;

const COMMAND_RE = /^(今日复习|复习|复习队列|待复习|今日打卡|打卡|今天打卡|出勤|统计|近30天|近三十天|近况|汇总|知识树|进度|督促|树|节点|帮助|help|菜单|指令)/i;

// 从群 @ 消息内容中提取指令文本：
// 1. 剔除 @提及 与可选机器人昵称；2. 锚定匹配指令；3. 若开头是疑似昵称的 token，去掉后再匹配
export function extractCommand(content, botName) {
  let text = String(content || "");
  if (botName) text = text.split(botName).join("");
  text = text.replace(/@[^\s，,。]+/g, "").replace(/^[:：\s]+/, "").trim();
  if (COMMAND_RE.test(text)) return text;
  const parts = text.split(/\s+/);
  if (parts.length > 1 && !COMMAND_RE.test(parts[0])) {
    const rest = parts.slice(1).join(" ");
    if (COMMAND_RE.test(rest)) return rest;
  }
  return text;
}

// 知识树进度（增量口径，不做"全部完成"式施压）：
// 每人只看"当前前沿阶段 + 该阶段完成节点数 + 下一步攻克哪个节点"
export function buildTreeProgressMessage(roadmap) {
  const phases = (roadmap && roadmap.phases) || [];
  const members = (roadmap && roadmap.members) || [];
  const allNodes = phases.flatMap((p) => (p.nodes || []).map((n) => ({ ...n, phase: p })));
  if (!allNodes.length || !members.length) return "知识树数据暂不可用，稍后再试。";

  function memberDone(member, node) {
    const stat = (node.stats && node.stats.byMember) || [];
    const item = stat.find((s) => s.member === member);
    const total = (node.stats && node.stats.totalProblems) || 0;
    const done = item ? item.done : 0;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  const overall = roadmap.stats || {};
  const overallLine = overall.totalProblems
    ? `全队：${overall.done}/${overall.totalProblems} 题（${overall.pct}%）\n`
    : "";

  const lines = members.map((member) => {
    // 当前阶段：第一个仍有未完成节点的阶段（按顺序推进，避免跳到末尾空阶段）
    let current = null;
    for (const phase of phases) {
      const hasTodo = (phase.nodes || []).some((n) => {
        const d = memberDone(member, n);
        return d.total > 0 && d.done < d.total;
      });
      if (hasTodo) { current = phase; break; }
    }
    if (!current) return `· ${member}：全部节点已攻克 🎉`;

    const phaseNodes = current.nodes || [];
    let doneSum = 0;
    let totalSum = 0;
    for (const n of phaseNodes) {
      const d = memberDone(member, n);
      doneSum += d.done;
      totalSum += d.total;
    }
    const phasePct = totalSum > 0 ? Math.round((doneSum / totalSum) * 100) : 0;
    const next = phaseNodes
      .map((n) => ({ title: n.title, ...memberDone(member, n) }))
      .filter((n) => n.total > 0 && n.done < n.total)
      .sort((a, b) => a.pct - b.pct)[0];
    const nextText = next ? `，下一步：${next.title}（${next.pct}%）` : "";
    return `· ${member}：${current.title}（第 ${current.index ?? 0} 阶段）${phasePct}%（${doneSum}/${totalSum} 题）${nextText}`;
  });

  return `📈 知识树进度（${phases.length} 阶段 / ${allNodes.length} 节点）\n${overallLine}${lines.join("\n")}\n💡 本周每人攻克 1 个节点就达标，互相督促！`;
}

// 按群消息内容返回回复文本；无法识别返回 null
// fetchers: { overview: () => Promise<json>, roadmap: () => Promise<json> }
// opts: { botName, aiReply: async (question) => string | null }
export async function buildReply(content, fetchers, opts = {}) {
  const { botName = "", aiReply = null } = opts;
  const cmdText = extractCommand(content, botName);
  if (/^(今日复习|复习|复习队列|待复习)/.test(cmdText)) {
    return buildReviewMessage(await fetchers.overview());
  }
  if (/^(今日打卡|打卡|今天打卡|出勤)/.test(cmdText)) {
    return buildCheckinMessage(await fetchers.overview());
  }
  if (/^(统计|近30天|近三十天|近况|汇总)/.test(cmdText)) {
    return buildStatsMessage(await fetchers.overview());
  }
  if (/^(知识树|进度|督促|树|节点)/.test(cmdText)) {
    return buildTreeProgressMessage(await fetchers.roadmap());
  }
  if (/^(帮助|help|菜单|指令)/.test(cmdText)) {
    return HELP_TEXT;
  }
  const aiMatch = cmdText.match(/^(?:ai|问答|问问|提问|分析)\s*[:：]?\s*(.*)$/i);
  if (aiMatch) {
    const question = aiMatch[1].trim().slice(0, 500);
    if (!question) return "请带上问题，例如：AI 图论怎么学";
    if (!aiReply) return "AI 指令未配置（Webhook 部署需设置 QQ_LLM_API_KEY 等环境变量）";
    try {
      return await aiReply(question);
    } catch (error) {
      return `⚠️ AI 出错了：${error.message}`;
    }
  }
  return null;
}
