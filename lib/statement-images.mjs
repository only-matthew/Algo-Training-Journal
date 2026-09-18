// 题面图片归档的共享约定。
//
// 洛谷与 Codeforces 的题面图片都托管在各自的 CDN 上（cdn.luogu.com.cn、
// espresso.codeforces.com 等），而站点 CSP 是 `img-src 'self' https://avatars.githubusercontent.com data:`：
// 任何外来图片域在站内都加载不出来（抓取时仍会按来源站补 referer，但这不是本站能显示的关键）。
// 因此抓取题面时把图片一并下载，正文改写成仓库内的显式相对路径 `./statement-<sha256>.<ext>`，
// 与题面 PDF 一样随保存上传到仓库、由构建期发布到站点。
//
// 文件名由内容哈希决定：同一张图被多道题引用时自然去重，重复抓取也不会改写文件。

/** 允许归档的图片类型 → 扩展名。只收位图：SVG 能在同源页面里执行脚本，不能收。 */
export const STATEMENT_IMAGE_MIME_EXTENSIONS = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
});

export const STATEMENT_IMAGE_EXTENSION_MIMES = Object.freeze(
  Object.fromEntries(Object.entries(STATEMENT_IMAGE_MIME_EXTENSIONS).map(([mime, extension]) => [extension, mime])),
);

export const STATEMENT_IMAGE_NAME_PATTERN = /^statement-([a-f0-9]{64})\.(png|jpg|gif|webp)$/;

// 与题面 PDF 同一套量级：单张 1 MiB、每题最多 10 张、一次保存新增合计 2 MiB。
export const MAX_STATEMENT_IMAGES = 10;
export const MAX_STATEMENT_IMAGE_BYTES = 1024 * 1024;
export const MAX_NEW_STATEMENT_IMAGE_BYTES = 2 * 1024 * 1024;

/** 内容哈希 + MIME → 仓库文件名；类型不受支持或哈希非法时返回空串。 */
export function statementImageFileName(sha256, mimeType) {
  const extension = STATEMENT_IMAGE_MIME_EXTENSIONS[String(mimeType || "").toLowerCase()];
  return extension && /^[a-f0-9]{64}$/.test(String(sha256 || "")) ? `statement-${sha256}.${extension}` : "";
}

/** 仓库文件名 → { fileName, sha256, extension, mimeType }；不符合约定时返回 null（防目录穿越）。 */
export function parseStatementImageName(value) {
  const match = STATEMENT_IMAGE_NAME_PATTERN.exec(String(value || ""));
  if (!match) return null;
  return { fileName: match[0], sha256: match[1], extension: match[2], mimeType: STATEMENT_IMAGE_EXTENSION_MIMES[match[2]] };
}

/**
 * 按魔数判断图片类型。
 *
 * 洛谷 CDN 对新版图床返回的是 `application/octet-stream`，响应头完全不可信；服务端
 * 校验也一样只认字节，两处必须用同一套判断。
 */
export function sniffStatementImageMime(bytes) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const ascii = (start, length) => String.fromCharCode(...value.subarray(start, start + length));
  if (value.length > 8 && value[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (value.length > 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) return "image/jpeg";
  if (value.length > 6 && ascii(0, 3) === "GIF") return "image/gif";
  if (value.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  return "";
}

/** base64 → Uint8Array。Worker 与浏览器都有 atob，但输入可能来自不可信 JSON，故自校验。 */
export function base64ToBytes(value) {
  const text = String(value || "").replace(/\s+/g, "");
  if (!text || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  const decoded = typeof atob === "function" ? atob(text) : "";
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  if (decoded.length !== (text.length / 4) * 3 - padding) return null;
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes.length ? bytes : null;
}

/** Uint8Array → base64（分块拼接，避免超长参数把调用栈打爆）。 */
export function bytesToBase64(bytes) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < value.length; offset += chunk) {
    binary += String.fromCharCode(...value.subarray(offset, offset + chunk));
  }
  return typeof btoa === "function" ? btoa(binary) : Buffer.from(value).toString("base64");
}
