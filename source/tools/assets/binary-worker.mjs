import { compareBinary, byteWindow, MAX_BIN_SIZE } from './binary-core.mjs';
let a, b;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'compare') {
      if (data.files.length !== 2 || data.files.some(f => f.size > MAX_BIN_SIZE)) throw new Error('请选择两个不超过 64 MiB 的文件。');
      [a, b] = await Promise.all(data.files.map(async f => new Uint8Array(await f.arrayBuffer())));
      const hashes = await Promise.all([a, b].map(async bytes => {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('');
      }));
      self.postMessage({ type: 'result', result: compareBinary(a, b), hashes });
    } else if (data.type === 'window' && a && b) {
      self.postMessage({ type: 'window', rows: byteWindow(a, b, data.offset), offset: data.offset });
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
