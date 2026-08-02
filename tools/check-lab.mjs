import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const repositoryDir = path.resolve(".");
const publicDir = path.join(repositoryDir, "public");
const detailRoots = ["experiments", "debug", "failures", "source-reading"];
const requiredFields = ["content_type", "status", "evidence", "privacy", "description"];
const allowedTypes = new Set(["experiment", "debug", "failure", "source-reading"]);
const allowedStatuses = new Set([
  "candidate",
  "design-record",
  "method-record",
  "verified-method",
  "verified-lesson",
  "planned",
  "active",
]);
const forbiddenMarkers = [
  "/home/onium",
  "SNZT-",
  "SNZB-",
  "fwsn_",
  "telink-tl323x",
  "smartthingsedgedrivers_develop",
  "BEGIN RSA PRIVATE KEY",
  "BEGIN EC PRIVATE KEY",
  "BEGIN OPENSSH PRIVATE KEY",
];

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function frontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, "")])
  );
}

const failures = [];
const detailFiles = detailRoots.flatMap((root) =>
  walk(path.join(repositoryDir, "source", root)).filter(
    (file) => file.endsWith(".md") && path.basename(file) === "index.md" && path.dirname(file) !== path.join(repositoryDir, "source", root)
  )
);

for (const file of detailFiles) {
  const relativeFile = path.relative(repositoryDir, file);
  const content = readFileSync(file, "utf8");
  const fields = frontMatter(content);
  if (!fields) {
    failures.push(`${relativeFile}: 缺少 Front Matter`);
    continue;
  }
  for (const field of requiredFields) {
    if (!fields[field]) failures.push(`${relativeFile}: 缺少字段 ${field}`);
  }
  if (fields.content_type && !allowedTypes.has(fields.content_type)) {
    failures.push(`${relativeFile}: 未知 content_type ${fields.content_type}`);
  }
  if (fields.status && !allowedStatuses.has(fields.status)) {
    failures.push(`${relativeFile}: 未知 status ${fields.status}`);
  }
  if (fields.privacy !== "public") {
    failures.push(`${relativeFile}: 公开仓库条目的 privacy 必须为 public`);
  }
  for (const marker of forbiddenMarkers) {
    if (content.includes(marker)) failures.push(`${relativeFile}: 发现敏感标记 ${marker}`);
  }
}

const sourceFiles = [
  ...walk(path.join(repositoryDir, "source")),
  ...walk(path.join(repositoryDir, "_data")),
].filter((file) => /\.(?:md|yml|yaml|json|txt)$/i.test(file));
for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8");
  for (const marker of forbiddenMarkers) {
    if (content.includes(marker)) failures.push(`${path.relative(repositoryDir, file)}: 发现敏感标记 ${marker}`);
  }
}

const indexPath = path.join(publicDir, "lab-index.json");
if (!existsSync(indexPath)) {
  failures.push("public/lab-index.json: 构建索引不存在");
} else {
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    if (!Array.isArray(index.entries) || index.entries.length !== detailFiles.length) {
      failures.push("public/lab-index.json: 条目数量与 Lab 详情页不一致");
    }
  } catch (error) {
    failures.push(`public/lab-index.json: JSON 无法解析 (${error.message})`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Lab check passed: ${detailFiles.length} detail entries, privacy and metadata fields valid.`);
}
