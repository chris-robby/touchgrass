// Copies the pipeline output into public/ so Vite serves it in dev and includes it
// in the build. Run automatically by `npm run dev/build`.
//
// Each city's pages fetch "data/events.json" relative to themselves, so
// Montréal's data goes to public/data/ and Ottawa's to public/ottawa/data/.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const data = resolve(here, "../../data");
const pub = resolve(here, "../public");

const CITIES = [
  { from: data, to: resolve(pub, "data"), label: "data" },
  { from: resolve(data, "ottawa"), to: resolve(pub, "ottawa/data"), label: "data/ottawa" },
];

for (const city of CITIES) {
  mkdirSync(city.to, { recursive: true });
  for (const name of ["events.json", "meta.json"]) {
    if (!existsSync(resolve(city.from, name))) {
      console.error(`Missing ${city.label}/${name}. Run: python scripts/build_data.py`);
      process.exit(1);
    }
    copyFileSync(resolve(city.from, name), resolve(city.to, name));
  }
}
console.log("Copied events.json and meta.json for each city into site/public/");
