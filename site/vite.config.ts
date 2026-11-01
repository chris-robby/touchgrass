import { defineConfig } from "vite";
import { resolve } from "node:path";

// Static pages: Montréal's at the root, Ottawa's in ottawa/, and a shared about
// page. base "./" makes every link relative, so the built site
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
        // Each city other than Montréal has its own pages in its own folder.
        "ottawa/index": resolve(import.meta.dirname, "ottawa/index.html"),
        "ottawa/calendar": resolve(import.meta.dirname, "ottawa/calendar.html"),
        "ottawa/map": resolve(import.meta.dirname, "ottawa/map.html"),
      },
    },
  },
});
