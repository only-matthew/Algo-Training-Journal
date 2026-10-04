import { escapeHtml } from './escape-html.mjs';
import { isDateString } from './date-string.mjs';

const nonnegative = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

// Both views use their own labelled scale; cumulative totals never share a daily axis.
export function vitalityChartHtml(daily, options = {}) {
  const points = (Array.isArray(daily) ? daily : [])
    .filter((point) => point && isDateString(point.date))
    .toSorted((a, b) => a.date.localeCompare(b.date));
  if (!points.length) return '<p class="hint">还没有足够的数据绘制活力曲线。</p>';
  const cumulative = options.metric === 'cumulative';
  const label = cumulative ? '累计活力' : '每日活力';
  const values = points.map((point) => nonnegative(cumulative ? point.cumulative : point.value));
  const width = Math.max(240, nonnegative(options.width) || 1000);
  const height = 240, left = 48, right = 26, top = 18, bottom = 34;
  const floor = height - bottom;
  const maximum = values.reduce((max, value) => Math.max(max, value), 0.5);
  const interval = 10 ** Math.floor(Math.log10(maximum));
  const ceiling = Math.ceil(maximum / interval) * interval;
  const first = Date.parse(points[0].date), last = Date.parse(points.at(-1).date);
  const x = (point) => left + (last === first ? 0.5 : (Date.parse(point.date) - first) / (last - first)) * (width - left - right);
  const y = (value) => floor - value / ceiling * (floor - top);
  let svg = `<svg class="vitality-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}，${points[0].date} 至 ${points.at(-1).date}，${points.length} 个训练日">`;
  for (let i = 0; i <= 4; i++) {
    const value = ceiling * i / 4;
    svg += `<line class="trend-gridline" x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}"/><text class="trend-axis-label" x="${left - 10}" y="${y(value) + 4}" text-anchor="end">${Number(value.toFixed(2))}</text>`;
  }
  const line = points.map((point, i) => `${i ? 'L' : 'M'} ${x(point)} ${y(values[i])}`).join(' ');
  svg += `<path class="vitality-area" d="${line} L ${x(points.at(-1))} ${floor} L ${x(points[0])} ${floor} Z"/><path class="vitality-line" d="${line}"/>`;
  let previousLabelX = -Infinity;
  points.forEach((point, i) => {
    const title = `${point.date} · 每日活力 ${nonnegative(point.value).toFixed(2)} · 累计活力 ${nonnegative(point.cumulative).toFixed(1)}`;
    svg += `<circle class="vitality-point" data-date="${point.date}" data-daily="${nonnegative(point.value).toFixed(2)}" data-cumulative="${nonnegative(point.cumulative).toFixed(1)}" cx="${x(point)}" cy="${y(values[i])}" r="2.5"><title>${escapeHtml(title)}</title></circle>`;
    const final = i === points.length - 1;
    if (final || (x(point) - previousLabelX >= 120 && x(points.at(-1)) - x(point) >= 100)) {
      svg += `<text class="trend-date-label" x="${x(point)}" y="${height - 10}" text-anchor="middle">${point.date.slice(5)}</text>`;
      previousLabelX = x(point);
    }
  });
  svg += `<line class="vitality-guide" x1="0" x2="0" y1="${top}" y2="${floor}" hidden/></svg>`;
  const total = nonnegative(options.total ?? points.at(-1).cumulative);
  const target = nonnegative(options.targetRating);
  return `<div class="vitality-toolbar"><span>${points[0].date} — ${points.at(-1).date}</span><label>查看 <select aria-label="活力曲线指标"><option value="daily"${cumulative ? '' : ' selected'}>每日活力</option><option value="cumulative"${cumulative ? ' selected' : ''}>累计活力</option></select></label></div>`
    + `<div class="vitality-plot" tabindex="0" role="region" aria-label="${label}图表，左右方向键查看日期，Home 和 End 跳到首尾，Escape 关闭提示">${svg}<div class="vitality-tooltip" role="status" aria-live="polite" hidden></div></div>`
    + '<p class="vitality-help">悬停或点击曲线查看数值，也可用左右方向键逐日查看。</p>'
    + `<div class="vitality-summary"><span><strong>${total.toFixed(1)}</strong><small>累计活力</small></span><span><strong>${(total / points.length).toFixed(2)}</strong><small>每训练日平均</small></span><span><strong>${points.length}</strong><small>训练日</small></span>${target ? `<span><strong>★ ${target}</strong><small>建议目标</small></span>` : ''}</div>`
    + '<p class="vitality-note">活力按题目难度与训练历史估算，不等同于能力评分。日期间距按实际天数展示。</p>';
}

const charts = new WeakMap();

export function renderVitalityChart(root, daily, options = {}) {
  if (!root) return;
  let state = charts.get(root);
  if (!state) {
    state = {};
    charts.set(root, state);
    if (typeof ResizeObserver !== 'undefined') {
      state.observer = new ResizeObserver(() => {
        if (root.clientWidth > 0 && root.clientWidth !== state.width) {
          renderVitalityChart(root, state.daily, state.options);
        }
      });
      state.observer.observe(root);
    }
  }
  Object.assign(state, { daily, options, width: root.clientWidth });
  const metric = root.querySelector('select')?.value || 'daily';
  root.innerHTML = vitalityChartHtml(daily, { ...options, metric, width: state.width });
  const select = root.querySelector('select');
  if (select) select.addEventListener('change', () => {
    renderVitalityChart(root, daily, options);
    root.querySelector('select')?.focus();
  });
  const plot = root.querySelector('.vitality-plot');
  if (!plot) return;
  const svg = plot.querySelector('svg');
  const tooltip = plot.querySelector('.vitality-tooltip');
  const guide = plot.querySelector('.vitality-guide');
  const points = [...plot.querySelectorAll('.vitality-point')];
  let active = -1;
  let pinned = false;
  const hide = () => {
    points[active]?.classList.remove('is-active');
    tooltip.hidden = true;
    guide.setAttribute('hidden', '');
  };
  const show = (index, announce = false) => {
    points[active]?.classList.remove('is-active');
    active = index;
    const point = points[index];
    point.classList.add('is-active');
    tooltip.setAttribute('aria-live', announce ? 'polite' : 'off');
    tooltip.textContent = `${point.dataset.date}\n每日活力 ${point.dataset.daily} · 累计活力 ${point.dataset.cumulative}`;
    tooltip.hidden = false;
    const x = point.cx.baseVal.value;
    const y = point.cy.baseVal.value;
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    tooltip.style.left = `${Math.max(0, Math.min(plot.clientWidth - tooltip.offsetWidth, x * scale - tooltip.offsetWidth / 2))}px`;
    tooltip.style.top = `${Math.max(0, y * scale - tooltip.offsetHeight - 12)}px`;
    guide.setAttribute('x1', x);
    guide.setAttribute('x2', x);
    guide.removeAttribute('hidden');
  };
  const nearest = (event) => {
    const bounds = svg.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * svg.viewBox.baseVal.width / bounds.width;
    return points.reduce((best, point, index) => Math.abs(point.cx.baseVal.value - x) < Math.abs(points[best].cx.baseVal.value - x) ? index : best, 0);
  };
  plot.addEventListener('pointermove', (event) => {
    if (!pinned && event.pointerType !== 'touch') show(nearest(event));
  });
  plot.addEventListener('click', (event) => { pinned = true; show(nearest(event), true); });
  plot.addEventListener('pointerleave', () => { if (!pinned && document.activeElement !== plot) hide(); });
  plot.addEventListener('focus', () => show(active < 0 ? points.length - 1 : active, true));
  plot.addEventListener('blur', () => { pinned = false; hide(); });
  plot.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { pinned = false; hide(); return; }
    const index = { ArrowLeft: Math.max(0, active - 1), ArrowRight: Math.min(points.length - 1, active + 1), Home: 0, End: points.length - 1 }[event.key];
    if (index === undefined) return;
    event.preventDefault();
    pinned = true;
    show(index, true);
  });
}
