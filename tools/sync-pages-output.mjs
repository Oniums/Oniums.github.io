import {
  cpSync,
  existsSync,
  readdirSync,
  rmSync
} from "node:fs";
import path from "node:path";

const repositoryDir = path.resolve(".");
const publicDir = path.join(repositoryDir, "public");
const generatedTargets = [
  "404.html",
  "about",
  "archives",
  "atom.xml",
  "categories",
  "css",
  "experience",
  "img",
  "index.html",
  "js",
  "local-search.xml",
  "open-source",
  "page",
  "posts",
  "projects",
  "sitemap.xml",
  "tags",
  "xml"
];

if (!existsSync(path.join(publicDir, "index.html"))) {
  throw new Error("public/index.html 不存在，请先运行 npm run check。");
}

for (const target of generatedTargets) {
  const destination = path.join(repositoryDir, target);
  if (existsSync(destination)) {
    rmSync(destination, { recursive: true, force: true });
  }
}

for (const entry of readdirSync(publicDir)) {
  cpSync(
    path.join(publicDir, entry),
    path.join(repositoryDir, entry),
    { recursive: true }
  );
}

console.log(
  `Pages output synchronized: ${readdirSync(publicDir).length} top-level entries.`
);
