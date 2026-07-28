import { route, setNotFound, startRouter, navigate, render, path } from "./router.js";
import { watchAuth, resolveRedirect, configured } from "./firebase.js";
import * as store from "./store.js";
import { h } from "./ui.js";

import {
  loginView, homeView, newChallengeView, joinView, inviteView, accountView, lastChallenge,
} from "./views/home.js";
import { feedView, detailsView, editChallengeView } from "./views/feed.js";
import { composeView, postView } from "./views/post.js";
import { rankingsView } from "./views/rankings.js";
import { chatView } from "./views/chat.js";
import { profileView } from "./views/profile.js";

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

route("/c/:cid", guard(feedView));
route("/c/:cid/detalhes", guard(detailsView));
route("/c/:cid/classificacoes", guard(rankingsView));
route("/c/:cid/bate-papo", guard(chatView));
route("/c/:cid/novo", guard(composeView));
route("/c/:cid/convite", guard(inviteView));
route("/c/:cid/editar", guard(editChallengeView));
route("/c/:cid/p/:pid", guard(postView));
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
  addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
