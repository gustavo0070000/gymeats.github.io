import {
  h, esc, avatar, topbar, backBtn, spinner, sheet, confirmSheet,
  fullWhen, relative, dayKey, toDate, toast, toastError,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { navigate } from "../router.js";
import { compress, thumbnail } from "../image.js";
import { PHOTO } from "../config.js";

const MEALS = [
  { id: "cafe", label: "Café", emoji: "☕" },
  { id: "almoco", label: "Almoço", emoji: "🍽️" },
  { id: "lanche", label: "Lanche", emoji: "🥪" },
  { id: "janta", label: "Janta", emoji: "🍝" },
  { id: "sobremesa", label: "Sobremesa", emoji: "🍰" },
];
const mealById = (id) => MEALS.find((m) => m.id === id);

const EMOJIS = ["🔥", "😍", "🤤", "👏", "😂", "🤮", "💀", "🐐"];

/* ============================================================
   Novo prato — câmera → confirmação → formulário
   ============================================================ */

export function composeView({ cid }) {
  const el = h(`<div data-root></div>`);
  let stream = null;
  let facing = "environment";
  let capturedFile = null;

  const stopStream = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  /* ---------- passo 1: câmera ---------- */

  async function showCamera() {
    stopStream();
    el.innerHTML = `
      <div class="camera">
        <div class="camera-top"><button class="side" data-exit>${icon("close", 26)}</button></div>
        <div class="camera-stage">
          <video autoplay playsinline muted data-video></video>
          <div class="hint hidden" data-hint></div>
        </div>
        <div class="camera-controls">
          <button class="side" data-flip-placeholder>${icon("flashOff", 22)}</button>
          <button class="shutter" data-shoot></button>
          <button class="side" data-flip>${icon("flip", 22)}</button>
        </div>
        <div class="camera-foot">
          <button data-gallery>${icon("image", 20)} Da galeria</button>
          <button data-native>${icon("camera", 20)} Do dispositivo</button>
        </div>
      </div>
      <input type="file" accept="image/*" hidden data-file>
      <input type="file" accept="image/*" capture="environment" hidden data-file-cam>`;

    const video = el.querySelector("[data-video]");
    const hint = el.querySelector("[data-hint]");

    el.querySelector("[data-exit]").addEventListener("click", () => {
      stopStream();
      navigate(`/c/${cid}`);
    });
    el.querySelector("[data-gallery]").addEventListener("click", () => el.querySelector("[data-file]").click());
    el.querySelector("[data-native]").addEventListener("click", () => el.querySelector("[data-file-cam]").click());
    el.querySelectorAll("[data-file], [data-file-cam]").forEach((input) => {
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        input.value = "";
        if (file) { stopStream(); showPreview(file); }
      });
    });

    el.querySelector("[data-flip]").addEventListener("click", () => {
      facing = facing === "environment" ? "user" : "environment";
      showCamera();
    });

    el.querySelector("[data-shoot]").addEventListener("click", () => {
      if (!stream) return el.querySelector("[data-file-cam]").click();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return toastError("Não consegui capturar a foto.");
        stopStream();
        showPreview(new File([blob], "prato.jpg", { type: blob.type || "image/jpeg" }));
      }, "image/jpeg", 0.92);
    });

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 } },
        audio: false,
      });
      video.srcObject = stream;
    } catch {
      video.classList.add("hidden");
      hint.classList.remove("hidden");
      hint.innerHTML = "Não consegui abrir a câmera aqui.<br>Use “Do dispositivo” ou “Da galeria” logo abaixo.";
    }
  }

  /* ---------- passo 2: confirmar a foto ---------- */

  function showPreview(file) {
    const url = URL.createObjectURL(file);
    el.innerHTML = `
      <div class="camera">
        <div class="camera-top"><button class="side" data-cancel>${icon("close", 26)}</button></div>
        <div class="camera-stage"><img src="${url}" alt=""></div>
        <div class="camera-controls" style="padding:22px 60px">
          <button class="side" data-retake>${icon("close", 26)}</button>
          <button class="side" data-ok>${icon("check", 28)}</button>
        </div>
        <div class="camera-foot"></div>
      </div>`;

    const back = () => { URL.revokeObjectURL(url); showCamera(); };
    el.querySelector("[data-cancel]").addEventListener("click", back);
    el.querySelector("[data-retake]").addEventListener("click", back);
    el.querySelector("[data-ok]").addEventListener("click", () => {
      capturedFile = file;
      URL.revokeObjectURL(url);
      showForm();
    });
  }

  /* ---------- passo 3: formulário ---------- */

  async function showForm() {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const previewUrl = capturedFile ? URL.createObjectURL(capturedFile) : "";
    const challenge = await store.getChallenge(cid);
    const user = store.me();

    el.innerHTML = `
      <div class="screen">
        ${topbar({
          left: `<button class="topbar-btn" data-back>${icon("back")}</button>`,
          title: "Novo prato",
          right: `<button class="topbar-action" data-publish>Publicar</button>`,
        })}
        <div class="screen-body no-tabbar">
          <div class="compose-head">
            <div class="compose-side">
              <div class="avatar-stack">
                ${avatar(user, "sm")}
                ${challenge?.bannerThumb ? `<div class="avatar sm"><img src="${esc(challenge.bannerThumb)}" alt=""></div>` : ""}
              </div>
              <div class="cs-text">Em ${esc(challenge?.name || "1 desafio")}</div>
            </div>

            <div class="compose-photo">
              ${previewUrl ? `<img src="${previewUrl}" alt="">` : `<div style="width:100%;height:100%;display:grid;place-items:center;background:#DDD;color:#888">${icon("camera", 30)}</div>`}
              <button class="edit-btn" data-change>${icon("pencil", 20)}</button>
            </div>

            <div class="compose-side">
              <div class="valid-badge ${capturedFile ? "" : "off"}">${icon("checkSmall", 18)}</div>
              <div>${capturedFile ? "Válido" : "Sem foto"}</div>
            </div>
          </div>

          <div class="card">
            <label class="field">
              <input data-title placeholder="Título" maxlength="80" autocomplete="off">
            </label>
            <label class="field">
              <textarea data-desc placeholder="Descrição (opcional)" maxlength="600"></textarea>
            </label>
          </div>

          <div class="row-2">
            <div class="card"><div class="field-inline">
              <div class="field-body">
                <span class="field-label">Dia</span>
                <input type="date" data-day value="${dayKey(now)}" style="border:none;outline:none;background:transparent;font-size:17px;font-weight:600;width:100%">
              </div>
              <span class="ico">${icon("calendar", 22)}</span>
            </div></div>
            <div class="card"><div class="field-inline">
              <div class="field-body">
                <span class="field-label">Hora</span>
                <input type="time" data-time value="${hhmm}" style="border:none;outline:none;background:transparent;font-size:17px;font-weight:600;width:100%">
              </div>
              <span class="ico">${icon("clock", 22)}</span>
            </div></div>
          </div>

          <div class="card"><div class="field-inline">
            <span class="ico">${icon("pin", 22)}</span>
            <div class="field-body">
              <input data-place placeholder="Onde foi? (opcional)" maxlength="60"
                     style="border:none;outline:none;background:transparent;font-size:17px;font-weight:600;width:100%">
            </div>
          </div></div>

          <div class="card">
            <div class="field-label" style="padding:14px 16px 0">Refeição</div>
            <div class="chip-wrap" data-meals>
              ${MEALS.map((m) => `<button class="chip" data-meal="${m.id}">${m.emoji} ${m.label}</button>`).join("")}
            </div>
          </div>

          <div class="gap"></div>
        </div>
      </div>
      <input type="file" accept="image/*" hidden data-file>`;

    // tocar no ícone do card abre o seletor nativo de data/hora
    el.querySelectorAll(".field-inline .ico").forEach((ico) => {
      ico.addEventListener("click", () => {
        const field = ico.parentElement.querySelector("input");
        if (field?.showPicker) { try { field.showPicker(); return; } catch { /* segue */ } }
        field?.focus();
      });
    });

    let meal = "";
    el.querySelector("[data-meals]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-meal]");
      if (!btn) return;
      meal = btn.dataset.meal === meal ? "" : btn.dataset.meal;
      el.querySelectorAll("[data-meal]").forEach((b) =>
        b.classList.toggle("active", b.dataset.meal === meal));
    });

    el.querySelector("[data-back]").addEventListener("click", () => showCamera());
    el.querySelector("[data-change]").addEventListener("click", () => showCamera());

    el.querySelector("[data-publish]").addEventListener("click", async (e) => {
      const title = el.querySelector("[data-title]").value.trim();
      if (!capturedFile) return toastError("Sem foto não vale — bota o prato aí.");
      if (!title) return toastError("Dá um nome pro prato.");

      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Enviando…";
      try {
        const [photo, thumb] = await Promise.all([
          compress(capturedFile, { maxEdge: PHOTO.maxEdge, maxBytes: PHOTO.maxBytes }),
          thumbnail(capturedFile),
        ]);
        const day = el.querySelector("[data-day]").value;
        const time = el.querySelector("[data-time]").value || "12:00";
        await store.createPost(cid, {
          title,
          description: el.querySelector("[data-desc]").value.trim(),
          mealType: meal,
          place: el.querySelector("[data-place]").value.trim(),
          photo, thumb,
          at: new Date(`${day}T${time}:00`),
        });
        toast("Prato postado!");
        navigate(`/c/${cid}`, { replace: true });
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Publicar";
        toastError("Não deu pra publicar. Tenta de novo.");
        console.error(err);
      }
    });

    el.querySelector("[data-file]").addEventListener("change", (ev) => {
      const file = ev.target.files?.[0];
      ev.target.value = "";
      if (file) { capturedFile = file; showForm(); }
    });
  }

  showCamera();

  return { el, destroy: stopStream };
}

/* ============================================================
   Post aberto
   ============================================================ */

export function postView({ cid, pid }) {
  const el = h(`
    <div class="screen">
      ${topbar({
        left: `<button class="topbar-btn" data-back>${icon("back")}</button>`,
        title: "",
        right: `<button class="topbar-btn" data-more>${icon("dots")}</button>`,
      })}
      <div class="screen-body no-tabbar" style="padding-bottom:0" data-body>${spinner()}</div>
      <div class="composer-bar hidden" data-composer>
        <span data-my-avatar></span>
        <input data-input placeholder="Aa" maxlength="500">
        <button class="send" data-send>Enviar</button>
      </div>
    </div>`);

  const body = el.querySelector("[data-body]");
  const composer = el.querySelector("[data-composer]");
  const input = el.querySelector("[data-input]");
  const sendBtn = el.querySelector("[data-send]");

  let post = null, comments = [], fullPhoto = null, drawn = false;

  el.querySelector("[data-back]").addEventListener("click", () => navigate(`/c/${cid}`));
  el.querySelector("[data-my-avatar]").innerHTML = avatar(store.me(), "md");

  const drawComments = () => {
    const box = body.querySelector("[data-comments]");
    if (!box) return;
    box.innerHTML = comments.length
      ? comments.map((c) => `
          <div class="comment" data-comment="${c.id}" data-owner="${c.uid}">
            ${avatar(c, "md")}
            <div class="body">
              <div class="name">${esc(c.name)}</div>
              <div class="txt">${esc(c.text)}</div>
              <div class="when">${esc(relative(c.at))}</div>
            </div>
          </div>`).join("")
      : `<div class="empty" style="padding:26px 30px">Ninguém comentou ainda. Solta o verbo.</div>`;
  };

  const draw = () => {
    if (!post) return;
    const isMine = post.uid === store.uid();
    const meal = mealById(post.mealType);
    const reactions = post.reactions || {};

    body.innerHTML = `
      <div style="background:#000">
        ${fullPhoto || post.thumb
          ? `<img class="post-hero" src="${esc(fullPhoto || post.thumb)}" alt="" style="${fullPhoto ? "" : "filter:blur(6px)"}">`
          : ""}
      </div>
      <div class="post-author">
        ${avatar({ name: post.authorName, photo: post.authorPhoto }, "md")}
        <div class="who">
          <div class="name">${esc(post.authorName)}</div>
          <div class="when">${esc(fullWhen(post.at))}</div>
        </div>
        <button class="topbar-btn" data-profile>${icon("details", 22)}</button>
      </div>
      <div class="post-title">${esc(post.title || "")}</div>
      ${post.description ? `<div class="post-desc">${esc(post.description)}</div>` : '<div style="height:10px"></div>'}

      <div class="meta-chips">
        ${meal ? `<span class="meta-chip">${meal.emoji} ${meal.label}</span>` : ""}
        ${post.place ? `<span class="meta-chip">${icon("pin", 16)} ${esc(post.place)}</span>` : ""}
        ${Object.entries(reactions).map(([emoji, uids]) => `
          <button class="meta-chip" data-react="${esc(emoji)}"
                  style="${uids.includes(store.uid()) ? "box-shadow:0 0 0 1.5px var(--red)" : ""}">
            ${emoji} ${uids.length}
          </button>`).join("")}
        <button class="meta-chip icon-only" data-add-react>${icon("emojiPlus", 20)}</button>
      </div>

      <div style="border-top:1px solid var(--divider);padding-top:6px" data-comments></div>
      <div style="height:12px"></div>`;

    drawComments();

    body.querySelector("[data-profile]").addEventListener("click", () => navigate(`/c/${cid}/u/${post.uid}`));

    body.querySelector("[data-add-react]").addEventListener("click", async () => {
      const chosen = await sheet("Reagir", EMOJIS.map((e) => ({ label: e, value: e })));
      if (chosen) store.toggleReaction(cid, pid, chosen).catch(() => toastError("Não deu pra reagir."));
    });
    body.querySelectorAll("[data-react]").forEach((b) =>
      b.addEventListener("click", () => store.toggleReaction(cid, pid, b.dataset.react).catch(() => {})));

    // carrega a foto em tamanho cheio só uma vez
    if (!fullPhoto && post.photoId && !drawn) {
      drawn = true;
      store.loadPhoto(post.photoId).then((data) => {
        if (!data) return;
        fullPhoto = data;
        const img = body.querySelector(".post-hero");
        if (img) { img.src = data; img.style.filter = ""; }
      });
    }

    composer.classList.remove("hidden");

    el.querySelector("[data-more]").onclick = async () => {
      const options = [{ label: "Ver perfil de " + post.authorName.split(" ")[0], value: "profile" }];
      if (isMine) options.push({ label: "Apagar prato", value: "delete", danger: true });
      const choice = await sheet(post.title, options);
      if (choice === "profile") navigate(`/c/${cid}/u/${post.uid}`);
      if (choice === "delete" && await confirmSheet("Apagar esse prato?", "Apagar")) {
        try {
          await store.deletePost(cid, post);
          toast("Apagado.");
          navigate(`/c/${cid}`, { replace: true });
        } catch { toastError("Não deu pra apagar."); }
      }
    };
  };

  // apagar comentário próprio no toque longo
  body.addEventListener("click", async (e) => {
    const node = e.target.closest("[data-comment]");
    if (!node || node.dataset.owner !== store.uid()) return;
    if (await confirmSheet("Apagar seu comentário?", "Apagar")) {
      store.deleteComment(cid, pid, node.dataset.comment).catch(() => toastError("Não deu pra apagar."));
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
      await store.addComment(cid, pid, text);
    } catch {
      input.value = text;
      syncSend();
      toastError("Não deu pra comentar.");
    }
  }

  const a = store.watchPost(cid, pid, (p) => {
    if (!p) {
      body.innerHTML = `<div class="empty"><strong>Prato não encontrado</strong>Talvez tenha sido apagado.</div>`;
      composer.classList.add("hidden");
      return;
    }
    post = p;
    draw();
  });
  const b = store.watchComments(cid, pid, (c) => { comments = c; drawComments(); });

  return { el, destroy: () => { a(); b(); } };
}
