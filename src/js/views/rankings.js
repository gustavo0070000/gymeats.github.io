import {
  h, esc, avatar, topbar, backBtn, tabbar, spinner, rangeLabel, shortDate, dayLabel,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { navigate } from "../router.js";
import { formatPoints, formatRating, MIN_RATINGS, SHAME_BELOW } from "../food.js";

const PERIODS = [
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
  { id: "year", label: "Ano" },
  { id: "all", label: "Todas" },
];

const BOARDS = [
  { id: "days", label: "Dias", ico: "calendar" },
  { id: "points", label: "Pontos", ico: "bolt" },
  { id: "plates", label: "Pratos", ico: "medal" },
];

export function rankingsView({ cid }) {
  const el = h(`
    <div class="screen">
      ${topbar({
        left: backBtn(`#/c/${cid}`),
        title: "",
        right: `<button class="topbar-btn" data-refresh>${icon("refresh")}</button>`,
      })}
      <div class="screen-body" data-body>${spinner()}</div>
      ${tabbar("rankings", cid)}
    </div>`);

  const body = el.querySelector("[data-body]");
  let challenge = null, members = [], period = "week", board = "days", expanded = false;
  let posts = null, loadedKey = null;

  /* Os pratos (melhores/piores) precisam dos posts do período. */
  async function ensurePosts() {
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

  const rankRow = (m, valueLabel, position) => `
    <button class="rank-row ${m.uid === store.uid() ? "me" : ""}" data-nav="/c/${cid}/u/${m.uid}">
      ${avatar(m, "md")}
      <div class="rank-main">
        <div class="rank-name">${esc(m.name)}</div>
        <div class="rank-sub">${valueLabel}</div>
      </div>
      <div class="rank-pos">${position}º</div>
    </button>`;

  const plateRow = (p, position, note) => `
    <button class="rank-row" data-nav="/c/${cid}/p/${p.id}">
      <div class="checkin-thumb" style="width:46px;height:46px">
        ${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : icon("fork", 20)}
      </div>
      <div class="rank-main">
        <div class="rank-name">${esc(p.title || "Sem título")}</div>
        <div class="rank-sub">${esc(p.authorName)} · ${esc(dayLabel(p.dayKey))}</div>
      </div>
      <div class="rank-pos" style="text-align:right">
        <div>${note}</div>
        <div class="rank-sub" style="font-size:13px">${p.ratingCount} ${p.ratingCount === 1 ? "nota" : "notas"}</div>
      </div>
    </button>`;

  function drawPeople() {
    const rows = store.standings(members, period, challenge, board);
    const shown = expanded ? rows : rows.slice(0, 5);
    const wins = store.weeklyWins(members);

    const label = (m) => (board === "points"
      ? `${formatPoints(m.points)} ${m.points === 1 ? "ponto" : "pontos"}`
      : `${m.count} ${m.count === 1 ? "dia" : "dias"} ativo`);

    return `
      <div class="section-label left">${board === "points" ? "Pontos" : "Classificações"}</div>
      <div class="card" style="padding:6px 0">
        ${shown.length
          ? shown.map((m) => rankRow(m, label(m), m.position)).join("")
          : `<div class="empty" style="padding:26px">Ninguém pontuou nesse período.</div>`}
      </div>
      ${rows.length > 5 ? `
        <button class="btn btn-white btn-pill-center" data-toggle>
          ${expanded ? "Mostrar menos" : "Todas as classificações"}
        </button>` : ""}
      ${board === "points" ? `
        <div class="pad hint-row" style="padding-bottom:8px">
          Cada post vale 1 ponto se foi comprado ou 2 pontos se foi feito em casa. O bônus de 7 dias seguidos multiplica o valor do post.
        </div>` : ""}
      ${wins.length ? `
        <div class="section-label left">Vitórias</div>
        <div class="card" style="padding:6px 0">
          ${wins.map((m) => rankRow(m, `${m.wins} ${m.wins === 1 ? "vitória semanal" : "vitórias semanais"}`, m.position)).join("")}
        </div>` : ""}`;
  }

  function drawPlates() {
    if (posts === null) return spinner();
    const { best, worst, eligible } = store.rankByRating(posts);

    if (!eligible.length) {
      return `<div class="empty" style="padding:40px 30px">
        <div class="big">🍽️</div><strong>Ainda sem pódio</strong>
        Um prato entra no ranking depois de receber ${MIN_RATINGS} notas.
        Abre os pratos da galera e dá nota.
      </div>`;
    }

    const top = expanded ? best : best.slice(0, 3);
    // Só entra na vergonha quem realmente foi mal — senão, com poucos
    // pratos no período, um prato bom acabaria no pódio invertido.
    const bottom = worst.filter((p) => p.ratingAvg < SHAME_BELOW).slice(0, 3);

    return `
      <div class="section-label left">🏆 Melhores pratos</div>
      <div class="card" style="padding:6px 0">
        ${top.map((p, i) => plateRow(p, i + 1, formatRating(p.ratingAvg))).join("")}
      </div>
      ${best.length > 3 ? `
        <button class="btn btn-white btn-pill-center" data-toggle>
          ${expanded ? "Mostrar menos" : `Ver todos os ${best.length}`}
        </button>` : ""}

      <div class="section-label left">💀 Rango da Vergonha</div>
      ${bottom.length ? `
        <div class="card" style="padding:6px 0">
          ${bottom.map((p, i) => plateRow(p, i + 1, formatRating(p.ratingAvg))).join("")}
        </div>
        <div class="pad hint-row" style="padding-bottom:8px">
          Qualquer prato que fechou abaixo de ${SHAME_BELOW} entra aqui. Sem ressentimentos.
        </div>`
      : `<div class="card"><div class="empty" style="padding:24px">
          Ninguém passou vergonha nesse período. Nota mínima ficou acima de ${SHAME_BELOW}.
        </div></div>`}`;
  }

  function draw() {
    if (!challenge) return;
    const { start, end } = store.periodRange(period, challenge);

    body.innerHTML = `
      <div class="page-head">
        <h1>${esc(challenge.name)}</h1>
        <div class="sub">${period === "all"
          ? `${esc(shortDate(challenge.startDate))} → ${esc(shortDate(challenge.endDate))}`
          : esc(rangeLabel(start, end))}</div>
      </div>

      <div class="segmented" data-periods>
        ${PERIODS.map((p) => `<button data-period="${p.id}" class="${p.id === period ? "active" : ""}">${p.label}</button>`).join("")}
      </div>

      <div class="segmented on-white" data-boards>
        ${BOARDS.map((b) => `<button data-board="${b.id}" class="${b.id === board ? "active" : ""}">${icon(b.ico, 16)} ${b.label}</button>`).join("")}
      </div>

      ${board === "plates" ? drawPlates() : drawPeople()}
      <div class="gap"></div>`;

    body.querySelector("[data-periods]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-period]");
      if (!btn) return;
      period = btn.dataset.period;
      expanded = false;
      draw();
      if (board === "plates") ensurePosts();
    });

    body.querySelector("[data-boards]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-board]");
      if (!btn) return;
      board = btn.dataset.board;
      expanded = false;
      draw();
      if (board === "plates") ensurePosts();
    });

    body.querySelector("[data-toggle]")?.addEventListener("click", () => { expanded = !expanded; draw(); });
  }

  el.querySelector("[data-refresh]").addEventListener("click", () => { loadedKey = null; draw(); ensurePosts(); });

  const a = store.watchChallenge(cid, (c) => { challenge = c; draw(); });
  const b = store.watchMembers(cid, (m) => { members = m; draw(); });

  return { el, destroy: () => { a(); b(); } };
}
