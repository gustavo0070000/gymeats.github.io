import {
  h, esc, avatar, topbar, backBtn, tabbar, spinner, MONTHS, DOW, dayKey, toDate,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { navigate } from "../router.js";

const TABS = [
  { id: "cal", label: "Calendário", ico: "calendar" },
  { id: "grid", label: "Pratos", ico: "image" },
  { id: "stats", label: "Stats", ico: "bolt" },
];

export function profileView({ cid, uid: memberUid }) {
  const isMe = memberUid === store.uid();

  const el = h(`
    <div class="screen">
      ${topbar({
        left: backBtn(`#/c/${cid}`),
        title: "",
        right: isMe ? `<button class="topbar-btn" data-nav="/conta">${icon("gear")}</button>` : "",
      })}
      <div class="screen-body" data-body>${spinner()}</div>
      ${tabbar(null, cid)}
    </div>`);

  const body = el.querySelector("[data-body]");
  let members = [], challenge = null, tab = "cal";
  let cursor = new Date();
  let monthCache = new Map(); // "YYYY-M" -> posts

  const member = () => members.find((m) => m.uid === memberUid);

  async function postsFor(year, month) {
    const key = `${year}-${month}`;
    if (!monthCache.has(key)) {
      monthCache.set(key, await store.monthPosts(cid, memberUid, year, month).catch(() => []));
    }
    return monthCache.get(key);
  }

  async function draw() {
    const m = member();
    if (!m) {
      body.innerHTML = `<div class="empty"><strong>Participante não encontrado</strong>Talvez tenha saído do desafio.</div>`;
      return;
    }

    const days = m.days || [];
    const stk = store.streak(days);

    body.innerHTML = `
      <div class="profile-head">
        ${avatar(m, "hero")}
        <div class="name">${esc(m.name)}</div>
      </div>

      <div class="stats-row">
        <div class="stat"><div class="v">${m.total || 0}</div><div class="k">Pratos</div></div>
        <div class="stat"><div class="v">${days.length}</div><div class="k">Dias ativos</div></div>
        <div class="stat"><div class="v">${stk}</div><div class="k">Sequência</div></div>
      </div>

      <div class="segmented on-white" data-tabs>
        ${TABS.map((t) => `<button data-tab="${t.id}" class="${t.id === tab ? "active" : ""}">${icon(t.ico, 17)} ${t.label}</button>`).join("")}
      </div>

      <div data-panel>${spinner()}</div>
      <div class="gap"></div>`;

    body.querySelector("[data-tabs]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (!btn) return;
      tab = btn.dataset.tab;
      draw();
    });

    const panel = body.querySelector("[data-panel]");
    if (tab === "cal") await drawCalendar(panel, days);
    else if (tab === "grid") await drawGrid(panel);
    else drawStats(panel, m, days);
  }

  async function drawCalendar(panel, days) {
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const posts = await postsFor(year, month);
    const byDay = new Map();
    posts.forEach((p) => { if (!byDay.has(p.dayKey)) byDay.set(p.dayKey, p); });

    const first = new Date(year, month, 1);
    const total = new Date(year, month + 1, 0).getDate();
    const lead = first.getDay();
    const today = dayKey();
    const daySet = new Set(days);

    // O primeiro dia é empurrado com grid-column-start; gerar células vazias
    // com aspect-ratio faz o navegador resolver a altura da linha errado.
    const cells = [];
    for (let d = 1; d <= total; d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const post = byDay.get(key);
      const hit = daySet.has(key);
      cells.push(`
        <div class="cal-cell ${hit ? "hit" : ""} ${key === today ? "today" : ""}"
             ${d === 1 && lead ? `style="grid-column-start:${lead + 1}"` : ""}
             ${post ? `data-nav="/c/${cid}/p/${post.id}"` : ""}>
          ${hit
            ? `<span class="fill">${post?.thumb ? `<img src="${esc(post.thumb)}" alt="">` : icon("fork", 18)}</span>`
            : d}
        </div>`);
    }

    panel.innerHTML = `
      <div class="cal-month">
        <button data-prev>${icon("back", 20)}</button>
        <span>${MONTHS[month]} ${year}</span>
        <button data-next>${icon("chevron", 20)}</button>
      </div>
      <div class="cal-dow">${DOW.map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="card"><div class="cal-grid">${cells.join("")}</div></div>
      <button class="btn btn-outline btn-pill-center" data-nav="/c/${cid}">Ver o feed</button>`;

    panel.querySelector("[data-prev]").addEventListener("click", () => {
      cursor = new Date(year, month - 1, 1); draw();
    });
    panel.querySelector("[data-next]").addEventListener("click", () => {
      cursor = new Date(year, month + 1, 1); draw();
    });
  }

  async function drawGrid(panel) {
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const posts = (await postsFor(year, month)).sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));

    panel.innerHTML = `
      <div class="cal-month">
        <button data-prev>${icon("back", 20)}</button>
        <span>${MONTHS[month]} ${year}</span>
        <button data-next>${icon("chevron", 20)}</button>
      </div>
      ${posts.length ? `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:0 3px">
          ${posts.map((p) => `
            <button data-nav="/c/${cid}/p/${p.id}" style="aspect-ratio:1;overflow:hidden;background:#DDD">
              ${p.thumb ? `<img src="${esc(p.thumb)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">` : ""}
            </button>`).join("")}
        </div>` : `<div class="empty">Nenhum prato nesse mês.</div>`}`;

    panel.querySelector("[data-prev]").addEventListener("click", () => {
      cursor = new Date(year, month - 1, 1); draw();
    });
    panel.querySelector("[data-next]").addEventListener("click", () => {
      cursor = new Date(year, month + 1, 1); draw();
    });
  }

  function drawStats(panel, m, days) {
    const rows = store.standings(members, "all", challenge);
    const mine = rows.find((r) => r.uid === memberUid);
    const wins = store.weeklyWins(members).find((w) => w.uid === memberUid)?.wins || 0;

    const start = toDate(challenge?.startDate) || new Date();
    const end = new Date(Math.min(Date.now(), (toDate(challenge?.endDate) || new Date()).getTime()));
    const elapsed = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const rate = Math.round((days.length / elapsed) * 100);

    const line = (k, v) => `
      <div class="list-row"><span class="label">${k}</span><span class="value">${v}</span></div>`;

    panel.innerHTML = `
      <div class="card list-card">
        ${line("Posição geral", `${mine?.position || "—"}º`)}
        ${line("Dias ativos", days.length)}
        ${line("Dias do desafio até hoje", elapsed)}
        ${line("Frequência", `${rate}%`)}
        ${line("Sequência atual", `${store.streak(days)} dias`)}
        ${line("Vitórias semanais", wins)}
        ${line("Total de pratos", m.total || 0)}
      </div>`;
  }

  const a = store.watchMembers(cid, (list) => { members = list; draw(); });
  const b = store.watchChallenge(cid, (c) => { challenge = c; if (tab === "stats") draw(); });

  return { el, destroy: () => { a(); b(); } };
}
