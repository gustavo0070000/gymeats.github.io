import { getMessaging, getToken, deleteToken, isSupported }
  from "https://www.gstatic.com/firebasejs/12.4.0/firebase-messaging.js";
import { app, db, auth, doc, setDoc, deleteDoc, updateDoc, serverTimestamp } from "./firebase.js";
import { VAPID_PUBLIC_KEY } from "./config.js";

/* ============================================================
   Notificações

   O token do aparelho fica em users/{uid}/pushTokens/{id}. Cada pessoa
   pode ter vários (celular, notebook), e as Cloud Functions disparam pra
   todos. Token que o Firebase recusa é apagado pela própria função.

   As preferências ficam em users/{uid}.notify e são conferidas no
   servidor antes de enviar.
   ============================================================ */

export const DEFAULT_PREFS = {
  posts: true,     // alguém postou um prato
  comments: true,  // comentaram no meu prato
  ratings: true,   // deram nota no meu prato
  recaps: true,    // resumo da semana, do mês e do ano
};

export const PREF_LABELS = [
  { id: "posts", label: "Pratos novos", hint: "Quando alguém do desafio posta" },
  { id: "comments", label: "Comentários", hint: "Quando comentam num prato seu" },
  { id: "ratings", label: "Notas", hint: "Quando dão nota num prato seu" },
  { id: "recaps", label: "Recaps", hint: "Resumo da semana, do mês e do ano" },
];

let messaging = null;

export function configured() {
  return !String(VAPID_PUBLIC_KEY || "").includes("COLE_AQUI") && VAPID_PUBLIC_KEY.length > 20;
}

export async function supported() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  try { return await isSupported(); } catch { return false; }
}

export const permission = () =>
  ("Notification" in window ? Notification.permission : "unsupported");

/** Um id estável por aparelho, pra não acumular token repetido. */
function deviceId() {
  const KEY = "gymeats:device";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID?.() || String(Date.now() + Math.random())).slice(0, 24);
    localStorage.setItem(KEY, id);
  }
  return id;
}

/**
 * Pede permissão e registra o aparelho.
 * Devolve { ok, reason } — `reason` explica a recusa pra UI dizer o porquê.
 */
export async function enable() {
  if (!configured()) return { ok: false, reason: "sem-chave" };
  if (!await supported()) return { ok: false, reason: "sem-suporte" };

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return { ok: false, reason: "negada" };

  try {
    // Reusa o service worker do app em vez de registrar um segundo.
    const registration = await navigator.serviceWorker.ready;
    messaging = messaging || getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { ok: false, reason: "sem-token" };

    const uid = auth.currentUser?.uid;
    if (!uid) return { ok: false, reason: "sem-login" };

    await setDoc(doc(db, "users", uid, "pushTokens", deviceId()), {
      token,
      platform: navigator.userAgent.slice(0, 120),
      standalone: matchMedia("(display-mode: standalone)").matches,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, token };
  } catch (err) {
    console.error("push:", err);
    return { ok: false, reason: "erro", err };
  }
}

/** Descadastra só este aparelho. */
export async function disable() {
  const uid = auth.currentUser?.uid;
  try {
    if (messaging) await deleteToken(messaging).catch(() => {});
    if (uid) await deleteDoc(doc(db, "users", uid, "pushTokens", deviceId()));
    return true;
  } catch {
    return false;
  }
}

export async function savePrefs(prefs) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await updateDoc(doc(db, "users", uid), { notify: { ...DEFAULT_PREFS, ...prefs } });
}

/** Este aparelho já está registrado? */
export async function registered() {
  if (permission() !== "granted" || !configured()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    messaging = messaging || getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: registration,
    });
    return !!token;
  } catch {
    return false;
  }
}
