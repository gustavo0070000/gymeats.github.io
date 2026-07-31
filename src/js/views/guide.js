import { h, esc, avatar, topbar, backBtn, tabbar, spinner, relative, toast } from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { plateLink } from "./plates.js";
import { navigate } from "../router.js";
import { formatRating } from "../food.js";

/* O mapa usa Leaflet (uma cópia vive em assets/vendor, então não dependemos
   de CDN de terceiros e o service worker consegue cachear) com tiles do
   OpenStreetMap. Os dois são gratuitos e não pedem chave de API.
   O script só carrega quando alguém abre a aba do mapa. */
const LEAFLET_CSS = "./assets/vendor/leaflet.css";
const LEAFLET_JS = "./assets/vendor/leaflet.js";

let leafletPromise = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    const fail = (reason) => { leafletPromise = null; reject(new Error(reason)); };
    // sem timeout, uma conexão pendurada deixaria o spinner girando pra sempre
    const timer = setTimeout(() => fail("demorou demais"), 10000);

    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => { clearTimeout(timer); resolve(window.L); };
    script.onerror = () => { clearTimeout(timer); fail("não carregou"); };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

export function guideView({ cid }) {
  const el = h(`
    <div class="screen">
      ${topbar({ left: backBtn(`#/c/${cid}`), title: "Guia do grupo" })}
      <div class="screen-body" data-body>${spinner()}</div>
      ${tabbar(null, cid)}
    </div>`);

  const body = el.querySelector("[data-body]");
  let places = [], members = [], tab = "list", map = null;

  const nameOf = (u) => members.find((m) => m.uid === u)?.name || "";

  function draw() {
    const mapped = places.filter((p) => p.coords);

    body.innerHTML = `
      <div class="page-head">
        <h1>Onde a gente comeu</h1>
        <div class="sub">${places.length} ${places.length === 1 ? "lugar" : "lugares"} do desafio</div>
      </div>

      <div class="segmented on-white" data-tabs>
        <button data-tab="list" class="${tab === "list" ? "active" : ""}">${icon("details", 16)} Lista</button>
        <button data-tab="map" class="${tab === "map" ? "active" : ""}">${icon("pin", 16)} Mapa</button>
      </div>

      <div data-panel></div>
      <div class="gap"></div>`;

    body.querySelector("[data-tabs]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (!btn || btn.dataset.tab === tab) return;
      tab = btn.dataset.tab;
      draw();
    });

    const panel = body.querySelector("[data-panel]");

    if (!places.length) {
      panel.innerHTML = `<div class="empty">
        <div class="big">📍</div><strong>Nenhum lugar ainda</strong>
        Preencha o campo "Onde foi?" ao postar um prato e o lugar aparece aqui.
        Toque no alvo pra marcar a localização e ele também entra no mapa.
      </div>`;
      return;
    }

    if (tab === "list") {
      panel.innerHTML = `<div class="card" style="padding:6px 0">
        ${places.map((p) => `
          <button class="rank-row" data-nav="${plateLink(cid, { periodo: "all", lugar: p.id })}">
            <div class="checkin-thumb" style="width:46px;height:46px">
              ${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : icon("pin", 20)}
            </div>
            <div class="rank-main">
              <div class="rank-name">${esc(p.name)}</div>
              <div class="rank-sub">
                ${p.visits} ${p.visits === 1 ? "visita" : "visitas"}
                ${(p.uids || []).length ? ` · ${esc((p.uids || []).map(nameOf).filter(Boolean).map((n) => n.split(" ")[0]).join(", "))}` : ""}
              </div>
            </div>
            <div class="rank-pos" style="text-align:right">
              <div>${p.rating != null ? `⭐ ${formatRating(p.rating)}` : "—"}</div>
              ${p.coords ? `<div class="rank-sub" style="font-size:13px">no mapa</div>` : ""}
            </div>
          </button>`).join("")}
      </div>`;
      return;
    }

    /* ---- mapa ---- */
    if (!mapped.length) {
      panel.innerHTML = `<div class="empty">
        <div class="big">🗺️</div><strong>Nenhum lugar com localização</strong>
        Ao postar, toque no ícone de alvo ao lado de "Onde foi?" pra marcar
        o ponto no mapa.
      </div>`;
      return;
    }

    panel.innerHTML = `<div class="card"><div class="map-box" data-map>${spinner()}</div></div>`;
    const box = panel.querySelector("[data-map]");

    loadLeaflet().then((L) => {
      box.innerHTML = "";
      map?.remove();
      map = L.map(box, { attributionControl: true, scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      const points = mapped.map((p) => [p.coords.lat, p.coords.lng]);
      map.fitBounds(points, { padding: [36, 36], maxZoom: 16 });

      // circleMarker é vetorial: não precisa dos PNGs de marcador do Leaflet
      mapped.forEach((p) => {
        L.circleMarker([p.coords.lat, p.coords.lng], {
          radius: 9,
          color: "#fff",
          weight: 2.5,
          fillColor: "#E0472F",
          fillOpacity: 1,
        }).addTo(map).bindPopup(
          `<strong>${esc(p.name)}</strong><br>${p.visits} ${p.visits === 1 ? "visita" : "visitas"}`
          + (p.rating != null ? `<br>⭐ ${formatRating(p.rating)}` : "")
        );
      });

      setTimeout(() => map.invalidateSize(), 60);
    }).catch(() => {
      box.innerHTML = `<div class="empty" style="padding:30px">
        <strong>Mapa indisponível</strong>
        Os mapas precisam de internet. A lista continua funcionando offline.
      </div>`;
    });
  }

  const a = store.watchPlaces(cid, (list) => { places = list; draw(); });
  const b = store.watchMembers(cid, (list) => { members = list; draw(); });

  return {
    el,
    destroy: () => { a(); b(); map?.remove(); map = null; },
  };
}
