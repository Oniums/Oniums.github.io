export const MAX_BIN_SIZE = 64 * 1024 * 1024;
export const offsetHex = n => `0x${n.toString(16).toUpperCase().padStart(8, '0')}`;
// Compare at identical offsets; a missing tail byte differs from every real byte.
export function compareBinary(a, b, limit = 5000) {
  const length = Math.max(a.length, b.length), ranges = [];
  let different = 0, first = null, start = null, rangeCount = 0;
  for (let i = 0; i <= length; i++) {
    if (i < length && a[i] !== b[i]) {
      different++;
      if (first === null) first = i;
      if (start === null) start = i;
    } else if (start !== null) {
      rangeCount++;
      if (ranges.length < limit) ranges.push({ start, end: i });
      start = null;
    }
  }
  return { length, different, first, ranges, rangeCount };
}
export function byteWindow(a, b, offset, size = 64) {
  const rows = [];
  for (let i = offset; i < Math.min(Math.max(a.length, b.length), offset + size); i++) {
    rows.push({ offset: i, a: a[i] ?? null, b: b[i] ?? null, changed: a[i] !== b[i] });
  }
  return rows;
}
