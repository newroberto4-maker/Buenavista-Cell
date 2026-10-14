/* Buenavista Cell · service worker
   - Página y archivos propios: abre al instante desde el teléfono y se actualiza solo en segundo plano.
   - Fotos optimizadas (wsrv.nl): se guardan en el teléfono (máx. 160), así no se descargan dos veces.
   - Todo lo demás (Google Sheet, otros hosts) va directo a la red, como siempre.
   Para forzar que todos reciban una versión nueva: cambia VER (p. ej. "v2"). */
var VER = "v2";
var SHELL = "bvc-shell-" + VER;
var IMGS = "bvc-img-" + VER;
var PROXY_HOST = "wsrv.nl";
var MAX_IMGS = 160;
var BASE = new URL("./", self.registration.scope).pathname;
var INDEX = new URL("index.html", self.registration.scope).href;
var PRECACHE = ["index.html", "apple-touch-icon.png", "iphone16.webp"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      return Promise.all(PRECACHE.map(function (u) {
        return c.add(new Request(u, { cache: "reload" })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== SHELL && k !== IMGS; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Navegación a la página: sirve la copia guardada al instante y actualiza en segundo plano. */
function nav(e) {
  return caches.match(INDEX).then(function (hit) {
    if (hit) {
      e.waitUntil(
        fetch(INDEX, { cache: "no-cache" }).then(function (r) {
          if (r.ok) return caches.open(SHELL).then(function (c) { return c.put(INDEX, r); });
        }).catch(function () {})
      );
      return hit;
    }
    return fetch(e.request).then(function (r) {
      if (r.ok && !r.redirected) {
        var cp = r.clone();
        e.waitUntil(caches.open(SHELL).then(function (c) { return c.put(INDEX, cp); }));
      }
      return r;
    }).catch(function () {
      return caches.match(INDEX).then(function (h) { return h || Response.error(); });
    });
  });
}

/* Archivos propios (iconos, fotos locales): copia guardada primero, se refresca en segundo plano. */
function asset(e) {
  return caches.open(SHELL).then(function (c) {
    return c.match(e.request).then(function (hit) {
      var net = fetch(e.request).then(function (r) {
        if (r.ok) c.put(e.request, r.clone());
        return r;
      }).catch(function () { return null; });
      if (hit) { e.waitUntil(net); return hit; }
      return net.then(function (r) { return r || Response.error(); });
    });
  });
}

function trim(c) {
  return c.keys().then(function (ks) {
    var extra = ks.length - MAX_IMGS;
    return extra > 0 ? Promise.all(ks.slice(0, extra).map(function (k) { return c.delete(k); })) : 0;
  });
}

/* Fotos optimizadas: si ya están guardadas salen al instante; si no, se bajan y se guardan. */
function img(e) {
  var r = e.request;
  return caches.open(IMGS).then(function (c) {
    return c.match(r.url).then(function (hit) {
      if (hit) return hit;
      return fetch(r.url, { mode: "cors", credentials: "omit" }).then(function (res) {
        if (res.ok) e.waitUntil(c.put(r.url, res.clone()).then(function () { return trim(c); }));
        return res;
      }).catch(function () { return fetch(r); });
    });
  });
}

self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET") return;
  var u = new URL(r.url);
  if (r.mode === "navigate") {
    if (u.origin === location.origin && (u.pathname === BASE || u.pathname === BASE + "index.html")) e.respondWith(nav(e));
    return;
  }
  if (u.origin === location.origin) {
    if (/\/sw\.js$/.test(u.pathname)) return;
    e.respondWith(asset(e));
    return;
  }
  if (u.hostname === PROXY_HOST && r.destination === "image") e.respondWith(img(e));
});
