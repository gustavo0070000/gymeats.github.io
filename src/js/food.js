// Tudo que é específico de comida: cozinhas do passaporte, tipos de
// refeição e as regras de pontuação do desafio.

export const MEALS = [
  { id: "cafe", label: "Café", emoji: "☕" },
  { id: "almoco", label: "Almoço", emoji: "🍽️" },
  { id: "lanche", label: "Lanche", emoji: "🥪" },
  { id: "janta", label: "Janta", emoji: "🍝" },
  { id: "sobremesa", label: "Sobremesa", emoji: "🍰" },
];
export const mealById = (id) => MEALS.find((m) => m.id === id);

/* ============================================================
   Passaporte gastronômico
   Cada cozinha vira um carimbo desbloqueado na primeira vez que
   você posta um prato dela.
   ============================================================ */

export const CUISINES = [
  { id: "brasileira", label: "Brasileira", emoji: "🇧🇷" },
  { id: "churrasco", label: "Churrasco", emoji: "🥩" },
  { id: "mineira", label: "Mineira", emoji: "⛰️" },
  { id: "nordestina", label: "Nordestina", emoji: "🌵" },
  { id: "japonesa", label: "Japonesa", emoji: "🇯🇵" },
  { id: "chinesa", label: "Chinesa", emoji: "🇨🇳" },
  { id: "coreana", label: "Coreana", emoji: "🇰🇷" },
  { id: "tailandesa", label: "Tailandesa", emoji: "🇹🇭" },
  { id: "vietnamita", label: "Vietnamita", emoji: "🇻🇳" },
  { id: "indiana", label: "Indiana", emoji: "🇮🇳" },
  { id: "arabe", label: "Árabe", emoji: "🧆" },
  { id: "turca", label: "Turca", emoji: "🇹🇷" },
  { id: "italiana", label: "Italiana", emoji: "🇮🇹" },
  { id: "francesa", label: "Francesa", emoji: "🇫🇷" },
  { id: "portuguesa", label: "Portuguesa", emoji: "🇵🇹" },
  { id: "espanhola", label: "Espanhola", emoji: "🇪🇸" },
  { id: "grega", label: "Grega", emoji: "🇬🇷" },
  { id: "alema", label: "Alemã", emoji: "🇩🇪" },
  { id: "mexicana", label: "Mexicana", emoji: "🇲🇽" },
  { id: "peruana", label: "Peruana", emoji: "🇵🇪" },
  { id: "argentina", label: "Argentina", emoji: "🇦🇷" },
  { id: "americana", label: "Americana", emoji: "🍔" },
  { id: "vegetariana", label: "Vegetariana", emoji: "🥦" },
  { id: "doceria", label: "Doceria", emoji: "🍩" },
];
export const cuisineById = (id) => CUISINES.find((c) => c.id === id);

/* ============================================================
   Pontuação

   - prato comprado ............ 1 ponto
   - prato feito em casa ....... 2 pontos
   - a partir de 7 dias seguidos, tudo vale 1,5x

   Os pontos são por DIA, não por post: o dia fica valendo o
   melhor prato daquele dia (cozinhar depois de ter comprado
   sobe a pontuação do dia, postar de novo não acumula).
   ============================================================ */

export const POINTS_BOUGHT = 1;
export const POINTS_HOMEMADE = 2;
export const STREAK_BONUS_FROM = 7;
export const STREAK_MULTIPLIER = 1.5;

export function basePoints(homemade) {
  return homemade ? POINTS_HOMEMADE : POINTS_BOUGHT;
}

export function pointsFor(homemade, streakWithToday) {
  const bonus = streakWithToday >= STREAK_BONUS_FROM ? STREAK_MULTIPLIER : 1;
  return basePoints(homemade) * bonus;
}

/** 1.5 -> "1,5" e 3 -> "3" */
export function formatPoints(n) {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
}

export function formatMoney(n) {
  const v = Number(n);
  if (!isFinite(v)) return "";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ============================================================
   Notas
   ============================================================ */

// Um prato só entra nos rankings de melhor/pior com um mínimo de
// votos, senão uma nota solitária decide tudo.
export const MIN_RATINGS = 2;

// Abaixo dessa média o prato entra no Rango da Vergonha.
export const SHAME_BELOW = 6;

export function ratingAverage(ratings = {}) {
  const values = Object.values(ratings);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function formatRating(n) {
  if (n == null) return "—";
  return (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
}

/** Quem chegou mais perto do preço real. */
export function guessWinner(guesses = {}, price) {
  const entries = Object.entries(guesses);
  if (!entries.length || !isFinite(price)) return null;
  let best = null;
  for (const [uid, value] of entries) {
    const diff = Math.abs(value - price);
    if (!best || diff < best.diff) best = { uid, value, diff };
  }
  return best;
}

/* ============================================================
   Lugares (guia do grupo)
   ============================================================ */

/** "Bar do Zé " e "bar do ze" viram a mesma chave. */
export function placeKey(name) {
  return String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
