import { validatePersonalList } from "../../lib/personal-list.mjs";
import { BRANCH, REPO, GH_TIMEOUT_MS, ghHeaders } from "../storage/github-api.mjs";

function urlFor(user) {
  return `https://api.github.com/repos/${REPO}/contents/${encodeURI(`logs/${user.member}/my-list.json`)}`;
}

export async function readPersonalList(user) {
  const response = await fetch(`${urlFor(user)}?ref=${encodeURIComponent(BRANCH)}`, { headers: ghHeaders(user.token), signal: AbortSignal.timeout(GH_TIMEOUT_MS) });
  if (response.status === 404) return { items: [], revision: null };
  if (!response.ok) throw Object.assign(new Error("读取个人清单失败"), { status: 502 });
  const file = await response.json();
  if (typeof file.sha !== "string" || typeof file.content !== "string") throw Object.assign(new Error("个人清单格式无效"), { status: 502 });
  const json = atob(file.content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(json, (char) => char.charCodeAt(0));
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  return { items: validatePersonalList(parsed.items), revision: file.sha };
}

export async function savePersonalList(user, items, expectedRevision) {
  if (expectedRevision !== null && typeof expectedRevision !== "string") throw Object.assign(new Error("缺少清单版本"), { status: 428 });
  let normalized;
  try { normalized = validatePersonalList(items); }
  catch (error) { throw Object.assign(error, { status: 400 }); }
  const current = await readPersonalList(user);
  if (current.revision !== expectedRevision) throw Object.assign(new Error("清单已在别处修改，请刷新后重试"), { status: 409 });
  const bytes = new TextEncoder().encode(`${JSON.stringify({ schemaVersion: 1, items: normalized }, null, 2)}\n`);
  const content = btoa(String.fromCharCode(...bytes));
  const response = await fetch(urlFor(user), {
    method: "PUT",
    headers: { ...ghHeaders(user.token), "Content-Type": "application/json" },
    body: JSON.stringify({ message: `Update personal training list for ${user.member}`, content, branch: BRANCH, ...(current.revision ? { sha: current.revision } : {}) }),
    signal: AbortSignal.timeout(GH_TIMEOUT_MS),
  });
  if (response.status === 409 || response.status === 422) throw Object.assign(new Error("清单写入冲突，请刷新后重试"), { status: 409 });
  if (!response.ok) throw Object.assign(new Error("保存个人清单失败"), { status: 502 });
  const saved = await response.json();
  return { items: normalized, revision: saved.content?.sha || null };
}
