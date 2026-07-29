import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp,
  arrayUnion, arrayRemove, increment, writeBatch, runTransaction, deleteField,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

import { getFunctions, httpsCallable }
  from "https://www.gstatic.com/firebasejs/12.4.0/firebase-functions.js";

import { firebaseConfig, isConfigured } from "./config.js";

export const configured = isConfigured();

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Cache local em IndexedDB: o app abre com os dados da última visita
// mesmo sem internet (e economiza leituras do free tier).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
});

setPersistence(auth, browserLocalPersistence).catch(() => {});

// As funções vivem em São Paulo; sem a região o SDK procura em us-central1.
export const functions = getFunctions(app, "southamerica-east1");
export const callable = (nome) => httpsCallable(functions, nome);

/* ---------- Login ---------- */

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const fallback = [
      "auth/popup-blocked",
      "auth/popup-closed-by-user",
      "auth/cancelled-popup-request",
      "auth/operation-not-supported-in-this-environment",
    ].includes(err?.code);
    if (fallback) return signInWithRedirect(auth, provider);
    throw err;
  }
}

export const logout = () => signOut(auth);

export function resolveRedirect() {
  return getRedirectResult(auth).catch(() => null);
}

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

/* ---------- Reexports do Firestore ---------- */

export {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp,
  arrayUnion, arrayRemove, increment, writeBatch, runTransaction, deleteField,
};
