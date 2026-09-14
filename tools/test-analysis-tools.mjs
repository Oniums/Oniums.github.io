import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBinary, byteWindow } from '../source/tools/assets/binary-core.mjs';
import { parseDataset, DATASET_EXAMPLE } from '../source/tools/assets/dataset-core.mjs';
import { parseTimestamp, organizeTimeline, timelineCsv, markEvent, LOG_EXAMPLE } from '../source/tools/assets/timeline-core.mjs';
const bytes = a => Uint8Array.from(a);
test('BIN: identical, empty, first/last offsets, missing tails', () => {
  assert.deepEqual(compareBinary(bytes([]), bytes([])), { length: 0, different: 0, first: null, ranges: [], rangeCount: 0 });
  assert.equal(compareBinary(bytes([0,255]), bytes([0,255])).different, 0);
  const result = compareBinary(bytes([0,1,2,3,4]), bytes([8,1,8,9,4,0]));
  assert.deepEqual(result, { length: 6, different: 4, first: 0, ranges: [{start:0,end:1},{start:2,end:4},{start:5,end:6}], rangeCount:3 });
  assert.deepEqual(compareBinary(bytes([]), bytes([0])).ranges, [{start:0,end:1}]);
  assert.deepEqual(byteWindow(bytes([0]), bytes([0,255]), 1), [{offset:1,a:null,b:255,changed:true}]);
});
test('BIN: capped interval storage still counts whole file; random independent runs', () => {
  const a = new Uint8Array(20002), b = Uint8Array.from(a, (_, i) => i % 2);
  const r = compareBinary(a,b); assert.equal(r.ranges.length,5000);assert.equal(r.rangeCount,10001);assert.equal(r.different,10001);
  let seed=123;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed%256;};
  for(let n=0;n<100;n++) {
    const x=Uint8Array.from({length:rand()},rand), y=Uint8Array.from({length:rand()},rand);
    const changed=Array.from({length:Math.max(x.length,y.length)},(_,i)=>i).filter(i=>x[i]!==y[i]);
    const actual=compareBinary(x,y);
    assert.equal(actual.different,changed.length);assert.equal(actual.first,changed[0]??null);
    assert.deepEqual(actual.ranges.flatMap(r=>Array.from({length:r.end-r.start},(_,i)=>r.start+i)),changed);
  }
});
test('Dataset: constructed complete active dataset and redaction classifications', () => {
  const result=parseDataset(DATASET_EXAMPLE);
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.warnings,[]);assert.equal(result.rows.length,10);
  const get=t=>result.rows.find(r=>r.type===t);
  assert.equal(get(0).value,'Page 0 · 信道 15');assert.equal(get(3).value,'Lab-Demo');
  assert.equal(get(7).value,'fd10:2030:4050:6070::/64');
  assert.equal(get(14).value,'seconds=1 · ticks=0 · authoritative=0');
  assert.match(get(53).value,/11, 12, 13, 14, 15/);
  for(const t of [2,3,4,5,7]) assert(get(t).sensitive);
  assert.equal(get(0).sensitive,false);
});
test('Dataset: truncated headers/values, duplicate fields and invalid known lengths', () => {
  assert.match(parseDataset('00').errors[0],/长度字节/);
  assert.match(parseDataset('000300').errors[0],/声明 3 字节/);
  assert.match(parseDataset('0002000F').errors[0],/应为 3 字节/);
  assert.match(parseDataset('0102123401025678').errors[0],/重复/);
  assert(parseDataset('0302C080').errors.length);
  assert(parseDataset('030100').errors.length);
  assert(parseDataset('0c0202a0').errors.length);
  for(const input of ['','0','GG','00'.repeat(255)]) assert.throws(()=>parseDataset(input));
});
test('Dataset: channel mask substructure, timestamps and pending completeness', () => {
  // OpenThread CLI host mask 0x07fff800 is wire mask 00 1f ff e0.
  assert.equal(parseDataset('35060004001fffe0').rows[0].value, 'Page 0 · 信道 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26');
  assert.equal(parseDataset('3506000480000001').rows[0].value, 'Page 0 · 信道 0, 31');
  for(const value of ['350100','3503000400','350400020000','350C000400000800000400001000']) assert(parseDataset(value).errors.length,value);
  const stamp=parseDataset('0e08000000000001ffff').rows[0];
  assert.equal(stamp.value,'seconds=1 · ticks=32767 · authoritative=1');
  assert(parseDataset('33080000000000010000').missing.includes('Delay Timer'));
  const unknown=parseDataset('EE020102');assert(unknown.rows[0].sensitive);assert.match(unknown.warnings[0],/未解释/);
  assert(parseDataset('0003000001').warnings.some(x=>x.includes('11–26')));
});
test('Timestamp: ISO offsets, calendar validation, microseconds, and numeric unit selection', () => {
  assert.equal(parseTimestamp('2026-09-14T08:00:00.123456+08:00 x').us,parseTimestamp('2026-09-14T00:00:00.123456Z x').us);
  assert.equal(parseTimestamp('[00:00:01.234,567] x').us,1234567n);
  assert.equal(parseTimestamp('[1.234s] x').us,1234000n);
  assert.equal(parseTimestamp('[1234ms] x').us,1234000n);
  assert.equal(parseTimestamp('[1234000us] x').us,1234000n);
  assert.equal(parseTimestamp('[1.234] x','s').us,1234000n);
  assert.equal(parseTimestamp('[1.234] x','ms').us,1234n);
  for(const line of ['2026-02-30 12:00:00 x','2026-13-01 00:00:00 x','[12:60:00] x','[25:00:00] x','[1.1234ms] x','noise 12:00:00 x']) assert.equal(parseTimestamp(line),null,line);
});
test('Timeline: exact intervals, midnight versus reset, unsorted input and mixed clocks', () => {
  let r=organizeTimeline('[23:59:59.999] x\nstack trace\n[00:00:00.001] y');
  assert.equal(r.longest.delta,2);assert.equal(r.unparsed,1);assert.equal(r.segments,1);
  r=organizeTimeline('[23:59:59.999] x\n[00:00:00.001] y',{rollover:false});assert.equal(r.segments,2);assert.equal(r.longest,null);
  r=organizeTimeline('[10ms] a\n[5ms] b\n[6ms] c');assert.equal(r.segments,2);assert.equal(r.rows[1].delta,null);assert.equal(r.longest.delta,1);
  r=organizeTimeline('2026-01-01 00:00:00.000001 a\n2026-01-01 00:00:00.000002 b');assert.equal(r.longest.delta,0.001);
  r=organizeTimeline('[00:00:00] a\n[1ms] b\n2026-01-01T00:00:00Z c\n2026-01-01 00:00:01 d');assert.equal(r.segments,4);assert.equal(r.longest,null);
  r=organizeTimeline('[0ms] a\n[0ms] b');assert.equal(r.longest.delta,0);
  assert.equal(organizeTimeline('plain log').parsed,0);
});
test('Timeline: original rows, heuristic event flags, safe CSV and resource limits', () => {
  const r=organizeTimeline(LOG_EXAMPLE);assert.equal(r.longest.delta,15000);assert.equal(r.longest.to,11);
  assert.equal(r.rows.length,12);assert.equal(r.rows[11].text,LOG_EXAMPLE.split('\n')[11]);
  assert.equal(markEvent('CASE failed').step,'case');assert(markEvent('CASE failed').flagged);
  assert.equal(markEvent('Arm fail-safe').flagged,false);
  assert(markEvent('retry','RETRY').custom);assert.equal(markEvent('lowercase example').step,'');
  const csv=timelineCsv(organizeTimeline('=HYPERLINK("x")\n +SUM(1,2)').rows);assert.match(csv,/'=HYPERLINK/);assert.match(csv,/' \+SUM/);assert.match(csv,/""x""/);
  assert.throws(()=>organizeTimeline(''));assert.throws(()=>organizeTimeline('x'.repeat(2097153)));assert.throws(()=>organizeTimeline('x\n'.repeat(20001)));
});
