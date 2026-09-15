// A deterministic teaching model. It does not reproduce a radar vendor's detector.
export const STEP_MS = 200;
export const DEFAULTS = Object.freeze({ minSnr: 12, confirmMs: 600, holdMs: 8000, mask: 255 });
export const FRESH_MS = Object.freeze({ motion: 400, presence: 1200 });
export const STALE_MS = 2000;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function regionOf(point) {
  if (![point.x, point.y, point.snr].every(Number.isFinite) || point.y < 0) return -1;
  const range = Math.hypot(point.x, point.y);
  return range < 4 ? Math.floor(range / 0.5) : -1;
}
export function filterPoint(point, config, learned = []) {
  const region = regionOf(point);
  if (region < 0) return { region, accepted: false, reason: '范围外' };
  if (!(config.mask & (1 << region))) return { region, accepted: false, reason: '区间关闭' };
  if (point.snr < config.minSnr) return { region, accepted: false, reason: '低于基础门限' };
  if (Number.isFinite(learned[region]) && point.snr < learned[region]) return { region, accepted: false, reason: '低于背景门限' };
  return { region, accepted: true, reason: '保留' };
}
const emptyZone = () => ({ since: null, lastHit: null, hits: 0, confirmed: false });
export function createEngine(config = {}, learned = []) {
  return {
    config: { ...DEFAULTS, ...config }, learned: [...learned], now: 0,
    lastFrame: null, lastSeq: -1, channels: {}, zones: Array.from({ length: 8 }, emptyZone),
    occupied: false, lastEvidence: null, status: 'empty', events: [], output: null
  };
}
export function stepEngine(engine, frame, now) {
  if (!Number.isFinite(now) || now < engine.now) throw new RangeError('Simulation time must be monotonic');
  engine.now = now;
  const previousStatus = engine.status;
  let received = false;
  if (frame && frame.complete === true && Number.isSafeInteger(frame.seq) && frame.seq > engine.lastSeq &&
      Array.isArray(frame.channels) && frame.channels.every(c =>
        Object.hasOwn(FRESH_MS, c.kind) && Number.isFinite(c.observedAt) && c.observedAt <= now &&
        c.observedAt >= 0 && Array.isArray(c.points))) {
    if (previousStatus === 'unknown') {
      // A recovered stream starts a new decision window; old evidence cannot revive occupancy.
      engine.channels = {};
      engine.zones = Array.from({ length: 8 }, emptyZone);
      engine.occupied = false;
      engine.lastEvidence = null;
    }
    engine.lastFrame = now;
    engine.lastSeq = frame.seq;
    received = true;
    for (const channel of frame.channels) {
      const previous = engine.channels[channel.kind];
      if (!previous || channel.observedAt > previous.observedAt) {
        engine.channels[channel.kind] = { ...channel, points: channel.points.map(p => ({ ...p })) };
      }
    }
  }
  const unknown = now - (engine.lastFrame ?? 0) >= STALE_MS;
  const zoneViews = Array.from({ length: 8 }, () => ({ motion: 0, presence: 0, observedAt: null, confirmed: false }));
  const points = [];
  for (const channel of Object.values(engine.channels)) {
    const fresh = now - channel.observedAt <= FRESH_MS[channel.kind];
    for (const point of channel.points) {
      const result = filterPoint(point, engine.config, engine.learned);
      points.push({ ...point, ...result, kind: channel.kind, fresh });
      if (!unknown && fresh && result.accepted) {
        const view = zoneViews[result.region];
        view[channel.kind]++;
        view.observedAt = Math.max(view.observedAt ?? 0, channel.observedAt);
      }
    }
  }
  let evidenceMask = 0;
  let confirmedMask = 0;
  for (let i = 0; i < 8; i++) {
    const view = zoneViews[i];
    const zone = engine.zones[i];
    if (view.observedAt === null) {
      engine.zones[i] = emptyZone();
      continue;
    }
    evidenceMask |= 1 << i;
    if (zone.lastHit === null || view.observedAt > zone.lastHit) {
      zone.since ??= view.observedAt;
      zone.lastHit = view.observedAt;
      zone.hits++;
      if (zone.hits >= 2 && zone.lastHit - zone.since >= engine.config.confirmMs) zone.confirmed = true;
      if (zone.confirmed) engine.lastEvidence = Math.max(engine.lastEvidence ?? 0, zone.lastHit);
    }
    view.confirmed = zone.confirmed;
    if (zone.confirmed) confirmedMask |= 1 << i;
  }
  if (unknown) engine.status = 'unknown';
  else {
    if (confirmedMask) engine.occupied = true;
    if (engine.occupied && engine.lastEvidence !== null && now - engine.lastEvidence >= engine.config.holdMs) engine.occupied = false;
    engine.status = engine.occupied ? (confirmedMask ? 'present' : 'holding') : (evidenceMask ? 'candidate' : 'empty');
  }
  if (previousStatus !== engine.status) {
    engine.events.unshift({ time: now, from: previousStatus, to: engine.status });
    engine.events.length = Math.min(engine.events.length, 60);
  }
  engine.output = {
    status: engine.status, occupied: unknown ? null : engine.occupied, received,
    points, zones: zoneViews, evidenceMask, confirmedMask,
    remainingMs: !unknown && engine.occupied ? Math.max(0, engine.config.holdMs - (now - engine.lastEvidence)) : 0,
    lastEvidence: engine.lastEvidence, lastFrame: engine.lastFrame,
    channelTimes: Object.fromEntries(Object.entries(engine.channels).map(([kind, c]) => [kind, c.observedAt]))
  };
  return engine.output;
}

export function defaultScene() {
  return [
    { id: 'a', label: '人物 A', enabled: true, mode: 'motion', x: -0.7, y: 2.1 },
    { id: 'b', label: '人物 B', enabled: false, mode: 'presence', x: 1, y: 2.8 },
    { id: 'fan', label: '风扇', enabled: false, mode: 'fan', x: 1.5, y: 2 }
  ];
}
// Scene labels are used ONLY to construct a known example, never by filterPoint/stepEngine.
export function synthesizeChannels(scene, now) {
  return ['motion', 'presence'].map(kind => {
    const observedAt = kind === 'motion' ? now : Math.floor(now / 1000) * 1000;
    const points = [];
    for (let index = 0; index < scene.length; index++) {
      const item = scene[index];
      if (!item.enabled || (kind === 'presence') !== (item.mode === 'presence')) continue;
      const count = item.mode === 'fan' ? 4 : item.mode === 'presence' ? 3 : 7;
      const center = item.mode === 'fan' ? 17 : item.mode === 'presence' ? 14 : 20;
      for (let j = 0; j < count; j++) {
        const phase = observedAt / 700 + j * 2.4 + index * 1.3;
        points.push({
          x: item.x + Math.sin(phase) * 0.07,
          y: item.y + Math.cos(phase * 1.2) * 0.07,
          snr: center + Math.sin(phase) * 1.5
        });
      }
    }
    return { kind, observedAt, points };
  });
}
export function learnBackground(peaks, channels) {
  const next = [...peaks];
  for (const channel of channels) for (const point of channel.points) {
    const region = regionOf(point);
    if (region >= 0) next[region] = Math.max(next[region] ?? -Infinity, point.snr + 2);
  }
  return next;
}
