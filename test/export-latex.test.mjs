// LaTeX / Markdown 导出的回归测试。
//
// 这个文件替代了旧的 test-latex.mjs：旧文件把生成逻辑复制了一份，导致
// lib/renderer.mjs 里的真实逻辑改坏了测试也发现不了。现在直接 import
// lib/export-content.mjs，并用仓库里的真实训练日志真编译一遍。
//
// 历史故障（都有对应断言）：
//   1. 题名里的 # 未转义 → "Illegal parameter number in definition of \@title"，编译直接失败；
//   2. 缺 amsmath → \boxed / \text{...} / cases 报 Undefined control sequence；
//   3. 代码块里的中文注释在 pdfLaTeX 下触发 \lst@EC 解析错误（"代码里的注释会爆掉"）；
//   4. 行内公式正则要求至少两个字符 → $n$ 被输出成字面量 \$n\$；
//   5. 正文里的 ≤ ≥ × 在默认字体里缺字形，被静默丢弃。
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  buildBatchLatexDocument, buildMDContent, buildSingleLatexDocument,
  escapeLatexText, safeFilename,
} from "../lib/export-content.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const WORK = join(ROOT, "build", "latex-test");

/* ------------------------------ 真实数据 ------------------------------ */

function subdirectories(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

// 从受版本控制的 logs/ 读取真实日志；不依赖生成物 site/，所以全新 clone 也能跑
function loadRepoLogs() {
  const logs = [];
  for (const member of subdirectories(join(ROOT, "logs"))) {
    const memberRoot = join(ROOT, "logs", member);
    for (const year of subdirectories(memberRoot)) {
      for (const month of subdirectories(join(memberRoot, year))) {
        for (const day of subdirectories(join(memberRoot, year, month))) {
          const dateDir = join(memberRoot, year, month, day);
          const metaPath = join(dateDir, "meta.json");
          if (!existsSync(metaPath)) continue;
          const meta = JSON.parse(readFileSync(metaPath, "utf8"));
          (meta.problems || []).forEach((problem, index) => {
            const read = (suffix) => {
              const file = join(dateDir, `${index}-${suffix}`);
              return existsSync(file) ? readFileSync(file, "utf8") : "";
            };
            logs.push({
              member,
              date: `${year}-${month}-${day}`,
              problem: problem.name || "",
              platform: problem.platform || "",
              difficulty: problem.difficulty || "",
              problemNumber: problem.problemNumber || "",
              tags: problem.tags || [],
              reviewStatus: problem.reviewStatus || "none",
              description: read("desc.md"),
              takeaway: read("takeaway.md"),
              code: read("solution.cpp"),
            });
          });
        }
      }
    }
  }
  return logs;
}

const REPO_LOGS = loadRepoLogs();

/* ------------------------------ 编译工具 ------------------------------ */

// 沙箱下不能用管道捕获子进程输出，所以一律 stdio: "ignore"，
// 结果只从 TeX 自己写的 .log 文件里读。
function findEngine(name) {
  const probe = spawnSync(name, ["--version"], { stdio: "ignore" });
  return probe.error || probe.status !== 0 ? null : name;
}

const XELATEX = findEngine("xelatex");
const PDFLATEX = findEngine("pdflatex");

if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

let caseCounter = 0;

function compile(engine, tex, label, extraArgs = []) {
  const job = `case-${caseCounter++}`;
  writeFileSync(join(WORK, `${job}.tex`), `% ${label}\n${tex}`, "utf8");
  const result = spawnSync(
    engine,
    ["-interaction=nonstopmode", ...extraArgs, `${job}.tex`],
    { cwd: WORK, stdio: "ignore" },
  );
  const logPath = join(WORK, `${job}.log`);
  const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  return {
    status: result.status,
    log,
    pdf: join(WORK, `${job}.pdf`),
    errors: (log.match(/^! .*$/gm) || []),
    overfull: (log.match(/^Overfull \\hbox/gm) || []).length,
    missingCharacters: (log.match(/^Missing character/gm) || []).length,
  };
}

function assertClean(result, engine, label) {
  assert.equal(
    result.log.includes("Fatal error occurred"), false,
    `${label} [${engine}] 编译致命失败：${result.errors.slice(0, 3).join(" / ")}`,
  );
  assert.deepEqual(
    result.errors, [],
    `${label} [${engine}] 出现 LaTeX 错误：${result.errors.slice(0, 3).join(" / ")}`,
  );
}

/* ------------------------------ 纯文本断言 ------------------------------ */

test("文本转义覆盖所有会破坏 LaTeX 的字符", () => {
  assert.equal(
    escapeLatexText(String.raw`a_b 100% & c#d {e} $f$ ~g^h <i> |j| \k`),
    String.raw`a\_b 100\% \& c\#d \{e\} \$f\$ \textasciitilde{}g\textasciicircum{}h \textless{}i\textgreater{} \textbar{}j\textbar{} \textbackslash{}k`,
  );
});

test("Unicode 数学符号换成 LaTeX 命令，不再被静默丢字形", () => {
  assert.equal(escapeLatexText("x ≤ 2 且 y ≥ 3"), "x $\\le$ 2 且 y $\\ge$ 3");
  assert.equal(escapeLatexText("a × b ÷ c ≠ d ∞"), "a $\\times$ b $\\div$ c $\\ne$ d $\\infty$");
});

test("题名里的 # / _ / & 不会写坏 \\title 与 \\section", () => {
  const tex = buildSingleLatexDocument({
    problem: "P2036 [COCI 2008/2009 #2] PERKET_a & b",
    player: "x",
  });
  assert.match(tex, /\\title\{P2036 \[COCI 2008\/2009 \\#2\] PERKET\\_a \\& b\}/);
  assert.match(tex, /\\section\{P2036 \[COCI 2008\/2009 \\#2\] PERKET\\_a \\& b\}/);
  assert.doesNotMatch(tex, /&amp;|&lt;|&gt;|&quot;/);
});

test("前导 [ 的题名仍然加 {} 保护", () => {
  const tex = buildSingleLatexDocument({ problem: "[NOIP 2008 提高组] 火柴棒等式" });
  assert.match(tex, /\\section\{\{\}\[NOIP 2008 提高组\] 火柴棒等式\}/);
});

test("单字符行内公式（$n$）不再变成字面量 \\$n\\$", () => {
  const tex = buildSingleLatexDocument({
    problem: "木材加工",
    description: "有 $n$ 根原木，要切成 $k$ 段，长度单位是 $\\text{cm}$，且有 $11$ 与 $21$。",
  });
  assert.match(tex, /有 \$n\$ 根原木/);
  assert.match(tex, /切成 \$k\$ 段/);
  assert.match(tex, /\$\\text\{cm\}\$/);
  assert.doesNotMatch(tex, /\\\$n\\\$/);
  assert.doesNotMatch(tex, /\\\$k\\\$/);
});

test("公式块保留原样，并且前导包里有 amsmath / amssymb", () => {
  const tex = buildSingleLatexDocument({
    problem: "P1990",
    takeaway: "$$\\boxed{f[i] = f[i-1] + g[i-1]}$$\n\n单行 $$\\begin{cases} a & x>0 \\\\ b & x\\le 0\\end{cases}$$ 结束。",
  });
  assert.match(tex, /\\\[\\boxed\{f\[i\] = f\[i-1\] \+ g\[i-1\]\}\\\]/);
  assert.match(tex, /\\begin\{cases\}/);
  assert.match(tex, /\\usepackage\{amsmath\}/);
  assert.match(tex, /\\usepackage\{amssymb\}/);
});

test("多行 $$ 公式块也能整体识别", () => {
  const tex = buildSingleLatexDocument({
    problem: "多行公式",
    takeaway: "推导如下：\n\n$$\nf[i] = f[i-1] + f[i-2]\ng[i] = 2f[i-2]\n$$\n\n完成。",
  });
  assert.match(tex, /\\\[f\[i\] = f\[i-1\] \+ f\[i-2\]\ng\[i\] = 2f\[i-2\]\\\]/);
  assert.doesNotMatch(tex, /\\\$/);
});

test("Markdown 结构被翻译成 LaTeX 而不是原样输出", () => {
  const tex = buildSingleLatexDocument({
    problem: "Markdown",
    takeaway: [
      "# 标题",
      "**重点**：使用 *枚举*，代码是 `a_b`。",
      "1. 交：A1 & A2",
      "2. 补：A1 ^ A2",
      "> 引用一行",
      "- 列表项",
      "---",
      "```python",
      "print('hi')",
      "```",
    ].join("\n"),
  });
  assert.match(tex, /\\textbf\{重点\}/);
  assert.match(tex, /\\emph\{枚举\}/);
  assert.match(tex, /\\texttt\{a\\_b\}/);
  assert.match(tex, /\\begin\{enumerate\}/);
  assert.match(tex, /\\item 交：A1 \\& A2/);
  assert.match(tex, /\\begin\{quote\}/);
  assert.match(tex, /\\begin\{itemize\}/);
  assert.match(tex, /\\begin\{lstlisting\}\[language=Python\]/);
  assert.doesNotMatch(tex, /\*\*/);
});

test("代码块转义规则：中文注释原样、终止标记被打破", () => {
  const tex = buildSingleLatexDocument({
    problem: "代码",
    code: "int main() {\n    // 中文注释\n    return 0;\n}\n// \\end{lstlisting} 混进来了",
  });
  assert.match(tex, /\/\/ 中文注释/);
  assert.match(tex, /\\end \{lstlisting\}/);
  assert.equal((tex.match(/\\end\{lstlisting\}/g) || []).length, 1, "真正的结束标记只能有一个");
  assert.match(tex, /extendedchars=false/);
});

test("单题导出不要目录，批量导出才要", () => {
  assert.doesNotMatch(buildSingleLatexDocument({ problem: "一题" }), /\\tableofcontents/);
  assert.match(buildBatchLatexDocument([{ problem: "一题" }, { problem: "二题" }]), /\\tableofcontents/);
  assert.doesNotMatch(buildBatchLatexDocument([{ problem: "一题" }]), /\\tableofcontents/);
});

test("文档首行声明 XeLaTeX 引擎", () => {
  for (const tex of [buildSingleLatexDocument({ problem: "x" }), buildBatchLatexDocument([{ problem: "x" }])]) {
    assert.equal(tex.split("\n")[0], "% !TEX program = xelatex");
  }
});

test("Markdown 导出：表格竖线与代码围栏不会破坏结构", () => {
  const md = buildMDContent({
    problem: "标题",
    tags: ["DP|图论", "二分"],
    code: "```\ncode with ``` fence\n```",
  });
  assert.match(md, /DP\\\|图论, 二分/);
  assert.match(md, /^````cpp$/m);
  assert.match(md, /^````$/m);
  assert.doesNotMatch(md, /^```cpp$/m);
});

test("导出文件名清掉非法字符", () => {
  assert.equal(safeFilename({ member: "廖夏", date: "2026-07-21", problem: 'a/b\\c:d*e?f"g<h>i|j\nk' }), "廖夏-2026-07-21-a_b_c_d_e_f_g_h_i_j_k");
});

/* ------------------------------ 真实编译 ------------------------------ */

// 每条都是真实踩过的坑
const HOSTILE_LOGS = [
  {
    label: "题名含 # 与方括号",
    log: { problem: "[COCI 2011/2012 #5] EKO / 砍树", member: "廖夏", date: "2026-09-05", platform: "洛谷", tags: ["二分"], reviewStatus: "none" },
  },
  {
    label: "题名含下划线百分号",
    log: { problem: "a_b 100% & c#d $x$ {e}", member: "王梓豪", date: "2026-07-30", platform: "洛谷" },
  },
  {
    label: "单字符行内公式与 amsmath 命令",
    log: {
      problem: "木材加工",
      member: "廖夏",
      description: "木材厂有 $n$ 根原木，要切成 $k$ 段长度为 $l$ 的小段，单位是 $\\text{cm}$。\n\n满足 $1 \\le n \\le 10^5$，且 $x \\ge 2$、$a \\times b$ 与 $\\begin{cases} 1 & ok \\\\ 0 & no \\end{cases}$。",
      takeaway: "$$\\boxed{f[i] = f[i-1] + g[i-1]}$$",
    },
  },
  {
    label: "Unicode 数学符号",
    log: {
      problem: "符号",
      member: "王梓豪",
      description: "若 x ≤ 2 且 y ≥ 3，则 a × b ≠ 0，误差 ∼ 0，上限 ∞，取 ∑ 与 ⌊x⌋，角度 90°。",
      takeaway: "结论：∼ × ≤ ≥ 都要有字形。",
    },
  },
  {
    label: "中文代码注释",
    log: {
      problem: "涂条纹",
      member: "廖夏",
      code: [
        "#include <bits/stdc++.h>",
        "int main() {",
        "    // 重要思维模型，对于难以通过逻辑确认且数据量较小的问题，使用枚举法，同时对于互相约束且变量较小的问题，直接枚举前几个",
        "    /* 块注释：mid = l + r >> 1 与 l + r + 1 >> 1 的区别，注意边界 */",
        "    for (int j = sum / 2; j >= arr[i]; j--) { // 我们从sum/2开始寻找",
        "        if (dp[j]) return sum - j;",
        "    }",
        "    printf(\"对齐测试 %d\\n\", 12345);",
        "    return 0;",
        "}",
      ].join("\n"),
    },
  },
  {
    label: "代码里混入结束标记",
    log: {
      problem: "结束标记",
      member: "廖夏",
      code: "int main() {\n    // \\end{lstlisting} 出现在注释里\n    return 0;\n}",
    },
  },
  {
    label: "题解里的 Markdown 与围栏代码",
    log: {
      problem: "P5143",
      member: "廖夏",
      takeaway: [
        "**重点**：用 *枚举*。",
        "1. 交：A1 & A2",
        "2. 补：A1 ^ A2",
        "```cpp",
        "#include<iostream>",
        "int main() { return 0; }",
        "```",
        "> 引用一行",
        "- 列表项",
        "---",
        "长行内代码 `int skip = dfs(s, b, i + 1, selected);` 结束。",
      ].join("\n"),
    },
  },
  {
    label: "反斜杠与链接",
    log: {
      problem: "反斜杠",
      member: "廖夏",
      description: "路径 C:\\temp\\a 与 `\\n`，参考 [官方题解](https://example.com/a_b?x=1&y=2#frag) 以及 100% 的 _下划线_。",
    },
  },
];

test("真实数据与历史故障样例都能编译通过", { timeout: 300000 }, (t) => {
  if (!XELATEX) {
    t.skip("未找到 xelatex，跳过真实编译（安装 TeX Live 后会自动启用）");
    return;
  }
  for (const { label, log } of HOSTILE_LOGS) {
    assertClean(compile(XELATEX, buildSingleLatexDocument(log), label), "xelatex", label);
  }
});

test("仓库全部训练日志的批量导出零错误零溢出", { timeout: 300000 }, (t) => {
  if (!XELATEX) {
    t.skip("未找到 xelatex，跳过真实数据编译");
    return;
  }
  assert.ok(REPO_LOGS.length >= 100, `期望至少 100 条真实日志，实际 ${REPO_LOGS.length}`);
  const result = compile(XELATEX, buildBatchLatexDocument(REPO_LOGS), "批量导出", ["-no-pdf"]);
  assertClean(result, "xelatex", `${REPO_LOGS.length} 条真实日志的批量导出`);
  assert.equal(result.overfull, 0, "批量导出出现行溢出（Overfull \\hbox）");
  assert.equal(result.missingCharacters, 0, "批量导出有字符因缺字形被丢弃");
});

test("pdfLaTeX 也能编译（中文注释不再 fatal）", { timeout: 300000 }, (t) => {
  if (!PDFLATEX) {
    t.skip("未找到 pdflatex，跳过跨引擎检查");
    return;
  }
  const log = HOSTILE_LOGS.find((entry) => entry.label === "中文代码注释").log;
  const result = compile(PDFLATEX, buildSingleLatexDocument(log), "pdfLaTeX-中文注释");
  assertClean(result, "pdflatex", "中文代码注释");
  assert.equal(result.missingCharacters, 0, "pdfLaTeX 下中文注释有字形被丢弃");
  assert.ok(existsSync(result.pdf), "pdflatex 应该产出 PDF");
});

test("生成的 .tex 不会把仓库里的日志内容漏转义", () => {
  // 便宜的全量文本扫描：真实数据里不该出现这些会炸掉的序列
  const sample = REPO_LOGS.slice(0, 40);
  for (const log of sample) {
    const tex = buildSingleLatexDocument(log);
    const body = tex.slice(tex.indexOf("\\begin{document}"));
    assert.doesNotMatch(body, /&amp;|&lt;|&gt;|&quot;|&#39;/, `${log.member}/${log.problem} 残留 HTML 转义`);
    assert.equal(body.includes("\\end{lstlisting\\}"), false, `${log.member}/${log.problem} 结束标记被写坏`);
    assert.equal((body.match(/\\end\{lstlisting\}/g) || []).length, (body.match(/\\begin\{lstlisting\}/g) || []).length,
      `${log.member}/${log.problem} 的 lstlisting 开关不成对`);
  }
});
