import {
  h, esc, avatar, topbar, backBtn, tabbar, spinner, rangeLabel, shortDate,
  dayLabel, toast, toastError,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import {
  CUISINES, cuisineById, formatPoints, formatRating, formatMoney, MIN_RATINGS,
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

  async function load() {
    if (!challenge) return;
    const { start, end } = store.periodRange(period, challenge);
    const key = `${period}:${start.getTime()}`;
    if (loadedKey === key) return;
    loadedKey = key;
    posts = null;
    draw();
    posts = await store.periodPosts(cid, start, end).catch(() => []);
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
      best: best[0], worst: worst[0],
      topCuisine: topCuisine ? { ...cuisineById(topCuisine[0]), n: topCuisine[1] } : null,
      chef: chef?.cooked ? chef : null,
      longestStreak: longestStreak?.s ? longestStreak : null,
      explorer: explorer?.n ? explorer : null,
    };
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

    body.innerHTML = head + `
      <div class="section-label">Pódio</div>
      <div class="card podium">${podium(s.rows)}</div>

      <div class="card"><div class="stats-row" style="padding:16px 8px">
        ${stat(s.total, s.total === 1 ? "prato" : "pratos")}
        ${stat(s.homemade, "cozinhados")}
        ${stat(s.bought, "comprados")}
      </div></div>

      ${plateCard(s.best, "Prato do período", "🏆")}
      ${s.worst && s.worst.id !== s.best?.id ? plateCard(s.worst, "Rango da Vergonha", "💀") : ""}

      <div class="section-label">Destaques</div>
      <div class="card list-card">
        ${s.chef ? `<div class="list-row"><span class="label">👨‍🍳 Chef do período</span>
          <span class="value">${esc(s.chef.name.split(" ")[0])} · ${s.chef.cooked}</span></div>` : ""}
        ${s.longestStreak ? `<div class="list-row"><span class="label">🔥 Maior sequência</span>
          <span class="value">${esc(s.longestStreak.name.split(" ")[0])} · ${s.longestStreak.s} dias</span></div>` : ""}
        ${s.explorer ? `<div class="list-row"><span class="label">🌍 Mais cozinhas</span>
          <span class="value">${esc(s.explorer.name.split(" ")[0])} · ${s.explorer.n}</span></div>` : ""}
        ${s.topCuisine ? `<div class="list-row"><span class="label">${s.topCuisine.emoji} Cozinha mais comum</span>
          <span class="value">${esc(s.topCuisine.label)} · ${s.topCuisine.n}</span></div>` : ""}
        ${s.withPrice.length ? `<div class="list-row"><span class="label">💸 Gasto declarado</span>
          <span class="value">${formatMoney(s.spent)}</span></div>` : ""}
        <div class="list-row"><span class="label">📅 Dias ativos (líder)</span>
          <span class="value">${esc(s.byDays[0]?.name.split(" ")[0] || "—")} · ${s.byDays[0]?.count || 0}</span></div>
      </div>

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
