import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { encodeSend, LineStream, TrafficLog, filterRows, visibleText, ReceiveWarnings, localTimestamp } from "../source/tools/assets/serial-core.mjs";
import { SerialConnection } from "../source/tools/assets/serial-port.mjs";
import { AutoSave } from "../source/tools/assets/serial-save.mjs";
const enc = new TextEncoder();
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

test("本地时间覆盖正负偏移、半小时时区、UTC、跨日及夏令时回拨", () => {
  const moduleURL = new URL("../source/tools/assets/serial-core.mjs", import.meta.url).href;
  const cases = [
    ["Asia/Shanghai", "2026-09-18T20:53:09.028Z", "2026-09-19T04:53:09.028+08:00"],
    ["Asia/Kolkata", "2026-09-18T08:53:09.028Z", "2026-09-18T14:23:09.028+05:30"],
    ["UTC", "2026-09-18T08:53:09.028Z", "2026-09-18T08:53:09.028+00:00"],
    ["America/New_York", "2026-11-01T05:30:00.000Z", "2026-11-01T01:30:00.000-04:00"],
    ["America/New_York", "2026-11-01T06:30:00.000Z", "2026-11-01T01:30:00.000-05:00"]
  ];
  for (const [timezone, instant, expected] of cases) {
    const script = `import { localTimestamp } from ${JSON.stringify(moduleURL)}; const at = ${JSON.stringify(instant)}; console.log(JSON.stringify([localTimestamp(at), localTimestamp(at, { filename: true }), localTimestamp(at, { date: false })]));`;
    const [stamp, filename, clock] = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ: timezone }, encoding: "utf8" }));
    assert.equal(stamp, expected); assert.equal(Date.parse(stamp), Date.parse(instant));
    assert.equal(clock, expected.slice(11));
    assert.equal(filename, expected.slice(0, -6).replace(/[:.]/g, "-") + expected.slice(-6).replace(":", ""));
    assert.doesNotMatch(filename, /[<>:"/\\|?*]/);
  }
});

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
  const states = [], errors = [], warnings = [], received = [], writes = []; let controller, closed = 0, opens = 0;
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
  const connection = new SerialConnection({ serial: { async requestPort() { if (requestError) throw requestError; return port; } }, onState: (s) => states.push(s), onError: (e) => errors.push(e), onWarning: (e) => warnings.push(e), onData: (v) => received.push([...v]) });
  return { connection, port, states, errors, warnings, received, writes, get controller() { return controller; }, get opens() { return opens; },
    readError() {
      const previous = controller;
      port.readable = new ReadableStream({ start(c) { controller = c; } });
      previous.error(new DOMException("Framing error", "FramingError"));
    }
  };
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
test("可恢复 Framing error 只发告警，重新获取读流后继续接收", async (t) => {
  const f = fixture(); t.after(() => f.connection.disconnect()); await f.connection.connect({});
  const oldStream = f.port.readable;
  f.readError(); await wait(); assert.equal(oldStream.locked, false); assert.equal(f.connection.state, "open");
  f.controller.enqueue(Uint8Array.of(65, 0, 66)); await wait();
  assert.deepEqual(f.received, [[65, 0, 66]]); assert.equal(f.warnings.length, 1); assert.equal(f.errors.length, 0);
});
test("连续五次读流异常且没有新数据时停止，不无限重试", async (t) => {
  const f = fixture(); t.after(() => f.connection.disconnect()); await f.connection.connect({});
  for (let i = 0; i < 5; i++) { f.readError(); await wait(); }
  assert.equal(f.connection.state, "idle"); assert.equal(f.warnings.length, 4); assert.equal(f.errors.length, 1);
  assert.match(f.errors[0].message, /连续 5 次/);
});
test("数据回调错误不会被误判为可恢复串口错误", async () => {
  const f = fixture(); await f.connection.connect({});
  f.connection.onData = () => { throw new Error("application callback failure"); };
  f.controller.enqueue(Uint8Array.of(1)); await wait();
  assert.equal(f.connection.state, "idle"); assert.equal(f.warnings.length, 0); assert.equal(f.errors.length, 1);
});
test("200 ms 告警风暴合并计数，每五秒最多一条摘要，收尾不漏计数", () => {
  const warnings = new ReceiveWarnings(), summaries = [];
  for (let i = 0; i < 80; i++) { const summary = warnings.record(new Error("Framing error"), i * 200); if (summary) summaries.push(summary); }
  assert.equal(warnings.total, 80); assert.equal(summaries.length, 4);
  assert.match(warnings.summary(16000), /累计 80 次，本次合并 4 次/); assert.equal(warnings.summary(17000), null);
  warnings.reset(); assert.equal(warnings.total, 0);
});
test("合法 NUL 连续或混在文本里不会触发网页读取错误，显示不改原始字节", async (t) => {
  const f = fixture(), log = new TrafficLog(); t.after(() => f.connection.disconnect()); await f.connection.connect({});
  const bytes = Uint8Array.from([...new Uint8Array(64), ...enc.encode("before\0after\r\n")]);
  f.controller.enqueue(bytes); await wait(); log.add("RX", Uint8Array.from(f.received[0]));
  assert.equal(f.errors.length, 0); assert.equal(f.warnings.length, 0); assert.equal(f.connection.state, "open");
  assert.deepEqual([...new Uint8Array(await new Blob(log.raw("RX")).arrayBuffer())], [...bytes]);
  assert.equal(visibleText(log.textRows()[0].text), "beforeafter");
  assert.match(visibleText(log.textRows()[0].text, true), /before<00>after/);
});
test("接收中断隔开残缺文本和解码状态，TX 不受影响", () => {
  const log = new TrafficLog(); log.add("RX", Uint8Array.from([...enc.encode("left"), 0xe4]));
  log.add("TX", enc.encode("AT")); log.interruptRX(); log.add("RX", enc.encode("right\n")); log.add("TX", enc.encode("?\n"));
  assert.deepEqual(log.textRows().filter((v) => v.direction === "RX").map((v) => v.text), ["left�", "right"]);
  assert.equal(log.textRows().find((v) => v.direction === "TX").text, "AT?");
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
test("文本自动保存跨块中文、本地时区时间戳、TX 选项和无换行片段", async () => {
  const file = fileFixture(), save = new AutoSave(); await save.start(file, { includeTX: true });
  for (const byte of enc.encode("中文\r\n")) save.add("RX", Uint8Array.of(byte), 0);
  save.add("TX", enc.encode("AT\r\n"), 1); save.add("RX", enc.encode("partial"), 2);
  await save.flush(); assert(file.text.includes(`[${localTimestamp(0)}] [RX] 中文\n`));
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
test("自动保存文本标记接收中断，原始模式不插入告警且保留 NUL", async () => {
  const textFile = fileFixture(), textSave = new AutoSave(); await textSave.start(textFile, { timestamps: false });
  textSave.add("RX", enc.encode("left")); textSave.interruptRX("串口告警：Framing error");
  textSave.add("RX", enc.encode("right")); textSave.interruptRX(null); await textSave.stop();
  assert.match(textFile.text, /\[RX 片段\] left\n\[SYS\] 串口告警：Framing error\n\[RX 片段\] right/);
  assert.equal(textFile.text.match(/\[SYS\]/g).length, 1);
  const rawFile = fileFixture(), rawSave = new AutoSave(); await rawSave.start(rawFile, { format: "raw" });
  rawSave.add("RX", Uint8Array.of(65, 0)); rawSave.interruptRX("Framing error"); rawSave.add("RX", Uint8Array.of(0, 66)); await rawSave.stop();
  assert.deepEqual([...rawFile.bytes], [65, 0, 0, 66]);
});

function directoryFixture() {
  return {
    files: new Map(), failCreate: false, collideNext: false,
    async getFileHandle(name, { create = false } = {}) {
      if (this.collideNext && !create) { this.files.set(name, fileFixture("existing content")); this.collideNext = false; }
      if (this.files.has(name)) return this.files.get(name);
      if (!create) throw new DOMException("missing", "NotFoundError");
      if (this.failCreate) throw new DOMException("directory permission revoked", "NotAllowedError");
      const file = fileFixture(); file.name = name; this.files.set(name, file); return file;
    }
  };
}
test("按小时边界分文件，原始字节不丢失、不重复且序号递增", async (t) => {
  const directory = directoryFixture(); let clock = 0;
  const save = new AutoSave({ now: () => clock, wallNow: () => Date.UTC(2026, 0, 1) + clock }); t.after(() => save.stop());
  await save.start(directory, { format: "raw", rotationMinutes: 60 });
  clock = 3599999; save.add("RX", Uint8Array.of(1, 2)); assert.equal(save.fileCount, 1);
  clock = 3600000; save.add("RX", Uint8Array.of(3, 4)); await save.flush();
  clock = 7200000; save.add("RX", Uint8Array.of(5)); await save.stop();
  assert.deepEqual([...directory.files.values()].map((file) => [...file.bytes]), [[1, 2], [3, 4], [5]]);
  assert.equal(save.fileCount, 3); assert.equal(save.savedBytes, 5); assert.equal(save.pendingBytes, 0);
  assert([...directory.files.keys()][1].startsWith(`serial-${localTimestamp(Date.UTC(2026, 0, 1, 1), { filename: true })}-`));
  assert.match([...directory.files.keys()][1], /-000002\.bin$/);
});
test("空闲时也轮换，后台迟到不补建中间空白文件", async (t) => {
  const directory = directoryFixture(); let clock = 0;
  const save = new AutoSave({ now: () => clock }); t.after(() => save.stop());
  await save.start(directory, { rotationMinutes: 60 }); clock = 3.5 * 3600000; await save.flush();
  assert.equal(save.fileCount, 2); assert.equal(save.nextRotation, 4 * 3600000);
  clock = 4 * 3600000; await save.flush(); assert.equal(save.fileCount, 3);
  assert([...directory.files.values()].every((file) => file.bytes.length === 0));
});
test("中文多字节和 CRLF 跨文件边界保持解码状态", async (t) => {
  const directory = directoryFixture(); let clock = 0;
  const save = new AutoSave({ now: () => clock }); t.after(() => save.stop());
  await save.start(directory, { rotationMinutes: 60, timestamps: false });
  save.add("RX", Uint8Array.from([...enc.encode("前"), 0xe4]));
  clock = 3600000; save.add("RX", Uint8Array.of(0xb8, 0xad, 13));
  clock = 7200000; save.add("RX", enc.encode("\n后\n")); await save.stop();
  const texts = [...directory.files.values()].map((file) => file.text);
  assert.deepEqual(texts, ["[RX 片段] 前\n", "[RX] 中\n", "[RX] 后\n"]);
  assert(!texts.join("").includes("�"));
});
test("旧文件写入在途时跨界继续接收，停止会提交所有已接受分段", async (t) => {
  const directory = directoryFixture(); let clock = 0;
  const save = new AutoSave({ now: () => clock }); t.after(() => save.stop());
  await save.start(directory, { rotationMinutes: 60, format: "raw" });
  const first = [...directory.files.values()][0]; first.hold = true;
  save.add("RX", Uint8Array.of(1)); const writing = save.flush(); await wait();
  clock = 3600000; save.add("RX", Uint8Array.of(2)); save.add("RX", Uint8Array.of(3));
  const stopping = save.stop(); first.hold = false; first.release(); await Promise.all([writing, stopping]);
  assert.deepEqual([...directory.files.values()].map((file) => [...file.bytes]), [[1], [2, 3]]);
  assert.equal(save.state, "stopped"); assert.equal(save.savedBytes, 3);
});
test("新分段创建失败保留旧文件与后续待保存数据", async (t) => {
  const directory = directoryFixture(); let clock = 0;
  const save = new AutoSave({ now: () => clock }); t.after(() => save.stop());
  await save.start(directory, { rotationMinutes: 60, format: "raw" });
  save.add("RX", Uint8Array.of(1)); clock = 3600000; save.add("RX", Uint8Array.of(2, 3));
  directory.failCreate = true; await save.flush(); save.add("RX", Uint8Array.of(4));
  assert.equal(save.state, "error"); assert.equal(save.savedBytes, 1);
  assert.deepEqual([...directory.files.values()][0].bytes, Uint8Array.of(1));
  assert.deepEqual([...new Uint8Array(await new Blob(save.rescue()).arrayBuffer())], [2, 3]);
});
test("旧分段写入失败不转入下一文件，副本保留全部未提交数据", async (t) => {
  const directory = directoryFixture(); let clock = 0;
  const save = new AutoSave({ now: () => clock }); t.after(() => save.stop());
  await save.start(directory, { rotationMinutes: 60, format: "raw" });
  [...directory.files.values()][0].failWrite = true;
  save.add("RX", Uint8Array.of(1)); clock = 3600000; save.add("RX", Uint8Array.of(2)); await save.flush();
  assert.equal(directory.files.size, 1); assert.equal(save.savedBytes, 0);
  assert.deepEqual([...new Uint8Array(await new Blob(save.rescue()).arrayBuffer())], [1, 2]);
});
test("生成文件遇到重名时换名，不追加或覆盖已有日志", async (t) => {
  const directory = directoryFixture(); let clock = 0;
  const save = new AutoSave({ now: () => clock }); t.after(() => save.stop());
  await save.start(directory, { rotationMinutes: 60, format: "raw" });
  directory.collideNext = true; clock = 3600000; save.add("RX", Uint8Array.of(9)); await save.stop();
  const files = [...directory.files.values()]; assert.equal(files.length, 3);
  assert.equal(files[1].text, "existing content"); assert.deepEqual(files[2].bytes, Uint8Array.of(9));
  assert.match(files[2].name, /000002-1\.bin$/); assert.equal(save.fileCount, 2);
});
test("拒绝非法分段时长，启动失败不创建文件", async () => {
  for (const rotationMinutes of [-1, 0.5, 1441, NaN]) {
    const directory = directoryFixture(), save = new AutoSave();
    await save.start(directory, { rotationMinutes }); assert.equal(save.state, "error"); assert.equal(directory.files.size, 0);
  }
});
