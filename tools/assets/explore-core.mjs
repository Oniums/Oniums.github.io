export function mapPoint(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('无效的经纬度');
  return [(longitude + 180) / 360 * 1000, (90 - latitude) / 180 * 500];
}

// 跨越日期变更线时断开轨迹，避免画出横穿整张地图的假路径。
export function trackPath(points) {
  return points.map((point, i) => {
    const [x, y] = mapPoint(point.latitude, point.longitude);
    const move = !i || Math.abs(point.longitude - points[i - 1].longitude) > 180;
    return `${move ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

export function parseISS(data, now = Date.now()) {
  mapPoint(data.latitude, data.longitude);
  for (const key of ['altitude', 'velocity', 'timestamp']) {
    if (!Number.isFinite(data[key]) || data[key] <= 0) throw new Error('空间站数据不完整');
  }
  if (data.timestamp * 1000 > now + 120000) throw new Error('空间站数据时间异常');
  return data;
}

export function issFreshness(timestamp, now = Date.now()) {
  return !Number.isFinite(timestamp) || now - timestamp * 1000 > 45000 ? 'stale' : 'fresh';
}

export async function fetchJSON(url, signal, timeout = 12000) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 429 ? '服务请求较多，请稍后再试' : `服务暂时不可用（${response.status}）`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function weatherLabel(code, day = true) {
  if (code === 0) return [day ? '☀' : '☾', day ? '晴朗' : '晴夜'];
  if ([1, 2].includes(code)) return ['⛅', '少云'];
  if (code === 3) return ['☁', '阴天'];
  if ([45, 48].includes(code)) return ['≋', '有雾'];
  if ([51, 53, 55, 56, 57].includes(code)) return ['☂', '毛毛雨'];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['☂', '降雨'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['❄', '降雪'];
  if ([95, 96, 99].includes(code)) return ['ϟ', '雷雨'];
  return ['—', '暂无天气描述'];
}

export function cityTime(seconds, zone, options = { hour: '2-digit', minute: '2-digit', hour12: false }) {
  if (!Number.isFinite(seconds)) return '—';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: zone, ...options }).format(new Date(seconds * 1000));
}

export function weatherURL(city) {
  mapPoint(city.latitude, city.longitude);
  const params = new URLSearchParams({
    latitude: city.latitude, longitude: city.longitude, timezone: 'auto', timeformat: 'unixtime', forecast_days: 5,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
    wind_speed_unit: 'kmh', temperature_unit: 'celsius'
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function parseWeather(data) {
  const current = data.current;
  if (!current || !Number.isFinite(current.time) || !Number.isFinite(current.temperature_2m)) throw new Error('天气数据不完整');
  try { cityTime(current.time, data.timezone); } catch { throw new Error('天气时区无效'); }
  if (!data.timezone || !Array.isArray(data.hourly?.time) || !Array.isArray(data.daily?.time)) throw new Error('预报数据不完整');
  const hours = data.hourly.time.map((time, i) => ({ time, temperature: data.hourly.temperature_2m?.[i], rain: data.hourly.precipitation_probability?.[i] }))
    .filter(h => Number.isFinite(h.time) && h.time >= current.time).slice(0, 24);
  const days = data.daily.time.slice(0, 5).map((time, i) => ({ time, code: data.daily.weather_code?.[i], high: data.daily.temperature_2m_max?.[i], low: data.daily.temperature_2m_min?.[i], sunrise: data.daily.sunrise?.[i], sunset: data.daily.sunset?.[i], rain: data.daily.precipitation_probability_max?.[i] }));
  if (!hours.length || !days.length) throw new Error('预报数据为空');
  return { current, hours, days, zone: data.timezone };
}

export function svgNode(name, attributes = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function weatherIcon(code, day = true) {
  const svg = svgNode('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const sun = () => {
    svg.append(svgNode('circle', { cx: 25, cy: 24, r: 10 }));
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; svg.append(svgNode('line', { x1: 25 + Math.cos(a) * 15, y1: 24 + Math.sin(a) * 15, x2: 25 + Math.cos(a) * 19, y2: 24 + Math.sin(a) * 19 })); }
  };
  if (code === 0) {
    if (day) sun(); else svg.append(svgNode('path', { d: 'M43 46A22 22 0 0 1 23 9 19 19 0 0 0 43 46Z' }));
  } else if ([45, 48].includes(code)) {
    for (const y of [19, 29, 39, 49]) svg.append(svgNode('path', { d: `M12 ${y}H52` }));
  } else if (Number.isFinite(code)) {
    if ([1, 2].includes(code)) sun();
    svg.append(svgNode('path', { d: 'M18 43a10 10 0 0 1-2-20 15 15 0 0 1 29-1 11 11 0 0 1 2 21Z', fill: 'var(--paper)' }));
    if (code >= 95) svg.append(svgNode('path', { d: 'M34 43l-8 10h9l-6 10' }));
    else if ([71, 73, 75, 77, 85, 86].includes(code)) {
      for (const x of [22, 40]) svg.append(svgNode('path', { d: `M${x} 49v10m-4-7 8 4m-8 0 8-4` }));
    } else if (code >= 51) {
      for (const x of [20, 32, 44]) svg.append(svgNode('path', { d: `M${x} 50l-3 7` }));
    }
  } else svg.append(svgNode('path', { d: 'M20 32h24' }));
  return svg;
}
