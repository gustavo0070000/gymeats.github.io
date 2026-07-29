import { h, esc, spinner, toast, toastError } from "../ui.js";
import { icon } from "../icons.js";
import { loadLeaflet } from "./guide.js";

/* Busca de lugares em duas fontes, as duas gratuitas, sem chave de API e
   baseadas no OpenStreetMap:

   - Photon (komoot): bom em nome de estabelecimento e em busca parcial;
   - Nominatim: bom em endereço e em nome completo.

   As duas são consultadas em paralelo e os resultados entram numa lista só,
   sem repetir. Os dois aceitam um ponto de referência, então mandamos a
   posição atual do mapa pra priorizar o que está perto de você — sem isso,
   buscar "Bar do Zé" traz um bar do Zé em qualquer canto do mundo.

   Cobertura: o OSM tem muito menos estabelecimento comercial cadastrado que
   o Google Maps. Quando não achar, dá pra digitar o nome e marcar o ponto
   no mapa na mão, que é o que a tela permite. */

const PHOTON = "https://photon.komoot.io/api/";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

const TYPE_LABEL = {
  restaurant: "Restaurante", fast_food: "Lanchonete", cafe: "Café", bar: "Bar",
  pub: "Bar", bakery: "Padaria", ice_cream: "Sorveteria", pizzeria: "Pizzaria",
  food_court: "Praça de alimentação", marketplace: "Mercado", supermarket: "Mercado",
  confectionery: "Doceria", deli: "Empório", nightclub: "Balada",
};

async function fromPhoton(term, near) {
  // O Photon só aceita lang default/de/en/fr — mandar "pt" faz ele
  // devolver erro em vez de resultado.
  const params = new URLSearchParams({ q: term, limit: "10" });
  if (near) { params.set("lat", near.lat); params.set("lon", near.lng); }
  const res = await fetch(`${PHOTON}?${params}`);
  if (!res.ok) throw new Error("photon");
  const data = await res.json();

  return (data.features || []).map((f) => {
    const p = f.properties || {};
    const [lng, lat] = f.geometry?.coordinates || [];
    const detail = [
      TYPE_LABEL[p.osm_value],
      [p.street, p.housenumber].filter(Boolean).join(", "),
      p.district || p.city,
      p.state,
    ].filter(Boolean).join(" · ");
    return {
      name: p.name || p.street || "",
      detail,
      kind: p.osm_value,
      coords: { lat: Number(Number(lat).toFixed(6)), lng: Number(Number(lng).toFixed(6)) },
    };
  }).filter((r) => r.name && isFinite(r.coords.lat));
}

async function fromNominatim(term, near) {
  const params = new URLSearchParams({
    format: "jsonv2", limit: "8", addressdetails: "1",
    "accept-language": "pt-BR", q: term,
  });
  if (near) {
    // caixa de ~1,2° em volta do ponto de referência, sem excluir o resto
    const d = 0.6;
    params.set("viewbox", [near.lng - d, near.lat + d, near.lng + d, near.lat - d].join(","));
  }
  const res = await fetch(`${NOMINATIM}?${params}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("nominatim");
  const data = await res.json();

  return data.map((r) => ({
    name: r.name || String(r.display_name || "").split(",")[0],
    detail: String(r.display_name || "").split(",").slice(1, 4).join(",").trim(),
    kind: r.type,
    coords: { lat: Number(Number(r.lat).toFixed(6)), lng: Number(Number(r.lon).toFixed(6)) },
  })).filter((r) => r.name);
}

const distance = (a, b) => (!a || !b ? Infinity : Math.hypot(a.lat - b.lat, a.lng - b.lng));

// Lugar de comer aparece antes de rua, bairro e cidade — é um app de comida.
const FOOD_KINDS = new Set(Object.keys(TYPE_LABEL));
const rank = (r, near) => (FOOD_KINDS.has(r.kind) ? 0 : 1) * 100 + distance(r.coords, near);

async function searchPlaces(term, near) {
  const [photon, nominatim] = await Promise.allSettled([
    fromPhoton(term, near),
    fromNominatim(term, near),
  ]);
  if (photon.status === "rejected" && nominatim.status === "rejected") {
    throw new Error("busca indisponível");
  }

  const merged = [];
  const seen = new Set();
  for (const r of [...(photon.value || []), ...(nominatim.value || [])]) {
    // mesmo lugar vindo das duas fontes: coordenada arredondada como chave
    const key = `${r.name.toLowerCase()}|${r.coords.lat.toFixed(3)},${r.coords.lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }

  merged.sort((a, b) => rank(a, near) - rank(b, near));
  return merged.slice(0, 12);
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
        if (!coords) centerOnUserIfAllowed();
        return map;
      } catch {
        mapBox.innerHTML = `<div class="empty" style="padding:26px">
          Mapa indisponível — sem internet. Você ainda pode digitar o nome do lugar.
        </div>`;
        return null;
      }
    }

    /* Centraliza o mapa em você — mas só se a permissão de GPS já tiver
       sido dada antes. Não queremos abrir a tela pedindo permissão; a
       ideia é só deixar a busca mais relevante pra quem já liberou. */
    async function centerOnUserIfAllowed() {
      try {
        const status = await navigator.permissions?.query({ name: "geolocation" });
        if (status?.state !== "granted") return;
      } catch {
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!map || coords) return;
          map.setView([pos.coords.latitude, pos.coords.longitude], 14);
        },
        () => {},
        { timeout: 6000 },
      );
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
        results.innerHTML = `<div class="picker-empty">
          Não achei esse lugar no mapa aberto do OpenStreetMap — ele tem bem
          menos restaurante cadastrado que o Google.<br>
          Pode deixar o nome que você digitou e tocar no mapa pra marcar o ponto.
        </div>`;
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

    /* Ponto de referência da busca: o ponto já marcado, senão o centro
       do mapa. É o que faz "Bar do Zé" trazer o bar da sua cidade. */
    function reference() {
      if (coords) return coords;
      if (map) {
        const c = map.getCenter();
        return { lat: c.lat, lng: c.lng };
      }
      return null;
    }

    async function runSearch(term) {
      if (term.length < 3 || term === lastTerm) return;
      lastTerm = term;
      results.innerHTML = `<div class="picker-empty">Buscando…</div>`;
      try {
        const list = await searchPlaces(term, reference());
        showResults(list);
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
