import {
  h, esc, avatar, topbar, backBtn, tabbar, spinner, sheet, confirmSheet,
  dayLabel, timeLabel, relative, shortDate, toast, toastError,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { navigate } from "../router.js";
import { openMenu, rememberChallenge } from "./home.js";

/* ============================================================
   Feed do desafio
   ============================================================ */

export function feedView({ cid }) {
  rememberChallenge(cid);

  const el = h(`
    <div class="screen">
      ${topbar({
        left: `<button class="topbar-btn" data-menu>${icon("menu")}</button>`,
        big: true,
        right: `<button class="topbar-btn" data-bell>${icon("bell")}</button>
                <button class="topbar-btn" data-more>${icon("dots")}</button>`,
      })}
      <div class="screen-body">
        <h1 class="page-title" data-title>&nbsp;</h1>
        <div data-header></div>
        <div data-posts>${spinner()}</div>
      </div>
      <button class="fab" data-nav="/c/${cid}/novo">${icon("plus", 30)}</button>
      ${tabbar(null, cid)}
    </div>`);

  const titleEl = el.querySelector("[data-title]");
  const headerEl = el.querySelector("[data-header]");
  const postsEl = el.querySelector("[data-posts]");

  let challenge = null, members = [], posts = null, myChallenges = [];

  const renderHeader = () => {
    if (!challenge) return;
    titleEl.textContent = challenge.name;

    const rows = store.standings(members, "all", challenge);
    const leader = rows[0];
    const mine = rows.find((r) => r.uid === store.uid());

    const cell = (person, count, label) => `
      <div class="standings-cell">
        ${avatar(person, "md")}
        <div><div class="num">${count}</div><div class="lbl">${label}</div></div>
      </div>`;

    headerEl.innerHTML = `
      ${challenge.bannerThumb
        ? `<div class="banner"><img src="${esc(challenge.bannerThumb)}" alt=""></div>`
        : `<div class="banner empty">${esc(challenge.name)}</div>`}
      <div class="standings-strip">
        ${leader ? cell(leader, leader.count, "Líder") : ""}
        ${mine ? cell(mine, mine.count, "Você") : ""}
      </div>`;
  };

  const renderPosts = () => {
    if (posts === null) return;
    if (!posts.length) {
      postsEl.innerHTML = `
        <div class="empty">
          <div class="big">📸</div>
          <strong>Ninguém postou ainda</strong>
          Toca no + e manda a foto do seu prato de hoje.
        </div>`;
      return;
    }

    const groups = [];
    posts.forEach((p) => {
      const key = p.dayKey || "";
      if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
      groups[groups.length - 1].items.push(p);
    });

    postsEl.innerHTML = groups.map((g) => `
      <div class="section-label">${esc(dayLabel(g.key))}</div>
      ${g.items.map((p) => `
        <button class="checkin" data-nav="/c/${cid}/p/${p.id}">
          <div class="checkin-thumb">
            ${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : icon("fork", 26)}
          </div>
          <div class="checkin-main">
            <div class="checkin-title">${esc(p.title || "Sem título")}</div>
            <div class="checkin-author">
              ${avatar({ name: p.authorName, photo: p.authorPhoto }, "xs")}
              <span>${esc(p.authorName || "")}</span>
            </div>
          </div>
          <div class="checkin-time">${esc(timeLabel(p.at))}</div>
        </button>`).join("")}
    `).join("");
  };

  const unwatchChallenge = store.watchChallenge(cid, (c) => {
    if (!c) {
      postsEl.innerHTML = `<div class="empty"><strong>Desafio não encontrado</strong>Talvez você tenha saído dele.</div>`;
      return;
    }
    challenge = c;
    renderHeader();
  });
  const unwatchMembers = store.watchMembers(cid, (m) => { members = m; renderHeader(); });
  const unwatchPosts = store.watchFeed(cid, (p) => { posts = p; renderPosts(); });
  const unwatchMine = store.watchMyChallenges((list) => { myChallenges = list; });

  el.querySelector("[data-menu]").addEventListener("click", () => openMenu(myChallenges, cid));

  el.querySelector("[data-bell]").addEventListener("click", () => {
    const recent = (posts || []).slice(0, 12);
    if (!recent.length) return toast("Nada de novo por aqui.");
    sheet("Atividade recente", recent.map((p) => ({
      label: `${p.authorName} · ${p.title || "postou"} · ${relative(p.at)}`,
      value: p.id,
    }))).then((pid) => pid && navigate(`/c/${cid}/p/${pid}`));
  });

  el.querySelector("[data-more]").addEventListener("click", async () => {
    const isOwner = challenge?.ownerUid === store.uid();
    const options = [
      { label: "📊 Recap do período", value: "recap" },
      { label: "📍 Guia do grupo", value: "guide" },
      { label: "Convidar galera", value: "invite" },
      { label: "Detalhes do desafio", value: "details" },
    ];
    if (isOwner) options.push({ label: "Editar desafio", value: "edit" });
    options.push({ label: "Sair do desafio", value: "leave", danger: true });

    const choice = await sheet(challenge?.name, options);
    if (choice === "recap") navigate(`/c/${cid}/recap`);
    if (choice === "guide") navigate(`/c/${cid}/guia`);
    if (choice === "invite") navigate(`/c/${cid}/convite`);
    if (choice === "details") navigate(`/c/${cid}/detalhes`);
    if (choice === "edit") navigate(`/c/${cid}/editar`);
    if (choice === "leave") {
      if (await confirmSheet("Sair do desafio? Seus posts continuam lá.", "Sair", true)) {
        try {
          await store.leaveChallenge(cid);
          navigate("/", { replace: true });
        } catch { toastError("Não deu pra sair."); }
      }
    }
  });

  return {
    el,
    destroy: () => { unwatchChallenge(); unwatchMembers(); unwatchPosts(); unwatchMine(); },
  };
}

/* ============================================================
   Detalhes do desafio
   ============================================================ */

export function detailsView({ cid }) {
  const el = h(`
    <div class="screen">
      ${topbar({ left: backBtn(`#/c/${cid}`), title: "" })}
      <div class="screen-body" data-body>${spinner()}</div>
      ${tabbar("details", cid)}
    </div>`);

  const body = el.querySelector("[data-body]");
  let challenge = null, members = [];

  const draw = () => {
    if (!challenge) return;
    const owner = members.find((m) => m.uid === challenge.ownerUid);
    const isOwner = challenge.ownerUid === store.uid();
    const n = members.length;

    body.innerHTML = `
      <div class="page-head">
        <h1>${esc(challenge.name)}</h1>
        <div class="sub">Desde ${esc(shortDate(challenge.startDate))}</div>
      </div>
      <div class="gap-sm"></div>

      ${owner ? `
        <div style="display:flex;align-items:center;gap:14px;padding:8px 16px 12px">
          ${avatar(owner, "xl")}
          <div>
            <div style="font-size:20px;font-weight:700">${esc(owner.name)}</div>
            <div class="muted" style="font-size:16px;font-weight:600">Dono do desafio</div>
          </div>
        </div>` : ""}

      ${challenge.description ? `<div class="pad" style="font-size:18px;font-weight:600;padding-bottom:12px;white-space:pre-wrap">${esc(challenge.description)}</div>` : ""}

      <div style="display:flex;align-items:baseline;justify-content:space-between;padding:6px 16px 8px">
        <div style="font-size:20px;font-weight:800">${n} ${n === 1 ? "comilão" : "comilões"}</div>
        <button class="link-red" data-all>Todas</button>
      </div>
      <div class="avatar-row">
        ${members.map((m) => `<button data-nav="/c/${cid}/u/${m.uid}">${avatar(m, "lg")}</button>`).join("")}
      </div>
      <div class="pad muted" style="font-size:15px;font-weight:600;padding-top:6px">
        ${owner ? esc(owner.name.split(" ")[0]) + " é o dono" : ""}
      </div>

      <div class="gap"></div>
      <div class="card list-card">
        <button class="list-row" data-nav="/c/${cid}/recap">
          <span class="ico">${icon("bolt", 22)}</span><span class="label">Recap do período</span><span class="chev">${icon("chevron", 18)}</span>
        </button>
        <button class="list-row" data-nav="/c/${cid}/guia">
          <span class="ico">${icon("pin", 22)}</span><span class="label">Guia do grupo</span><span class="chev">${icon("chevron", 18)}</span>
        </button>
        <button class="list-row" data-rules>
          <span class="ico">${icon("clipboard", 22)}</span><span class="label">Regras</span><span class="chev">${icon("chevron", 18)}</span>
        </button>
        <button class="list-row" data-nav="/c/${cid}/convite">
          <span class="ico">${icon("share", 22)}</span><span class="label">Convidar</span><span class="value">${esc(challenge.code || "")}</span>
        </button>
        ${isOwner ? `
        <button class="list-row" data-nav="/c/${cid}/editar">
          <span class="ico">${icon("pencil", 22)}</span><span class="label">Editar desafio</span><span class="chev">${icon("chevron", 18)}</span>
        </button>` : ""}
        <button class="list-row danger" data-leave>
          <span class="ico">${icon("exit", 22)}</span><span class="label">Deixar</span>
        </button>
      </div>`;

    body.querySelector("[data-all]").addEventListener("click", () => {
      sheet(`${n} no desafio`, members.map((m) => ({ label: m.name, value: m.uid })))
        .then((u) => u && navigate(`/c/${cid}/u/${u}`));
    });

    body.querySelector("[data-rules]").addEventListener("click", () => {
      sheet("Como funciona", [{
        label: (challenge.description ? challenge.description + "\n\n" : "")
          + "Todo dia, cada um posta a foto de um prato.\n"
          + "Comprou vale 1 ponto, cozinhou vale 2.\n"
          + "A partir de 7 dias seguidos, tudo vale 1,5x.\n"
          + "Cada um tem 2 vale-faltas pra salvar a sequência.\n"
          + "A galera dá nota de 1 a 10 nos pratos.",
        value: null,
      }]);
    });

    body.querySelector("[data-leave]").addEventListener("click", async () => {
      if (await confirmSheet("Sair do desafio? Seus posts continuam lá.", "Sair", true)) {
        try {
          await store.leaveChallenge(cid);
          navigate("/", { replace: true });
        } catch { toastError("Não deu pra sair."); }
      }
    });
  };

  const a = store.watchChallenge(cid, (c) => { challenge = c; draw(); });
  const b = store.watchMembers(cid, (m) => { members = m; draw(); });

  return { el, destroy: () => { a(); b(); } };
}

/* ============================================================
   Editar desafio (só o dono)
   ============================================================ */

export async function editChallengeView({ cid }) {
  const challenge = await store.getChallenge(cid);
  if (!challenge) return { el: h(`<div class="empty">Desafio não encontrado.</div>`) };

  const iso = (d) => {
    const date = new Date(d?.toDate ? d.toDate() : d);
    return isNaN(date) ? "" : date.toISOString().slice(0, 10);
  };

  const el = h(`
    <div class="screen">
      ${topbar({ left: backBtn(`#/c/${cid}/detalhes`), title: "Editar desafio",
                 right: `<button class="topbar-action" data-save>Salvar</button>` })}
      <div class="screen-body no-tabbar">
        <div class="gap-sm"></div>
        <div class="card">
          <label class="field">
            <span class="field-label">Nome</span>
            <input data-name value="${esc(challenge.name)}" maxlength="60">
          </label>
          <label class="field">
            <span class="field-label">Regras / descrição</span>
            <textarea data-desc maxlength="400">${esc(challenge.description || "")}</textarea>
          </label>
        </div>
        <div class="row-2">
          <div class="card"><label class="field">
            <span class="field-label">Começa</span>
            <input type="date" data-start value="${iso(challenge.startDate)}">
          </label></div>
          <div class="card"><label class="field">
            <span class="field-label">Termina</span>
            <input type="date" data-end value="${iso(challenge.endDate)}">
          </label></div>
        </div>
      </div>
    </div>`);

  el.querySelector("[data-save]").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try {
      await store.updateChallenge(cid, {
        name: el.querySelector("[data-name]").value.trim() || challenge.name,
        description: el.querySelector("[data-desc]").value.trim(),
        startDate: new Date(el.querySelector("[data-start]").value + "T00:00:00"),
        endDate: new Date(el.querySelector("[data-end]").value + "T23:59:59"),
      });
      toast("Salvo!");
      navigate(`/c/${cid}/detalhes`);
    } catch {
      e.currentTarget.disabled = false;
      toastError("Não deu pra salvar.");
    }
  });

  return { el };
}
