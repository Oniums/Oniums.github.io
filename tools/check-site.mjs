import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const publicDir = path.resolve("public");
const requiredFiles = [
  "index.html",
  "404.html",
  "about/index.html",
  "projects/index.html",
  "archives/index.html",
  "categories/index.html",
  "tags/index.html",
  "atom.xml",
  "sitemap.xml",
  "css/main.css",
  "css/custom.css",
  "img/avatar.png",
  "img/banner.jpg",
  "posts/hello-oniums/index.html",
  "posts/debugging-with-an-evidence-chain/index.html",
  "posts/matter-thread-zigbee-layers/index.html",
  "posts/from-private-notes-to-public-writing/index.html"
];

const forbiddenMarkers = [
  "Hello World - Hexo",
  "An elegant Material-Design theme for Hexo",
  "An elegant theme for Hexo"
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

const htmlFiles = walk(publicDir).filter((file) => file.endsWith(".html"));
const brokenReferences = [];
const forbiddenMatches = [];

for (const htmlFile of htmlFiles) {
  const html = readFileSync(htmlFile, "utf8");
  const relativeHtml = path.relative(publicDir, htmlFile);

  for (const marker of forbiddenMarkers) {
    if (html.includes(marker)) {
      forbiddenMatches.push(`${relativeHtml}: ${marker}`);
    }
  }

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = resolveLocalReference(htmlFile, match[1]);
    if (target && !existsSync(target)) {
      brokenReferences.push(`${relativeHtml} -> ${match[1]}`);
    }
  }
}

const failures = [
  ...missingRequired.map((file) => `缺少构建产物: ${file}`),
  ...forbiddenMatches.map((match) => `发现默认内容: ${match}`),
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
