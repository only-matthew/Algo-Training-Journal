// 文档相对链接守卫。
//
// 2026-10-02 审计期间把两份审计签收移进 `docs/Audit/` 时，`docs/HANDOFF.md` 里有 3 处
// 链接随之失效，而没有任何门禁能发现——文档搬家是低频操作，靠人肉检查必然漏。
// 归档目录（`docs/archive/`）按设计保留历史失效链接（见 docs/Audit/PRODUCT-AUDIT.md 的
// C2 条），因此跳过；正文里作为语法示例出现的 `![](url)` / `[...](...)` 也不是链接。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SKIP_DIRECTORIES = new Set(["node_modules", "oi-wiki", ".git", "site", "artifacts", "build", "test-results", ".build-cache", ".wrangler", "vendor"]);

function markdownFiles(directory, result = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      markdownFiles(join(directory, entry.name), result);
    } else if (entry.name.endsWith(".md")) {
      result.push(join(directory, entry.name));
    }
  }
  return result;
}

test("非归档文档里的相对链接都指向存在的文件", () => {
  const broken = [];
  let checked = 0;
  for (const file of markdownFiles(ROOT)) {
    const relative = file.slice(ROOT.length + 1).replace(/\\/g, "/");
    if (relative.startsWith("docs/archive/")) continue;
    for (const match of readFileSync(file, "utf8").matchAll(/\]\(([^)\s]+)\)/g)) {
      const raw = match[1];
      if (/^(https?:|mailto:|#)/.test(raw)) continue;
      // `![](url)` 与 `[...](...)` 是文档里讲链接口径时的语法示例，不是真链接。
      if (raw === "url" || raw.includes("...")) continue;
      const target = raw.split("#")[0];
      if (!target) continue;
      checked += 1;
      if (!existsSync(resolve(dirname(file), decodeURIComponent(target)))) broken.push(`${relative} -> ${raw}`);
    }
  }
  // 防止检查逻辑本身失效（例如扫描目录变更后一条都没扫到）。
  assert.ok(checked > 50, `扫描到的相对链接过少（${checked} 条），检查逻辑可能已失效`);
  assert.deepEqual(broken, [], `存在失效的相对链接：\n${broken.join("\n")}`);
});
