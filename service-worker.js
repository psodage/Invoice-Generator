/* PWA Service Worker - Invoice Generator */

var CACHE_VERSION = "v1.0.0";
var STATIC_CACHE = "static-" + CACHE_VERSION;
var RUNTIME_CACHE = "runtime-" + CACHE_VERSION;

var OFFLINE_URL = "offline.html";

// Keep these paths relative (no localhost-only URLs)
var STATIC_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "script.js",
  "manifest.json",
  OFFLINE_URL,
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function (cache) {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            var isCurrent = (key === STATIC_CACHE || key === RUNTIME_CACHE);
            if (!isCurrent) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function isNavigationRequest(request) {
  return request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept") && request.headers.get("accept").indexOf("text/html") !== -1);
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation: network-first with offline fallback
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(RUNTIME_CACHE).then(function (cache) {
            cache.put(request, copy);
          });
          return response;
        })
        .catch(function () {
          return caches.match(request)
            .then(function (cached) {
              return cached || caches.match(OFFLINE_URL);
            });
        })
    );
    return;
  }

  // Static assets: cache-first then network
  event.respondWith(
    caches.match(request)
      .then(function (cachedResponse) {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then(function (response) {
            // Cache successful GET responses
            if (request.method === "GET" && response && response.status === 200) {
              var copy = response.clone();
              caches.open(RUNTIME_CACHE).then(function (cache) {
                cache.put(request, copy);
              });
            }
            return response;
          })
          .catch(function () {
            // For non-HTML requests, just fail normally if offline
            return cachedResponse;
          });
      })
  );
});

