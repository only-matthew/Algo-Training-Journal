import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { publishStatementImages } = require("../scripts/generate-data.js");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

function fixture(bytes = PNG) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "journal-images-"));
  const source = path.join(root, "logs");
  fs.mkdirSync(source, { recursive: true });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fileName = `statement-${sha256}.png`;
  const sourcePath = path.join(source, fileName);
  fs.writeFileSync(sourcePath, bytes);
  const output = path.join(root, "site");
  return {
    root,
    output,
    log: {
      member: "廖夏",
      date: "2026-09-16",
      problemId: "p1",
      problemIndex: 0,
      description: `# Watermelon\n\n看图：![示意](./${fileName})`,
      statementImages: [{ sha256, fileName, bytes: bytes.byteLength, mimeType: "image/png" }],
      statementImagePaths: new Map([[fileName, sourcePath]]),
    },
    fileName,
    sourcePath,
  };
}

test("题面图片按哈希校验后发布，并把正文里的相对文件名改写成站点地址", () => {
  const { root, output, log, fileName } = fixture();
  try {
    const description = publishStatementImages(log, output);
    const url = `/problem/${encodeURIComponent("廖夏")}/2026-09-16/p1/${fileName}`;
    // 仓库里保留相对路径（GitHub 能直接渲染），站点数据里换成绝对地址。
    assert.equal(description, `# Watermelon\n\n看图：![示意](${url})`);
    assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(output, "problem", "廖夏", "2026-09-16", "p1", fileName))), PNG);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("图片字节与记录不符、或引用了没归档的文件名时构建直接失败", () => {
  const { root, output, log, sourcePath } = fixture();
  try {
    fs.writeFileSync(sourcePath, new Uint8Array([1, 2, 3]));
    assert.throws(() => publishStatementImages(log, output), /题面图片校验失败/);

    fs.rmSync(sourcePath);
    assert.throws(() => publishStatementImages(log, output), /缺少题面图片/);

    // 正文引用了 statement-<sha>.<ext>，但记录里没有归档清单：不能悄悄发布坏链接。
    const dangling = { ...log, statementImages: [], statementImagePaths: new Map() };
    assert.throws(() => publishStatementImages(dangling, output), /题面图片未归档/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("没有图片的记录原样返回描述", () => {
  const { root, output, log } = fixture();
  try {
    const plain = { ...log, description: "只有文字", statementImages: undefined, statementImagePaths: undefined };
    assert.equal(publishStatementImages(plain, output), "只有文字");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("手工补的裸文件名引用同样会被改写成站点地址", () => {
  const { root, output, log, fileName } = fixture();
  try {
    const bare = { ...log, description: `![示意](${fileName})` };
    const url = `/problem/${encodeURIComponent("廖夏")}/2026-09-16/p1/${fileName}`;
    assert.equal(publishStatementImages(bare, output), `![示意](${url})`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
