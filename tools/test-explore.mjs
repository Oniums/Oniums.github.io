import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPoint, trackPath, parseISS, issFreshness, parseWeather, weatherURL, cityTime } from '../source/tools/assets/explore-core.mjs';
import { avatarSVG } from '../source/tools/assets/avatar-core.mjs';

test('机器人身份稳定、名字与配色可改变、输入不能变成 SVG 标记', () => {
  const one = avatarSVG({ seed: 'Oniums' });
  assert.equal(one, avatarSVG({ seed: ' Oniums ' }));
  assert.notEqual(one, avatarSVG({ seed: 'Orbit' }));
  assert.notEqual(one, avatarSVG({ seed: 'Oniums', color: '#ffb300' }));
  assert.notEqual(one, avatarSVG({ seed: 'Oniums', style: 'bottts-neutral' }));
  assert.equal(avatarSVG({ seed: 'e\u0301' }), avatarSVG({ seed: 'é' }));
  assert(!avatarSVG({ seed: '<script>alert(1)</script>' }).includes('<script>'));
  assert.throws(() => avatarSVG({ seed: 'a', color: 'red" onload="' }));
});
test('地图方向正确，跨日期变更线不横穿地图', () => {
  assert.deepEqual(mapPoint(0, 0), [500, 250]);
  assert.deepEqual(mapPoint(90, -180), [0, 0]);
  const path = trackPath([{ latitude: 0, longitude: 179 }, { latitude: 1, longitude: -179 }, { latitude: 2, longitude: -178 }]);
  assert.equal((path.match(/M/g) || []).length, 2);
  assert.equal((path.match(/L/g) || []).length, 1);
  assert.throws(() => mapPoint(null, 0));
  assert.throws(() => mapPoint(91, 0));
});
test('空间站旧数据标为过期，缺失值不能假装为零，拒绝未来采样', () => {
  const now = Date.now(), point = { latitude: 0, longitude: 0, altitude: 420, velocity: 27000, timestamp: now / 1000 };
  assert.equal(parseISS(point, now), point);
  assert.equal(issFreshness(point.timestamp, now + 46000), 'stale');
  assert.equal(issFreshness(point.timestamp, now + 20000), 'fresh');
  assert.throws(() => parseISS({ ...point, velocity: null }, now));
  assert.throws(() => parseISS({ ...point, timestamp: now / 1000 + 300 }, now));
});
test('天气时间按目标城市处理，保留缺失值，筛选未来小时', () => {
  const now = Date.UTC(2026, 8, 20, 16, 30) / 1000;
  const weather = parseWeather({ timezone: 'Asia/Shanghai', current: { time: now, temperature_2m: 20 }, hourly: { time: [now - 1800, now + 1800, now + 5400], temperature_2m: [19, null, 22], precipitation_probability: [0, null, 50] }, daily: { time: [now], sunrise: [null], sunset: [null] } });
  assert.equal(weather.hours.length, 2);
  assert.equal(weather.hours[0].temperature, null);
  assert.equal(weather.hours[0].rain, null);
  assert.equal(cityTime(now, 'Asia/Shanghai'), '00:30');
  assert.equal(cityTime(now, 'Europe/London'), '17:30');
  assert.equal(cityTime(null, 'Asia/Shanghai'), '—');
  assert.throws(() => parseWeather({}));
  const url = new URL(weatherURL({ latitude: 31, longitude: 121 }));
  assert.equal(url.searchParams.get('timeformat'), 'unixtime');
  assert.equal(url.searchParams.get('timezone'), 'auto');
});
