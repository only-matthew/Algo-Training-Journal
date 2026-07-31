// Standalone LaTeX export test - avoids DOM-dependent imports
const esc = (s) => String(s || "").replace(/[\\_{}&#%$~]/g, (c) => "\\" + c).replace(/\^/g, "\\^{}");

function latexProse(md) {
  if (!md) return "";
  const parts = [];
  const segments = md.split(/(```[\s\S]*?```)/g);
  for (const seg of segments) {
    if (seg.startsWith("```") && seg.endsWith("```")) {
      const inner = seg.slice(3, -3).replace(/^\S*\n?/, "");
      parts.push("\\begin{lstlisting}[language=C++]");
      parts.push(inner.replace(/\\end\{lstlisting\}/g, "\\end{lstlisting\\}"));
      parts.push("\\end{lstlisting}");
    } else {
      let text = seg;
      const mathBlocks = [];
      text = text.replace(/\$\$([\s\S]*?)\$\$|\$([^\s$](?:[^$]|\\\$)*?[^\s$\\])\$/g, (match) => {
        mathBlocks.push(match);
        return `\x00MATH${mathBlocks.length - 1}\x00`;
      });
      text = esc(text);
      text = text.replace(/`([^`]+)`/g, (_, code) => `\\texttt{${esc(code)}}`);
      text = text.replace(/\x00MATH(\d+)\x00/g, (_, i) => mathBlocks[+i]);
      parts.push(text);
    }
  }
  return parts.join("\n");
}

function buildOne(log) {
  const secTitle = esc(log.problem || "题目").replace(/^\[/, "{}[");
  const reviewLabel = { none: "非错题", todo: "待复习", mastered: "已掌握" }[log.reviewStatus] || "";
  const lines = [
    `\\section{${secTitle}}`,
    `\\begin{tabular}{|l|l|}`,
    `\\hline`,
    `队员 & ${esc(log.member)} \\\\ \\hline`,
    `日期 & ${esc(log.date)} \\\\ \\hline`,
    `平台 & ${esc(log.platform)} \\\\ \\hline`,
    `题号 & ${esc(log.problemNumber)} \\\\ \\hline`,
    `难度 & ${esc(log.difficulty)} \\\\ \\hline`,
    `标签 & ${esc((log.tags || []).join(", "))} \\\\ \\hline`,
    `错题状态 & ${esc(reviewLabel)} \\\\ \\hline`,
    `\\end{tabular}`,
    "",
  ];
  if (log.description) {
    lines.push("\\subsection{题目描述}");
    lines.push(latexProse(log.description));
    lines.push("");
  }
  if (log.takeaway) {
    lines.push("\\subsection{题解}");
    lines.push(latexProse(log.takeaway));
    lines.push("");
  }
  if (log.code) {
    lines.push("\\subsection{代码}");
    lines.push("\\begin{lstlisting}[language=C++]");
    lines.push(String(log.code).replace(/\\end\{lstlisting\}/g, "\\end{lstlisting\\}"));
    lines.push("\\end{lstlisting}");
    lines.push("");
  }
  return lines.join("\n");
}

const log1 = {
  problem: "矩阵取数游戏",
  member: "王梓豪",
  date: "2026-07-30",
  platform: "洛谷",
  problemNumber: "P1005",
  difficulty: "普及/提高-",
  tags: ["DP", "高精度"],
  reviewStatus: "todo",
  description: "对于n×m矩阵，每次从每行取首或尾元素，共取m次，每次取数乘2^i，求最大总得分。",
  takeaway: "这个题非常坑非常难，我做了好几天了。\n__int128\ndp",
  code: `#include <bits/stdc++.h>
using namespace std;
int main() {
    // 使用 __int128 类型
    __int128 x = 0;
    return 0;
}
`,
};

const log2 = {
  problem: "P1036【子集枚举法】",
  member: "廖夏",
  date: "2026-07-26",
  platform: "洛谷",
  problemNumber: "",
  difficulty: "普及-",
  tags: [],
  reviewStatus: "none",
  description: "从n个整数中任选k个相加，求有多少种方案使得和为素数。",
  takeaway: "核心思路：\n1. 交：A1 & A2\n2. 并：A1 | A2\n3. 补：A1 ^ A2",
  code: `#include<iostream>
int main() {
    int a = 1 & 2;
    return 0;
}
`,
};

const log3 = {
  problem: "P5143",
  member: "廖夏",
  date: "2026-07-21",
  platform: "洛谷",
  problemNumber: "",
  difficulty: "普及-",
  tags: [],
  reviewStatus: "none",
  description: "爬山的题目，计算三维空间中的路径长度。",
  takeaway: "解题思路：\n```cpp\n#include<iostream>\n#include<algorithm>\nusing namespace std;\nint main() { return 0; }\n```\n代码中注意浮点数精度。",
  code: "",
};

const log4 = {
  problem: "回文质数",
  member: "廖夏",
  date: "2026-07-30",
  platform: "洛谷",
  problemNumber: "P1217",
  difficulty: "普及-",
  tags: ["暴力"],
  reviewStatus: "none",
  description: "找出区间$[a,b]$内所有既是质数又是回文数的数字。",
  takeaway: "力大砖飞，暴力构造。",
  code: "",
};

const log5 = {
  problem: "[NOIP 2008 提高组] 火柴棒等式",
  member: "廖夏",
  date: "2026-07-31",
  platform: "洛谷",
  problemNumber: "P1149",
  difficulty: "普及-",
  tags: ["枚举", "模拟"],
  reviewStatus: "none",
  description: "用n根火柴棍拼出多少个A+B=C的等式。",
  takeaway: "注意范围，A、B不会超过1000。",
  code: "",
};

const preamble = `\\documentclass[12pt,a4paper]{ctexart}
\\usepackage[top=2cm,bottom=2cm,left=2.5cm,right=2.5cm]{geometry}
\\usepackage{listings}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\lstset{
  basicstyle=\\ttfamily\\small,
  breaklines=true,
  frame=single,
  numbers=left,
  numberstyle=\\tiny,
  backgroundcolor=\\color{gray!5},
  keywordstyle=\\color{blue},
  commentstyle=\\color{green!40!black},
  stringstyle=\\color{red},
}
\\title{LaTeX Test}
\\date{\\today}
\\begin{document}
\\maketitle
\\tableofcontents
\\newpage
`;

const tex = preamble + [log1, log2, log3, log4, log5].map(buildOne).join("\n\n") + "\n\\end{document}\n";

import { writeFileSync } from "fs";
writeFileSync("test-output.tex", tex, "utf8");
console.log("Written test-output.tex");
