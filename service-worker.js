/* S.S. Engineers Invoice Generator — Service Worker */

"use strict";

var CACHE_VERSION = "v2.1.0";
var STATIC_CACHE = "invoice-static-" + CACHE_VERSION;

var INDEX_FILE = "index.html";

var SHELL_FILES = [
  INDEX_FILE,
  "styles.css",
  "script.js",
  "manifest.json",
  "offline.html",
  "service-worker.js",
  "web/favicon.ico",
  "web/apple-touch-icon.png",
  "web/icon-192.png",
  "web/icon-512.png",
  "web/icon-192-maskable.png",
  "web/icon-512-maskable.png",
  "vendor/html2pdf.bundle.min.js"
];

function getScopeUrl() {
  if (self.registration && self.registration.scope) {
    return self.registration.scope;
  }
  return new URL("./", self.location.href).href;
}

function assetUrl(relativePath) {
  return new URL(relativePath, getScopeUrl()).href;
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

function isShellPath(pathname) {
  if (pathname === "/" || pathname.endsWith("/")) {
    return true;
  }

  for (var i = 0; i < SHELL_FILES.length; i++) {
    var file = SHELL_FILES[i];
    if (pathname.endsWith("/" + file) || pathname === "/" + file) {
      return true;
    }
  }

  return pathname.indexOf("/web/") !== -1 || pathname.indexOf("/vendor/") !== -1;
}

function putClone(cache, key, response) {
  if (!response || response.status !== 200) {
    return Promise.resolve();
  }
  return cache.put(key, response.clone());
}

function cacheIndexEverywhere(cache, response) {
  var scope = getScopeUrl();
  var indexUrl = assetUrl(INDEX_FILE);

  return Promise.all([
    putClone(cache, indexUrl, response),
    putClone(cache, scope, response),
    putClone(cache, new URL("./", scope).href, response),
    putClone(cache, new Request(scope, { mode: "navigate" }), response)
  ]);
}

function precacheOne(cache, relativePath) {
  var url = assetUrl(relativePath);

  return fetch(url)
    .then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      return putClone(cache, url, response).then(function () {
        if (relativePath === INDEX_FILE) {
          return cacheIndexEverywhere(cache, response);
        }
      });
    })
    .catch(function (err) {
      console.warn("[SW] Precache failed:", url, err);
    });
}

function findCachedIndex() {
  return caches.open(STATIC_CACHE).then(function (cache) {
    var scope = getScopeUrl();
    var keys = [
      assetUrl(INDEX_FILE),
      scope,
      new URL("./", scope).href
    ];

    var i = 0;

    function tryKey() {
      if (i >= keys.length) {
        return cache.keys().then(function (requests) {
          for (var j = 0; j < requests.length; j++) {
            if (requests[j].url.indexOf(INDEX_FILE) !== -1) {
              return cache.match(requests[j]);
            }
          }
          return null;
        });
      }

      return cache.match(keys[i]).then(function (hit) {
        i += 1;
        if (hit) {
          return hit;
        }
        return tryKey();
      });
    }

    return tryKey();
  });
}

function matchShellAsset(request) {
  var url = request.url;

  return caches.open(STATIC_CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) {
        return hit;
      }
      return cache.match(url);
    }).then(function (hit) {
      if (hit) {
        return hit;
      }

      var name = url.split("/").pop();
      return cache.keys().then(function (keys) {
        for (var i = 0; i < keys.length; i++) {
          if (keys[i].url.split("/").pop() === name) {
            return cache.match(keys[i]);
          }
        }
        return null;
      });
    });
  });
}

function handleNavigation(request) {
  return findCachedIndex().then(function (cachedIndex) {
    if (cachedIndex) {
      fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            return caches.open(STATIC_CACHE).then(function (cache) {
              return cacheIndexEverywhere(cache, response);
            });
          }
        })
        .catch(function () {});

      return cachedIndex;
    }

    return fetch(request)
      .then(function (response) {
        if (response && response.ok) {
          return caches.open(STATIC_CACHE).then(function (cache) {
            return cacheIndexEverywhere(cache, response).then(function () {
              return response;
            });
          });
        }
        return response;
      })
      .catch(function () {
        return findCachedIndex();
      });
  });
}

function handleShellAsset(request) {
  return matchShellAsset(request).then(function (cached) {
    if (cached) {
      fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            return caches.open(STATIC_CACHE).then(function (cache) {
              return putClone(cache, request.url, response);
            });
          }
        })
        .catch(function () {});
      return cached;
    }

    return fetch(request)
      .then(function (response) {
        if (response && response.ok) {
          return caches.open(STATIC_CACHE).then(function (cache) {
            return putClone(cache, request.url, response).then(function () {
              return response;
            });
          });
        }
        return response;
      })
      .catch(function () {
        return matchShellAsset(request);
      });
  });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function (cache) {
        return Promise.all(SHELL_FILES.map(function (file) {
          return precacheOne(cache, file);
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
      .then(function (names) {
        return Promise.all(
          names.map(function (name) {
            if (name.indexOf("invoice-static-") === 0 && name !== STATIC_CACHE) {
              return caches.delete(name);
            }
            if (name.indexOf("invoice-runtime-") === 0) {
              return caches.delete(name);
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
  if (!event.data) {
    return;
  }

  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data.type === "CACHE_SHELL") {
    event.waitUntil(
      caches.open(STATIC_CACHE).then(function (cache) {
        return Promise.all(SHELL_FILES.map(function (file) {
          return precacheOne(cache, file);
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

  if (isShellPath(url.pathname)) {
    event.respondWith(handleShellAsset(request));
    return;
  }

  event.respondWith(handleShellAsset(request));
});
