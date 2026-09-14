import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parsePairing, manualFromFields, verhoeff, decodeBase38, parseBytes, inspectBytes, flipBit, hexBytes, powerBudget } from "../source/tools/assets/calculations.mjs";

// 仅使用公开 SDK 向量与构造数据，禁止加入设备现场凭据。
test("公开 QR 与手动码向量", () => {
  const qr = parsePairing("MT:Y.K9042C00KA0648G00");
  assert.equal(qr.manual, "34970112332");
  assert.equal(qr.vid, 0xfff1); assert.equal(qr.pid, 0x8000);
  assert.equal(qr.pin, 20202021); assert.equal(qr.discriminator, 3840); assert.equal(qr.discovery, 2);
  const manual = parsePairing("3497-011-2332");
  assert.equal(manual.short, 15); assert.equal(manual.pin, qr.pin);
  assert.equal(manual.vid, null); assert.equal(manual.discriminator, undefined);
});
test("SDK 自定义流程向量及前导零", () => {
  const code = manualFromFields({ discriminator: 2560, pin: 12345679, flow: 2, vid: 45367, pid: 14526 });
  assert.equal(code.slice(0, -1), "64129507534536714526");
  const parsed = parsePairing(code);
  assert.equal(parsed.vid, 45367); assert.equal(parsed.pid, 14526); assert.equal(parsed.short, 10);
  for (const pin of [1, 16383, 16384, 20202021, 99999998]) for (const short of [0, 1, 3, 4, 10, 15]) for (const flow of [0, 1, 2]) {
    const encoded = manualFromFields({ discriminator: short << 8, pin, flow, vid: 1, pid: 1 });
    assert.equal(encoded.length, flow === 0 ? 11 : 21);
    const result = parsePairing(encoded);
    assert.equal(result.pin, pin); assert.equal(result.short, short);
    if (short === 0 && flow === 0) assert.equal(encoded[0], "0");
  }
});
for (const input of ["", "MT:", "MT:a!", "MT:Y.K9042C00KA0648G0", "34970112333", "34970112332z", "123", "MT:Y.K9042C00KA0648G00*MT:Y.K9042C00KA0648G00"]) {
  test(`拒绝错误配网输入 ${input ? "长度 " + input.length : "空值"}`, () => assert.throws(() => parsePairing(input)));
}
test("Base38 非规范分组及手动码位宽", () => {
  assert.throws(() => decodeBase38("ZZZZZ"));
  for (const body of ["8999999999", "0999990000", "0000019999", "4000010000"]) assert.throws(() => parsePairing(body + verhoeff(body)));
  assert.throws(() => manualFromFields({ discriminator: 4096, pin: 1, flow: 0, vid: 0, pid: 0 }));
  for (const pin of [0, 11111111, 12345678, 87654321, 99999999]) assert.throws(() => manualFromFields({ discriminator: 0, pin, flow: 0, vid: 0, pid: 0 }));
  assert.throws(() => manualFromFields({ discriminator: 0, pin: 1, flow: 0, vid: 1, pid: 0 }));
});
test("QR 版本、填充位、保留 flow 与可选数据边界", () => {
  const encode = (bytes) => {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.";
    let output = "MT:";
    for (let i = 0; i < bytes.length; i += 3) {
      const group = bytes.slice(i, i + 3);
      let value = group.reduceRight((value, byte) => value * 256 + byte, 0);
      for (let j = 0; j < ({ 1: 2, 2: 4, 3: 5 }[group.length]); j++) { output += alphabet[value % 38]; value = Math.floor(value / 38); }
    }
    return output;
  };
  const original = decodeBase38("Y.K9042C00KA0648G00");
  for (const [index, mask] of [[0, 1], [10, 0x10], [4, 0x18]]) {
    const bytes = original.slice(); bytes[index] |= mask;
    assert.throws(() => parsePairing(encode(bytes)));
  }
  const extended = parsePairing(encode(Uint8Array.from([...original, 0x15, 0x18])));
  assert.equal(extended.optionalBytes, 2);
  assert.equal(extended.manual, "34970112332");
});
test("字节解析严格校验与常见分隔符", () => {
  assert.equal(hexBytes(parseBytes("0x01,02:FF 80")), "01 02 FF 80");
  assert.equal(hexBytes(parseBytes("0102FF80")), "01 02 FF 80");
  for (const input of ["", "0", "0x", "01 2", "01 ZZ", "01;02", "01," , "AA".repeat(257)]) assert.throws(() => parseBytes(input));
});
test("大小端、有符号和 64 位精度", () => {
  assert.equal(inspectBytes(parseBytes("01 02"), "uint16", "little").value, 513n);
  assert.equal(inspectBytes(parseBytes("01 02"), "uint16", "big").value, 258n);
  assert.equal(inspectBytes(parseBytes("FF"), "int8", "little").value, -1n);
  assert.equal(inspectBytes(parseBytes("FF".repeat(8)), "uint64", "big").value, 18446744073709551615n);
  assert.equal(inspectBytes(parseBytes("8000000000000000"), "int64", "big").value, -9223372036854775808n);
});
test("浮点特殊值", () => {
  assert.equal(inspectBytes(parseBytes("0000803F"), "float32", "little").value, 1);
  assert(Object.is(inspectBytes(parseBytes("80000000"), "float32", "big").value, -0));
  assert.equal(inspectBytes(parseBytes("7F800000"), "float32", "big").value, Infinity);
  assert(Number.isNaN(inspectBytes(parseBytes("7FC00000"), "float32", "big").value));
});
test("位域、偏移、翻转保留窗口外字节", () => {
  const bytes = parseBytes("AA 01 02 BB");
  assert.equal(inspectBytes(bytes, "uint16", "little", 1, 8, 9).field, 2n);
  assert.equal(hexBytes(flipBit(bytes, "uint16", "little", 1, 8)), "AA 01 03 BB");
  assert.equal(hexBytes(flipBit(bytes, "uint16", "big", 1, 8)), "AA 00 02 BB");
  assert.throws(() => inspectBytes(bytes, "uint64", "little"));
  assert.throws(() => inspectBytes(bytes, "uint16", "little", 1, 5, 4));
  assert.throws(() => inspectBytes(bytes, "uint16", "little", 1, 0, 16));
  assert.equal(hexBytes(bytes), "AA 01 02 BB");
});
const budget = { sleep: 10, capacity: 1000, effective: 80, activities: [{ name: "活动", current: 1000, duration: 100, interval: 1 }] };
test("功耗按互斥状态加权，不重复累计睡眠", () => {
  const result = powerBudget(budget);
  assert.equal(result.average, 109);
  assert.equal(result.hours, 800000 / 109);
  assert.equal(result.dailyMah, 109 * 24 / 1000);
  assert.equal(result.components.reduce((sum, item) => sum + item.duty, 0), 1);
});
test("纯睡眠、满占用与零电流", () => {
  assert.equal(powerBudget({ ...budget, activities: [] }).average, 10);
  assert.equal(powerBudget({ ...budget, activities: [{ name: "全活动", current: 100, duration: 1000, interval: 1 }] }).average, 100);
  assert.equal(powerBudget({ ...budget, sleep: 0, activities: [] }).hours, Infinity);
});
test("功耗非法输入不产生预算", () => {
  for (const [key, value] of [["sleep", -1], ["capacity", 0], ["effective", 101], ["sleep", NaN], ["capacity", Infinity]]) assert.throws(() => powerBudget({ ...budget, [key]: value }));
  for (const [key, value] of [["current", -1], ["interval", 0], ["duration", 1001]]) assert.throws(() => powerBudget({ ...budget, activities: [{ ...budget.activities[0], [key]: value }] }));
  assert.throws(() => powerBudget({ ...budget, activities: Array.from({ length: 2 }, () => ({ name: "重叠", current: 100, duration: 600, interval: 1 })) }));
});
test("发布同步清理旧资源但保留 tools 构建脚本", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "oniums-toolbox-sync-"));
  try {
    for (const directory of ["public/tools/assets", "tools/assets"]) mkdirSync(path.join(fixture, directory), { recursive: true });
    writeFileSync(path.join(fixture, "public/index.html"), "fixture");
    writeFileSync(path.join(fixture, "public/tools/assets/current.mjs"), "current");
    writeFileSync(path.join(fixture, "tools/assets/stale.mjs"), "stale");
    writeFileSync(path.join(fixture, "tools/check-site.mjs"), "keep this script");
    execFileSync(process.execPath, [fileURLToPath(new URL("./sync-pages-output.mjs", import.meta.url))], { cwd: fixture });
    assert.equal(readFileSync(path.join(fixture, "tools/check-site.mjs"), "utf8"), "keep this script");
    assert(existsSync(path.join(fixture, "tools/assets/current.mjs")));
    assert(!existsSync(path.join(fixture, "tools/assets/stale.mjs")));
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
