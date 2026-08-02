import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repositoryDir = path.resolve(".");
const sourceDir = path.join(repositoryDir, "source");
const publicDir = path.join(repositoryDir, "public");
const labRoots = ["experiments", "debug", "failures", "source-reading"];

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return {};
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, "")])
  );
}

const entries = labRoots.flatMap((root) =>
  walk(path.join(sourceDir, root))
    .filter((file) =>
      file.endsWith(".md") &&
      path.basename(file) === "index.md" &&
      path.dirname(file) !== path.join(sourceDir, root)
    )
    .map((file) => {
      const relativeSource = path.relative(sourceDir, file).split(path.sep).join("/");
      const fields = parseFrontMatter(readFileSync(file, "utf8"));
      const route = relativeSource.replace(/\/index\.md$/, "");
      return {
        id: fields.experiment_id || fields.debug_id || fields.failure_id || route,
        type: fields.content_type || root,
        title: fields.title || route,
        status: fields.status || "unspecified",
        evidence: fields.evidence || "unspecified",
        privacy: fields.privacy || "unspecified",
        url: `https://onium.top/${route}/`
      };
    })
);

entries.sort((left, right) => left.id.localeCompare(right.id));
mkdirSync(publicDir, { recursive: true });
writeFileSync(
  path.join(publicDir, "lab-index.json"),
  `${JSON.stringify({ schemaVersion: 1, count: entries.length, entries }, null, 2)}\n`
);
console.log(`Lab index generated: ${entries.length} entries.`);
