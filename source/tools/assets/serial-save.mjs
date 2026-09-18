import { LineStream } from "./serial-core.mjs";
const encoder = new TextEncoder();

// 每次 close 后才把字节计入已保存；待提交队列独立于终端显示缓存。
export class AutoSave {
  constructor({ onChange = () => {}, onError = () => {}, maxPending = 8 * 1024 * 1024 } = {}) {
    this.onChange = onChange; this.onError = onError; this.maxPending = maxPending;
    this.state = "idle"; this.parts = []; this.pendingBytes = 0; this.savedBytes = 0;
    this.inFlight = null; this.stopping = null; this.timer = null;
  }
  changed() { this.onChange(this); }
  async start(handle, { format = "text", timestamps = true, includeTX = false, encoding = "utf-8", interval = 2000 } = {}) {
    if (!["idle", "stopped"].includes(this.state) || this.pendingBytes) throw new Error("上一轮自动保存尚未结束。");
    this.state = "starting"; this.changed();
    let writable;
    try {
      this.handle = handle; this.offset = (await handle.getFile()).size;
      this.format = format; this.timestamps = timestamps; this.includeTX = includeTX;
      this.streams = { RX: new LineStream(encoding), TX: new LineStream("utf-8") };
      this.lastAt = {}; this.savedBytes = 0; this.error = null;
      // 先确认可写权限，保留既有内容；用户选择已有文件时不会清空。
      writable = await handle.createWritable({ keepExistingData: true });
      await writable.close();
      this.state = "recording";
      this.timer = setInterval(() => this.flush(), interval); this.changed();
    } catch (error) { try { await writable?.abort(); } catch { /* 流可能已结束。 */ } this.fail(error); }
  }
  fail(error) {
    clearInterval(this.timer); this.timer = null; this.error = error;
    if (this.format === "text" && this.streams) {
      for (const direction of ["RX", "TX"]) {
        for (const text of this.streams[direction].push(undefined, true)) {
          const stamp = this.timestamps ? `[${new Date(this.lastAt[direction] ?? Date.now()).toISOString()}] ` : "";
          const bytes = encoder.encode(`${stamp}[${direction} 片段] ${text}\n`);
          if (this.pendingBytes + bytes.length <= this.maxPending) { this.parts.push(bytes); this.pendingBytes += bytes.length; }
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
    this.parts.push(bytes); this.pendingBytes += bytes.length;
  }
  line(direction, text, at, partial = false) {
    const stamp = this.timestamps ? `[${new Date(at).toISOString()}] ` : "";
    this.enqueue(encoder.encode(`${stamp}[${direction}${partial ? " 片段" : ""}] ${text}\n`));
  }
  add(direction, bytes, at = Date.now()) {
    if (this.state !== "recording" || (direction === "TX" && (!this.includeTX || this.format === "raw"))) return;
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
  flush() {
    if (this.inFlight) return this.inFlight;
    if (!["recording", "stopping"].includes(this.state)) return Promise.resolve();
    this.drain();
    if (this.state === "error" || !this.parts.length) { this.changed(); return Promise.resolve(); }
    this.inFlight = this.commit().finally(() => { this.inFlight = null; this.changed(); });
    return this.inFlight;
  }
  async commit() {
    const count = this.parts.length, parts = this.parts.slice(0, count), size = parts.reduce((sum, part) => sum + part.length, 0);
    let writable;
    try {
      if ((await this.handle.getFile()).size !== this.offset) throw new Error("自动保存文件大小被其他程序改变，已停止，避免覆盖外部修改。");
      writable = await this.handle.createWritable({ keepExistingData: true });
      await writable.seek(this.offset);
      await writable.write(new Blob(parts));
      await writable.close();
      this.offset += size; this.savedBytes += size; this.parts.splice(0, count); this.pendingBytes -= size;
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
    const parts = this.parts.slice(); this.parts = []; this.pendingBytes = 0; this.state = "stopped"; this.changed();
    return parts;
  }
}
