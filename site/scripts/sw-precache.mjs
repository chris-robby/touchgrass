// After `vite build`: writes the list of built files and a build id into dist/sw.js,
// so the service worker can save everything the site needs to work offline.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const assets = readdirSync(resolve(dist, "assets")).map((f) => `assets/${f}`).sort();
const icons = readdirSync(resolve(dist, "icons")).map((f) => `icons/${f}`).sort();
const files = [...assets, ...icons];
const swPath = resolve(dist, "sw.js");
const source = readFileSync(swPath, "utf8");
// Changes whenever a built file name or the worker's own code changes.
const version = createHash("sha1").update(files.join("\n") + source).digest("hex").slice(0, 10);

const sw = source
  .replace('const VERSION = "dev";', `const VERSION = "${version}";`)
  .replace("const BUILD_ASSETS = [];", `const BUILD_ASSETS = ${JSON.stringify(files)};`);
if (!sw.includes(version)) throw new Error("sw.js placeholders not found");
writeFileSync(swPath, sw);
console.log(`sw.js: version ${version}, ${files.length} files to precache`);
