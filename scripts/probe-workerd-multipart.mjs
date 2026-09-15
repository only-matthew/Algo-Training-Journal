// 跨运行时探针：wc 的 multipart 解析与 crypto.subtle 哈希。
//
// 为什么需要它：test/oauth-logs-v2.test.mjs 是用 Node 的 Request 直接调 worker.fetch，
// 走的是 undici 的 multipart 实现，**不是** Cloudflare 的 workerd。上传 PDF 这条链路
// 依赖两个只有真实运行时才能证明的假设：
//   1. workerd 能正确解析浏览器 FormData 生成的分区（含 CJK 文件名与二进制字节）；
//   2. workerd 的 crypto.subtle.digest("SHA-256") 与客户端算出的哈希完全一致
//      —— 两边不一致，服务端就会把正常上传判成哈希不匹配。
//
// 这里用一个最小探针 Worker 在本地 workerd 上跑一遍（wrangler dev 用的就是生产同款运行时）。
// 需要本机可用的 wrangler dev；不放进 npm test，因为要起本地服务。
//
// 用法：node scripts/probe-workerd-multipart.mjs [--keep]
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORK = join(ROOT, "build", "workerd-multipart-probe");
const PORT = Number(process.env.PROBE_PORT || 8799);
const BASE = `http://127.0.0.1:${PORT}`;

const PROBE_WORKER = `export default {
  async fetch(request) {
    const form = await request.formData();
    const payload = JSON.parse(String(form.get("payload") ?? "null"));
    const part = form.get("pdf-smoke");
    const bytes = new Uint8Array(await part.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return Response.json({
      partNames: [...form.keys()],
      payloadOperationId: payload?.operationId,
      payloadExpectedVersion: payload?.expectedVersion,
      payloadAction: payload?.attachmentChanges?.[0]?.action,
      fileName: part.name, fileType: part.type, fileSize: part.size, byteLength: bytes.byteLength,
      magic: new TextDecoder().decode(bytes.slice(0, 5)),
      sha256,
      idempotencyKey: request.headers.get("idempotency-key"),
    });
  },
};
`;

mkdirSync(WORK, { recursive: true });
writeFileSync(join(WORK, "worker.mjs"), PROBE_WORKER, "utf8");
writeFileSync(join(WORK, "wrangler.toml"),
  `name = "workerd-multipart-probe"\nmain = "worker.mjs"\ncompatibility_date = "2026-07-25"\n`, "utf8");

const server = spawn(process.execPath, [
  join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js"),
  "dev", "--config", join(WORK, "wrangler.toml"),
  "--port", String(PORT), "--ip", "127.0.0.1",
], { cwd: ROOT, stdio: "ignore" });

let passed = 0;
let total = 0;
const check = (label, ok) => { total += 1; if (ok) passed += 1; console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); };

try {
  // 用 HTTP 轮询就绪，不读子进程输出（沙箱/CI 下管道并不可靠）。
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try { await fetch(BASE + "/", { method: "GET" }); ready = true; } catch { /* 还没起来 */ }
  }
  if (!ready) throw new Error(`wrangler dev 未在 ${BASE} 就绪`);

  const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n", "utf8");
  const operationId = randomUUID();
  const form = new FormData();
  form.set("payload", JSON.stringify({
    operationId, expectedVersion: null,
    log: { schemaVersion: 4, problems: [{ id: "p1", name: "Loop" }] },
    attachmentChanges: [{ recordId: "p1", action: "replace", partName: "pdf-smoke" }],
  }));
  form.set("pdf-smoke", new File([pdf], "题面.pdf", { type: "application/pdf" }));

  const response = await fetch(BASE + "/", { method: "PUT", headers: { "Idempotency-Key": operationId }, body: form });
  const got = await response.json();

  check("probe responds 200", response.status === 200);
  check("exactly the payload and PDF parts arrive",
    JSON.stringify(got.partNames) === JSON.stringify(["payload", "pdf-smoke"]));
  check("payload JSON survives the round trip", got.payloadOperationId === operationId);
  check("expectedVersion: null is preserved (not dropped)", got.payloadExpectedVersion === null);
  check("attachment action survives", got.payloadAction === "replace");
  check("CJK file name survives", got.fileName === "题面.pdf");
  check("file part type preserved", got.fileType === "application/pdf");
  check("byte length matches exactly", got.byteLength === pdf.byteLength && got.fileSize === pdf.byteLength);
  check("PDF magic bytes intact", got.magic === "%PDF-");
  check("workerd sha256 equals the client's sha256",
    got.sha256 === createHash("sha256").update(pdf).digest("hex"));
  check("Idempotency-Key header is visible to the handler", got.idempotencyKey === operationId);

  console.log(`\n${passed}/${total} passed`);
  if (passed !== total) process.exitCode = 1;
} catch (error) {
  console.error(`probe failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  server.kill();
  // 等 workerd 真正退出再删目录：它退出前仍占着 .wrangler 状态文件，
  // 立刻 rmSync 会 EPERM。清理只是顺手，失败不算探针失败。
  await new Promise((resolve) => {
    if (server.exitCode !== null || server.signalCode !== null) return resolve();
    server.once("exit", resolve);
    setTimeout(resolve, 5000);
  });
  if (process.argv.includes("--keep")) {
    console.log(`probe config kept at ${WORK}`);
  } else {
    try { rmSync(WORK, { recursive: true, force: true }); }
    catch { console.log(`（未能立即清理 ${WORK}，workerd 仍占用；该目录已被 .gitignore 忽略）`); }
  }
}
