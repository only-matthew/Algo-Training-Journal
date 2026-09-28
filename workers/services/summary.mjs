export async function summarizeDescription(ai, description) {
  if (!ai) return null;
  const text = String(description || "").trim();
  if (!text || text.length < 20) return null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await ai.run("@cf/qwen/qwen3-30b-a3b-fp8", {
        max_tokens: 512,
        temperature: 0.15,
        messages: [
          { role: "system", content: "你是算法竞赛题意压缩助手。仅依据用户给出的题面，用一句不超过60个汉字的中文概括：处理什么对象、要求计算或判断什么、最关键的约束或优化目标。不要猜测解法，不要列点，不要标题、引号、Markdown、解释或思考过程。" },
          { role: "user", content: `${text.slice(0, 6000)}\n/no_think` },
        ],
      });
      const summary = String(result.response || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/^(?:概括|摘要|题意)\s*[:：]\s*/i, "")
        .replace(/^[""'']+|[“”"']+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (summary) return summary.slice(0, 120);
      return null;
    } catch (error) {
      if (attempt === 2) {
        console.error("AI summarize failed after 3 attempts:", error.message);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  return null;
}
