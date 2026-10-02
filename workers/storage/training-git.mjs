import { REPO, BRANCH, GH_TIMEOUT_MS, ghHeaders, gh } from "./github-api.mjs";
import { mapConcurrent } from "../services/map-concurrent.mjs";

// 返回原始字节；题面 PDF 附件不能经过文本解码。
// 题面 PDF 附件必须走这条路径：文本解码会破坏二进制内容。
async function githubContentBytesAt(token, path, ref) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`, { headers: ghHeaders(token), signal: AbortSignal.timeout(GH_TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) throw Object.assign(new Error("GitHub content read failed"), { code: "UPSTREAM_UNAVAILABLE", status: 502 });
  const body = await response.json();
  if (Array.isArray(body) || typeof body?.content !== "string") throw Object.assign(new Error("GitHub content response was invalid"), { code: "UPSTREAM_UNAVAILABLE", status: 502 });
  return Uint8Array.from(atob(body.content.replace(/\s/g, "")), (char) => char.charCodeAt(0));
}

export function trainingGit(token) {
  const treeCache = new Map();
  const fileCache = new Map();
  const readBytes = (head, path) => {
    const key = `${head}:${path}`;
    if (!fileCache.has(key)) fileCache.set(key, githubContentBytesAt(token, path, head));
    return fileCache.get(key);
  };
  const readFile = (head, path) => readBytes(head, path).then((bytes) => (bytes === null ? null : new TextDecoder().decode(bytes)));
  // 目录树按 head 缓存一次；版本指纹直接使用 tree 提供的 blob SHA。
  const tree = async (snapshot) => {
    if (!treeCache.has(snapshot.head)) treeCache.set(snapshot.head, gh(`/git/trees/${snapshot.head}?recursive=1`, token).then((result) => {
      if (result.truncated) throw Object.assign(new Error("Repository index is too large"), { code: "INDEX_STALE", status: 503 });
      return result.tree || [];
    }));
    return treeCache.get(snapshot.head);
  };
  const listFiles = async (snapshot, prefix) => {
    const entries = await tree(snapshot);
    return entries.filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix)).map((entry) => entry.path);
  };
  // logs-v2 的日期版本需要对目录内每个文件取 Git blob SHA 才能构造内容指纹，
  // 因此比 listFiles 多返回一层 { path, sha }。
  const listFileEntries = async (snapshot, prefix) => {
    const entries = await tree(snapshot);
    return entries.filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix))
      .map(({ path, sha }) => ({ path, sha }));
  };
  return {
    async getHead() {
      const ref = await gh(`/git/ref/heads/${BRANCH}`, token);
      return ref.object.sha;
    },
    readFile,
    readBytes,
    listFiles,
    listFileEntries,
    async commit({ head, changes, message }) {
      const parent = await gh(`/git/commits/${head}`, token);
      const putFile = async (path, bytes, encoding = "utf-8") => {
        // 二进制附件由调用方预先 base64 编码；文本仍然按 utf-8 提交。
        const blob = await gh("/git/blobs", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: bytes, encoding }) });
        return { path, mode: "100644", type: "blob", sha: blob.sha };
      };
      const entries = await mapConcurrent(changes, 4, async (change) => {
        // 删除用 null blob sha 表达，tree API 会移除该路径。
        if (change.delete) return { path: change.path, mode: "100644", type: "blob", sha: null };
        return change.encoding === "base64" ? putFile(change.path, change.content, "base64") : putFile(change.path, change.content);
      });
      const treeResult = await gh("/git/trees", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }) });
      const commit = await gh("/git/commits", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, tree: treeResult.sha, parents: [head] }) });
      const current = await gh(`/git/ref/heads/${BRANCH}`, token);
      if (current.object.sha !== head) throw Object.assign(new Error("Git reference changed"), { code: "REF_CONFLICT", status: 409 });
      const response = await fetch(`https://api.github.com/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: "PATCH", headers: { ...ghHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify({ sha: commit.sha, force: false }), signal: AbortSignal.timeout(GH_TIMEOUT_MS) });
      if (response.status === 422 || response.status === 409) throw Object.assign(new Error("Git reference changed"), { code: "REF_CONFLICT", status: 409 });
      if (!response.ok) throw Object.assign(new Error("GitHub reference update failed"), { code: "UPSTREAM_UNAVAILABLE", status: 502 });
      return { commitSha: commit.sha };
    },
    async listEvents(snapshot, memberId, subjectKey) {
      const prefix = `training/members/${memberId}/events/`;
      const paths = (await listFiles(snapshot, prefix)).filter((path) => path.endsWith(".json"));
      const events = await mapConcurrent(paths, 4, async (path) => JSON.parse(await readFile(snapshot.head, path)));
      const owned = events.filter((event) => event && event.memberId === memberId);
      if (!subjectKey) return owned;
      const attemptIds = new Set(owned.filter((event) => event.type === "attempt.recorded" && event.subjectKey === subjectKey).map((event) => event.id));
      return owned.filter((event) => event.subjectKey === subjectKey || attemptIds.has(event.targetAttemptId));
    },
    async listDocuments(snapshot, memberId, directory, suffix = ".json") {
      const prefix = `training/members/${memberId}/${directory}/`;
      const paths = (await listFiles(snapshot, prefix)).filter((path) => path.endsWith(suffix));
      return mapConcurrent(paths, 4, async (path) => ({ path, data: JSON.parse(await readFile(snapshot.head, path)) }));
    },
  };
}
