import { fetchJSON, mapPoint, trackPath, parseISS, issFreshness, svgNode } from '/tools/assets/explore-core.mjs?v=20260920-1';
const $ = id => document.getElementById(id);
let paused = false, request = null, timer = null, last = null, points = [], failures = 0, nextAllowed = 0, failed = false;
for (let longitude = -150; longitude < 180; longitude += 30) {
  const [x] = mapPoint(0, longitude);
  $('map-grid').append(svgNode('line', { x1: x, x2: x, y1: 0, y2: 500, class: 'graticule' }));
}
for (let latitude = -60; latitude <= 60; latitude += 30) {
  const [, y] = mapPoint(latitude, 0);
  $('map-grid').append(svgNode('line', { x1: 0, x2: 1000, y1: y, y2: y, class: latitude ? 'graticule' : 'equator' }));
}
for (const [text, x, y] of [['太平洋', 115, 275], ['大西洋', 440, 265], ['印度洋', 710, 330], ['0°', 8, 246]]) $('map-grid').append(svgNode('text', { x, y, class: 'map-label' }, text));

function status(message, kind = 'ok') {
  $('iss-status').textContent = message; $('iss-status').dataset.kind = kind;
}
function age() {
  const seconds = last ? Math.max(0, Math.floor(Date.now() / 1000 - last.timestamp)) : 0;
  $('age').textContent = last ? `最后位置距今 ${seconds} 秒` : '等待首次采样';
  $('refresh').disabled = Boolean(request) || Date.now() < nextAllowed;
  if (paused || document.hidden) { $('orbit-state').textContent = '● 已暂停'; return; }
  const stale = last && issFreshness(last.timestamp) === 'stale';
  $('orbit-state').textContent = failed ? '● 连接中断' : stale ? '● 数据已过期' : last ? '● 追踪中' : '● 等待数据';
  if (stale && !failed) status('最后位置已超过 45 秒，仅供参考；正在等待新采样。', 'stale');
}
function render(data) {
  last = data;
  if (!points.length || data.timestamp > points.at(-1).timestamp) points.push(data);
  points = points.filter(p => data.timestamp - p.timestamp <= 1800).slice(-180);
  const [x, y] = mapPoint(data.latitude, data.longitude);
  for (const id of ['iss-ring', 'iss-dot']) { $(id).setAttribute('cx', x); $(id).setAttribute('cy', y); }
  $('iss-marker').removeAttribute('hidden');
  $('track').setAttribute('d', trackPath(points));
  $('altitude').textContent = data.altitude.toFixed(1);
  $('velocity').textContent = Math.round(data.velocity).toLocaleString('zh-CN');
  $('sunlight').textContent = ({ daylight: '日照中', eclipsed: '地影中' })[data.visibility] || '未知';
  $('point-count').textContent = points.length;
  $('coordinates').textContent = `经度 ${data.longitude.toFixed(2)}° · 纬度 ${data.latitude.toFixed(2)}°`;
  $('sample-time').textContent = `采样 ${new Date(data.timestamp * 1000).toISOString().slice(11, 19)} UTC`;
  $('map-description').textContent = `最后收到的位置：${$('coordinates').textContent}；高度 ${data.altitude.toFixed(1)} 千米。`;
}
function schedule(delay = 10000) {
  clearTimeout(timer);
  if (!paused && !document.hidden) timer = setTimeout(update, delay);
}
async function update() {
  if (request || document.hidden) return;
  if (Date.now() < nextAllowed) { schedule(nextAllowed - Date.now()); return; }
  clearTimeout(timer);
  const controller = new AbortController(); request = controller; nextAllowed = Date.now() + 5000;
  $('refresh').disabled = true;
  try {
    const data = parseISS(await fetchJSON('https://api.wheretheiss.at/v1/satellites/25544', controller.signal));
    if (controller.signal.aborted) return;
    if (last && data.timestamp < last.timestamp) throw new Error('服务返回旧采样，保留较新的位置');
    render(data); failures = 0; failed = false;
    status(paused ? '已更新一次；自动追踪仍处于暂停状态。' : '位置已更新。轨迹只记录本次访问收到的采样。');
  } catch (error) {
    if (controller.signal.aborted) return;
    failures++; failed = true;
    status(`${error.name === 'AbortError' ? '请求超时' : error.message}。${last ? '保留最后位置。' : '暂时没有位置数据。'}${paused ? '可点击立即更新重试。' : '稍后自动重试，也可点击立即更新。'}`, 'error');
  } finally {
    if (request === controller) request = null;
    age(); schedule(Math.min(60000, 10000 * 2 ** Math.min(failures, 3)));
  }
}
$('pause').addEventListener('click', () => {
  paused = !paused; $('pause').textContent = paused ? '继续追踪' : '暂停追踪';
  if (paused) { clearTimeout(timer); request?.abort(); status('已暂停追踪，保留最后位置和轨迹。'); age(); }
  else { status('正在恢复追踪…'); update(); }
});
$('refresh').addEventListener('click', update);
$('clear-track').addEventListener('click', () => { points = last ? [last] : []; $('track').setAttribute('d', trackPath(points)); $('point-count').textContent = points.length; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(timer); request?.abort(); }
  else if (!paused) update();
  age();
});
setInterval(age, 1000);
update();
