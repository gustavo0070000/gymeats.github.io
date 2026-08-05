// Service worker do GymEats.
// Estratégia: o "casco" do app (HTML/CSS/JS) fica em cache pra abrir offline
// e instantaneamente; os dados vêm do Firestore, que tem o próprio cache
// em IndexedDB. Nunca cacheamos chamadas de rede do Firebase.

const VERSION = "v24";
const SHELL = `gymeats-shell-${VERSION}`;

// O GitHub Pages serve com "cache-control: max-age=600". Um fetch normal
// respeita esse cache do navegador, então dava pra receber um módulo velho
// mesmo buscando "da rede" — e o app acabava rodando metade novo, metade
// antigo. Com "no-cache" o navegador é obrigado a revalidar com o servidor
// (usa ETag, então continua barato) e nunca serve versão vencida.
const fresh = (url) => new Request(url, { cache: "no-cache" });

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
  "./src/js/push.js",
  "./src/js/views/home.js",
  "./src/js/views/feed.js",
  "./src/js/views/post.js",
  "./src/js/views/rankings.js",
  "./src/js/views/chat.js",
  "./src/js/views/profile.js",
  "./src/js/views/guide.js",
  "./src/js/views/recap.js",
  "./src/js/views/dates.js",
  "./src/js/views/notifications.js",
  "./src/js/views/sent.js",
  "./src/js/views/plates.js",
  "./src/js/views/place-picker.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/vendor/leaflet.js",
  "./assets/vendor/leaflet.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES.map(fresh)))
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

/* ============================================================
   Notificações

   As Cloud Functions mandam só o campo `data`, então quem monta a
   notificação é este handler. Se a mensagem viesse com `notification`,
   o navegador montaria sozinho e a gente perderia o controle do texto,
   do ícone e do link.
   ============================================================ */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const bruto = event.data?.json() || {};
    payload = bruto.data || bruto;
  } catch {
    payload = { title: "GymEats", body: event.data?.text() || "" };
  }

  const titulo = payload.title || "GymEats";
  const opcoes = {
    body: payload.body || "",
    icon: payload.icon || "./assets/icons/icon-192.png",
    badge: "./assets/icons/icon-192.png",
    image: payload.image || undefined,   // a foto do prato
    tag: payload.tag || undefined,       // agrupa avisos do mesmo prato
    renotify: !!payload.tag,
    data: { url: payload.url || "./" },
    vibrate: [90, 40, 90],
  };

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

// O app não mora na raiz do domínio — fica em /gymeats.github.io/, e a raiz
// serve outro site. Um link "/#/c/..." resolvido contra location.href perde o
// prefixo e cai lá fora; contra o scope do service worker, não. A barra da
// frente é tirada de propósito: com ela, `new URL` volta pra raiz mesmo tendo
// base. Vale também pras notificações antigas, que já saíram com "/#/...".
const dentroDoApp = (url) => {
  const destino = new URL(String(url || "./").replace(/^\/+/, ""), self.registration.scope).href;
  // Nada de link levar pra fora do app, mesmo que o payload venha torto.
  return destino.startsWith(self.registration.scope) ? destino : self.registration.scope;
};

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = dentroDoApp(event.notification.data?.url);

  event.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Se o app já está aberto, leva a aba existente pro lugar certo.
    for (const aba of abas) {
      if (aba.url.startsWith(self.registration.scope)) {
        await aba.focus();
        if ("navigate" in aba) await aba.navigate(destino).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
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
      fetch(fresh(request.url))
        .catch(() => caches.match("./index.html").then((r) => r || Response.error()))
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
      fetch(fresh(request.url)).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match(request).then((c) => c || Response.error()))
    );
  }
});
