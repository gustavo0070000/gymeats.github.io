import {
  h, esc, avatar, topbar, backBtn, tabbar, spinner, rangeLabel, shortDate,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { navigate } from "../router.js";

const PERIODS = [
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
  { id: "year", label: "Ano" },
  { id: "all", label: "Todas" },
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
  let challenge = null, members = [], period = "week", expanded = false;

  const draw = () => {
    if (!challenge) return;
    const { start, end } = store.periodRange(period, challenge);
    const rows = store.standings(members, period, challenge);
    const shown = expanded ? rows : rows.slice(0, 5);
    const wins = store.weeklyWins(members);
    const myUid = store.uid();

    const rankRow = (m, valueLabel) => `
      <button class="rank-row ${m.uid === myUid ? "me" : ""}" data-nav="/c/${cid}/u/${m.uid}">
        ${avatar(m, "md")}
        <div class="rank-main">
          <div class="rank-name">${esc(m.name)}</div>
          <div class="rank-sub">${valueLabel}</div>
        </div>
        <div class="rank-pos">${m.position}º</div>
      </button>`;

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

      <div class="section-label left">Classificações</div>
      <div class="card" style="padding:6px 0">
        ${shown.length
          ? shown.map((m) => rankRow(m, `${m.count} ${m.count === 1 ? "dia" : "dias"} ativo`)).join("")
          : `<div class="empty" style="padding:26px">Ninguém pontuou nesse período.</div>`}
      </div>
      ${rows.length > 5 ? `
        <button class="btn btn-white btn-pill-center" data-toggle>
          ${expanded ? "Mostrar menos" : "Todas as classificações"}
        </button>` : ""}

      ${wins.length ? `
        <div class="section-label left">Vitórias</div>
        <div class="card" style="padding:6px 0">
          ${wins.map((m) => rankRow(m, `${m.wins} ${m.wins === 1 ? "vitória semanal" : "vitórias semanais"}`)).join("")}
        </div>` : ""}

      <div class="gap"></div>`;

    body.querySelector("[data-periods]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-period]");
      if (!btn) return;
      period = btn.dataset.period;
      expanded = false;
      draw();
    });
    body.querySelector("[data-toggle]")?.addEventListener("click", () => { expanded = !expanded; draw(); });
  };

  el.querySelector("[data-refresh]").addEventListener("click", draw);

  const a = store.watchChallenge(cid, (c) => { challenge = c; draw(); });
  const b = store.watchMembers(cid, (m) => { members = m; draw(); });

  return { el, destroy: () => { a(); b(); } };
}
