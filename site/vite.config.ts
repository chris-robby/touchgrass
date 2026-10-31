import { defineConfig } from "vite";
import { resolve } from "node:path";

// Four static pages. base "./" makes every link relative, so the built site
// works from any folder (e.g. GitHub Pages' /<repo>/ sub-path).
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        calendar: resolve(import.meta.dirname, "calendar.html"),
        map: resolve(import.meta.dirname, "map.html"),
        about: resolve(import.meta.dirname, "about.html"),
      },
    },
  },
});
