// Service worker: makes the APQR Command Center installable and usable offline.
// App files are served from cache and refreshed in the background; bump VERSION
// to drop old caches after a large change.
const VERSION = "apqr-v2";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/apqr.css",
  "js/app.js",
  "js/store.js",
  "js/sync.js",
  "js/model.js",
  "js/stats.js",
  "js/sop.js",
  "js/dom.js",
  "js/ui.js",
  "js/charts.js",
  "js/io.js",
  "js/xlsx.js",
  "js/seed-data.js",
  "js/views/overview.js",
  "js/views/plan.js",
  "js/views/workflows.js",
  "js/views/tasks.js",
  "js/views/people.js",
  "js/views/product.js",
  "js/views/statistics.js",
  "js/views/sop.js",
  "js/views/data.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
];
const RUNTIME = "apqr-runtime"; // Google Fonts

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function staleWhileRevalidate(cacheName, request, okOpaque = false) {
  return caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request);
    const network = fetch(request).then((res) => {
      if (res.ok || (okOpaque && res.type === "opaque")) cache.put(request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(RUNTIME, request, true));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Page navigations: network first so updates arrive, cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((cache) => cache.put("index.html", copy));
      return res;
    }).catch(() => caches.match("index.html")));
    return;
  }

  event.respondWith(staleWhileRevalidate(VERSION, request));
});
