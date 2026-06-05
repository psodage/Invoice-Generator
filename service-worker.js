/* S.S. Engineers Invoice Generator — Service Worker
 * Offline: always serves cached index.html + app assets from the install shell.
 */

"use strict";

var CACHE_VERSION = "v2.0.2";
var STATIC_CACHE = "invoice-static-" + CACHE_VERSION;
var RUNTIME_CACHE = "invoice-runtime-" + CACHE_VERSION;

var INDEX_FILE = "index.html";
var OFFLINE_FILE = "offline.html";

var SHELL_FILES = [
  INDEX_FILE,
  "styles.css",
  "script.js",
  "manifest.json",
  OFFLINE_FILE,
  "icons/icon-192.png",
  "icons/icon-512.png",
  "vendor/html2pdf.bundle.min.js"
];

function getScopeBase() {
  return new URL("./", self.location.href).href;
}

function resolveUrl(relativePath) {
  return new URL(relativePath, getScopeBase()).href;
}

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

function isShellAsset(pathname) {
  if (pathname === "/" || pathname.endsWith("/")) {
    return true;
  }

  for (var i = 0; i < SHELL_FILES.length; i++) {
    var name = SHELL_FILES[i];
    if (pathname === "/" + name || pathname.endsWith("/" + name)) {
      return true;
    }
  }

  return pathname.indexOf("/icons/") !== -1 || pathname.indexOf("/vendor/") !== -1;
}

function basenameFromUrl(urlString) {
  try {
    var path = new URL(urlString).pathname;
    var parts = path.split("/");
    return parts[parts.length - 1] || "";
  } catch (e) {
    return "";
  }
}

function putResponse(cache, requestOrUrl, response) {
  if (!response || response.status !== 200) {
    return Promise.resolve();
  }

  return cache.put(requestOrUrl, response);
}

function storeInCache(cacheName, url, response) {
  return caches.open(cacheName).then(function (cache) {
    return putResponse(cache, url, response.clone());
  });
}

function precacheShellFile(cache, relativePath) {
  var url = resolveUrl(relativePath);

  return fetch(url)
    .then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status + " for " + url);
      }

      var jobs = [putResponse(cache, url, response.clone())];

      if (relativePath === INDEX_FILE) {
        var scope = getScopeBase();
        jobs.push(putResponse(cache, scope, response.clone()));
        jobs.push(putResponse(cache, resolveUrl("./"), response.clone()));
        jobs.push(putResponse(cache, new Request(scope, { mode: "navigate" }), response.clone()));
      }

      return Promise.all(jobs);
    })
    .catch(function (err) {
      console.warn("[SW] Shell precache failed:", url, err);
    });
}

function openStaticCache() {
  return caches.open(STATIC_CACHE);
}

function openRuntimeCache() {
  return caches.open(RUNTIME_CACHE);
}

function matchExact(url) {
  return caches.match(url).then(function (hit) {
    if (hit) {
      return hit;
    }

    return openStaticCache().then(function (cache) {
      return cache.match(url);
    });
  });
}

function matchByBasename(urlString) {
  var base = basenameFromUrl(urlString);

  if (!base) {
    return Promise.resolve(null);
  }

  function searchCache(cacheName) {
    return caches.open(cacheName).then(function (cache) {
      return cache.keys().then(function (keys) {
        for (var i = 0; i < keys.length; i++) {
          if (basenameFromUrl(keys[i].url) === base) {
            return cache.match(keys[i]);
          }
        }
        return null;
      });
    });
  }

  return searchCache(STATIC_CACHE).then(function (hit) {
    if (hit) {
      return hit;
    }
    return searchCache(RUNTIME_CACHE);
  });
}

function matchAny(urlString) {
  return matchExact(urlString).then(function (hit) {
    if (hit) {
      return hit;
    }
    return matchByBasename(urlString);
  });
}

function findCachedIndex() {
  var candidates = [
    resolveUrl(INDEX_FILE),
    getScopeBase(),
    resolveUrl("./"),
    resolveUrl("./" + INDEX_FILE)
  ];

  var index = 0;

  function tryCandidate() {
    if (index >= candidates.length) {
      return openStaticCache().then(function (cache) {
        return cache.keys().then(function (keys) {
          for (var i = 0; i < keys.length; i++) {
            if (keys[i].url.indexOf(INDEX_FILE) !== -1) {
              return cache.match(keys[i]);
            }
          }
          return null;
        });
      });
    }

    var url = candidates[index];
    index += 1;

    return matchExact(url).then(function (hit) {
      if (hit) {
        return hit;
      }
      return tryCandidate();
    });
  }

  return tryCandidate();
}

function refreshInBackground(request, cacheName) {
  fetch(request)
    .then(function (response) {
      if (response && response.status === 200) {
        storeInCache(cacheName, request.url, response);
      }
    })
    .catch(function () {});
}

function cacheFirst(request, cacheName) {
  return matchAny(request.url).then(function (cached) {
    if (cached) {
      refreshInBackground(request, cacheName);
      return cached;
    }

    return fetch(request)
      .then(function (response) {
        if (response && response.status === 200) {
          return storeInCache(cacheName, request.url, response).then(function () {
            return response;
          });
        }
        return response;
      })
      .catch(function () {
        return matchAny(request.url);
      });
  });
}

function handleNavigation(request) {
  return findCachedIndex().then(function (cachedIndex) {
    return fetch(request)
      .then(function (response) {
        if (response && response.status === 200) {
          var jobs = [
            storeInCache(RUNTIME_CACHE, request.url, response),
            storeInCache(STATIC_CACHE, resolveUrl(INDEX_FILE), response),
            storeInCache(STATIC_CACHE, getScopeBase(), response)
          ];
          return Promise.all(jobs).then(function () {
            return response;
          });
        }
        return response;
      })
      .catch(function () {
        if (cachedIndex) {
          return cachedIndex;
        }

        return findCachedIndex().then(function (indexHit) {
          if (indexHit) {
            return indexHit;
          }

          return matchAny(resolveUrl(OFFLINE_FILE));
        });
      });
  });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    openStaticCache()
      .then(function (cache) {
        return Promise.all(SHELL_FILES.map(function (file) {
          return precacheShellFile(cache, file);
        }));
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
            if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
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

  if (event.data && event.data.type === "CACHE_SHELL") {
    event.waitUntil(
      openStaticCache().then(function (cache) {
        return Promise.all(SHELL_FILES.map(function (file) {
          return precacheShellFile(cache, file);
        }));
      })
    );
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
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isShellAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request, RUNTIME_CACHE));
});
