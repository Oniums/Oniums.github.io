const DAY = 86400000000n;
const fraction = text => BigInt((text || '').padEnd(6, '0'));
// A timestamp must be at the beginning of the line, optionally inside brackets.
export function parseTimestamp(line, numericUnit = 'ms') {
  const text = line.trimStart().replace(/^\[\s*/, '');
  const dated = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,6}))?(Z|[+-]\d{2}:?\d{2})?(?=\s|\]|$)/);
  if (dated) {
    const [, y, mo, d, h, mi, s, f, zone] = dated;
    const date = new Date(0); date.setUTCFullYear(+y, +mo - 1, +d); date.setUTCHours(+h, +mi, +s, 0);
    if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +mo - 1 || date.getUTCDate() !== +d || +h > 23 || +mi > 59 || +s > 59) return null;
    let zoneMinutes = 0;
    if (zone && zone !== 'Z') {
      const digits = zone.slice(1).replace(':', ''), hours = +digits.slice(0, 2), minutes = +digits.slice(2);
      if (hours > 23 || minutes > 59) return null;
      zoneMinutes = (hours * 60 + minutes) * (zone[0] === '+' ? 1 : -1);
    }
    return { us: BigInt(date.getTime() - zoneMinutes * 60000) * 1000n + fraction(f), kind: zone ? 'absolute' : 'date-local', label: dated[0] };
  }
  const clock = text.match(/^(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,6})(?:,(\d{3}))?)?(?=\s|\]|$)/);
  if (clock) {
    const [, h, m, s, f, micro] = clock;
    if (+h > 23 || +m > 59 || +s > 59 || (micro && f.length !== 3)) return null;
    return { us: BigInt((+h * 3600 + +m * 60 + +s)) * 1000000n + fraction((f || '') + (micro || '')), kind: 'clock', label: clock[0] };
  }
  const elapsed = text.match(/^(\d{1,15})(?:\.(\d{1,6}))?\s*(ms|us|s)?(?=\s|\]|$)/);
  if (elapsed && (line.trimStart().startsWith('[') || elapsed[3])) {
    const unit = elapsed[3] || numericUnit, places = { s: 6, ms: 3, us: 0 }[unit];
    if (places === undefined || (elapsed[2]?.length || 0) > places) return null;
    return { us: BigInt(elapsed[1]) * (10n ** BigInt(places)) + BigInt((elapsed[2] || '').padEnd(places, '0') || '0'), kind: 'uptime', label: elapsed[0] };
  }
  return null;
}
const rules = [
  [/CommissioningComplete/i, '配网完成相关', 'complete'], [/\bSubscribe|\bReportData|subscription/i, '订阅 / 上报', 'subscribe'],
  [/\bCASE\b|CASE_Sigma|Sigma[123]/i, 'CASE', 'case'], [/DNS-?SD|operational discovery/i, '运行发现', 'discovery'],
  [/\bSRP\b/i, 'SRP', 'srp'], [/\bCHILD\b|\bDETACHED\b|\bAttach\b|ConnectNetwork/i, 'Thread 附着', 'attach'],
  [/Dataset|AddOrUpdateThreadNetwork/i, 'Thread Dataset', 'dataset'], [/AddNOC|\bNOC\b/i, 'Fabric 凭据', 'noc'],
  [/Attestation|\bDAC\b/i, '设备证明', 'attestation'], [/fail[- ]?safe/i, 'Fail-safe', 'failsafe'],
  [/\bPASE\b|PBKDF/i, 'PASE', 'pase'], [/\bBLE\b|\bBTP\b|\bGATT\b/i, 'BLE / BTP', 'ble']
];
export function markEvent(line, keyword = '') {
  const rule = rules.find(([pattern]) => pattern.test(line));
  const flagged = /\bfail(?:ed|ure)?\b(?![- ]?safe)|\berror\b|timeout|timed out|\bDETACHED\b|失败|超时/i.test(line);
  return { label: rule?.[1] || '', step: rule?.[2] || '', flagged, custom: Boolean(keyword && line.toLowerCase().includes(keyword.toLowerCase())) };
}
export function organizeTimeline(input, { numericUnit = 'ms', rollover = true, keyword = '' } = {}) {
  if (!input.trim()) throw new Error('请粘贴日志或载入示例。');
  if (input.length > 2 * 1024 * 1024) throw new Error('日志最多 2 MiB 文本字符。');
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 20000) throw new Error('最多支持 20,000 行，请分段整理。');
  const rows = []; let previous = null, origin = null, dayOffset = 0n, segment = 0, longest = null, parsed = 0;
  for (const [i, text] of lines.entries()) {
    const stamp = parseTimestamp(text, numericUnit);
    const row = { line: i + 1, text, stamp: stamp?.label || '', delta: null, elapsed: null, segment: null, note: '', ...markEvent(text, keyword) };
    if (stamp) {
      parsed++;
      if (!previous || stamp.kind !== previous.kind) {
        segment++; dayOffset = 0n; origin = stamp.us;
        if (previous) row.note = '时间格式变化，开始新段';
      } else if (stamp.us < previous.raw) {
        if (stamp.kind === 'clock' && rollover && previous.raw - stamp.us > DAY / 2n) {
          dayOffset += DAY; row.note = '按跨午夜处理';
        } else { segment++; dayOffset = 0n; origin = stamp.us; row.note = '时间回退 / 计数重置，开始新段'; }
      }
      const adjusted = stamp.us + dayOffset;
      if (previous && previous.segment === segment) {
        row.delta = Number(adjusted - previous.adjusted) / 1000;
        if (!longest || row.delta > longest.delta) longest = { delta: row.delta, from: previous.line, to: row.line, segment };
      }
      row.elapsed = Number(adjusted - origin) / 1000; row.segment = segment;
      previous = { kind: stamp.kind, raw: stamp.us, adjusted, line: row.line, segment };
    } else row.note = '无可识别时间戳，保留原行';
    rows.push(row);
  }
  return { rows, parsed, unparsed: rows.length - parsed, segments: segment, longest };
}
export function timelineCsv(rows) {
  // Neutralize spreadsheet formula prefixes in user-provided text cells.
  const cell = value => '"' + String(value ?? '').replace(/^[\s]*[=+@-]/, match => "'" + match).replaceAll('"', '""') + '"';
  return '\uFEFF' + [['行号', '分段', '时间戳', '距段起点 ms', '距上一时间戳 ms', '事件关键词', '异常关键词', '备注', '原文'], ...rows.map(r => [r.line, r.segment, r.stamp, r.elapsed, r.delta, r.label, r.flagged ? '是' : '', r.note, r.text])].map(row => row.map(cell).join(',')).join('\r\n');
}
export const LOG_EXAMPLE = `[12:00:00.000] BLE connected
[12:00:00.180] BTP transport ready
[12:00:00.500] PASE established
[12:00:00.620] Arm fail-safe
[12:00:00.950] Attestation verified
[12:00:01.200] AddNOC response
[12:00:01.350] Thread Dataset configured
[12:00:02.000] Device Role: CHILD
[12:00:02.150] SRP registered
[12:00:02.200] DNS-SD operational discovery started
[12:00:17.200] DNS-SD discovery timed out
    example ends here; no CASE or CommissioningComplete observed`;
