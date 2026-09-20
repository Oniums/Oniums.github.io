// 先 npm run prepare-pages 并用 HTTP 提供 public/；定位和天气均为模拟数据。
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.WIDGET_TEST_URL || 'http://127.0.0.1:4177';
const browser = await chromium.launch();
const errors = [];
await mkdir('/tmp/oniums-widget-screenshots', { recursive: true });
async function fixture(state = 'prompt', mode = 'ok', viewport = { width: 1440, height: 950 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ state, mode }) => {
    const permission = new EventTarget(); permission.state = state;
    const mock = { calls: 0, queries: 0, permission, mode };
    window.weatherFixture = mock;
    mock.setPermission = value => { permission.state = value; permission.dispatchEvent(new Event('change')); };
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => { mock.queries++; return permission; } } });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success, failure, options) => {
      mock.calls++; mock.options = options;
      if (mock.mode === 'geo-denied') { mock.setPermission('denied'); failure({ code: 1 }); return; }
      if (mock.mode === 'geo-fail') { failure({ code: 3 }); return; }
      mock.setPermission('granted');
      success({ coords: { latitude: 31.234567, longitude: 121.456789 } });
    } } });
  }, { state, mode });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  const weatherRequests = [];
  let release;
  await page.route('https://api.open-meteo.com/**', async route => {
    weatherRequests.push(route.request().url());
    if (mode === 'pending') await new Promise(resolve => { release = resolve; });
    if (mode === 'http-fail') { await route.fulfill({ status: 503, body: '{}' }); return; }
    await route.fulfill({ json: { timezone: 'Asia/Shanghai', current: { temperature_2m: mode === 'invalid' ? null : 26.2, apparent_temperature: 27, relative_humidity_2m: 70, weather_code: 2, is_day: 1, time: Date.now() / 1000 - (mode === 'stale' ? 8000 : mode === 'expiring' ? 7195 : 0) } } }).catch(() => {});
  });
  await page.route('https://giscus.app/client.js', route => route.fulfill({ contentType: 'text/javascript', body: `const f=document.createElement('iframe');f.src='https://giscus.app/widget-test';f.title='测试评论';document.querySelector('#giscus-wrap').append(f);` }));
  await page.route('https://giscus.app/widget-test', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta charset="utf-8"></head><body>模拟评论区</body></html>' }));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.weatherFixture.queries > 0);
  return { context, page, weatherRequests, release: () => release?.() };
}
try {
  const a = await fixture();
  assert.equal(await a.page.evaluate(() => weatherFixture.calls), 0); assert.equal(a.weatherRequests.length, 0); assert(await a.page.locator('#local-weather').isHidden());
  await a.page.locator('#local-weather-toggle').click(); await a.page.locator('#local-weather').waitFor({ state: 'visible' });
  const query = new URL(a.weatherRequests[0]).searchParams; assert.equal(query.get('latitude'), '31.23'); assert.equal(query.get('longitude'), '121.46');
  assert.equal(await a.page.locator('#local-weather-temperature').textContent(), '26°C');
  assert.equal(await a.page.evaluate(() => weatherFixture.options.enableHighAccuracy), false);
  await a.page.screenshot({ path: '/tmp/oniums-widget-screenshots/home-weather-desktop.png' });
  await a.page.locator('#local-weather-close').click(); assert(await a.page.locator('#local-weather').isHidden());
  await a.page.locator('#local-weather-toggle').click(); await a.page.locator('#local-weather').waitFor({ state: 'visible' }); assert.equal(a.weatherRequests.length, 1);
  await a.page.locator('#local-weather-close').click(); await a.page.reload(); await a.page.waitForFunction(() => weatherFixture.queries > 0); assert(await a.page.locator('#local-weather').isHidden());
  console.log('PASS prompt: no automatic location/network, opt-in, rounded coordinates, memory reuse, close and session dismissal'); await a.context.close();

  const b = await fixture('granted', 'ok', { width: 390, height: 844 }); await b.page.locator('#local-weather').waitFor({ state: 'visible' });
  assert.equal(b.weatherRequests.length, 1); assert(await b.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await b.page.screenshot({ path: '/tmp/oniums-widget-screenshots/home-weather-mobile.png' });
  await b.page.locator('#local-weather-close').click(); await b.page.reload(); await b.page.waitForFunction(() => weatherFixture.queries > 0);
  assert(await b.page.locator('#local-weather').isHidden()); assert.equal(await b.page.evaluate(() => weatherFixture.calls), 0);
  await b.page.locator('#local-weather-toggle').click(); await b.page.locator('#local-weather').waitFor({ state: 'visible' });
  await b.page.evaluate(() => weatherFixture.setPermission('denied')); assert(await b.page.locator('#local-weather').isHidden()); assert(await b.page.locator('#local-weather-toggle').isHidden());
  console.log('PASS granted auto display, mobile layout, revocation'); await b.context.close();

  const c = await fixture('denied'); assert(await c.page.locator('#local-weather-toggle').isHidden()); assert.equal(await c.page.evaluate(() => weatherFixture.calls), 0); assert.equal(c.weatherRequests.length, 0); await c.context.close();
  const rejected = await fixture('prompt', 'geo-denied'); await rejected.page.locator('#local-weather-toggle').click();
  assert(await rejected.page.locator('#local-weather').isHidden()); assert(await rejected.page.locator('#local-weather-toggle').isHidden()); assert.equal(rejected.weatherRequests.length, 0); await rejected.context.close();
  for (const mode of ['geo-fail', 'http-fail', 'invalid', 'stale']) {
    const f = await fixture('granted', mode); await f.page.waitForFunction(() => !document.getElementById('local-weather-toggle').disabled);
    assert(await f.page.locator('#local-weather').isHidden(), mode); await f.context.close();
  }
  const d = await fixture('granted', 'pending'); await d.page.waitForFunction(() => document.getElementById('local-weather-toggle').textContent.includes('读取'));
  await d.page.waitForTimeout(150); await d.page.evaluate(() => weatherFixture.setPermission('denied')); d.release(); await d.page.waitForTimeout(150); assert(await d.page.locator('#local-weather').isHidden()); await d.context.close();
  console.log('PASS denied, location timeout, service error, missing/old data, revocation during request');

  const expiring = await fixture('granted', 'expiring'); await expiring.page.locator('#local-weather').waitFor({ state: 'visible' });
  await expiring.page.locator('#local-weather-close').click(); await expiring.page.locator('#local-weather-toggle').click();
  assert(await expiring.page.locator('#local-weather').isVisible()); assert.equal(expiring.weatherRequests.length, 1);
  await expiring.page.locator('#local-weather').waitFor({ state: 'hidden', timeout: 7000 }); await expiring.context.close();
  console.log('PASS stale data still expires after closing and reopening cached weather');

  const e = await fixture(); await e.page.goto(base + '/posts/hello-oniums/', { waitUntil: 'domcontentloaded' });
  const manage = e.page.locator('#comment-manage'); assert((await manage.getAttribute('href')).includes('discussions_q='));
  await e.page.locator('#post-comment').scrollIntoViewIfNeeded(); const frame = e.page.frameLocator('#giscus-wrap iframe'); await frame.getByText('模拟评论区').waitFor();
  const child = e.page.frames().find(f => f.url().includes('widget-test'));
  const send = url => child.evaluate(url => parent.postMessage({ giscus: { discussion: { url } } }, '*'), url);
  await send('https://github.com/Oniums/Oniums.github.io/discussions/42');
  await e.page.waitForFunction(() => document.getElementById('comment-manage').href.endsWith('/42'));
  const valid = await manage.getAttribute('href');
  await send('https://evil.example/Oniums/Oniums.github.io/discussions/43'); await send('https://github.com/another/repo/discussions/43'); await send('javascript:alert(1)'); await e.page.waitForTimeout(100); assert.equal(await manage.getAttribute('href'), valid);
  await e.page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://giscus.app', source: window, data: { giscus: { discussion: { url: 'https://github.com/Oniums/Oniums.github.io/discussions/99' } } } }))); assert.equal(await manage.getAttribute('href'), valid);
  const loaded = e.page.waitForEvent('framenavigated', { predicate: f => f.url().includes('widget-test') }); await e.page.locator('#comment-reload').click(); await loaded;
  await e.page.locator('#post-comment').screenshot({ path: '/tmp/oniums-widget-screenshots/comment-management.png' });
  console.log('PASS comment management: page-specific fallback, trusted metadata, URL/source checks, reload');
  await e.context.close(); assert.deepEqual(errors, []);
} finally { await browser.close(); }
