import { h, esc, avatar, topbar, backBtn, tabbar, spinner, relative, toastError } from "../ui.js";
import * as store from "../store.js";

export function chatView({ cid }) {
  const el = h(`
    <div class="screen">
      ${topbar({ left: backBtn(`#/c/${cid}`), title: "Bate-papo" })}
      <div class="screen-body" style="display:flex;flex-direction:column;padding-bottom:0">
        <div class="chat-scroll" data-scroll>${spinner()}</div>
        <div class="composer-bar above-tabbar">
          <span data-my-avatar></span>
          <input data-input placeholder="Mensagem" maxlength="800">
          <button class="send" data-send>Enviar</button>
        </div>
      </div>
      ${tabbar("chat", cid)}
    </div>`);

  const scroll = el.querySelector("[data-scroll]");
  const input = el.querySelector("[data-input]");
  const sendBtn = el.querySelector("[data-send]");
  el.querySelector("[data-my-avatar]").innerHTML = avatar(store.me(), "md");

  let firstPaint = true;

  const unwatch = store.watchMessages(cid, (messages) => {
    if (!messages.length) {
      scroll.innerHTML = `<div class="empty" style="margin:auto">Silêncio total. Manda a primeira.</div>`;
      return;
    }
    const myUid = store.uid();
    // Cuidado: a bolha usa white-space: pre-wrap, então o texto não pode
    // ter nenhuma quebra de linha ou indentação do template ao redor.
    scroll.innerHTML = messages.map((m, i) => {
      const mine = m.uid === myUid;
      const sameAsPrev = i > 0 && messages[i - 1].uid === m.uid;
      const who = sameAsPrev ? "" : `<div class="who">${esc(m.name)}</div>`;
      const face = sameAsPrev || mine ? "" : avatar(m, "sm");
      return `<div class="msg ${mine ? "mine" : ""}">`
        + `<span style="width:30px;flex:0 0 30px">${face}</span>`
        + `<div class="bubble">${who}${esc(m.text)}</div>`
        + `</div>`;
    }).join("") + `<div style="height:6px"></div>`;

    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 160;
    if (firstPaint || atBottom) {
      scroll.scrollTop = scroll.scrollHeight;
      firstPaint = false;
    }
  });

  const syncSend = () => sendBtn.classList.toggle("on", input.value.trim().length > 0);
  input.addEventListener("input", syncSend);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  sendBtn.addEventListener("click", send);

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    syncSend();
    try {
      await store.sendMessage(cid, text);
      scroll.scrollTop = scroll.scrollHeight;
    } catch {
      input.value = text;
      syncSend();
      toastError("Não deu pra enviar.");
    }
  }

  return { el, destroy: unwatch };
}
