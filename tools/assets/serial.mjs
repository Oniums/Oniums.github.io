import { TrafficLog, encodeSend, hexText, visibleText, filterRows, ReceiveWarnings, localTimestamp } from "./serial-core.mjs?v=20260918-local-time";
import { SerialConnection } from "./serial-port.mjs?v=20260918-local-time";
import { AutoSave } from "./serial-save.mjs?v=20260918-local-time";

const $ = (id) => document.getElementById(id);
const checked = (id) => $(id).checked;
const endings = { none: "", cr: "\r", lf: "\n", crlf: "\r\n" };
let log = new TrafficLog(), paused = false, dirty = true, connectedAt = 0, elapsed = 0;
let previousRX = 0, previousTime = performance.now(), lastRate = 0;
let history = [], commands = [], repeatJob = null, repeatTimer = null, lastRows = [];
const supported = isSecureContext && "serial" in navigator;
const saveSupported = isSecureContext && typeof window.showSaveFilePicker === "function";
const directorySupported = isSecureContext && typeof window.showDirectoryPicker === "function";
let saving = null, choosingFile = false;
const receiveWarnings = new ReceiveWarnings();
function readWarning(error) {
  const at = Date.now(), summary = receiveWarnings.record(error, at);
  log.interruptRX(); saving?.interruptRX(summary, at);
  $("warning-count").textContent = receiveWarnings.total.toLocaleString();
  $("serial-warning").hidden = false;
  $("serial-warning").textContent = `接收告警累计 ${receiveWarnings.total} 次：${receiveWarnings.message}。正在尝试继续接收，错误位置可能丢失字节。请核对波特率、数据位、校验位、停止位与接线。相同接收告警合并显示，每 5 秒最多一条摘要。`;
  if (summary) system(summary);
  dirty = true;
}
function finishWarnings() {
  const summary = receiveWarnings.summary();
  if (summary) { system(summary); saving?.interruptRX(summary); }
}
function saveState() {
  const timed = $("save-mode").value === "timed";
  const busy = choosingFile || ["starting", "recording", "stopping"].includes(saving?.state) || Boolean(saving?.inFlight);
  $("save-options").disabled = busy;
  $("encoding").disabled = connection.state !== "idle" || busy;
  $("auto-save").checked = choosingFile || ["starting", "recording"].includes(saving?.state);
  $("auto-save").disabled = !(timed ? directorySupported : saveSupported) || choosingFile || ["starting", "stopping"].includes(saving?.state) || Boolean(saving?.inFlight && saving?.state === "error") || Boolean(saving?.state === "error" && saving.pendingBytes);
  $("save-now").disabled = saving?.state !== "recording" || Boolean(saving?.inFlight);
  $("save-rescue").hidden = saving?.state !== "error" || !saving.pendingBytes;
  $("save-rescue").disabled = Boolean(saving?.inFlight);
  const names = { idle: "未启用", starting: "正在确认文件权限", recording: "自动保存中", stopping: "正在完成保存", stopped: "保存已结束", error: "保存失败 · 已停止记录" };
  const files = saving?.rotationMinutes ? ` · 已生成 ${saving.fileCount} 个文件 · 每 ${saving.rotationMinutes} 分钟切换` : "";
  $("save-status").textContent = choosingFile ? `请选择保存${timed ? "目录" : "文件"}…` : saving ? `${names[saving.state]}${files} · ${saving.handle?.name ?? ""} · 已提交 ${saving.savedBytes.toLocaleString()} B · 待提交 ${saving.pendingBytes.toLocaleString()} B` : "未启用自动保存";
}
const stateNames = { idle: "未连接", choosing: "请选择串口…", opening: "正在打开…", open: "已连接", closing: "正在释放端口…", "close-error": "关闭失败，请重试断开" };
function notice(message) { $("notice").textContent = message; }
function system(message) { log.addLine("SYS", message, Date.now()); dirty = true; }
function report(error) {
  const help = { NetworkError: "检查设备连接、串口占用、驱动和所选参数。", SecurityError: "检查 HTTPS、浏览器策略和串口访问权限。", NotAllowedError: "浏览器未授予访问权限。" }[error.name] ?? "";
  $("error").textContent = `${error.message || error} ${help}`.trim(); $("error").hidden = false;
  system(`错误：${error.message || error}`);
}
function resetLog() {
  log = new TrafficLog({ encoding: $("encoding").value }); previousRX = 0; lastRate = 0; previousTime = performance.now(); dirty = true;
  notice("日志与收发计数已清空。");
}
function freshStreams() {
  log.finish();
  const fresh = new TrafficLog({ encoding: $("encoding").value });
  log.streams = fresh.streams; log.pendingMeta = {};
}
const connection = new SerialConnection({
  serial: navigator.serial,
  onState(state) {
    $("connection-state").textContent = stateNames[state];
    $("connect").disabled = !supported || state !== "idle";
    $("disconnect").disabled = !["open", "close-error"].includes(state);
    $("connection-options").disabled = state !== "idle";
    $("signal-controls").disabled = state !== "open";
    $("demo").disabled = state !== "idle";
    $("send").disabled = state !== "open" || Boolean(repeatJob);
    $("repeat").disabled = state !== "open" || Boolean(repeatJob);
    if (state === "open") {
      receiveWarnings.reset(); $("warning-count").textContent = "0"; $("serial-warning").hidden = true;
      if (checked("clear-connect")) resetLog(); else freshStreams();
      connectedAt = Date.now(); elapsed = 0;
      $("error").hidden = true; $("signals").textContent = "尚未读取";
      const info = connection.port.getInfo();
      const usb = info.usbVendorId === undefined ? "" : ` · USB ${info.usbVendorId.toString(16).padStart(4, "0")}:${info.usbProductId.toString(16).padStart(4, "0")}`;
      $("connection-state").textContent = `已连接 · ${$("baud").value} bps${usb}`;
      system(`串口已连接 · ${$("baud").value} / ${$("data-bits").value}${$("parity").value[0].toUpperCase()}${$("stop-bits").value} · ${$("encoding").value}`);
      $("rts").disabled = $("flow").value === "hardware";
    } else if (["closing", "idle", "close-error"].includes(state)) {
      stopRepeat();
      if (connectedAt && state !== "closing") {
        elapsed = Date.now() - connectedAt; connectedAt = 0; finishWarnings(); log.finish(); system("串口连接已结束。"); saving?.stop();
        if (receiveWarnings.total) $("serial-warning").textContent = `本次连接累计 ${receiveWarnings.total} 次可恢复接收告警，连接已结束；错误位置可能有数据缺失。`;
      }
    }
    dirty = true;
    $("monitor-connection").textContent = $("connection-state").textContent;
    saveState();
  },
  onData(bytes) { const at = Date.now(); log.add("RX", bytes, at); saving?.add("RX", bytes, at); dirty = true; },
  onError: report,
  onWarning: readWarning
});

$("support").textContent = supported ? "浏览器支持 Web Serial。选择串口后即可开始；首次使用会由浏览器请求授权。" : "当前环境不支持 Web Serial。请用桌面 Chrome / Edge，通过 HTTPS 或 localhost 打开；仍可载入演示体验显示与导出。";
$("connect").disabled = !supported;
function saveModeChanged() {
  const timed = $("save-mode").value === "timed", available = timed ? directorySupported : saveSupported;
  $("rotation-options").hidden = !timed;
  $("auto-save-label").textContent = `自动保存（勾选后选择${timed ? "目录" : "文件"}）`;
  $("save-support").textContent = available ? timed ? "选择一次本地目录并授权，按设定时长自动生成新文件；分文件间隔从启用保存时起算。" : "选择一次本地文件并授权，随后按所选间隔自动提交；选择已有文件时追加内容。" : `当前浏览器不支持${timed ? "目录写入" : "本地文件写入"}，请用桌面 Chrome / Edge；仍可手动导出日志。`;
  saveState();
}
$("save-mode").onchange = saveModeChanged;
saveModeChanged();
saveState();
$("auto-save").onchange = async () => {
  if (!checked("auto-save")) { await saving?.stop(); saveState(); return; }
  choosingFile = true; saveState();
  const format = $("save-format").value;
  try {
    const timed = $("save-mode").value === "timed", rotationMinutes = timed ? Number($("rotation-minutes").value) : 0;
    if (timed && (!Number.isInteger(rotationMinutes) || rotationMinutes < 1 || rotationMinutes > 1440)) throw new Error("分文件间隔请输入 1–1440 分钟的整数。");
    const handle = timed ? await window.showDirectoryPicker({ id: "serial-logs-directory", mode: "readwrite" }) : await window.showSaveFilePicker({
      id: "serial-auto-save", suggestedName: `serial-${localTimestamp(Date.now(), { filename: true })}.${format === "raw" ? "bin" : "log"}`,
      types: [{ description: format === "raw" ? "原始接收字节" : "UTF-8 串口日志", accept: format === "raw" ? { "application/octet-stream": [".bin"] } : { "text/plain": [".log", ".txt"] } }]
    });
    saving = new AutoSave({ onChange: saveState, onError: (error) => report(new Error(`自动保存：${error.message}`)) });
    await saving.start(handle, { format, timestamps: checked("save-timestamps"), includeTX: checked("save-tx"), encoding: $("encoding").value, interval: Number($("save-interval").value), rotationMinutes });
  } catch (error) { if (error.name !== "AbortError") report(error); }
  finally { choosingFile = false; saveState(); }
};
$("save-now").onclick = () => saving?.flush();
$("save-rescue").onclick = () => {
  try { download(saving.rescue(), saving.format === "raw" ? "-unsaved.bin" : "-unsaved.log", saving.format === "raw" ? "application/octet-stream" : "text/plain;charset=utf-8"); }
  catch (error) { report(error); }
};
$("save-format").onchange = () => { $("save-timestamps").disabled = $("save-tx").disabled = $("save-format").value === "raw"; };
$("connect").onclick = () => {
  const baudRate = Number($("baud").value);
  if (!Number.isInteger(baudRate) || baudRate < 1 || baudRate > 12000000) return report(new Error("波特率请输入 1–12000000 的整数，实际支持范围取决于设备。"));
  connection.connect({ baudRate, dataBits: Number($("data-bits").value), stopBits: Number($("stop-bits").value), parity: $("parity").value, flowControl: $("flow").value, bufferSize: 65536 });
};
$("disconnect").onclick = () => connection.disconnect();
navigator.serial?.addEventListener("disconnect", (event) => {
  if (event.target === connection.port || event.port === connection.port) { system("设备已拔出。"); connection.disconnect(); }
});
$("clear").onclick = () => { resetLog(); if (paused) render(true); };
$("pause").onclick = () => {
  paused = !paused; $("pause").textContent = paused ? "恢复画面" : "暂停画面"; $("pause").setAttribute("aria-pressed", String(paused));
  $("view-state").textContent = paused ? "画面已暂停 · 继续接收" : "实时视图"; dirty = true;
};
const monitor = document.querySelector(".receive-panel"), monitorDialog = $("monitor-dialog");
const monitorAnchor = document.createComment("receive-monitor-home"); monitor.before(monitorAnchor);
$("expand-monitor").onclick = () => {
  if (monitorDialog.open) { monitorDialog.close(); return; }
  monitorDialog.append(monitor); monitorDialog.showModal();
  $("expand-monitor").textContent = "还原窗口 · Esc"; $("expand-monitor").setAttribute("aria-expanded", "true");
  $("terminal").focus({ preventScroll: true });
};
monitorDialog.addEventListener("close", () => {
  monitorAnchor.after(monitor);
  $("expand-monitor").textContent = "展开日志窗口"; $("expand-monitor").setAttribute("aria-expanded", "false");
  $("expand-monitor").focus({ preventScroll: true });
});
function stamp(at) {
  return localTimestamp(at, { date: checked("date-stamps") }).replace("T", " ");
}
function rowsForView(all = false) {
  const hex = checked("hex-view");
  let rows = hex ? log.hexRows(all ? Infinity : 4000) : log.textRows();
  // 在显示转换前判断，避免误删普通空行或包含有效文本的 NUL 行；HEX 保留全部字节。
  if (!hex && checked("hide-nul")) rows = rows.filter((row) => row.direction !== "RX" || !/^\x00+$/.test(row.text));
  if (checked("hide-rx-warnings")) rows = rows.filter((row) => row.direction !== "SYS" || !row.text.startsWith("串口告警："));
  return filterRows(rows.map((row) => ({ ...row, text: visibleText(row.text, checked("show-controls"), checked("strip-ansi")) })), {
    include: $("include").value, exclude: $("exclude").value, caseSensitive: checked("case-sensitive"), rx: checked("show-rx"), tx: checked("show-tx"), system: checked("show-system")
  });
}
function prefix(row, index) {
  return `${checked("line-numbers") ? `${index + 1}  ` : ""}${checked("timestamps") ? `[${stamp(row.at)}] ` : ""}${checked("directions") ? `${row.direction}  ` : ""}`;
}
function markedText(element, text) {
  const keyword = $("highlight").value;
  if (!keyword) { element.append(document.createTextNode(text)); return; }
  const haystack = checked("case-sensitive") ? text : text.toLowerCase();
  const needle = checked("case-sensitive") ? keyword : keyword.toLowerCase();
  let from = 0, index;
  while ((index = haystack.indexOf(needle, from)) !== -1) {
    element.append(document.createTextNode(text.slice(from, index)));
    const mark = document.createElement("mark"); mark.textContent = text.slice(index, index + keyword.length); element.append(mark); from = index + keyword.length;
  }
  element.append(document.createTextNode(text.slice(from)));
}
function render(force = false) {
  if (paused && !force) return;
  const terminal = $("terminal"), scrollTop = terminal.scrollTop, scrollLeft = terminal.scrollLeft;
  lastRows = rowsForView().slice(-1500);
  terminal.className = `terminal size-${$("font-size").value} height-${$("terminal-height").value}${checked("wrap-lines") ? " wrap-lines" : ""}${checked("light-terminal") ? " light" : ""}`;
  const fragment = document.createDocumentFragment();
  for (const [index, row] of lastRows.entries()) {
    const line = document.createElement("div"); line.className = `terminal-row ${row.direction.toLowerCase()}`;
    if (checked("highlight-errors")) {
      if (row.direction === "SYS" && row.text.startsWith("串口告警：")) line.classList.add("warn");
      else if (/\b(error|fail(?:ed|ure)?|fatal)\b|错误|失败/i.test(row.text)) line.classList.add("error-line");
      else if (/\b(warn(?:ing)?|timeout)\b|警告|超时/i.test(row.text)) line.classList.add("warn");
    }
    const meta = document.createElement("span"); meta.className = "prefix"; meta.textContent = prefix(row, index); line.append(meta);
    markedText(line, row.text); fragment.append(line);
  }
  if (!lastRows.length) { const empty = document.createElement("div"); empty.className = "terminal-empty"; empty.textContent = "暂无匹配数据。连接设备或载入演示，也可以检查筛选条件。"; fragment.append(empty); }
  terminal.replaceChildren(fragment); terminal.scrollTop = checked("autoscroll") ? terminal.scrollHeight : scrollTop; terminal.scrollLeft = scrollLeft; dirty = false;
}
for (const element of document.querySelectorAll("#display-options input, .filter-details input, #font-size")) element.addEventListener("input", () => { dirty = true; if (paused) notice("画面已暂停，恢复后应用显示选项；文本导出使用当前选项。"); });
$("terminal-height").onchange = () => {
  const terminal = $("terminal"); terminal.style.removeProperty("height");
  for (const value of ["compact", "large", "tall"]) terminal.classList.toggle(`height-${value}`, $("terminal-height").value === value);
};
setInterval(() => { if (dirty) render(); }, 120);
setInterval(() => {
  const now = performance.now();
  lastRate = connection.state === "open" ? Math.round((log.counts.RX - previousRX) * 1000 / (now - previousTime)) : 0;
  previousRX = log.counts.RX; previousTime = now;
  $("rx-count").textContent = log.counts.RX.toLocaleString(); $("tx-count").textContent = log.counts.TX.toLocaleString(); $("rx-rate").textContent = lastRate.toLocaleString();
  const seconds = Math.floor((connectedAt ? Date.now() - connectedAt : elapsed) / 1000);
  $("duration").textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((v) => String(v).padStart(2, "0")).join(":");
  $("buffer-state").textContent = `缓存 ${(log.bytes / 1024).toFixed(1)} KiB`;
  $("retention").textContent = `文本最近 5,000 行；原始数据最近 8 MiB / 4,096 块；画面最多 1,500 行（HEX 从最近 4,000 行筛选）。已淘汰 ${log.droppedLines.toLocaleString()} 行、${log.droppedBytes.toLocaleString()} 原始字节。导出仅包含仍在缓存中的数据。`;
}, 500);

function sendOptions() { return { input: $("send-input").value, hex: checked("send-hex"), escapes: checked("send-escapes"), ending: $("ending").value }; }
function payload(options) { return encodeSend(options.input, { ...options, ending: endings[options.ending] }); }
function preview() {
  $("send-escapes").disabled = checked("send-hex");
  try { const bytes = payload(sendOptions()); $("send-preview").textContent = `${bytes.length} B → ${hexText(bytes.slice(0, 48))}${bytes.length > 48 ? " …" : ""}`; }
  catch (error) { $("send-preview").textContent = error.message; }
}
for (const id of ["send-input", "send-hex", "send-escapes", "ending"]) $(id).addEventListener("input", preview);
preview();
function fillCommand(command) {
  $("send-input").value = command.input; $("send-hex").checked = command.hex; $("send-escapes").checked = command.escapes; $("ending").value = command.ending; preview();
}
function remember(options) {
  const signature = JSON.stringify(options); history = [options, ...history.filter((entry) => JSON.stringify(entry) !== signature)].slice(0, 30);
  $("history").replaceChildren(new Option("选择后填入，不自动发送", ""), ...history.map((entry, index) => new Option(`${entry.hex ? "HEX" : "TXT"} · ${entry.input.slice(0, 50)}`, String(index))));
}
$("history").onchange = () => { if ($("history").value !== "") fillCommand(history[Number($("history").value)]); };
async function sendBytes(bytes) { await connection.write(bytes); const at = Date.now(); log.add("TX", bytes, at); saving?.add("TX", bytes, at); dirty = true; }
async function sendOnce() {
  if (repeatJob) return;
  const options = sendOptions();
  try {
    const bytes = payload(options); $("send").disabled = true;
    await sendBytes(bytes); remember(options); notice(`已写入 ${bytes.length} 字节。`);
    if (checked("clear-send") && $("send-input").value === options.input) { $("send-input").value = ""; preview(); }
  } catch (error) { report(error); }
  finally { $("send").disabled = connection.state !== "open" || Boolean(repeatJob); }
}
$("send").onclick = sendOnce;
$("send-input").onkeydown = (event) => {
  if (event.isComposing) return;
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey || (checked("enter-send") && !event.shiftKey))) { event.preventDefault(); if (!$("send").disabled) sendOnce(); }
};
function stopRepeat(message) {
  if (repeatJob) $("repeat-status").textContent = message || `已停止，本轮完成 ${repeatJob.sent} 次写入。`;
  repeatJob = null; clearTimeout(repeatTimer); repeatTimer = null;
  $("stop-repeat").disabled = true; $("repeat").disabled = connection.state !== "open"; $("send").disabled = connection.state !== "open";
}
$("stop-repeat").onclick = () => stopRepeat();
$("repeat").onclick = async () => {
  try {
    const interval = Number($("interval").value), limit = Number($("repeat-count").value), options = sendOptions(), bytes = payload(options);
    if (!Number.isInteger(interval) || interval < 100 || interval > 3600000) throw new Error("定时间隔需为 100–3600000 ms 的整数。");
    if (!Number.isInteger(limit) || limit < 0 || limit > 100000) throw new Error("次数需为 0–100000 的整数。");
    const job = { bytes, interval, limit, sent: 0 }; repeatJob = job; remember(options);
    $("stop-repeat").disabled = false; $("repeat").disabled = true; $("send").disabled = true;
    const tick = async () => {
      if (repeatJob !== job) return;
      try {
        await sendBytes(job.bytes); job.sent++;
        if (repeatJob !== job) return;
        $("repeat-status").textContent = `已发送 ${job.sent}${job.limit ? ` / ${job.limit}` : ""} 次 · 完成后等待 ${job.interval} ms`;
        if (job.limit && job.sent >= job.limit) stopRepeat(`定时发送完成，共 ${job.sent} 次。`);
        else repeatTimer = setTimeout(tick, job.interval);
      } catch (error) { if (repeatJob === job) stopRepeat(`发送失败，已停止；完成 ${job.sent} 次。`); report(error); }
    };
    await tick();
  } catch (error) { report(error); }
};
document.addEventListener("visibilitychange", () => { if (document.hidden && checked("stop-hidden")) stopRepeat("页面转到后台，定时发送已停止。"); });
window.addEventListener("beforeunload", (event) => { if (connection.state !== "idle" || choosingFile || ["starting", "recording", "stopping"].includes(saving?.state) || saving?.pendingBytes) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("pagehide", () => { stopRepeat(); connection.disconnect(); saving?.stop(); });

async function signals(apply) {
  try {
    const settings = { dataTerminalReady: checked("dtr"), break: checked("break-signal") };
    if ($("flow").value !== "hardware") settings.requestToSend = checked("rts");
    const result = await connection.signals(apply ? settings : undefined);
    $("signals").textContent = Object.entries(result).map(([key, value]) => `${key}: ${value ? "1" : "0"}`).join(" · ");
    if (apply) system("已应用手动信号线设置。");
  } catch (error) { report(error); }
}
$("apply-signals").onclick = () => signals(true); $("read-signals").onclick = () => signals(false);
function download(parts, suffix, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(parts, { type }));
  const a = document.createElement("a"); a.href = url; a.download = `serial-${localTimestamp(Date.now(), { filename: true })}${suffix}`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); notice(`已生成 ${suffix} 文件。`);
}
$("export-log").onclick = () => {
  const rows = rowsForView(true);
  download([rows.map((row, index) => prefix(row, index) + row.text).join("\n")], ".log");
};
$("export-rx").onclick = () => download(log.raw("RX"), "-rx.bin", "application/octet-stream");
$("export-tx").onclick = () => download(log.raw("TX"), "-tx.bin", "application/octet-stream");
$("export-json").onclick = () => download([JSON.stringify({ version: 1, exportedAt: localTimestamp(), droppedBytes: log.droppedBytes, counts: log.counts, records: log.records.map((r) => ({ direction: r.direction, at: localTimestamp(r.at), hex: hexText(r.bytes) })) }, null, 2)], ".json", "application/json");
$("copy").onclick = async () => {
  try { await navigator.clipboard.writeText($("terminal").innerText); notice("当前显示的日志已复制。"); }
  catch { report(new Error("剪贴板不可用，请选择日志复制，或导出 .log 文件。")); }
};
function renderCommands() {
  $("commands").replaceChildren(...commands.map((command, index) => {
    const row = document.createElement("div"); row.className = "command";
    const fill = document.createElement("button"); fill.textContent = `${command.hex ? "HEX" : "TXT"} · ${command.name}`; fill.title = "填入发送区，不自动发送"; fill.onclick = () => fillCommand(command);
    const remove = document.createElement("button"); remove.textContent = "×"; remove.setAttribute("aria-label", `删除命令 ${command.name}`); remove.onclick = () => { commands.splice(index, 1); renderCommands(); };
    row.append(fill, remove); return row;
  }));
}
$("save-command").onclick = () => {
  try {
    if (commands.length >= 30) throw new Error("最多保存 30 条快捷命令。");
    const command = sendOptions(); payload(command);
    commands.push({ ...command, name: $("command-name").value.trim() || command.input.slice(0, 25) || "结束符" }); renderCommands(); notice("已加入快捷命令，仅在当前页面保留。");
  } catch (error) { report(error); }
};
$("export-commands").onclick = () => download([JSON.stringify({ version: 1, commands }, null, 2)], "-commands.json", "application/json");
$("import-commands").onchange = async () => {
  try {
    const file = $("import-commands").files[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) throw new Error("命令集文件不能超过 2 MiB。");
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !Array.isArray(data.commands) || commands.length + data.commands.length > 30) throw new Error("命令集格式错误或合计超过 30 条。");
    const incoming = data.commands.map((c) => {
      if (!c || typeof c.name !== "string" || c.name.length > 40 || typeof c.input !== "string" || typeof c.hex !== "boolean" || typeof c.escapes !== "boolean" || !Object.hasOwn(endings, c.ending)) throw new Error("命令字段无效。");
      const command = { name: c.name, input: c.input, hex: c.hex, escapes: c.escapes, ending: c.ending }; payload(command); return command;
    });
    commands.push(...incoming); renderCommands(); notice(`已导入 ${incoming.length} 条命令，未执行。`);
  } catch (error) { report(error); }
  finally { $("import-commands").value = ""; }
};
$("demo").onclick = () => {
  resetLog(); const at = Date.now(), encoder = new TextEncoder();
  system("演示模式 · 以下为构造数据，未连接设备。");
  log.add("RX", encoder.encode("[boot] UART ready\r\n[info] 设备启动完成\r\n"), at);
  log.add("TX", encoder.encode("AT+VERSION?\r\n"), at + 100);
  log.add("RX", encoder.encode("version: demo-1.0\r\nOK\r\n[info] connected\r\n[warn] response timeout (example)\r\n[error] checksum failed (example)\r\n\x1b[32m[info] ANSI color sample\x1b[0m\r\nraw: \x00\x01\x02\r\n"), at + 150);
  log.finish(); dirty = true; if (paused) render(true); notice("演示日志已载入，没有访问串口。");
};
