// 纯计算模块：不访问网络、DOM 或浏览器存储。
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.";
const invalidPins = new Set([11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 12345678, 87654321]);
const permutation = [1, 5, 7, 6, 2, 8, 3, 0, 9, 4];
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

export function verhoeff(body) {
  requireValue(/^\d+$/.test(body), "校验输入必须是十进制数字。");
  let state = 0;
  [...body].reverse().forEach((char, i) => {
    let digit = Number(char);
    for (let j = 0; j < (i + 1) % 8; j++) digit = permutation[digit];
    if (state < 5) state = digit < 5 ? (state + digit) % 5 : (state + digit - 5) % 5 + 5;
    else state = digit < 5 ? (state - digit + 5) % 5 + 5 : (state - digit + 5) % 5;
  });
  return String(state > 0 && state < 5 ? 5 - state : state);
}

function validatePin(pin) {
  requireValue(Number.isInteger(pin) && pin >= 1 && pin <= 99999998 && !invalidPins.has(pin), "Setup Passcode 超出有效范围，或属于规范禁止的值。");
}
function validateIds(vid, pid) {
  requireValue(Number.isInteger(vid) && vid >= 0 && vid <= 0xfff4, "Vendor ID 超出当前支持的有效范围（0x0000～0xFFF4）。");
  requireValue(Number.isInteger(pid) && pid >= 0 && pid <= 65535 && (pid !== 0 || vid === 0), "Product ID 无效；非零 Vendor ID 不能搭配零 Product ID。");
}
export function decodeBase38(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i += 5) {
    const chunk = text.slice(i, i + 5);
    const length = { 2: 1, 4: 2, 5: 3 }[chunk.length];
    requireValue(length, "Base38 长度无效：末组必须是 2、4 或 5 个字符。");
    let value = 0;
    [...chunk].reverse().forEach((char, reverseIndex) => {
      const digit = alphabet.indexOf(char);
      requireValue(digit >= 0, `Base38 第 ${i + chunk.length - reverseIndex} 个字符无效。请保留原始大写内容。`);
      value = value * 38 + digit;
    });
    requireValue(value < 2 ** (length * 8), "Base38 分组溢出，不是规范编码。");
    for (let j = 0; j < length; j++) { bytes.push(value & 255); value >>>= 8; }
  }
  return Uint8Array.from(bytes);
}

export function manualFromFields({ discriminator, pin, flow, vid, pid }) {
  validatePin(pin); validateIds(vid, pid);
  requireValue(Number.isInteger(discriminator) && discriminator >= 0 && discriminator <= 4095, "Discriminator 必须在 0～4095 之间。");
  requireValue([0, 1, 2].includes(flow), "不支持保留的 Commissioning Flow。");
  const short = discriminator >> 8;
  const body = String((short >> 2) | (flow === 0 ? 0 : 4)) + String((pin & 0x3fff) | ((short & 3) << 14)).padStart(5, "0") + String(pin >> 14).padStart(4, "0") + (flow === 0 ? "" : String(vid).padStart(5, "0") + String(pid).padStart(5, "0"));
  return body + verhoeff(body);
}

export function parsePairing(input) {
  const text = input.trim();
  requireValue(text.length > 0, "请粘贴 MT: 开头的 QR 内容，或 11 / 21 位手动配对码。");
  requireValue(text.length <= 2048, "输入过长；本工具单次最多处理 2048 个字符。");
  if (text.startsWith("MT:")) {
    requireValue(!text.includes("*"), "首版只解析单设备 QR，请分别输入每个设备的载荷。");
    const bytes = decodeBase38(text.slice(3));
    requireValue(bytes.length >= 11, "QR 载荷不足 11 字节，基础字段不完整。");
    let value = 0n;
    for (let i = 10; i >= 0; i--) value = value * 256n + BigInt(bytes[i]);
    const field = (start, bits) => Number((value >> BigInt(start)) & ((1n << BigInt(bits)) - 1n));
    const result = { format: "qr", version: field(0, 3), vid: field(3, 16), pid: field(19, 16), flow: field(35, 2), discovery: field(37, 8), discriminator: field(45, 12), pin: field(57, 27), optionalBytes: bytes.length - 11, payload: text };
    requireValue(result.version === 0, "首版只支持 QR Payload Version 0。");
    requireValue(field(84, 4) === 0, "QR 的保留填充位必须为零。");
    result.manual = manualFromFields(result);
    result.short = result.discriminator >> 8;
    return result;
  }
  requireValue(/^[\d\s-]+$/.test(text), "手动码只接受数字、空格和连字符；QR 内容必须以 MT: 开头。");
  const code = text.replace(/[\s-]/g, "");
  requireValue(code.length === 11 || code.length === 21, `手动码长度为 ${code.length} 位，应为 11 或 21 位。`);
  requireValue(verhoeff(code.slice(0, -1)) === code.at(-1), "Verhoeff 校验失败，请检查是否抄错数字。");
  const first = Number(code[0]);
  const second = Number(code.slice(1, 6));
  const third = Number(code.slice(6, 10));
  requireValue(first <= 7 && second <= 65535 && third <= 8191, "手动码分组超出位宽范围。");
  const long = Boolean(first & 4);
  requireValue(long === (code.length === 21), "手动码的 VID/PID 标记与长度不一致。");
  const pin = (second & 0x3fff) + third * 16384;
  validatePin(pin);
  const vid = long ? Number(code.slice(10, 15)) : null;
  const pid = long ? Number(code.slice(15, 20)) : null;
  if (long) validateIds(vid, pid);
  return { format: "manual", manual: code, short: ((first & 3) << 2) | (second >> 14), pin, vid, pid, flow: long ? "non-standard" : 0 };
}

export function parseBytes(input) {
  const text = input.trim();
  requireValue(text, "请输入十六进制字节，例如 01 02 FF 80。");
  requireValue(text.length <= 4096, "输入过长；最多支持 256 字节。");
  const parts = text.split(/[\s,:]+/);
  const bytes = [];
  parts.forEach((part, index) => {
    const token = part.replace(/^0x/i, "");
    requireValue(/^[0-9a-f]+$/i.test(token), `第 ${index + 1} 组含有非十六进制字符。`);
    requireValue(token.length % 2 === 0, `第 ${index + 1} 组不是完整字节，请补足两位。`);
    for (let i = 0; i < token.length; i += 2) bytes.push(parseInt(token.slice(i, i + 2), 16));
  });
  requireValue(bytes.length <= 256, "最多支持 256 字节，请截取需要分析的片段。");
  return Uint8Array.from(bytes);
}
export const hexBytes = (bytes) => [...bytes].map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join(" ");
export const byteTypes = { uint8: 1, int8: 1, uint16: 2, int16: 2, uint32: 4, int32: 4, uint64: 8, int64: 8, float32: 4, float64: 8 };
export function inspectBytes(bytes, type, endian, offset = 0, low = 0, high = 3) {
  const size = byteTypes[type];
  requireValue(size, "不支持该数据类型。");
  requireValue(endian === "little" || endian === "big", "请选择大小端。");
  requireValue(Number.isInteger(offset) && offset >= 0 && offset + size <= bytes.length, `从该偏移解读 ${type} 需要完整的 ${size} 字节。`);
  requireValue(Number.isInteger(low) && Number.isInteger(high) && low >= 0 && high >= low && high < size * 8, `位域必须满足 0 ≤ 起始位 ≤ 结束位 ≤ ${size * 8 - 1}。`);
  const slice = bytes.slice(offset, offset + size);
  const ordered = endian === "little" ? [...slice].reverse() : [...slice];
  let raw = 0n;
  for (const byte of ordered) raw = raw * 256n + BigInt(byte);
  const bits = size * 8;
  const signed = raw >= (1n << BigInt(bits - 1)) ? raw - (1n << BigInt(bits)) : raw;
  const view = new DataView(slice.buffer);
  const value = type === "float32" ? view.getFloat32(0, endian === "little") : type === "float64" ? view.getFloat64(0, endian === "little") : type.startsWith("int") ? signed : raw;
  const field = (raw >> BigInt(low)) & ((1n << BigInt(high - low + 1)) - 1n);
  return { value, raw, signed, bits, field, hex: raw.toString(16).toUpperCase().padStart(size * 2, "0"), binary: raw.toString(2).padStart(bits, "0"), ascii: [...bytes].map((v) => v >= 32 && v <= 126 ? String.fromCharCode(v) : "·").join("") };
}
export function flipBit(bytes, type, endian, offset, bit) {
  const size = byteTypes[type];
  requireValue(size && Number.isInteger(bit) && bit >= 0 && bit < size * 8 && Number.isInteger(offset) && offset >= 0 && offset + size <= bytes.length, "位索引或字节窗口无效。");
  requireValue(endian === "little" || endian === "big", "请选择大小端。");
  const result = bytes.slice();
  const byte = endian === "little" ? Math.floor(bit / 8) : size - 1 - Math.floor(bit / 8);
  result[offset + byte] ^= 1 << (bit % 8);
  return result;
}

function finite(value, name, min = 0, max = 1e12) {
  requireValue(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max, `${name}必须是 ${min}～${max} 之间的有限数值。`);
}
export function powerBudget({ sleep, capacity, effective, activities }) {
  finite(sleep, "睡眠电流", 0, 1e9); finite(capacity, "电池容量", 0.001, 1e9); finite(effective, "有效容量比例", 0.001, 100);
  requireValue(Array.isArray(activities) && activities.length <= 12, "最多支持 12 种活动。");
  let duty = 0;
  const components = activities.map((item, i) => {
    finite(item.current, `活动 ${i + 1} 电流`, 0, 1e9);
    finite(item.duration, `活动 ${i + 1} 时长`, 0, 1e9);
    finite(item.interval, `活动 ${i + 1} 周期`, 0.001, 1e9);
    const share = item.duration / 1000 / item.interval;
    duty += share;
    return { name: item.name.trim() || `活动 ${i + 1}`, average: item.current * share, duty: share };
  });
  requireValue(duty <= 1 + 1e-12, "总活动时间超过 100%。本模型要求活动互不重叠，请调整时长或周期。");
  components.unshift({ name: "睡眠", average: sleep * Math.max(0, 1 - duty), duty: Math.max(0, 1 - duty) });
  const average = components.reduce((sum, c) => sum + c.average, 0);
  const hours = average === 0 ? Infinity : capacity * effective / 100 * 1000 / average;
  return { average, hours, dailyMah: average * 24 / 1000, duty, components };
}
