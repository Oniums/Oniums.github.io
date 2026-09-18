import { LineStream } from "./serial-core.mjs";
const encoder = new TextEncoder();

// 每次 close 后才把字节计入已保存；待提交队列独立于终端显示缓存。
export class AutoSave {
  constructor({ onChange = () => {}, onError = () => {}, maxPending = 8 * 1024 * 1024, now = () => performance.now(), wallNow = Date.now } = {}) {
    this.onChange = onChange; this.onError = onError; this.maxPending = maxPending;
    this.now = now; this.wallNow = wallNow; this.fileCount = 0;
    this.state = "idle"; this.parts = []; this.pendingBytes = 0; this.savedBytes = 0;
    this.inFlight = null; this.stopping = null; this.timer = null;
  }
  changed() { this.onChange(this); }
  async start(handle, { format = "text", timestamps = true, includeTX = false, encoding = "utf-8", interval = 2000, rotationMinutes = 0 } = {}) {
    if (!["idle", "stopped"].includes(this.state) || this.pendingBytes) throw new Error("上一轮自动保存尚未结束。");
    this.state = "starting"; this.changed();
    let writable;
    try {
      if (!Number.isInteger(rotationMinutes) || rotationMinutes < 0 || rotationMinutes > 1440) throw new Error("分文件间隔需为 1–1440 分钟的整数；0 表示单文件。");
      this.format = format; this.timestamps = timestamps; this.includeTX = includeTX;
      this.rotationMinutes = rotationMinutes; this.directory = rotationMinutes ? handle : null;
      this.fileCount = 0; this.segmentNumber = 0; this.sessionId = crypto.randomUUID().slice(0, 8);
      this.streams = { RX: new LineStream(encoding), TX: new LineStream("utf-8") };
      this.lastAt = {}; this.savedBytes = 0; this.error = null;
      if (this.directory) {
        this.segment = this.newSegment();
        await this.openSegment(this.segment);
        this.nextRotation = this.now() + rotationMinutes * 60000;
      } else {
        this.segment = { handle, name: handle.name, offset: (await handle.getFile()).size };
        this.fileCount = 1;
      }
      this.handle = this.segment.handle;
      // 先确认可写权限，保留既有内容；用户选择已有文件时不会清空。
      writable = await this.handle.createWritable({ keepExistingData: true });
      await writable.close();
      this.state = "recording";
      this.timer = setInterval(() => this.flush(), interval); this.changed();
    } catch (error) { try { await writable?.abort(); } catch { /* 流可能已结束。 */ } this.fail(error); }
  }
  newSegment() {
    const timestamp = new Date(this.wallNow()).toISOString().replace(/[:.]/g, "-");
    const number = String(++this.segmentNumber).padStart(6, "0");
    return { name: `serial-${timestamp}-${this.sessionId}-${number}.${this.format === "raw" ? "bin" : "log"}`, handle: null, offset: 0 };
  }
  async openSegment(segment) {
    if (segment.handle) return;
    const base = segment.name, dot = base.lastIndexOf(".");
    for (let attempt = 0; attempt < 100; attempt++) {
      const name = attempt ? `${base.slice(0, dot)}-${attempt}${base.slice(dot)}` : base;
      try { await this.directory.getFileHandle(name); }
      catch (error) {
        if (error.name === "TypeMismatchError") continue;
        if (error.name !== "NotFoundError") throw error;
        const handle = await this.directory.getFileHandle(name, { create: true });
        if ((await handle.getFile()).size !== 0) throw new Error("新分段文件已被其他程序写入，已停止以保护已有内容。");
        segment.handle = handle; segment.name = name; this.fileCount++;
        if (segment === this.segment) this.handle = handle;
        return;
      }
    }
    throw new Error("无法生成不重名的日志文件，请选择其他目录。");
  }
  checkRotation() {
    if (!this.directory || this.state !== "recording" || this.now() < this.nextRotation) return;
    // 旧文件收尾只排出已解码文本，跨界的多字节字符与 CRLF 状态留给下一文件。
    this.drain();
    if (this.state === "error") return;
    if (this.parts.length >= 32768) { this.fail(new Error("待保存分段过多，已停止记录，请下载待保存副本。")); return; }
    this.segment = this.newSegment(); this.handle = { name: this.segment.name };
    // 空标记保证无数据时也会创建下一文件，不为休眠期间补造空白文件。
    this.parts.push({ bytes: new Uint8Array(), segment: this.segment });
    const period = this.rotationMinutes * 60000;
    this.nextRotation += (Math.floor((this.now() - this.nextRotation) / period) + 1) * period;
    this.changed();
  }
  fail(error) {
    clearInterval(this.timer); this.timer = null; this.error = error;
    if (this.format === "text" && this.streams) {
      for (const direction of ["RX", "TX"]) {
        for (const text of this.streams[direction].push(undefined, true)) {
          const stamp = this.timestamps ? `[${new Date(this.lastAt[direction] ?? Date.now()).toISOString()}] ` : "";
          const bytes = encoder.encode(`${stamp}[${direction} 片段] ${text}\n`);
          if (this.pendingBytes + bytes.length <= this.maxPending) { this.parts.push({ bytes, segment: this.segment }); this.pendingBytes += bytes.length; }
          else error.message += "；末尾片段超出队列上限，未保留";
        }
      }
    }
    this.state = "error"; this.changed(); this.onError(error);
  }
  enqueue(bytes) {
    if (!bytes.length) return;
    if (this.pendingBytes + bytes.length > this.maxPending || this.parts.length >= 32768) {
      this.fail(new Error("自动保存写盘跟不上接收：待保存队列已达上限，已停止记录，触发上限的数据及后续数据未保存。请下载待保存副本，并检查磁盘。"));
      return;
    }
    this.parts.push({ bytes, segment: this.segment }); this.pendingBytes += bytes.length;
  }
  line(direction, text, at, partial = false) {
    const stamp = this.timestamps ? `[${new Date(at).toISOString()}] ` : "";
    this.enqueue(encoder.encode(`${stamp}[${direction}${partial ? " 片段" : ""}] ${text}\n`));
  }
  add(direction, bytes, at = Date.now()) {
    if (this.state !== "recording" || (direction === "TX" && (!this.includeTX || this.format === "raw"))) return;
    this.checkRotation();
    if (this.state !== "recording") return;
    if (this.format === "raw") this.enqueue(bytes.slice());
    else {
      this.lastAt[direction] = at;
      for (const text of this.streams[direction].push(bytes)) {
        this.line(direction, text, at);
        if (this.state === "error") break;
      }
    }
    this.changed();
  }
  drain(final = false) {
    if (this.format === "raw") return;
    for (const direction of ["RX", "TX"]) {
      if (direction === "TX" && !this.includeTX) continue;
      const stream = this.streams[direction];
      if (final) {
        for (const text of stream.push(undefined, true)) this.line(direction, text, this.lastAt[direction] ?? Date.now(), true);
      } else if (stream.pending) {
        this.line(direction, stream.pending, this.lastAt[direction] ?? Date.now(), true); stream.pending = "";
      }
      if (this.state === "error") return;
    }
  }
  interruptRX(message, at = Date.now()) {
    if (this.state !== "recording" || this.format === "raw") return;
    this.checkRotation();
    if (this.state !== "recording") return;
    const stream = this.streams.RX;
    for (const text of stream.push(undefined, true)) {
      this.line("RX", text, this.lastAt.RX ?? at, true);
      if (this.state === "error") return;
    }
    this.streams.RX = new LineStream(stream.decoder.encoding);
    if (message) this.line("SYS", message, at);
    this.changed();
  }
  flush() {
    this.checkRotation();
    if (this.inFlight) return this.inFlight;
    if (!["recording", "stopping"].includes(this.state)) return Promise.resolve();
    this.drain();
    if (this.state === "error" || !this.parts.length) { this.changed(); return Promise.resolve(); }
    this.inFlight = this.commit().finally(() => { this.inFlight = null; this.changed(); });
    return this.inFlight;
  }
  async commit() {
    let remaining = this.parts.length;
    let writable;
    try {
      while (remaining > 0) {
        const segment = this.parts[0].segment;
        let count = 0;
        while (count < remaining && this.parts[count].segment === segment) count++;
        const parts = this.parts.slice(0, count).map((entry) => entry.bytes), size = parts.reduce((sum, part) => sum + part.length, 0);
        await this.openSegment(segment);
        if ((await segment.handle.getFile()).size !== segment.offset) throw new Error("自动保存文件大小被其他程序改变，已停止，避免覆盖外部修改。");
        writable = await segment.handle.createWritable({ keepExistingData: true });
        await writable.seek(segment.offset);
        await writable.write(new Blob(parts));
        await writable.close(); writable = null;
        segment.offset += size; this.savedBytes += size; this.parts.splice(0, count); this.pendingBytes -= size; remaining -= count;
        this.changed();
      }
    } catch (error) {
      try { await writable?.abort(); } catch { /* 关闭失败后流可能已结束。 */ }
      this.fail(error);
    }
  }
  stop() {
    if (this.stopping) return this.stopping;
    if (this.state !== "recording") return this.inFlight ?? Promise.resolve();
    clearInterval(this.timer); this.timer = null; this.state = "stopping";
    this.drain(true); this.changed();
    this.stopping = (async () => {
      await this.inFlight;
      if (this.state !== "error") await this.flush();
      if (this.state !== "error") this.state = "stopped";
      this.changed();
    })().finally(() => { this.stopping = null; });
    return this.stopping;
  }
  rescue() {
    // 失败时保留未提交批次，允许另存副本。不能在写入未完成时取走它。
    if (this.state !== "error" || this.inFlight) throw new Error("请等待文件写入结束后再下载副本。");
    const parts = this.parts.map((entry) => entry.bytes); this.parts = []; this.pendingBytes = 0; this.state = "stopped"; this.changed();
    return parts;
  }
}
