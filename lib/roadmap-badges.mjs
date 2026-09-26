// 知识地图徽标配色（构建端 / 浏览器端共享的唯一色阶定义）。
//
// 为什么需要这个模块：同一批徽标此前在 `src/style.css` 与 `src/assets/final.css`
// 各写了一套色阶，而且文件末尾还有一条 `.roadmap-luogu-difficulty{color:var(--text);
// background:var(--surface-soft)}` 的覆盖规则，把洛谷 8 级难度色阶整条抹掉：
//   - 深色主题下 data-level=8（NOI/NOI+/CTS，底色 #111827）配上 var(--text) 的深色字，
//     实测对比度只有 1.08:1 —— 这就是“黑底黑字”。
//   - 其余等级也退化成同一个灰底，颜色分级失效。
// 现在色阶只在这里定义一次，并由 `foregroundFor()` 按 WCAG 相对亮度自动选前景色，
// 保证每个底色上的文字对比度都不低于 4.5:1（普通字号）。

// ── 相对亮度与对比度（WCAG 2.1）────────────────────────────────────────────
function channelLuminance(value) {
  const v = Math.max(0, Math.min(255, Number(value))) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const high = Math.max(l1, l2);
  const low = Math.min(l1, l2);
  return (high + 0.05) / (low + 0.05);
}

function parseHex(hex) {
  const value = String(hex).trim().replace(/^#/, "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

// 深色前景 / 白色前景，按对比度择优选一，避免出现“深底深字”。
const DARK_INK = "#10231c";
const LIGHT_INK = "#ffffff";
const MIN_RATIO = 4.5;

export function foregroundFor(background) {
  const onLight = contrastRatio(background, LIGHT_INK);
  const onDark = contrastRatio(background, DARK_INK);
  const best = onDark >= onLight ? DARK_INK : LIGHT_INK;
  const ratio = Math.max(onLight, onDark);
  return { color: best, ratio };
}

// 底色 → 前景（返回 badge 需要的 data 属性与内联样式；构建产物与浏览器端共用）。
function badge(background) {
  const { color, ratio } = foregroundFor(background);
  return { background, color, ratio };
}

// ── 1. 知识点难度（1-10，与 curriculum 节点的 difficulty 对应）──────────────
// 分五档，底色取到“配白字也够 4.5:1”的深度：亮档配深色字，暗档配白字，
// 由 foregroundFor 自动决定，避免出现深底深字或浅底白字。
export const NODE_DIFFICULTY_PALETTE = Object.freeze({
  1: "#22c55e",
  2: "#22c55e",
  3: "#22c55e",
  4: "#eab308",
  5: "#eab308",
  6: "#eab308",
  7: "#f97316",
  8: "#f97316",
  9: "#b91c1c",
  10: "#b91c1c",
});

// 6-10 档底色偏暗，白色字更清楚；1-6 档偏亮，用深色字。
export function nodeDifficultyTone(difficulty) {
  const n = Math.max(1, Math.min(10, Math.round(Number(difficulty) || 1)));
  return { level: n, ...badge(NODE_DIFFICULTY_PALETTE[n]) };
}

// ── 2. 洛谷官方难度（8 级 + 暂无评定）─────────────────────────────────────
// 色相沿用洛谷帮助中心《题目难度体系》的分级观感（红→橙→黄→绿→青→蓝→紫→深灰），
// 但把红/蓝/紫三档压深一档，使白字也达到 4.5:1：
//   #ef4444→#b91c1c、#3b82f6→#1d4ed8、#a855f7→#7e22ce。
// NOI 档不再使用近黑的 #111827：深色主题里它会和页面底色糊在一起，且深色字完全不可读。
export const LUOGU_DIFFICULTY_LEVELS = Object.freeze({
  "暂无评定": 0,
  "入门": 1,
  "普及-": 2,
  "普及": 3,
  "普及+/提高-": 4,
  "提高": 5,
  "提高+/省选-": 6,
  "省选/NOI-": 7,
  "NOI/NOI+/CTS": 8,
});

export const LUOGU_DIFFICULTY_PALETTE = Object.freeze({
  1: "#b91c1c", // 入门
  2: "#f97316", // 普及-
  3: "#d97706", // 普及
  4: "#22c55e", // 普及+/提高-
  5: "#06b6d4", // 提高
  6: "#1d4ed8", // 提高+/省选-
  7: "#7e22ce", // 省选/NOI-
  8: "#475569", // NOI/NOI+/CTS
});

export function luoguDifficultyLevel(label) {
  const key = String(label == null ? "" : label).trim();
  return Object.prototype.hasOwnProperty.call(LUOGU_DIFFICULTY_LEVELS, key) ? LUOGU_DIFFICULTY_LEVELS[key] : null;
}

export function luoguDifficultyTone(difficulty) {
  const level = luoguDifficultyLevel(difficulty);
  if (level == null) return null;
  // 暂无评定沿用中性灰，但前景由对比度决定，避免“灰底浅字”。
  const background = level === 0 ? "#9ca3af" : LUOGU_DIFFICULTY_PALETTE[level];
  return { level, ...badge(background) };
}

// ── 3. 训练证据状态（五档，与 lib/mastery.mjs 的 state 一一对应）────────────
// 徽标底色是「状态色 14%~20% 混页面底色」，因此字号只有 12px 的徽标要按
// 「状态色 vs 混色底」而不是「状态色 vs 纯白」校验；深色值同理按混色底校验。
// 这两组值在测试里被断言 ≥ 4.5:1（混色底用与样式表一致的 color-mix 配方计算）。
export const EVIDENCE_STATE_TONES = Object.freeze({
  "建议复习": { light: "#92400e", dark: "#fbbf24" },
  "较熟练": { light: "#116634", dark: "#4ade80" },
  "有基础": { light: "#1d4ed8", dark: "#93c5fd" },
  "已接触": { light: "#3f4a5c", dark: "#cbd5e1" },
  "未接触": { light: "#5b6a64", dark: "#9fb0a8" },
});

export function evidenceStateTone(state) {
  const key = String(state == null ? "" : state).trim();
  return Object.prototype.hasOwnProperty.call(EVIDENCE_STATE_TONES, key) ? EVIDENCE_STATE_TONES[key] : null;
}

// ── 4. 视图类名（数据属性 → 样式钩子，避免把颜色写进模板）──────────────────
// 徽标只输出 data-* 属性，颜色全部交给样式表；这里集中生成这些属性，
// 保证浏览器端与构建端产出完全一致，也方便测试断言。
export function nodeDifficultyAttrs(difficulty) {
  return `data-difficulty="${nodeDifficultyTone(difficulty).level}"`;
}

export function luoguDifficultyAttrs(difficulty) {
  const tone = luoguDifficultyTone(difficulty);
  return tone ? `data-level="${tone.level}" data-difficulty-tone="${tone.level}"` : "";
}

export function evidenceStateAttrs(state) {
  const key = String(state == null ? "" : state).trim();
  return `data-state="${key}" data-state-known="${evidenceStateTone(key) ? "1" : "0"}"`;
}

// 校验用：模块内所有底色在两套主题下都必须满足最低对比度。
export function auditBadgeContrast(minRatio = MIN_RATIO) {
  const failures = [];
  const check = (name, background) => {
    const { color, ratio } = foregroundFor(background);
    if (ratio < minRatio) failures.push({ name, background, color, ratio: Math.round(ratio * 100) / 100 });
  };
  for (const [level, background] of Object.entries(NODE_DIFFICULTY_PALETTE)) check(`node-difficulty-${level}`, background);
  for (const [level, background] of Object.entries(LUOGU_DIFFICULTY_PALETTE)) check(`luogu-difficulty-${level}`, background);
  check("luogu-difficulty-0", "#9ca3af");
  return failures;
}
