import { escapeHtml } from './escape-html.mjs';

export function memberVitalityDetailsHtml(scope) {
  if (!scope?.records) return '<p class="hint">记录带有 Rating 的题目后，这里会显示个人活力及各平台贡献。</p>';
  const rows = scope.byPlatform.map(item => `<tr><th scope="row">${escapeHtml(item.platform)}</th><td>${item.rated} / ${item.records}</td><td>${item.counted}</td><td>${item.value.toFixed(2)}</td></tr>`).join('');
  return `<details class="vitality-details"><summary>计入情况 · ${scope.ratedRecords} / ${scope.records} 条记录有 Rating</summary><div class="vitality-table-scroll"><table><caption>各平台活力贡献</caption><thead><tr><th scope="col">平台</th><th scope="col">有难度 / 记录</th><th scope="col">计分记录</th><th scope="col">活力</th></tr></thead><tbody>${rows}</tbody></table></div><p>同题基础活力按完成结果补差额；重做或复习中的不同心得另计复盘活力，额度逐次递减。文本差异仅作保守估算，未计入额外活力不代表没有学习。</p>${scope.unknownRecords ? `<p>${scope.unknownRecords} 条历史记录缺少完成质量，按未知结果折算，不视作独立完成。</p>` : ''}${scope.unlinkedRecords ? `<p>${scope.unlinkedRecords} 条记录缺少可靠题号，按独立记录计入；补全题号后可准确去重。</p>` : ''}</details>`;
}
