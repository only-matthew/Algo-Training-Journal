// 并行跑 verify 的三个独立阶段：静态检查（syntax+lint+reindex）、测试、构建。
// CI 用 `npm run verify:parallel` 缩短门禁时间；本地仍可用 `npm run verify` 串行跑，
// 输出顺序更易读。三个阶段互不依赖，也不共享写入目标（测试写 artifacts/，构建写 site/）。
import { spawn } from "node:child_process";

const groups = [
  ["static", "npm run check:syntax && npm run check:lint && npm run training:reindex -- --check"],
  ["tests", "npm test"],
  ["build", "npm run build"],
];

function runGroup(label, command) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: "inherit" });
    child.on("error", (error) => {
      console.error(`[verify:parallel] ${label} 启动失败：${error.message}`);
      resolve({ label, code: 1 });
    });
    child.on("exit", (code, signal) => {
      resolve({ label, code: code ?? (signal ? 1 : 0) });
    });
  });
}

const results = await Promise.all(groups.map(([label, command]) => runGroup(label, command)));
const failed = results.filter((result) => result.code !== 0);
if (failed.length) {
  console.error(`[verify:parallel] 失败：${failed.map((result) => result.label).join("、")}`);
  process.exitCode = 1;
} else {
  console.log("[verify:parallel] 全部通过（static / tests / build 并行）。");
}
