import { h, esc, toast, toastError, avatar, shortDate, topbar, backBtn, spinner } from "../ui.js";
import { icon } from "../icons.js";
import { configured, loginWithGoogle, logout } from "../firebase.js";
import * as store from "../store.js";
import { navigate } from "../router.js";
import { compress } from "../image.js";
import { PHOTO, APP_NAME, APP_VERSION } from "../config.js";

const LAST_KEY = "gymeats:last-challenge";
export const lastChallenge = () => localStorage.getItem(LAST_KEY);
export const rememberChallenge = (cid) => localStorage.setItem(LAST_KEY, cid);

/* ============================================================
   Login
   ============================================================ */

export function loginView() {
  const el = h(`
    <div class="login">
      <div class="mark">${icon("fork", 46)}</div>
      <h1>${APP_NAME}</h1>
      <p>Todo dia, todo mundo posta o prato.<br>Quem vacilar aparece no fim da tabela.</p>
      ${configured ? `
        <button class="btn btn-google" data-login>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6.1C12.3 13.7 17.6 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.3z"/>
            <path fill="#FBBC05" d="M10.4 28.2a14.6 14.6 0 0 1 0-8.4l-7.8-6.1a23.9 23.9 0 0 0 0 20.6l7.8-6.1z"/>
            <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2 15.4-5.6l-7.5-5.8c-2.1 1.4-4.8 2.2-7.9 2.2-6.4 0-11.7-4.2-13.6-9.9l-7.8 6.1C6.5 42.1 14.6 47.5 24 47.5z"/>
          </svg>
          Entrar com Google
        </button>
        <div class="fine">A gente só usa seu nome e foto do Google.</div>
      ` : `
        <div class="notice" style="text-align:left">
          <strong>Falta configurar o Firebase.</strong><br>
          Cole as chaves do seu projeto em <code>src/js/config.js</code>.
          O passo a passo está no <code>README.md</code>.
        </div>
      `}
    </div>`);

  el.querySelector("[data-login]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await loginWithGoogle();
    } catch (err) {
      btn.disabled = false;
      toastError(err?.code === "auth/unauthorized-domain"
        ? "Domínio não autorizado no Firebase Auth."
        : "Não deu pra entrar. Tenta de novo.");
    }
  });

  return { el };
}

/* ============================================================
   Menu lateral (hamburger) — troca de desafio e opções da conta
   ============================================================ */

export function openMenu(challenges, currentId) {
  return new Promise((resolve) => {
    const root = document.getElementById("modal-root");
    const list = challenges.map((c) => `
      <button class="sheet-item" data-go="/c/${c.id}" style="text-align:left;display:flex;align-items:center;gap:12px">
        <span style="width:8px;height:8px;border-radius:50%;background:${c.id === currentId ? "var(--red)" : "transparent"}"></span>
        <span style="flex:1">${esc(c.name)}</span>
      </button>`).join("");

    const node = h(`
      <div class="sheet-backdrop">
        <div class="sheet">
          <div class="sheet-title">Seus desafios</div>
          <div class="sheet-group">${list || '<div class="sheet-item muted">Nenhum ainda</div>'}</div>
          <div class="sheet-group">
            <button class="sheet-item" data-go="/novo">Criar desafio</button>
            <button class="sheet-item" data-go="/entrar">Entrar com código</button>
          </div>
          <div class="sheet-group">
            <button class="sheet-item" data-go="/conta">Minha conta</button>
            <button class="sheet-item danger" data-logout>Sair</button>
          </div>
          <div class="sheet-group"><button class="sheet-item" data-cancel>Cancelar</button></div>
        </div>
      </div>`);

    const close = () => { node.remove(); resolve(); };
    node.addEventListener("click", async (e) => {
      if (e.target === node || e.target.hasAttribute("data-cancel")) return close();
      const go = e.target.closest("[data-go]");
      if (go) { close(); return navigate(go.dataset.go); }
      if (e.target.closest("[data-logout]")) { close(); await logout(); location.hash = "#/"; }
    });
    root.appendChild(node);
  });
}

/* ============================================================
   Home — sem desafio nenhum: onboarding
   ============================================================ */

export function homeView() {
  const el = h(`
    <div class="screen">
      ${topbar({ right: `<button class="topbar-btn" data-menu>${icon("dots")}</button>` })}
      <div class="screen-body no-tabbar">
        <h1 class="page-title">Seus desafios</h1>
        <div data-list>${spinner()}</div>
      </div>
    </div>`);

  const listEl = el.querySelector("[data-list]");
  let challenges = [];

  const unwatch = store.watchMyChallenges((items) => {
    challenges = items;
    if (!items.length) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="big">🍽️</div>
          <strong>Nada por aqui ainda</strong>
          Crie um desafio e chame a galera, ou entre num que já existe com o código de convite.
        </div>
        <div class="pad">
          <button class="btn btn-primary" data-nav="/novo">${icon("plus", 20)} Criar desafio</button>
          <div class="gap-sm"></div>
          <button class="btn btn-white" data-nav="/entrar">Entrar com um código</button>
        </div>`;
      return;
    }

    listEl.innerHTML = items.map((c) => `
      <button class="challenge-card" data-nav="/c/${c.id}">
        <div class="cover">${c.bannerThumb ? `<img src="${esc(c.bannerThumb)}" alt="">` : ""}</div>
        <div class="body">
          <div class="t">${esc(c.name)}</div>
          <div class="m">${(c.memberUids || []).length} ${(c.memberUids || []).length === 1 ? "participante" : "participantes"} · desde ${esc(shortDate(c.startDate))}</div>
        </div>
      </button>`).join("") + `
      <div class="pad" style="margin-top:8px">
        <button class="btn btn-white" data-nav="/novo">${icon("plus", 20)} Criar outro desafio</button>
        <div class="gap-sm"></div>
        <button class="btn btn-ghost" data-nav="/entrar">Entrar com um código</button>
      </div>`;
  });

  el.querySelector("[data-menu]").addEventListener("click", () => openMenu(challenges, null));

  return { el, destroy: unwatch };
}

/* ============================================================
   Criar desafio
   ============================================================ */

export function newChallengeView() {
  const today = new Date();
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  const iso = (d) => d.toISOString().slice(0, 10);

  const el = h(`
    <div class="screen">
      ${topbar({
        left: backBtn(),
        title: "Novo desafio",
        right: `<button class="topbar-action" data-save>Criar</button>`,
      })}
      <div class="screen-body no-tabbar">
        <div class="compose-head" style="justify-content:center">
          <div class="compose-photo" style="width:200px;aspect-ratio:16/9" data-banner>
            <div style="width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#E0472F,#C43C26);color:#fff">${icon("image", 30)}</div>
            <button class="edit-btn" data-pick>${icon("pencil", 20)}</button>
          </div>
        </div>
        <div class="gap-sm"></div>

        <div class="card">
          <label class="field">
            <span class="field-label">Nome do desafio</span>
            <input data-name placeholder="Ex.: Janta de junho" maxlength="60" autocomplete="off">
          </label>
          <label class="field">
            <span class="field-label">Descrição (opcional)</span>
            <textarea data-desc placeholder="As regras da brincadeira" maxlength="400" style="min-height:70px"></textarea>
          </label>
        </div>

        <div class="row-2">
          <div class="card">
            <label class="field">
              <span class="field-label">Começa</span>
              <input type="date" data-start value="${iso(today)}">
            </label>
          </div>
          <div class="card">
            <label class="field">
              <span class="field-label">Termina</span>
              <input type="date" data-end value="${iso(in30)}">
            </label>
          </div>
        </div>

        <div class="pad muted" style="font-size:14px;line-height:1.5;padding-top:6px">
          Depois de criar, você recebe um código de convite pra mandar no grupo.
        </div>
      </div>
      <input type="file" accept="image/*" hidden data-file>
    </div>`);

  const fileInput = el.querySelector("[data-file]");
  const bannerBox = el.querySelector("[data-banner]");
  let bannerThumb = null, bannerFull = null;

  el.querySelector("[data-pick]").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      bannerFull = await compress(file, { maxEdge: 1080, maxBytes: PHOTO.maxBytes });
      bannerThumb = await compress(file, { maxEdge: 480, maxBytes: 60 * 1024 });
      bannerBox.querySelector("div").outerHTML = `<img src="${bannerThumb}" alt="">`;
    } catch {
      toastError("Não consegui usar essa imagem.");
    }
    fileInput.value = "";
  });

  el.querySelector("[data-save]").addEventListener("click", async (e) => {
    const name = el.querySelector("[data-name]").value.trim();
    if (!name) return toastError("Dá um nome pro desafio.");

    const start = new Date(el.querySelector("[data-start]").value + "T00:00:00");
    const end = new Date(el.querySelector("[data-end]").value + "T23:59:59");
    if (!(start < end)) return toastError("A data de fim tem que ser depois do começo.");

    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Criando…";
    try {
      const cid = await store.createChallenge({
        name,
        description: el.querySelector("[data-desc]").value.trim(),
        startDate: start,
        endDate: end,
        bannerThumb,
        bannerPhoto: bannerFull,
      });
      rememberChallenge(cid);
      navigate(`/c/${cid}/convite`, { replace: true });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Criar";
      toastError(err?.message || "Não deu pra criar o desafio.");
    }
  });

  return { el };
}

/* ============================================================
   Entrar com código
   ============================================================ */

export function joinView() {
  const el = h(`
    <div class="screen">
      ${topbar({ left: backBtn(), title: "Entrar num desafio" })}
      <div class="screen-body no-tabbar">
        <div class="gap"></div>
        <div class="card">
          <input class="code-box" data-code placeholder="ABC123" maxlength="8"
                 autocapitalize="characters" autocomplete="off" spellcheck="false"
                 style="border:none;outline:none;background:transparent;width:100%">
        </div>
        <div class="pad muted center" style="font-size:15px;padding:4px 32px 0">
          Peça o código pra quem criou o desafio.
        </div>
        <div class="gap"></div>
        <div class="pad"><button class="btn btn-primary" data-join>Entrar</button></div>
      </div>
    </div>`);

  const input = el.querySelector("[data-code]");
  input.addEventListener("input", () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  // link de convite: #/entrar?c=ABC123
  const fromLink = new URLSearchParams(location.hash.split("?")[1] || "").get("c");
  if (fromLink) input.value = fromLink.toUpperCase();
  else setTimeout(() => input.focus(), 120);

  el.querySelector("[data-join]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const cid = await store.joinByCode(input.value);
      rememberChallenge(cid);
      toast("Bem-vindo ao desafio!");
      navigate(`/c/${cid}`, { replace: true });
    } catch (err) {
      btn.disabled = false;
      toastError(err?.message || "Código inválido.");
    }
  });

  return { el };
}

/* ============================================================
   Tela de convite (logo após criar)
   ============================================================ */

export async function inviteView({ cid }) {
  const challenge = await store.getChallenge(cid);
  const link = `${location.origin}${location.pathname}#/entrar?c=${challenge?.code || ""}`;

  const el = h(`
    <div class="screen">
      ${topbar({ left: backBtn(`#/c/${cid}`), title: "Convidar" })}
      <div class="screen-body no-tabbar">
        <div class="gap"></div>
        <div class="page-head">
          <h1>${esc(challenge?.name || "")}</h1>
          <div class="sub">Manda esse código pra galera</div>
        </div>
        <div class="gap-sm"></div>
        <div class="card"><div class="code-box">${esc(challenge?.code || "??????")}</div></div>
        <div class="pad">
          <button class="btn btn-primary" data-share>${icon("share", 20)} Compartilhar convite</button>
          <div class="gap-sm"></div>
          <button class="btn btn-white" data-copy>${icon("copy", 20)} Copiar código</button>
          <div class="gap-sm"></div>
          <button class="btn btn-ghost" data-nav="/c/${cid}">Ir pro desafio</button>
        </div>
      </div>
    </div>`);

  el.querySelector("[data-share]").addEventListener("click", async () => {
    const text = `Bora pro desafio "${challenge?.name}" no GymEats! Código: ${challenge?.code}\n${link}`;
    if (navigator.share) {
      try { await navigator.share({ title: "GymEats", text }); return; } catch { /* cancelou */ }
    }
    await navigator.clipboard?.writeText(text);
    toast("Convite copiado!");
  });

  el.querySelector("[data-copy]").addEventListener("click", async () => {
    await navigator.clipboard?.writeText(challenge?.code || "");
    toast("Código copiado!");
  });

  return { el };
}

/* ============================================================
   Minha conta
   ============================================================ */

export function accountView() {
  const el = h(`
    <div class="screen">
      ${topbar({ left: backBtn(), title: "Minha conta" })}
      <div class="screen-body no-tabbar" data-body>${spinner()}</div>
      <input type="file" accept="image/*" hidden data-file>
    </div>`);

  const body = el.querySelector("[data-body]");
  const fileInput = el.querySelector("[data-file]");

  const unwatch = store.watchUser((user) => {
    if (!user) return;
    body.innerHTML = `
      <div class="gap"></div>
      <div class="profile-head">
        ${avatar(user, "hero")}
        <button class="btn btn-ghost" data-photo style="margin-top:6px">Trocar foto</button>
      </div>
      <div class="card">
        <label class="field">
          <span class="field-label">Como você aparece</span>
          <input data-name value="${esc(user.name || "")}" maxlength="40">
        </label>
      </div>
      <div class="pad"><button class="btn btn-primary" data-save>Salvar</button></div>
      <div class="gap"></div>
      <div class="card list-card">
        <button class="list-row" data-refresh-app>
          <span class="ico">${icon("refresh", 22)}</span>
          <span class="label">Forçar atualização do app</span>
        </button>
        <button class="list-row danger" data-logout>
          <span class="ico">${icon("exit", 22)}</span><span class="label">Sair da conta</span>
        </button>
      </div>
      <div class="pad hint-row" style="padding-top:8px">
        Use se o app parecer travado numa versão antiga. Limpa o cache e
        recarrega — nenhum dado dos desafios é perdido.
      </div>
      <div class="pad center muted" style="font-size:13px;padding-top:10px">
        ${APP_NAME} ${APP_VERSION}
      </div>`;

    body.querySelector("[data-photo]").addEventListener("click", () => fileInput.click());
    body.querySelector("[data-save]").addEventListener("click", async (e) => {
      const name = body.querySelector("[data-name]").value.trim();
      if (!name) return toastError("O nome não pode ficar vazio.");
      e.currentTarget.disabled = true;
      try {
        await store.updateProfile({ name });
        toast("Salvo!");
      } catch { toastError("Não deu pra salvar."); }
      e.currentTarget.disabled = false;
    });
    body.querySelector("[data-refresh-app]").addEventListener("click", async (e) => {
      e.currentTarget.querySelector(".label").textContent = "Atualizando…";
      try {
        // Só o casco do app é descartado; os dados vivem no Firestore.
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
        await Promise.all(regs.map((r) => r.unregister()));
      } catch { /* segue e recarrega mesmo assim */ }
      location.reload();
    });

    body.querySelector("[data-logout]").addEventListener("click", async () => {
      await logout();
      location.hash = "#/";
    });
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const photo = await compress(file, {
        maxEdge: PHOTO.avatarEdge, maxBytes: PHOTO.avatarBytes, square: true,
      });
      await store.updateProfile({ photo });
      toast("Foto atualizada!");
    } catch { toastError("Não consegui usar essa imagem."); }
    fileInput.value = "";
  });

  return { el, destroy: unwatch };
}
