/* S.S. Engineers Invoice Generator — Service Worker
 *
 * Caching strategy summary:
 *   • App shell (HTML, CSS, JS, manifest, icons, local vendor libs) — stale-while-revalidate
 *   • Navigation — network-first, fallback to cached index.html, then offline.html
 *   • /api/* — network-first with cache fallback
 *   • Images, fonts, runtime assets — stale-while-revalidate in runtime cache
 *
 * html2pdf.js:
 *   The app loads vendor/html2pdf.bundle.min.js locally (recommended for offline).
 *   CDN copy is also precached when online during install as a backup:
 *   https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js
 *   CDN scripts fail offline unless explicitly cached — local vendor copy is required
 *   for reliable PDF export without network.
 */

"use strict";

var CACHE_VERSION = "v2.0.0";
var STATIC_CACHE = "invoice-static-" + CACHE_VERSION;
var RUNTIME_CACHE = "invoice-runtime-" + CACHE_VERSION;

var OFFLINE_URL = "offline.html";
var INDEX_URL = "index.html";

var HTML2PDF_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";

/* Precached during install (relative to service worker scope) */
var PRECACHE_ASSETS = [
  "./",
  "./" + INDEX_URL,
  "./styles.css",
  "./script.js",
  "./manifest.json",
  "./" + OFFLINE_URL,
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./vendor/html2pdf.bundle.min.js"
];

var STATIC_PATH_HINTS = [
  "/styles.css",
  "/script.js",
  "/manifest.json",
  "/offline.html",
  "/index.html",
  "/icons/",
  "/vendor/"
];

var SWR_PATH_EXTENSIONS = [
  ".css",
  ".js",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot"
];

function isNavigationRequest(request) {
  if (request.mode === "navigate") {
    return true;
  }

  var accept = request.headers.get("accept");
  return (
    request.method === "GET" &&
    accept &&
    accept.indexOf("text/html") !== -1
  );
}

function isApiRequest(pathname) {
  return pathname.indexOf("/api/") === 0;
}

function isStaticPath(pathname) {
  for (var i = 0; i < STATIC_PATH_HINTS.length; i++) {
    if (pathname.indexOf(STATIC_PATH_HINTS[i]) !== -1) {
      return true;
    }
  }
  return pathname === "/" || pathname.endsWith("/");
}

function hasSwRExtension(pathname) {
  var lower = pathname.toLowerCase();
  for (var j = 0; j < SWR_PATH_EXTENSIONS.length; j++) {
    if (lower.endsWith(SWR_PATH_EXTENSIONS[j])) {
      return true;
    }
  }
  return false;
}

function isRuntimeAsset(request, pathname) {
  var dest = request.destination;
  return (
    dest === "style" ||
    dest === "script" ||
    dest === "image" ||
    dest === "font" ||
    hasSwRExtension(pathname)
  );
}

function cachePut(cacheName, request, response) {
  if (!response || response.status !== 200 || request.method !== "GET") {
    return Promise.resolve();
  }

  return caches.open(cacheName).then(function (cache) {
    return cache.put(request, response);
  });
}

function precacheAsset(cache, url) {
  return fetch(url, { cache: "reload" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return cache.put(url, response);
    })
    .catch(function (err) {
      console.warn("[SW] Precache skipped:", url, err);
    });
}

function matchCachedIndex() {
  return caches.match("./" + INDEX_URL).then(function (hit) {
    if (hit) {
      return hit;
    }
    return caches.match(INDEX_URL);
  });
}

function matchCachedOffline() {
  return caches.match("./" + OFFLINE_URL).then(function (hit) {
    if (hit) {
      return hit;
    }
    return caches.match(OFFLINE_URL);
  });
}

/* Stale-while-revalidate: return cache immediately, refresh in background */
function staleWhileRevalidate(request, cacheName) {
  return caches.match(request).then(function (cached) {
    var networkFetch = fetch(request)
      .then(function (response) {
        if (response && response.status === 200) {
          cachePut(cacheName, request, response.clone());
        }
        return response;
      })
      .catch(function () {
        return null;
      });

    if (cached) {
      networkFetch.catch(function () {});
      return cached;
    }

    return networkFetch.then(function (networkResponse) {
      if (networkResponse) {
        return networkResponse;
      }
      return caches.match(request);
    });
  });
}

/* Cache-first: offline shell assets */
function cacheFirst(request, cacheName) {
  return caches.match(request).then(function (cached) {
    if (cached) {
      staleWhileRevalidate(request, cacheName).catch(function () {});
      return cached;
    }

    return fetch(request)
      .then(function (response) {
        cachePut(cacheName, request, response.clone());
        return response;
      })
      .catch(function () {
        return caches.match(request);
      });
  });
}

/* Network-first: API and default GET */
function networkFirst(request, cacheName) {
  return fetch(request)
    .then(function (response) {
      cachePut(cacheName, request, response.clone());
      return response;
    })
    .catch(function () {
      return caches.match(request);
    });
}

function handleNavigation(request) {
  return fetch(request)
    .then(function (response) {
      if (response && response.status === 200) {
        cachePut(RUNTIME_CACHE, request, response.clone());
        cachePut(RUNTIME_CACHE, "./" + INDEX_URL, response.clone());
      }
      return response;
    })
    .catch(function () {
      return caches.match(request).then(function (cachedNav) {
        if (cachedNav) {
          return cachedNav;
        }

        return matchCachedIndex().then(function (indexCached) {
          if (indexCached) {
            return indexCached;
          }

          return matchCachedOffline().then(function (offlineCached) {
            if (offlineCached) {
              return offlineCached;
            }

            return new Response("You are offline.", {
              status: 503,
              statusText: "Offline",
              headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
          });
        });
      });
    });
}

/* ---- Lifecycle ---- */

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      var jobs = PRECACHE_ASSETS.map(function (asset) {
        return precacheAsset(cache, asset);
      });

      /* Optional: cache CDN html2pdf when online (solution a) */
      jobs.push(precacheAsset(cache, HTML2PDF_CDN));

      return Promise.all(jobs);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* ---- Fetch ---- */

self.addEventListener("fetch", function (event) {
  var request = event.request;

  if (request.method !== "GET") {
    return;
  }

  var url = new URL(request.url);

  /* Cross-origin CDN html2pdf (solution a) */
  if (url.href === HTML2PDF_CDN) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isApiRequest(url.pathname)) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  if (isStaticPath(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (isRuntimeAsset(request, url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, RUNTIME_CACHE));
});
