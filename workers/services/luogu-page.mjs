// 洛谷页面抓取的共用底座：C3VK 挑战握手、限额读取与挑战页判定。
//
// 题面抓取（problem-statement.mjs）与 AtCoder 标签抓取（atcoder-tags.mjs）都走这一套，
// 保证两条链路的请求头、超时语义与降级判定一致——洛谷对匿名请求会先下发 C3VK 挑战
// cookie（302 回跳同 URL），带 cookie 再请求一次才拿到页面。
export const LUOGU_ORIGIN = "https://www.luogu.com.cn";
export const MAX_HTML_BYTES = 2 * 1024 * 1024;
export const fail = (message) => { throw new Error(message); };
export const isChallengePage = (html) => /captcha|challenge|access denied|cloudflare|just a moment/i.test(html);

export function setCookies(response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const raw = list.length ? list : [response.headers.get("set-cookie")].filter(Boolean);
  return raw.flatMap((value) => String(value).split(/,(?=[^;,=]+=)/)).map((value) => value.split(";")[0].trim()).filter(Boolean);
}

export async function readLimitedBody(response, signal, maxBytes = MAX_HTML_BYTES) {
  if (Number(response.headers.get("Content-Length") || 0) > maxBytes) fail("too-large");
  if (!response.body?.getReader) { const value = await response.text(); if (new TextEncoder().encode(value).byteLength > maxBytes) fail("too-large"); return value; }
  const reader = response.body.getReader(); const chunks = []; let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) fail("timeout");
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); fail("too-large"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

/** 洛谷页面 → C3VK 挑战 cookie 握手后的响应。 */
export async function requestLuoguPage(url, { fetchImpl, controller, headers }) {
  const send = (extra = {}) => fetchImpl(url, { redirect: "manual", signal: controller.signal, headers: { ...headers, ...extra } });
  let response; try { response = await send(); } catch (error) { return { error }; }
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    // 挑战 cookie 可能挂在这次 302 上，也可能要再请求一次才下发。
    let cookies = setCookies(response);
    if (!cookies.length) { try { cookies = setCookies(await send()); } catch { cookies = []; } }
    if (!cookies.length) return { blocked: true };
    try { response = await send({ Cookie: cookies.join("; ") }); } catch (error) { return { error }; }
    if ([301, 302, 303, 307, 308].includes(response.status)) return { blocked: true };
  }
  return { response };
}
