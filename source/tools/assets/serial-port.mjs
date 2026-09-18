// 串口所有权集中在这里，关闭时先终止读写再释放流锁。
export class SerialConnection {
  constructor({ serial, onState = () => {}, onData = () => {}, onError = () => {} }) {
    this.serial = serial; this.onState = onState; this.onData = onData; this.onError = onError;
    this.state = "idle"; this.port = null; this.reader = null; this.writer = null; this.writeTask = null; this.closing = null;
  }
  setState(state) { this.state = state; this.onState(state); }
  async connect(options) {
    if (this.state !== "idle") return;
    this.setState("choosing");
    try {
      this.port = await this.serial.requestPort();
      this.setState("opening");
      await this.port.open(options);
      this.setState("open");
      this.readTask = this.readLoop();
      this.readTask.then(() => { if (this.state === "open") this.disconnect(); });
    } catch (error) {
      this.port = null; this.setState("idle");
      if (error.name !== "NotFoundError") this.onError(error);
    }
  }
  async readLoop() {
    let failures = 0;
    while (this.state === "open" && this.port.readable) {
      try {
        this.reader = this.port.readable.getReader();
        while (this.state === "open") {
          const { value, done } = await this.reader.read();
          if (done) return;
          if (value?.length) { failures = 0; this.onData(value); }
        }
      } catch (error) {
        if (this.state === "open") this.onError(error);
        if (++failures >= 5) return;
      } finally { this.reader?.releaseLock(); this.reader = null; }
    }
  }
  async write(bytes) {
    if (this.state !== "open") throw new Error("请先连接串口。");
    if (this.writeTask) throw new Error("上一次发送尚未完成，请稍后重试。");
    const writer = this.port.writable.getWriter();
    this.writer = writer;
    const task = writer.write(bytes); this.writeTask = task;
    try { await task; }
    finally { writer.releaseLock(); this.writer = null; this.writeTask = null; }
  }
  disconnect() {
    if (this.closing) return this.closing;
    if (!["open", "close-error"].includes(this.state)) return Promise.resolve();
    this.setState("closing");
    this.closing = this.closePort().finally(() => { this.closing = null; });
    return this.closing;
  }
  async closePort() {
    try {
      await Promise.allSettled([this.reader?.cancel(), this.writer?.abort()]);
      await Promise.allSettled([this.readTask, this.writeTask]);
      await this.port.close();
      this.port = null; this.setState("idle");
    } catch (error) { this.setState("close-error"); this.onError(error); }
  }
  async signals(values) {
    if (this.state !== "open") throw new Error("请先连接串口。");
    if (values) await this.port.setSignals(values);
    return this.port.getSignals();
  }
}
