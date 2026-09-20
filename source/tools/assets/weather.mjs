import { fetchJSON, weatherURL, parseWeather, weatherLabel, weatherIcon, cityTime, svgNode } from './explore-core.mjs?v=20260920-1';
const $ = id => document.getElementById(id);
const cities = [
  { name: '上海', latitude: 31.22222, longitude: 121.45806 },
  { name: '深圳', latitude: 22.54554, longitude: 114.06830 },
  { name: '北京', latitude: 39.9075, longitude: 116.39723 },
  { name: '杭州', latitude: 30.29365, longitude: 120.16142 },
  { name: '东京', latitude: 35.6895, longitude: 139.69171 },
  { name: '伦敦', latitude: 51.50853, longitude: -0.12574 }
];
let selected = cities[0], displayed = null, weatherRequest = null, searchRequest = null, refreshAt = 0;
const cache = new Map();
const number = (v, digits = 0) => Number.isFinite(v) ? v.toFixed(digits) : '—';
const status = (message, kind = 'ok') => { $('weather-status').textContent = message; $('weather-status').dataset.kind = kind; };
function drawChart(hours, zone) {
  const svg = $('weather-chart');
  svg.querySelectorAll(':scope > :not(title)').forEach(el => el.remove());
  const temperatures = hours.map(h => h.temperature).filter(Number.isFinite);
  if (!temperatures.length) { svg.append(svgNode('text', { x: 30, y: 120, class: 'chart-label' }, '暂缺逐小时温度数据，请查看下方表格。')); return; }
  const low = Math.floor(Math.min(...temperatures) - 2), high = Math.ceil(Math.max(...temperatures) + 2);
  const x = i => 45 + i / Math.max(1, hours.length - 1) * 870;
  const y = value => 210 - (value - low) / (high - low) * 180;
  for (let i = 0; i <= 3; i++) {
    const temp = low + (high - low) * i / 3;
    svg.append(svgNode('line', { x1: 45, x2: 915, y1: y(temp), y2: y(temp), class: 'chart-grid' }), svgNode('text', { x: 4, y: y(temp) + 4, class: 'chart-label' }, `${temp.toFixed(0)}°`));
    svg.append(svgNode('text', { x: 923, y: 214 - i * 60, class: 'chart-label' }, `${Math.round(i / 3 * 100)}%`));
  }
  let path = '', drawing = false;
  hours.forEach((hour, i) => {
    if (Number.isFinite(hour.rain)) svg.append(svgNode('rect', { x: x(i) - 9, y: 210 - Math.max(0, Math.min(100, hour.rain)) * 1.8, width: 18, height: Math.max(0, Math.min(100, hour.rain)) * 1.8, rx: 3, class: 'rain-bar' }));
    if (Number.isFinite(hour.temperature)) { path += `${drawing ? 'L' : 'M'}${x(i)},${y(hour.temperature)} `; drawing = true; } else drawing = false;
    if (i % 4 === 0 || i === hours.length - 1) svg.append(svgNode('text', { x: x(i), y: 242, 'text-anchor': 'middle', class: 'chart-label' }, cityTime(hour.time, zone)));
  });
  svg.append(svgNode('path', { d: path, class: 'temperature-line' }));
}
function render(data, city, fetchedAt) {
  const { current, hours, days, zone } = data;
  displayed = city;
  $('weather-content').hidden = false;
  $('city-name').textContent = city.name;
  $('city-clock').textContent = `${cityTime(current.time, zone, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} · ${zone}`;
  $('temperature').textContent = number(current.temperature_2m, 1);
  const [, label] = weatherLabel(current.weather_code, current.is_day !== 0);
  $('weather-icon').replaceChildren(weatherIcon(current.weather_code, current.is_day !== 0)); $('weather-description').textContent = label;
  $('feels-like').textContent = number(current.apparent_temperature, 1);
  $('humidity').textContent = number(current.relative_humidity_2m);
  $('wind').textContent = number(current.wind_speed_10m, 1);
  $('sun-times').textContent = `${cityTime(days[0].sunrise, zone)} / ${cityTime(days[0].sunset, zone)}`;
  $('weather-updated').textContent = `数据获取于 ${cityTime(fetchedAt / 1000, zone)} · ${city.name}当地时间`;
  $('hour-rows').replaceChildren();
  for (const hour of hours) {
    const row = document.createElement('tr');
    for (const value of [cityTime(hour.time, zone, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }), number(hour.temperature, 1), number(hour.rain)]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    $('hour-rows').append(row);
  }
  $('forecast-days').replaceChildren();
  for (const day of days) {
    const card = document.createElement('div'); card.className = 'day';
    const [, description] = weatherLabel(day.code);
    for (const [tag, text, cls] of [['small', cityTime(day.time, zone, { month: 'numeric', day: 'numeric', weekday: 'short' })], ['span', '', 'symbol'], ['span', description], ['strong', `${number(day.low)}° / ${number(day.high)}°`], ['small', `降雨 ${number(day.rain)}%`]]) {
      const el = document.createElement(tag); el.textContent = text; if (cls) { el.className = cls; el.append(weatherIcon(day.code)); } card.append(el);
    }
    $('forecast-days').append(card);
  }
  drawChart(hours, zone);
}
async function loadCity(city, force = false) {
  selected = city;
  weatherRequest?.abort();
  const request = new AbortController(); weatherRequest = request;
  $('refresh-weather').disabled = true;
  status(`正在读取${city.name}天气…${displayed ? `下方暂留${displayed.name}上次数据。` : ''}`);
  const key = `${city.latitude},${city.longitude}`;
  try {
    let entry = cache.get(key);
    if (force || !entry || Date.now() - entry.time >= 600000) {
      entry = { data: parseWeather(await fetchJSON(weatherURL(city), request.signal)), time: Date.now() };
      if (request.signal.aborted) return;
      if (cache.size >= 12) cache.delete(cache.keys().next().value);
      cache.set(key, entry);
    }
    if (weatherRequest !== request) return;
    render(entry.data, city, entry.time);
    const old = Date.now() / 1000 - entry.data.current.time > 7200;
    status(old ? '当前天气的模型时间已超过两小时，请留意更新时间。' : `${city.name}天气已就绪。预报时间均按城市当地时区显示。`, old ? 'stale' : 'ok');
    refreshAt = Date.now() + 60000;
  } catch (error) {
    if (request.signal.aborted || weatherRequest !== request) return;
    status(`${city.name}天气读取失败：${error.name === 'AbortError' ? '请求超时' : error.message}。${displayed ? `下方仍为${displayed.name}上次数据。` : ''}请稍后点击刷新。`, 'error');
    refreshAt = Date.now() + 5000;
  } finally { if (weatherRequest === request) weatherRequest = null; }
}
for (const city of cities) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = city.name;
  button.addEventListener('click', () => loadCity(city)); $('city-presets').append(button);
}
$('city-search').addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('city-query').value.trim();
  if (name.length < 2) { $('search-status').textContent = '请输入至少两个字符。'; return; }
  searchRequest?.abort(); const request = new AbortController(); searchRequest = request;
  $('city-results').replaceChildren(); $('search-status').textContent = '正在搜索城市…';
  try {
    const data = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: 6, language: 'zh', format: 'json' })}`, request.signal);
    if (searchRequest !== request || request.signal.aborted) return;
    const results = Array.isArray(data.results) ? data.results : [];
    $('search-status').textContent = results.length ? '请选择城市与地区：' : '没有找到城市，请试试英文名或附近的大城市。';
    for (const result of results) {
      if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) continue;
      const label = [result.name, result.admin1, result.country].filter(Boolean).join(' · ');
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => { $('city-results').replaceChildren(); $('search-status').textContent = `已选择 ${label}`; loadCity({ ...result, name: label }); });
      $('city-results').append(button);
    }
  } catch (error) { if (!request.signal.aborted) $('search-status').textContent = '城市搜索暂时不可用，可先选择上方常用城市。'; }
});
$('refresh-weather').addEventListener('click', () => { if (Date.now() >= refreshAt && !weatherRequest) loadCity(selected, true); });
setInterval(() => { $('refresh-weather').disabled = Boolean(weatherRequest) || Date.now() < refreshAt; }, 1000);
loadCity(selected);
