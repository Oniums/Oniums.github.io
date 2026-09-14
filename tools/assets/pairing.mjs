import { parsePairing } from "./calculations.mjs";
import { el, put, message, copyText } from "./common.mjs";

// 公开 Matter 开发示例；不包含用户或生产设备数据。
const example = "MT:Y.K9042C00KA0648G00";
let current = null;
let imageReady = false;
const flowNames = { 0: "Standard · 标准", 1: "User-intent · 用户操作", 2: "Custom · 自定义", "non-standard": "非标准 · 原始 flow 不可区分" };

function resetResult() {
  current = null; imageReady = false;
  el("pair-result").hidden = true; el("pair-empty").hidden = false;
  el("qr-result").hidden = true;
  el("pair-fields").replaceChildren();
  put("manual-code", ""); put("pair-warning", ""); put("pair-validation", "等待输入");
  put("pair-status", "");
  message("qr-error", "");
  el("qr-canvas").getContext("2d").clearRect(0, 0, el("qr-canvas").width, el("qr-canvas").height);
}
function addField(label, value, help) {
  const row = document.createElement("div"); row.className = "field-item";
  const dt = document.createElement("dt"); dt.textContent = label;
  const dd = document.createElement("dd"); dd.textContent = String(value);
  const small = document.createElement("small"); small.textContent = help;
  dd.append(small); row.append(dt, dd); el("pair-fields").append(row);
}
function makeQr(payload) {
  try {
    const qr = window.qrcode(0, "M"); qr.addData(payload, "Alphanumeric"); qr.make();
    const cells = qr.getModuleCount();
    const scale = Math.max(2, Math.floor(512 / (cells + 8)));
    const canvas = el("qr-canvas"); canvas.width = canvas.height = (cells + 8) * scale;
    const context = canvas.getContext("2d"); context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000000";
    for (let row = 0; row < cells; row++) for (let col = 0; col < cells; col++) if (qr.isDark(row, col)) context.fillRect((col + 4) * scale, (row + 4) * scale, scale, scale);
    imageReady = true; el("qr-result").hidden = false;
  } catch { message("qr-error", "二维码生成失败或内容超出图像容量；字段解析结果仍可查看。"); }
}
function parse() {
  resetResult(); message("pair-error", "");
  try {
    current = parsePairing(el("pair-input").value);
    el("pair-input").setAttribute("aria-invalid", "false");
    el("pair-empty").hidden = true; el("pair-result").hidden = false;
    const code = current.manual;
    put("manual-code", code.length === 11 ? `${code.slice(0, 4)}-${code.slice(4, 7)}-${code.slice(7)}` : code);
    put("pair-validation", current.optionalBytes ? "基础字段通过 · TLV 未校验" : "格式与校验通过");
    const hexId = (id) => id === null ? "未包含" : `0x${id.toString(16).toUpperCase().padStart(4, "0")} / ${id}`;
    addField("输入类型", current.format === "qr" ? "Matter QR 载荷" : `${code.length} 位手动码`, "按原始内容解析，不推断设备型号。");
    addField("Commissioning Flow", flowNames[current.flow], "进入配网模式所需的交互方式。");
    addField("Vendor ID", hexId(current.vid), "厂商标识；标准手动码不包含此字段。");
    addField("Product ID", hexId(current.pid), "产品标识；不能单凭数值证明产品身份。");
    addField("Short Discriminator", current.short, "4 位短标识，供配网发现匹配使用。");
    addField("Full Discriminator", current.discriminator ?? "未包含，不能还原", "QR 携带 12 位完整值，手动码只保留高 4 位。");
    addField("Setup Passcode", String(current.pin).padStart(8, "0"), "参与 PASE 的口令，不是 Thread 网络密钥。");
    addField("Verhoeff", "通过", current.format === "qr" ? "对派生手动码校验；QR 基础字段另行检查。" : "校验原始手动码最后一位。");
    if (current.format === "qr") {
      const names = ["SoftAP", "BLE", "On-network", "Wi-Fi PAF", "NFC", "Thread"];
      const discovery = names.filter((_, i) => current.discovery & (1 << i));
      if (current.discovery & 0xc0) discovery.push("未知标志");
      addField("Discovery capabilities", `${current.discovery} · ${discovery.join(" / ") || "未声明"}`, "按位解释；实际能力还取决于设备实现。");
      addField("可选数据", `${current.optionalBytes} 字节`, "首版不解析或验证可选 TLV。");
      const warnings = [];
      if (current.optionalBytes) warnings.push("仅校验基础字段，可选 TLV 未验证；二维码将保留原始内容。");
      if (current.discovery & 0xc0) warnings.push("包含未知发现标志，未确认其语义。");
      put("pair-warning", warnings.join(" ") || "基础字段有效不代表设备一定能够配网。导出的二维码与原始输入一致。");
      makeQr(current.payload);
    } else put("pair-warning", "手动码缺少完整 Discriminator 和发现能力，无法无损还原原始 MT: 二维码；此处只解析和校验。");
  } catch (error) {
    resetResult(); el("pair-input").setAttribute("aria-invalid", "true"); message("pair-error", error.message);
  }
}
el("pair-parse").addEventListener("click", parse);
el("pair-example").addEventListener("click", () => { el("pair-input").value = example; parse(); });
el("pair-input").addEventListener("input", () => { resetResult(); message("pair-error", ""); el("pair-input").removeAttribute("aria-invalid"); });
el("pair-clear").addEventListener("click", () => { el("pair-input").value = ""; resetResult(); message("pair-error", ""); el("pair-input").removeAttribute("aria-invalid"); el("pair-input").focus(); });
el("copy-manual").addEventListener("click", () => { if (current) copyText(current.manual, "pair-status"); });
el("download-qr").addEventListener("click", () => {
  if (!current || !imageReady) return;
  const link = document.createElement("a"); link.download = "matter-pairing-qr.png"; link.href = el("qr-canvas").toDataURL("image/png"); link.click();
});
// 离开后清除当前凭据，避免后退缓存恢复上一次输入。
window.addEventListener("pagehide", () => { el("pair-input").value = ""; resetResult(); });
