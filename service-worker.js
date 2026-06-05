/* PWA Service Worker - Invoice Generator */

var CACHE_VERSION = "v1.1.0";
var STATIC_CACHE = "static-" + CACHE_VERSION;
var RUNTIME_CACHE = "runtime-" + CACHE_VERSION;

var OFFLINE_URL = "offline.html";

var STATIC_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "script.js",
  "manifest.json",
  OFFLINE_URL,
  "icons/icon-192.png",
  "icons/icon-512.png",
  "vendor/html2pdf.bundle.min.js"
];

var STATIC_URL_PARTS = [
  "/styles.css",
  "/script.js",
  "/manifest.json",
  "/offline.html",
  "/icons/",
  "/vendor/"
];

function isStaticAssetUrl(pathname) {
  for (var i = 0; i < STATIC_URL_PARTS.length; i++) {
    if (pathname.indexOf(STATIC_URL_PARTS[i]) !== -1) {
      return true;
    }
  }
  return pathname.endsWith("/index.html");
}

function isNavigationRequest(request) {
  return request.mode === "navigate" ||
    (request.method === "GET" &&
      request.headers.get("accept") &&
      request.headers.get("accept").indexOf("text/html") !== -1);
}

function cachePut(cacheName, request, response) {
  if (request.method !== "GET" || !response || response.status !== 200) {
    return;
  }
  caches.open(cacheName).then(function (cache) {
    cache.put(request, response);
  });
}

function respondCacheFirstWithUpdate(event, cacheName) {
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var networkPromise = fetch(event.request)
        .then(function (response) {
          cachePut(cacheName, event.request, response.clone());
          return response;
        })
        .catch(function () {
          return cached;
        });

      return cached || networkPromise;
    })
  );
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function (cache) {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(function () {
        if (!self.registration.active) {
          return self.skipWaiting();
        }
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

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", function (event) {
  var request = event.request;

  if (request.method !== "GET") {
    return;
  }

  var url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          cachePut(RUNTIME_CACHE, request, response.clone());
          return response;
        })
        .catch(function () {
          return caches.match(request)
            .then(function (cached) {
              if (cached) {
                return cached;
              }
              return caches.match("index.html")
                .then(function (indexCached) {
                  return indexCached || caches.match(OFFLINE_URL);
                });
            });
        })
    );
    return;
  }

  if (isStaticAssetUrl(url.pathname)) {
    respondCacheFirstWithUpdate(event, STATIC_CACHE);
    return;
  }

  event.respondWith(
    fetch(request)
      .then(function (response) {
        cachePut(RUNTIME_CACHE, request, response.clone());
        return response;
      })
      .catch(function () {
        return caches.match(request);
      })
  );
});
