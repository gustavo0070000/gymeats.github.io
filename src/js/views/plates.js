import {
  h, esc, avatar, topbar, backBtn, spinner, dayLabel, timeLabel, rangeLabel, shortDate, sheet,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { query } from "../router.js";
import {
  CUISINES, MEALS, cuisineById, mealById, formatRating, formatMoney, formatPoints,
} from "../food.js";

/* ============================================================
   Lista de pratos

   A tela pra onde todo número do app aponta. Antes o recap dizia
   "Cozinha mais comum: Japonesa · 5" e a conversa morria ali; agora
   aquele 5 abre esta lista com os cinco pratos.

   Os filtros moram na URL, então o link é compartilhável: dá pra
   mandar no bate-papo e a pessoa abre exatamente a mesma lista.
   ============================================================ */

const PERIODOS = [
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
  { id: "year", label: "Ano" },
  { id: "all", label: "Tudo" },
];

export function platesView({ cid }) {
  const el = h(`
    <div class="screen">
      ${topbar({
        left: backBtn("#back"),
        title: "Pratos",
        right: `<button class="topbar-btn" data-ordenar>${icon("sort")}</button>`,
      })}
      <div class="screen-body no-tabbar" data-body>${spinner()}</div>
    </div>`);

  const body = el.querySelector("[data-body]");

  const inicial = query();
  let periodo = PERIODOS.some((p) => p.id === inicial.periodo) ? inicial.periodo : "month";
  let ordem = store.ORDENS[inicial.ordem] ? inicial.ordem : "recentes";
  let filtros = {};
  store.FILTROS.forEach((k) => { if (inicial[k]) filtros[k] = inicial[k]; });

  let challenge = null, members = [], posts = null, carregado = null;

  /* A URL acompanha os filtros sem re-renderizar a tela: replaceState não
     dispara hashchange, então mexer num filtro não recarrega nem perde o
     scroll — mas o link continua valendo se alguém copiar. */
  function sincronizarURL() {
    const p = new URLSearchParams({ periodo, ...(ordem !== "recentes" ? { ordem } : {}) });
    Object.entries(filtros).forEach(([k, v]) => v && p.set(k, v));
    history.replaceState(null, "", `#/c/${cid}/pratos?${p}`);
  }

  async function carregar() {
    if (!challenge) return;
    const { start, end } = store.periodRange(periodo, challenge);
    const chave = `${periodo}:${start.getTime()}`;
    if (carregado === chave) return;
    carregado = chave;
    posts = null;
    desenhar();
    posts = await store.periodPosts(cid, start, end).catch(() => []);
    desenhar();
  }

  /* ---------- chips de filtro ativo ---------- */

  const nomeDe = (uid) => members.find((m) => m.uid === uid)?.name?.split(" ")[0] || "Alguém";

  function rotulos() {
    const r = [];
    if (filtros.uid) r.push(["uid", `👤 ${nomeDe(filtros.uid)}`]);
    if (filtros.cuisine) {
      const c = cuisineById(filtros.cuisine);
      r.push(["cuisine", `${c?.emoji || "🍽️"} ${c?.label || filtros.cuisine}`]);
    }
    if (filtros.meal) {
      const m = mealById(filtros.meal);
      r.push(["meal", `${m?.emoji || "🍽️"} ${m?.label || filtros.meal}`]);
    }
    if (filtros.feito) r.push(["feito", filtros.feito === "casa" ? "👨‍🍳 Cozinhado" : "🛒 Comprado"]);
    if (filtros.nota) r.push(["nota", `⭐ nota ${filtros.nota}+`]);
    if (filtros.preco) r.push(["preco", "💸 Com preço"]);
    if (filtros.dia) r.push(["dia", `📅 ${dayLabel(filtros.dia)}`]);
    if (filtros.lugar) {
      const nome = (posts || []).find((p) => p.placeKey === filtros.lugar)?.place;
      r.push(["lugar", `📍 ${nome || "Lugar"}`]);
    }
    return r;
  }

  /* ---------- resumo do que está na tela ---------- */

  function resumo(lista) {
    const comNota = lista.filter((p) => p.ratingAvg != null);
    const media = comNota.length
      ? comNota.reduce((s, p) => s + p.ratingAvg, 0) / comNota.length : null;
    const gasto = store.spendBreakdown(lista, members);
    const caseiros = lista.filter((p) => p.homemade).length;

    const celula = (v, k) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;
    const celulas = [
      celula(lista.length, lista.length === 1 ? "prato" : "pratos"),
      celula(`${caseiros}/${lista.length - caseiros}`, "casa/comprado"),
      media != null ? celula(`⭐ ${formatRating(media)}`, "nota média") : celula("—", "sem notas"),
      gasto.n ? celula(formatMoney(gasto.total), "gasto") : "",
    ].filter(Boolean);

    // Com quatro colunas cada uma fica com ~90px: no tamanho normal o valor
    // colide com o vizinho e o rótulo quebra em duas linhas.
    return `
      <div class="card"><div class="stats-row ${celulas.length > 3 ? "tight" : ""}" style="padding:14px 6px">
        ${celulas.join("")}
      </div></div>`;
  }

  /* ---------- linha de prato ---------- */

  const linha = (p) => {
    const c = cuisineById(p.cuisine);
    const m = mealById(p.mealType);
    const marcas = [
      p.homemade ? "👨‍🍳" : "🛒",
      c?.emoji || "",
      m?.emoji || "",
    ].filter(Boolean).join(" ");

    const direita = ordem === "caro" && p.price > 0
      ? `<div class="plate-metric">${formatMoney(p.price)}</div>`
      : p.ratingAvg != null
        ? `<div class="plate-metric">⭐ ${formatRating(p.ratingAvg)}</div>
           <div class="plate-metric-sub">${p.ratingCount} ${p.ratingCount === 1 ? "nota" : "notas"}</div>`
        : p.price > 0 ? `<div class="plate-metric">${formatMoney(p.price)}</div>` : "";

    return `
      <button class="plate-row" data-nav="/c/${cid}/p/${p.id}">
        <div class="plate-thumb">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : icon("fork", 20)}</div>
        <div class="plate-main">
          <div class="plate-title">${esc(p.title || "Sem título")}</div>
          <div class="plate-sub">${esc(p.authorName || "")} · ${esc(dayLabel(store.postDay(p)))}</div>
          <div class="plate-marks">${marcas}${p.place ? ` · ${esc(p.place)}` : ""}</div>
        </div>
        <div class="plate-right">${direita}</div>
      </button>`;
  };

  /* ---------- tela ---------- */

  function desenhar() {
    if (!challenge) return;
    const { start, end } = store.periodRange(periodo, challenge);
    const chips = rotulos();

    const cabeca = `
      <div class="segmented compact" data-periodos>
        ${PERIODOS.map((p) => `<button data-periodo="${p.id}" class="${p.id === periodo ? "active" : ""}">${p.label}</button>`).join("")}
      </div>
      <div class="pad-sub">${periodo === "all"
        ? `${esc(shortDate(challenge.startDate))} → ${esc(shortDate(challenge.endDate))}`
        : esc(rangeLabel(start, end))}</div>
      ${chips.length ? `
        <div class="filter-chips" data-chips>
          ${chips.map(([k, texto]) => `
            <button class="chip active" data-limpar="${k}">${esc(texto)} <span class="x">✕</span></button>`).join("")}
          ${chips.length > 1 ? `<button class="chip" data-limpar="tudo">Limpar tudo</button>` : ""}
        </div>` : ""}`;

    if (posts === null) {
      body.innerHTML = cabeca + spinner();
      ligar();
      return;
    }

    const lista = store.sortPosts(store.filterPosts(posts, filtros), ordem);

    if (!lista.length) {
      body.innerHTML = cabeca + `
        <div class="empty" style="padding:40px 30px">
          <div class="big">🍽️</div>
          <strong>Nenhum prato com esses filtros</strong>
          ${chips.length ? "Tire um filtro ou troque o período." : "Ninguém postou nesse período."}
        </div>`;
      ligar();
      return;
    }

    body.innerHTML = cabeca + resumo(lista) + `
      <div class="section-label left">
        ${lista.length} ${lista.length === 1 ? "prato" : "pratos"} · ${esc(store.ORDENS[ordem].label.toLowerCase())}
      </div>
      <div class="card" style="padding:4px 0">${lista.map(linha).join("")}</div>
      <div class="gap"></div>`;
    ligar();
  }

  function ligar() {
    body.querySelector("[data-periodos]")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-periodo]");
      if (!btn || btn.dataset.periodo === periodo) return;
      periodo = btn.dataset.periodo;
      sincronizarURL();
      desenhar();
      carregar();
    });

    body.querySelector("[data-chips]")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-limpar]");
      if (!btn) return;
      if (btn.dataset.limpar === "tudo") filtros = {};
      else delete filtros[btn.dataset.limpar];
      sincronizarURL();
      desenhar();
    });
  }

  el.querySelector("[data-ordenar]").addEventListener("click", async () => {
    const escolha = await sheet("Ordenar por", Object.entries(store.ORDENS)
      .map(([id, o]) => ({ value: id, label: o.label + (id === ordem ? "  ✓" : "") })));
    if (!escolha || !store.ORDENS[escolha]) return;
    ordem = escolha;
    sincronizarURL();
    desenhar();
  });

  const a = store.watchChallenge(cid, (c) => { challenge = c; desenhar(); carregar(); });
  const b = store.watchMembers(cid, (list) => { members = list; desenhar(); });

  return { el, destroy: () => { a(); b(); } };
}

/** Monta o link da lista a partir de filtros — usado por recap, perfil e ranking. */
export function plateLink(cid, { periodo = "month", ordem, ...filtros } = {}) {
  const p = new URLSearchParams({ periodo });
  if (ordem) p.set("ordem", ordem);
  Object.entries(filtros).forEach(([k, v]) => { if (v) p.set(k, String(v)); });
  return `/c/${cid}/pratos?${p}`;
}
