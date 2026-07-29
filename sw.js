// Service worker do GymEats.
// Estratégia: o "casco" do app (HTML/CSS/JS) fica em cache pra abrir offline
// e instantaneamente; os dados vêm do Firestore, que tem o próprio cache
// em IndexedDB. Nunca cacheamos chamadas de rede do Firebase.

const VERSION = "v6";
const SHELL = `gymeats-shell-${VERSION}`;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/css/app.css",
  "./src/js/app.js",
  "./src/js/router.js",
  "./src/js/store.js",
  "./src/js/firebase.js",
  "./src/js/config.js",
  "./src/js/ui.js",
  "./src/js/icons.js",
  "./src/js/image.js",
  "./src/js/food.js",
  "./src/js/views/home.js",
  "./src/js/views/feed.js",
  "./src/js/views/post.js",
  "./src/js/views/rankings.js",
  "./src/js/views/chat.js",
  "./src/js/views/profile.js",
  "./src/js/views/guide.js",
  "./src/js/views/recap.js",
  "./src/js/views/place-picker.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/vendor/leaflet.js",
  "./assets/vendor/leaflet.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// A página pede pra versão nova assumir sem esperar todas as abas fecharem.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Firebase e Google: sempre direto da rede, nunca cacheado por nós.
  if (/(firebase|googleapis|google|gstatic)\.com$/.test(url.hostname) &&
      !url.hostname.startsWith("fonts.")) {
    return;
  }

  // Navegação: rede primeiro, cai pro index em cache quando offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html").then((r) => r || Response.error()))
    );
    return;
  }

  // Fontes do Google: cache primeiro, elas nunca mudam.
  if (url.hostname.startsWith("fonts.")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }

  // Nossos arquivos: rede primeiro, cache como reserva. Assim um deploy novo
  // chega na hora, em vez de ficar preso numa versão antiga em cache.
  if (url.origin === location.origin) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match(request).then((c) => c || Response.error()))
    );
  }
});
