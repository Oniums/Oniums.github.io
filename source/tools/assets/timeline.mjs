import { el, put, message } from './common.mjs';
import { organizeTimeline, timelineCsv, LOG_EXAMPLE } from './timeline-core.mjs';
let result = null, page = 0;
const ms = n => n === null ? '—' : `${n.toLocaleString('zh-CN', { maximumFractionDigits: 3 })} ms`;
function invalidate() {
  result = null; el('log-result').hidden = true; el('log-export').disabled = true;
  el('timeline-rows').replaceChildren(); message('log-error', ''); put('log-status', '');
}
function render() {
  const root = el('timeline-rows'); root.replaceChildren();
  for (const row of result.rows.slice(page * 100, (page + 1) * 100)) {
    const tr = document.createElement('tr'); tr.id = `log-line-${row.line}`;
    if (row.line === result.longest?.to) tr.classList.add('longest');
    const line = document.createElement('td'); line.textContent = `${row.line} / ${row.segment ?? '—'}`;
    const time = document.createElement('td'); time.className = 'mono'; time.textContent = `${ms(row.elapsed)}\nΔ ${ms(row.delta)}`;
    const detail = document.createElement('td');
    for (const tag of [row.label, row.flagged ? '异常关键词' : '', row.custom ? '自定义标记' : ''].filter(Boolean)) {
      const span = document.createElement('span'); span.className = 'event-tag'; span.textContent = tag; detail.append(span);
    }
    const pre = document.createElement('pre'); pre.className = 'log-text'; pre.textContent = row.text; detail.append(pre);
    if (row.note) { const note = document.createElement('p'); note.className = 'hint'; note.textContent = row.note; detail.append(note); }
    if (row.step) {
      const link = document.createElement('a'); link.className = 'stage-link'; link.href = `/playground/commissioning/#step=${row.step}`; link.textContent = '查看教学步骤 ↗'; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link);
    }
    tr.append(line, time, detail); root.append(tr);
  }
  const pages = Math.max(1, Math.ceil(result.rows.length / 100));
  put('log-page', `${page + 1} / ${pages}`); el('log-prev').disabled = page === 0; el('log-next').disabled = page + 1 >= pages;
}
function parse() {
  invalidate();
  try {
    result = organizeTimeline(el('log-input').value, { numericUnit: el('log-unit').value, rollover: el('log-rollover').value === 'yes', keyword: el('log-keyword').value.trim() });
    page = 0; el('log-result').hidden = false; el('log-export').disabled = false;
    put('log-count', `${result.parsed} / ${result.rows.length}`); put('log-segments', result.segments); put('log-longest', ms(result.longest?.delta ?? null));
    put('longest-detail', result.longest ? `第 ${result.longest.from} → ${result.longest.to} 行（第 ${result.longest.segment} 段），这是相邻可识别日志的时间间隔。` : '需要同一时间段内至少两个时间戳，才能计算间隔。');
    el('log-jump').disabled = !result.longest;
    put('log-status', `已保留全部 ${result.rows.length} 行，其中 ${result.unparsed} 行没有可识别时间戳。事件标签仅代表关键词出现。`);
    render();
  } catch (error) { message('log-error', error.message); }
}
el('log-parse').addEventListener('click', parse);
el('log-example').addEventListener('click', () => { el('log-input').value = LOG_EXAMPLE; parse(); });
function clear() { invalidate(); el('log-input').value = ''; el('log-keyword').value = ''; }
el('log-clear').addEventListener('click', clear);
for (const id of ['log-input', 'log-keyword', 'log-unit', 'log-rollover']) el(id).addEventListener('input', invalidate);
el('log-prev').addEventListener('click', () => { page--; render(); });
el('log-next').addEventListener('click', () => { page++; render(); });
el('log-jump').addEventListener('click', () => {
  page = Math.floor((result.longest.to - 1) / 100); render();
  const row = el(`log-line-${result.longest.to}`); row.tabIndex = -1; row.focus(); row.scrollIntoView({ block: 'center' });
});
el('log-export').addEventListener('click', () => {
  if (!result) return;
  const url = URL.createObjectURL(new Blob([timelineCsv(result.rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'log-timeline.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', clear);
