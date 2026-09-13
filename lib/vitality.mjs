// 活力 v2：按统一难度和训练证据估算的工程指标，非已验证的能力评分。
// 参数与局限见 docs/VITALITY-V2.md。纯函数，无 IO，不读系统时钟。

import { resolveDifficultyRating } from "./rating.mjs";
import { subjectKeyForProblem } from "./problem-identity.mjs";

export const VITALITY_VERSION = 'v2';
export const OUTCOME_CREDIT = Object.freeze({ independent: 1, hinted: 0.7, editorial: 0.5, unknown: 0.6, unfinished: 0.15 });

// 基准：rating 1600（提高档）在最优匹配下记 1.0，与队员直觉一致。
const RATING_BASE = 1600;
// 无历史不等于零能力：以入门难度作先验，饱和区间覆盖到 3200。
// 这是工程估计刻度，不是队员的比赛 Rating 或已掌握证明。
const THETA_MIN = 800 / 213 + Math.log(0.85 / 0.15);
const THETA_SPAN = (3200 - 800) / 213;
const THETA_SCALE = 12;
// 统一 Rating 到内部能力刻度的线性变换。
const K = 1 / 213;
// 预测成功率 sigmoid 的斜率（能力每差 1 分，成功率变化约 24 个百分点）
const ALPHA = 1.0;
// 最优成功率与容差：0.85 是「踮脚够得着」，sigma 控制难度区间的宽窄
const PEAK = 0.85;
const SIGMA = 0.20;
const PRIOR_MATCH = 0.5;
const CONFIDENCE_SCALE = 6;
// 难度尺度在总分里的指数。取 0.75：rating 越高越值钱，但把 800~3000 的极差从 3.75 倍压到 2.7 倍，
// 免得弱基础队员的活力全是小数。匹配度是乘性因子，保证「太简单/太难」都被折减。
const BASE_EXPONENT = 0.75;

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/** rating → 难度尺度 D（与能力 θ 同一把尺子） */
export function ratingToDifficultyScale(rating) {
  const value = Number(rating) || 0;
  return value * K;
}

/** 该 rating 的基准量：1600 → 1.0 */
export function baseVitality(rating) {
  const value = Number(rating) || 0;
  return Number.isFinite(value) && value > 0 ? Math.pow(value / RATING_BASE, BASE_EXPONENT) : 0;
}

/** 一次「做出」给能力带来的增益：题越难，长进越多。
 *  标定：提高档（1600）增益 1.5；低档递减，高档继续增加但不设硬上限。 */
export function abilityGain(rating) {
  return 1.5 * baseVitality(rating);
}

/** 由「该知识点上的累积增益」算出当前能力 θ（饱和式，永不溢出） */
export function abilityFromEvidence(totalGain) {
  const gain = Math.max(0, Number(totalGain) || 0);
  return THETA_MIN + THETA_SPAN * (1 - Math.exp(-gain / THETA_SCALE));
}

/**
 * 遗忘衰减：久不练该知识点，水平回落。
 * 返回折减后的能力，最低保留 50%（不归零，避免「假装忘光」刷分）。
 */
export function applyForgetting(theta, daysSinceLastPractice) {
  const days = Number(daysSinceLastPractice);
  if (!Number.isFinite(days) || days <= 14) return theta;
  return theta * Math.max(0.5, Math.pow(0.95, (days - 14) / 7));
}

/** 当前水平做某难度题的成功率 */
export function predictSuccess(theta, rating) {
  return 1 / (1 + Math.exp(-ALPHA * (theta - ratingToDifficultyScale(rating))));
}

/** 匹配度：0.85 处最优；比 85% 更难要折减（做不出来长进少），
 *  比 85% 明显更简单也要折减（已经会了，练它属于复习而非长本事）。 */
export function matchFactor(successRate) {
  const rate = clamp(Number(successRate) || 0, 0, 1);
  return Math.exp(-Math.pow(rate - PEAK, 2) / (2 * SIGMA * SIGMA));
}

/**
 * 计算一道题的活力指数。
 * @param {object} input
 * @param {number} input.rating   题目 Rating
 * @param {number} input.theta    该题知识点上、记录时刻的当前水平
 * @param {string} [input.outcome] independent / hinted / editorial / unfinished
 * @returns {{vitality:number, predicted:number, match:number, base:number}}
 */
export function problemVitality({ rating, theta = THETA_MIN, outcome = 'independent', confidence = 1 } = {}) {
  const base = baseVitality(rating);
  if (!base) return { vitality: 0, predicted: 0, match: 0, base: 0 };
  // 匹配度只由「你的水平 vs 题目难度」决定，体现能力差异；
  // 完成质量不参与匹配度（否则做出来就恒等于最优匹配，目标难度将不再随水平上移）。
  const predicted = predictSuccess(Number.isFinite(Number(theta)) ? Number(theta) : THETA_MIN, rating);
  const certainty = clamp(Number.isFinite(Number(confidence)) ? Number(confidence) : 0, 0, 1);
  const match = (1 - certainty) * PRIOR_MATCH + certainty * matchFactor(predicted);
  // 没做出来只给少量增量：投入有价值，但不等于掌握。
  const credit = Object.hasOwn(OUTCOME_CREDIT, outcome) ? OUTCOME_CREDIT[outcome] : OUTCOME_CREDIT.unknown;
  return { vitality: base * match * credit, predicted, match, base };
}
/**
 * 活力值 → 热力图色阶（0-4）。
 * 阈值按活力值切，而不是按题数：做 1 道提高题（≈1.0）就该到最深档，
 * 做 3 道入门题（≈0.15）应是浅色。
 */
export function vitalityLevel(value) {
  const v = Number(value) || 0;
  if (v <= 0) return 0;
  if (v < 0.15) return 1;
  if (v < 0.4) return 2;
  if (v < 0.8) return 3;
  return 4;
}

/**
 * 给定当前水平，算出「最该做的难度」（活力最高的 Rating）。
 * 这是公式的自然结论：水平涨了，目标难度自动上移，不需要人工改设置。
 * @returns {number} Rating，四舍五入到 50
 */
export function optimalRating(theta) {
  let best = { rating: 800, vitality: -1 };
  for (let rating = 600; rating <= 3200; rating += 50) {
    const { vitality } = problemVitality({ rating, theta });
    if (vitality > best.vitality) best = { rating, vitality };
  }
  return best.rating;
}

export function vitalityRecordKey(record, fallback = '') {
  return `${record.member ?? record.memberId ?? ''}|${record.date}|${record.problemId ?? record.id ?? record.problemIndex ?? fallback}`;
}

const dayDiff = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;

/** 单成员时间线。日内无可信时间戳时统一使用当天开始前的能力，避免题名排序改变计分。 */
export function computeVitalityTimeline(records, daysBetween = dayDiff) {
  const tagGain = new Map(), tagLastDate = new Map(), subjects = new Map();
  const results = [];
  const ordered = records.map((record, index) => ({ ...record, _fallback: index }))
    .sort((a, b) => a.date.localeCompare(b.date) || vitalityRecordKey(a, a._fallback).localeCompare(vitalityRecordKey(b, b._fallback)));
  const days = Map.groupBy(ordered, record => record.date);
  for (const [date, daily] of days) {
    const pendingGains = new Map();
    for (const record of daily) {
      const rating = resolveDifficultyRating(record);
      const tags = [...new Set((Array.isArray(record.tags) ? record.tags : []).filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim()))];
      const member = record.member ?? record.memberId ?? '_member';
      const keys = (tags.length ? tags : ['(未标注)']).map(tag => `${member}|${tag}`);
      // 各知识点平均，不能只凭最熟悉的标签替代其余知识点。
      const evidence = keys.reduce((sum, key) => sum + (tagGain.get(key) || 0), 0) / keys.length;
      const theta = keys.reduce((sum, key) => {
        const raw = abilityFromEvidence(tagGain.get(key) || 0);
        const last = tagLastDate.get(key);
        return sum + (last ? applyForgetting(raw, daysBetween(last, date)) : raw);
      }, 0) / keys.length;
      const confidence = 1 - Math.exp(-evidence / CONFIDENCE_SCALE);
      const outcome = Object.hasOwn(OUTCOME_CREDIT, record.outcome) ? record.outcome : 'unknown';
      const credit = OUTCOME_CREDIT[outcome];
      const subjectKey = subjectKeyForProblem({ memberId: member, date, recordId: String(record.problemId ?? record.id ?? record.problemIndex ?? record._fallback), platform: record.platform, problemNumber: record.problemNumber });
      const key = `${member}|${subjectKey}`;
      const previous = subjects.get(key);
      let score = problemVitality({ rating, theta, outcome, confidence });
      let status = 'counted', earned = 0;
      let learned = 0;
      if (!rating) status = 'missing_rating';
      else if (record.entryKind === 'review' || record.entryKind === 'practice' || record.mode === 'review') status = 'review';
      else {
        // 同题冻结首次有效难度/匹配度；后续完成仅补差额，不叠加部分分。
        const unit = previous?.unit ?? score.base * score.match;
        earned = unit * Math.max(0, credit - (previous?.credit ?? 0));
        const learningCredit = outcome === 'unfinished' ? 0 : credit;
        const bestLearningCredit = Math.max(previous?.learningCredit ?? 0, learningCredit);
        learned = abilityGain(previous?.rating ?? rating) * (bestLearningCredit - (previous?.learningCredit ?? 0));
        if (previous) status = earned > 0 ? 'completed_delta' : 'duplicate';
        const snapshot = previous ?? { unit, rating, theta, confidence, tags: keys, predicted: score.predicted, match: score.match, base: score.base };
        subjects.set(key, { ...snapshot, credit: Math.max(previous?.credit ?? 0, credit), learningCredit: bestLearningCredit });
        score = { ...score, predicted: snapshot.predicted, match: snapshot.match, base: snapshot.base };
        for (const tag of snapshot.tags) pendingGains.set(tag, (pendingGains.get(tag) || 0) + learned / snapshot.tags.length);
      }
      const { _fallback, ...source } = record;
      results.push({ ...source, rating, theta: previous?.theta ?? theta, confidence: previous?.confidence ?? confidence, outcome, subjectKey, ...score, vitality: earned, vitalityStatus: status, algorithmVersion: VITALITY_VERSION });
    }
    for (const [tag, gain] of pendingGains) {
      if (gain <= 0) continue;
      tagGain.set(tag, (tagGain.get(tag) || 0) + gain);
      tagLastDate.set(tag, date);
    }
  }
  return results;
}
