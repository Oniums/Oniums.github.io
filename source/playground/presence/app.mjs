import { STEP_MS, DEFAULTS, clamp, createEngine, stepEngine, defaultScene, synthesizeChannels, learnBackground } from './engine.mjs';

const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const make = (tag, text, attrs = {}) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const labels = { empty: '无人', candidate: '确认中', present: '有人', holding: '等待无人', unknown: '数据未知' };
const lessons = {
  input: ['01 / 从输出开始', '一个点不是一个人，一帧没有点也不等于无人。', '绿色点代表构造的移动点，橙色点代表构造的存在点。人物图标是你设置的场景，不是算法已经识别出的目标。点云经过了前级处理；这里直接从模拟点云开始。', '试一试：播放后，把人物 A 从“移动”切到“静坐”，看移动点和存在点怎样交接。'],
  filter: ['02 / 决定哪些点参与判断', '屏蔽区间，改变的是参与判断的数据。', '每个点按直线距离落入一个 0.5 m 区间。范围、区间开关、基础 SNR 和背景门限共同决定是否保留。SNR 高表示信号比噪声突出，不表示一定是人。', '试一试：关闭人物所在的区间，或者把基础门限提高到 24 dB。展开点云表查看过滤理由。规则变化会重新计时。'],
  state: ['03 / 把检测变成产品状态', '进入需要确认，离开需要等待。', '同一区间的新样本持续满足条件，才形成有效检测。确认后的新证据刷新最后检测时间；暂时没有点时保持有人，直到无人延时到期。重复旧数据不能延长保持。', '试一试：先让状态变为有人，再关闭人物。比较“有效空帧”和“完全没有数据”：前者最终无人，后者进入未知。'],
  learning: ['04 / 观察环境适应的代价', '学会忽略风扇，也可能漏掉旁边的人。', '本页只演示点云层背景门限，不执行原始信号底噪学习。学习会提高干扰区间的门限，同一区间的弱人体点也可能被过滤。它不是自动识别人和风扇。', '试一试：载入“空房间里的风扇”，到下方开始空房学习并推进 5 秒。之后关掉风扇，把静坐的人移到原位置，查看过滤理由。'],
  modules: ['05 / 分清责任与部署', '检测处理与产品状态，要有清晰的边界。', '点云处理可以在雷达侧，也可以在主控侧。产品配置、无人延时和最终状态必须各有明确负责人。接口既要传检测结果，也要传更新时间与健康状态。', '试一试：切换下方的两种部署方式，观察芯片职责和传输内容的变化。这只改变示意，不模拟资源或功耗。']
};

let scene = defaultScene();
let mask = DEFAULTS.mask;
let learned = [];
let learning = null;
let time = 0;
let seq = 0;
let lastSentFrame = null;
let engine;
let result;
let playing = false;
let timer = null;
let selectedLesson = 'input';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const getConfig = () => ({ minSnr: Number($('min-snr').value), confirmMs: Number($('confirm').value), holdMs: Number($('hold').value) * 1000, mask });
const seconds = value => `${(value / 1000).toFixed(1)} s`;

function cancelLearning(message) {
  if (!learning) return;
  learning = null;
  $('learn-status').textContent = message;
}
function restart(message = '') {
  time = 0; seq = 0; lastSentFrame = null;
  cancelLearning('学习已取消');
  engine = createEngine(getConfig(), learned);
  if (message) $('play-notice').textContent = message;
  tick(false);
}
function tick(advance = true) {
  if (advance) time += STEP_MS;
  const channels = synthesizeChannels(scene, time);
  const mode = $('stream').value;
  let frame = null;
  if (mode === 'ok' || mode === 'empty') {
    frame = { seq: seq++, complete: true, channels: mode === 'ok' ? channels : channels.map(c => ({ ...c, points: [] })) };
    lastSentFrame = frame;
  } else if (mode === 'frozen') frame = lastSentFrame;
  if (learning) {
    learning.peaks = learnBackground(learning.peaks, channels);
    if (time - learning.started >= 4000) {
      learned = learning.peaks;
      learning = null;
      engine = createEngine(getConfig(), learned);
      $('learn-status').textContent = '背景门限已生效，重新确认人存状态';
    } else $('learn-status').textContent = `学习中，还需 ${seconds(4000 - (time - learning.started))}`;
  }
  result = stepEngine(engine, frame, time);
  paint();
}
function setPlaying(value) {
  playing = value && !reducedMotion.matches;
  if (timer !== null) clearInterval(timer);
  timer = playing ? setInterval(() => {
    for (let i = 0; i < Number($('speed').value); i++) tick();
  }, STEP_MS) : null;
  $('play').textContent = playing ? '暂停 Ⅱ' : '播放 ▶';
  $('play').setAttribute('aria-pressed', String(playing));
}

function makeActorControls() {
  for (const item of scene) {
    const row = make('div', undefined, { class: 'actor-row' });
    const toggleLabel = make('label');
    const enabled = make('input', undefined, { type: 'checkbox', id: `enabled-${item.id}` });
    toggleLabel.append(enabled, document.createTextNode(` ${item.label}`));
    const mode = make('select', undefined, { id: `mode-${item.id}`, 'aria-label': `${item.label}状态` });
    for (const [value, text] of item.id === 'fan' ? [['fan', '转动中的干扰源']] : [['motion', '移动 / 肢体运动'], ['presence', '静坐 / 细微运动']]) {
      mode.append(make('option', text, { value }));
    }
    const positions = make('div', undefined, { class: 'position-controls' });
    for (const axis of ['x', 'y']) {
      const label = make('label', axis === 'x' ? '左右 X ' : '前后 Y ', { for: `${item.id}-${axis}` });
      label.append(make('output', '', { id: `${item.id}-${axis}-value` }));
      const input = make('input', undefined, { type: 'range', id: `${item.id}-${axis}`, min: axis === 'x' ? '-2.8' : '0.1', max: axis === 'x' ? '2.8' : '4.9', step: '0.1' });
      label.append(input); positions.append(label);
      input.addEventListener('input', () => changeActor(item.id, { [axis]: Number(input.value) }));
    }
    enabled.addEventListener('change', () => changeActor(item.id, { enabled: enabled.checked }));
    mode.addEventListener('change', () => changeActor(item.id, { mode: mode.value }));
    row.append(toggleLabel, mode, positions); $('actor-controls').append(row);
  }
}
function changeActor(id, changes) {
  Object.assign(scene.find(item => item.id === id), changes);
  cancelLearning('场景改变，学习已取消；之前的背景门限保留');
  $('play-notice').textContent = '场景已改变，点云会在下一次采样时更新。暂停时请手动前进；存在样本每 1 秒更新。';
  paint();
}
function syncActors() {
  for (const item of scene) {
    $(`enabled-${item.id}`).checked = item.enabled;
    $(`mode-${item.id}`).value = item.mode;
    for (const axis of ['x', 'y']) {
      $(`${item.id}-${axis}`).value = item[axis];
      $(`${item.id}-${axis}-value`).textContent = `${item[axis].toFixed(1)} m`;
    }
    const actor = $(`actor-${item.id}`);
    actor.setAttribute('transform', `translate(${300 + item.x * 80} ${425 - item.y * 80})`);
    actor.setAttribute('display', item.enabled ? 'inline' : 'none');
    actor.setAttribute('aria-label', `${item.label}，X ${item.x.toFixed(1)} 米，Y ${item.y.toFixed(1)} 米，可用方向键移动`);
    actor.querySelector('.symbol').textContent = item.id === 'fan' ? '✳' : item.mode === 'motion' ? '↔' : '•';
  }
}
function pointerWorld(event) {
  const point = $('room').createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  const mapped = point.matrixTransform($('room').getScreenCTM().inverse());
  return { x: (mapped.x - 300) / 80, y: (425 - mapped.y) / 80 };
}
function makeActors() {
  for (const item of scene) {
    const group = svg('g', { id: `actor-${item.id}`, class: 'actor', tabindex: '0', role: 'button' });
    const line = svg('path', { d: 'M0 -13 V0', stroke: '#597d70', 'stroke-width': '1' });
    const halo = svg('circle', { cx: 0, cy: -27, r: 14, class: 'actor-halo' });
    const glyph = svg('text', { x: 0, y: -21, class: 'symbol' });
    const label = svg('text', { x: 0, y: -47 }); label.textContent = item.label;
    const hit = svg('rect', { x: -24, y: -47, width: 48, height: 58, fill: 'transparent' });
    group.append(line, halo, glyph, label, hit); $('actors').append(group);
    let drag = null;
    group.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const actual = scene.find(a => a.id === item.id), pointer = pointerWorld(event);
      drag = { pointerId: event.pointerId, dx: actual.x - pointer.x, dy: actual.y - pointer.y };
      group.setPointerCapture(event.pointerId);
    });
    group.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const p = pointerWorld(event);
      changeActor(item.id, { x: Math.round(clamp(p.x + drag.dx, -2.8, 2.8) * 10) / 10, y: Math.round(clamp(p.y + drag.dy, 0.1, 4.9) * 10) / 10 });
    });
    const end = () => { drag = null; };
    group.addEventListener('pointerup', end); group.addEventListener('pointercancel', end); group.addEventListener('lostpointercapture', end);
    group.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const a = scene.find(a => a.id === item.id), amount = event.shiftKey ? 0.5 : 0.1;
      changeActor(item.id, {
        x: Math.round(clamp(a.x + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0), -2.8, 2.8) * 10) / 10,
        y: Math.round(clamp(a.y + (event.key === 'ArrowUp' ? amount : event.key === 'ArrowDown' ? -amount : 0), 0.1, 4.9) * 10) / 10
      });
    });
  }
}
function makeZones() {
  for (let i = 0; i < 8; i++) {
    const cell = make('div', undefined, { class: 'zone', id: `zone-${i}` });
    const label = make('label', undefined, { for: `zone-enabled-${i}` });
    const input = make('input', undefined, { type: 'checkbox', id: `zone-enabled-${i}` });
    label.append(input, document.createTextNode(` 区间 ${i + 1}`), make('b', `${(i * 0.5).toFixed(1)}–${((i + 1) * 0.5).toFixed(1)} m`));
    cell.append(label, make('small', '', { id: `zone-count-${i}` })); $('zones').append(cell);
    input.addEventListener('change', () => { mask = input.checked ? mask | (1 << i) : mask & ~(1 << i); restart('区间规则已改变，清空历史并重新计时。'); });
  }
}
function paintRoom() {
  $('rings').replaceChildren(); $('cloud').replaceChildren();
  for (let i = 7; i >= 0; i--) {
    const enabled = Boolean(mask & (1 << i)), hit = Boolean(result.evidenceMask & (1 << i));
    $('rings').append(svg('circle', { cx: 300, cy: 425, r: (i + 1) * 40, fill: !enabled ? '#e0e1dc' : hit ? '#d8e9d9' : '#f1f5ee', stroke: '#c4d1c2', 'stroke-width': 1, 'fill-opacity': '0.85' }));
  }
  for (const point of result.points) {
    const kept = point.accepted && point.fresh && result.status !== 'unknown';
    if (!kept && !$('show-rejected').checked) continue;
    const dot = svg('circle', { cx: 300 + point.x * 80, cy: 425 - point.y * 80, r: kept ? 4 : 3, fill: kept ? point.kind === 'motion' ? '#217563' : '#b57422' : '#aeb2aa', opacity: kept ? '0.9' : '0.6' });
    $('cloud').append(dot);
  }
  syncActors();
}
function paint() {
  $('clock').textContent = seconds(time);
  $('min-snr-value').textContent = `${engine.config.minSnr} dB`;
  $('confirm-value').textContent = seconds(engine.config.confirmMs);
  $('hold-value').textContent = `${engine.config.holdMs / 1000} s`;
  const state = learning ? 'learning' : result.status;
  $('state-card').dataset.state = state;
  $('occupancy').textContent = learning ? '学习中' : result.occupied === null ? '数据未知' : result.occupied ? '有人' : '无人';
  $('mobile-state').textContent = $('occupancy').textContent;
  $('mobile-time').textContent = `${seconds(time)}${!learning && result.occupied ? ` · 余 ${seconds(result.remainingMs)}` : ''}`;
  $('state-reason').textContent = learning ? '正在收集已知空房间的构造点，暂不输出人存结论。' : {
    empty: '当前没有经过确认的有效检测。', candidate: '已有候选点，正在等待新样本持续满足条件。',
    present: '已有区间通过时间确认；新证据持续刷新保持时间。', holding: '暂时没有确认中的区间，输出仍为有人，等待无人延时。',
    unknown: '超过 2 秒未收到新的完整帧。未知不等于无人；恢复后重新确认。'
  }[result.status];
  $('remaining').textContent = !learning && result.occupied ? seconds(result.remainingMs) : '—';
  $('hold-progress').value = !learning && result.occupied ? result.remainingMs / engine.config.holdMs : 0;
  $('health').textContent = `最后完整新帧：${result.lastFrame === null ? '尚无' : seconds(result.lastFrame)} · 最后确认的新证据：${result.lastEvidence === null ? '尚无' : seconds(result.lastEvidence)}`;
  const visiblePoints = result.points.filter(p => p.fresh && result.status !== 'unknown');
  const accepted = visiblePoints.filter(p => p.accepted);
  $('input-count').textContent = `${visiblePoints.length} 个有效期内的点`;
  $('kept-count').textContent = `${accepted.length} 个点保留`;
  $('filter-reason').textContent = `${visiblePoints.length - accepted.length} 个过滤；另有 ${result.points.length - visiblePoints.length} 个失效`;
  $('sample-ages').textContent = `采样时刻：移 ${result.channelTimes.motion === undefined ? '—' : seconds(result.channelTimes.motion)} / 存 ${result.channelTimes.presence === undefined ? '—' : seconds(result.channelTimes.presence)}`;
  $('confirmed-count').textContent = `${result.zones.filter(z => z.confirmed).length} 个区间已确认`;
  $('pipeline-state').textContent = learning ? '学习中' : labels[result.status];
  for (let i = 0; i < 8; i++) {
    const z = result.zones[i];
    $(`zone-enabled-${i}`).checked = Boolean(mask & (1 << i));
    $(`zone-${i}`).dataset.hit = String(Boolean(result.evidenceMask & (1 << i)));
    $(`zone-${i}`).dataset.disabled = String(!(mask & (1 << i)));
    $(`zone-count-${i}`).textContent = `移 ${z.motion} / 存 ${z.presence}${z.confirmed ? ' · 已确认' : ''}`;
  }
  $('point-rows').replaceChildren();
  for (const point of result.points) {
    const kept = point.fresh && point.accepted && result.status !== 'unknown';
    const row = make('tr');
    for (const value of [point.kind === 'motion' ? '移动' : '存在', `${point.x.toFixed(2)} / ${point.y.toFixed(2)}`, Math.hypot(point.x, point.y).toFixed(2), point.snr.toFixed(1)]) row.append(make('td', value));
    row.append(make('td', !point.fresh || result.status === 'unknown' ? '数据失效' : point.reason, { 'data-accepted': String(kept) }));
    $('point-rows').append(row);
  }
  if (!result.points.length) { const row = make('tr'); row.append(make('td', '当前没有点。检查场景开关、输入状态与采样时刻。', { colspan: '5' })); $('point-rows').append(row); }
  $('events').replaceChildren();
  for (const event of engine.events) {
    const li = make('li'); li.append(make('time', seconds(event.time)), document.createTextNode(`${labels[event.from]} → ${labels[event.to]}`)); $('events').append(li);
  }
  if (!engine.events.length) $('events').append(make('li', '还没有状态变化。播放或逐步推进模拟时间。'));
  const noPeople = !scene.some(a => a.id !== 'fan' && a.enabled);
  $('learn').disabled = !noPeople || $('stream').value !== 'ok' || Boolean(learning);
  $('learn-guard').textContent = !noPeople ? '请先关闭人物 A、B，让已知模拟场景为空房。' : $('stream').value !== 'ok' ? '请把输入状态切回正常点云。' : '这是你设置的空房间前提；真实设备不能从这一步自动证明无人。学习开始后请播放或手动推进时间。';
  $('learned-zones').replaceChildren();
  for (let i = 0; i < 8; i++) $('learned-zones').append(make('span', `区间 ${i + 1}：${Number.isFinite(learned[i]) ? learned[i].toFixed(1) + ' dB' : '未设背景门限'}`));
  paintRoom();
}

function setLesson(key, changeHash = true) {
  selectedLesson = Object.hasOwn(lessons, key) ? key : 'input';
  const text = lessons[selectedLesson];
  ['lesson-number', 'lesson-title', 'lesson-text', 'lesson-try'].forEach((id, i) => { $(id).textContent = text[i]; });
  for (const button of document.querySelectorAll('[data-lesson]')) button.setAttribute('aria-pressed', String(button.dataset.lesson === selectedLesson));
  if (changeHash) history.replaceState(null, '', `#${selectedLesson}`);
}
function loadPreset(value) {
  setPlaying(false); scene = defaultScene(); mask = 255; learned = []; learning = null;
  $('stream').value = 'ok'; $('min-snr').value = DEFAULTS.minSnr; $('confirm').value = DEFAULTS.confirmMs; $('hold').value = DEFAULTS.holdMs / 1000;
  if (value === 'seated') scene[0].mode = 'presence';
  if (value === 'two') scene[1].enabled = true;
  if (value === 'fan') { scene[0].enabled = false; scene[2].enabled = true; }
  if (value === 'masked') mask = 0;
  $('learn-status').textContent = '未学习';
  restart('场景已载入，暂停在起点。点击播放或手动推进。');
}
makeActors(); makeActorControls(); makeZones();
$('play').addEventListener('click', () => setPlaying(!playing));
$('step').addEventListener('click', () => { setPlaying(false); tick(); });
$('advance').addEventListener('click', () => { setPlaying(false); for (let i = 0; i < 25; i++) tick(); });
$('speed').addEventListener('change', () => setPlaying(playing));
$('reset').addEventListener('click', () => { setPlaying(false); restart('保留场景、规则与已学习门限，从 0 秒重新实验。'); });
$('preset').addEventListener('change', () => loadPreset($('preset').value));
for (const id of ['min-snr', 'confirm', 'hold']) $(id).addEventListener('input', () => restart('判断规则已改变，清空历史并重新计时。'));
$('enable-all').addEventListener('click', () => { mask = 255; restart('全部区间已启用，清空历史并重新计时。'); });
$('show-rejected').addEventListener('change', paintRoom);
$('stream').addEventListener('change', () => { cancelLearning('输入状态改变，学习已取消'); $('play-notice').textContent = '输入状态已改变，请播放或手动前进以观察结果。'; paint(); });
$('learn').addEventListener('click', () => {
  if ($('learn').disabled) return;
  learning = { started: time, peaks: [] };
  engine = createEngine(getConfig(), learned);
  $('learn-status').textContent = '开始学习，请推进 4 模拟秒';
  tick(false);
});
$('clear-learning').addEventListener('click', () => { learned = []; learning = null; $('learn-status').textContent = '背景门限已清除'; restart('背景门限已清除，保留场景并重新计时。'); });
for (const button of document.querySelectorAll('[data-lesson]')) button.addEventListener('click', () => setLesson(button.dataset.lesson));
for (const button of document.querySelectorAll('[data-placement]')) button.addEventListener('click', () => {
  const radar = button.dataset.placement === 'radar';
  for (const option of document.querySelectorAll('[data-placement]')) option.setAttribute('aria-pressed', String(option === button));
  $('radar-work').textContent = radar ? '点云 → 分区 → 有效检测' : '采集 → FFT → 点云';
  $('radar-work-text').textContent = radar ? '保留采集与点云处理，把我们的检测算法部署到雷达侧；需要验证开发权限和处理预算。' : '复用雷达侧信号处理，通过数据接口发送点云。';
  $('wire-data').textContent = radar ? '区域检测结果 + 时间与状态' : '点云帧 + 时间与状态';
  $('host-work').textContent = radar ? '人存保持 → 产品接口' : '分区 → 检测 → 人存状态';
  $('host-work-text').textContent = radar ? '统一管理无人延时、用户配置与状态上报；调试时再传完整点云。' : '处理点云，管理有人保持、无人延时、配置和通信。';
});
function motionPreference() {
  if (reducedMotion.matches) setPlaying(false);
  $('play').disabled = reducedMotion.matches;
  if (reducedMotion.matches) $('play-notice').textContent = '已遵循减少动态效果设置。使用“前进”按钮手动观察。';
}
reducedMotion.addEventListener('change', motionPreference);
document.addEventListener('visibilitychange', () => { if (document.hidden) setPlaying(false); });
window.addEventListener('pagehide', () => setPlaying(false));
window.addEventListener('hashchange', () => setLesson(location.hash.slice(1), false));
setLesson(location.hash.slice(1), false); restart(); motionPreference();
