// 先运行 npm run prepare-pages，并通过本地 HTTP 服务提供 public/。
// PLAYWRIGHT_MODULE 指向已安装的 playwright/index.mjs；SERIAL_TEST_URL 可覆盖页面地址。
// 此测试仅使用模拟 Web Serial，不申请或操作真实硬件。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
const url = process.env.SERIAL_TEST_URL || "http://127.0.0.1:4175/tools/serial/";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, permissions: ["clipboard-read", "clipboard-write"] });
  await context.addInitScript(() => {
    const serial = new EventTarget();
    const mock = { writes: [], closed: 0, requested: 0, failWrite: false, failOpen: false, cancel: false, closeLocked: false, signals: null };
    const port = new EventTarget();
    port.open = async (options) => {
      if (mock.failOpen) throw new DOMException("port busy", "NetworkError");
      mock.options = options;
      port.readable = new ReadableStream({ start(controller) { mock.controller = controller; } });
      port.writable = new WritableStream({ async write(bytes) {
        if (mock.failWrite) throw new Error("simulated write error");
        mock.writes.push([...bytes]);
      } });
    };
    port.getInfo = () => ({ usbVendorId: 0x1234, usbProductId: 0x5678 });
    port.close = async () => { mock.closeLocked = Boolean(port.readable?.locked || port.writable?.locked); mock.closed++; };
    port.setSignals = async (signals) => { mock.signals = signals; };
    port.getSignals = async () => ({ clearToSend: true, dataSetReady: false, dataCarrierDetect: false, ringIndicator: false });
    serial.requestPort = async () => {
      mock.requested++;
      if (mock.cancel) throw new DOMException("cancel", "NotFoundError");
      return port;
    };
    mock.feed = (bytes) => mock.controller.enqueue(Uint8Array.from(bytes));
    mock.unplug = () => {
      mock.controller.error(new DOMException("unplugged", "NetworkError"));
      const event = new Event("disconnect"); Object.defineProperty(event, "port", { value: port }); serial.dispatchEvent(event);
    };
    window.serialMock = mock; Object.defineProperty(navigator, "serial", { value: serial, configurable: true });
    // 仅替换文件选择器；成功路径使用 Chromium 实际 FileSystemFileHandle 写入隔离测试目录。
    window.showSaveFilePicker = async () => {
      if (mock.cancelFile) throw new DOMException("cancel file", "AbortError");
      const directory = await navigator.storage.getDirectory();
      mock.fileHandle = await directory.getFileHandle("serial-autosave-test.log", { create: true });
      return {
        name: "serial-autosave-test.log",
        getFile: () => mock.fileHandle.getFile(),
        createWritable: (options) => {
          if (mock.failFile) throw new DOMException("simulated disk failure", "NotAllowedError");
          return mock.fileHandle.createWritable(options);
        }
      };
    };
  });
  const page = await context.newPage(), errors = [], requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(url, { waitUntil: "networkidle" });
  const loaded = requests.length;
  const click = (id) => page.locator(`#${id}`).click();
  const fill = (id, value) => page.locator(`#${id}`).fill(value);
  const check = (id, value = true) => page.locator(`#${id}`).setChecked(value);
  const text = (id) => page.locator(`#${id}`).innerText();
  const tick = () => page.waitForTimeout(180);
  const feed = (value) => page.evaluate((text) => window.serialMock.feed([...new TextEncoder().encode(text)]), value);
  const writeCount = () => page.evaluate(() => window.serialMock.writes.length);
  const open = async () => { await click("connect"); await page.waitForFunction(() => document.getElementById("connection-state").textContent.startsWith("已连接")); };
  const close = async () => { await click("disconnect"); await page.waitForFunction(() => document.getElementById("connection-state").textContent === "未连接"); };
  const download = async (id) => {
    const promise = page.waitForEvent("download"); await click(id);
    const file = await promise; return readFile(await file.path());
  };
  assert(await page.locator("#send").isDisabled());
  assert(await page.locator("input[type=checkbox]").count() >= 20);
  await click("demo"); await tick(); assert.match(await text("terminal"), /设备启动完成/);
  await fill("include", "error | timeout"); await tick(); assert.match(await text("terminal"), /checksum failed/); assert.doesNotMatch(await text("terminal"), /UART ready/);
  await fill("exclude", "checksum"); await tick(); assert.doesNotMatch(await text("terminal"), /checksum failed/);
  await fill("include", ""); await fill("exclude", ""); await fill("highlight", "connected"); await tick(); assert.equal(await page.locator("#terminal mark").count(), 1);
  await check("hex-view"); await tick(); assert.match(await text("terminal"), /41 54 2B/); await check("hex-view", false);
  await check("show-controls"); await tick(); assert.match(await text("terminal"), /<00><01><02>/);
  await check("timestamps", false); await check("directions", false); await tick(); assert((await text("terminal")).startsWith("演示模式"));
  await check("timestamps"); await check("directions"); await check("line-numbers"); await check("date-stamps"); await check("light-terminal"); await tick();
  assert.match(await text("terminal"), /^1  \[\d{4}-/); await check("line-numbers", false);
  await check("light-terminal", false); await fill("highlight", "");
  await page.screenshot({ path: process.env.SERIAL_SCREENSHOT || "/tmp/oniums-serial-desktop.png", fullPage: true });

  await page.evaluate(() => { window.serialMock.cancel = true; }); await click("connect"); await tick(); assert(await page.locator("#connect").isEnabled());
  await page.evaluate(() => { window.serialMock.cancel = false; window.serialMock.failOpen = true; }); await click("connect"); await tick(); assert.match(await text("error"), /port busy/);
  await page.evaluate(() => { window.serialMock.failOpen = false; });
  await open(); assert(await page.locator("#demo").isDisabled());
  assert.equal(await page.evaluate(() => window.serialMock.options.baudRate), 115200);
  assert.equal(await page.evaluate(() => window.serialMock.signals), null, "connection does not explicitly toggle signals");
  const original = [...new TextEncoder().encode("中文\r\n<svg onload=alert(1)>\npartial")];
  await page.evaluate((bytes) => { for (const byte of bytes) window.serialMock.feed([byte]); }, original);
  await tick(); assert.match(await text("terminal"), /中文/); assert.match(await text("terminal"), /<svg onload=alert\(1\)>/); assert.equal(await page.locator("#terminal svg").count(), 0);
  await click("pause"); const frozen = await text("terminal"); await feed(" continued\n"); await tick(); assert.equal(await text("terminal"), frozen);
  await click("pause"); await tick(); assert.match(await text("terminal"), /partial continued/);
  await fill("send-input", "AT"); await click("send"); assert.deepEqual(await page.evaluate(() => window.serialMock.writes.at(-1)), [65, 84, 13, 10]);
  await check("send-hex"); await fill("send-input", "01 FF"); await page.locator("#ending").selectOption("none"); await click("send");
  assert.deepEqual(await page.evaluate(() => window.serialMock.writes.at(-1)), [1, 255]);
  const beforeInvalid = await writeCount(); await fill("send-input", "01 F"); await click("send"); assert.equal(await writeCount(), beforeInvalid); assert.match(await text("error"), /HEX/);
  await check("send-hex", false); await check("send-escapes"); await fill("send-input", "A\\r\\n"); await click("send"); assert.deepEqual(await page.evaluate(() => window.serialMock.writes.at(-1)), [65, 13, 10]);
  await check("clear-send"); await check("enter-send"); await fill("send-input", "Q"); await page.locator("#send-input").press("Enter"); await tick(); assert.equal(await page.locator("#send-input").inputValue(), "");
  await check("clear-send", false); await check("enter-send", false); await check("send-escapes", false);
  await fill("send-input", "PING"); await fill("interval", "100"); await fill("repeat-count", "3");
  const beforeTimer = await writeCount(); await click("repeat"); await fill("send-input", "changed");
  await page.waitForFunction(() => document.getElementById("repeat-status").textContent.includes("共 3 次"));
  assert.equal(await writeCount(), beforeTimer + 3); assert.deepEqual(await page.evaluate(() => window.serialMock.writes.at(-1)), [...new TextEncoder().encode("PING")]);
  await fill("repeat-count", "0"); await click("repeat"); await click("stop-repeat"); const stopped = await writeCount(); await page.waitForTimeout(250); assert.equal(await writeCount(), stopped);
  await click("repeat"); await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); }); await tick(); assert.match(await text("repeat-status"), /后台/);
  await page.evaluate(() => { delete document.hidden; });

  await fill("command-name", "查询演示"); await fill("send-input", "AT+VERSION?"); await click("save-command");
  await fill("send-input", "changed"); const beforeFill = await writeCount(); await page.locator("#commands button").first().click(); assert.equal(await page.locator("#send-input").inputValue(), "AT+VERSION?"); assert.equal(await writeCount(), beforeFill);
  const commandJson = JSON.parse((await download("export-commands")).toString()); assert.equal(commandJson.commands[0].name, "查询演示");
  await page.locator("#import-commands").setInputFiles({ name: "commands.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(commandJson)) }); await tick(); assert.equal(await page.locator(".command").count(), 2);
  await page.locator("#import-commands").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"version":1,"commands":[{"name":"bad"}]}') }); await tick(); assert.equal(await page.locator(".command").count(), 2);
  await page.locator(".connection details summary").click(); await check("dtr"); await click("apply-signals"); assert.deepEqual(await page.evaluate(() => window.serialMock.signals), { dataTerminalReady: true, requestToSend: false, break: false });
  await click("read-signals"); assert.match(await text("signals"), /clearToSend: 1/);
  await page.locator(".receive-panel > details:last-child summary").click();
  await fill("include", "中文"); const rx = await download("export-rx"); assert.deepEqual([...rx], [...original, ...new TextEncoder().encode(" continued\n")]);
  const filtered = (await download("export-log")).toString(); assert.match(filtered, /中文/); assert.doesNotMatch(filtered, /continued/);
  const json = JSON.parse((await download("export-json")).toString()); assert(json.records.some((r) => r.direction === "TX"));
  await fill("include", ""); await tick(); await click("copy"); assert.match(await page.evaluate(() => navigator.clipboard.readText()), /中文/);
  await close(); assert.equal(await page.evaluate(() => window.serialMock.closeLocked), false);
  await open(); await tick(); assert.doesNotMatch(await text("terminal"), /continued/);
  await page.evaluate(() => window.serialMock.unplug()); await tick(); assert.equal(await text("connection-state"), "未连接");
  await open(); await page.evaluate(() => { window.serialMock.failWrite = true; }); await click("repeat"); await tick(); assert.match(await text("repeat-status"), /发送失败/); assert(await page.locator("#stop-repeat").isDisabled()); await close();
  await page.evaluate(() => { window.serialMock.failWrite = false; });
  await page.locator("#flow").selectOption("hardware"); await open(); assert(await page.locator("#rts").isDisabled()); await click("apply-signals"); assert.equal(await page.evaluate(() => "requestToSend" in window.serialMock.signals), false); await close();

  await page.evaluate(() => { window.serialMock.cancelFile = true; }); await click("auto-save"); await tick(); assert.equal(await page.locator("#auto-save").isChecked(), false);
  await page.evaluate(() => { window.serialMock.cancelFile = false; });
  await page.locator("#save-format").selectOption("raw"); await check("auto-save");
  await page.waitForFunction(() => document.getElementById("save-status").textContent.includes("自动保存中"));
  await open(); await feed("first\n"); await click("pause"); await fill("include", "hidden"); await click("clear"); await feed("second\n");
  await click("save-now"); await page.waitForFunction(() => document.getElementById("save-status").textContent.includes("已提交 13 B"));
  assert.equal(await page.evaluate(async () => (await window.serialMock.fileHandle.getFile()).text()), "first\nsecond\n");
  await feed("tail"); await close(); await page.waitForFunction(() => document.getElementById("save-status").textContent.includes("保存已结束"));
  assert.equal(await page.evaluate(async () => (await window.serialMock.fileHandle.getFile()).text()), "first\nsecond\ntail");
  await click("pause"); await fill("include", "");
  await page.locator("#save-format").selectOption("text"); await check("save-tx"); await check("auto-save");
  await page.waitForFunction(() => document.getElementById("save-status").textContent.includes("自动保存中"));
  await open(); await feed("中文\r\n"); await fill("send-input", "AT\r\n"); await click("send");
  await page.waitForFunction(() => document.getElementById("save-status").textContent.match(/已提交 [1-9]/));
  const savedText = await page.evaluate(async () => (await window.serialMock.fileHandle.getFile()).text());
  assert(savedText.startsWith("first\nsecond\ntail"), "existing file preserved"); assert.match(savedText, /\[RX\] 中文/); assert.match(savedText, /\[TX\] AT/);
  await feed("unsaved tail"); await page.evaluate(() => { window.serialMock.failFile = true; }); await click("save-now");
  await page.waitForFunction(() => document.getElementById("save-status").textContent.includes("保存失败"));
  assert(await page.locator("#auto-save").isDisabled());
  const rescue = (await download("save-rescue")).toString(); assert.match(rescue, /unsaved tail/);
  assert(await page.locator("#auto-save").isEnabled()); await close(); await page.evaluate(() => { window.serialMock.failFile = false; });

  await click("demo"); await tick();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `layout overflow ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 900 }); await page.screenshot({ path: "/tmp/oniums-serial-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(requests.slice(loaded).filter((u) => !u.startsWith("blob:")), [], "interaction makes no data network requests");
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.equal(await page.evaluate(async () => (await indexedDB.databases()).length), 0);
  const unsupported = await browser.newContext();
  await unsupported.addInitScript(() => { delete Navigator.prototype.serial; delete window.showSaveFilePicker; });
  const fallback = await unsupported.newPage(); await fallback.goto(url); assert(await fallback.locator("#connect").isDisabled());
  assert(await fallback.locator("#auto-save").isDisabled());
  await fallback.locator("#demo").click(); await fallback.waitForTimeout(180); assert.match(await fallback.locator("#terminal").innerText(), /UART ready/);
  await unsupported.close();
  console.log("PASS: serial interactions, automatic file save with real Chromium file streams, periodic commit, append, cache-independent capture, stop/disconnect flush, text/TX/raw modes, cancellation/failure/rescue, unsupported fallback, no data network or localStorage/IndexedDB, five viewport widths.");
} finally { await browser.close(); }
