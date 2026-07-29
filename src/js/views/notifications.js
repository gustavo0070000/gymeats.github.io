import { h, esc, topbar, backBtn, spinner, toast, toastError } from "../ui.js";
import { icon } from "../icons.js";
import * as push from "../push.js";
import * as store from "../store.js";

const MOTIVOS = {
  "sem-chave": "Falta cadastrar a chave do Web Push no projeto. Veja o README.",
  "sem-suporte": "Este navegador não aceita notificações. No iPhone, precisa ser iOS 16.4 ou mais novo e com o app instalado na tela de início.",
  "negada": "Você bloqueou as notificações. Libere nas configurações do site no navegador.",
  "sem-token": "O navegador não devolveu um registro válido. Tente de novo.",
  "sem-login": "Entre na sua conta primeiro.",
  "erro": "Deu erro ao registrar. Tente de novo daqui a pouco.",
};

export function notificationsView() {
  const el = h(`
    <div class="screen">
      ${topbar({ left: backBtn("#/conta"), title: "Notificações" })}
      <div class="screen-body no-tabbar" data-body>${spinner()}</div>
    </div>`);

  const body = el.querySelector("[data-body]");
  let prefs = { ...push.DEFAULT_PREFS };
  let ligado = false;
  let unwatch = null;

  async function desenhar() {
    const permissao = push.permission();
    const suportado = await push.supported();
    const naTelaInicial = matchMedia("(display-mode: standalone)").matches;
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    body.innerHTML = `
      <div class="gap-sm"></div>
      <div class="card notif-hero">
        <div class="notif-icon ${ligado ? "on" : ""}">${icon("bell", 30)}</div>
        <div class="notif-state">${ligado ? "Notificações ligadas" : "Notificações desligadas"}</div>
        <div class="notif-sub">
          ${ligado
            ? "Este aparelho vai receber os avisos que estiverem marcados abaixo."
            : "Ligue pra saber quando a galera postar, comentar ou dar nota."}
        </div>
        <div class="pad" style="width:100%;padding-top:14px">
          ${ligado
            ? `<button class="btn btn-white" data-off>Desligar neste aparelho</button>`
            : `<button class="btn btn-primary" data-on>${icon("bell", 20)} Ligar notificações</button>`}
        </div>
      </div>

      ${!suportado ? `<div class="notice">
        Este navegador não aceita notificações.
        ${iOS && !naTelaInicial
          ? "No iPhone é preciso <strong>adicionar o app à Tela de Início</strong> e abrir por lá — no Safari comum não funciona."
          : ""}
      </div>` : ""}

      ${suportado && permissao === "denied" ? `<div class="notice">
        As notificações estão <strong>bloqueadas</strong> pra este site. Libere nas
        configurações do navegador (cadeado ao lado do endereço → Notificações) e
        volte aqui.
      </div>` : ""}

      ${iOS && !naTelaInicial && suportado ? `<div class="notice">
        No iPhone, notificação só chega com o app <strong>instalado na Tela de Início</strong>.
        Use o botão de compartilhar → Adicionar à Tela de Início.
      </div>` : ""}

      <div class="section-label left">O que você quer receber</div>
      <div class="card list-card" data-prefs>
        ${push.PREF_LABELS.map((p) => `
          <button class="list-row" data-pref="${p.id}">
            <span class="label">
              ${esc(p.label)}
              <span class="pref-hint">${esc(p.hint)}</span>
            </span>
            <span class="switch ${prefs[p.id] ? "on" : ""}"><i></i></span>
          </button>`).join("")}
      </div>
      <div class="pad hint-row">
        Vale pra todos os seus desafios. As escolhas são conferidas na hora
        do envio, então desligar aqui já para de chegar.
      </div>
      <div class="gap"></div>`;

    body.querySelector("[data-on]")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Ligando…";
      const r = await push.enable();
      if (r.ok) {
        ligado = true;
        toast("Pronto! Este aparelho vai receber notificações.");
        desenhar();
      } else {
        btn.disabled = false;
        btn.innerHTML = `${icon("bell", 20)} Ligar notificações`;
        toastError(MOTIVOS[r.reason] || "Não deu pra ligar.");
        desenhar();
      }
    });

    body.querySelector("[data-off]")?.addEventListener("click", async () => {
      await push.disable();
      ligado = false;
      toast("Este aparelho não recebe mais notificações.");
      desenhar();
    });

    body.querySelector("[data-prefs]").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-pref]");
      if (!btn) return;
      const id = btn.dataset.pref;
      prefs = { ...prefs, [id]: !prefs[id] };
      btn.querySelector(".switch").classList.toggle("on", prefs[id]);
      try {
        await push.savePrefs(prefs);
      } catch {
        toastError("Não deu pra salvar a preferência.");
      }
    });
  }

  unwatch = store.watchUser(async (user) => {
    if (user?.notify) prefs = { ...push.DEFAULT_PREFS, ...user.notify };
    ligado = await push.registered();
    desenhar();
  });

  return { el, destroy: () => unwatch?.() };
}
