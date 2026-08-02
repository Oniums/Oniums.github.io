import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const publicDir = path.resolve("public");

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

let cleaned = 0;
for (const file of walk(publicDir).filter((candidate) => candidate.endsWith(".html"))) {
  const content = readFileSync(file, "utf8");
  const cleanedContent = content.replace(
    /<script type="application\/ld\+json">\s*<\/script>/g,
    ""
  );
  if (cleanedContent !== content) {
    writeFileSync(file, cleanedContent);
    cleaned += 1;
  }
}

console.log(`Empty structured-data blocks removed: ${cleaned} pages.`);
