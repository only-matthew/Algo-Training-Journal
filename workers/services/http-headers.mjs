// 抓取上游题目页时统一使用的浏览器请求头。
//
// codeforces.com 的 Cloudflare 只收到 `Accept` 时会返回 403 挑战页（2026-09-16 边缘实测：
// 补 UA 才是真正的修复），AtCoder 与洛谷同样按 UA 区分流量，因此三条链路共用这一份。
export const BROWSER_HEADERS = Object.freeze({
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
});
