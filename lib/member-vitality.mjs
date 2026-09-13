import { escapeHtml } from './escape-html.mjs';

export function memberVitalityDetailsHtml(scope) {
  if (!scope?.records) return '<p class="hint">记录带有 Rating 的题目后，这里会显示个人活力及各平台贡献。</p>';
  const rows = scope.byPlatform.map(item => `<tr><th scope="row">${escapeHtml(item.platform)}</th><td>${item.rated} / ${item.records}</td><td>${item.counted}</td><td>${item.value.toFixed(2)}</td></tr>`).join('');
  return `<details class="vitality-details"><summary>计入情况 · ${scope.ratedRecords} / ${scope.records} 条记录有 Rating</summary><div class="vitality-table-scroll"><table><caption>各平台活力贡献</caption><thead><tr><th scope="col">平台</th><th scope="col">有难度 / 记录</th><th scope="col">计分记录</th><th scope="col">活力</th></tr></thead><tbody>${rows}</tbody></table></div><p>同一成员同题只计一次；重复记录仍保留在训练历史中。完成质量提升时只补差额。</p>${scope.unknownRecords ? `<p>${scope.unknownRecords} 条历史记录缺少完成质量，按未知结果折算，不视作独立完成。</p>` : ''}${scope.unlinkedRecords ? `<p>${scope.unlinkedRecords} 条记录缺少可靠题号，按独立记录计入；补全题号后可准确去重。</p>` : ''}</details>`;
}
