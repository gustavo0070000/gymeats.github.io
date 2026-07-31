import {
  h, esc, avatar, topbar, backBtn, tabbar, spinner, rangeLabel, shortDate,
  dayLabel, toast, toastError,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { plateLink } from "./plates.js";
import {
  CUISINES, cuisineById, formatPoints, pointsLabel, formatRating, formatMoney, MIN_RATINGS,
} from "../food.js";

const PERIODS = [
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
  { id: "year", label: "Ano" },
  { id: "all", label: "Tudo" },
];

export function recapView({ cid }) {
  const el = h(`
    <div class="screen">
      ${topbar({
        left: backBtn(`#/c/${cid}`),
        title: "Recap",
        right: `<button class="topbar-btn" data-share>${icon("share")}</button>`,
      })}
      <div class="screen-body" data-body>${spinner()}</div>
      ${tabbar(null, cid)}
    </div>`);

  const body = el.querySelector("[data-body]");
  let challenge = null, members = [], posts = null, period = "week", loadedKey = null;
  let summary = null;
  let anteriores = null;   // posts do período anterior, pra comparar

  async function load() {
    if (!challenge) return;
    const { start, end } = store.periodRange(period, challenge);
    const key = `${period}:${start.getTime()}`;
    if (loadedKey === key) return;
    loadedKey = key;
    posts = null;
    anteriores = null;
    draw();
    posts = await store.periodPosts(cid, start, end).catch(() => []);
    draw();

    // Sem o período anterior, "13 pratos" não diz se a semana foi boa.
    const antes = store.previousRange(period, challenge);
    anteriores = antes
      ? await store.periodPosts(cid, antes.start, antes.end).catch(() => [])
      : [];
    draw();
  }

  /* Junta tudo que o recap mostra num objeto só. */
  function build() {
    const { start, end } = store.periodRange(period, challenge);
    const rows = store.standings(members, period, challenge, "points");
    const byDays = store.standings(members, period, challenge, "days");
    const { best, worst } = store.rankByRating(posts || []);

    const homemade = (posts || []).filter((p) => p.homemade).length;
    const withPrice = (posts || []).filter((p) => p.price > 0);
    const spent = withPrice.reduce((s, p) => s + p.price, 0);

    const cuisineCount = new Map();
    (posts || []).forEach((p) => {
      if (!p.cuisine) return;
      cuisineCount.set(p.cuisine, (cuisineCount.get(p.cuisine) || 0) + 1);
    });
    const topCuisine = [...cuisineCount.entries()].sort((a, b) => b[1] - a[1])[0];

    const chef = [...members]
      .map((m) => ({ ...m, cooked: (posts || []).filter((p) => p.uid === m.uid && p.homemade).length }))
      .sort((a, b) => b.cooked - a.cooked)[0];

    const longestStreak = [...members]
      .map((m) => ({ ...m, s: store.memberStreak(m) }))
      .sort((a, b) => b.s - a.s)[0];

    const explorer = [...members]
      .map((m) => ({ ...m, n: (m.cuisines || []).length }))
      .sort((a, b) => b.n - a.n)[0];

    return {
      start, end, rows, byDays,
      total: (posts || []).length,
      homemade,
      bought: (posts || []).length - homemade,
      spent, withPrice,
      gasto: store.spendBreakdown(posts || [], members),
      best: best[0], worst: worst[0],
      topCuisine: topCuisine ? { ...cuisineById(topCuisine[0]), id: topCuisine[0], n: topCuisine[1] } : null,
      chef: chef?.cooked ? chef : null,
      longestStreak: longestStreak?.s ? longestStreak : null,
      explorer: explorer?.n ? explorer : null,
      antes: anteriores ? {
        total: anteriores.length,
        homemade: anteriores.filter((p) => p.homemade).length,
        spent: anteriores.filter((p) => p.price > 0).reduce((s, p) => s + p.price, 0),
      } : null,
    };
  }

  /* Variação contra o período anterior. Sem base pra comparar, some. */
  function delta(agora, antes, { dinheiro = false } = {}) {
    if (period === "all" || !summary?.antes) return "";
    if (!antes && !agora) return "";
    const d = agora - antes;
    if (!antes) return `<span class="delta up">novo</span>`;
    if (d === 0) return `<span class="delta flat">igual</span>`;
    const sinal = d > 0 ? "+" : "−";
    const valor = dinheiro ? formatMoney(Math.abs(d)) : Math.abs(d);
    // Gastar menos não é derrota: dinheiro não ganha cor de bom/ruim.
    const classe = dinheiro ? "flat" : (d > 0 ? "up" : "down");
    return `<span class="delta ${classe}">${sinal}${valor}</span>`;
  }

  const podium = (rows) => {
    const medals = ["🥇", "🥈", "🥉"];
    return rows.slice(0, 3).map((m, i) => `
      <button class="podium-item" data-nav="/c/${cid}/u/${m.uid}">
        <span class="medal">${medals[i]}</span>
        ${avatar(m, "lg")}
        <span class="who">${esc(m.name.split(" ")[0])}</span>
        <span class="pts">${formatPoints(m.points)} pts</span>
      </button>`).join("");
  };

  /**
   * Placar completo, com a conta de cada um aberta.
   * O pódio mostrava só três; num grupo de quatro, o último simplesmente
   * não existia na tela — e ninguém via de onde os pontos vinham.
   */
  function tabelaCompleta(rows) {
    if (!rows.length) return "";
    return rows.map((m) => {
      const b = store.pointsBreakdown(m, posts || [], period, challenge);
      const partes = [
        b.caseiros ? `${b.caseiros}× casa` : "",
        b.comprados ? `${b.comprados}× comprado` : "",
        b.bonus ? `+${formatPoints(b.bonus)} de bônus` : "",
      ].filter(Boolean).join(" · ");

      return `
        <button class="bd-row" data-nav="${plateLink(cid, { periodo: period, uid: m.uid })}">
          <span class="bd-label">
            ${m.position}º ${esc(m.name.split(" ")[0])}
            <div class="bd-conta">${partes || "sem pratos no período"}</div>
          </span>
          <span class="bd-valor">${pointsLabel(m.points)}</span>
        </button>`;
    }).join("");
  }

  /** A conta do total do grupo, com a barra mostrando o peso de cada parte. */
  function barraDePontos(rows) {
    const soma = rows.reduce((acc, m) => {
      const b = store.pointsBreakdown(m, posts || [], period, challenge);
      return {
        casa: acc.casa + b.caseiros * 2,
        comprado: acc.comprado + b.comprados,
        bonus: acc.bonus + b.bonus,
      };
    }, { casa: 0, comprado: 0, bonus: 0 });

    const total = soma.casa + soma.comprado + soma.bonus;
    if (!total) return "";
    const pct = (v) => `${(v / total) * 100}%`;

    return `
      <div class="bd-bar">
        ${soma.casa ? `<span class="casa" style="width:${pct(soma.casa)}"></span>` : ""}
        ${soma.comprado ? `<span class="comprado" style="width:${pct(soma.comprado)}"></span>` : ""}
        ${soma.bonus ? `<span class="bonus" style="width:${pct(soma.bonus)}"></span>` : ""}
      </div>
      <div class="bd-legenda">
        ${soma.casa ? `<span><i style="background:var(--red)"></i>Cozinhado ${formatPoints(soma.casa)}</span>` : ""}
        ${soma.comprado ? `<span><i style="background:var(--red-soft)"></i>Comprado ${formatPoints(soma.comprado)}</span>` : ""}
        ${soma.bonus ? `<span><i style="background:#F0C419"></i>Bônus de sequência ${formatPoints(soma.bonus)}</span>` : ""}
      </div>`;
  }

  /** Gasto aberto: quem, quanto, média e o prato mais caro. */
  function detalheGasto(g) {
    if (!g.n) return "";
    return `
      <div class="section-label">Gasto</div>
      <div class="card breakdown">
        ${g.porPessoa.map((p) => `
          <button class="bd-row" data-nav="${plateLink(cid, { periodo: period, uid: p.uid, preco: "sim", ordem: "caro" })}">
            <span class="bd-label">${esc(p.name.split(" ")[0])}
              <div class="bd-conta">${p.n} ${p.n === 1 ? "prato" : "pratos"} · média ${formatMoney(p.media)}</div>
            </span>
            <span class="bd-valor">${formatMoney(p.total)}</span>
          </button>`).join("")}
        ${g.caro ? `
          <button class="bd-row" data-nav="/c/${cid}/p/${g.caro.id}">
            <span class="bd-label">💸 Mais caro do período
              <div class="bd-conta">${esc(g.caro.title || "Sem título")} · ${esc(g.caro.authorName || "")}</div>
            </span>
            <span class="bd-valor">${formatMoney(g.caro.price)}</span>
          </button>` : ""}
        ${g.porCozinha.length > 1 ? `
          <button class="bd-row" data-nav="${plateLink(cid, { periodo: period, cuisine: g.porCozinha[0].id, preco: "sim", ordem: "caro" })}">
            <span class="bd-label">${cuisineById(g.porCozinha[0].id)?.emoji || "🍽️"} Cozinha que mais pesou
              <div class="bd-conta">${esc(cuisineById(g.porCozinha[0].id)?.label || "—")} · ${g.porCozinha[0].n} ${g.porCozinha[0].n === 1 ? "prato" : "pratos"}</div>
            </span>
            <span class="bd-valor">${formatMoney(g.porCozinha[0].total)}</span>
          </button>` : ""}
        <div class="bd-row total">
          <span class="bd-label">Total declarado
            <div class="bd-conta">média ${formatMoney(g.media)} por prato${g.semPreco ? ` · ${g.semPreco} sem preço` : ""}</div>
          </span>
          <span class="bd-valor">${formatMoney(g.total)} ${delta(g.total, summary.antes?.spent || 0, { dinheiro: true })}</span>
        </div>
      </div>`;
  }

  const plateCard = (p, title, emoji) => p ? `
    <button class="card highlight-card" data-nav="/c/${cid}/p/${p.id}">
      <div class="hl-photo">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : icon("fork", 26)}</div>
      <div class="hl-body">
        <div class="hl-title">${emoji} ${title}</div>
        <div class="hl-name">${esc(p.title || "Sem título")}</div>
        <div class="hl-sub">${esc(p.authorName)} · ⭐ ${formatRating(p.ratingAvg)} (${p.ratingCount})</div>
      </div>
    </button>` : "";

  const stat = (v, k) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;

  function draw() {
    if (!challenge) return;
    const { start, end } = store.periodRange(period, challenge);

    const head = `
      <div class="page-head">
        <h1>${esc(challenge.name)}</h1>
        <div class="sub">${period === "all"
          ? `${esc(shortDate(challenge.startDate))} → ${esc(shortDate(challenge.endDate))}`
          : esc(rangeLabel(start, end))}</div>
      </div>
      <div class="segmented" data-periods>
        ${PERIODS.map((p) => `<button data-period="${p.id}" class="${p.id === period ? "active" : ""}">${p.label}</button>`).join("")}
      </div>`;

    if (posts === null) {
      body.innerHTML = head + spinner();
      wire();
      return;
    }

    summary = build();
    const s = summary;

    if (!s.total) {
      body.innerHTML = head + `<div class="empty">
        <div class="big">📭</div><strong>Nada nesse período</strong>
        Quando a galera postar, o resumo aparece aqui.
      </div>`;
      wire();
      return;
    }

    // Todo número aqui é um botão: leva pra lista com o filtro já aplicado.
    const destaque = (emoji, titulo, valor, destino, sub = "") => `
      <button class="bd-row" data-nav="${destino}">
        <span class="bd-label">${emoji} ${titulo}${sub ? `<div class="bd-conta">${sub}</div>` : ""}</span>
        <span class="bd-valor">${valor}</span>
      </button>`;

    body.innerHTML = head + `
      <div class="section-label">Pódio</div>
      <div class="card podium">${podium(s.rows)}</div>

      <div class="card"><div class="stats-row" style="padding:16px 8px">
        <button class="stat" data-nav="${plateLink(cid, { periodo: period })}">
          <div class="v">${s.total}</div><div class="k">${s.total === 1 ? "prato" : "pratos"}</div>
          ${delta(s.total, s.antes?.total ?? 0)}
        </button>
        <button class="stat" data-nav="${plateLink(cid, { periodo: period, feito: "casa" })}">
          <div class="v">${s.homemade}</div><div class="k">cozinhados</div>
          ${delta(s.homemade, s.antes?.homemade ?? 0)}
        </button>
        <button class="stat" data-nav="${plateLink(cid, { periodo: period, feito: "comprado" })}">
          <div class="v">${s.bought}</div><div class="k">comprados</div>
        </button>
      </div></div>

      ${plateCard(s.best, "Prato do período", "🏆")}
      ${s.worst && s.worst.id !== s.best?.id ? plateCard(s.worst, "Rango da Vergonha", "💀") : ""}

      <div class="section-label">De onde vieram os pontos</div>
      <div class="card breakdown">
        ${tabelaCompleta(s.rows)}
        ${barraDePontos(s.rows)}
      </div>

      <div class="section-label">Destaques</div>
      <div class="card breakdown">
        ${s.chef ? destaque("👨‍🍳", "Chef do período",
          `${s.chef.cooked} ${s.chef.cooked === 1 ? "prato" : "pratos"}`,
          plateLink(cid, { periodo: period, uid: s.chef.uid, feito: "casa" }),
          esc(s.chef.name.split(" ")[0])) : ""}

        ${s.longestStreak ? destaque("🔥", "Maior sequência",
          `${s.longestStreak.s} dias`,
          `/c/${cid}/u/${s.longestStreak.uid}`,
          esc(s.longestStreak.name.split(" ")[0])) : ""}

        ${s.explorer ? destaque("🌍", "Mais cozinhas",
          `${s.explorer.n} ${s.explorer.n === 1 ? "carimbo" : "carimbos"}`,
          `/c/${cid}/u/${s.explorer.uid}`,
          esc(s.explorer.name.split(" ")[0])) : ""}

        ${s.topCuisine ? destaque(s.topCuisine.emoji, "Cozinha mais comum",
          `${s.topCuisine.n} ${s.topCuisine.n === 1 ? "prato" : "pratos"}`,
          plateLink(cid, { periodo: period, cuisine: s.topCuisine.id }),
          esc(s.topCuisine.label)) : ""}

        ${s.byDays.map((m) => destaque("📅", `Dias ativos · ${esc(m.name.split(" ")[0])}`,
          `${m.count} ${m.count === 1 ? "dia" : "dias"}`,
          plateLink(cid, { periodo: period, uid: m.uid }))).join("")}
      </div>

      ${detalheGasto(s.gasto)}

      <div class="pad"><button class="btn btn-primary" data-share-btn>${icon("share", 20)} Compartilhar resumo</button></div>
      <div class="gap"></div>`;

    wire();
  }

  function wire() {
    body.querySelector("[data-periods]")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-period]");
      if (!btn) return;
      period = btn.dataset.period;
      draw();
      load();
    });
    body.querySelector("[data-share-btn]")?.addEventListener("click", share);
  }

  /* Monta um texto pronto pra jogar no grupo do zap. */
  function shareText() {
    const s = summary;
    if (!s) return "";
    const label = { week: "da semana", month: "do mês", year: "do ano", all: "do desafio" }[period];
    const medals = ["🥇", "🥈", "🥉"];

    const lines = [
      `🍽️ GymEats — resumo ${label}`,
      `${challenge.name}`,
      "",
      ...s.rows.slice(0, 3).map((m, i) => `${medals[i]} ${m.name} — ${formatPoints(m.points)} pts`),
      "",
      `${s.total} pratos · ${s.homemade} cozinhados · ${s.bought} comprados`,
    ];
    if (s.best) lines.push(`🏆 Prato do período: "${s.best.title}" de ${s.best.authorName} (⭐ ${formatRating(s.best.ratingAvg)})`);
    if (s.worst && s.worst.id !== s.best?.id) lines.push(`💀 Rango da Vergonha: "${s.worst.title}" de ${s.worst.authorName} (⭐ ${formatRating(s.worst.ratingAvg)})`);
    if (s.longestStreak) lines.push(`🔥 Maior sequência: ${s.longestStreak.name} com ${s.longestStreak.s} dias`);
    if (s.topCuisine) lines.push(`${s.topCuisine.emoji} Cozinha mais comum: ${s.topCuisine.label}`);
    return lines.join("\n");
  }

  async function share() {
    const text = shareText();
    if (!text) return;
    if (navigator.share) {
      try { await navigator.share({ title: "GymEats", text }); return; } catch { /* cancelou */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Resumo copiado!");
    } catch {
      toastError("Não deu pra copiar.");
    }
  }

  el.querySelector("[data-share]").addEventListener("click", share);

  const a = store.watchChallenge(cid, (c) => { challenge = c; draw(); load(); });
  const b = store.watchMembers(cid, (m) => { members = m; draw(); });

  return { el, destroy: () => { a(); b(); } };
}
