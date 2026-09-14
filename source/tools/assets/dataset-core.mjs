import { parseBytes, hexBytes } from './calculations.mjs';
// MeshCoP field IDs / byte order follow OpenThread dataset.h and meshcop_tlvs.hpp.
const fields = {
  0: ['Channel', 3], 1: ['PAN ID', 2], 2: ['Extended PAN ID', 8],
  3: ['Network Name', null], 4: ['PSKc', 16], 5: ['Network Key', 16],
  6: ['Network Key Sequence', 4], 7: ['Mesh-Local Prefix', 8],
  12: ['Security Policy', null], 14: ['Active Timestamp', 8],
  51: ['Pending Timestamp', 8], 52: ['Delay Timer', 4], 53: ['Channel Mask', null],
  74: ['Wake-up Channel', 3]
};
const requiredActive = [0, 1, 2, 3, 4, 5, 7, 12, 14, 53];
const number = bytes => bytes.reduce((n, b) => n * 256 + b, 0);
const big = bytes => bytes.reduce((n, b) => (n << 8n) | BigInt(b), 0n);
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
function decode(type, bytes, warnings) {
  const raw = hexBytes(bytes);
  if (type === 0 || type === 74) {
    const channel = number(bytes.slice(1));
    if (bytes[0] !== 0) warnings.push('此 Channel Page 未作无线频段检查。');
    else if (channel < 11 || channel > 26) warnings.push('Page 0 信道不在常见 2.4 GHz Thread 的 11–26 范围内。');
    return `Page ${bytes[0]} · 信道 ${channel}`;
  }
  if (type === 1) return `0x${raw.replaceAll(' ', '')}`;
  if (type === 3) {
    ensure(bytes.length >= 1 && bytes.length <= 16, 'Network Name 应为 1–16 字节。');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('Network Name 不是有效 UTF-8。'); }
    ensure(!/[\u0000-\u001f\u007f]/.test(text), 'Network Name 含控制字符。');
    return text;
  }
  if (type === 7) {
    if (bytes[0] !== 0xfd) warnings.push('Mesh-Local Prefix 未以 FD 开头。');
    return Array.from({ length: 4 }, (_, i) => number(bytes.slice(i * 2, i * 2 + 2)).toString(16)).join(':') + '::/64';
  }
  if (type === 6) return String(number(bytes));
  if (type === 12) {
    ensure(bytes.length === 3 || bytes.length === 4, 'Security Policy 当前支持 3 或 4 字节格式。');
    return `密钥轮换 ${number(bytes.slice(0, 2))} 小时 · flags 0x${hexBytes(bytes.slice(2)).replaceAll(' ', '')}`;
  }
  if (type === 14 || type === 51) {
    const n = big(bytes);
    return `seconds=${n >> 16n} · ticks=${(n >> 1n) & 32767n} · authoritative=${n & 1n}`;
  }
  if (type === 52) return `${number(bytes)} ms`;
  if (type === 53) {
    ensure(bytes.length > 0, 'Channel Mask 不能为空。');
    const entries = [], pages = new Set();
    for (let i = 0; i < bytes.length;) {
      ensure(i + 2 <= bytes.length, 'Channel Mask 子条目头部不完整。');
      const page = bytes[i++], length = bytes[i++];
      ensure(length > 0 && i + length <= bytes.length, 'Channel Mask 子条目长度越界或为空。');
      ensure(!pages.has(page), 'Channel Mask 含重复 Channel Page。'); pages.add(page);
      const mask = bytes.slice(i, i + length); i += length;
      if (page === 0) {
        ensure(length === 4, 'Page 0 Channel Mask 应为 4 字节。');
        // MeshCoP numbers channels from the MSB of the first wire byte.
        // This differs from the host-side OpenThread uint32_t channel mask.
        const channels = Array.from({ length: 32 }, (_, n) => n).filter(n => mask[n >> 3] & (0x80 >> (n % 8)));
        entries.push(`Page 0 · 信道 ${channels.join(', ') || '无'}`);
      } else { entries.push(`Page ${page} · ${hexBytes(mask)}`); warnings.push('未知 Channel Page 仅展示原始掩码。'); }
    }
    return entries.join('；');
  }
  return raw || '空值';
}
export function parseDataset(input) {
  const bytes = parseBytes(input);
  ensure(bytes.length <= 254, 'Operational Dataset 最多 254 字节。');
  const rows = [], errors = [], warnings = [], seen = new Set();
  for (let i = 0; i < bytes.length;) {
    const offset = i;
    if (i + 2 > bytes.length) { errors.push(`偏移 ${i}：缺少 TLV 长度字节。`); break; }
    const type = bytes[i++], length = bytes[i++];
    if (i + length > bytes.length) { errors.push(`偏移 ${offset}：TLV 声明 ${length} 字节，实际仅余 ${bytes.length - i} 字节。`); break; }
    const value = bytes.slice(i, i + length); i += length;
    const known = fields[type], row = { offset, type, length, name: known?.[0] || `未知 TLV ${type}`, raw: hexBytes(value), sensitive: [2, 3, 4, 5, 7].includes(type) || !known, value: '', error: '' };
    if (seen.has(type)) errors.push(`偏移 ${offset}：${row.name} 重复出现。`); seen.add(type);
    try {
      if (known?.[1] !== null && known?.[1] !== undefined) ensure(length === known[1], `${row.name} 应为 ${known[1]} 字节，实际 ${length}。`);
      row.value = decode(type, value, warnings);
      if (!known) warnings.push(`TLV ${type} 未解释，仅保留原始内容。`);
    } catch (error) { row.error = error.message; errors.push(`偏移 ${offset}：${error.message}`); }
    rows.push(row);
  }
  const pending = seen.has(51) || seen.has(52);
  const missing = [...requiredActive, ...(pending ? [51, 52] : [])].filter(t => !seen.has(t)).map(t => fields[t][0]);
  if (missing.length) warnings.push(`按完整 ${pending ? 'Pending' : 'Active'} Dataset 检查，缺少：${missing.join('、')}。可能是部分 Dataset。`);
  return { bytes: bytes.length, rows, errors, warnings: [...new Set(warnings)], pending, missing };
}
// Constructed teaching data only, not credentials from a real Thread network.
export const DATASET_EXAMPLE = '000300000F010212340208102030405060708003084C61622D44656D6F041000112233445566778899AABBCCDDEEFF0510FFEEDDCCBBAA998877665544332211000708FD102030405060700C0402A0F7F80E08000000000001000035060004001FFFE0';
