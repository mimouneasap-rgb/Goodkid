// Service worker: makes the tracker installable and usable offline.
// Bump VERSION after changing app files so clients pick up the new shell.
const VERSION = "apqr-v3";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/apqr.css",
  "js/app.js", "js/actions.js", "js/team.js", "js/charts.js", "js/demo.js", "js/drawer.js", "js/engine.js",
  "js/exporter.js", "js/importers.js", "js/store.js", "js/ui.js", "js/views-overview.js",
  "js/views-registers.js", "js/xlsx.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png",
];
const FONTS = "apqr-fonts";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("apqr-") && k !== VERSION && k !== FONTS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Network first so updates show up straight away; cache as offline fallback.
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
