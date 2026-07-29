/**
 * Cloud Functions do GymEats — só notificações.
 *
 * O Firestore dispara estas funções sozinho quando alguém posta, comenta
 * ou dá nota. Os recaps rodam por agendamento.
 *
 * Custo: as invocações cabem folgado no free tier (2 milhões/mês). Um
 * grupo de 8 amigos gera algumas centenas por dia. maxInstances está
 * baixo de propósito, pra um bug nunca virar conta.
 */

const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

setGlobalOptions({ region: "southamerica-east1", maxInstances: 5 });

initializeApp();
const db = getFirestore();
const fcm = getMessaging();

const FUSO = "America/Sao_Paulo";
const PADRAO = { posts: true, comments: true, ratings: true, recaps: true };

/* ============================================================
   Envio
   ============================================================ */

/** Tokens de um usuário, junto com a preferência dele. */
async function destinatario(uid, tipo) {
  const perfil = await db.doc(`users/${uid}`).get();
  const prefs = { ...PADRAO, ...(perfil.data()?.notify || {}) };
  if (!prefs[tipo]) return [];

  const tokens = await db.collection(`users/${uid}/pushTokens`).get();
  return tokens.docs
    .map((d) => ({ uid, docId: d.id, token: d.data().token }))
    .filter((t) => t.token);
}

/** Junta os tokens de várias pessoas, respeitando as preferências. */
async function destinatarios(uids, tipo) {
  const listas = await Promise.all(uids.map((uid) => destinatario(uid, tipo)));
  return listas.flat();
}

/**
 * Manda a notificação. Usa só `data` — quem monta o texto e o ícone é o
 * service worker do app, senão o navegador desenharia sozinho.
 * Token recusado pelo Firebase é apagado na hora.
 */
async function enviar(alvos, payload, registro = null) {
  if (!alvos.length) {
    if (registro) await anotar({ ...registro, payload, enviadas: 0, alvos: 0 });
    return 0;
  }

  const dados = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined && v !== null && v !== "") dados[k] = String(v);
  }

  const resultado = await fcm.sendEachForMulticast({
    tokens: alvos.map((a) => a.token),
    data: dados,
    webpush: {
      headers: { Urgency: "high", TTL: "86400" },
      fcmOptions: { link: payload.url || "/" },
    },
  });

  const mortos = [];
  resultado.responses.forEach((r, i) => {
    const codigo = r.error?.code || "";
    if (!r.success && /registration-token-not-registered|invalid-argument/.test(codigo)) {
      mortos.push(alvos[i]);
    }
  });
  await Promise.all(mortos.map((m) =>
    db.doc(`users/${m.uid}/pushTokens/${m.docId}`).delete().catch(() => {})));

  console.log(`enviadas ${resultado.successCount}/${alvos.length}, limpos ${mortos.length}`);

  if (registro) {
    await anotar({
      ...registro,
      payload,
      alvos: alvos.length,
      enviadas: resultado.successCount,
      falhas: alvos.length - resultado.successCount,
      limpos: mortos.length,
    });
  }
  return resultado.successCount;
}

/**
 * Guarda o que foi disparado, pra dar pra conferir dentro do app em vez de
 * precisar abrir o log do Cloud. Fica junto do desafio, então a mesma regra
 * de quem enxerga o desafio vale aqui. A imagem não entra: é base64 e só
 * incharia o documento.
 */
async function anotar({ cid, tipo, payload, alvos = 0, enviadas = 0, falhas = 0, limpos = 0 }) {
  if (!cid) return;
  try {
    await db.collection(`challenges/${cid}/notifications`).add({
      tipo,
      title: payload.title || "",
      body: (payload.body || "").slice(0, 200),
      url: payload.url || "",
      alvos, enviadas, falhas, limpos,
      at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("não consegui anotar o envio:", err);
  }
}

const primeiroNome = (nome) => String(nome || "Alguém").trim().split(/\s+/)[0];

/** Miniatura do prato como imagem da notificação (já vem em base64 no post). */
const imagemDoPrato = (post) =>
  (typeof post?.thumb === "string" && post.thumb.startsWith("data:") && post.thumb.length < 60000)
    ? post.thumb
    : "";

async function membrosDoDesafio(cid) {
  const snap = await db.doc(`challenges/${cid}`).get();
  return { challenge: snap.data() || {}, uids: snap.data()?.memberUids || [] };
}

/* ============================================================
   Prato novo -> todo mundo
   ============================================================ */

exports.aoPostarPrato = onDocumentCreated(
  "challenges/{cid}/posts/{pid}",
  async (event) => {
    const post = event.data?.data();
    if (!post) return;
    const { cid, pid } = event.params;

    const { challenge, uids } = await membrosDoDesafio(cid);
    const outros = uids.filter((u) => u !== post.uid);
    const alvos = await destinatarios(outros, "posts");

    await enviar(alvos, {
      title: `${primeiroNome(post.authorName)} postou um prato`,
      body: post.title || challenge.name || "Novo prato no desafio",
      image: imagemDoPrato(post),
      tag: `post-${pid}`,
      url: `/#/c/${cid}/p/${pid}`,
    }, { cid, tipo: "posts" });
  });

/* ============================================================
   Comentário -> quem postou
   ============================================================ */

exports.aoComentar = onDocumentCreated(
  "challenges/{cid}/posts/{pid}/comments/{coid}",
  async (event) => {
    const comentario = event.data?.data();
    if (!comentario) return;
    const { cid, pid } = event.params;

    const postSnap = await db.doc(`challenges/${cid}/posts/${pid}`).get();
    const post = postSnap.data();
    if (!post || post.uid === comentario.uid) return;  // comentário no próprio prato

    const alvos = await destinatario(post.uid, "comments");
    await enviar(alvos, {
      title: `${primeiroNome(comentario.name)} comentou no seu prato`,
      body: comentario.text || "",
      image: imagemDoPrato(post),
      tag: `post-${pid}`,
      url: `/#/c/${cid}/p/${pid}`,
    }, { cid, tipo: "comments" });
  });

/* ============================================================
   Nota -> quem postou
   ============================================================ */

exports.aoDarNota = onDocumentUpdated(
  "challenges/{cid}/posts/{pid}",
  async (event) => {
    const antes = event.data?.before?.data() || {};
    const depois = event.data?.after?.data() || {};
    const { cid, pid } = event.params;

    const notasAntes = antes.ratings || {};
    const notasDepois = depois.ratings || {};

    // Só interessa nota nova ou alterada — desfazer voto não notifica.
    const novos = Object.keys(notasDepois)
      .filter((uid) => notasDepois[uid] !== notasAntes[uid] && uid !== depois.uid);
    if (!novos.length) return;

    const quem = novos[novos.length - 1];
    const nota = notasDepois[quem];

    const membro = await db.doc(`challenges/${cid}/members/${quem}`).get();
    const alvos = await destinatario(depois.uid, "ratings");

    await enviar(alvos, {
      title: `${primeiroNome(membro.data()?.name)} deu ${nota}/10 no seu prato`,
      body: depois.title || "",
      image: imagemDoPrato(depois),
      tag: `post-${pid}`,
      url: `/#/c/${cid}/p/${pid}`,
    }, { cid, tipo: "ratings" });
  });

/* ============================================================
   Recaps
   ============================================================ */

const chaveDoDia = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Mesma conta do app: soma os pontos por dia dentro do intervalo. */
function classificar(membros, de, ate) {
  return membros
    .map((m) => {
      const dias = (m.days || []).filter((d) => d >= de && d <= ate);
      const pontos = dias.reduce(
        (soma, d) => soma + (Number((m.dayPoints || {})[d]) || 1), 0);
      return { uid: m.uid, name: m.name, dias: dias.length, pontos };
    })
    .filter((m) => m.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || b.dias - a.dias);
}

/** Agora no horário de Brasília, independente do fuso da máquina. */
function agoraEmBrasilia() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: FUSO }));
}

async function mandarRecap(periodo, de, ate, titulo) {
  const desafios = await db.collection("challenges").get();

  for (const doc of desafios.docs) {
    const cid = doc.id;
    const challenge = doc.data();

    const membrosSnap = await db.collection(`challenges/${cid}/members`).get();
    const membros = membrosSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    const tabela = classificar(membros, de, ate);
    if (!tabela.length) continue;

    const campeao = tabela[0];
    const empatados = tabela.filter((m) => m.pontos === campeao.pontos);

    const quem = empatados.length > 1
      ? `${empatados.map((m) => primeiroNome(m.name)).join(" e ")} empataram`
      : `${primeiroNome(campeao.name)} venceu`;

    const segundo = tabela[1] && empatados.length === 1
      ? ` · 2º ${primeiroNome(tabela[1].name)} com ${tabela[1].pontos}`
      : "";

    const alvos = await destinatarios(challenge.memberUids || [], "recaps");
    await enviar(alvos, {
      title: `${titulo} — ${quem}`,
      body: `${campeao.pontos} ${campeao.pontos === 1 ? "ponto" : "pontos"} em `
        + `${campeao.dias} ${campeao.dias === 1 ? "dia" : "dias"}${segundo}`,
      tag: `recap-${periodo}-${cid}`,
      url: `/#/c/${cid}/recap`,
    }, { cid, tipo: "recaps" });
  }
}

// Domingo às 20h de Brasília, fechando a semana que termina no sábado.
exports.recapSemanal = onSchedule(
  { schedule: "0 20 * * 0", timeZone: FUSO },
  async () => {
    const hoje = agoraEmBrasilia();
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - hoje.getDay());
    await mandarRecap("semana", chaveDoDia(inicio), chaveDoDia(hoje), "Recap da semana");
  });

// Dia 1 às 20h, fechando o mês anterior.
exports.recapMensal = onSchedule(
  { schedule: "0 20 1 * *", timeZone: FUSO },
  async () => {
    const hoje = agoraEmBrasilia();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    await mandarRecap("mes", chaveDoDia(inicio), chaveDoDia(fim), "Recap do mês");
  });

// 1º de janeiro às 20h, fechando o ano anterior.
exports.recapAnual = onSchedule(
  { schedule: "0 20 1 1 *", timeZone: FUSO },
  async () => {
    const hoje = agoraEmBrasilia();
    const ano = hoje.getFullYear() - 1;
    await mandarRecap("ano", `${ano}-01-01`, `${ano}-12-31`, `Recap de ${ano}`);
  });
