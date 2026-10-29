// Service worker: makes the boards installable and usable offline. App files
// are served from cache and refreshed in the background; bump VERSION after a
// large change.
const VERSION = "qa-tiers-v1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "icon.svg", "css/app.css",
  "js/app.js", "js/engine.js", "js/schema.js", "js/store.js", "js/demo-data.js", "js/ui.js", "js/charts.js",
  "js/registers.js", "js/views-t1.js", "js/views-t2.js", "js/setup.js", "js/learn.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== "qa-tiers-fonts").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!fonts && url.origin !== self.location.origin) return;
  const cacheName = fonts ? "qa-tiers-fonts" : VERSION;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => { caches.open(VERSION).then((c) => c.put("index.html", res.clone())); return res; }).catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.open(cacheName).then(async (cache) => {
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
