import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("../workers/build-commit.mjs", import.meta.url));
const sha = process.env.WORKERS_CI_COMMIT_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error("Worker deployment needs a 40-character Git commit SHA");
writeFileSync(target, `// Generated for this Worker deployment.\nexport const BUILD_COMMIT = ${JSON.stringify(sha.toLowerCase())};\n`);
console.log(`Stamping Worker build from ${sha.slice(0, 7)}`);
