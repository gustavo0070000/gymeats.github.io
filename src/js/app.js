import { route, setNotFound, startRouter, navigate, render, path } from "./router.js";
import { watchAuth, resolveRedirect, configured } from "./firebase.js";
import * as store from "./store.js";
import { h } from "./ui.js";

import {
  loginView, homeView, newChallengeView, joinView, inviteView, accountView, lastChallenge,
} from "./views/home.js";
import { feedView, detailsView, editChallengeView } from "./views/feed.js";
import { composeView, postView, editPostView } from "./views/post.js";
import { rankingsView } from "./views/rankings.js";
import { chatView } from "./views/chat.js";
import { profileView } from "./views/profile.js";
import { guideView } from "./views/guide.js";
import { recapView } from "./views/recap.js";
import { datesView } from "./views/dates.js";
import { notificationsView } from "./views/notifications.js";

const appEl = document.getElementById("app");

let user = null;          // usuário do Firebase Auth
let authReady = false;

/* Só deixa passar quem está logado; senão joga pro login. */
const guard = (view) => (params) => (user ? view(params) : loginView());

/* ---------- Rotas ---------- */

route("/", () => {
  if (!user) return loginView();
  const last = lastChallenge();
  if (last && path() === "/") {
    navigate(`/c/${last}`, { replace: true });
    return { el: h('<div class="boot"><div class="boot-mark"></div></div>') };
  }
  return homeView();
});

route("/desafios", guard(homeView));
route("/novo", guard(newChallengeView));
route("/entrar", guard(joinView));
route("/conta", guard(accountView));
route("/notificacoes", guard(notificationsView));

route("/c/:cid", guard(feedView));
route("/c/:cid/detalhes", guard(detailsView));
route("/c/:cid/classificacoes", guard(rankingsView));
route("/c/:cid/bate-papo", guard(chatView));
route("/c/:cid/novo", guard(composeView));
route("/c/:cid/convite", guard(inviteView));
route("/c/:cid/editar", guard(editChallengeView));
route("/c/:cid/guia", guard(guideView));
route("/c/:cid/recap", guard(recapView));
route("/c/:cid/datas", guard(datesView));
route("/c/:cid/p/:pid", guard(postView));
route("/c/:cid/p/:pid/editar", guard(editPostView));
route("/c/:cid/u/:uid", guard(profileView));

setNotFound(() => ({
  el: h(`<div class="screen"><div class="screen-body no-tabbar">
    <div class="empty"><div class="big">🤔</div><strong>Página não encontrada</strong>
    <div style="margin-top:14px"><button class="btn btn-white" data-nav="/">Voltar pro início</button></div></div>
  </div></div>`),
}));

/* ---------- Boot ---------- */

async function boot() {
  if (!configured) {
    appEl.innerHTML = "";
    appEl.appendChild(loginView().el);
    return;
  }

  await resolveRedirect();

  watchAuth(async (u) => {
    const wasLogged = !!user;
    user = u;

    if (u) {
      try { await store.ensureUserDoc(); } catch { /* offline: segue com o cache */ }
    }

    if (!authReady) {
      authReady = true;
      startRouter(appEl);
      return;
    }

    // logou ou deslogou depois do boot
    if (!!u !== wasLogged) {
      if (u) navigate("/", { replace: true });
      else { location.hash = "#/"; render(); }
    }
  });
}

boot();

/* ---------- PWA ---------- */

if ("serviceWorker" in navigator) {
  addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");

      // Versão nova disponível: assume na hora e recarrega uma vez só.
      // Sem isso dá pra ficar preso numa versão antiga sem perceber, e
      // fica impossível saber qual código está rodando de verdade.
      reg.addEventListener("updatefound", () => {
        const novo = reg.installing;
        novo?.addEventListener("statechange", () => {
          if (novo.state === "installed" && navigator.serviceWorker.controller) {
            novo.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });

      let recarregando = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (recarregando) return;
        recarregando = true;
        location.reload();
      });

      // procura versão nova ao abrir e sempre que o app volta pro primeiro plano
      reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    } catch { /* sem service worker, o app funciona igual */ }
  });
}
