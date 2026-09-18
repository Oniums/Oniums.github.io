import test from "node:test";
import assert from "node:assert/strict";
import { encodeSend, LineStream, TrafficLog, filterRows, visibleText } from "../source/tools/assets/serial-core.mjs";
import { SerialConnection } from "../source/tools/assets/serial-port.mjs";
import { AutoSave } from "../source/tools/assets/serial-save.mjs";
const enc = new TextEncoder();
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

test("HEX 严格校验、结束符与 UTF-8 字节数", () => {
  assert.deepEqual([...encodeSend("0x01,02:FF 80", { hex: true, ending: "\r\n" })], [1, 2, 255, 128, 13, 10]);
  assert.deepEqual([...encodeSend("0102ff", { hex: true })], [1, 2, 255]);
  assert.equal(encodeSend("你好").length, 6);
  assert.deepEqual([...encodeSend("", { ending: "\r" })], [13]);
  for (const input of ["", "1", "00 1", "GG", "0x", "AA,", "AA;FF", "0x001"]) assert.throws(() => encodeSend(input, { hex: true }));
  assert.throws(() => encodeSend("你".repeat(30000)));
  assert.throws(() => encodeSend("A".repeat(65537)));
});
test("转义不隐式修改任意二进制字节", () => {
  assert.deepEqual([...encodeSend("A\\r\\n\\t\\\\\\x00", { escapes: true })], [65, 13, 10, 9, 92, 0]);
  assert.equal(new TextDecoder().decode(encodeSend("\\n")), "\\n");
  for (const input of ["\\q", "\\xGG", "\\xFF", "\\"]) assert.throws(() => encodeSend(input, { escapes: true }));
});
test("UTF-8 在每一个字节边界拆分，CRLF 跨块不产生空行", () => {
  const stream = new LineStream(); const output = [];
  for (const byte of enc.encode("中文\r\n第二行\n\n末尾")) output.push(...stream.push(Uint8Array.of(byte)));
  assert.deepEqual(output, ["中文", "第二行", ""]);
  assert.equal(stream.pending, "末尾"); assert.deepEqual(stream.push(undefined, true), ["末尾"]);
});
test("GB18030 跨块解码与超长未换行数据有界", () => {
  const stream = new LineStream("gb18030", 4);
  assert.deepEqual(stream.push(Uint8Array.of(0xd6)), []);
  assert.deepEqual(stream.push(Uint8Array.of(0xd0, 10)), ["中"]);
  assert.deepEqual(stream.push(enc.encode("123456789")), ["1234", "5678"]); assert.equal(stream.pending, "9");
});
test("换行语义、关闭时补完残缺编码", () => {
  const stream = new LineStream();
  assert.deepEqual(stream.push(enc.encode("a\rb\r\r\nc\n")), ["a", "b", "", "c"]);
  stream.push(Uint8Array.of(0xe4)); assert.deepEqual(stream.push(undefined, true), ["�"]);
});
test("缓存淘汰明确计数，原始数据保持字节一致", () => {
  const log = new TrafficLog({ maxBytes: 6, maxRecords: 2, maxLines: 2 });
  const first = Uint8Array.of(0, 1); log.add("RX", first, 10); first[0] = 255;
  log.add("TX", Uint8Array.of(2, 3), 11); log.add("RX", Uint8Array.of(4, 5), 12);
  assert.equal(log.droppedBytes, 2); assert.equal(log.bytes, 4); assert.deepEqual(log.counts, { RX: 4, TX: 2 });
  assert.deepEqual(log.raw("RX").flatMap((v) => [...v]), [4, 5]);
  log.addLine("SYS", "one", 1); log.addLine("SYS", "two", 2); log.addLine("SYS", "three", 3);
  assert.equal(log.droppedLines, 1); assert.equal(log.lines[0].text, "two");
  const bounded = new TrafficLog({ maxBytes: 5000 }); bounded.add("RX", new Uint8Array(18000)); assert(bounded.bytes <= 5000);
});
test("原始 RX/TX 导出独立，文本跨方向不串行，尾行顺序保持", () => {
  const log = new TrafficLog();
  log.add("RX", enc.encode("first"), 1); log.add("TX", enc.encode("AT\r\n"), 2); log.add("RX", enc.encode(" line\r\nlast"), 3);
  assert.deepEqual(log.textRows().map((r) => r.text), ["first line", "AT", "last"]);
  log.finish(); assert.deepEqual(log.textRows().map((r) => r.text), ["first line", "AT", "last"]);
  assert.equal(new TextDecoder().decode(Uint8Array.from(log.raw("RX").flatMap((v) => [...v]))), "first line\r\nlast");
  assert.match(log.hexRows().find((r) => r.direction === "TX").text, /41 54 0D 0A/);
});
test("纯文本筛选与 ANSI 展示不修改原始数据", () => {
  const rows = [{ direction: "RX", text: "ERROR [a]" }, { direction: "RX", text: "ERROR heartbeat" }, { direction: "TX", text: "OK" }];
  assert.deepEqual(filterRows(rows, { include: "[a] | ok", exclude: "heartbeat", tx: false }), [rows[0]]);
  assert.equal(filterRows(rows, { include: "error", caseSensitive: true }).length, 0);
  assert.equal(visibleText("\x1b[32mhello\x1b[0m\x00", true), "hello<00>");
});

function fixture({ requestError, openError, closeOnce = false, writeError = false, writeDelay = 0 } = {}) {
  const states = [], errors = [], received = [], writes = []; let controller, closed = 0, opens = 0;
  const port = {
    async open(options) {
      if (openError) throw openError;
      opens++; this.options = options;
      this.readable = new ReadableStream({ start(c) { controller = c; } });
      this.writable = new WritableStream({ async write(bytes) { if (writeDelay) await new Promise((r) => setTimeout(r, writeDelay)); if (writeError) throw new Error("write failed"); writes.push([...bytes]); } });
    },
    async close() { assert.equal(this.readable.locked, false); assert.equal(this.writable.locked, false); if (closeOnce && !closed++) throw new Error("close failed"); closed++; },
    async setSignals(values) { this.signals = values; }, async getSignals() { return { clearToSend: true }; }
  };
  const connection = new SerialConnection({ serial: { async requestPort() { if (requestError) throw requestError; return port; } }, onState: (s) => states.push(s), onError: (e) => errors.push(e), onData: (v) => received.push([...v]) });
  return { connection, port, states, errors, received, writes, get controller() { return controller; }, get opens() { return opens; } };
}
test("串口收发、重复连接保护、关闭释放锁与重连", async () => {
  const f = fixture(); await f.connection.connect({ baudRate: 115200 }); await f.connection.connect({}); assert.equal(f.opens, 1);
  f.controller.enqueue(Uint8Array.of(1, 2)); await wait(); assert.deepEqual(f.received, [[1, 2]]);
  await f.connection.write(Uint8Array.of(3)); assert.deepEqual(f.writes, [[3]]);
  assert.deepEqual(await f.connection.signals({ dataTerminalReady: true }), { clearToSend: true });
  const closing = f.connection.disconnect(); assert.equal(f.connection.disconnect(), closing); await closing;
  assert.equal(f.connection.state, "idle"); await f.connection.connect({}); assert.equal(f.opens, 2); await f.connection.disconnect();
  assert.deepEqual(f.errors, []);
});
test("用户取消选择、拒绝打开均恢复可连接状态", async () => {
  const f = fixture({ requestError: new DOMException("cancel", "NotFoundError") }); await f.connection.connect({}); assert.equal(f.connection.state, "idle"); assert.equal(f.errors.length, 0);
  const g = fixture({ openError: new Error("busy") }); await g.connection.connect({}); assert.equal(g.connection.state, "idle"); assert.equal(g.errors.length, 1);
});
test("读错误与设备拔出自动释放端口", async () => {
  const f = fixture(); await f.connection.connect({});
  f.controller.error(new Error("unplugged"));
  // 物理断开后浏览器将 readable 置空。
  const old = f.port.readable; f.port.readable = null;
  f.port.close = async () => { assert.equal(old.locked, false); };
  for (let i = 0; i < 10 && f.connection.state !== "idle"; i++) await wait();
  assert.equal(f.connection.state, "idle"); assert.equal(f.errors.length, 1);
});
test("关闭失败保留端口供重试，不允许打开另一个端口", async () => {
  const f = fixture({ closeOnce: true }); await f.connection.connect({}); await f.connection.disconnect();
  assert.equal(f.connection.state, "close-error"); assert.equal(f.connection.port, f.port);
  await f.connection.connect({}); assert.equal(f.opens, 1); await f.connection.disconnect(); assert.equal(f.connection.state, "idle");
});
test("正在发送时拒绝第二笔，断开等待写锁释放", async () => {
  const f = fixture({ writeDelay: 20 }); await f.connection.connect({});
  const pending = f.connection.write(Uint8Array.of(1));
  await assert.rejects(f.connection.write(Uint8Array.of(2)), /尚未完成/);
  await Promise.all([pending, f.connection.disconnect()]); assert.equal(f.connection.state, "idle"); assert.deepEqual(f.writes, [[1]]);
});
test("写错误仍释放流锁，端口可以关闭", async () => {
  const f = fixture({ writeError: true }); await f.connection.connect({});
  await assert.rejects(f.connection.write(Uint8Array.of(1)), /write failed/);
  assert.equal(f.port.writable.locked, false); await f.connection.disconnect(); assert.equal(f.connection.state, "idle");
});

function fileFixture(initial = "") {
  let disk = enc.encode(initial), failWrite = false, failClose = false, release;
  const file = {
    name: "test.log", committed: 0,
    async getFile() { return { size: disk.length }; },
    async createWritable(options) {
      assert.equal(options.keepExistingData, true);
      let staged = disk.slice(), position = 0;
      return {
        async seek(offset) { position = offset; },
        async write(blob) {
          if (file.hold) await new Promise((resolve) => { release = resolve; });
          if (failWrite) throw new Error("disk full");
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const merged = new Uint8Array(Math.max(staged.length, position + bytes.length)); merged.set(staged); merged.set(bytes, position); staged = merged;
        },
        async close() { if (failClose) throw new Error("close failed"); disk = staged; file.committed++; },
        async abort() {}
      };
    },
    get bytes() { return disk; }, get text() { return new TextDecoder().decode(disk); },
    set failWrite(value) { failWrite = value; }, set failClose(value) { failClose = value; },
    release() { release?.(); }, changeExternally() { disk = enc.encode("externally changed file"); }
  };
  return file;
}
test("自动保存追加已有文件，提交成功才累计字节，原始 RX 不混入 TX", async () => {
  const file = fileFixture("existing\n"), save = new AutoSave(); await save.start(file, { format: "raw" });
  save.add("RX", Uint8Array.of(0, 255, 13, 10)); save.add("TX", Uint8Array.of(1));
  assert.equal(save.savedBytes, 0); assert.equal(save.pendingBytes, 4); assert.equal(file.text, "existing\n");
  await save.flush(); assert.equal(save.savedBytes, 4); assert.equal(save.pendingBytes, 0);
  assert.deepEqual([...file.bytes.slice(-4)], [0, 255, 13, 10]); await save.stop(); assert.equal(save.state, "stopped");
});
test("文本自动保存跨块中文、UTC 时间戳、TX 选项和无换行片段", async () => {
  const file = fileFixture(), save = new AutoSave(); await save.start(file, { includeTX: true });
  for (const byte of enc.encode("中文\r\n")) save.add("RX", Uint8Array.of(byte), 0);
  save.add("TX", enc.encode("AT\r\n"), 1); save.add("RX", enc.encode("partial"), 2);
  await save.flush(); assert.match(file.text, /\[1970-01-01T00:00:00.000Z\] \[RX\] 中文\n/);
  assert.match(file.text, /\[TX\] AT/); assert.match(file.text, /\[RX 片段\] partial/);
  save.add("RX", Uint8Array.of(0xe4), 3); await save.stop(); assert.match(file.text, /�/);
});
test("自动保存默认不含 TX，可关闭时间戳，周期自动提交", async () => {
  const file = fileFixture(), save = new AutoSave(); await save.start(file, { timestamps: false, interval: 10 });
  save.add("TX", enc.encode("secret\n")); save.add("RX", enc.encode("OK\n"));
  for (let i = 0; i < 40 && !save.savedBytes; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(file.text, "[RX] OK\n"); await save.stop();
});
test("慢速写入期间继续接收，停止等待全部已接受数据提交且不重复", async () => {
  const file = fileFixture(), save = new AutoSave(); await save.start(file, { format: "raw" }); file.hold = true;
  save.add("RX", Uint8Array.of(1, 2)); const flush = save.flush(); await wait();
  save.add("RX", Uint8Array.of(3, 4)); const stopped = save.stop();
  save.add("RX", Uint8Array.of(5)); file.hold = false; file.release(); await Promise.all([flush, stopped]);
  assert.deepEqual([...file.bytes], [1, 2, 3, 4]); assert.equal(save.savedBytes, 4); assert.equal(save.pendingBytes, 0);
});
test("磁盘写入与关闭失败保留待保存副本，停止继续记录", async () => {
  for (const failure of ["failWrite", "failClose"]) {
    const file = fileFixture("old"), errors = [], save = new AutoSave({ onError: (e) => errors.push(e) });
    await save.start(file, { format: "raw" }); file[failure] = true;
    save.add("RX", Uint8Array.of(1, 2, 3)); await save.flush();
    assert.equal(save.state, "error"); assert.equal(save.savedBytes, 0); assert.equal(save.pendingBytes, 3); assert.equal(file.text, "old");
    save.add("RX", Uint8Array.of(4)); assert.deepEqual([...new Uint8Array(await new Blob(save.rescue()).arrayBuffer())], [1, 2, 3]);
    assert.equal(save.state, "stopped"); assert.equal(errors.length, 1);
  }
});
test("写入失败时仍保留在途期间收到的未换行文本", async () => {
  const file = fileFixture(), save = new AutoSave(); await save.start(file, { timestamps: false }); file.hold = true;
  save.add("RX", enc.encode("first\n")); const flushing = save.flush(); await wait();
  save.add("RX", enc.encode("tail")); file.failWrite = true; file.release(); await flushing;
  assert.match(await new Blob(save.rescue()).text(), /\[RX 片段\] tail/);
});
test("自动保存检测外部文件变化与队列溢出，不覆盖或无限堆积", async () => {
  const file = fileFixture(), save = new AutoSave(); await save.start(file, { format: "raw" });
  save.add("RX", Uint8Array.of(1)); file.changeExternally(); await save.flush();
  assert.equal(save.state, "error"); assert.equal(file.text, "externally changed file");
  const bounded = new AutoSave({ maxPending: 3 }); await bounded.start(fileFixture(), { format: "raw" });
  bounded.add("RX", Uint8Array.of(1, 2)); bounded.add("RX", Uint8Array.of(3, 4));
  assert.equal(bounded.state, "error"); assert.equal(bounded.pendingBytes, 2); assert.match(bounded.error.message, /后续数据未保存/);
});
