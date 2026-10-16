// Inspired by MCUscope's sessions, markers, !p telemetry and assertions.
// Independent browser implementation; see https://github.com/dwatman/mcuscope.
import { localTimestamp } from './serial-core.mjs?v=20261016-experiments';

const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
export function parsePlot(line) {
  if (line.length > 4096) return null;
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== '!p' || !/^\d+$/.test(tokens[1] || '') || tokens.length < 3 || tokens.length > 18) return null;
  const tick = Number(tokens[1]);
  if (!Number.isSafeInteger(tick)) return null;
  const values = new Map();
  for (const field of tokens.slice(2)) {
    const match = /^([A-Za-z_][A-Za-z0-9_.-]{0,31})=(.+)$/.exec(field);
    if (!match || !numberPattern.test(match[2]) || !Number.isFinite(Number(match[2])) || values.has(match[1])) return null;
    values.set(match[1], Number(match[2]));
  }
  return { tick, values };
}
export function parseRules(text) {
  const rules = [...new Set(text.split(/\r?\n/).map(x => x.trim()).filter(Boolean))];
  if (rules.length > 20 || rules.some(x => x.length > 120)) throw new Error('每类最多 20 条，每条最多 120 字符。');
  return rules;
}
export class SerialExperiment {
  constructor({ maxLines = 2000, maxChars = 1024 * 1024, maxSamples = 600, maxChannels = 8, maxMarkers = 100 } = {}) {
    Object.assign(this, { maxLines, maxChars, maxSamples, maxChannels, maxMarkers });
    this.run = null; this.generation = 0; this.resetStream();
  }
  resetStream(encoding = 'utf-8') {
    this.decoder = new TextDecoder(encoding, { fatal: true });
    this.bytes = []; this.owner = null; this.overflow = false; this.afterCR = false;
  }
  start({ name, expect = '', forbid = '', at = Date.now(), demo = false } = {}) {
    if (this.run?.active) throw new Error('请先结束当前会话。');
    name = (name || '').trim();
    if (!name || name.length > 80) throw new Error('会话名称请输入 1–80 个字符。');
    const expected = parseRules(expect), forbidden = parseRules(forbid);
    this.run = { id: ++this.generation, name, demo, active: true, start: at, end: null, reason: '',
      expected, forbidden, seen: new Set(), banned: new Set(), issues: new Set(),
      lines: [], chars: 0, received: 0, nonempty: 0, droppedLines: 0, markers: [], droppedMarkers: 0,
      plots: new Map(), droppedSamples: 0, ignoredChannels: new Set(), invalidPlots: 0, lastTick: null, segment: 0 };
    if (this.bytes.length || this.overflow) this.run.issues.add('开始时已有未完成接收行，该行不参与检查');
    return this.run;
  }
  ingest(bytes, at = Date.now()) {
    for (const byte of bytes) {
      if (this.afterCR && byte === 10) { this.afterCR = false; continue; }
      this.afterCR = false;
      if (byte === 10 || byte === 13) {
        if (!this.overflow && this.run?.active && (this.owner === this.run.id || this.owner === null)) {
          try { this.line(this.decoder.decode(Uint8Array.from(this.bytes)), at); }
          catch { this.run.issues.add('接收文本解码失败'); }
        }
        this.bytes = []; this.owner = null; this.overflow = false; this.afterCR = byte === 13;
      } else {
        if (!this.bytes.length && !this.overflow) this.owner = this.run?.active ? this.run.id : -1;
        if (!this.overflow) {
          this.bytes.push(byte);
          if (this.bytes.length > 16384) {
            this.bytes = []; this.overflow = true;
            if (this.run?.active) this.run.issues.add('接收行超过 16 KiB，已跳过');
          }
        }
      }
    }
  }
  line(text, at) {
    const run = this.run;
    run.received++; if (text.replace(/[\x00-\x20\x7f]/g, '').trim()) run.nonempty++;
    if (text.length > 4096) { run.issues.add('接收行超过 4096 字符，已跳过'); return; }
    for (const word of run.expected) if (text.includes(word)) run.seen.add(word);
    for (const word of run.forbidden) if (text.includes(word)) run.banned.add(word);
    run.lines.push({ at, text }); run.chars += text.length;
    while (run.lines.length > this.maxLines || run.chars > this.maxChars) {
      run.chars -= run.lines.shift().text.length; run.droppedLines++;
    }
    if (text.startsWith('!p ')) {
      const plot = parsePlot(text);
      if (!plot) { run.invalidPlots++; return; }
      if (run.lastTick !== null && plot.tick < run.lastTick) run.segment++;
      run.lastTick = plot.tick;
      for (const [name, value] of plot.values) {
        if (!run.plots.has(name)) {
          if (run.plots.size >= this.maxChannels) {
            // 不保留任意多的未知通道名。
            if (run.ignoredChannels.size < 20) run.ignoredChannels.add(name);
            continue;
          }
          run.plots.set(name, []);
        }
        const samples = run.plots.get(name);
        samples.push({ at, tick: plot.tick, value, segment: run.segment });
        if (samples.length > this.maxSamples) { samples.shift(); run.droppedSamples++; }
      }
    } else {
      const marker = /^!m(?:\s+@([0-9]+))?\s+(.+)$/.exec(text);
      if (marker) this.mark(marker[2], at, 'device', marker[1] ?? null);
    }
  }
  mark(text, at = Date.now(), source = 'manual', tick = null) {
    if (!this.run?.active) throw new Error('请先开始会话。');
    text = text.trim();
    if (!text || text.length > 200) {
      if (source === 'device') { this.run.droppedMarkers++; return; }
      throw new Error('标记请输入 1–200 个字符。');
    }
    this.run.markers.push({ at, text, source, tick });
    if (this.run.markers.length > this.maxMarkers) { this.run.markers.shift(); this.run.droppedMarkers++; }
  }
  interrupt(reason) {
    if (this.run?.active) this.run.issues.add(reason);
    this.resetStream(this.decoder.encoding);
  }
  stop(reason = 'manual', at = Date.now()) {
    if (!this.run?.active) return;
    if (this.bytes.length || this.overflow) this.run.issues.add('结束时有未完成接收行');
    if (reason !== 'manual' && reason !== 'demo') this.run.issues.add(reason);
    Object.assign(this.run, { active: false, end: at, reason });
  }
  verdict() {
    const r = this.run;
    if (!r) return 'idle';
    if (r.active) return 'running';
    if (!r.expected.length && !r.forbidden.length) return 'not-configured';
    if (r.banned.size) return 'fail';
    if (r.issues.size || r.droppedLines || !r.nonempty) return 'incomplete';
    return r.expected.every(x => r.seen.has(x)) ? 'pass' : 'fail';
  }
  snapshot() {
    const r = this.run;
    if (!r) throw new Error('还没有会话可导出。');
    return { version: 1, tool: 'Oniums Web Serial', name: r.name, demo: r.demo,
      startedAt: localTimestamp(r.start), endedAt: r.end === null ? null : localTimestamp(r.end),
      active: r.active, reason: r.reason, verdict: this.verdict(), matching: 'case-sensitive literal, complete RX lines only',
      expected: r.expected.map(text => ({ text, seen: r.seen.has(text) })),
      forbidden: r.forbidden.map(text => ({ text, seen: r.banned.has(text) })),
      issues: [...r.issues], receivedLines: r.received, droppedLines: r.droppedLines,
      droppedMarkers: r.droppedMarkers, droppedSamples: r.droppedSamples,
      ignoredChannels: [...r.ignoredChannels], invalidPlotLines: r.invalidPlots,
      limits: { lines: this.maxLines, chars: this.maxChars, channels: this.maxChannels, samplesPerChannel: this.maxSamples, markers: this.maxMarkers },
      lines: r.lines.map(x => ({ ...x, at: localTimestamp(x.at) })),
      markers: r.markers.map(x => ({ ...x, at: localTimestamp(x.at) })),
      plots: [...r.plots].map(([name, samples]) => ({ name, samples: samples.map(x => ({ ...x, at: localTimestamp(x.at) })) })) };
  }
  csv() {
    const rows = ['channel,segment,device_tick_ms,received_at,value'];
    for (const [name, samples] of this.run?.plots ?? []) {
      for (const s of samples) rows.push([name, s.segment, s.tick, localTimestamp(s.at), s.value].join(','));
    }
    return rows.join('\r\n');
  }
}
