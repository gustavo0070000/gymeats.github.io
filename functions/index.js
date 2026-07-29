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
const { onCall, HttpsError } = require("firebase-functions/v2/https");
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

// Teto do campo `data` de uma mensagem do FCM.
const LIMITE_FCM = 4096;

/* ============================================================
   Envio
   ============================================================ */

/**
 * Tokens de um usuário, junto com a preferência dele.
 * Devolve `{ tokens, semPref, semAparelho }` — a lista vazia sozinha não
 * dizia se a pessoa desligou o aviso ou se nunca registrou o aparelho, e essa
 * diferença é exatamente o que faltava pra entender "nenhum destinatário".
 */
async function destinatario(uid, tipo) {
  const perfil = await db.doc(`users/${uid}`).get();
  const prefs = { ...PADRAO, ...(perfil.data()?.notify || {}) };
  if (!prefs[tipo]) return { tokens: [], semPref: 1, semAparelho: 0 };

  const docs = await db.collection(`users/${uid}/pushTokens`).get();
  const tokens = docs.docs
    .map((d) => ({ uid, docId: d.id, token: d.data().token }))
    .filter((t) => t.token);
  return { tokens, semPref: 0, semAparelho: tokens.length ? 0 : 1 };
}

/** Junta os tokens de várias pessoas, respeitando as preferências. */
async function destinatarios(uids, tipo) {
  const partes = await Promise.all(uids.map((uid) => destinatario(uid, tipo)));
  return partes.reduce((acc, p) => ({
    tokens: acc.tokens.concat(p.tokens),
    semPref: acc.semPref + p.semPref,
    semAparelho: acc.semAparelho + p.semAparelho,
  }), { tokens: [], semPref: 0, semAparelho: 0 });
}

/** Frase curta pro log explicar por que não foi pra ninguém. */
function motivoVazio({ semPref, semAparelho }) {
  if (semAparelho && semPref) return `${semAparelho} sem aparelho registrado, ${semPref} com o aviso desligado`;
  if (semAparelho) return `${semAparelho} ${semAparelho === 1 ? "pessoa" : "pessoas"} sem aparelho registrado`;
  if (semPref) return `${semPref} ${semPref === 1 ? "pessoa" : "pessoas"} com esse aviso desligado`;
  return "ninguém pra avisar";
}

/**
 * Manda a notificação. Usa só `data` — quem monta o texto e o ícone é o
 * service worker do app, senão o navegador desenharia sozinho.
 * Token recusado pelo Firebase é apagado na hora.
 */
async function enviar(alvos, payload, registro = null) {
  if (!alvos.length) {
    if (registro) await anotar({ ...registro, payload, enviadas: 0, alvos: 0 });
    console.warn(`nada enviado (${registro?.tipo || "?"}): ${registro?.motivo || "sem alvos"}`);
    return 0;
  }

  // O campo `data` do FCM tem teto de 4096 bytes no total. A miniatura em
  // base64 sozinha passa disso, e o FCM devolvia invalid-argument — que era
  // lido como token morto e apagava o registro de quem ia receber.
  const dados = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined && v !== null && v !== "") dados[k] = String(v);
  }

  const tamanho = (o) => Object.entries(o)
    .reduce((n, [k, v]) => n + Buffer.byteLength(k) + Buffer.byteLength(v), 0);

  if (tamanho(dados) > LIMITE_FCM) {
    delete dados.image;                       // a imagem é o que quase sempre estoura
    if (tamanho(dados) > LIMITE_FCM) {
      dados.body = (dados.body || "").slice(0, 300);
      delete dados.tag;
    }
    console.warn(`payload acima de ${LIMITE_FCM} bytes; enviando sem imagem`);
  }

  const resultado = await fcm.sendEachForMulticast({
    tokens: alvos.map((a) => a.token),
    data: dados,
    webpush: {
      headers: { Urgency: "high", TTL: "86400" },
      fcmOptions: { link: payload.url || "/" },
    },
  });

  // Só some com o registro quando o Firebase diz que o token não vale mais.
  // invalid-argument ficava aqui e apagava aparelho bom por erro de payload.
  const TOKEN_MORTO = /registration-token-not-registered|invalid-registration-token|mismatched-credential/;
  const mortos = [];
  resultado.responses.forEach((r, i) => {
    if (r.success) return;
    const codigo = r.error?.code || "";
    console.error(`falha no envio: ${codigo} — ${r.error?.message || ""}`);
    if (TOKEN_MORTO.test(codigo)) mortos.push(alvos[i]);
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
async function anotar({ cid, tipo, payload, alvos = 0, enviadas = 0, falhas = 0, limpos = 0, motivo = "" }) {
  if (!cid) return;
  try {
    await db.collection(`challenges/${cid}/notifications`).add({
      tipo,
      title: payload.title || "",
      body: (payload.body || "").slice(0, 200),
      url: payload.url || "",
      alvos, enviadas, falhas, limpos,
      motivo: alvos ? "" : motivo,
      at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("não consegui anotar o envio:", err);
  }
}

const primeiroNome = (nome) => String(nome || "Alguém").trim().split(/\s+/)[0];

/**
 * Imagem da notificação. Usa a micro-miniatura gravada junto do post, que é
 * pequena de propósito pra caber no orçamento de 4 KB do FCM. A miniatura do
 * feed (~5 KB) não serve aqui — sozinha já estoura a mensagem inteira.
 */
const imagemDoPrato = (post) =>
  (typeof post?.micro === "string" && post.micro.startsWith("data:") && post.micro.length <= 2800)
    ? post.micro
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
    const quem = await destinatarios(outros, "posts");

    await enviar(quem.tokens, {
      title: `${primeiroNome(post.authorName)} postou um prato`,
      body: post.title || challenge.name || "Novo prato no desafio",
      image: imagemDoPrato(post),
      tag: `post-${pid}`,
      url: `/#/c/${cid}/p/${pid}`,
    }, { cid, tipo: "posts", motivo: motivoVazio(quem) });
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

    const quem = await destinatario(post.uid, "comments");
    await enviar(quem.tokens, {
      title: `${primeiroNome(comentario.name)} comentou no seu prato`,
      body: comentario.text || "",
      image: imagemDoPrato(post),
      tag: `post-${pid}`,
      url: `/#/c/${cid}/p/${pid}`,
    }, { cid, tipo: "comments", motivo: motivoVazio(quem) });
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
    const dono = await destinatario(depois.uid, "ratings");

    await enviar(dono.tokens, {
      title: `${primeiroNome(membro.data()?.name)} deu ${nota}/10 no seu prato`,
      body: depois.title || "",
      image: imagemDoPrato(depois),
      tag: `post-${pid}`,
      url: `/#/c/${cid}/p/${pid}`,
    }, { cid, tipo: "ratings", motivo: motivoVazio(dono) });
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

    const galera = await destinatarios(challenge.memberUids || [], "recaps");
    await enviar(galera.tokens, {
      title: `${titulo} — ${quem}`,
      body: `${campeao.pontos} ${campeao.pontos === 1 ? "ponto" : "pontos"} em `
        + `${campeao.dias} ${campeao.dias === 1 ? "dia" : "dias"}${segundo}`,
      tag: `recap-${periodo}-${cid}`,
      url: `/#/c/${cid}/recap`,
    }, { cid, tipo: "recaps", motivo: motivoVazio(galera) });
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


/* ============================================================
   Teste
   ============================================================ */

/**
 * Dispara uma notificação só pra quem chamou. É o jeito de separar
 * "o gatilho não rodou" de "o aparelho não está registrado": aqui não
 * há gatilho nenhum no meio do caminho.
 */
exports.testarNotificacao = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const tokens = await db.collection(`users/${uid}/pushTokens`).get();
  if (tokens.empty) {
    return {
      ok: false,
      motivo: "sem-token",
      detalhe: "Nenhum aparelho registrado no servidor. Desligue e ligue as "
        + "notificações de novo — provavelmente o registro não chegou a ser gravado.",
    };
  }

  const alvos = tokens.docs
    .map((d) => ({ uid, docId: d.id, token: d.data().token }))
    .filter((t) => t.token);

  const enviadas = await enviar(alvos, {
    title: "Deu certo! 🎉",
    body: "As notificações do GymEats estão funcionando neste aparelho.",
    url: "/#/notificacoes",
  });

  return {
    ok: enviadas > 0,
    aparelhos: alvos.length,
    enviadas,
    motivo: enviadas > 0 ? "" : "falha-envio",
    detalhe: enviadas > 0
      ? ""
      : "O aparelho está registrado, mas o Firebase recusou o envio. "
        + "Veja o log da função pra saber o código do erro.",
  };
});
