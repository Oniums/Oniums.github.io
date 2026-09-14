import { el, put, message } from './common.mjs';
import { parseDataset, DATASET_EXAMPLE } from './dataset-core.mjs';
let raw = '';
function invalidate() {
  el('dataset-result').hidden = true; el('dataset-fields').replaceChildren();
  el('dataset-errors').replaceChildren(); el('dataset-warnings').replaceChildren();
  message('dataset-error', ''); put('dataset-status', ''); raw = '';
}
function notices(id, items) {
  const list = el(id); list.replaceChildren(); list.hidden = !items.length;
  for (const item of items) { const li = document.createElement('li'); li.textContent = item; list.append(li); }
}
function parse() {
  const input = el('dataset-input').value; invalidate();
  try {
    const result = parseDataset(input); raw = input; el('dataset-input').value = ''; el('dataset-input').hidden = true; el('dataset-edit').hidden = false; el('dataset-parse').hidden = true;
    el('dataset-result').hidden = false; put('dataset-count', `${result.bytes} 字节 · ${result.rows.length} 个完整 TLV`);
    put('dataset-summary', result.errors.length ? `发现 ${result.errors.length} 项结构 / 字段错误` : '已完成结构检查，请结合下方完整性提示。');
    notices('dataset-errors', result.errors); notices('dataset-warnings', result.warnings);
    for (const field of result.rows) {
      const card = document.createElement('article'); card.className = 'dataset-field';
      const heading = document.createElement('h3'); heading.textContent = field.name;
      const meta = document.createElement('p'); meta.className = 'hint'; meta.textContent = `偏移 ${field.offset} · Type ${field.type} (0x${field.type.toString(16).padStart(2, '0')}) · Length ${field.length}`;
      card.append(heading, meta);
      const value = document.createElement('p'); value.className = 'mono wrap';
      const content = () => field.error ? `字段错误：${field.error}\n原始 HEX：${field.raw}` : `${field.value}${field.value === field.raw ? '' : '\n原始 HEX：' + field.raw}`;
      if (field.sensitive) {
        const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = '敏感 / 标识内容已隐藏 · 点击展开';
        details.append(summary, value); details.addEventListener('toggle', () => { value.textContent = details.open ? content() : ''; }); card.append(details);
      } else { value.textContent = content(); card.append(value); }
      el('dataset-fields').append(card);
    }
    put('dataset-status', '原始输入已收起；展开字段只影响本页显示。');
  } catch (error) { message('dataset-error', error.message); }
}
el('dataset-parse').addEventListener('click', parse);
el('dataset-example').addEventListener('click', () => { el('dataset-input').value = DATASET_EXAMPLE; parse(); });
el('dataset-edit').addEventListener('click', () => {
  const input = raw; invalidate(); el('dataset-input').value = input; el('dataset-input').hidden = false; el('dataset-edit').hidden = true; el('dataset-parse').hidden = false; el('dataset-input').focus();
});
function clear() { invalidate(); el('dataset-input').value = ''; el('dataset-input').hidden = false; el('dataset-edit').hidden = true; el('dataset-parse').hidden = false; }
el('dataset-clear').addEventListener('click', clear);
el('dataset-input').addEventListener('input', invalidate);
window.addEventListener('pagehide', clear);
