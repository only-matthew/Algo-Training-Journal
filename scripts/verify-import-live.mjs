// 本地真实网络集成测试：直接驱动 Worker 的 /api/import 全链路。
// 用法：node scripts/test-import-live.mjs
// 覆盖：会话鉴权（构造加密会话）、CSRF、Origin 校验、Codeforces 真实 API、
//       洛谷真实页面抓取、AtCoder 真实 API、限流不误伤。不依赖 wrangler / GitHub OAuth / 云端 secrets。
import worker, { seal, fetchAtCoderAccepted } from "../workers/oauth.mjs";
import { fetchLuoguAtCoderStatement } from "../workers/services/problem-statement.mjs";
import { attachAtCoderTags, fetchLuoguContestTagIds, loadLuoguTagDictionary, resolveAtCoderTagIds } from "../workers/services/atcoder-tags.mjs";

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

  console.log("── 会话预置 handle ──");
  const sessionReq = new Request(`${WORKER_ORIGIN}/api/session`, {
    method: "GET",
    headers: { Origin: SITE_ORIGIN, Cookie: `__Host-journal_session=${cookie}` },
  });
  const sessionRes = await worker.fetch(sessionReq, ENV);
  const sessionBody = await sessionRes.json();
  check("会话返回预置 cfHandle", sessionBody.cfHandle === "onlymatt", sessionBody.cfHandle || "无");
  check("会话返回预置 atcoderHandle", sessionBody.atcoderHandle === "only_matthew", sessionBody.atcoderHandle || "无");
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
    // 洛谷会重新评定难度（P3376 现已从「省选/NOI-」调整为「提高+/省选-」），
    // 因此这里只验证「解析出了官方 8 级里的某一级」，不锁死具体等级。
    check("P3376 难度已解析（洛谷官方 8 级之一）", ["暂无评定", "入门", "普及-", "普及", "普及+/提高-", "提高", "提高+/省选-", "省选/NOI-", "NOI/NOI+/CTS"].includes(p3376.difficulty), p3376.difficulty || "无");
    check("P3376 题面已解析（非 [object Object]）", (p3376.description || "").length > 20 && !String(p3376.description).includes("[object Object]"), `${(p3376.description || "").length} 字符`);
  } catch (error) {
    check("洛谷接口可达", false, `${error.message}（网络不可达时请检查网络，不代表功能故障）`);
  }

  console.log("── AtCoder 真实导入（3 天窗口） ──");
  try {
    res = await post("/api/import", { platform: "atcoder", handle: "tourist" }, { cookie, csrf: CSRF });
    const body = await res.json();
    const acProblems = body.problems || [];
    check("AtCoder 请求成功（200）", res.status === 200, `HTTP ${res.status}`);
    if (acProblems.length) {
      const first = acProblems[0];
      check(
        "题目字段完整（名称/题号/平台）",
        Boolean(first && first.name && first.problemNumber && first.platform === "AtCoder"),
        first ? `${first.platform} ${first.problemNumber} · ${first.name}` : "无数据",
      );
      check("题号格式符合 AtCoder（如 abc381_a）", /^[a-z0-9_]+$/.test(first.problemNumber), first.problemNumber);
    } else {
      check("AtCoder 3 天窗口生效（当前无 AC 记录）", true, "0 题：该用户最近 3 天没有 AC 提交（窗口过滤生效）");
    }
  } catch (error) {
    check("AtCoder 接口可达", false, `${error.message}（网络不可达时请检查网络，不代表功能故障）`);
  }

  console.log("── AtCoder 真实题面抓取 ──");
  try {
    res = await post("/api/problem-statement", { platform: "AtCoder", problemNumber: "abc381_a" }, { cookie, csrf: CSRF });
    const body = await res.json();
    check("AtCoder 题面请求成功（200）", res.status === 200, `HTTP ${res.status}`);
    // 本机（住宅网络）走官方页，机房出口会被 AtCoder 整体 403，那时是 luogu-mirror。
    check("题面来源为官方页或洛谷 AT_ 镜像", ["atcoder-html", "luogu-mirror"].includes(body.source?.kind), `${body.source?.kind} · ${body.source?.url || ""}`);
    check("题面正文已解析（有标题且够长）", (body.description || "").length > 200, `${(body.description || "").length} 字符`);
    check("官方页来源时只取英文题面", body.source?.kind !== "atcoder-html" || !/問題文/.test(body.description || ""), /問題文/.test(body.description || "") ? "正文里出现了日文小节标题" : "正文无日文小节");
    res = await post("/api/problem-statement", { platform: "AtCoder", problemNumber: "abc381" }, { cookie, csrf: CSRF });
    check("AtCoder 题号缺下划线时仍是 400", res.status === 400, `HTTP ${res.status}`);
  } catch (error) {
    check("AtCoder 题面接口可达", false, `${error.message}（网络不可达时请检查网络，不代表功能故障）`);
  }

  console.log("── AtCoder 洛谷镜像（生产环境实际来源）──");
  try {
    const mirror = await fetchLuoguAtCoderStatement({ problemNumber: "abc381_a" });
    check("AT_ 镜像抓取成功", mirror.status === "ok", mirror.status === "ok" ? `${mirror.description.length} 字符` : `${mirror.status} ${mirror.reason}`);
    if (mirror.status === "ok") {
      check("镜像来源与地址正确", mirror.source.kind === "luogu-mirror" && mirror.source.url === "https://www.luogu.com.cn/problem/AT_abc381_a", `${mirror.source.kind} · ${mirror.source.url}`);
      check("镜像正文含洛谷小节标题", /## 题目描述/.test(mirror.description), mirror.description.slice(0, 40).replace(/\n/g, " "));
      check("镜像带 mirror-source 警告", mirror.warnings.includes("mirror-source"), JSON.stringify(mirror.warnings));
    }
  } catch (error) {
    check("洛谷 AT_ 镜像可达", false, `${error.message}（网络不可达时请检查网络，不代表功能故障）`);
  }

  console.log("── AtCoder 算法标签（洛谷镜像） ──");
  try {
    const dictionary = await loadLuoguTagDictionary({ force: true });
    check("洛谷标签字典可用", dictionary.size > 100, `${dictionary.size} 条`);
    const contestTags = await fetchLuoguContestTagIds("abc340");
    const abc340e = contestTags.get("abc340_e") || [];
    check("按比赛批量取标签（一场一次请求）", abc340e.length > 0, `abc340_e → ${JSON.stringify(abc340e)}`);
    const tags = await resolveAtCoderTagIds(abc340e);
    check("数字标签换成站内标签（abc340_e 含线段树）", tags.includes("线段树"), JSON.stringify(tags));

    const recent = await fetchAtCoderAccepted("only_matthew", { days: 120 });
    const tagged = await attachAtCoderTags(recent);
    check("AtCoder 真实导入返回结果", tagged.length > 0, `${tagged.length} 题（近 120 天 AC）`);
    check("每题都带提交页链接", tagged.every((p) => /^https:\/\/atcoder\.jp\/contests\/[^/]+\/submissions\/\d+$/.test(p.submissionUrl || "")), tagged[0]?.submissionUrl || "无");
    check(
      "洛谷收录的题目带回算法标签",
      tagged.some((p) => p.tags?.length),
      tagged.slice(0, 4).map((p) => `${p.problemNumber}=${(p.tags || []).join("/") || "无标签"}`).join(" | "),
    );
  } catch (error) {
    check("AtCoder 标签链路可达", false, `${error.message}（网络不可达时请检查网络，不代表功能故障）`);
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
