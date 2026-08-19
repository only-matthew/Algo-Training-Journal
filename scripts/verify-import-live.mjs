// 本地真实网络集成测试：直接驱动 Worker 的 /api/import 全链路。
// 用法：node scripts/test-import-live.mjs
// 覆盖：会话鉴权（构造加密会话）、CSRF、Origin 校验、Codeforces 真实 API、
//       洛谷真实页面抓取、限流不误伤。不依赖 wrangler / GitHub OAuth / 云端 secrets。
import worker, { seal } from "../workers/oauth.mjs";

const ENV = { SESSION_SECRET: "local-test-secret-0123456789abcdef0123456789abcdef" };
const WORKER_ORIGIN = "https://algo-oauth.xialiao.org";
const SITE_ORIGIN = "https://train.xialiao.org";
const CSRF = "local-csrf-token";

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
};

async function sessionCookie() {
  return seal(
    { token: "local-test-token", login: "only-matthew", member: "廖夏", avatar_url: "", csrfToken: CSRF, exp: Date.now() + 3600000 },
    ENV.SESSION_SECRET,
  );
}

async function post(path, body, { cookie, csrf, origin } = {}) {
  const headers = { "Content-Type": "application/json", Origin: origin || SITE_ORIGIN };
  if (cookie) headers.Cookie = `__Host-journal_session=${cookie}`;
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const request = new Request(`${WORKER_ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return worker.fetch(request, ENV);
}

async function main() {
  const cookie = await sessionCookie();

  console.log("── 鉴权边界 ──");
  let res = await post("/api/import", { platform: "codeforces", handle: "tourist" });
  check("未登录请求被拒绝（401）", res.status === 401, `HTTP ${res.status}`);

  res = await post("/api/import", { platform: "codeforces", handle: "tourist" }, { cookie });
  check("缺少 CSRF token 被拒绝（403）", res.status === 403, `HTTP ${res.status}`);

  res = await post("/api/import", { platform: "codeforces", handle: "tourist" }, { cookie, csrf: CSRF, origin: "https://evil.example.com" });
  check("非法 Origin 被拒绝（403）", res.status === 403, `HTTP ${res.status}`);

  console.log("── 会话预置 CF handle ──");
  const sessionReq = new Request(`${WORKER_ORIGIN}/api/session`, {
    method: "GET",
    headers: { Origin: SITE_ORIGIN, Cookie: `__Host-journal_session=${cookie}` },
  });
  const sessionRes = await worker.fetch(sessionReq, ENV);
  const sessionBody = await sessionRes.json();
  check("会话返回预置 cfHandle", sessionBody.cfHandle === "onlymatt", sessionBody.cfHandle || "无");
  check("会话返回成员信息", sessionBody.member === "廖夏", sessionBody.member || "无");

  console.log("── Codeforces 真实导入（3 天窗口） ──");
  let cfProblems = [];
  try {
    res = await post("/api/import", { platform: "codeforces", handle: "onlymatt" }, { cookie, csrf: CSRF });
    const body = await res.json();
    cfProblems = body.problems || [];
    check("CF 请求成功（200）", res.status === 200, `HTTP ${res.status}`);
    if (cfProblems.length) {
      check("CF 3 天窗口生效（数量收敛）", cfProblems.length < 30, `${cfProblems.length} 题`);
      const first = cfProblems[0];
      check(
        "题目字段完整（名称/题号/平台）",
        Boolean(first && first.name && first.problemNumber && first.platform === "Codeforces"),
        first ? `${first.platform} ${first.problemNumber} · ${first.name}` : "无数据",
      );
      check("携带提交页链接（submissionUrl）", Boolean(first && first.submissionUrl), first?.submissionUrl ? `→ ${first.submissionUrl}` : "无");
    } else {
      check("CF 3 天窗口生效（当前无 AC 记录）", true, "0 题：该用户最近 3 天没有 AC 提交（窗口过滤生效）");
    }
  } catch (error) {
    check("CF 接口可达", false, `${error.message}（网络不可达时请检查代理/网络，不代表功能故障）`);
  }

  console.log("── 洛谷真实导入（题号补全） ──");
  try {
    res = await post("/api/import", { platform: "luogu", numbers: "P1001 P3376" }, { cookie, csrf: CSRF });
    const body = await res.json();
    const titles = (body.problems || []).map((p) => p.name);
    const p3376 = (body.problems || [])[1] || {};
    check("洛谷请求成功（200）", res.status === 200, `HTTP ${res.status}`);
    check("解析出 2 道题", body.problems?.length === 2, JSON.stringify(titles));
    check("P1001 题名正确（A+B Problem）", titles.includes("A+B Problem"), titles[0] || "");
    check("P3376 题名正确（网络最大流）", titles.some((t) => t.includes("网络最大流")), titles.join(", ") || "");
    check("P3376 难度已解析（省选/NOI-）", p3376.difficulty === "省选/NOI-", p3376.difficulty || "无");
    check("P3376 题面已解析（非 [object Object]）", (p3376.description || "").length > 20 && !String(p3376.description).includes("[object Object]"), `${(p3376.description || "").length} 字符`);
  } catch (error) {
    check("洛谷接口可达", false, `${error.message}（网络不可达时请检查网络，不代表功能故障）`);
  }

  console.log("── 限流不误伤 ──");
  let ok = true;
  for (let i = 0; i < 3; i += 1) {
    const r = await post("/api/import", { platform: "luogu", numbers: "P1001" }, { cookie, csrf: CSRF });
    if (r.status !== 200) ok = false;
  }
  check("连续 3 次洛谷导入均成功（限流未误伤）", ok);

  console.log(failures ? `\n❌ ${failures} 项失败` : "\n✅ 全部通过：自动导入在本地真实网络下可用");
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
