import { h, esc, topbar, backBtn, spinner, relative, dayLabel, dayKey, toDate } from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { navigate } from "../router.js";

const TIPOS = {
  posts:    { emoji: "🍽️", label: "Prato novo" },
  comments: { emoji: "💬", label: "Comentário" },
  ratings:  { emoji: "⭐", label: "Nota" },
  recaps:   { emoji: "📊", label: "Recap" },
};

/** Histórico do que as Cloud Functions dispararam neste desafio. */
export function sentView({ cid }) {
  const el = h(`
    <div class="screen">
      ${topbar({ left: backBtn(`#/c/${cid}/editar`), title: "Notificações enviadas" })}
      <div class="screen-body no-tabbar" data-body>${spinner()}</div>
    </div>`);

  const body = el.querySelector("[data-body]");

  const unwatch = store.watchNotificationLog(cid, (linhas) => {
    if (!linhas.length) {
      body.innerHTML = `<div class="empty">
        <div class="big">🔕</div><strong>Nada disparado ainda</strong>
        Assim que alguém postar, comentar ou dar nota, o envio aparece aqui —
        com quantas pessoas receberam.
      </div>`;
      return;
    }

    const hoje = linhas.filter((l) => dayKey(toDate(l.at) || new Date(0)) === dayKey());
    const entregasHoje = hoje.reduce((s, l) => s + (l.enviadas || 0), 0);
    const semDestino = linhas.filter((l) => !l.alvos).length;

    // Um grupo por dia, igual ao feed.
    const porDia = new Map();
    linhas.forEach((l) => {
      const chave = dayKey(toDate(l.at) || new Date());
      if (!porDia.has(chave)) porDia.set(chave, []);
      porDia.get(chave).push(l);
    });

    body.innerHTML = `
      <div class="card"><div class="stats-row" style="padding:16px 8px">
        <div class="stat"><div class="v">${hoje.length}</div><div class="k">hoje</div></div>
        <div class="stat"><div class="v">${entregasHoje}</div><div class="k">entregas hoje</div></div>
        <div class="stat"><div class="v">${linhas.length}</div><div class="k">no total</div></div>
      </div></div>

      ${semDestino ? `<div class="notice">
        ${semDestino} ${semDestino === 1 ? "envio não teve destinatário" : "envios não tiveram destinatário"}.
        O motivo de cada um aparece na linha. "Sem aparelho registrado" quer dizer
        que a pessoa precisa abrir <strong>Minha conta → Notificações</strong> e ligar por lá.
      </div>` : ""}

      ${[...porDia.entries()].map(([dia, itens]) => `
        <div class="section-label">${esc(dayLabel(dia))}</div>
        <div class="card" style="padding:4px 0">
          ${itens.map((l) => {
            const t = TIPOS[l.tipo] || { emoji: "🔔", label: l.tipo || "Aviso" };
            const entregue = l.enviadas || 0;
            const alvos = l.alvos || 0;
            return `
              <button class="sent-row" ${l.url ? `data-nav="${esc(l.url.replace(/^\/#/, ""))}"` : ""}>
                <span class="sent-emoji">${t.emoji}</span>
                <span class="sent-main">
                  <span class="sent-title">${esc(l.title || t.label)}</span>
                  ${l.body ? `<span class="sent-body">${esc(l.body)}</span>` : ""}
                  <span class="sent-meta">
                    ${alvos
                      ? `${entregue} de ${alvos} ${alvos === 1 ? "aparelho" : "aparelhos"}`
                      : `nenhum destinatário${l.motivo ? ` — ${esc(l.motivo)}` : ""}`}
                    ${l.falhas ? ` · ${l.falhas} ${l.falhas === 1 ? "falha" : "falhas"}` : ""}
                    ${l.limpos ? ` · ${l.limpos} token limpo` : ""}
                    ${l.erro ? ` · ${esc(l.erro)}` : ""}
                  </span>
                </span>
                <span class="sent-when">${esc(relative(l.at))}</span>
              </button>`;
          }).join("")}
        </div>`).join("")}

      <div class="pad hint-row">
        "Aparelhos" conta celulares e navegadores registrados, não pessoas —
        quem usa o app no celular e no computador conta duas vezes. Token que
        o Firebase recusa é apagado na hora e aparece como "limpo".
      </div>
      <div class="gap"></div>`;
  });

  return { el, destroy: unwatch };
}
