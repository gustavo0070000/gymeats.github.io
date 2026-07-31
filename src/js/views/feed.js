import {
  h, esc, avatar, topbar, backBtn, tabbar, spinner, sheet, confirmSheet,
  dayLabel, timeLabel, relative, shortDate, dayKey, toast, toastError,
} from "../ui.js";
import { formatPoints } from "../food.js";
import { compress } from "../image.js";
import { PHOTO } from "../config.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { plateLink } from "./plates.js";
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

  /* O banner é desenhado uma vez só: reescrevê-lo a cada snapshot fazia a
     imagem piscar toda vez que alguém postava. */
  let bannerKey = null;

  const renderHeader = () => {
    if (!challenge) return;
    titleEl.textContent = challenge.name;

    const key = challenge.bannerThumb || "empty:" + challenge.name;
    if (bannerKey !== key) {
      bannerKey = key;
      headerEl.innerHTML = `
        ${challenge.bannerThumb
          ? `<div class="banner"><img src="${esc(challenge.bannerThumb)}" alt=""></div>`
          : `<div class="banner empty">${esc(challenge.name)}</div>`}
        <div class="standings-strip" data-strip></div>
        <div class="feed-counter" data-counter></div>
        <pre class="feed-debug" data-debug style="font-size:11px;margin:6px;padding:6px;background:var(--fill);color:var(--text);white-space:pre-wrap;max-height:160px;overflow:auto"></pre>`;
    }

    // O placar mostra PONTOS: cozinhar vale mais que comprar, e o bônus de
    // sequência entra na conta. "Dias ativos" ficava parado quando alguém
    // postava o segundo prato do mesmo dia.
    const rows = store.standings(members, "all", challenge, "points");
    const leader = rows[0];
    const mine = rows.find((r) => r.uid === store.uid());

    const cell = (person, value, label) => `
      <div class="standings-cell">
        ${avatar(person, "md")}
        <div><div class="num">${formatPoints(value)}</div><div class="lbl">${label}</div></div>
      </div>`;

    const strip = headerEl.querySelector("[data-strip]");
    if (strip) {
      strip.innerHTML = `
        ${leader ? cell(leader, leader.points, "Líder") : ""}
        ${mine ? cell(mine, mine.points, "Você") : ""}`;
      strip.setAttribute("data-nav", `/c/${cid}/classificacoes`);
    }
    // Diagnostic: show top rows for live inspection when debugging issues
    // const debugEl = headerEl.querySelector("[data-debug]");
    // if (debugEl) {
    //   try {
    //     const top = rows.slice(0, 5).map((r) => ({
    //       uid: r.uid,
    //       name: r.name,
    //       points: r.points,
    //       count: r.count,
    //       position: r.position,
    //       total: r.total,
    //       lastPostAt: r.lastPostAt ? (r.lastPostAt.toDate ? r.lastPostAt.toDate().toISOString() : r.lastPostAt) : null,
    //     }));
    //     debugEl.textContent = JSON.stringify(top, null, 2);
    //   } catch (e) {
    //     debugEl.textContent = String(e);
    //   }
    // }
    renderCounter();
  };

  /* Linha fina embaixo da barra: essa sim mexe a cada prato postado. */
  const renderCounter = () => {
    const el2 = headerEl.querySelector("[data-counter]");
    if (!el2 || posts === null) return;
    const today = dayKey();
    const todayCount = posts.filter((p) => store.postDay(p) === today).length;
    const mine = members.find((m) => m.uid === store.uid());
    const total = members.reduce((s, m) => s + (m.total || 0), 0);

    el2.innerHTML = `
      <span>${todayCount} ${todayCount === 1 ? "prato hoje" : "pratos hoje"}</span>
      <span>·</span>
      <span>${total} no desafio</span>
      ${mine ? `<span>·</span><span>🔥 ${store.memberStreak(mine)}</span>` : ""}`;
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

    // Um grupo por dia, na ordem em que os dias aparecem. Antes o grupo era
    // "corrida de iguais consecutivos", então qualquer post fora de ordem
    // fazia "Hoje" e "Ontem" se repetirem várias vezes na tela.
    const byDay = new Map();
    posts.forEach((p) => {
      const key = store.postDay(p);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(p);
    });
    const groups = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, items]) => ({ key, items: items.sort(store.byNewest) }));

    postsEl.innerHTML = groups.map((g) => `
      <button class="section-label day-jump" data-nav="${plateLink(cid, { periodo: "all", dia: g.key })}">${esc(dayLabel(g.key))}</button>
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
          <div class="checkin-time">${esc(timeLabel(store.postTime(p)))}</div>
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
  const unwatchPosts = store.watchFeed(cid, (p) => { posts = p; renderPosts(); renderCounter(); });
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
      { label: "🍽️ Todos os pratos", value: "plates" },
      { label: "📍 Guia do grupo", value: "guide" },
      { label: "Convidar galera", value: "invite" },
      { label: "Detalhes do desafio", value: "details" },
    ];
    if (isOwner) options.push({ label: "Editar desafio", value: "edit" });
    options.push({ label: "Sair do desafio", value: "leave", danger: true });

    const choice = await sheet(challenge?.name, options);
    if (choice === "recap") navigate(`/c/${cid}/recap`);
    if (choice === "plates") navigate(`/c/${cid}/pratos?periodo=month`);
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
          + "Comprou vale 1 ponto; cozinhou vale 2 pontos.\n"
          + "A partir de 7 dias seguidos, ambos valem 1,5 ponto.\n"
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
        <div class="compose-head" style="justify-content:center">
          <div class="compose-photo" style="width:220px;aspect-ratio:16/9" data-banner>
            ${challenge.bannerThumb
              ? `<img src="${esc(challenge.bannerThumb)}" alt="">`
              : `<div style="width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#E0472F,#C43C26);color:#fff">${icon("image", 30)}</div>`}
            <button class="edit-btn" data-pick>${icon("pencil", 20)}</button>
          </div>
        </div>
        <div class="center hint-row" style="padding-top:18px">Toque no lápis pra trocar a capa</div>

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

        <div class="gap"></div>
        <div class="card list-card">
          <button class="list-row" data-nav="/c/${cid}/enviadas">
            <span class="ico">${icon("bell", 22)}</span>
            <span class="label">Notificações enviadas</span>
            <span class="chev">${icon("chevron", 18)}</span>
          </button>
          <button class="list-row" data-nav="/c/${cid}/datas">
            <span class="ico">${icon("calendar", 22)}</span>
            <span class="label">Datas dos pratos</span>
            <span class="chev">${icon("chevron", 18)}</span>
          </button>
          <button class="list-row" data-recalc>
            <span class="ico">${icon("refresh", 22)}</span>
            <span class="label">Recalcular placar</span>
          </button>
        </div>
        <div class="pad hint-row">
          Refaz pontos, passaporte e contagens a partir dos pratos já postados.
          Use se o desafio começou antes da pontuação existir.
        </div>
      </div>
      <input type="file" accept="image/*" hidden data-file>
    </div>`);

  el.querySelector("[data-recalc]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.querySelector(".label").textContent = "Recalculando…";
    try {
      const n = await store.recalcStandings(cid);
      toast(`Placar refeito para ${n} ${n === 1 ? "pessoa" : "pessoas"}.`);
    } catch {
      toastError("Não deu pra recalcular.");
    }
    btn.disabled = false;
    btn.querySelector(".label").textContent = "Recalcular placar";
  });

  /* ---- troca da capa ---- */
  const fileInput = el.querySelector("[data-file]");
  const bannerBox = el.querySelector("[data-banner]");
  let newThumb = null, newFull = null;

  el.querySelector("[data-pick]").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      newFull = await compress(file, { maxEdge: 1080, maxBytes: PHOTO.maxBytes });
      newThumb = await compress(file, { maxEdge: 480, maxBytes: 60 * 1024 });
      const old = bannerBox.querySelector("img, div:not(.edit-btn)");
      const img = document.createElement("img");
      img.src = newThumb;
      old?.replaceWith(img);
    } catch {
      toastError("Não consegui usar essa imagem.");
    }
  });

  el.querySelector("[data-save]").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try {
      const patch = {
        name: el.querySelector("[data-name]").value.trim() || challenge.name,
        description: el.querySelector("[data-desc]").value.trim(),
        startDate: new Date(el.querySelector("[data-start]").value + "T00:00:00"),
        endDate: new Date(el.querySelector("[data-end]").value + "T23:59:59"),
      };
      if (newThumb) {
        patch.bannerThumb = newThumb;
        patch.bannerPhotoId = await store.savePhoto(newFull, cid);
      }
      await store.updateChallenge(cid, patch);
      toast("Salvo!");
      navigate(`/c/${cid}/detalhes`);
    } catch {
      e.currentTarget.disabled = false;
      toastError("Não deu pra salvar.");
    }
  });

  return { el };
}
