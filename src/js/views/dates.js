import {
  h, esc, topbar, backBtn, spinner, toast, toastError, confirmSheet,
  MONTHS, timeLabel,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { navigate } from "../router.js";

const carimbo = (d) => {
  if (!d) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} `
    + `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * Mostra, prato a prato, a data que veio do formulário e a que o servidor
 * carimbou na publicação. Quando as duas brigam, é relógio ou fuso errado
 * no aparelho de quem postou — e daqui dá pra corrigir.
 */
export function datesView({ cid }) {
  const el = h(`
    <div class="screen">
      ${topbar({ left: backBtn(`#/c/${cid}/editar`), title: "Datas dos pratos" })}
      <div class="screen-body no-tabbar" data-body>${spinner()}</div>
    </div>`);

  const body = el.querySelector("[data-body]");
  let linhas = [];

  async function carregar() {
    body.innerHTML = spinner();
    try {
      linhas = await store.auditPosts(cid);
    } catch (err) {
      body.innerHTML = `<div class="empty"><strong>Não deu pra ler os pratos</strong>${esc(err?.message || "")}</div>`;
      return;
    }
    desenhar();
  }

  function desenhar() {
    const tortos = linhas.filter((l) => l.suspeito);
    const agora = new Date();

    body.innerHTML = `
      <div class="pad hint-row" style="padding-top:10px">
        <strong style="color:var(--text)">Escolhida</strong> é a data que o
        formulário mandou; <strong style="color:var(--text)">servidor</strong> é
        a hora real em que o prato foi publicado. Quando as duas brigam, o
        relógio ou o fuso do aparelho de quem postou estava errado.
      </div>

      <div class="card list-card">
        <div class="list-row"><span class="label">Agora, neste aparelho</span>
          <span class="value">${carimbo(agora)}</span></div>
        <div class="list-row"><span class="label">Fuso deste aparelho</span>
          <span class="value">${esc(Intl.DateTimeFormat().resolvedOptions().timeZone || "?")}</span></div>
        <div class="list-row"><span class="label">Pratos analisados</span>
          <span class="value">${linhas.length}</span></div>
        <div class="list-row"><span class="label">Com data suspeita</span>
          <span class="value" style="color:${tortos.length ? "var(--red)" : "inherit"}">${tortos.length}</span></div>
      </div>

      ${tortos.length ? `
        <div class="pad">
          <button class="btn btn-primary" data-fix>
            ${icon("refresh", 20)} Corrigir ${tortos.length} ${tortos.length === 1 ? "prato" : "pratos"}
          </button>
        </div>
        <div class="pad hint-row">
          A data escolhida é substituída pela do servidor, e o placar é
          recalculado. As fotos, notas e comentários não são tocados.
        </div>` : `
        <div class="pad hint-row" style="color:var(--text)">
          Nenhuma data destoando. Se algum prato ainda aparece no dia errado,
          me mostre esta tela.
        </div>`}

      <div class="section-label left">Todos os pratos</div>
      <div class="card" style="padding:4px 0">
        ${linhas.map((l) => `
          <div class="date-row ${l.suspeito ? "bad" : ""}">
            <div class="date-main">
              <div class="date-title">${esc(l.title || "Sem título")}</div>
              <div class="date-author">${esc(l.author || "")}</div>
            </div>
            <div class="date-cols">
              <div><span>escolhida</span><b>${carimbo(l.at)}</b></div>
              <div><span>servidor</span><b>${carimbo(l.createdAt)}</b></div>
              <div><span>aparece em</span><b>${esc(l.dayKeyDoAt || l.dayKeySalvo || "—")}</b></div>
            </div>
          </div>`).join("")}
      </div>
      <div class="gap"></div>`;

    body.querySelector("[data-fix]")?.addEventListener("click", async (e) => {
      const quantos = tortos.length;
      if (!await confirmSheet(
        `Corrigir a data de ${quantos} ${quantos === 1 ? "prato" : "pratos"} usando a hora do servidor?`,
        "Corrigir", false)) return;

      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Corrigindo…";
      try {
        const n = await store.repairDates(cid, tortos.map((l) => l.id));
        toast(`${n} ${n === 1 ? "prato corrigido" : "pratos corrigidos"}.`);
        await carregar();
      } catch (err) {
        btn.disabled = false;
        toastError(err?.code === "permission-denied"
          ? "Só o dono do desafio pode corrigir datas de outras pessoas."
          : "Não deu pra corrigir.");
      }
    });
  }

  carregar();
  return { el };
}
