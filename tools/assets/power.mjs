import { powerBudget } from "./calculations.mjs";
import { el, put, message, numberInput, formatNumber } from "./common.mjs";

let snapshotA = null;
let latest = null;
let serial = 0;
const currentLabel = (value) => `${formatNumber(value)} µA`;
const lifeLabel = (hours) => hours === Infinity ? "∞（理想模型）" : hours >= 24 * 365 ? `${formatNumber(hours / (24 * 365))} 年` : hours >= 24 ? `${formatNumber(hours / 24)} 天` : `${formatNumber(hours)} 小时`;

function input(label, key, value, unit, id, { min = 0, step = "any" } = {}) {
  const wrapper = document.createElement("label"); wrapper.textContent = label;
  const element = document.createElement("input"); element.type = "number"; element.min = min; element.step = step; element.value = value; element.dataset.key = key; element.id = `${id}-${key}`; element.setAttribute("aria-label", `${label}${unit ? `（${unit}）` : ""}`);
  wrapper.append(element); return { wrapper, element };
}
function addActivity(item = { name: "新活动", current: 1000, duration: 10, interval: 60 }) {
  if (el("activities").children.length >= 12) return;
  const id = `activity-${++serial}`;
  const row = document.createElement("div"); row.className = "activity";
  const top = document.createElement("div"); top.className = "activity-top";
  const nameLabel = document.createElement("label");
  const name = document.createElement("input"); name.type = "text"; name.value = item.name; name.maxLength = 40; name.dataset.key = "name"; name.setAttribute("aria-label", "活动名称"); nameLabel.append(name);
  const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "移除"; remove.setAttribute("aria-label", `移除活动 ${serial}`);
  remove.addEventListener("click", () => { row.remove(); update(); }); top.append(nameLabel, remove);
  const fields = document.createElement("div"); fields.className = "activity-fields";
  const displayMa = item.current >= 1000;
  const current = input("总电流", "current", displayMa ? item.current / 1000 : item.current, "按所选单位", id);
  const currentGroup = document.createElement("div"); currentGroup.className = "activity-current";
  const units = document.createElement("select"); units.dataset.key = "unit"; units.setAttribute("aria-label", "活动电流单位");
  for (const [value, title] of [["1", "µA"], ["1000", "mA"]]) { const option = document.createElement("option"); option.value = value; option.textContent = title; units.append(option); }
  units.value = displayMa ? "1000" : "1";
  let previousUnit = Number(units.value);
  units.addEventListener("change", () => {
    if (current.element.value.trim() && Number.isFinite(Number(current.element.value))) current.element.value = Number(current.element.value) * previousUnit / Number(units.value);
    previousUnit = Number(units.value);
    update();
  });
  currentGroup.append(current.element, units); current.wrapper.append(currentGroup);
  const duration = input("时长 · ms", "duration", item.duration, "ms", id);
  const interval = input("每隔 · s", "interval", item.interval, "s", id, { min: 0.001 });
  fields.append(current.wrapper, duration.wrapper, interval.wrapper);
  const sliderLabel = document.createElement("label"); sliderLabel.className = "slider-label";
  const caption = document.createElement("span"); caption.textContent = "调整发生周期";
  const slider = document.createElement("input"); slider.type = "range"; slider.min = "0.1"; slider.max = Math.max(60, item.interval); slider.step = "0.1"; slider.value = item.interval; slider.setAttribute("aria-label", "拖动调整活动周期（秒）");
  slider.addEventListener("input", () => { interval.element.value = slider.value; update(); });
  interval.element.addEventListener("input", () => {
    const value = Number(interval.element.value);
    if (Number.isFinite(value) && value > 0) { slider.min = Math.min(0.1, value); slider.max = Math.max(60, value); slider.step = value < 0.1 ? "0.001" : "0.1"; slider.value = value; }
  });
  sliderLabel.append(caption, slider); row.append(top, fields, sliderLabel); el("activities").append(row);
  row.addEventListener("input", update);
  update();
}
function readConfig() {
  return {
    sleep: numberInput(el("sleep"), "睡眠电流"), capacity: numberInput(el("capacity"), "额定容量"), effective: numberInput(el("effective"), "有效容量比例"),
    activities: [...el("activities").children].map((row) => {
      const get = (key) => row.querySelector(`[data-key="${key}"]`);
      return { name: get("name").value, current: numberInput(get("current"), "活动电流") * Number(get("unit").value), duration: numberInput(get("duration"), "活动时长"), interval: numberInput(get("interval"), "活动周期") };
    })
  };
}
function update() {
  latest = null; message("power-error", ""); put("power-status", "");
  el("add-activity").disabled = el("activities").children.length >= 12;
  try {
    const config = readConfig();
    const result = powerBudget(config);
    latest = { config, result };
    el("power-output").hidden = false; el("power-empty").hidden = true; el("save-a").disabled = false;
    put("average", currentLabel(result.average)); put("life", lifeLabel(result.hours)); put("daily", `${formatNumber(result.dailyMah)} mAh`); put("duty", `${formatNumber(result.duty * 100)} %`);
    el("power-bars").replaceChildren();
    for (const component of result.components) {
      const share = result.average === 0 ? 0 : component.average / result.average * 100;
      const row = document.createElement("div"); row.className = "bar-row";
      const title = document.createElement("div"); title.className = "bar-label";
      const name = document.createElement("span"); name.textContent = component.name;
      const value = document.createElement("span"); value.textContent = `${formatNumber(share)} %`;
      title.append(name, value);
      const track = document.createElement("div"); track.className = "bar-track"; track.setAttribute("aria-hidden", "true");
      const fill = document.createElement("div"); fill.className = "bar-fill"; fill.style.width = `${share}%`; track.append(fill);
      const detail = document.createElement("small"); detail.textContent = `贡献 ${currentLabel(component.average)} · 占用 ${formatNumber(component.duty * 100)} % 时间`;
      row.append(title, track, detail); el("power-bars").append(row);
    }
    el("power-comparison").hidden = !snapshotA;
    if (snapshotA) {
      const a = snapshotA.result;
      put("a-average", currentLabel(a.average)); put("b-average", currentLabel(result.average));
      const delta = result.average - a.average;
      put("power-delta", a.average === 0 ? (delta === 0 ? "均为零" : `增加 ${currentLabel(delta)}（A 为零）`) : `${delta >= 0 ? "增加" : "减少"} ${formatNumber(Math.abs(delta) / a.average * 100)} %`);
      put("a-life", lifeLabel(a.hours)); put("b-life", lifeLabel(result.hours));
    }
  } catch (error) {
    message("power-error", error.message); el("power-output").hidden = true; el("power-empty").hidden = false; el("save-a").disabled = true;
  }
}
function loadConfig(config) {
  el("capacity").value = config.capacity; el("effective").value = config.effective; el("sleep").value = config.sleep;
  el("activities").replaceChildren();
  config.activities.forEach(addActivity); update();
}
function example() {
  snapshotA = null; el("restore-a").disabled = true;
  loadConfig({ sleep: 5, capacity: 1000, effective: 80, activities: [
    { name: "传感器采样", current: 2000, duration: 10, interval: 60 },
    { name: "无线发送", current: 15000, duration: 20, interval: 60 },
    { name: "网络轮询", current: 8000, duration: 4, interval: 1 }
  ] });
}
for (const id of ["capacity", "effective", "sleep"]) el(id).addEventListener("input", update);
el("add-activity").addEventListener("click", () => addActivity());
el("power-example").addEventListener("click", example);
el("save-a").addEventListener("click", () => { if (!latest) return; snapshotA = structuredClone(latest); el("restore-a").disabled = false; update(); put("power-status", "已暂存为 A。修改当前参数即可比较 B。"); });
el("restore-a").addEventListener("click", () => { if (snapshotA) { loadConfig(structuredClone(snapshotA.config)); put("power-status", "已恢复 A 参数。"); } });
example();
