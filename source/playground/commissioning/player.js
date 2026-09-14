import { scenarios, normalSteps } from "./scenarios.js";

const byId = (id) => document.getElementById(id);
const root = byId("commissioning-player");
const paths = {
  none: "",
  ble: "M 116 154 L 116 81 Q 116 65 132 65 L 628 65 Q 644 65 644 81 L 644 150",
  thread: "M 586 204 L 438 204",
  discovery: "M 174 204 L 322 204",
  ip: "M 174 204 L 300 204 Q 311 204 311 193 L 311 140 Q 311 128 324 128 L 436 128 Q 449 128 449 140 L 449 193 Q 449 204 460 204 L 586 204"
};
const transportLabels = { local: "准备", ble: "BLE", thread: "Thread", ip: "IP" };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let scenarioId = "normal";
let index = 0;
let playing = false;
let animationFrame = 0;
let startedAt = 0;
let fraction = 0;
let speed = 1;
const stageDuration = 4200;
const currentSteps = () => scenarios[scenarioId].steps;
const currentStep = () => currentSteps()[index];

function put(id, value) { byId(id).textContent = value; }

function positionPacket(progress) {
  const path = byId("message-path");
  const packet = byId("packet");
  if (!path.getAttribute("d")) {
    packet.style.display = "none";
    return;
  }
  packet.style.display = "";
  const point = path.getPointAtLength(path.getTotalLength() * progress);
  packet.setAttribute("cx", point.x);
  packet.setAttribute("cy", point.y);
}

function updatePlayButton() {
  put("play", playing ? "Ⅱ 暂停" : index === currentSteps().length - 1 ? "↻ 重播" : "▶ 播放");
  byId("play").setAttribute("aria-label", playing ? "暂停播放" : index === currentSteps().length - 1 ? "从头重播当前场景" : "播放当前场景");
  root.dataset.playing = String(playing);
}

function pause() {
  playing = false;
  cancelAnimationFrame(animationFrame);
  updatePlayButton();
}

function render() {
  const steps = currentSteps();
  const step = currentStep();
  root.dataset.scenario = scenarioId;
  root.dataset.step = step.id;
  put("scenario-description", scenarios[scenarioId].description);
  put("step-number", `STEP ${String(index + 1).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")}`);
  put("step-kind", step.kind);
  byId("step-kind").dataset.fault = String(Boolean(step.fault));
  put("step-title", step.title);
  put("step-explanation", step.explanation);
  put("proven", step.proven);
  put("remaining", step.remaining);
  put("network-state", step.state.network);
  put("fabric-state", step.state.fabric);
  put("session-state", step.state.session);
  put("user-status", step.user);
  put("message-label", step.message);
  put("transport", transportLabels[step.transport]);
  byId("transport").dataset.type = step.transport;
  byId("related-article").href = step.article;
  put("technical-explanation", step.technical);
  put("log", steps.slice(0, index + 1).flatMap((item, i) => item.log.map((line) => `${String(i + 1).padStart(2, "0")}  ${line}`)).join("\n"));
  byId("log").scrollTop = byId("log").scrollHeight;
  const svg = byId("network");
  svg.dataset.transport = step.transport;
  svg.dataset.fault = String(Boolean(step.fault));
  put("network-description", `${step.title}。${step.message}。Thread 状态：${step.state.network}。${step.route === "ip" ? "消息通过边界路由器转发，Matter 安全端点是手机与设备。" : ""}`);
  byId("message-path").setAttribute("d", paths[step.route]);
  const active = {
    "phone-node": step.route === "ble" || step.route === "ip" || step.route === "discovery" || step.route === "none",
    "router-node": ["thread", "discovery", "ip"].includes(step.route),
    "device-node": step.route === "ble" || step.route === "ip" || step.route === "thread"
  };
  for (const [id, isActive] of Object.entries(active)) {
    byId(id).classList.toggle("active", isActive);
    byId(id).classList.toggle("failed", Boolean(step.fault) && isActive);
  }
  positionPacket(playing && !reduceMotion.matches ? fraction : 1);
  const range = byId("progress");
  range.max = steps.length - 1;
  range.value = index;
  range.setAttribute("aria-valuetext", `第 ${index + 1} 步，共 ${steps.length} 步：${step.title}`);
  put("position", `${String(index + 1).padStart(2, "0")} / ${steps.length}`);
  put("timeline-end", steps.at(-1).short);
  byId("previous").disabled = index === 0;
  byId("next").disabled = index === steps.length - 1;
  for (const [i, button] of [...byId("steps").children].entries()) {
    button.classList.toggle("visited", i < index);
    if (i === index) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  }
  const activeButton = byId("steps").children[index];
  // 仅滚动步骤条，自动播放时不抢走读者的页面位置或键盘焦点。
  const strip = byId("steps");
  const buttonBounds = activeButton.getBoundingClientRect();
  const stripBounds = strip.getBoundingClientRect();
  if (buttonBounds.left < stripBounds.left || buttonBounds.right > stripBounds.right) {
    strip.scrollLeft += buttonBounds.left - stripBounds.left - strip.clientWidth / 2 + buttonBounds.width / 2;
  }
  byId("comparison").hidden = !step.fault;
  if (step.fault) {
    const normal = normalSteps[step.normalIndex];
    put("normal-title", normal.title);
    put("normal-comparison", `${normal.proven} ${normal.remaining}`);
    put("fault-title", step.title);
    put("fault-comparison", `${step.proven} ${step.remaining}`);
  }
  updatePlayButton();
  put("announcement", `${scenarios[scenarioId].label}，第 ${index + 1} 步：${step.title}`);
}

function buildStepButtons() {
  const fragment = document.createDocumentFragment();
  currentSteps().forEach((step, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `第 ${i + 1} 步：${step.title}`);
    const number = document.createElement("span");
    number.textContent = String(i + 1).padStart(2, "0");
    button.append(number, step.short);
    button.addEventListener("click", () => seek(i));
    fragment.append(button);
  });
  byId("steps").replaceChildren(fragment);
}

function selectScenario(id, destination = 0) {
  pause();
  scenarioId = id;
  index = Math.max(0, Math.min(destination, currentSteps().length - 1));
  fraction = 0;
  document.querySelectorAll("[data-scenario]").forEach((button) => {
    // 只更新场景按钮，播放器根节点也有 data-scenario 状态标记。
    if (button.tagName === "BUTTON") button.setAttribute("aria-pressed", String(button.dataset.scenario === id));
  });
  buildStepButtons();
  render();
}

function seek(destination) {
  pause();
  index = Math.max(0, Math.min(destination, currentSteps().length - 1));
  fraction = 0;
  render();
}

function tick(now) {
  if (!playing) return;
  fraction = Math.min(1, (now - startedAt) / (stageDuration / speed));
  positionPacket(reduceMotion.matches ? 1 : fraction);
  if (fraction >= 1) {
    index += 1;
    fraction = 0;
    startedAt = now;
    if (index >= currentSteps().length - 1) {
      index = currentSteps().length - 1;
      pause();
      render();
      return;
    }
    render();
  }
  animationFrame = requestAnimationFrame(tick);
}

byId("play").addEventListener("click", () => {
  if (playing) { pause(); return; }
  if (index === currentSteps().length - 1) { index = 0; fraction = 0; }
  playing = true;
  startedAt = performance.now() - fraction * (stageDuration / speed);
  render();
  animationFrame = requestAnimationFrame(tick);
});
byId("previous").addEventListener("click", () => seek(index - 1));
byId("next").addEventListener("click", () => seek(index + 1));
byId("restart").addEventListener("click", () => seek(0));
byId("progress").addEventListener("input", (event) => seek(Number(event.target.value)));
byId("speed").addEventListener("change", (event) => {
  speed = Number(event.target.value);
  if (playing) startedAt = performance.now() - fraction * (stageDuration / speed);
});
document.querySelectorAll("button[data-scenario]").forEach((button) => button.addEventListener("click", () => selectScenario(button.dataset.scenario)));
byId("show-normal").addEventListener("click", () => {
  const destination = currentStep().normalIndex;
  selectScenario("normal", destination);
  byId("step-title").setAttribute("tabindex", "-1");
  byId("step-title").focus({ preventScroll: true });
  root.scrollIntoView({ behavior: reduceMotion.matches ? "instant" : "smooth", block: "start" });
});
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
window.addEventListener("pagehide", pause);
// Deep links carry only a known teaching-step ID, never imported log text.
function openLinkedStep() {
  const id = new URLSearchParams(location.hash.slice(1)).get("step");
  const destination = normalSteps.findIndex(step => step.id === id);
  selectScenario("normal", destination < 0 ? 0 : destination);
}
window.addEventListener("hashchange", openLinkedStep);
openLinkedStep();
