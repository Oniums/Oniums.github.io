// 先构建并通过 HTTP 提供 public/。API 用固定数据模拟，另行验证真实服务。
// PLAYWRIGHT_MODULE 可指向外部 playwright/index.mjs，EXPLORE_TEST_URL 可覆盖服务地址。
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.EXPLORE_TEST_URL || 'http://127.0.0.1:4177';
const browser = await chromium.launch();
const artifacts = process.env.EXPLORE_SCREENSHOTS || '/tmp/oniums-explore-screenshots';
await mkdir(artifacts, { recursive: true });
const errors = [];
const watch = page => page.on('pageerror', error => errors.push(error.message));
const settled = async (page, selector, text) => page.waitForFunction(({ selector, text }) => document.querySelector(selector)?.textContent.includes(text), { selector, text });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, timezoneId: 'America/Los_Angeles' });
  const avatar = await context.newPage(); watch(avatar);
  const external = [];
  avatar.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base)) external.push(request.url()); });
  await avatar.goto(`${base}/tools/avatar/`);
  await settled(avatar, '#avatar-status', '头像已生成');
  await avatar.locator('#avatar-preview').evaluate(img => img.decode());
  const svgDownload = avatar.waitForEvent('download'); await avatar.locator('#download-svg').click();
  const svg = await readFile(await (await svgDownload).path(), 'utf8'); assert(svg.includes('<svg'));
  const pngDownload = avatar.waitForEvent('download'); await avatar.locator('#download-png').click();
  const png = await readFile(await (await pngDownload).path()); assert.equal(png.subarray(1, 4).toString(), 'PNG'); assert.equal(png.readUInt32BE(16), 512); assert.equal(png.readUInt32BE(20), 512);
  await avatar.locator('#seed').fill('机器人 <script>'); assert.equal(await avatar.locator('#avatar-name').textContent(), '机器人 <script>');
  await avatar.locator('#style').selectOption('bottts-neutral'); assert(await avatar.locator('#color').isDisabled());
  await avatar.locator('#transparent').check();
  await avatar.locator('#style').selectOption('bottts'); await avatar.locator('#transparent').uncheck(); await avatar.locator('#seed').fill('Oniums');
  assert.deepEqual(external, []);
  await avatar.screenshot({ path: `${artifacts}/avatar-desktop.png`, fullPage: true });
  console.log('PASS avatar: local-only, text input, two styles, 512px PNG and SVG');

  const iss = await context.newPage(); watch(iss); await iss.clock.install();
  let issMode = 'ok', issRequests = 0, longitude = 179;
  await iss.route('https://api.wheretheiss.at/**', async route => {
    issRequests++;
    if (issMode === 'fail') return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    const time = await iss.evaluate(() => Date.now() / 1000);
    await route.fulfill({ json: { latitude: 25, longitude, altitude: 421.6, velocity: 27500, visibility: 'daylight', timestamp: time - (issMode === 'stale' ? 90 : 0) } });
  });
  await iss.goto(`${base}/playground/iss/`); await settled(iss, '#altitude', '421.6');
  assert.equal(await iss.locator('#point-count').textContent(), '1');
  longitude = -179; await iss.clock.fastForward(11000); await settled(iss, '#point-count', '2');
  assert.equal(((await iss.locator('#track').getAttribute('d')).match(/M/g) || []).length, 2);
  await iss.locator('#pause').click(); const count = issRequests; await iss.clock.fastForward(30000); assert.equal(issRequests, count);
  await iss.locator('#clear-track').click(); assert.equal(await iss.locator('#point-count').textContent(), '1');
  issMode = 'fail'; await iss.locator('#pause').click(); await settled(iss, '#iss-status', '保留最后位置'); assert.equal(await iss.locator('#altitude').textContent(), '421.6');
  await iss.clock.fastForward(6000); issMode = 'ok'; await iss.locator('#refresh').click(); await settled(iss, '#iss-status', '位置已更新');
  await iss.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hiddenCount = issRequests; await iss.clock.fastForward(60000); assert.equal(issRequests, hiddenCount);
  await iss.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await settled(iss, '#orbit-state', '追踪中');
  await iss.screenshot({ path: `${artifacts}/iss-desktop.png`, fullPage: true });
  await iss.close();
  const oldISS = await context.newPage(); watch(oldISS);
  await oldISS.route('https://api.wheretheiss.at/**', route => route.fulfill({ json: { latitude: 20, longitude: 30, altitude: 421, velocity: 27500, timestamp: Date.now() / 1000 - 120 } }));
  await oldISS.goto(`${base}/playground/iss/`); await settled(oldISS, '#orbit-state', '数据已过期'); await oldISS.close();
  console.log('PASS ISS: antimeridian, pause, background suspension, stale data, outage and recovery');

  const weather = await context.newPage(); watch(weather);
  let weatherMode = 'ok', delayShenzhen = false;
  function forecast(temp = 25) {
    const currentTime = Math.floor(Date.now() / 3600000) * 3600;
    const hours = Array.from({ length: 48 }, (_, i) => currentTime + i * 3600);
    const days = Array.from({ length: 5 }, (_, i) => currentTime + i * 86400);
    return { timezone: 'Asia/Shanghai', current: { time: currentTime, temperature_2m: temp, apparent_temperature: temp + 1, relative_humidity_2m: 72, weather_code: 2, wind_speed_10m: 10, is_day: 1 }, hourly: { time: hours, temperature_2m: hours.map((_, i) => i === 2 ? null : temp + Math.sin(i / 3) * 3), precipitation_probability: hours.map((_, i) => i === 2 ? null : i * 4 % 100) }, daily: { time: days, temperature_2m_min: [20, 21, 19, 22, 23], temperature_2m_max: [29, 30, 27, 28, 31], sunrise: days.map(t => t + 1000), sunset: days.map(t => t + 43000), weather_code: [1, 3, 61, 2, 0], precipitation_probability_max: [10, 30, 90, null, 0] } };
  }
  await weather.route('https://api.open-meteo.com/**', async route => {
    const lat = new URL(route.request().url()).searchParams.get('latitude');
    if (weatherMode === 'fail') return route.fulfill({ status: 503, body: '{}' });
    if (lat.startsWith('22.') && delayShenzhen) await new Promise(resolve => setTimeout(resolve, 700));
    await route.fulfill({ json: forecast(lat.startsWith('22.') ? 32 : 25) }).catch(() => {});
  });
  await weather.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [{ name: '<City>', admin1: 'Region', country: 'Country', latitude: 50, longitude: 10 }] } }));
  await weather.goto(`${base}/tools/weather/`); await settled(weather, '#weather-status', '上海天气已就绪');
  assert.equal(await weather.locator('#hour-rows tr').count(), 24); assert.equal(await weather.locator('#forecast-days .day').count(), 5);
  assert((await weather.locator('#hour-rows tr').nth(2).textContent()).includes('——'));
  assert((await weather.locator('#city-clock').textContent()).includes('Asia/Shanghai'));
  await weather.screenshot({ path: `${artifacts}/weather-desktop.png`, fullPage: true });
  delayShenzhen = true;
  await weather.getByRole('button', { name: '深圳', exact: true }).click(); await weather.getByRole('button', { name: '北京', exact: true }).click();
  await settled(weather, '#weather-status', '北京天气已就绪'); await weather.waitForTimeout(850); assert.equal(await weather.locator('#city-name').textContent(), '北京');
  weatherMode = 'fail'; await weather.getByRole('button', { name: '伦敦', exact: true }).click(); await settled(weather, '#weather-status', '下方仍为北京上次数据');
  weatherMode = 'ok'; await weather.locator('#city-query').fill('city'); await weather.locator('#search-button').click(); await settled(weather, '#search-status', '请选择');
  await weather.locator('#city-results button').click(); await settled(weather, '#city-name', '<City>'); assert.equal(await weather.locator('#city-name script').count(), 0);
  console.log('PASS weather: 24h/5d, missing values, target timezone, city race, failed selection and safe search text');

  for (const [name, page] of [['avatar', avatar], ['weather', weather]]) {
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: mobile overflow`);
    await page.screenshot({ path: `${artifacts}/${name}-mobile.png`, fullPage: true });
  }
  const mobileISS = await context.newPage(); watch(mobileISS); await mobileISS.setViewportSize({ width: 390, height: 844 });
  await mobileISS.route('https://api.wheretheiss.at/**', route => route.fulfill({ json: { latitude: 0, longitude: 0, altitude: 420, velocity: 27500, timestamp: Date.now() / 1000 } }));
  await mobileISS.goto(`${base}/playground/iss/`); await settled(mobileISS, '#altitude', '420');
  assert(await mobileISS.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await mobileISS.screenshot({ path: `${artifacts}/iss-mobile.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`PASS mobile layout and page errors; screenshots: ${artifacts}`);
} finally { await browser.close(); }
