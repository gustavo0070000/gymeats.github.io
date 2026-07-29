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

   Os pontos são por post: cada prato vale 1 ponto se foi comprado
   e 2 pontos se foi feito em casa. O acumulado por dia fica em
   dayPoints, e o total do membro usa totalPoints para o ranking.
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

/**
 * Quem chegou mais perto do preço real.
 * Devolve TODOS os empatados: dois palpites iguais são a mesma vitória,
 * e antes só o primeiro da lista levava o troféu.
 */
export function guessWinners(guesses = {}, price) {
  const entries = Object.entries(guesses);
  if (!entries.length || !isFinite(price)) return [];
  const comDiferenca = entries.map(([uid, value]) => ({
    uid, value, diff: Math.abs(value - price),
  }));
  const menor = Math.min(...comDiferenca.map((g) => g.diff));
  return comDiferenca.filter((g) => g.diff === menor);
}

/** Um vencedor só, pra quando basta saber se existe algum. */
export function guessWinner(guesses = {}, price) {
  return guessWinners(guesses, price)[0] || null;
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

/** Chave a partir da coordenada, pra quando o lugar não tem nome.
    Três casas decimais ≈ 100 m, o suficiente pra agrupar o mesmo lugar. */
export function coordKey({ lat, lng } = {}) {
  if (!isFinite(lat) || !isFinite(lng)) return "";
  return `geo-${Number(lat).toFixed(3)}-${Number(lng).toFixed(3)}`.replace(/\./g, "_");
}

/** A chave de um lugar: o nome quando existe, senão a coordenada. */
export function resolvePlaceKey(name, coords) {
  return placeKey(name) || coordKey(coords || {});
}
