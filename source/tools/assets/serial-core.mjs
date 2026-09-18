const encoder = new TextEncoder();
export function encodeSend(input, { hex = false, escapes = false, ending = "" } = {}) {
  if (input.length > 65536) throw new Error("单次发送内容最多 64 KiB 字符。");
  let bytes;
  if (hex) {
    const normalized = input.trim().replace(/0x([0-9a-f]{2})/gi, "$1");
    if (!/^(?:[0-9a-f]{2})+(?:[\s,:]+(?:[0-9a-f]{2})+)*$/i.test(normalized)) {
      throw new Error("HEX 需成对，例如 01 02 FF 或 0102FF；不接受奇数位和非法字符。");
    }
    bytes = Uint8Array.from(normalized.replace(/[\s,:]/g, "").match(/../g), (v) => parseInt(v, 16));
  } else {
    if (escapes) input = input.replace(/\\(x[0-9a-f]{2}|[rnt\\])|\\(.)|\\$/gi, (all, valid) => {
      if (!valid) throw new Error("转义仅支持 \\r、\\n、\\t、\\\\、\\x00 到 \\x7F；其他字节请用 HEX。");
      if (valid[0] === "x" || valid[0] === "X") {
        const code = parseInt(valid.slice(1), 16);
        if (code > 127) throw new Error("文本中的 \\xNN 仅支持 ASCII；原始字节请用 HEX。");
        return String.fromCharCode(code);
      }
      return { r: "\r", n: "\n", t: "\t", "\\": "\\" }[valid.toLowerCase()];
    });
    bytes = encoder.encode(input);
  }
  if (!["", "\r", "\n", "\r\n"].includes(ending)) throw new Error("无效的发送结束符。");
  const suffix = encoder.encode(ending);
  if (bytes.length + suffix.length === 0) throw new Error("请输入发送内容。");
  if (bytes.length + suffix.length > 65536) throw new Error("单次发送最多 64 KiB 字节。");
  return Uint8Array.from([...bytes, ...suffix]);
}

export function hexText(bytes) { return Array.from(bytes, (v) => v.toString(16).padStart(2, "0").toUpperCase()).join(" "); }
export function visibleText(text, controls = false, stripAnsi = true) {
  if (stripAnsi) text = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => controls ? `<${c.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()}>` : "");
}

// 解码器跨读取批次保留 UTF-8/GB18030 状态；CRLF 即使分在两批也只产生一次换行。
export class LineStream {
  constructor(encoding = "utf-8", maxLine = 4096) { this.decoder = new TextDecoder(encoding); this.maxLine = maxLine; this.pending = ""; this.afterCR = false; }
  push(bytes, final = false) {
    const text = this.decoder.decode(bytes, { stream: !final });
    const lines = [];
    for (const ch of text) {
      if (this.afterCR && ch === "\n") { this.afterCR = false; continue; }
      this.afterCR = false;
      if (ch === "\r" || ch === "\n") {
        lines.push(this.pending); this.pending = ""; this.afterCR = ch === "\r";
      } else {
        this.pending += ch;
        if (this.pending.length >= this.maxLine) { lines.push(this.pending); this.pending = ""; }
      }
    }
    if (final && this.pending) { lines.push(this.pending); this.pending = ""; }
    return lines;
  }
}

export class TrafficLog {
  constructor({ encoding = "utf-8", maxBytes = 8 * 1024 * 1024, maxRecords = 4096, maxLines = 5000 } = {}) {
    this.streams = { RX: new LineStream(encoding), TX: new LineStream("utf-8") };
    this.maxBytes = maxBytes; this.maxRecords = maxRecords; this.maxLines = maxLines;
    this.records = []; this.lines = []; this.bytes = 0; this.droppedBytes = 0; this.droppedLines = 0;
    this.counts = { RX: 0, TX: 0 }; this.sequence = 0; this.pendingMeta = {};
  }
  addLine(direction, text, at, sequence = ++this.sequence) {
    this.lines.push({ direction, text, at, sequence });
    if (this.lines.length > this.maxLines) { this.lines.shift(); this.droppedLines++; }
  }
  add(direction, bytes, at = Date.now()) {
    this.counts[direction] += bytes.length;
    // 分块限制单次渲染与导出工作量；分块边界不代表设备协议帧。
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      const part = bytes.slice(offset, offset + 4096);
      this.records.push({ direction, bytes: part, at }); this.bytes += part.length;
      while (this.bytes > this.maxBytes || this.records.length > this.maxRecords) {
        const removed = this.records.shift(); this.bytes -= removed.bytes.length; this.droppedBytes += removed.bytes.length;
      }
      const stream = this.streams[direction];
      const meta = this.pendingMeta[direction] ?? { at, sequence: ++this.sequence };
      let first = true;
      for (const line of stream.push(part)) {
        this.addLine(direction, line, first ? meta.at : at, first ? meta.sequence : ++this.sequence); first = false;
      }
      this.pendingMeta[direction] = stream.pending ? (first ? meta : { at, sequence: ++this.sequence }) : null;
    }
  }
  finish() {
    for (const direction of ["RX", "TX"]) {
      const meta = this.pendingMeta[direction] ?? { at: Date.now(), sequence: ++this.sequence };
      for (const text of this.streams[direction].push(undefined, true)) this.addLine(direction, text, meta.at, meta.sequence);
      this.pendingMeta[direction] = null;
    }
  }
  textRows() {
    const rows = this.lines.slice();
    for (const direction of ["RX", "TX"]) {
      const text = this.streams[direction].pending;
      if (text) rows.push({ direction, text, ...this.pendingMeta[direction] });
    }
    return rows.sort((a, b) => a.sequence - b.sequence);
  }
  hexRows(limit = 1500) {
    const rows = [];
    for (let i = this.records.length - 1; i >= 0 && rows.length < limit; i--) {
      const record = this.records[i];
      for (let offset = Math.floor((record.bytes.length - 1) / 16) * 16; offset >= 0 && rows.length < limit; offset -= 16) {
        const bytes = record.bytes.slice(offset, offset + 16);
        const ascii = Array.from(bytes, (b) => b >= 32 && b <= 126 ? String.fromCharCode(b) : ".").join("");
        rows.push({ direction: record.direction, at: record.at, text: `${hexText(bytes).padEnd(47)}  |${ascii}|` });
      }
    }
    return rows.reverse();
  }
  raw(direction) { return this.records.filter((v) => v.direction === direction).map((v) => v.bytes); }
}

export function filterRows(rows, { include = "", exclude = "", caseSensitive = false, rx = true, tx = true, system = true } = {}) {
  const fold = (v) => caseSensitive ? v : v.toLowerCase();
  const includes = include.split("|").map((v) => fold(v.trim())).filter(Boolean);
  const excludes = exclude.split("|").map((v) => fold(v.trim())).filter(Boolean);
  return rows.filter((row) => {
    if ((row.direction === "RX" && !rx) || (row.direction === "TX" && !tx) || (row.direction === "SYS" && !system)) return false;
    const text = fold(row.text);
    return (!includes.length || includes.some((v) => text.includes(v))) && !excludes.some((v) => text.includes(v));
  });
}
