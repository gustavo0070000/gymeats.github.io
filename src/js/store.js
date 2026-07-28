import {
  db, auth, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp,
  arrayUnion, arrayRemove, increment, writeBatch, runTransaction,
} from "./firebase.js";
import { dayKey, toDate } from "./ui.js";

/* ============================================================
   Modelo de dados

   users/{uid}                    perfil + lista de desafios
   challenges/{cid}               desafio (memberUids controla o acesso)
   challenges/{cid}/members/{uid} placar do membro (dias em que postou)
   challenges/{cid}/posts/{pid}   post do prato (miniatura embutida)
   challenges/{cid}/posts/{pid}/comments/{id}
   challenges/{cid}/messages/{id} bate-papo
   photos/{photoId}               foto em tamanho cheio (base64), carregada sob demanda
   codes/{CODE}                   código de convite -> challengeId
   ============================================================ */

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
    days: [], total: 0, joinedAt: serverTimestamp(),
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

  const batch = writeBatch(db);
  batch.update(doc(db, "challenges", cid), { memberUids: arrayUnion(u.uid) });
  batch.set(doc(db, "challenges", cid, "members", u.uid), {
    name: u.name, photo: u.photo, role: "member",
    days: [], total: 0, joinedAt: serverTimestamp(),
  }, { merge: true });
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

export async function createPost(cid, { title, description, mealType, place, photo, thumb, at }) {
  const u = me();
  const when = at ? toDate(at) : new Date();
  const key = dayKey(when);

  const photoId = photo ? await savePhoto(photo, cid) : null;

  const postRef = doc(collection(db, "challenges", cid, "posts"));
  const batch = writeBatch(db);
  batch.set(postRef, {
    uid: u.uid,
    authorName: u.name,
    authorPhoto: u.photo,
    title: title || "",
    description: description || "",
    mealType: mealType || "",
    place: place || "",
    thumb: thumb || null,
    photoId,
    dayKey: key,
    at: when,
    createdAt: serverTimestamp(),
    commentCount: 0,
    reactions: {},
  });
  batch.set(doc(db, "challenges", cid, "members", u.uid), {
    name: u.name, photo: u.photo,
    days: arrayUnion(key),
    total: increment(1),
    lastPostAt: when,
  }, { merge: true });
  await batch.commit();

  return postRef.id;
}

export function watchFeed(cid, cb, max = 40) {
  const q = query(collection(db, "challenges", cid, "posts"), orderBy("at", "desc"), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
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

/** Recalcula os dias/total do membro a partir dos posts que sobraram. */
async function recountMember(cid, memberUid) {
  const q = query(collection(db, "challenges", cid, "posts"), where("uid", "==", memberUid));
  const snap = await getDocs(q);
  const days = [...new Set(snap.docs.map((d) => d.data().dayKey))];
  await setDoc(doc(db, "challenges", cid, "members", memberUid),
    { days, total: snap.size }, { merge: true });
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
      start: toDate(challenge?.startDate) || new Date(2000, 0, 1),
      end: toDate(challenge?.endDate) || new Date(2999, 0, 1),
    };
  }
  return { start, end };
}

/** Ordena membros por dias ativos no período, com empates dividindo a posição. */
export function standings(members, period, challenge) {
  const { start, end } = periodRange(period, challenge);
  const from = dayKey(start), to = dayKey(end);

  const rows = members.map((m) => {
    const days = (m.days || []).filter((d) => d >= from && d <= to);
    return { ...m, count: days.length, days };
  });

  rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));

  let lastCount = null, lastPos = 0;
  rows.forEach((row, i) => {
    if (row.count !== lastCount) { lastPos = i + 1; lastCount = row.count; }
    row.position = lastPos;
  });
  return rows;
}

/** Sequência atual de dias seguidos postando (conta a partir de hoje ou ontem). */
export function streak(days = []) {
  const set = new Set(days);
  const cursor = new Date();
  if (!set.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(dayKey(cursor))) return 0;
  }
  let n = 0;
  while (set.has(dayKey(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

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
