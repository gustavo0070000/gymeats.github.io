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

// O app não está na raiz do domínio: a raiz serve outro site. Link sem esse
// prefixo joga quem clica na notificação pra fora do GymEats.
const APP_URL = "https://gustavo0070000.github.io/gymeats.github.io/";

/** Caminho dentro do app, relativo ao index — nunca começa com "/". */
const rota = (caminho = "") => `#/${String(caminho).replace(/^[/#]+/, "")}`;

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
    return { enviadas: 0, alvos: 0, limpos: 0, erros: [] };
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
      fcmOptions: { link: new URL(payload.url || "", APP_URL).href },
    },
  });

  // Só some com o registro quando o Firebase diz que o token não vale mais.
  // invalid-argument ficava aqui e apagava aparelho bom por erro de payload.
  const TOKEN_MORTO = /registration-token-not-registered|invalid-registration-token|mismatched-credential/;
  const mortos = [];
  const erros = [];
  resultado.responses.forEach((r, i) => {
    if (r.success) return;
    const codigo = r.error?.code || "erro-sem-codigo";
    console.error(`falha no envio: ${codigo} — ${r.error?.message || ""}`);
    if (!erros.includes(codigo)) erros.push(codigo);
    if (TOKEN_MORTO.test(codigo)) mortos.push(alvos[i]);
  });
  // Token morto sai da lista: na próxima abertura o app registra um novo
  // sozinho (ensureRegistered), então o aparelho se conserta sem ninguém mexer.
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
      erro: erros.join(", "),
    });
  }
  return { enviadas: resultado.successCount, alvos: alvos.length, limpos: mortos.length, erros };
}

/**
 * Guarda o que foi disparado, pra dar pra conferir dentro do app em vez de
 * precisar abrir o log do Cloud. Fica junto do desafio, então a mesma regra
 * de quem enxerga o desafio vale aqui. A imagem não entra: é base64 e só
 * incharia o documento.
 */
async function anotar({ cid, tipo, payload, alvos = 0, enviadas = 0, falhas = 0, limpos = 0, motivo = "", erro = "" }) {
  if (!cid) return;
  try {
    await db.collection(`challenges/${cid}/notifications`).add({
      tipo,
      title: payload.title || "",
      body: (payload.body || "").slice(0, 200),
      url: payload.url || "",
      alvos, enviadas, falhas, limpos, erro,
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
      url: rota(`c/${cid}/p/${pid}`),
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
      url: rota(`c/${cid}/p/${pid}`),
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

    /* A notificação NÃO diz quem deu nem quanto foi.
       No app a nota é anônima — só aparecem média e contagem —, mas o aviso
       saía com nome e nota, e virou combustível pra revanche: dar nota ruim
       porque fulano deu nota ruim. Um número sozinho já denuncia: com seis
       pessoas, "3/10" dez segundos depois de você avaliar o prato do fulano
       aponta pra uma pessoa só. Por isso some o nome E a nota.

       O total de notas entra no lugar porque é informação que o app já
       mostra pra todo mundo — não revela nada novo. */
    const quantas = Object.keys(notasDepois).length;
    const dono = await destinatario(depois.uid, "ratings");

    await enviar(dono.tokens, {
      title: "Seu prato recebeu uma nota",
      body: depois.title
        ? `${depois.title} · ${quantas} ${quantas === 1 ? "nota" : "notas"} até agora`
        : `${quantas} ${quantas === 1 ? "nota" : "notas"} até agora`,
      image: imagemDoPrato(depois),
      tag: `post-${pid}`,
      url: rota(`c/${cid}/p/${pid}`),
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
      url: rota(`c/${cid}/recap`),
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

/** Traduz o código do FCM pra uma frase que diz o que fazer. */
function explicarErro(erros = [], limpos = 0) {
  const codigo = erros.join(" ");
  if (/registration-token-not-registered|invalid-registration-token/.test(codigo)) {
    return "O registro deste aparelho tinha vencido — acabei de apagar o antigo. "
      + "Feche e abra o app: ele registra de novo sozinho, aí é só testar outra vez.";
  }
  if (/mismatched-credential|third-party-auth/.test(codigo)) {
    return "O registro deste aparelho foi feito com outra chave do Web Push. "
      + "Toque em \"Desligar neste aparelho\" e ligue de novo.";
  }
  if (/invalid-argument/.test(codigo)) {
    return "O Firebase recusou o conteúdo da mensagem (invalid-argument). "
      + "Isso é bug do app, não do seu aparelho — me avise.";
  }
  if (/quota|unavailable|internal/.test(codigo)) {
    return "O Firebase está fora do ar ou recusou por limite. Tente de novo daqui a pouco.";
  }
  if (limpos) {
    return `O registro estava vencido e foi apagado (${codigo}). Feche e abra o app pra registrar de novo.`;
  }
  return `O Firebase recusou o envio: ${codigo || "sem código"}.`;
}

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

  const r = await enviar(alvos, {
    title: "Deu certo! 🎉",
    body: "As notificações do GymEats estão funcionando neste aparelho.",
    url: rota("notificacoes"),
  });

  return {
    ok: r.enviadas > 0,
    aparelhos: alvos.length,
    enviadas: r.enviadas,
    limpos: r.limpos,
    erros: r.erros,
    motivo: r.enviadas > 0 ? "" : "falha-envio",
    // O código do FCM vem junto: mandar a pessoa "olhar o log da função" era
    // inútil pra quem não é dono do projeto.
    detalhe: r.enviadas > 0 ? "" : explicarErro(r.erros, r.limpos),
  };
});

/* ============================================================
   Calorias

   O app é estático no GitHub Pages e o repositório é público: não
   existe lugar seguro pra guardar uma chave de API do lado do
   cliente. Por isso a chamada ao Gemini mora aqui, com a chave no
   Secret Manager, e o app só pede "estima esse prato".

   A foto nem sai do cliente: a função lê a que já está no Firestore.
   ============================================================ */

const { defineSecret } = require("firebase-functions/params");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const MODELO = "gemini-3.6-flash";

// Teto por pessoa por dia. O grupo posta poucas vezes ao dia; isto existe
// pra um bug em laço nunca virar conta nem queimar a cota gratuita.
const LIMITE_DIARIO = 25;

const INSTRUCAO = [
  "Você estima calorias de pratos de comida a partir de uma foto.",
  "Responda SEMPRE em português do Brasil.",
  "Estime a porção pelo que aparece na foto, usando prato, talher ou copo como referência de tamanho.",
  "Devolva uma FAIXA honesta em kcalMin/kcalMax: quanto menos der pra ver, mais larga a faixa.",
  "kcal é o valor central que você considera mais provável.",
  "Se a imagem não for comida, devolva itens vazio, kcal 0 e confianca \"baixa\".",
].join("\n");

const ESQUEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" },
          porcao: { type: "string" },
          kcal: { type: "integer" },
        },
        required: ["nome", "porcao", "kcal"],
      },
    },
    kcal: { type: "integer" },
    kcalMin: { type: "integer" },
    kcalMax: { type: "integer" },
    confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    observacao: { type: "string" },
  },
  required: ["itens", "kcal", "kcalMin", "kcalMax", "confianca"],
};

/** Chave da base de alimentos. Um prato só é "o mesmo" no mesmo lugar. */
function chaveDoAlimento(post) {
  const slug = String(post.title || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  if (!slug) return null;
  // Comprado: o lugar define a porção. Caseiro: quem cozinhou define.
  const onde = post.homemade ? `casa:${post.uid}` : (post.placeKey || "");
  return onde ? `${onde}|${slug}` : null;
}

/** Quantas estimativas a pessoa já pediu hoje. */
async function dentroDoLimite(uid) {
  const hoje = chaveDoDia(agoraEmBrasilia());
  const ref = db.doc(`users/${uid}/uso/${hoje}`);
  const snap = await ref.get();
  const n = snap.exists ? (snap.data().estimativas || 0) : 0;
  if (n >= LIMITE_DIARIO) return false;
  await ref.set({ estimativas: FieldValue.increment(1) }, { merge: true });
  return true;
}

async function pedirAoGemini(base64, mimeType, descricao) {
  const corpo = {
    systemInstruction: { parts: [{ text: INSTRUCAO }] },
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: `Descrição de quem postou: ${descricao || "(nenhuma)"}` },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: ESQUEMA,
      temperature: 0.2,
    },
  };

  const resposta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY.value(),
        "content-type": "application/json",
      },
      body: JSON.stringify(corpo),
    });

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    console.error(`gemini ${resposta.status}: ${detalhe.slice(0, 500)}`);
    const e = new Error("gemini");
    e.status = resposta.status;
    throw e;
  }

  const json = await resposta.json();
  const texto = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text).join("");
  console.log(`gemini ok, tokens: ${JSON.stringify(json.usageMetadata)}`);
  return JSON.parse(texto);
}

/**
 * Estima as calorias de um prato já publicado.
 *
 * Só o autor pede. A resposta vira o gabarito do jogo de palpite, então
 * quem chuta não pode ver antes — por isso o valor é gravado no post e a
 * tela é que decide o que mostrar pra quem.
 */
exports.estimarCalorias = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 120 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

    const { cid, pid } = request.data || {};
    if (!cid || !pid) throw new HttpsError("invalid-argument", "Faltou o prato.");

    const postRef = db.doc(`challenges/${cid}/posts/${pid}`);
    const postSnap = await postRef.get();
    if (!postSnap.exists) throw new HttpsError("not-found", "Prato não encontrado.");
    const post = postSnap.data();
    if (post.uid !== uid) {
      throw new HttpsError("permission-denied", "Só quem postou pode estimar.");
    }

    /* ---- base do grupo: prato repetido não gasta IA ---- */
    const chave = chaveDoAlimento(post);
    if (chave) {
      const cache = await db.doc(`alimentos/${chave}`).get();
      if (cache.exists) {
        const a = cache.data();
        await postRef.update({
          kcal: a.kcal, kcalMin: a.kcalMin, kcalMax: a.kcalMax,
          kcalItens: a.itens || [], kcalConfianca: a.confianca || "media",
          kcalFonte: "base", kcalAt: FieldValue.serverTimestamp(),
        });
        console.log(`base: ${chave} (${a.vezes || 1}ª vez)`);
        return {
          ok: true, fonte: "base", vezes: a.vezes || 1,
          kcal: a.kcal, kcalMin: a.kcalMin, kcalMax: a.kcalMax,
          itens: a.itens || [], confianca: a.confianca || "media",
        };
      }
    }

    if (!await dentroDoLimite(uid)) {
      throw new HttpsError("resource-exhausted",
        `Você já pediu ${LIMITE_DIARIO} estimativas hoje. Amanhã tem mais.`);
    }

    /* ---- a foto não sai do servidor ---- */
    if (!post.photoId) throw new HttpsError("failed-precondition", "Esse prato não tem foto.");
    const foto = await db.doc(`photos/${post.photoId}`).get();
    const dataUrl = foto.exists ? foto.data().data : null;
    if (!dataUrl) throw new HttpsError("failed-precondition", "Não achei a foto do prato.");

    const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
    if (!m) throw new HttpsError("failed-precondition", "Formato de foto inesperado.");

    let out;
    try {
      out = await pedirAoGemini(m[2], m[1], post.description || post.title || "");
    } catch (err) {
      if (err.status === 429) {
        throw new HttpsError("resource-exhausted",
          "A cota do Gemini estourou por agora. Tente daqui a pouco.");
      }
      throw new HttpsError("internal", "A IA não respondeu. Tente de novo.");
    }

    if (!out.itens?.length || !out.kcal) {
      return { ok: false, motivo: "sem-comida",
        detalhe: out.observacao || "Não consegui reconhecer comida nessa foto." };
    }

    await postRef.update({
      kcal: out.kcal, kcalMin: out.kcalMin, kcalMax: out.kcalMax,
      kcalItens: out.itens, kcalConfianca: out.confianca,
      kcalFonte: "ia", kcalAt: FieldValue.serverTimestamp(),
    });

    // Alimenta a base do grupo. A correção do autor sobrescreve depois.
    if (chave) {
      await db.doc(`alimentos/${chave}`).set({
        nome: post.title || "", placeKey: post.placeKey || "", homemade: !!post.homemade,
        kcal: out.kcal, kcalMin: out.kcalMin, kcalMax: out.kcalMax,
        itens: out.itens, confianca: out.confianca,
        vezes: FieldValue.increment(1),
        criadoEm: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return {
      ok: true, fonte: "ia",
      kcal: out.kcal, kcalMin: out.kcalMin, kcalMax: out.kcalMax,
      itens: out.itens, confianca: out.confianca, observacao: out.observacao || "",
    };
  });

/**
 * Correção do autor. Vale mais que o palpite da IA, então sobrescreve
 * também a base do grupo — é assim que a base fica melhor que o modelo.
 */
exports.corrigirCalorias = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const { cid, pid, kcal } = request.data || {};
  const valor = Math.round(Number(kcal));
  if (!cid || !pid) throw new HttpsError("invalid-argument", "Faltou o prato.");
  if (!isFinite(valor) || valor < 0 || valor > 20000) {
    throw new HttpsError("invalid-argument", "Valor de calorias fora do razoável.");
  }

  const postRef = db.doc(`challenges/${cid}/posts/${pid}`);
  const snap = await postRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Prato não encontrado.");
  const post = snap.data();
  if (post.uid !== uid) throw new HttpsError("permission-denied", "Só quem postou pode corrigir.");

  // A faixa acompanha a correção: manter a antiga faria o número corrigido
  // aparecer fora da própria faixa.
  const margem = Math.max(50, Math.round(valor * 0.12));
  await postRef.update({
    kcal: valor,
    kcalMin: Math.max(0, valor - margem),
    kcalMax: valor + margem,
    kcalFonte: "manual",
    kcalAt: FieldValue.serverTimestamp(),
  });

  const chave = chaveDoAlimento(post);
  if (chave) {
    await db.doc(`alimentos/${chave}`).set({
      nome: post.title || "", placeKey: post.placeKey || "", homemade: !!post.homemade,
      kcal: valor,
      kcalMin: Math.max(0, valor - margem),
      kcalMax: valor + margem,
      confianca: "alta",
      corrigidoPor: uid,
      corrigidoEm: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return { ok: true, kcal: valor };
});
