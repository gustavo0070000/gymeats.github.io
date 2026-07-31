import {
  db, auth, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp,
  arrayUnion, arrayRemove, increment, writeBatch, runTransaction,
} from "./firebase.js";
import { dayKey, toDate } from "./ui.js";
import {
  pointsFor, basePoints, ratingAverage, resolvePlaceKey, MIN_RATINGS,
  POINTS_BOUGHT, POINTS_HOMEMADE,
} from "./food.js";

/* ============================================================
   Modelo de dados

   users/{uid}                    perfil + lista de desafios
   challenges/{cid}               desafio (memberUids controla o acesso)
   challenges/{cid}/members/{uid} placar: dias, pontos por dia, passaporte, coringas
   challenges/{cid}/posts/{pid}   post do prato (miniatura embutida, notas, palpites)
   challenges/{cid}/posts/{pid}/comments/{id}
   challenges/{cid}/messages/{id} bate-papo
   challenges/{cid}/places/{key}  guia: lugares visitados pelo grupo
   photos/{photoId}               foto em tamanho cheio (base64), carregada sob demanda
   codes/{CODE}                   código de convite -> challengeId
   ============================================================ */

export const STARTING_JOKERS = 2;

export const uid = () => auth.currentUser?.uid || null;

export const me = () => {
  const u = auth.currentUser;
  if (!u) return null;
  return { uid: u.uid, name: u.displayName || "Sem nome", photo: u.photoURL || "" };
};

/* ---------- Perfil ---------- */

export async function ensureUserDoc() {
  const u = auth.currentUser;
  if (!u) return null;
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  const base = {
    name: u.displayName || "Sem nome",
    photo: u.photoURL || "",
    email: u.email || "",
  };
  if (!snap.exists()) {
    await setDoc(ref, { ...base, challengeIds: [], createdAt: serverTimestamp() });
    return { id: u.uid, ...base, challengeIds: [] };
  }
  const data = snap.data();
  // mantém nome/foto do Google em dia, sem sobrescrever apelido customizado
  const patch = {};
  if (!data.nickname && data.name !== base.name) patch.name = base.name;
  if (!data.customPhoto && data.photo !== base.photo) patch.photo = base.photo;
  if (Object.keys(patch).length) await updateDoc(ref, patch);
  return { id: u.uid, ...data, ...patch };
}

export function watchUser(cb) {
  const id = uid();
  if (!id) return () => {};
  return onSnapshot(doc(db, "users", id), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null));
}

export async function updateProfile({ name, photo }) {
  const id = uid();
  const patch = {};
  if (name !== undefined) { patch.name = name; patch.nickname = true; }
  if (photo !== undefined) { patch.photo = photo; patch.customPhoto = true; }
  await updateDoc(doc(db, "users", id), patch);

  // espelha nas fichas de membro pra o placar/feed mostrarem o nome novo
  const user = await getDoc(doc(db, "users", id));
  const cids = user.data()?.challengeIds || [];
  await Promise.all(cids.map((cid) =>
    updateDoc(doc(db, "challenges", cid, "members", id), patch).catch(() => {})
  ));
}

/* ---------- Desafios ---------- */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem I/O/0/1

function newCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export async function createChallenge({ name, description, startDate, endDate, bannerThumb, bannerPhoto }) {
  const u = me();
  if (!u) throw new Error("Faça login primeiro.");

  const cid = doc(collection(db, "challenges")).id;
  let bannerPhotoId = null;
  if (bannerPhoto) bannerPhotoId = await savePhoto(bannerPhoto, cid);

  // tenta até achar um código livre
  let code = null;
  for (let i = 0; i < 6 && !code; i++) {
    const candidate = newCode();
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "codes", candidate);
        if ((await tx.get(ref)).exists()) throw new Error("colisão");
        tx.set(ref, { challengeId: cid, createdAt: serverTimestamp() });
      });
      code = candidate;
    } catch { /* tenta outro */ }
  }
  if (!code) throw new Error("Não consegui gerar um código de convite. Tenta de novo.");

  const batch = writeBatch(db);
  batch.set(doc(db, "challenges", cid), {
    name,
    description: description || "",
    startDate,
    endDate,
    code,
    ownerUid: u.uid,
    memberUids: [u.uid],
    bannerThumb: bannerThumb || null,
    bannerPhotoId,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "challenges", cid, "members", u.uid), {
    name: u.name, photo: u.photo, role: "owner",
    days: [], dayPoints: {}, cuisines: [], jokerDays: [],
    jokers: STARTING_JOKERS, homemadeCount: 0, boughtCount: 0,
    total: 0, totalPoints: 0, joinedAt: serverTimestamp(),
  });
  batch.update(doc(db, "users", u.uid), { challengeIds: arrayUnion(cid) });
  await batch.commit();

  return cid;
}

export async function joinByCode(rawCode) {
  const u = me();
  if (!u) throw new Error("Faça login primeiro.");
  const code = String(rawCode || "").trim().toUpperCase();
  if (code.length < 4) throw new Error("Código inválido.");

  const codeSnap = await getDoc(doc(db, "codes", code));
  if (!codeSnap.exists()) throw new Error("Não achei nenhum desafio com esse código.");
  const cid = codeSnap.data().challengeId;

  const memberRef = doc(db, "challenges", cid, "members", u.uid);
  const memberSnap = await getDoc(memberRef);

  const batch = writeBatch(db);
  batch.update(doc(db, "challenges", cid), { memberUids: arrayUnion(u.uid) });
  if (!memberSnap.exists()) {
    batch.set(memberRef, {
      name: u.name, photo: u.photo, role: "member",
      days: [], dayPoints: {}, cuisines: [], jokerDays: [],
      jokers: STARTING_JOKERS, homemadeCount: 0, boughtCount: 0,
      total: 0, totalPoints: 0, joinedAt: serverTimestamp(),
    });
  } else {
    batch.update(memberRef, {
      name: u.name, photo: u.photo,
    });
  }
  batch.update(doc(db, "users", u.uid), { challengeIds: arrayUnion(cid) });
  await batch.commit();

  return cid;
}

export async function leaveChallenge(cid) {
  const id = uid();
  const batch = writeBatch(db);
  batch.update(doc(db, "challenges", cid), { memberUids: arrayRemove(id) });
  batch.delete(doc(db, "challenges", cid, "members", id));
  batch.update(doc(db, "users", id), { challengeIds: arrayRemove(cid) });
  await batch.commit();
}

export function watchMyChallenges(cb) {
  const id = uid();
  if (!id) return () => {};
  const q = query(collection(db, "challenges"), where("memberUids", "array-contains", id));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    cb(list);
  }, () => cb([]));
}

export function watchChallenge(cid, cb) {
  return onSnapshot(doc(db, "challenges", cid),
    (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null),
    () => cb(null));
}

export const getChallenge = async (cid) => {
  const s = await getDoc(doc(db, "challenges", cid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
};

export async function updateChallenge(cid, patch) {
  await updateDoc(doc(db, "challenges", cid), patch);
}

export function watchMembers(cid, cb) {
  return onSnapshot(collection(db, "challenges", cid, "members"), (snap) => {
    cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  }, () => cb([]));
}

/* ---------- Fotos ---------- */

export async function savePhoto(dataUrl, cid) {
  const ref = await addDoc(collection(db, "photos"), {
    data: dataUrl,
    uid: uid(),
    cid: cid || null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

const photoCache = new Map();

export async function loadPhoto(photoId) {
  if (!photoId) return null;
  if (photoCache.has(photoId)) return photoCache.get(photoId);
  const snap = await getDoc(doc(db, "photos", photoId));
  const data = snap.exists() ? snap.data().data : null;
  photoCache.set(photoId, data);
  return data;
}

/* ---------- Posts ---------- */

export async function createPost(cid, {
  title, description, mealType, cuisine, homemade, place, coords, price,
  photo, thumb, micro, at, dateEditada = false,
}) {
  const u = me();
  const when = at ? toDate(at) : new Date();
  const key = dayKey(when);
  // Marcar o ponto no mapa sem digitar nome também vale: a coordenada vira
  // a chave. Antes, sem nome o lugar simplesmente não era registrado, e a
  // localização sumia do guia e do mapa.
  const pKey = resolvePlaceKey(place, coords);

  const photoId = photo ? await savePhoto(photo, cid) : null;

  const postRef = doc(collection(db, "challenges", cid, "posts"));
  const memberRef = doc(db, "challenges", cid, "members", u.uid);

  await runTransaction(db, async (tx) => {
    const memberSnap = await tx.get(memberRef);
    const member = memberSnap.exists() ? memberSnap.data() : {};

    // O bônus de sequência olha a sequência já contando o dia deste post.
    const days = new Set([...(member.days || []), ...(member.jokerDays || []), key]);
    const points = pointsFor(homemade, streakFrom(days, when));
    const dayPoints = { ...(member.dayPoints || {}) };
    const nextDayTotal = Number(dayPoints[key] || 0) + points;

    tx.set(postRef, {
      uid: u.uid,
      authorName: u.name,
      authorPhoto: u.photo,
      title: title || "",
      description: description || "",
      mealType: mealType || "",
      cuisine: cuisine || "",
      homemade: !!homemade,
      place: place || "",
      placeKey: pKey,
      coords: coords || null,
      price: isFinite(price) && price > 0 ? Number(price) : null,
      guesses: {},
      thumb: thumb || null,
      micro: micro || null,   // miniatura da notificação (cabe nos 4 KB do FCM)
      photoId,
      dayKey: key,
      at: when,
      // Marca quando a data foi escolhida de propósito. Sem isso, uma data
      // muito distante da hora da publicação é tratada como relógio errado.
      dateEditada,
      createdAt: serverTimestamp(),
      commentCount: 0,
      reactions: {},
      ratings: {},
      ratingAvg: null,
      ratingCount: 0,
      basePoints: basePoints(homemade),
    });

    const patch = {
      name: u.name, photo: u.photo,
      days: arrayUnion(key),
      total: increment(1),
      totalPoints: increment(points),
      lastPostAt: when,
      [homemade ? "homemadeCount" : "boughtCount"]: increment(1),
    };
    patch.dayPoints = { ...dayPoints, [key]: nextDayTotal };
    if (cuisine) patch.cuisines = arrayUnion(cuisine);
    tx.set(memberRef, patch, { merge: true });
  });

  if (pKey) await touchPlace(cid, pKey, { place, coords, thumb, postId: postRef.id });

  return postRef.id;
}

/**
 * Momento do post, resolvido com tolerância.
 * `at` é a data que a pessoa escolheu no formulário; se vier faltando ou
 * inválida (post antigo, data digitada errada), cai pro carimbo do servidor.
 */
export function postTime(p) {
  const escolhido = toDate(p?.at);
  const servidor = toDate(p?.createdAt);
  const okEscolhido = escolhido && !isNaN(escolhido);
  const okServidor = servidor && !isNaN(servidor);

  if (!okEscolhido) return okServidor ? servidor : new Date(0);
  if (!okServidor) return escolhido;

  // Quando as duas datas brigam por mais de 12 horas, vale a do servidor:
  // a do formulário depende do relógio do aparelho de quem postou, e o
  // campo de data podia vir preenchido com um valor velho restaurado pelo
  // navegador. Quem quiser publicar a foto de outro dia de propósito usa o
  // "Editar prato", que marca a escolha como intencional.
  const brigaFeio = Math.abs(escolhido - servidor) >= 12 * 36e5;
  return brigaFeio && !p?.dateEditada ? servidor : escolhido;
}

/** Dia do post derivado do horário — o campo dayKey serve só de reserva. */
export function postDay(p) {
  const when = postTime(p);
  return when.getTime() ? dayKey(when) : (p?.dayKey || "");
}

/** Mais recente primeiro. */
export const byNewest = (a, b) => postTime(b) - postTime(a);

export function watchFeed(cid, cb, max = 60) {
  const q = query(collection(db, "challenges", cid, "posts"), orderBy("at", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    // O Firestore ordena por tipo antes de valor: se algum post tiver `at`
    // gravado num tipo diferente, a ordem volta embaralhada. Reordenamos
    // aqui pra garantir "mais recente em cima", venha o que vier.
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest));
  }, () => cb([]));
}

/**
 * Edita um prato já publicado. Só o autor pode.
 * Mexer na data ou no "cozinhei" muda o placar, então o membro é recontado
 * no fim — é o mesmo caminho do "Recalcular placar".
 */
export async function updatePost(cid, post, {
  title, description, mealType, cuisine, homemade, place, coords, price, at,
}) {
  const when = at ? toDate(at) : postTime(post);
  const pKey = resolvePlaceKey(place, coords);

  await updateDoc(doc(db, "challenges", cid, "posts", post.id), {
    title: title ?? post.title,
    description: description ?? post.description,
    mealType: mealType ?? post.mealType,
    cuisine: cuisine ?? post.cuisine,
    homemade: !!homemade,
    place: place || "",
    placeKey: pKey,
    coords: coords || null,
    price: isFinite(price) && price > 0 ? Number(price) : null,
    at: when,
    dayKey: dayKey(when),
    // Data mexida à mão passa a valer sobre a do servidor.
    dateEditada: true,
    basePoints: basePoints(homemade),
    editedAt: serverTimestamp(),
  });

  const anterior = post.placeKey || "";
  if (anterior && anterior !== pKey) await releasePlace(cid, anterior, post.uid);
  if (pKey && pKey !== anterior) {
    await touchPlace(cid, pKey, { place, coords, thumb: post.thumb, postId: post.id });
  }
  await recountMember(cid, post.uid);
}

export function watchPost(cid, pid, cb) {
  return onSnapshot(doc(db, "challenges", cid, "posts", pid),
    (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null),
    () => cb(null));
}

export async function deletePost(cid, post) {
  await deleteDoc(doc(db, "challenges", cid, "posts", post.id));
  // A foto só pode ser apagada por quem a enviou (regra da coleção photos).
  // Quando o dono apaga um post alheio, ela fica órfã — tudo bem, é barato.
  if (post.photoId && post.uid === uid()) {
    await deleteDoc(doc(db, "photos", post.photoId)).catch(() => {});
  }
  await recountMember(cid, post.uid);
}

/** Recalcula dias, pontos e passaporte do membro a partir dos posts que sobraram. */
async function recountMember(cid, memberUid) {
  const memberSnap = await getDoc(doc(db, "challenges", cid, "members", memberUid));
  const memberData = memberSnap.exists() ? memberSnap.data() : {};
  const jokerDays = memberData.jokerDays || [];

  const q = query(collection(db, "challenges", cid, "posts"), where("uid", "==", memberUid));
  const snap = await getDocs(q);
  const posts = snap.docs.map((d) => d.data()).sort(byNewest).reverse();

  const days = [...new Set(posts.map(postDay).filter(Boolean))].sort();
  const cuisines = [...new Set(posts.map((p) => p.cuisine).filter(Boolean))];
  const homemadeCount = posts.filter((p) => p.homemade).length;

  // Refaz a pontuação post a post, respeitando o bônus de sequência.
  const daySet = new Set([...days, ...jokerDays]);
  const dayPoints = {};
  let totalPoints = 0;
  for (const post of posts) {
    const day = postDay(post);
    if (!day) continue;
    const when = postTime(post);
    const points = pointsFor(!!post.homemade, streakFrom(daySet, when));
    dayPoints[day] = (dayPoints[day] || 0) + points;
    totalPoints += points;
  }

  await setDoc(doc(db, "challenges", cid, "members", memberUid), {
    days, dayPoints, totalPoints, cuisines,
    homemadeCount,
    boughtCount: posts.length - homemadeCount,
    total: posts.length,
  }, { merge: true });
}

/* ============================================================
   Diagnóstico e reparo de datas

   `at` é a data que a pessoa escolheu no formulário; `createdAt` é o
   carimbo do servidor no instante da publicação. Quando os dois brigam,
   o do servidor é o confiável — o do formulário depende do relógio e do
   fuso do aparelho de quem postou.
   ============================================================ */

export async function auditPosts(cid, max = 100) {
  const q = query(collection(db, "challenges", cid, "posts"),
    orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const p = { id: d.id, ...d.data() };
    const escolhido = toDate(p.at);
    const servidor = toDate(p.createdAt);
    const horas = escolhido && servidor
      ? Math.round(Math.abs(escolhido - servidor) / 36e5 * 10) / 10
      : null;
    return {
      id: p.id,
      title: p.title,
      author: p.authorName,
      uid: p.uid,
      at: escolhido,
      createdAt: servidor,
      dayKeySalvo: p.dayKey || "",
      dayKeyDoAt: escolhido ? dayKey(escolhido) : "",
      dayKeyDoServidor: servidor ? dayKey(servidor) : "",
      horasDeDiferenca: horas,
      // Diferença de mais de meio dia quase sempre é relógio/fuso errado,
      // não alguém publicando de propósito a foto de outro dia.
      suspeito: horas != null && horas >= 12,
    };
  });
}

/**
 * Ajusta só a localização de um prato. Serve pro dono do desafio arrumar o
 * lugar de um post alheio sem tocar em mais nada — é o único campo, além da
 * data, que as regras deixam ele mexer fora dos próprios pratos.
 */
export async function updatePostPlace(cid, post, { place, coords }) {
  const pKey = resolvePlaceKey(place, coords);
  const anterior = post.placeKey || "";

  await updateDoc(doc(db, "challenges", cid, "posts", post.id), {
    place: place || "",
    placeKey: pKey,
    coords: coords || null,
  });

  // Trocar o endereço move a visita de um lugar pro outro. Sem isso, o
  // antigo continuava no guia e o novo entrava do lado, como se o prato
  // tivesse sido comido em dois lugares.
  if (anterior && anterior !== pKey) await releasePlace(cid, anterior, post.uid);
  if (pKey && pKey !== anterior) {
    await touchPlace(cid, pKey, { place, coords, thumb: post.thumb, postId: post.id });
  }
}

/** Regrava `at` e `dayKey` a partir do carimbo do servidor. */
export async function repairDates(cid, ids) {
  const alvo = new Set(ids);
  const linhas = (await auditPosts(cid, 200)).filter((l) => alvo.has(l.id) && l.createdAt);

  for (const linha of linhas) {
    await updateDoc(doc(db, "challenges", cid, "posts", linha.id), {
      at: linha.createdAt,
      dayKey: dayKey(linha.createdAt),
    });
  }

  const donos = [...new Set(linhas.map((l) => l.uid))];
  for (const u of donos) await recountMember(cid, u);
  return linhas.length;
}

/**
 * Recalcula o placar de todo mundo a partir dos posts.
 * Serve pra consertar desafios que começaram antes da pontuação existir
 * (só o dono consegue, porque mexe na ficha dos outros membros).
 */
export async function recalcStandings(cid) {
  const snap = await getDocs(collection(db, "challenges", cid, "members"));
  const uids = snap.docs.map((d) => d.id);
  for (const memberUid of uids) await recountMember(cid, memberUid);
  return uids.length;
}

/** Posts de um mês específico — usado no calendário do perfil. */
export async function monthPosts(cid, memberUid, year, month) {
  const p = (n) => String(n).padStart(2, "0");
  const from = `${year}-${p(month + 1)}-01`;
  const to = `${year}-${p(month + 1)}-32`;
  const q = query(
    collection(db, "challenges", cid, "posts"),
    where("uid", "==", memberUid),
    where("dayKey", ">=", from),
    where("dayKey", "<=", to),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------- Reações ---------- */

export async function toggleReaction(cid, pid, emoji) {
  const id = uid();
  const ref = doc(db, "challenges", cid, "posts", pid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const reactions = { ...(snap.data().reactions || {}) };
    const list = new Set(reactions[emoji] || []);
    list.has(id) ? list.delete(id) : list.add(id);
    if (list.size) reactions[emoji] = [...list];
    else delete reactions[emoji];
    tx.update(ref, { reactions });
  });
}

/* ---------- Notas (1 a 10) ---------- */

export async function ratePost(cid, pid, value) {
  const id = uid();
  const score = Math.max(1, Math.min(10, Math.round(Number(value))));
  const postRef = doc(db, "challenges", cid, "posts", pid);

  let placeDelta = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(postRef);
    if (!snap.exists()) return;
    const post = snap.data();
    if (post.uid === id) throw new Error("Não dá pra dar nota no próprio prato.");

    const ratings = { ...(post.ratings || {}) };
    const before = ratings[id];
    // Tocar de novo na mesma nota tira o voto.
    if (before === score) delete ratings[id];
    else ratings[id] = score;

    const avg = ratingAverage(ratings);
    tx.update(postRef, {
      ratings,
      ratingAvg: avg,
      ratingCount: Object.keys(ratings).length,
    });

    if (post.placeKey) {
      placeDelta = {
        key: post.placeKey,
        sum: (ratings[id] || 0) - (before || 0),
        count: (ratings[id] ? 1 : 0) - (before ? 1 : 0),
      };
    }
  });

  if (placeDelta && (placeDelta.sum || placeDelta.count)) {
    await updateDoc(doc(db, "challenges", cid, "places", placeDelta.key), {
      ratingSum: increment(placeDelta.sum),
      ratingCount: increment(placeDelta.count),
    }).catch(() => {});
  }
}

/* ---------- Palpite de preço ---------- */

export async function guessPrice(cid, pid, value) {
  const id = uid();
  const amount = Number(value);
  if (!isFinite(amount) || amount < 0) throw new Error("Valor inválido.");

  const postRef = doc(db, "challenges", cid, "posts", pid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(postRef);
    if (!snap.exists()) return;
    const post = snap.data();
    if (post.uid === id) throw new Error("Você já sabe quanto custou.");
    if ((post.guesses || {})[id] != null) throw new Error("Você já chutou.");
    tx.update(postRef, { guesses: { ...(post.guesses || {}), [id]: amount } });
  });
}

/* ---------- Vale-faltas (coringas) ---------- */

export async function useJoker(cid, day) {
  const id = uid();
  const ref = doc(db, "challenges", cid, "members", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const member = snap.exists() ? snap.data() : {};
    const left = member.jokers ?? STARTING_JOKERS;
    if (left <= 0) throw new Error("Seus vale-faltas acabaram.");
    if ((member.days || []).includes(day)) throw new Error("Você postou nesse dia.");
    if ((member.jokerDays || []).includes(day)) throw new Error("Esse dia já tem vale-falta.");
    if (day >= dayKey()) throw new Error("Vale-falta só vale pra dia que já passou.");
    tx.set(ref, { jokers: left - 1, jokerDays: arrayUnion(day) }, { merge: true });
  });
}

/* ---------- Guia: lugares ---------- */

async function touchPlace(cid, key, { place, coords, thumb, postId }) {
  const ref = doc(db, "challenges", cid, "places", key);
  const patch = {
    name: place || "Ponto no mapa",
    visits: increment(1),
    uids: arrayUnion(uid()),
    lastAt: serverTimestamp(),
    lastPostId: postId,
  };
  if (coords) patch.coords = coords;
  if (thumb) patch.thumb = thumb;
  await setDoc(ref, patch, { merge: true }).catch(() => {});
}

/** Tira uma visita de um lugar — usado quando um prato troca de endereço. */
async function releasePlace(cid, key, memberUid) {
  if (!key) return;
  const ref = doc(db, "challenges", cid, "places", key);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const visitas = (snap.data().visits || 1) - 1;
    if (visitas <= 0) {
      // some da lista mesmo se a regra não deixar apagar (delete é só do dono)
      await deleteDoc(ref).catch(() => updateDoc(ref, { visits: 0 }));
    } else {
      await updateDoc(ref, { visits: visitas, uids: arrayRemove(memberUid) });
    }
  } catch { /* o guia é secundário: não vale travar a edição por causa dele */ }
}

export function watchPlaces(cid, cb) {
  return onSnapshot(collection(db, "challenges", cid, "places"), (snap) => {
    const list = snap.docs.map((d) => {
      const data = d.data();
      const count = data.ratingCount || 0;
      return { id: d.id, ...data, rating: count ? (data.ratingSum || 0) / count : null };
    })
      // lugares zerados por uma troca de endereço não aparecem mais
      .filter((p) => (p.visits ?? 1) > 0);
    list.sort((a, b) => (b.visits || 0) - (a.visits || 0));
    cb(list);
  }, () => cb([]));
}

/* ---------- Histórico de notificações disparadas ---------- */

/** Escrito pelas Cloud Functions; o app só lê. */
export function watchNotificationLog(cid, cb, max = 80) {
  const q = query(
    collection(db, "challenges", cid, "notifications"),
    orderBy("at", "desc"),
    limit(max),
  );
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
}

/* ---------- Posts de um período (recap, prato da semana, guia) ---------- */

export async function periodPosts(cid, start, end, max = 500) {
  const q = query(
    collection(db, "challenges", cid, "posts"),
    where("dayKey", ">=", dayKey(start)),
    where("dayKey", "<=", dayKey(end)),
    orderBy("dayKey", "desc"),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest);
}

/** Melhores e piores pratos de uma lista, respeitando o mínimo de votos. */
export function rankByRating(posts, { min = MIN_RATINGS } = {}) {
  const eligible = posts.filter((p) => (p.ratingCount || 0) >= min && p.ratingAvg != null);
  const best = [...eligible].sort((a, b) => b.ratingAvg - a.ratingAvg);
  const worst = [...eligible].sort((a, b) => a.ratingAvg - b.ratingAvg);
  return { best, worst, eligible };
}

/* ============================================================
   Detalhamento

   O app calculava esses números e jogava fora o caminho até eles:
   a tela dizia "11 pontos" e "R$ 340" sem nunca mostrar a conta.
   ============================================================ */

/** O período imediatamente anterior, pra comparar. `all` não tem anterior. */
export function previousRange(period, challenge) {
  if (period === "all") return null;
  const { start } = periodRange(period, challenge);
  const end = new Date(start.getTime() - 1);          // 23:59:59.999 do dia anterior
  const prev = new Date(start);

  if (period === "week") prev.setDate(prev.getDate() - 7);
  else if (period === "month") prev.setMonth(prev.getMonth() - 1);
  else if (period === "year") prev.setFullYear(prev.getFullYear() - 1);

  prev.setHours(0, 0, 0, 0);
  return { start: prev, end };
}

/**
 * De onde vieram os pontos de cada pessoa no período.
 *
 * A base sai dos posts (comprado = 1, caseiro = 2) e o bônus é o resto:
 * o que o `dayPoints` registrou a mais é exatamente o que a sequência
 * multiplicou. Assim a conta fecha com o placar em vez de recalcular a
 * regra e arriscar divergir dele.
 */
export function pointsBreakdown(member, posts, period, challenge) {
  const { start, end } = periodRange(period, challenge);
  const from = dayKey(start), to = dayKey(end);
  const meus = (posts || []).filter((p) => p.uid === member.uid);

  const caseiros = meus.filter((p) => p.homemade).length;
  const comprados = meus.length - caseiros;
  const base = caseiros * POINTS_HOMEMADE + comprados * POINTS_BOUGHT;

  const scored = member.dayPoints || {};
  const total = period === "all"
    ? Object.entries(scored).reduce((s, [, v]) => s + (Number(v) || 0), 0)
    : Object.entries(scored)
      .filter(([d]) => d >= from && d <= to)
      .reduce((s, [, v]) => s + (Number(v) || 0), 0);

  // Placar antigo pode não bater com os posts (membro criado antes do
  // dayPoints existir). Nesse caso o bônus fica em zero em vez de negativo.
  const bonus = Math.max(0, total - base);
  return {
    comprados, caseiros, base, bonus,
    total: total || base,
    confere: total >= base,
  };
}

/** Quem gastou quanto, e onde o dinheiro foi parar. */
export function spendBreakdown(posts, members = []) {
  const comPreco = (posts || []).filter((p) => p.price > 0);
  const total = comPreco.reduce((s, p) => s + p.price, 0);

  const nome = (uid) => members.find((m) => m.uid === uid)?.name
    || comPreco.find((p) => p.uid === uid)?.authorName || "Alguém";

  const porPessoa = new Map();
  const porCozinha = new Map();
  comPreco.forEach((p) => {
    const pessoa = porPessoa.get(p.uid) || { uid: p.uid, name: nome(p.uid), total: 0, n: 0 };
    pessoa.total += p.price; pessoa.n += 1;
    porPessoa.set(p.uid, pessoa);

    if (!p.cuisine) return;
    const c = porCozinha.get(p.cuisine) || { id: p.cuisine, total: 0, n: 0 };
    c.total += p.price; c.n += 1;
    porCozinha.set(p.cuisine, c);
  });

  const ordena = (a, b) => b.total - a.total;
  return {
    total,
    n: comPreco.length,
    semPreco: (posts || []).length - comPreco.length,
    media: comPreco.length ? total / comPreco.length : 0,
    caro: [...comPreco].sort((a, b) => b.price - a.price)[0] || null,
    porPessoa: [...porPessoa.values()].sort(ordena)
      .map((p) => ({ ...p, media: p.total / p.n })),
    porCozinha: [...porCozinha.values()].sort(ordena)
      .map((c) => ({ ...c, media: c.total / c.n })),
  };
}

/* ---------- Filtros da lista de pratos ---------- */

/** Um filtro só existe quando tem valor; assim a URL fica curta e legível. */
export const FILTROS = ["uid", "cuisine", "meal", "feito", "nota", "preco", "dia", "lugar"];

export function filterPosts(posts, f = {}) {
  return (posts || []).filter((p) => {
    if (f.uid && p.uid !== f.uid) return false;
    if (f.cuisine && p.cuisine !== f.cuisine) return false;
    if (f.meal && p.mealType !== f.meal) return false;
    if (f.feito === "casa" && !p.homemade) return false;
    if (f.feito === "comprado" && p.homemade) return false;
    if (f.dia && postDay(p) !== f.dia) return false;
    if (f.lugar && p.placeKey !== f.lugar) return false;
    if (f.preco === "sim" && !(p.price > 0)) return false;
    if (f.nota) {
      const min = Number(f.nota);
      if (!isFinite(min) || (p.ratingAvg ?? -1) < min) return false;
    }
    return true;
  });
}

export const ORDENS = {
  recentes: { label: "Mais recentes", cmp: byNewest },
  antigos: { label: "Mais antigos", cmp: (a, b) => postTime(a) - postTime(b) },
  nota: { label: "Melhor nota", cmp: (a, b) => (b.ratingAvg ?? -1) - (a.ratingAvg ?? -1) || byNewest(a, b) },
  caro: { label: "Mais caro", cmp: (a, b) => (b.price ?? -1) - (a.price ?? -1) || byNewest(a, b) },
};

export function sortPosts(posts, ordem = "recentes") {
  return [...(posts || [])].sort((ORDENS[ordem] || ORDENS.recentes).cmp);
}

/* ---------- Comentários ---------- */

export function watchComments(cid, pid, cb) {
  const q = query(collection(db, "challenges", cid, "posts", pid, "comments"), orderBy("at", "asc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
}

export async function addComment(cid, pid, text) {
  const u = me();
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "challenges", cid, "posts", pid, "comments")), {
    uid: u.uid, name: u.name, photo: u.photo,
    text, at: serverTimestamp(),
  });
  batch.update(doc(db, "challenges", cid, "posts", pid), { commentCount: increment(1) });
  await batch.commit();
}

export async function deleteComment(cid, pid, commentId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "challenges", cid, "posts", pid, "comments", commentId));
  batch.update(doc(db, "challenges", cid, "posts", pid), { commentCount: increment(-1) });
  await batch.commit();
}

/* ---------- Bate-papo ---------- */

export function watchMessages(cid, cb, max = 120) {
  const q = query(collection(db, "challenges", cid, "messages"), orderBy("at", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse());
  }, () => cb([]));
}

export async function sendMessage(cid, text) {
  const u = me();
  await addDoc(collection(db, "challenges", cid, "messages"), {
    uid: u.uid, name: u.name, photo: u.photo,
    text, at: serverTimestamp(),
  });
}

/* ============================================================
   Placar
   ============================================================ */

export function periodRange(period, challenge) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === "week") {
    // semana começando no domingo, como no GymRats
    start.setDate(start.getDate() - start.getDay());
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (period === "month") {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  } else if (period === "year") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  } else {
    return {
      start: new Date(2000, 0, 1),
      end: toDate(challenge?.endDate) || new Date(2999, 0, 1),
    };
  }
  return { start, end };
}

/**
 * Placar do período. `by` escolhe o critério:
 *   "days"   — dias em que postou (o ranking clássico do GymRats)
 *   "points" — pontos, onde cozinhar vale mais e sequência longa multiplica
 * Empates dividem a mesma posição.
 */
export function standings(members, period, challenge, by = "days") {
  const { start, end } = periodRange(period, challenge);
  const from = dayKey(start), to = dayKey(end);
  const inRange = (d) => d >= from && d <= to;

  const rows = members.map((m) => {
    const days = (m.days || []).filter(inRange);
    const jokerDays = (m.jokerDays || []).filter(inRange);

    const scored = m.dayPoints || {};
    const dayPointsSum = Object.values(scored).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const memberTotalPoints = Number(m.totalPoints);
    const hasValidTotalPoints = isFinite(memberTotalPoints) && memberTotalPoints > 0;
    const baseExpected = (m.homemadeCount || 0) * 2 + (m.boughtCount || 0) * 1;

    let points = 0;
    if (period === "all") {
      if (hasValidTotalPoints && memberTotalPoints >= baseExpected) {
        points = memberTotalPoints;
      } else {
        points = Math.max(memberTotalPoints || 0, dayPointsSum);
      }
    } else {
      const periodSum = days.reduce((sum, day) => sum + (Number(scored[day]) || 0), 0);
      // Se todos os dias do membro estão no período selecionado e o totalPoints for maior,
      // usa o totalPoints para evitar defasagem no mapa dayPoints.
      const allDaysInRange = (m.days || []).length > 0 && (m.days || []).every(inRange);
      if (allDaysInRange && hasValidTotalPoints && memberTotalPoints >= periodSum) {
        points = memberTotalPoints;
      } else {
        points = periodSum;
      }
    }
    return { ...m, count: days.length, days, jokerDays, points };
  });

  // Empate em pontos é resolvido por quem apareceu em mais dias, depois por
  // quem tem a sequência maior. O nome só decide em último caso.
  const value = (r) => (by === "points" ? r.points : r.count);
  rows.sort((a, b) =>
    value(b) - value(a)
    || b.count - a.count
    || memberStreak(b) - memberStreak(a)
    || a.name.localeCompare(b.name, "pt-BR"));

  // A posição é sempre a ordem da lista já classificada.
  rows.forEach((row, i) => {
    row.position = i + 1;
  });
  return rows;
}

/** Conta dias seguidos para trás a partir de `end` (inclusive). */
export function streakFrom(daySet, end = new Date()) {
  const cursor = toDate(end) || new Date();
  let n = 0;
  while (daySet.has(dayKey(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

/**
 * Sequência atual: dias seguidos postando, contando de hoje (ou de ontem,
 * se hoje ainda não postou). Vale-faltas contam como dia cumprido.
 */
export function streak(days = [], jokerDays = []) {
  const set = new Set([...days, ...jokerDays]);
  const cursor = new Date();
  if (!set.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(dayKey(cursor))) return 0;
  }
  return streakFrom(set, cursor);
}

/** Sequência de um membro, do jeito que ele está guardado. */
export const memberStreak = (m) => streak(m?.days || [], m?.jokerDays || []);

/** Quantas semanas o membro terminou em 1º lugar (usado na seção "Vitórias"). */
export function weeklyWins(members) {
  const allDays = new Set();
  members.forEach((m) => (m.days || []).forEach((d) => allDays.add(d)));
  if (!allDays.size) return [];

  const weekOf = (key) => {
    const [y, mo, d] = key.split("-").map(Number);
    const date = new Date(y, mo - 1, d);
    date.setDate(date.getDate() - date.getDay());
    return dayKey(date);
  };

  const perWeek = new Map(); // week -> Map(uid -> count)
  members.forEach((m) => (m.days || []).forEach((day) => {
    const w = weekOf(day);
    if (!perWeek.has(w)) perWeek.set(w, new Map());
    const bucket = perWeek.get(w);
    bucket.set(m.uid, (bucket.get(m.uid) || 0) + 1);
  }));

  const thisWeek = weekOf(dayKey());
  const wins = new Map();
  perWeek.forEach((bucket, week) => {
    if (week === thisWeek) return; // semana em andamento não conta
    const best = Math.max(...bucket.values());
    bucket.forEach((count, memberUid) => {
      if (count === best) wins.set(memberUid, (wins.get(memberUid) || 0) + 1);
    });
  });

  return members
    .map((m) => ({ ...m, wins: wins.get(m.uid) || 0 }))
    .filter((m) => m.wins > 0)
    .sort((a, b) => b.wins - a.wins)
    .map((m, i, arr) => ({ ...m, position: arr.findIndex((x) => x.wins === m.wins) + 1 }));
}
