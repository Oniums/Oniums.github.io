import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const publicDir = path.resolve("public");
const requiredFiles = [
  "CNAME",
  "index.html",
  "404.html",
  "about/index.html",
  "experience/index.html",
  "projects/index.html",
  "page/2/index.html",
  "page/3/index.html",
  "archives/index.html",
  "categories/index.html",
  "tags/index.html",
  "atom.xml",
  "sitemap.xml",
  "css/index.css",
  "css/var.css",
  "css/custom.css",
  "img/avatar.png",
  "img/github-avatar.jpg",
  "img/banner.jpg",
  "posts/hello-oniums/index.html",
  "posts/debugging-with-an-evidence-chain/index.html",
  "posts/matter-thread-zigbee-layers/index.html",
  "posts/from-private-notes-to-public-writing/index.html",
  "posts/zephyr-stale-build-cache/index.html",
  "posts/multi-image-firmware-variant-verification/index.html",
  "posts/gpio-isr-deferred-processing/index.html",
  "posts/hexo-github-pages-safe-publishing/index.html",
  "posts/telink-matter-external-application-workspace/index.html",
  "posts/wireshark-thread-packet-capture/index.html",
  "posts/obsidian-github-private-knowledge-base/index.html",
  "posts/ai-firmware-closed-loop-workflow/index.html",
  "posts/zigbee-foundations/index.html",
  "posts/zigbee-network-joining-flow/index.html",
  "posts/zigbee-security-key-scope/index.html",
  "posts/zigbee-centralized-distributed-networks/index.html",
  "posts/zigbee-touchlink-commissioning/index.html",
  "posts/zigbee-3-certification-self-test/index.html",
  "posts/zigbee-3-certification-process/index.html",
  "posts/matter-foundations/index.html",
  "posts/thread-foundations/index.html",
  "posts/matter-zigbee-concept-mapping/index.html",
  "posts/matter-over-thread-zigbee-commissioning-comparison/index.html",
  "posts/ble-gatt-connection-basics/index.html",
  "posts/telink-zephyr-matter-build-pipeline/index.html",
  "posts/matter-certification-test-environment/index.html",
  "posts/matter-certificate-relationships/index.html",
  "posts/zigbee-third-party-platform-compatibility/index.html",
  "posts/zha-custom-quirk-development/index.html",
  "posts/zigbee2mqtt-external-converter-development/index.html",
  "posts/smartthings-edge-zigbee-driver-development/index.html",
  "posts/smartthings-edge-driver-channel-invitation-workflow/index.html"
];

const requiredContent = [
  { file: "categories/index.html", marker: 'class="category-lists"' },
  { file: "tags/index.html", marker: 'class="tag-cloud-list' }
];

const forbiddenMarkers = [
  "Hello World - Hexo",
  "An elegant Material-Design theme for Hexo",
  "An elegant theme for Hexo",
  "赵德熙",
  "深圳松诺技术有限公司",
  "伟易达电子实业",
  "深圳市江机实业有限公司",
  "SNZT-",
  "SNZB-",
  "/home/onium",
  "fwsn_",
  "telink-tl323x",
  "smartthingsedgedrivers_develop",
  "Oniums/zha-device-handlers",
  "19-22K",
  "期望薪资",
  "开源贡献",
  "zigbee-herdsman-converters/pull/",
  "zha-device-handlers/pull/",
  "SmartThingsEdgeDrivers/pull/",
  "zigbee-OTA/pull/"
];

const forbiddenPatterns = [
  { label: "中国大陆手机号", pattern: /\b1[3-9]\d{9}\b/g }
];

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    return statSync(fullPath).isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function resolveLocalReference(htmlFile, reference) {
  if (
    !reference ||
    reference.startsWith("#") ||
    reference.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(reference)
  ) {
    return null;
  }

  const cleanReference = reference.split(/[?#]/, 1)[0];
  let decodedReference;
  try {
    decodedReference = decodeURIComponent(cleanReference);
  } catch {
    decodedReference = cleanReference;
  }

  const candidate = decodedReference.startsWith("/")
    ? path.join(publicDir, decodedReference)
    : path.resolve(path.dirname(htmlFile), decodedReference);

  if (!candidate.startsWith(publicDir)) {
    return candidate;
  }

  if (decodedReference.endsWith("/")) {
    return path.join(candidate, "index.html");
  }

  if (existsSync(candidate)) {
    return candidate;
  }

  return path.extname(candidate) ? candidate : path.join(candidate, "index.html");
}

const missingRequired = requiredFiles.filter(
  (file) => !existsSync(path.join(publicDir, file))
);
const missingRequiredContent = requiredContent.filter(({ file, marker }) => {
  const target = path.join(publicDir, file);
  return !existsSync(target) || !readFileSync(target, "utf8").includes(marker);
});

const generatedFiles = walk(publicDir);
const htmlFiles = generatedFiles.filter((file) => file.endsWith(".html"));
const scannableFiles = generatedFiles.filter((file) =>
  /\.(?:html|xml|json|txt)$/i.test(file)
);
const brokenReferences = [];
const forbiddenMatches = [];
const forbiddenPatternMatches = [];

for (const file of scannableFiles) {
  const content = readFileSync(file, "utf8");
  const relativeFile = path.relative(publicDir, file);

  for (const marker of forbiddenMarkers) {
    if (content.includes(marker)) {
      forbiddenMatches.push(`${relativeFile}: ${marker}`);
    }
  }

  for (const { label, pattern } of forbiddenPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      forbiddenPatternMatches.push(`${relativeFile}: ${label}`);
    }
  }
}

for (const htmlFile of htmlFiles) {
  const html = readFileSync(htmlFile, "utf8");
  const relativeHtml = path.relative(publicDir, htmlFile);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = resolveLocalReference(htmlFile, match[1]);
    if (target && !existsSync(target)) {
      brokenReferences.push(`${relativeHtml} -> ${match[1]}`);
    }
  }
}

const failures = [
  ...missingRequired.map((file) => `缺少构建产物: ${file}`),
  ...missingRequiredContent.map(
    ({ file }) => `页面缺少预期内容: ${file}`
  ),
  ...forbiddenMatches.map((match) => `发现默认内容: ${match}`),
  ...forbiddenPatternMatches.map((match) => `发现敏感格式: ${match}`),
  ...brokenReferences.map((reference) => `站内链接无目标: ${reference}`)
];

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Site check passed: ${htmlFiles.length} HTML pages, ${requiredFiles.length} required artifacts, 0 broken local references.`
  );
}
