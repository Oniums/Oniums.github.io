import { el, put, message } from './common.mjs';
import { MAX_BIN_SIZE, offsetHex } from './binary-core.mjs';
let files = [null, null], worker = null, result = null, rangePage = 0, offset = 0;
function invalidate() {
  worker?.terminate(); worker = null; result = null;
  el('binary-result').hidden = true; el('compare').disabled = false;
  el('binary-ranges').replaceChildren(); el('binary-bytes').replaceChildren();
  for (const id of ['hash-a', 'hash-b', 'binary-status']) put(id, '');
  message('binary-error', '');
}
function choose(index, file) {
  invalidate();
  const letter = index ? 'b' : 'a';
  files[index] = null;
  put(`file-${letter}-name`, '尚未选择');
  if (!file) return;
  if (file.size > MAX_BIN_SIZE) { el(`file-${letter}`).value = ''; message('binary-error', '每份文件最多 64 MiB，请先截取需要比较的部分。'); return; }
  files[index] = file;
  put(`file-${letter}-name`, `${file.name} · ${file.size.toLocaleString()} 字节`);
}
for (const [index, letter] of ['a', 'b'].entries()) {
  el(`file-${letter}`).addEventListener('change', event => choose(index, event.target.files[0]));
  const zone = el(`drop-${letter}`);
  zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', event => {
    event.preventDefault(); zone.classList.remove('dragging');
    if (event.dataTransfer.files.length !== 1) { message('binary-error', '请在每个区域放入一份文件。'); return; }
    el(`file-${letter}`).value = ''; choose(index, event.dataTransfer.files[0]);
  });
}
function showWindow(destination) {
  if (!result) return;
  offset = Math.max(0, Math.min(destination, Math.max(0, result.length - 1)));
  put('window-label', result.length ? `${offsetHex(offset)} 起的最多 64 字节` : '两个文件都为空。');
  el('binary-offset').value = offsetHex(offset);
  el('bytes-prev').disabled = offset === 0; el('bytes-next').disabled = offset + 64 >= result.length;
  worker.postMessage({ type: 'window', offset });
}
function showRanges() {
  const root = el('binary-ranges'); root.replaceChildren();
  for (const range of result.ranges.slice(rangePage * 50, (rangePage + 1) * 50)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'mono';
    button.textContent = `[${offsetHex(range.start)}, ${offsetHex(range.end)}) · ${range.end - range.start} 字节`;
    button.addEventListener('click', () => { showWindow(range.start); el('binary-offset').focus(); }); root.append(button);
  }
  const pages = Math.max(1, Math.ceil(result.ranges.length / 50));
  put('ranges-page', `${rangePage + 1} / ${pages}`);
  el('ranges-prev').disabled = rangePage === 0; el('ranges-next').disabled = rangePage + 1 >= pages;
}
function compare() {
  invalidate();
  if (files.some(f => !f)) { message('binary-error', '请先放入 A、B 两份文件。'); return; }
  el('compare').disabled = true; put('binary-status', '正在本地读取、计算 SHA-256 并比较；可随时清空取消。');
  try {
    const current = new Worker(new URL('./binary-worker.mjs', import.meta.url), { type: 'module' }); worker = current;
    const fail = text => { if (worker !== current) return; invalidate(); message('binary-error', text); };
    current.onerror = () => fail('后台计算不可用，请确认浏览器支持 Worker 和 HTTPS 下的 SHA-256。');
    current.onmessage = ({ data }) => {
      if (worker !== current) return;
      if (data.type === 'error') { fail(data.message); return; }
      if (data.type === 'result') {
        result = data.result; rangePage = 0; el('binary-result').hidden = false; el('compare').disabled = false;
        put('binary-summary', result.different ? '存在差异' : '完全一致');
        put('binary-first', result.first === null ? '无' : `${offsetHex(result.first)} / ${result.first}`);
        put('binary-count', `${result.different.toLocaleString()} 字节 / ${result.rangeCount.toLocaleString()} 段`);
        for (const [i, letter] of ['a', 'b'].entries()) put(`hash-${letter}`, `${files[i].size.toLocaleString()} 字节\n${data.hashes[i]}`);
        put('range-note', result.rangeCount > result.ranges.length ? `共 ${result.rangeCount.toLocaleString()} 段，仅列出前 ${result.ranges.length.toLocaleString()} 段；统计覆盖整个文件。` : result.rangeCount ? '终点不包含在区间内。选择一段，即可查看该位置的字节。' : '未发现差异。');
        put('binary-status', '对比完成。'); showRanges(); showWindow(result.first ?? 0);
      } else if (data.type === 'window' && data.offset === offset) {
        el('binary-bytes').replaceChildren();
        for (const row of data.rows) {
          const tr = document.createElement('tr'); if (row.changed) tr.className = 'changed';
          for (const value of [offsetHex(row.offset), ...[row.a, row.b].map(b => b === null ? '—' : b.toString(16).toUpperCase().padStart(2, '0'))]) {
            const td = document.createElement('td'); td.textContent = value; tr.append(td);
          }
          el('binary-bytes').append(tr);
        }
      }
    };
    current.postMessage({ type: 'compare', files });
  } catch { invalidate(); message('binary-error', '无法启动后台计算，请使用支持模块 Worker 的浏览器。'); }
}
el('compare').addEventListener('click', compare);
el('binary-example').addEventListener('click', () => {
  const a = Uint8Array.from({ length: 256 }, (_, i) => i), b = new Uint8Array(260); b.set(a); b[16] = 255; b[17] = 0; b[128] = 7; b.set([1, 2, 3, 4], 256);
  choose(0, new File([a], 'demo-a.bin')); choose(1, new File([b], 'demo-b.bin')); compare();
});
function clear() { invalidate(); files = [null, null]; for (const letter of ['a', 'b']) { el(`file-${letter}`).value = ''; put(`file-${letter}-name`, '尚未选择'); } }
el('binary-clear').addEventListener('click', clear);
el('ranges-prev').addEventListener('click', () => { rangePage--; showRanges(); });
el('ranges-next').addEventListener('click', () => { rangePage++; showRanges(); });
el('bytes-prev').addEventListener('click', () => showWindow(offset - 64));
el('bytes-next').addEventListener('click', () => showWindow(offset + 64));
el('binary-go').addEventListener('click', () => {
  const value = el('binary-offset').value.trim();
  if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) >= result.length) { message('binary-error', '偏移必须是文件范围内的非负整数，可使用 0x 十六进制。'); return; }
  message('binary-error', ''); showWindow(Number(value));
});
window.addEventListener('pagehide', clear);
