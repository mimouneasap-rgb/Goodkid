// Service worker: makes the app installable and usable offline.
// App files are served from cache and refreshed in the background; bump
// VERSION to drop old caches after a large change.
const VERSION = "qrm-v1";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "js/app.js",
  "js/risk.js",
  "js/charts.js",
  "js/sample-data.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
];
const FONT_CACHE = "qrm-fonts";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("qrm-") && k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Google Fonts: serve from cache, refresh in the background.
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

  if (url.origin !== self.location.origin) return;
  // The SOP Library in sop/ has its own service worker and private data.
  if (url.pathname.startsWith(new URL("sop/", self.registration.scope).pathname)) return;

  // Page navigations: network first so updates arrive, cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((cache) => cache.put("index.html", copy));
      return res;
    }).catch(() => caches.match("index.html")));
    return;
  }

  // Everything else from this site: serve from cache, refresh in the background,
  // so the next launch picks up any update.
  event.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(request);
    const network = fetch(request).then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  }));
});
