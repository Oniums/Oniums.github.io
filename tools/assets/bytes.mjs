import { parseBytes, hexBytes, inspectBytes, flipBit, byteTypes } from "./calculations.mjs";
import { el, put, message, copyText, numberInput } from "./common.mjs";

let currentBytes = null;
function settings() {
  return { type: el("byte-type").value, endian: el("endian").value, offset: numberInput(el("byte-offset"), "起始偏移"), low: numberInput(el("field-low"), "位域起始位"), high: numberInput(el("field-high"), "位域结束位") };
}
function clearResult() {
  // 位域输入保持可见，范围填错后仍可直接修正。
  el("bytes-result").hidden = false;
  for (const id of ["byte-value", "byte-hex", "byte-signed", "field-value", "ascii-preview"]) put(id, "");
  el("bit-grid").replaceChildren();
}
function update() {
  currentBytes = null; message("bytes-error", ""); put("bytes-status", "");
  el("copy-hex").disabled = true;
  try {
    const bytes = parseBytes(el("hex-input").value);
    const config = settings();
    const result = inspectBytes(bytes, config.type, config.endian, config.offset, config.low, config.high);
    currentBytes = bytes; el("copy-hex").disabled = false; el("bytes-result").hidden = false;
    put("byte-value", Object.is(result.value, -0) ? "−0" : String(result.value));
    put("byte-hex", `0x${result.hex}`); put("byte-signed", String(result.signed)); put("field-value", `${result.field} / 0x${result.field.toString(16).toUpperCase()}`); put("ascii-preview", result.ascii);
    el("field-low").max = el("field-high").max = result.bits - 1;
    const oldFocus = document.activeElement?.dataset?.bit;
    const fragment = document.createDocumentFragment();
    for (let bit = result.bits - 1; bit >= 0; bit--) {
      const on = Boolean((result.raw >> BigInt(bit)) & 1n);
      const button = document.createElement("button"); button.type = "button"; button.className = "bit"; button.dataset.bit = bit;
      button.classList.toggle("selected", bit >= config.low && bit <= config.high);
      button.setAttribute("aria-pressed", String(on)); button.setAttribute("aria-label", `bit ${bit}，当前 ${on ? 1 : 0}，点击翻转`);
      const label = document.createElement("small"); label.textContent = bit;
      const digit = document.createElement("b"); digit.textContent = on ? "1" : "0";
      button.append(label, digit);
      button.addEventListener("click", () => {
        el("hex-input").value = hexBytes(flipBit(bytes, config.type, config.endian, config.offset, bit));
        update();
      });
      fragment.append(button);
    }
    el("bit-grid").replaceChildren(fragment);
    if (oldFocus !== undefined) el("bit-grid").querySelector(`[data-bit="${oldFocus}"]`)?.focus({ preventScroll: true });
  } catch (error) { clearResult(); message("bytes-error", error.message); }
}
for (const id of ["hex-input", "byte-offset", "field-low", "field-high"]) el(id).addEventListener("input", update);
el("endian").addEventListener("change", update);
el("byte-type").addEventListener("change", () => {
  const maximum = byteTypes[el("byte-type").value] * 8 - 1;
  el("field-low").value = Math.min(Number(el("field-low").value), maximum);
  el("field-high").value = Math.min(Number(el("field-high").value), maximum);
  update();
});
function sample(hex, type) {
  el("hex-input").value = hex; el("byte-type").value = type; el("endian").value = "little"; el("byte-offset").value = "0"; el("field-low").value = "0"; el("field-high").value = "3"; update();
}
el("bytes-example").addEventListener("click", () => sample("01 02 FF 80", "uint16"));
el("float-example").addEventListener("click", () => sample("00 00 80 3F", "float32"));
el("bytes-clear").addEventListener("click", () => { el("hex-input").value = ""; update(); el("hex-input").focus(); });
el("copy-hex").addEventListener("click", () => { if (currentBytes) copyText(hexBytes(currentBytes), "bytes-status"); });
update();
