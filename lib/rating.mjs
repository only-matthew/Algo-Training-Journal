// 难度统一的展示口径：全站只显示 Codeforces Rating 数值。
//
// 背景：难度原本是混杂的多套标签（CF 的「≤1199」档位、洛谷的「普及-」8 级、自建题的「未标注」），
// 队员反映 CF Rating 更直观。数据层已由 scripts/backfill-rating.mjs 统一写入
// meta.json 的 difficultyRating（数值），这里只负责把它渲染成人看的形式。
//
// 纯函数、无 IO，构建端与浏览器端共用。

// 一个 "tier" 表示同样的强弱分层，用于配色与筛选。
export const RATING_TIERS = Object.freeze([
  { max: 999, tier: "entry", label: "入门" },
  { max: 1199, tier: "basic", label: "普及-" },
  { max: 1399, tier: "easy", label: "普及" },
  { max: 1599, tier: "medium", label: "普及+/提高-" },
  { max: 1899, tier: "hard", label: "提高" },
  { max: 2199, tier: "expert", label: "提高+/省选-" },
  { max: 2499, tier: "expert", label: "省选/NOI-" },
  { max: Infinity, tier: "expert", label: "NOI/NOI+/CTS" },
]);

// 取 Rating 的展示档位。缺失时按最保守的中档处理，不显示「未标注」以外的措辞。
export function ratingTier(rating) {
  const value = Number(rating);
  if (!Number.isFinite(value) || value <= 0) return { tier: "medium", label: "" };
  return RATING_TIERS.find((entry) => value <= entry.max) || RATING_TIERS[RATING_TIERS.length - 1];
}

// 难度徽章的配色 class（与既有 .difficulty-badge 的 tone 约定一致）
export function ratingTone(rating) {
  return ratingTier(rating).tier;
}

// 「★ 1200」这种人看的写法；无 Rating 时回退到原有的难度标签。
export function ratingLabel(rating, fallback = "") {
  const value = Number(rating);
  if (Number.isFinite(value) && value > 0) return `★ ${value}`;
  return fallback || "未标注";
}

// 筛选下拉用的选项（按数值升序，去重）
export function ratingOptions(ratings) {
  return [...new Set(ratings.map(Number).filter((value) => Number.isFinite(value) && value > 0))]
    .sort((a, b) => a - b);
}

// 表单可选的标准 Rating 档位。取常用档，覆盖入门到省选；
// 导入 Codeforces/AtCoder 时会自动回填精确 Rating，无需手工挑。
export const STANDARD_RATINGS = Object.freeze([
  800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900,
  2000, 2100, 2200, 2400, 2600, 2900,
]);

// 从「★ 1200」这类展示值里取回数值；取不到返回 0。
export function parseRatingLabel(value) {
  const matched = String(value ?? "").match(/(\d{3,4})/);
  return matched ? Number(matched[1]) : 0;
}

// 非 Codeforces 平台的难度标签 → 等值 CF Rating。
// 洛谷 8 级官方难度取对应 CF 区间的中点；另含早期表单遗留的合并档与错拼。
// AtCoder 不用这张表——AtCoder Problems 直接提供与 CF 同尺度的数值难度。
// scripts/backfill-rating.mjs 与表单导入共用这一份，避免两处维护走偏。
export const DIFFICULTY_LABEL_RATING = Object.freeze({
  "入门": 800,
  "普及-": 1000,
  "普及": 1300,
  "普及+/提高-": 1500,
  "提高": 1700,
  "提高+/省选-": 2000,
  "省选/NOI-": 2400,
  "NOI/NOI+/CTS": 2900,
  "普及+/提高": 1500,
  "普及/提高-": 1500,
});

// 旧档位字符串（历史记录里存在）→ 数值；取该区间中点。
export const RATING_BAND_VALUES = Object.freeze({
  "≤1199": 1000, "≤999": 800, "1000-1199": 1100, "1200-1399": 1300,
  "1400-1599": 1500, "1600-1899": 1700, "1900-2199": 2000, "≥2200": 2400,
});

// 把任意平台的难度信息归一为 Rating 数值。返回 0 表示无法确定。
//
// 优先级（对洛谷、AtCoder、校内自建平台一视同仁）：
//   1) 已有的数值 Rating（Codeforces / AtCoder 官方值，或已换算过的结果）
//   2) 难度标签查表（洛谷 8 级及其历史写法）
//   3) 旧档位字符串查表
//   4) 展示值「★ 1200」反解
export function resolveDifficultyRating({ rating, difficulty, difficultyRating } = {}) {
  for (const candidate of [difficultyRating, rating]) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return Math.round(value);
  }
  const label = String(difficulty ?? "").trim();
  if (!label) return 0;
  if (label in DIFFICULTY_LABEL_RATING) return DIFFICULTY_LABEL_RATING[label];
  if (label in RATING_BAND_VALUES) return RATING_BAND_VALUES[label];
  return parseRatingLabel(label);
}
