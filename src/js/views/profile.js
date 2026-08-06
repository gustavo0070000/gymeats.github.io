import {
  h, esc, avatar, topbar, backBtn, tabbar, spinner, MONTHS, DOW, dayKey, toDate,
  sheet, confirmSheet, toast, toastError, dayLabel,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { navigate } from "../router.js";
import {
  cuisinesOf, cuisineById, stampIcon, eventsOf,
  formatPoints, pointsLabel,
} from "../food.js";
import { plateLink } from "./plates.js";

const TABS = [
  { id: "cal", label: "Calendário", ico: "calendar" },
  { id: "passport", label: "Passaporte", ico: "target" },
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
    const stk = store.memberStreak(m);
    // O topo usava max(totalPoints, soma do dayPoints) e o resto do app usava
    // o placar; quando os dois divergiam, o perfil mostrava um número que não
    // aparecia em lugar nenhum. Agora sai da mesma fonte da classificação.
    const points = store.standings(members, "all", challenge, "points")
      .find((r) => r.uid === memberUid)?.points ?? 0;
    body.innerHTML = `
      <div class="profile-head">
        ${avatar(m, "hero")}
        <div class="name">${esc(m.name)}</div>
        ${(m.cuisines || []).length ? `<div class="passport-strip">
          ${(m.cuisines || []).slice(0, 10).map((id) =>
            `<span>${stampIcon(cuisineById(id, challenge), 19)}</span>`).join("")}
          ${(m.cuisines || []).length > 10 ? `<span class="more">+${m.cuisines.length - 10}</span>` : ""}
        </div>` : ""}
      </div>

      <div class="stats-row">
        <button class="stat" data-tab-jump="stats">
          <div class="v">${formatPoints(points)}</div><div class="k">Pontos</div>
        </button>
        <button class="stat" data-nav="${plateLink(cid, { periodo: "all", uid: memberUid })}">
          <div class="v">${days.length}</div><div class="k">Dias ativos</div>
        </button>
        <button class="stat" data-tab-jump="cal">
          <div class="v">${stk}${stk >= 7 ? " 🔥" : ""}</div><div class="k">Sequência</div>
        </button>
      </div>

      ${isMe ? jokerBar(m) : ""}

      <div class="segmented on-white compact" data-tabs>
        ${TABS.map((t) => `<button data-tab="${t.id}" class="${t.id === tab ? "active" : ""}">${t.label}</button>`).join("")}
      </div>

      <div data-panel>${spinner()}</div>
      <div class="gap"></div>`;

    body.querySelector("[data-tabs]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (!btn) return;
      tab = btn.dataset.tab;
      draw();
    });

    // Os números do topo levam pra aba que explica cada um.
    body.querySelectorAll("[data-tab-jump]").forEach((btn) => {
      btn.addEventListener("click", () => { tab = btn.dataset.tabJump; draw(); });
    });

    body.querySelector("[data-use-joker]")?.addEventListener("click", () => askJoker(m));

    const panel = body.querySelector("[data-panel]");
    if (tab === "cal") await drawCalendar(panel, days, m);
    else if (tab === "passport") drawPassport(panel, m);
    else if (tab === "grid") await drawGrid(panel);
    else drawStats(panel, m, days);
  }

  /* ---------- vale-faltas ---------- */

  function jokerBar(m) {
    const left = m.jokers ?? store.STARTING_JOKERS;
    return `
      <div class="card joker-bar">
        <div>
          <div class="joker-title">🃏 Vale-faltas</div>
          <div class="joker-sub">${left} ${left === 1 ? "restante" : "restantes"} — salvam a sequência de um dia perdido</div>
        </div>
        ${left > 0 ? `<button class="btn btn-white" style="width:auto;padding:11px 18px" data-use-joker>Usar</button>` : ""}
      </div>`;
  }

  /** Oferece os últimos dias em branco pra gastar um coringa. */
  async function askJoker(m) {
    const used = new Set([...(m.days || []), ...(m.jokerDays || [])]);
    const options = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - 1);
    for (let i = 0; i < 14 && options.length < 6; i++) {
      const key = dayKey(cursor);
      if (!used.has(key)) options.push({ label: dayLabel(key), value: key });
      cursor.setDate(cursor.getDate() - 1);
    }
    if (!options.length) return toast("Você não tem nenhum dia em branco recente.");

    const chosen = await sheet("Qual dia você quer cobrir?", options);
    if (!chosen) return;
    if (!await confirmSheet(`Usar um vale-falta em ${dayLabel(chosen)}?`, "Usar", false)) return;
    try {
      await store.useJoker(cid, chosen);
      monthCache = new Map();
      toast("Vale-falta usado — sequência salva!");
    } catch (err) {
      toastError(err?.message || "Não deu pra usar o vale-falta.");
    }
  }

  /* ---------- passaporte ---------- */

  function drawPassport(panel, m) {
    const owned = new Set(m.cuisines || []);
    const daConfig = cuisinesOf(challenge);

    /* Um selo apagado da configuração some da lista de opções, mas quem já
       carimbou continua com ele — e ele continua contando. Sem isso, apagar
       um selo faria o passaporte de alguém dizer 25/23. */
    const aposentados = [...owned]
      .filter((id) => !daConfig.some((c) => c.id === id))
      .map((id) => ({ id, label: id, emoji: "🏅", aposentado: true }));
    const todos = [...daConfig, ...aposentados];

    const eventos = eventsOf(challenge);
    const fichaEventos = m.eventos || {};

    panel.innerHTML = `
      <div class="passport-head">
        <div class="passport-count">${owned.size}<span>/${todos.length}</span></div>
        <div class="passport-label">carimbos no passaporte</div>
      </div>
      <div class="card"><div class="passport-grid">
        ${todos.map((c) => `
          <div class="stamp ${owned.has(c.id) ? "on" : ""} ${c.aposentado ? "aposentado" : ""}">
            <span class="flag">${stampIcon(c, 26)}</span>
            <span class="lbl">${esc(c.label)}</span>
          </div>`).join("")}
      </div></div>
      <div class="pad hint-row">
        Cada selo novo que você posta carimba o passaporte. Escolha o selo
        na hora de publicar o prato.
        ${aposentados.length ? `${aposentados.length} ${aposentados.length === 1
          ? "selo já não está" : "selos já não estão"} mais na lista do desafio,
          mas continuam contando pra você.` : ""}
      </div>

      ${eventos.length ? `
        <div class="section-label left">Eventos</div>
        <div class="card breakdown">
          ${eventos.map((ev) => {
            const guardado = fichaEventos[ev.id] || {};
            const feitas = (guardado.cozinhas || []).length;
            const need = Math.max(1, Number(ev.need) || 1);
            const ok = Number(guardado.bonus) > 0;
            return `
              <div class="bd-row">
                <span class="bd-label">${ev.emoji || "🎯"} ${esc(ev.name)}
                  <div class="bd-conta">${ok
                    ? `fechado${guardado.dia ? ` em ${esc(guardado.dia)}` : ""}`
                    : `${feitas}/${need} selos`}</div>
                </span>
                <span class="bd-valor">${ok ? `+${pointsLabel(guardado.bonus)}` : `${pointsLabel(ev.bonus)}`}</span>
              </div>`;
          }).join("")}
        </div>` : ""}`;
  }

  async function drawCalendar(panel, days, m) {
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const posts = await postsFor(year, month);
    const byDay = new Map();
    posts.forEach((p) => { if (!byDay.has(p.dayKey)) byDay.set(p.dayKey, p); });

    const first = new Date(year, month, 1);
    const total = new Date(year, month + 1, 0).getDate();
    const lead = first.getDay();
    const today = dayKey();
    const daySet = new Set(days);
    const jokerSet = new Set(m?.jokerDays || []);

    // O primeiro dia é empurrado com grid-column-start; gerar células vazias
    // com aspect-ratio faz o navegador resolver a altura da linha errado.
    const cells = [];
    for (let d = 1; d <= total; d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const post = byDay.get(key);
      const noDia = posts.filter((x) => x.dayKey === key).length;
      const hit = daySet.has(key);
      const joker = !hit && jokerSet.has(key);
      // Um prato no dia: vai direto pro post. Mais de um: abre a lista do dia.
      const destino = noDia > 1
        ? plateLink(cid, { periodo: "all", uid: memberUid, dia: key })
        : post ? `/c/${cid}/p/${post.id}` : "";
      cells.push(`
        <div class="cal-cell ${hit ? "hit" : ""} ${joker ? "joker" : ""} ${key === today ? "today" : ""}"
             ${d === 1 && lead ? `style="grid-column-start:${lead + 1}"` : ""}
             ${destino ? `data-nav="${destino}"` : ""}>
          ${hit
            ? `<span class="fill">${post?.thumb ? `<img src="${esc(post.thumb)}" alt="">` : icon("fork", 18)}</span>`
            : joker ? `<span class="fill">🃏</span>` : d}
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
            <button data-nav="/c/${cid}/p/${p.id}" style="aspect-ratio:1;overflow:hidden;background:var(--track)">
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
    const byDays = store.standings(members, "all", challenge, "days");
    const byPoints = store.standings(members, "all", challenge, "points");
    const mine = byDays.find((r) => r.uid === memberUid);
    const minePts = byPoints.find((r) => r.uid === memberUid);
    const wins = store.weeklyWins(members).find((w) => w.uid === memberUid)?.wins || 0;

    const start = toDate(challenge?.startDate) || new Date();
    const end = new Date(Math.min(Date.now(), (toDate(challenge?.endDate) || new Date()).getTime()));
    const elapsed = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const rate = Math.round((days.length / elapsed) * 100);

    const cooked = m.homemadeCount || 0;
    const bought = m.boughtCount || 0;
    const cookRate = cooked + bought ? Math.round((cooked / (cooked + bought)) * 100) : 0;

    const line = (k, v) => `
      <div class="list-row"><span class="label">${k}</span><span class="value">${v}</span></div>`;

    // Linha que abre a lista com o filtro já aplicado — o número deixa de
    // ser um beco sem saída e vira o caminho pros pratos que o formaram.
    const linkLine = (k, v, destino, sub = "") => `
      <button class="bd-row" data-nav="${destino}">
        <span class="bd-label">${k}${sub ? `<div class="bd-conta">${sub}</div>` : ""}</span>
        <span class="bd-valor">${v} <span class="chev-mini">›</span></span>
      </button>`;

    const b = store.pointsBreakdown(m, statPosts || [], "all", challenge);
    const faltou = Math.max(0, elapsed - days.length);
    const todos = { periodo: "all", uid: memberUid };

    panel.innerHTML = `
      <div class="section-label left">De onde vêm os pontos</div>
      <div class="card breakdown">
        ${statPosts === null ? spinner() : `
          ${linkLine("👨‍🍳 Cozinhou", `${b.caseiros}`,
            plateLink(cid, { ...todos, feito: "casa" }),
            `${b.caseiros === 1 ? "prato" : "pratos"}`)}
          ${linkLine("🛒 Comprou", `${b.comprados}`,
            plateLink(cid, { ...todos, feito: "comprado" }),
            `${b.comprados === 1 ? "prato" : "pratos"}`)}
          ${line("Pontos dos pratos", pointsLabel(b.base))}
          ${b.repetidos ? line("🔁 Refeição repetida",
            `−${pointsLabel(b.perdidoRepetindo)}`,
            ) : ""}
          ${b.bonus ? line("🔥 Bônus de sequência", `+${pointsLabel(b.bonus)}`) : ""}
          ${b.cravadas ? line("🎯 Cravou preço/caloria", `+${pointsLabel(b.cravadas)}`) : ""}
          ${b.eventos ? line("🗓️ Eventos concluídos", `+${pointsLabel(b.eventos)}`) : ""}
          <div class="bd-row total">
            <span class="bd-label">Total</span>
            <span class="bd-valor">${pointsLabel(b.total)}</span>
          </div>`}
      </div>

      <div class="card list-card">
        ${line("Posição por pontos", `${minePts?.position || "—"}º`)}
        ${line("Posição por dias", `${mine?.position || "—"}º`)}
        ${linkLine("Dias ativos", days.length, plateLink(cid, todos),
          `de ${elapsed} ${elapsed === 1 ? "dia" : "dias"} de desafio${faltou ? ` · furou ${faltou}` : ""}`)}
        ${line("Frequência", `${rate}%`)}
        ${line("Sequência atual", `${store.memberStreak(m)} dias`)}
        ${line("Vitórias semanais", wins)}
      </div>

      <div class="section-label left">Cozinha</div>
      <div class="card list-card">
        ${line("Taxa de fogão", `${cookRate}%`)}
        ${line("🌍 Carimbos no passaporte", `${(m.cuisines || []).length}/${cuisinesOf(challenge).length}`)}
        ${line("🃏 Vale-faltas restantes", m.jokers ?? store.STARTING_JOKERS)}
      </div>`;

    // Os pratos chegam depois; quando chegarem, redesenha só este painel.
    if (statPosts === null) carregarStatPosts().then(() => {
      if (tab === "stats") drawStats(panel, m, days);
    });
  }

  /* Os pratos do desafio inteiro, usados pra abrir a conta dos pontos. */
  let statPosts = null, carregandoStats = null;
  function carregarStatPosts() {
    if (carregandoStats) return carregandoStats;
    const { start, end } = store.periodRange("all", challenge);
    carregandoStats = store.periodPosts(cid, start, end)
      .then((list) => { statPosts = list; })
      .catch(() => { statPosts = []; });
    return carregandoStats;
  }

  const a = store.watchMembers(cid, (list) => { members = list; draw(); });
  const b = store.watchChallenge(cid, (c) => { challenge = c; if (tab === "stats") draw(); });

  return { el, destroy: () => { a(); b(); } };
}
