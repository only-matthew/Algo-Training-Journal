// 「今天」与日期字符串工具的一致性测试（审计 §3.1 / §4.1）。
//
// 这里同时承担两类职责：
//  1. 行为断言：todayUtc8 的日界、boundaryHour、addDaysToDate 的跨月/跨年/闰年、
//     isDateString 对假日期与非字符串的判定；
//  2. 迁移守卫：源码正则断言，防止有人把「今天」再写回本地时区，或把日期校验
//     再复制一份私有实现。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { todayUtc8, toDateString } from "../lib/constants.mjs";
import { addDaysToDate, isDateString } from "../lib/date-string.mjs";
import { dueDateInDays } from "../lib/review-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("todayUtc8 的日界在 UTC+8 的 00:00，而不是运行环境本地时区", () => {
  // 北京时间 2026-10-03 01:00（UTC 还是 10-02）——这正是本地时区口径会差一天的时刻。
  assert.equal(todayUtc8(new Date("2026-10-02T17:00:00Z")), "2026-10-03");
  assert.equal(todayUtc8(new Date("2026-10-02T16:00:00Z")), "2026-10-03"); // 恰好跨日
  assert.equal(todayUtc8(new Date("2026-10-02T15:59:59Z")), "2026-10-02"); // 跨日前一秒
  assert.equal(todayUtc8(new Date("2026-10-02T00:00:00Z")), "2026-10-02");
  // 负时区同样只看 UTC+8 日历日。
  assert.equal(todayUtc8(new Date("2026-12-31T16:00:00Z")), "2027-01-01");
  // ISO 字符串入参与默认参数
  assert.equal(todayUtc8("2026-10-02T17:00:00Z"), "2026-10-03");
  assert.match(todayUtc8(), /^\d{4}-\d{2}-\d{2}$/);
  // 非法时间不能悄悄返回一个「今天」
  assert.equal(todayUtc8(new Date("nope")), "");
});

test("todayUtc8 的 boundaryHour 把日界后移（凌晨仍算前一天）", () => {
  // 04:00 日界：北京时间 03:59:59 属于前一天，04:00:00 属于当天。
  assert.equal(todayUtc8(new Date("2026-10-02T19:59:59Z"), 4), "2026-10-02");
  assert.equal(todayUtc8(new Date("2026-10-02T20:00:00Z"), 4), "2026-10-03");
  // 04:00 日界在 UTC+8 的 2026-10-03 凌晨 02:30 —— 0 点日界会算成 10-03，4 点日界算 10-02。
  assert.equal(todayUtc8(new Date("2026-10-02T18:30:00Z"), 4), "2026-10-02");
  assert.equal(todayUtc8(new Date("2026-10-02T18:30:00Z")), "2026-10-03");
  // boundaryHour 为 0 时必须与不传等价（默认值可依赖）
  const instant = new Date("2026-10-02T17:00:00Z");
  assert.equal(todayUtc8(instant, 0), todayUtc8(instant));
});

test("addDaysToDate 是纯 UTC 日历运算：跨月、跨年、闰年与负数都对", () => {
  assert.equal(addDaysToDate("2026-01-31", 1), "2026-02-01"); // 跨月
  assert.equal(addDaysToDate("2026-08-31", 1), "2026-09-01");
  assert.equal(addDaysToDate("2026-12-31", 1), "2027-01-01"); // 跨年
  assert.equal(addDaysToDate("2026-12-30", 3), "2027-01-02");
  assert.equal(addDaysToDate("2028-02-28", 1), "2028-02-29"); // 闰年
  assert.equal(addDaysToDate("2028-02-29", 1), "2028-03-01");
  assert.equal(addDaysToDate("2026-02-28", 1), "2026-03-01"); // 平年没有 02-29
  assert.equal(addDaysToDate("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysToDate("2026-01-01", 365), "2027-01-01"); // 2026 是平年
  assert.equal(addDaysToDate("2028-01-01", 366), "2029-01-01"); // 2028 是闰年
  assert.equal(addDaysToDate("2026-10-02", 0), "2026-10-02");
  // 非法输入返回空串而不是抛出（调用方按「空串即无值」处理）
  assert.equal(addDaysToDate("2026-02-30", 1), "");
  assert.equal(addDaysToDate("", 1), "");
  assert.equal(addDaysToDate(undefined, 1), "");
  assert.equal(addDaysToDate("2026-10-02", Number.NaN), "");
  assert.equal(addDaysToDate("2026-10-02", undefined), "");
});

test("isDateString 拒绝假日期、非补零格式与非字符串", () => {
  assert.equal(isDateString("2026-07-25"), true);
  assert.equal(isDateString("2028-02-29"), true);
  assert.equal(isDateString("2026-02-30"), false);
  assert.equal(isDateString("2026-13-01"), false);
  assert.equal(isDateString("2026-00-10"), false);
  assert.equal(isDateString("2026-10-32"), false);
  assert.equal(isDateString("2026-2-3"), false);
  assert.equal(isDateString("2026/10/02"), false);
  assert.equal(isDateString("2026-10-02T00:00:00Z"), false);
  assert.equal(isDateString(""), false);
  assert.equal(isDateString(null), false);
  assert.equal(isDateString(undefined), false);
  assert.equal(isDateString(20261002), false);
  assert.equal(isDateString(["2026-10-02"]), false); // 可被正则隐式转成字符串，也必须拒绝
  assert.equal(isDateString(new Date()), false);
});

test("dueDateInDays 以 UTC+8 的今天为基准，且签名不变", () => {
  const base = new Date("2026-08-28T12:00:00Z"); // 北京时间 20:00
  assert.equal(dueDateInDays(0, base), "2026-08-28");
  assert.equal(dueDateInDays(3, base), "2026-08-31");
  assert.equal(dueDateInDays(-1, base), "2026-08-27");
  // 北京时间已是次日（UTC 仍是 07-31 23:00）时，基准日必须是 08-01
  assert.equal(dueDateInDays(0, new Date("2026-07-31T23:00:00Z")), "2026-08-01");
  assert.equal(dueDateInDays(1, new Date("2026-07-31T23:00:00Z")), "2026-08-02");
  assert.match(dueDateInDays(3), /^\d{4}-\d{2}-\d{2}$/);
});

test("todayUtc8 / addDaysToDate / dueDateInDays 的结果与运行环境 TZ 无关", () => {
  const script = [
    'import { todayUtc8 } from "./lib/constants.mjs";',
    'import { addDaysToDate } from "./lib/date-string.mjs";',
    'import { dueDateInDays } from "./lib/review-utils.mjs";',
    'const now = new Date("2026-07-31T23:00:00Z");', // 北京时间 2026-08-01 07:00
    'const beforeBoundary = new Date("2026-07-31T19:30:00Z");', // 北京时间 2026-08-01 03:30
    "console.log(JSON.stringify([",
    "  todayUtc8(now), todayUtc8(beforeBoundary), todayUtc8(beforeBoundary, 4),",
    '  addDaysToDate("2026-12-30", 3), addDaysToDate("2026-03-01", -1),',
    "  dueDateInDays(3, now),",
    "]));",
  ].join("\n");
  const run = (tz) => {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, TZ: tz },
    });
    assert.equal(result.status, 0, `TZ=${tz} 子进程失败：${result.stderr}`);
    return JSON.parse(result.stdout.trim());
  };
  const shanghai = run("Asia/Shanghai");
  assert.deepEqual(shanghai, ["2026-08-01", "2026-08-01", "2026-07-31", "2027-01-02", "2026-02-28", "2026-08-04"]);
  // 迁移前这几项在 UTC / 纽约下会各差一天。
  assert.deepEqual(run("UTC"), shanghai);
  assert.deepEqual(run("America/New_York"), shanghai);
});

// ── 迁移守卫：源码正则，不是行为测试。防止回退到本地时区口径或再复制一份日期校验。 ──

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("[迁移守卫] renderer 与构建脚本不再用 toDateString(new Date()) 表示今天", () => {
  for (const relativePath of ["lib/renderer.mjs", "scripts/generate-data.js"]) {
    const source = readSource(relativePath);
    assert.doesNotMatch(
      source,
      /toDateString\(\s*new Date\(\)\s*\)/,
      `${relativePath} 又出现了本地时区的「今天」；请改用 todayUtc8()`,
    );
  }
  // 构建期的「今天 / 基准日」必须来自单一构建时钟。
  const generator = readSource("scripts/generate-data.js");
  assert.match(generator, /const BUILD_CLOCK = process\.env\.SOURCE_DATE_EPOCH/);
  assert.match(generator, /todayUtc8\(BUILD_CLOCK\)/);
  assert.doesNotMatch(generator, /toDateString/, "generate-data.js 不应再直接使用本地时区格式化函数");
  // renderer 的到期判定必须走 todayUtc8
  assert.match(readSource("lib/renderer.mjs"), /const today = todayUtc8\(\)/);
});

test("[迁移守卫] 日期校验只有 lib/date-string.mjs 一份实现", () => {
  const importers = [
    "lib/training-schema.mjs",
    "lib/training-interval.mjs",
    "lib/draft-store.mjs",
    "lib/attachment-store.mjs",
    "lib/review-suggestion.mjs",
    "lib/review-utils.mjs",
  ];
  for (const relativePath of importers) {
    assert.match(
      readSource(relativePath),
      /from "\.\/date-string\.mjs"/,
      `${relativePath} 必须从 lib/date-string.mjs 引入日期工具`,
    );
  }
  // 私有实现的特征：正则字面量 + 回读比较。收敛后业务模块里不应再有。
  const readback = /new Date\(`\$\{value\}T00:00:00/;
  for (const relativePath of importers) {
    assert.doesNotMatch(readSource(relativePath), readback, `${relativePath} 又复制了一份 isDateString`);
  }
  // toDateString 仍然存在，但语义已在注释里限定为「本地时区格式化，不得用于判断今天」
  const constants = readSource("lib/constants.mjs");
  assert.match(constants, /export function todayUtc8\(now = new Date\(\), boundaryHour = 0\)/);
  assert.match(constants, /不得用于判断今天/);
  // 反向确认 toDateString 与 todayUtc8 是两个不同口径（同一时刻在负时区会不同）：
  // 这里只断言两者都存在且可调用，避免误删。
  assert.equal(typeof toDateString, "function");
});
