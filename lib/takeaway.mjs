export function realTakeaway(value) {
  const text = String(value ?? "").trim();
  return text === "未填写" ? "" : text;
}
