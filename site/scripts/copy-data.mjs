// Copies the pipeline output (../data/*.json) into public/data/ so Vite serves
// it in dev and includes it in the build. Run automatically by `npm run dev/build`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../data");
const dest = resolve(here, "../public/data");

mkdirSync(dest, { recursive: true });
for (const name of ["events.json", "meta.json"]) {
  if (!existsSync(resolve(src, name))) {
    console.error(`Missing data/${name}. Run: python scripts/build_data.py`);
    process.exit(1);
  }
  copyFileSync(resolve(src, name), resolve(dest, name));
}
console.log("Copied events.json and meta.json into site/public/data/");
