import { fetchJSON, weatherLabel, weatherIcon, cityTime } from '/tools/assets/explore-core.mjs?v=20260920-1';

const button = document.getElementById('local-weather-toggle');
if (button && navigator.geolocation && window.isSecureContext) {
  let permission = null, generation = 0, controller = null, pending = false, lastLoaded = 0, expiresAt = 0, expiry = null;
  const widget = document.createElement('aside');
  widget.id = 'local-weather'; widget.hidden = true; widget.setAttribute('aria-label', '当前位置天气');
  widget.innerHTML = '<div class="local-weather-head"><strong>当前位置天气</strong><button type="button" id="local-weather-close" aria-label="关闭天气浮窗">×</button></div><div class="local-weather-main"><span id="local-weather-icon" aria-hidden="true"></span><strong id="local-weather-temperature"></strong><span id="local-weather-description"></span></div><p id="local-weather-details"></p><small id="local-weather-time"></small><div class="local-weather-footer"><a href="/tools/weather/">城市天气查询</a><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a></div>';
  document.body.append(widget);
  const $ = id => document.getElementById(id);
  const dismissed = () => { try { return sessionStorage.getItem('oniums-weather-hidden') === '1'; } catch { return false; } };
  const remember = value => { try { if (value) sessionStorage.setItem('oniums-weather-hidden', '1'); else sessionStorage.removeItem('oniums-weather-hidden'); } catch {} };
  const resetButton = () => { pending = false; button.disabled = false; button.textContent = '本地天气'; };
  function hide(cancel = true) {
    widget.hidden = true; button.setAttribute('aria-expanded', 'false');
    clearTimeout(expiry);
    if (cancel) { generation++; controller?.abort(); resetButton(); }
  }
  function show() {
    widget.hidden = false; button.setAttribute('aria-expanded', 'true');
    clearTimeout(expiry); expiry = setTimeout(() => { lastLoaded = 0; hide(); }, Math.max(0, expiresAt - Date.now()));
  }
  async function load(explicit = false) {
    if (pending || permission?.state === 'denied') return;
    if (!explicit && (permission?.state !== 'granted' || dismissed())) return;
    if (explicit) remember(false);
    if (Date.now() - lastLoaded < 600000 && Date.now() < expiresAt) { show(); return; }
    pending = true; button.disabled = true; button.textContent = '定位中…';
    const ticket = ++generation;
    controller?.abort(); controller = new AbortController();
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, maximumAge: 600000, timeout: 10000 }));
      if (ticket !== generation || permission?.state === 'denied') return;
      const { latitude, longitude } = position.coords;
      if (![latitude, longitude].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('invalid position');
      // 天气只需附近网格，减少发送给服务商的坐标精度；不写入浏览器存储。
      const params = new URLSearchParams({ latitude: latitude.toFixed(2), longitude: longitude.toFixed(2), timezone: 'auto', timeformat: 'unixtime', current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day', temperature_unit: 'celsius' });
      button.textContent = '读取天气…';
      const data = await fetchJSON(`https://api.open-meteo.com/v1/forecast?${params}`, controller.signal);
      if (ticket !== generation || permission?.state === 'denied') return;
      const c = data.current;
      if (!Number.isFinite(c?.temperature_2m) || !Number.isFinite(c?.time) || !data.timezone || Date.now() / 1000 - c.time > 7200 || c.time > Date.now() / 1000 + 300) throw new Error('invalid weather');
      const time = cityTime(c.time, data.timezone);
      $('local-weather-temperature').textContent = `${Math.round(c.temperature_2m)}°C`;
      $('local-weather-description').textContent = weatherLabel(c.weather_code, c.is_day !== 0)[1];
      $('local-weather-icon').replaceChildren(weatherIcon(c.weather_code, c.is_day !== 0));
      const value = n => Number.isFinite(n) ? Math.round(n) : '—';
      $('local-weather-details').textContent = `体感 ${value(c.apparent_temperature)}°C · 湿度 ${value(c.relative_humidity_2m)}%`;
      $('local-weather-time').textContent = `${time} · 当地时间 · 模型天气`;
      lastLoaded = Date.now(); expiresAt = (c.time + 7200) * 1000; show();
    } catch {
      // 拒绝、超时和服务失败均安静收起，不改用 IP 定位或反复请求权限。
      if (ticket === generation) hide(false);
    } finally { if (ticket === generation) resetButton(); }
  }
  button.addEventListener('click', () => { if (widget.hidden) load(true); else { remember(true); hide(); } });
  $('local-weather-close').addEventListener('click', () => { remember(true); hide(); button.focus(); });
  try {
    permission = await navigator.permissions?.query({ name: 'geolocation' });
    const changed = () => {
      button.hidden = permission?.state === 'denied';
      if (permission?.state !== 'granted') { lastLoaded = 0; hide(); }
      else load();
    };
    permission?.addEventListener('change', changed);
    button.hidden = permission?.state === 'denied';
    if (permission?.state === 'granted') load();
  } catch { /* 不支持权限查询时，仍可点击按钮主动授权。 */ }
} else if (button) button.hidden = true;
