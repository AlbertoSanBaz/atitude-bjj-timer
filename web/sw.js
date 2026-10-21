/* Service worker de la PWA: precarga todo y sirve desde caché (offline-first).
   Al cambiar cualquier archivo de la app, sube CACHE_VERSION para que los dispositivos se actualicen. */
"use strict";

var CACHE_VERSION = "atitude-timer-v1.0.1";

var PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/fonts.css",
  "css/app.css",
  "css/tv.css",
  "js/platform.js",
  "js/audio.js",
  "js/engine.js",
  "js/spatial-nav.js",
  "js/app.js",
  "img/logo.webp",
  "img/hero.webp",
  "img/icons/favicon-32.png",
  "img/icons/apple-touch-icon.png",
  "img/icons/icon-192.png",
  "img/icons/icon-512.png",
  "img/icons/icon-maskable-192.png",
  "img/icons/icon-maskable-512.png",
  "fonts/barlow-condensed-latin-600-normal.woff2",
  "fonts/barlow-condensed-latin-700-normal.woff2",
  "fonts/barlow-condensed-latin-800-normal.woff2",
  "fonts/barlow-condensed-latin-800-italic.woff2",
  "fonts/barlow-latin-400-normal.woff2",
  "fonts/barlow-latin-500-normal.woff2",
  "fonts/barlow-latin-600-normal.woff2"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // cache: "reload" evita guardar copias antiguas de la caché HTTP
      return cache.addAll(PRECACHE.map(function (url) { return new Request(url, { cache: "reload" }); }));
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION && k.indexOf("atitude-timer-") === 0) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// la página pide activar la versión nueva cuando el usuario pulsa "Actualizar"
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // enlaces externos: red normal

  // navegación: siempre la página principal cacheada (ignora ?tv=1 y similares)
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("index.html").then(function (hit) {
        return hit || fetch(req);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
