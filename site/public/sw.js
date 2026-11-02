// touchgrass service worker: makes the site installable and usable offline.
//
// - Pages and data/*.json: network first (listings change daily), falling back
//   to the last saved copy when offline.
// - Built assets (assets/*, hashed file names) and icons: cache first; they never change.
// - Google Fonts: served from cache, refreshed in the background.
// - Map tiles are not saved (too many); offline, the map area stays blank.
//
// VERSION and BUILD_ASSETS are filled in after each build by scripts/sw-precache.mjs:
// a new deploy changes this file, so phones pick up the new version and old caches
// are deleted.
const VERSION = "dev";
const BUILD_ASSETS = [];
const PAGES = `tg-pages-${VERSION}`;
const ASSETS = `tg-assets-${VERSION}`;
const FONTS = `tg-fonts-${VERSION}`;

// Servers may send "Vary: Origin". Module scripts are requested with an Origin
// header and precached copies without one, so lookups must ignore Vary or the
// saved scripts never match (blank page offline).
const MATCH = { ignoreVary: true };

const SHELL = [
  "./", "index.html", "calendar.html", "map.html", "swipe.html", "about.html",
  "manifest.webmanifest", "favicon.svg", "icons/icon-192.png",
  "data/events.json", "data/meta.json",
  "ottawa/", "ottawa/index.html", "ottawa/calendar.html", "ottawa/map.html", "ottawa/swipe.html",
  "ottawa/data/events.json", "ottawa/data/meta.json",
];

self.addEventListener("install", (event) => {
  // Save the scripts and styles too: on a first visit the page loaded them before
  // this worker existed, so without this the site would be blank offline.
  event.waitUntil(Promise.all([
    caches.open(PAGES).then((c) => c.addAll(SHELL)),
    caches.open(ASSETS).then((c) => c.addAll(BUILD_ASSETS)),
  ]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const keep = new Set([PAGES, ASSETS, FONTS]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tg-") && !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // Offline: same page ignoring ?filters, or the home page as a last resort.
    const hit = await cache.match(request, { ...MATCH, ignoreSearch: true });
    if (hit) return hit;
    const home = request.mode === "navigate" ? await cache.match("index.html", MATCH) : undefined;
    return home ?? Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, MATCH);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, MATCH);
  const refresh = fetch(request).then((response) => {
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
  }).catch(() => hit);
  return hit ?? refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.includes("/assets/") || url.pathname.includes("/icons/")) {
      event.respondWith(cacheFirst(request, ASSETS));
    } else if (request.mode === "navigate" || url.pathname.endsWith(".json") || url.pathname.endsWith(".html")) {
      event.respondWith(networkFirst(request));
    }
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONTS));
  }
});
