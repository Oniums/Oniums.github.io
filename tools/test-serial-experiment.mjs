import test from 'node:test';
import assert from 'node:assert/strict';
import { SerialExperiment, parsePlot, parseRules } from '../source/tools/assets/serial-experiment.mjs';
const enc = new TextEncoder();
const feed = (e, text, at = 1000) => e.ingest(enc.encode(text), at);
const start = (e, extra = {}) => e.start({ name: 'test', expect: 'BOOT OK\nSELFTEST OK', forbid: 'PANIC', at: 0, ...extra });

test('streaming bytes preserve UTF-8 and split CRLF; only complete RX lines count', () => {
  const e = new SerialExperiment(); start(e, { expect: '启动完成' });
  const data = enc.encode('启动完成\r\n!p 10 voltage=3.3 temperature=-1.2e1\n');
  for (const byte of data) e.ingest(Uint8Array.of(byte), 100);
  assert.equal(e.run.received, 2); assert.equal(e.verdict(), 'running'); e.stop();
  assert.equal(e.verdict(), 'pass'); assert.equal(e.run.plots.get('temperature')[0].value, -12);
});
test('forbidden event after expected result fails; blank and partial evidence cannot pass', () => {
  const e = new SerialExperiment(); start(e); feed(e, 'BOOT OK\nSELFTEST OK\n');
  assert.equal(e.verdict(), 'running'); feed(e, 'PANIC\n'); e.stop(); assert.equal(e.verdict(), 'fail');
  for (const text of ['', '\n\n', 'BOOT OK\nSELFTEST OK']) {
    e.resetStream(); start(e); feed(e, text); e.stop(); assert.equal(e.verdict(), 'incomplete');
  }
});
test('new session excludes stale partial lines and previous successes', () => {
  const e = new SerialExperiment(); feed(e, 'old SELF'); start(e, { expect: 'SELFTEST OK' });
  feed(e, 'TEST OK\n'); e.stop(); assert.equal(e.run.seen.size, 0); assert.equal(e.verdict(), 'incomplete');
  start(e); feed(e, 'BOOT OK\n'); e.stop(); assert.equal(e.verdict(), 'fail');
});
test('manual markers cannot satisfy assertions; raw content is kept without HTML interpretation', () => {
  const e = new SerialExperiment(); start(e, { expect: 'SELFTEST OK' });
  e.mark('SELFTEST OK'); feed(e, 'noise\n!m @42 <img onerror=alert(1)>\n!m 12 cells balanced\n'); e.stop();
  assert.equal(e.verdict(), 'fail'); assert.equal(e.run.markers[1].text, '<img onerror=alert(1)>');
  assert.equal(e.run.markers[1].tick, '42'); assert.equal(e.run.markers[2].text, '12 cells balanced');
});
test('bounded lines mark incomplete even if all expected words were observed', () => {
  const e = new SerialExperiment({ maxLines: 2, maxChars: 30 }); start(e);
  feed(e, 'BOOT OK\nSELFTEST OK\nmore\n'); e.stop();
  assert.equal(e.verdict(), 'incomplete'); assert.equal(e.run.droppedLines, 1);
  const data = e.snapshot(); assert.equal(data.lines.length, 2); assert.match(data.startedAt, /[+-]\d\d:\d\d$/);
  assert.equal(data.expected.every(x => x.seen), true);
});
test('serial errors, background and disconnect preserve evidence without a pass', () => {
  for (const reason of ['串口读取告警', '页面进入后台', '串口连接结束']) {
    const e = new SerialExperiment(); start(e); feed(e, 'BOOT OK\nSELFTEST OK\n');
    e.stop(reason); assert.equal(e.verdict(), 'incomplete'); assert.equal(e.run.lines.length, 2);
  }
  const e = new SerialExperiment(); start(e); feed(e, 'BOOT OK\nSELF'); e.interrupt('read error');
  feed(e, 'TEST OK\n'); e.stop(); assert.equal(e.verdict(), 'incomplete'); assert(!e.run.seen.has('SELFTEST OK'));
});
test('overlong or malformed input is bounded and cannot silently pass', () => {
  for (const bytes of [enc.encode('x'.repeat(17000) + '\n'), Uint8Array.of(255, 10), enc.encode('x'.repeat(4100) + '\n')]) {
    const e = new SerialExperiment(); start(e); e.ingest(bytes); feed(e, 'BOOT OK\nSELFTEST OK\n'); e.stop();
    assert.equal(e.verdict(), 'incomplete'); assert(e.bytes.length <= 16384);
  }
});
test('plot grammar rejects nonfinite, duplicate, unsafe tick and invalid names', () => {
  for (const s of ['!p 1 x=NaN', '!p 1 x=Infinity', '!p 1 x=1e999', '!p 1 x=1 x=2', '!p -1 x=2', '!p 9007199254740992 x=1', '!p 1 =bad=2', '!p 1 x=0x10', '!p 1']) assert.equal(parsePlot(s), null, s);
  assert.equal(parsePlot('!p 4294967295 v=1e-3')['values'].get('v'), 0.001);
});
test('plot and marker retention is bounded; rollback is segmented and CSV is reproducible', () => {
  const e = new SerialExperiment({ maxSamples: 2, maxChannels: 1, maxMarkers: 1 }); start(e, { expect: '', forbid: '' });
  feed(e, '!p 20 x=1 y=2\n!p 30 x=2\n!p 1 x=3\n!p 2 x=bad\n!m one\n!m two\n'); e.stop();
  assert.equal(e.run.plots.size, 1); assert.deepEqual(e.run.plots.get('x').map(s => s.segment), [0, 1]);
  assert.equal(e.run.droppedSamples, 1); assert.equal(e.run.droppedMarkers, 1); assert.equal(e.run.invalidPlots, 1);
  assert.equal(e.verdict(), 'not-configured'); assert.equal(e.csv().split('\r\n').length, 3);
  assert.equal(e.snapshot().plots[0].samples.length, 2);
});
test('rules are literal, case sensitive, frozen per run and validated before replacement', () => {
  const e = new SerialExperiment(); start(e, { expect: 'ok.*', forbid: '' }); feed(e, 'ok yes\nOK.*\n'); e.stop();
  assert.equal(e.verdict(), 'fail'); const old = e.run;
  assert.throws(() => start(e, { name: '' })); assert.equal(e.run, old);
  assert.throws(() => parseRules('x'.repeat(121))); assert.throws(() => parseRules(Array.from({length:21}, (_,i) => String(i)).join('\n')));
  assert.deepEqual(parseRules('A\nA\n B '), ['A', 'B']);
});

test('control-only RX cannot pass a forbidden-only check', () => {
  const e = new SerialExperiment(); start(e, { expect: '', forbid: 'PANIC' });
  feed(e, '\x00\x00\n\t\n'); e.stop(); assert.equal(e.verdict(), 'incomplete');
});
