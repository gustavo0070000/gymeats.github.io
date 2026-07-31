import {
  h, esc, avatar, topbar, backBtn, spinner, sheet, confirmSheet,
  fullWhen, relative, dayKey, toDate, toast, toastError,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { navigate } from "../router.js";
import { compress, thumbnail, microThumbnail } from "../image.js";
import { PHOTO } from "../config.js";
import { pickPlace } from "./place-picker.js";

import {
  MEALS, mealById, CUISINES, cuisineById,
  formatPoints, formatMoney, formatRating, guessWinners, basePoints,
} from "../food.js";

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
              ${previewUrl ? `<img src="${previewUrl}" alt="">` : `<div style="width:100%;height:100%;display:grid;place-items:center;background:var(--track);color:var(--text-2)">${icon("camera", 30)}</div>`}
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
                <input type="date" data-day autocomplete="off" value="${dayKey(now)}" style="border:none;outline:none;background:transparent;font-size:17px;font-weight:600;width:100%">
              </div>
              <span class="ico">${icon("calendar", 22)}</span>
            </div></div>
            <div class="card"><div class="field-inline">
              <div class="field-body">
                <span class="field-label">Hora</span>
                <input type="time" data-time autocomplete="off" value="${hhmm}" style="border:none;outline:none;background:transparent;font-size:17px;font-weight:600;width:100%">
              </div>
              <span class="ico">${icon("clock", 22)}</span>
            </div></div>
          </div>

          <div class="card">
            <div class="toggle-row" data-homemade-row>
              <button class="toggle-opt active" data-homemade="0">🛒 Comprei<span>1 ponto</span></button>
              <button class="toggle-opt" data-homemade="1">👨‍🍳 Cozinhei<span>2 pontos</span></button>
            </div>
          </div>

          <div class="card">
            <button class="field-inline place-btn" data-place-pick style="width:100%;text-align:left">
              <span class="ico">${icon("pin", 22)}</span>
              <span class="field-body">
                <span class="place-name" data-place-label>Onde foi? (opcional)</span>
                <span class="place-sub hidden" data-place-sub></span>
              </span>
              <span class="chev">${icon("chevron", 18)}</span>
            </button>
          </div>

          <div class="card"><div class="field-inline">
            <span class="ico" style="font-size:20px">💸</span>
            <div class="field-body">
              <span class="field-label">Quanto custou? (opcional)</span>
              <input data-price type="number" inputmode="decimal" min="0" step="0.01" placeholder="R$ —"
                     style="border:none;outline:none;background:transparent;font-size:17px;font-weight:600;width:100%">
            </div>
          </div>
          <div class="hint-row">Fica escondido: a galera chuta o preço antes de ver.</div>
          </div>

          <div class="card">
            <div class="field-label" style="padding:14px 16px 0">Refeição</div>
            <div class="chip-wrap" data-meals>
              ${MEALS.map((m) => `<button class="chip" data-meal="${m.id}">${m.emoji} ${m.label}</button>`).join("")}
            </div>
          </div>

          <div class="card">
            <div class="field-label" style="padding:14px 16px 0">Cozinha · carimba o passaporte</div>
            <div class="chip-wrap scroll" data-cuisines>
              ${CUISINES.map((c) => `<button class="chip" data-cuisine="${c.id}">${c.emoji} ${c.label}</button>`).join("")}
            </div>
          </div>

          <div class="gap"></div>
        </div>
      </div>
      <input type="file" accept="image/*" hidden data-file>`;

    /* O Chrome restaura valores de formulário entre sessões, e o campo de
       data chegava a vir preenchido com o dia em que o formulário foi
       aberto pela última vez — foi assim que pratos publicados hoje
       acabaram gravados com data de ontem ou anteontem. Reescrever o valor
       aqui, já com o elemento no DOM, garante que ele reflita o agora. */
    const campoDia = el.querySelector("[data-day]");
    const campoHora = el.querySelector("[data-time]");
    const agora = new Date();
    campoDia.value = dayKey(agora);
    campoHora.value = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
    const diaInicial = campoDia.value;
    const horaInicial = campoHora.value;

    // tocar no ícone do card abre o seletor nativo de data/hora
    el.querySelectorAll(".field-inline .ico").forEach((ico) => {
      ico.addEventListener("click", () => {
        const field = ico.parentElement.querySelector("input");
        if (field?.showPicker) { try { field.showPicker(); return; } catch { /* segue */ } }
        field?.focus();
      });
    });

    let meal = "", cuisine = "", homemade = false, coords = null;

    const chipGroup = (container, attr, get, set) => {
      el.querySelector(container).addEventListener("click", (e) => {
        const btn = e.target.closest(`[data-${attr}]`);
        if (!btn) return;
        set(btn.dataset[attr] === get() ? "" : btn.dataset[attr]);
        el.querySelectorAll(`[data-${attr}]`).forEach((b) =>
          b.classList.toggle("active", b.dataset[attr] === get()));
      });
    };
    chipGroup("[data-meals]", "meal", () => meal, (v) => (meal = v));
    chipGroup("[data-cuisines]", "cuisine", () => cuisine, (v) => (cuisine = v));

    el.querySelector("[data-homemade-row]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-homemade]");
      if (!btn) return;
      homemade = btn.dataset.homemade === "1";
      el.querySelectorAll("[data-homemade]").forEach((b) =>
        b.classList.toggle("active", (b.dataset.homemade === "1") === homemade));
    });

    let place = "";
    const placeLabel = el.querySelector("[data-place-label]");
    const placeSub = el.querySelector("[data-place-sub]");

    const renderPlace = () => {
      placeLabel.textContent = place || "Onde foi? (opcional)";
      placeLabel.classList.toggle("filled", !!place);
      placeSub.classList.toggle("hidden", !coords);
      if (coords) placeSub.textContent = "📍 marcado no mapa";
    };

    el.querySelector("[data-place-pick]").addEventListener("click", async () => {
      const picked = await pickPlace({ name: place, coords });
      if (!picked) return;
      place = picked.name;
      coords = picked.coords;
      renderPlace();
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
        const [photo, thumb, micro] = await Promise.all([
          compress(capturedFile, { maxEdge: PHOTO.maxEdge, maxBytes: PHOTO.maxBytes }),
          thumbnail(capturedFile),
          microThumbnail(capturedFile),   // é esta que vai na notificação
        ]);
        const day = campoDia.value || dayKey(new Date());
        const time = campoHora.value || "12:00";
        // Só conta como escolha deliberada se a pessoa realmente mexeu.
        const dateEditada = day !== diaInicial || time !== horaInicial;
        await store.createPost(cid, {
          dateEditada,
          title,
          description: el.querySelector("[data-desc]").value.trim(),
          mealType: meal,
          cuisine,
          homemade,
          place,
          coords,
          price: parseFloat(el.querySelector("[data-price]").value),
          photo, thumb, micro,
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

  let post = null, comments = [], fullPhoto = null, drawn = false, members = [], challenge = null;
  const nameOf = (u) => members.find((m) => m.uid === u)?.name || "alguém";

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

  /* Nota de 1 a 10: só quem não é o autor vota. */
  const ratingBlock = () => {
    const isMine = post.uid === store.uid();
    const mine = (post.ratings || {})[store.uid()];
    const avg = post.ratingAvg;
    const count = post.ratingCount || 0;

    const header = `
      <div class="rate-head">
        <div>
          <div class="rate-avg">${formatRating(avg)}<span>/10</span></div>
          <div class="rate-count">${count === 0 ? "sem notas ainda"
            : `${count} ${count === 1 ? "nota" : "notas"}`}</div>
        </div>
        ${isMine ? `<div class="rate-hint">Prato seu — quem dá nota é a galera</div>` : ""}
      </div>`;

    if (isMine) return `<div class="card rate-card">${header}</div>`;

    return `
      <div class="card rate-card">
        ${header}
        <div class="rate-scale" data-rate>
          ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `
            <button class="rate-dot ${mine === n ? "on" : ""} ${mine && n <= mine ? "under" : ""}"
                    data-score="${n}">${n}</button>`).join("")}
        </div>
        <div class="hint-row">${mine ? "Toque de novo na sua nota pra desfazer." : "Dá tua nota nesse prato."}</div>
      </div>`;
  };

  /* Palpite de preço: o valor só aparece depois que você chuta. */
  const priceBlock = () => {
    if (!post.price) return "";
    const myUid = store.uid();
    const isMine = post.uid === myUid;
    const guesses = post.guesses || {};
    const myGuess = guesses[myUid];
    const revealed = isMine || myGuess != null;
    const campeoes = new Set(guessWinners(guesses, post.price).map((g) => g.uid));

    if (!revealed) {
      return `
        <div class="card guess-card">
          <div class="guess-title">💸 Quanto você acha que custou?</div>
          <div class="guess-row">
            <input data-guess type="number" inputmode="decimal" min="0" step="0.01" placeholder="R$ —">
            <button class="btn btn-primary" data-guess-send style="width:auto;padding:12px 22px">Chutar</button>
          </div>
          <div class="hint-row">O preço real só aparece depois do seu chute.</div>
        </div>`;
    }

    const list = Object.entries(guesses)
      .sort((a, b) => Math.abs(a[1] - post.price) - Math.abs(b[1] - post.price));

    return `
      <div class="card guess-card">
        <div class="guess-title">💸 Custou <strong>${formatMoney(post.price)}</strong></div>
        ${list.length ? `<div class="guess-list">
          ${list.map(([u, v]) => `
            <div class="guess-item ${campeoes.has(u) ? "win" : ""}">
              <span class="who">${u === myUid ? "Você" : esc(nameOf(u))}</span>
              <span class="val">${formatMoney(v)}</span>
              <span class="off">${campeoes.has(u)
                ? "🏆"
                : `${v > post.price ? "+" : "−"}${formatMoney(Math.abs(v - post.price)).replace("R$", "").trim()}`}</span>
            </div>`).join("")}
        </div>
        ${campeoes.size > 1 ? `<div class="hint-row">Empate: ${campeoes.size} palpites na mesma distância.</div>` : ""}`
        : `<div class="hint-row">Ninguém chutou ainda.</div>`}
      </div>`;
  };

  const draw = () => {
    if (!post) return;
    const isMine = post.uid === store.uid();
    const meal = mealById(post.mealType);
    const cuisine = cuisineById(post.cuisine);
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
          <div class="when">${esc(fullWhen(store.postTime(post)))}</div>
        </div>
        <button class="topbar-btn" data-profile>${icon("details", 22)}</button>
      </div>
      <div class="post-title">${esc(post.title || "")}</div>
      ${post.description ? `<div class="post-desc">${esc(post.description)}</div>` : '<div style="height:10px"></div>'}

      <div class="meta-chips">
        <span class="meta-chip">${post.homemade ? "👨‍🍳 Cozinhou" : "🛒 Comprou"}
          <b class="pts">+${formatPoints(basePoints(post.homemade))}</b></span>
        ${cuisine ? `<span class="meta-chip">${cuisine.emoji} ${cuisine.label}</span>` : ""}
        ${meal ? `<span class="meta-chip">${meal.emoji} ${meal.label}</span>` : ""}
        ${post.place || post.coords
          ? `<span class="meta-chip">${icon("pin", 16)} ${esc(post.place || "Marcado no mapa")}</span>`
          : ""}
        ${Object.entries(reactions).map(([emoji, uids]) => `
          <button class="meta-chip" data-react="${esc(emoji)}"
                  style="${uids.includes(store.uid()) ? "box-shadow:0 0 0 1.5px var(--red)" : ""}">
            ${emoji} ${uids.length}
          </button>`).join("")}
        <button class="meta-chip icon-only" data-add-react>${icon("emojiPlus", 20)}</button>
      </div>

      ${ratingBlock()}
      ${priceBlock()}

      <div style="border-top:1px solid var(--divider);padding-top:6px" data-comments></div>
      <div style="height:12px"></div>`;

    drawComments();

    body.querySelector("[data-profile]").addEventListener("click", () => navigate(`/c/${cid}/u/${post.uid}`));

    body.querySelector("[data-rate]")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-score]");
      if (!btn) return;
      store.ratePost(cid, pid, Number(btn.dataset.score))
        .catch((err) => toastError(err?.message || "Não deu pra dar nota."));
    });

    body.querySelector("[data-guess-send]")?.addEventListener("click", async (e) => {
      const input = body.querySelector("[data-guess]");
      const value = parseFloat(input.value);
      if (!isFinite(value) || value < 0) return toastError("Bota um valor.");
      e.currentTarget.disabled = true;
      try {
        await store.guessPrice(cid, pid, value);
      } catch (err) {
        e.currentTarget.disabled = false;
        toastError(err?.message || "Não deu pra chutar.");
      }
    });

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
      const souDono = challenge?.ownerUid === store.uid();
      const options = [{ label: "Ver perfil de " + post.authorName.split(" ")[0], value: "profile" }];
      if (isMine) options.push({ label: "Editar prato", value: "edit" });
      // O dono do desafio arruma o local de prato alheio sem mexer no resto.
      if (!isMine && souDono) options.push({ label: "📍 Ajustar localização", value: "place" });
      if (isMine) options.push({ label: "Apagar prato", value: "delete", danger: true });

      const choice = await sheet(post.title, options);
      if (choice === "profile") navigate(`/c/${cid}/u/${post.uid}`);
      if (choice === "edit") navigate(`/c/${cid}/p/${pid}/editar`);
      if (choice === "place") {
        const picked = await pickPlace({ name: post.place, coords: post.coords });
        if (picked) {
          try {
            await store.updatePostPlace(cid, post, picked);
            toast("Localização atualizada!");
          } catch (err) {
            toastError(err?.code === "permission-denied"
              ? "Republique as regras do Firestore pra liberar isso."
              : "Não deu pra salvar a localização.");
          }
        }
      }
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
  const c = store.watchMembers(cid, (list) => { members = list; if (post) draw(); });
  const d = store.watchChallenge(cid, (ch) => { challenge = ch; });

  return { el, destroy: () => { a(); b(); c(); d(); } };
}

/* ============================================================
   Editar um prato já publicado
   ============================================================ */

export async function editPostView({ cid, pid }) {
  const post = await new Promise((resolve) => {
    const stop = store.watchPost(cid, pid, (p) => { stop(); resolve(p); });
  });

  if (!post) {
    return { el: h(`<div class="empty"><strong>Prato não encontrado</strong></div>`) };
  }
  if (post.uid !== store.uid()) {
    return { el: h(`<div class="empty"><strong>Só quem postou pode editar</strong></div>`) };
  }

  const when = store.postTime(post);
  const p2 = (n) => String(n).padStart(2, "0");
  const dayValue = `${when.getFullYear()}-${p2(when.getMonth() + 1)}-${p2(when.getDate())}`;
  const timeValue = `${p2(when.getHours())}:${p2(when.getMinutes())}`;

  const el = h(`
    <div class="screen">
      ${topbar({
        left: `<button class="topbar-btn" data-back>${icon("back")}</button>`,
        title: "Editar prato",
        right: `<button class="topbar-action" data-save>Salvar</button>`,
      })}
      <div class="screen-body no-tabbar">
        <div class="gap-sm"></div>

        <div class="card">
          <label class="field">
            <span class="field-label">Título</span>
            <input data-title value="${esc(post.title || "")}" maxlength="80">
          </label>
          <label class="field">
            <span class="field-label">Descrição</span>
            <textarea data-desc maxlength="600">${esc(post.description || "")}</textarea>
          </label>
        </div>

        <div class="row-2">
          <div class="card"><div class="field-inline">
            <div class="field-body">
              <span class="field-label">Dia</span>
              <input type="date" data-day value="${dayValue}"
                     style="border:none;outline:none;background:transparent;font-size:17px;font-weight:600;width:100%">
            </div>
            <span class="ico">${icon("calendar", 22)}</span>
          </div></div>
          <div class="card"><div class="field-inline">
            <div class="field-body">
              <span class="field-label">Hora</span>
              <input type="time" data-time value="${timeValue}"
                     style="border:none;outline:none;background:transparent;font-size:17px;font-weight:600;width:100%">
            </div>
            <span class="ico">${icon("clock", 22)}</span>
          </div></div>
        </div>

        <div class="card">
          <div class="toggle-row" data-homemade-row>
            <button class="toggle-opt ${post.homemade ? "" : "active"}" data-homemade="0">🛒 Comprei<span>1 ponto</span></button>
            <button class="toggle-opt ${post.homemade ? "active" : ""}" data-homemade="1">👨‍🍳 Cozinhei<span>2 pontos</span></button>
          </div>
        </div>

        <div class="card">
          <button class="field-inline place-btn" data-place-pick style="width:100%;text-align:left">
            <span class="ico">${icon("pin", 22)}</span>
            <span class="field-body">
              <span class="place-name ${post.place ? "filled" : ""}" data-place-label>${esc(post.place || "Onde foi? (opcional)")}</span>
              <span class="place-sub ${post.coords ? "" : "hidden"}" data-place-sub>📍 marcado no mapa</span>
            </span>
            <span class="chev">${icon("chevron", 18)}</span>
          </button>
        </div>

        <div class="card"><div class="field-inline">
          <span class="ico" style="font-size:20px">💸</span>
          <div class="field-body">
            <span class="field-label">Quanto custou?</span>
            <input data-price type="number" inputmode="decimal" min="0" step="0.01"
                   value="${post.price ?? ""}" placeholder="R$ —"
                   style="border:none;outline:none;background:transparent;font-size:17px;font-weight:600;width:100%">
          </div>
        </div></div>

        <div class="card">
          <div class="field-label" style="padding:14px 16px 0">Refeição</div>
          <div class="chip-wrap" data-meals>
            ${MEALS.map((m) => `<button class="chip ${m.id === post.mealType ? "active" : ""}" data-meal="${m.id}">${m.emoji} ${m.label}</button>`).join("")}
          </div>
        </div>

        <div class="card">
          <div class="field-label" style="padding:14px 16px 0">Cozinha</div>
          <div class="chip-wrap scroll" data-cuisines>
            ${CUISINES.map((c) => `<button class="chip ${c.id === post.cuisine ? "active" : ""}" data-cuisine="${c.id}">${c.emoji} ${c.label}</button>`).join("")}
          </div>
        </div>

        <div class="gap"></div>
      </div>
    </div>`);

  let meal = post.mealType || "";
  let cuisine = post.cuisine || "";
  let homemade = !!post.homemade;
  let place = post.place || "";
  let coords = post.coords || null;

  const chipGroup = (sel, attr, get, set) => {
    el.querySelector(sel).addEventListener("click", (e) => {
      const btn = e.target.closest(`[data-${attr}]`);
      if (!btn) return;
      set(btn.dataset[attr] === get() ? "" : btn.dataset[attr]);
      el.querySelectorAll(`[data-${attr}]`).forEach((b) =>
        b.classList.toggle("active", b.dataset[attr] === get()));
    });
  };
  chipGroup("[data-meals]", "meal", () => meal, (v) => (meal = v));
  chipGroup("[data-cuisines]", "cuisine", () => cuisine, (v) => (cuisine = v));

  el.querySelector("[data-homemade-row]").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-homemade]");
    if (!btn) return;
    homemade = btn.dataset.homemade === "1";
    el.querySelectorAll("[data-homemade]").forEach((b) =>
      b.classList.toggle("active", (b.dataset.homemade === "1") === homemade));
  });

  el.querySelector("[data-place-pick]").addEventListener("click", async () => {
    const picked = await pickPlace({ name: place, coords });
    if (!picked) return;
    place = picked.name;
    coords = picked.coords;
    const label = el.querySelector("[data-place-label]");
    label.textContent = place || "Onde foi? (opcional)";
    label.classList.toggle("filled", !!place);
    el.querySelector("[data-place-sub]").classList.toggle("hidden", !coords);
  });

  el.querySelectorAll(".field-inline .ico").forEach((ico) => {
    ico.addEventListener("click", () => {
      const field = ico.parentElement.querySelector("input");
      if (field?.showPicker) { try { field.showPicker(); return; } catch { /* segue */ } }
      field?.focus();
    });
  });

  el.querySelector("[data-back]").addEventListener("click", () => navigate(`/c/${cid}/p/${pid}`));

  el.querySelector("[data-save]").addEventListener("click", async (e) => {
    const title = el.querySelector("[data-title]").value.trim();
    if (!title) return toastError("O prato precisa de um título.");
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Salvando…";
    try {
      const day = el.querySelector("[data-day]").value;
      const time = el.querySelector("[data-time]").value || "12:00";
      await store.updatePost(cid, post, {
        title,
        description: el.querySelector("[data-desc]").value.trim(),
        mealType: meal,
        cuisine,
        homemade,
        place,
        coords,
        price: parseFloat(el.querySelector("[data-price]").value),
        at: new Date(`${day}T${time}:00`),
      });
      toast("Prato atualizado!");
      navigate(`/c/${cid}/p/${pid}`, { replace: true });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Salvar";
      toastError("Não deu pra salvar.");
      console.error(err);
    }
  });

  return { el };
}
