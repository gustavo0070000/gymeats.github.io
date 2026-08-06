import {
  h, esc, avatar, topbar, backBtn, spinner, dayLabel, timeLabel, rangeLabel, shortDate, sheet,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { query, navigate } from "../router.js";
import {
  cuisinesOf, mealsOf, cuisineById, mealById, stampIcon,
  formatRating, formatMoney,
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
        left: `<button class="topbar-btn" data-voltar>${icon("back")}</button>`,
        title: "Pratos",
        right: `<button class="topbar-action" data-limpar-tudo hidden>Limpar</button>
                <button class="topbar-btn" data-ordenar>${icon("sort")}</button>`,
      })}
      <div class="screen-body no-tabbar" data-body>${spinner()}</div>
      <div class="fab-filtro-wrap"><button class="fab-filtro" data-abrir-filtro>
        ${icon("filter", 20)} Filtrar
      </button></div>
    </div>`);

  const body = el.querySelector("[data-body]");
  const tituloEl = el.querySelector(".topbar-title");
  const botaoOrdenar = el.querySelector("[data-ordenar]");
  const botaoLimpar = el.querySelector("[data-limpar-tudo]");
  const fab = el.querySelector(".fab-filtro-wrap");

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
      const c = cuisineById(filtros.cuisine, challenge);
      r.push(["cuisine", `${stampIcon(c, 15)} ${c?.label || filtros.cuisine}`]);
    }
    if (filtros.meal) {
      const m = mealById(filtros.meal, challenge);
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
    const c = cuisineById(p.cuisine, challenge);
    const m = mealById(p.mealType, challenge);
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

  /* ============================================================
     Tela de filtro

     Vira tela em vez de folha porque com contador cada opção precisa de
     linha própria: as 24 cozinhas sozinhas já fariam uma folha rolável
     mais alta que o celular.

     O contador de cada opção é o resultado real de escolhê-la — ou seja,
     conta com os outros filtros já aplicados, menos o da própria seção.
     Assim nunca dá pra escolher algo e cair numa lista vazia.
     ============================================================ */

  let filtrando = false;

  function contarPara(chave, valor) {
    const hipotese = { ...filtros, [chave]: valor };
    return store.filterPosts(posts || [], hipotese).length;
  }

  function secaoFiltro(titulo, chave, opcoes) {
    const linhas = opcoes
      .map((o) => ({ ...o, n: contarPara(chave, o.value) }))
      // Opção que daria lista vazia não aparece — a não ser que esteja ativa,
      // senão ela sumiria e ninguém conseguiria desmarcar.
      .filter((o) => o.n > 0 || filtros[chave] === o.value);
    if (!linhas.length) return "";

    return `
      <div class="section-label left">${esc(titulo)}</div>
      <div class="card"><div class="chip-wrap ${linhas.length > 10 ? "scroll" : ""}">
        ${linhas.map((o) => `
          <button class="chip ${filtros[chave] === o.value ? "active" : ""}"
                  data-filtro="${chave}" data-valor="${esc(o.value)}">
            ${o.label} <span class="chip-n">${o.n}</span>
          </button>`).join("")}
      </div></div>`;
  }

  /* Um selo ou refeição apagado da configuração continua existindo nos pratos
     antigos. Sem esta costura, o filtro simplesmente não oferecia como chegar
     neles — os pratos ficavam invisíveis pra quem procurasse por marca. */
  function listaComOrfaos(campo, configurados, presentes) {
    const usados = presentes(campo);
    const conhecidos = configurados.filter((x) => usados.includes(x.id));
    const orfaos = usados
      .filter((id) => !configurados.some((x) => x.id === id))
      .map((id) => ({ id, label: id, emoji: "🏅" }));
    return [...conhecidos, ...orfaos];
  }

  function desenharFiltro() {
    const presentes = (campo) => [...new Set((posts || []).map((p) => p[campo]).filter(Boolean))];
    const total = store.filterPosts(posts || [], filtros).length;

    body.innerHTML = `
      ${secaoFiltro("Quem postou", "uid", members
        .filter((m) => (posts || []).some((p) => p.uid === m.uid))
        .map((m) => ({ value: m.uid, label: esc(m.name.split(" ")[0]) })))}

      ${secaoFiltro("Feito em casa?", "feito", [
        { value: "casa", label: "👨‍🍳 Cozinhado" },
        { value: "comprado", label: "🛒 Comprado" },
      ])}

      ${secaoFiltro("Refeição", "meal", listaComOrfaos("mealType", mealsOf(challenge), presentes)
        .map((m) => ({ value: m.id, label: `${m.emoji || "🍽️"} ${esc(m.label)}` })))}

      ${secaoFiltro("Selo", "cuisine", listaComOrfaos("cuisine", cuisinesOf(challenge), presentes)
        .map((c) => ({ value: c.id, label: `${stampIcon(c, 15)} ${esc(c.label)}` })))}

      ${secaoFiltro("Nota", "nota", [8, 9].map((n) => ({ value: String(n), label: `⭐ ${n} ou mais` })))}

      ${secaoFiltro("Preço", "preco", [{ value: "sim", label: "💸 Com preço declarado" }])}

      ${secaoFiltro("Lugar", "lugar", presentes("placeKey").map((k) => ({
        value: k,
        label: `📍 ${esc((posts || []).find((p) => p.placeKey === k)?.place || "Marcado no mapa")}`,
      })))}

      <div class="gap"></div>
      <div class="filtro-rodape">
        <button class="btn btn-primary" data-aplicar>
          ${total ? `Ver ${total} ${total === 1 ? "prato" : "pratos"}` : "Nenhum prato com esses filtros"}
        </button>
      </div>`;

    body.querySelectorAll("[data-filtro]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const { filtro, valor } = btn.dataset;
        // Tocar de novo na opção ativa desmarca.
        if (filtros[filtro] === valor) delete filtros[filtro];
        else filtros[filtro] = valor;
        sincronizarURL();
        botaoLimpar.hidden = !Object.keys(filtros).length;
        desenharFiltro();
      });
    });
    body.querySelector("[data-aplicar]").addEventListener("click", fecharFiltro);
  }

  function abrirFiltro() {
    if (posts === null) return;
    filtrando = true;
    tituloEl.textContent = "Filtrar";
    botaoOrdenar.hidden = true;
    botaoLimpar.hidden = !Object.keys(filtros).length;
    fab.hidden = true;
    desenharFiltro();
  }

  function fecharFiltro() {
    filtrando = false;
    tituloEl.textContent = "Pratos";
    botaoOrdenar.hidden = false;
    botaoLimpar.hidden = true;
    fab.hidden = false;
    desenhar();
  }

  /* ---------- tela ---------- */

  function desenhar() {
    if (filtrando) return desenharFiltro();
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

    const corte = store.avisoDeCorte(posts);
    body.innerHTML = cabeca
      + (corte ? `<div class="truncado">${esc(corte)}</div>` : "")
      + resumo(lista) + `
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

  botaoOrdenar.addEventListener("click", async () => {
    const escolha = await sheet("Ordenar por", Object.entries(store.ORDENS)
      .map(([id, o]) => ({ value: id, label: o.label + (id === ordem ? "  ✓" : "") })));
    if (!escolha || !store.ORDENS[escolha]) return;
    ordem = escolha;
    sincronizarURL();
    desenhar();
  });

  el.querySelector("[data-abrir-filtro]").addEventListener("click", abrirFiltro);

  botaoLimpar.addEventListener("click", () => {
    filtros = {};
    sincronizarURL();
    desenharFiltro();
    botaoLimpar.hidden = true;
  });

  // Com o filtro aberto, voltar fecha o filtro em vez de sair da tela —
  // é o que o gesto de voltar do Android faz e o que a pessoa espera.
  el.querySelector("[data-voltar]").addEventListener("click", () => {
    if (filtrando) return fecharFiltro();
    navigate("#back");
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
