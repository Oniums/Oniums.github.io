export const el = (id) => document.getElementById(id);
export const put = (id, value) => { el(id).textContent = value; };
export function message(id, text) { put(id, text); el(id).hidden = !text; }
export async function copyText(text, status) {
  try { await navigator.clipboard.writeText(text); put(status, "已复制到剪贴板。"); }
  catch { put(status, "浏览器未允许复制，请选中结果后手动复制。"); }
}
export function numberInput(input, name) {
  if (!input.value.trim()) throw new Error(`请填写${name}。`);
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new Error(`${name}必须是有效数字。`);
  return value;
}
export const formatNumber = (n) => Number.isFinite(n) ? n.toLocaleString("zh-CN", { maximumSignificantDigits: 6 }) : "∞";
document.querySelectorAll(".tool-nav a").forEach((link) => {
  if (new URL(link.href).pathname === location.pathname) link.setAttribute("aria-current", "page");
});
