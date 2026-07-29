import { h, esc, spinner, toast, toastError } from "../ui.js";
import { icon } from "../icons.js";
import { loadLeaflet } from "./guide.js";

/* Busca de endereço pelo Nominatim (OpenStreetMap): grátis e sem chave de API.
   A política de uso pede no máximo uma consulta por segundo, então a busca é
   disparada com atraso e só a partir de 3 letras. */
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

async function searchPlaces(term) {
  const url = `${NOMINATIM}?format=jsonv2&limit=8&addressdetails=1`
    + `&accept-language=pt-BR&q=${encodeURIComponent(term)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("busca indisponível");
  const data = await res.json();
  return data.map((r) => ({
    name: r.name || String(r.display_name || "").split(",")[0],
    detail: String(r.display_name || "").split(",").slice(1, 4).join(",").trim(),
    coords: { lat: Number(Number(r.lat).toFixed(6)), lng: Number(Number(r.lon).toFixed(6)) },
  })).filter((r) => r.name);
}

/**
 * Abre a tela de escolher local.
 * Resolve com { name, coords } ou null se cancelar.
 * `initial` aceita { name, coords } pra reabrir já preenchido.
 */
export function pickPlace(initial = {}) {
  return new Promise((resolve) => {
    let name = initial.name || "";
    let coords = initial.coords || null;
    let map = null, marker = null, timer = null, lastTerm = "";

    const node = h(`
      <div class="picker">
        <div class="picker-top">
          <button class="topbar-btn" data-close>${icon("close", 24)}</button>
          <div class="topbar-title">Onde foi?</div>
          <button class="topbar-action" data-done>Pronto</button>
        </div>

        <div class="picker-search">
          <span class="ico">${icon("pin", 20)}</span>
          <input data-q placeholder="Buscar restaurante ou endereço"
                 value="${esc(name)}" autocomplete="off" spellcheck="false">
          <button class="picker-clear hidden" data-clear>${icon("close", 18)}</button>
        </div>

        <div class="picker-actions">
          <button class="btn btn-white" data-gps>${icon("target", 18)} Usar minha localização</button>
        </div>

        <div class="picker-results" data-results></div>
        <div class="picker-map" data-map></div>
        <div class="picker-foot" data-foot></div>
      </div>`);

    const input = node.querySelector("[data-q]");
    const results = node.querySelector("[data-results]");
    const mapBox = node.querySelector("[data-map]");
    const foot = node.querySelector("[data-foot]");
    const clearBtn = node.querySelector("[data-clear]");

    const close = (value) => {
      map?.remove();
      node.remove();
      resolve(value);
    };

    const renderFoot = () => {
      clearBtn.classList.toggle("hidden", !input.value);
      foot.innerHTML = coords
        ? `<span class="ok">${icon("checkSmall", 15)} Ponto marcado no mapa</span>
           <button class="link-red" data-drop>Remover ponto</button>`
        : `<span>Sem ponto no mapa — o lugar entra só na lista do guia.</span>`;
      foot.querySelector("[data-drop]")?.addEventListener("click", () => {
        coords = null;
        marker?.remove();
        marker = null;
        renderFoot();
      });
    };

    /* ---------- mapa: tocar pra escolher o ponto ---------- */
    async function ensureMap() {
      if (map) return map;
      mapBox.innerHTML = spinner();
      try {
        const L = await loadLeaflet();
        mapBox.innerHTML = "";
        map = L.map(mapBox, { attributionControl: true, zoomControl: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19, attribution: "&copy; OpenStreetMap",
        }).addTo(map);
        map.setView(coords ? [coords.lat, coords.lng] : [-23.5505, -46.6333], coords ? 16 : 11);
        map.on("click", (e) => setPoint({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }));
        if (coords) setPoint(coords, false);
        setTimeout(() => map.invalidateSize(), 60);
        return map;
      } catch {
        mapBox.innerHTML = `<div class="empty" style="padding:26px">
          Mapa indisponível — sem internet. Você ainda pode digitar o nome do lugar.
        </div>`;
        return null;
      }
    }

    function setPoint(point, recenter = true) {
      coords = point;
      const L = window.L;
      if (!map || !L) return renderFoot();
      const latlng = [point.lat, point.lng];
      if (marker) marker.setLatLng(latlng);
      else {
        marker = L.circleMarker(latlng, {
          radius: 10, color: "#fff", weight: 3, fillColor: "#E0472F", fillOpacity: 1,
        }).addTo(map);
      }
      if (recenter) map.setView(latlng, Math.max(map.getZoom(), 16));
      renderFoot();
    }

    /* ---------- busca ---------- */
    function showResults(list) {
      if (!list.length) {
        results.innerHTML = `<div class="picker-empty">Nada encontrado. Você pode usar o nome digitado mesmo assim.</div>`;
        return;
      }
      results.innerHTML = list.map((r, i) => `
        <button class="picker-item" data-i="${i}">
          <span class="ico">${icon("pin", 18)}</span>
          <span class="txt">
            <span class="n">${esc(r.name)}</span>
            ${r.detail ? `<span class="d">${esc(r.detail)}</span>` : ""}
          </span>
        </button>`).join("");

      results.querySelectorAll("[data-i]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const picked = list[Number(btn.dataset.i)];
          name = picked.name;
          input.value = picked.name;
          results.innerHTML = "";
          await ensureMap();
          setPoint(picked.coords);
        });
      });
    }

    async function runSearch(term) {
      if (term.length < 3 || term === lastTerm) return;
      lastTerm = term;
      results.innerHTML = `<div class="picker-empty">Buscando…</div>`;
      try {
        showResults(await searchPlaces(term));
      } catch {
        results.innerHTML = `<div class="picker-empty">Busca indisponível agora. Digite o nome e marque o ponto no mapa.</div>`;
      }
    }

    input.addEventListener("input", () => {
      name = input.value.trim();
      clearBtn.classList.toggle("hidden", !input.value);
      clearTimeout(timer);
      const term = name;
      if (term.length < 3) { results.innerHTML = ""; lastTerm = ""; return; }
      timer = setTimeout(() => runSearch(term), 700);
    });

    clearBtn.addEventListener("click", () => {
      input.value = ""; name = ""; results.innerHTML = ""; lastTerm = "";
      renderFoot();
      input.focus();
    });

    node.querySelector("[data-gps]").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      if (!navigator.geolocation) return toastError("Seu navegador não tem GPS.");
      btn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          btn.disabled = false;
          await ensureMap();
          setPoint({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
          });
          toast("Localização marcada.");
        },
        () => { btn.disabled = false; toastError("Não consegui pegar sua localização."); },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });

    node.querySelector("[data-close]").addEventListener("click", () => close(null));
    node.querySelector("[data-done]").addEventListener("click", () => {
      close({ name: input.value.trim(), coords });
    });

    document.getElementById("modal-root").appendChild(node);
    renderFoot();
    ensureMap();
    if (!name) setTimeout(() => input.focus(), 150);
  });
}
