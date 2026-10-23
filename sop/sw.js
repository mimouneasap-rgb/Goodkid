// Service worker: makes the SOP Library installable and usable offline.
// App files are served from cache and refreshed in the background; bump
// VERSION to drop old caches after a large change. The library itself lives
// in IndexedDB, so data/ is never cached here.
const VERSION = "sop-v2";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/sop.css",
  "js/main.js",
  "js/model.js",
  "js/store.js",
  "js/edits.js",
  "js/demo-data.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
];
const FONT_CACHE = "sop-fonts";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sop-") && k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(caches.open(FONT_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((res) => {
        if (res.ok || res.type === "opaque") cache.put(request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    }));
    return;
  }

  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (url.pathname.startsWith(`${scope.pathname}data/`)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((cache) => cache.put("index.html", copy));
      return res;
    }).catch(() => caches.match("index.html")));
    return;
  }

  event.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(request);
    const network = fetch(request).then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  }));
});
