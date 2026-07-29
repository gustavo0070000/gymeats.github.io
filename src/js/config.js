// ============================================================
//  CONFIGURAÇÃO DO FIREBASE
// ------------------------------------------------------------
//  Cole aqui o objeto que o console do Firebase te mostra em
//  Configurações do projeto > Seus apps > SDK setup and configuration.
//
//  Essas chaves são PÚBLICAS por design — elas só identificam o
//  projeto. Quem protege os dados são as regras do Firestore
//  (arquivo firestore.rules na raiz do repo).
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyBGfjT_Kj0bnGp8xLRMHevSiWI-NU1lxXw",
  authDomain: "ogusamaaisa.firebaseapp.com",
  projectId: "ogusamaaisa",
  storageBucket: "ogusamaaisa.firebasestorage.app",
  messagingSenderId: "229851835417",
  appId: "1:229851835417:web:f533cfea51620ed049ce88",
};

// Quanto a foto é comprimida antes de virar base64 no Firestore.
// Documento do Firestore tem teto de 1 MiB — deixamos folga.
export const PHOTO = {
  maxEdge: 1080,        // maior lado da foto do prato, em px
  maxBytes: 700 * 1024, // teto do data URL gerado
  avatarEdge: 256,      // foto de perfil / banner do desafio
  avatarBytes: 120 * 1024,
};

export const APP_NAME = "GymEats";

// Aparece em Minha conta. Serve pra saber qual código está rodando
// de verdade no celular quando algo parece estranho.
export const APP_VERSION = "v6";

export function isConfigured() {
  const key = String(firebaseConfig.apiKey || "");
  return key.length > 10 && !key.includes("COLE_AQUI");
}
