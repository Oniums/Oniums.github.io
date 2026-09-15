import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, stepEngine, regionOf, filterPoint, synthesizeChannels, defaultScene, learnBackground, DEFAULTS } from '../source/playground/presence/engine.mjs';

const point = { x: 0, y: 2.2, snr: 18 };
const frame = (time, points = [point], kind = 'motion', observedAt = time) => ({
  seq: time / 200, complete: true,
  channels: [
    { kind: 'motion', observedAt: time, points: kind === 'motion' ? points : [] },
    { kind: 'presence', observedAt: kind === 'presence' ? observedAt : Math.floor(time / 1000) * 1000, points: kind === 'presence' ? points : [] }
  ]
});
function occupiedEngine(config = {}) {
  const e = createEngine(config);
  for (let t = 0; t <= 1000; t += 200) stepEngine(e, frame(t), t);
  assert.equal(e.output.occupied, true);
  return e;
}
test('presence: half-open distance zones, disabled zones, and background thresholds stay distinct', () => {
  assert.equal(regionOf({ ...point, y: 0.5 }), 1);
  assert.equal(regionOf({ ...point, y: 3.999 }), 7);
  assert.equal(regionOf({ ...point, y: 4 }), -1);
  assert.equal(regionOf({ ...point, y: -1 }), -1);
  assert.equal(regionOf({ ...point, x: NaN }), -1);
  assert.equal(filterPoint(point, { ...DEFAULTS, mask: 0 }).reason, '区间关闭');
  assert.equal(filterPoint(point, { ...DEFAULTS, minSnr: 19 }).reason, '低于基础门限');
  const learned = []; learned[4] = 20;
  assert.equal(filterPoint(point, DEFAULTS, learned).reason, '低于背景门限');
});
test('presence: an isolated point cannot activate; repeated fresh observations can', () => {
  const e = createEngine();
  assert.equal(stepEngine(e, frame(0), 0).status, 'candidate');
  for (let t = 200; t <= 1000; t += 200) stepEngine(e, frame(t, []), t);
  assert.equal(e.output.occupied, false);
  assert.equal(occupiedEngine().output.status, 'present');
});
test('presence: independently sampled seated points activate without prior motion', () => {
  const e = createEngine();
  for (let t = 0; t < 1000; t += 200) {
    stepEngine(e, frame(t, [point], 'presence', 0), t);
    assert.equal(e.output.occupied, false, 'a repeated old sample is not a second observation');
  }
  assert.equal(stepEngine(e, frame(1000, [point], 'presence', 1000), 1000).occupied, true);
});
test('presence: repeated presence samples in new transport frames cannot postpone absence forever', () => {
  const e = createEngine({ holdMs: 3000 });
  for (let t = 0; t <= 1000; t += 200) stepEngine(e, frame(t, [point], 'presence', Math.floor(t / 1000) * 1000), t);
  assert.equal(e.output.occupied, true);
  for (let t = 1200; t <= 4000; t += 200) stepEngine(e, frame(t, [point], 'presence', 1000), t);
  assert.equal(e.lastEvidence, 1000);
  assert.equal(e.output.occupied, false);
  assert.notEqual(e.output.status, 'unknown', 'transport frames remain fresh');
});
test('presence: empty frames count toward a fixed absence deadline; new evidence renews it', () => {
  const e = occupiedEngine({ holdMs: 2000 });
  for (let t = 1200; t < 3000; t += 200) {
    assert.equal(stepEngine(e, frame(t, []), t).occupied, true);
  }
  assert.equal(stepEngine(e, frame(3000, []), 3000).occupied, false);
  const renewed = occupiedEngine({ holdMs: 3000 });
  for (let t = 1200; t <= 1800; t += 200) stepEngine(renewed, frame(t, []), t);
  for (let t = 2000; t <= 3000; t += 200) stepEngine(renewed, frame(t), t);
  assert.equal(renewed.lastEvidence, 3000);
  assert.equal(stepEngine(renewed, frame(4000, []), 4000).occupied, true);
});
test('presence: missing, duplicate and incomplete frames become unknown, then recovery rebuilds evidence', () => {
  for (const missing of ['lost', 'duplicate', 'incomplete']) {
    const e = occupiedEngine();
    for (let t = 1200; t <= 3000; t += 200) {
      const f = missing === 'lost' ? null : missing === 'duplicate' ? frame(1000) : { ...frame(t), complete: false };
      stepEngine(e, f, t);
    }
    assert.equal(e.output.status, 'unknown', missing);
    assert.equal(e.output.occupied, null);
    assert.equal(stepEngine(e, frame(3200), 3200).status, 'candidate');
    assert.equal(e.output.occupied, false);
    for (let t = 3400; t <= 3800; t += 200) stepEngine(e, frame(t), t);
    assert.equal(e.output.occupied, true);
  }
});
test('presence: a closed region never activates, while simultaneous motion and presence remain independent', () => {
  const e = createEngine({ mask: 0 });
  for (let t = 0; t <= 2000; t += 200) stepEngine(e, frame(t), t);
  assert.equal(e.output.occupied, false);
  const both = createEngine();
  for (let t = 0; t <= 1200; t += 200) {
    const f = frame(t);
    f.channels[1] = { kind: 'presence', observedAt: Math.floor(t / 1000) * 1000, points: [{ ...point, y: 3.2 }] };
    stepEngine(both, f, t);
  }
  assert.equal(both.output.confirmedMask, (1 << 4) | (1 << 6));
});
test('presence: background learning can suppress the fan and a weaker person at the same distance', () => {
  const scene = defaultScene(); scene[0].enabled = false; scene[2].enabled = true;
  let learned = [];
  for (let t = 0; t <= 4000; t += 200) learned = learnBackground(learned, synthesizeChannels(scene, t));
  const e = createEngine({}, learned);
  for (let t = 0; t <= 2000; t += 200) stepEngine(e, { seq: t / 200, complete: true, channels: synthesizeChannels(scene, t) }, t);
  assert.equal(e.output.occupied, false);
  scene[2].enabled = false; Object.assign(scene[0], { enabled: true, mode: 'presence', x: 1.5, y: 2 });
  const weak = createEngine({}, learned), unlearned = createEngine();
  for (let t = 0; t <= 2000; t += 200) {
    const f = { seq: t / 200, complete: true, channels: synthesizeChannels(scene, t) };
    stepEngine(weak, f, t); stepEngine(unlearned, f, t);
  }
  assert.equal(weak.output.occupied, false);
  assert.equal(unlearned.output.occupied, true);
});
test('presence: scene truth is not an input to classification, and generated cases are deterministic', () => {
  const scene = defaultScene();
  const original = synthesizeChannels(scene, 1000);
  scene[0].label = 'NOT A HUMAN'; scene[0].id = 'arbitrary';
  assert.deepEqual(synthesizeChannels(scene, 1000), original);
  const a = createEngine(), b = createEngine();
  for (let t = 0; t <= 1000; t += 200) {
    stepEngine(a, frame(t, [{ ...point, source: 'human' }]), t);
    stepEngine(b, frame(t, [{ ...point, source: 'fan' }]), t);
  }
  assert.equal(a.output.occupied, b.output.occupied);
  assert.throws(() => stepEngine(a, null, 0), RangeError);
});
