// Tudo que é específico de comida: cozinhas do passaporte, tipos de
// refeição e as regras de pontuação do desafio.
//
// Nada aqui é lei: cada desafio pode trocar refeições, selos e valores no
// documento do próprio desafio. O que está neste arquivo é o padrão usado
// enquanto o dono não mexeu em nada — assim um desafio antigo, que não tem
// nenhum desses campos gravados, continua funcionando exatamente igual.

export const MEALS = [
  { id: "cafe", label: "Café", emoji: "☕", weight: 1 },
  { id: "almoco", label: "Almoço", emoji: "🍽️", weight: 1 },
  { id: "lanche", label: "Lanche", emoji: "🥪", weight: 1 },
  { id: "janta", label: "Janta", emoji: "🍝", weight: 1 },
  { id: "sobremesa", label: "Sobremesa", emoji: "🍰", weight: 1 },
];

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

/* ============================================================
   Configuração por desafio

   Refeições, selos e valores moram em `challenges/{cid}`. Enquanto o
   dono não mexe, o campo simplesmente não existe e cai no padrão acima —
   é o que faz um desafio criado antes disto continuar idêntico.
   ============================================================ */

export const DEFAULT_RULES = {
  bought: 1,             // prato comprado
  homemade: 2,           // prato feito em casa
  streakFrom: 7,         // sequência a partir da qual o bônus liga
  streakMultiplier: 1.5, // quanto o bônus multiplica
  repeatMeal: 0,         // 2º prato da MESMA refeição no mesmo dia
  guessPrice: 0.5,       // cravou o preço de um prato alheio
  guessKcal: 0.5,        // cravou as calorias de um prato alheio
  tolPrice: 0,           // margem, em reais, pra contar como cravada
  tolKcal: 0,            // margem, em kcal
};

export const rulesOf = (challenge) => ({ ...DEFAULT_RULES, ...(challenge?.rules || {}) });
export const mealsOf = (challenge) => (challenge?.meals?.length ? challenge.meals : MEALS);
export const cuisinesOf = (challenge) => (challenge?.cuisines?.length ? challenge.cuisines : CUISINES);
export const eventsOf = (challenge) => (challenge?.events || []);

// O `challenge` é opcional de propósito: metade das telas conhece o desafio
// e a outra metade só tem o prato na mão. Sem ele, vale a lista padrão.
export const mealById = (id, challenge) => mealsOf(challenge).find((m) => m.id === id);
export const cuisineById = (id, challenge) => cuisinesOf(challenge).find((c) => c.id === id);

/** Peso da refeição. Refeição desconhecida (ou nenhuma) não penaliza: vale 1. */
export function mealWeight(mealType, challenge) {
  if (!mealType) return 1;
  const w = Number(mealsOf(challenge).find((m) => m.id === mealType)?.weight);
  return isFinite(w) && w >= 0 ? w : 1;
}

/**
 * O selo desenhado: imagem própria quando o desafio subiu uma, senão o emoji.
 * O `id` cru aparece quando o selo foi apagado da configuração mas ainda
 * existe em pratos antigos — some da lista de opções sem sumir do passado.
 */
export function stampIcon(cuisine, size = 26) {
  if (cuisine?.image) {
    const src = String(cuisine.image).replace(/"/g, "&quot;");
    return `<img class="selo-img" src="${src}" alt="" style="width:${size}px;height:${size}px">`;
  }
  // Medalha, não prato: o caso sem emoji é quase sempre um selo que saiu da
  // configuração e sobreviveu no passaporte de quem já tinha ganhado.
  return cuisine?.emoji || "🏅";
}

/** Rótulo de um selo que pode não existir mais na configuração. */
export const cuisineLabel = (id, challenge) => cuisineById(id, challenge)?.label || id || "";

/* ============================================================
   Pontuação

   Padrão: comprado 1, cozinhado 2, e a partir de 7 dias seguidos tudo
   vale 1,5x. Cada refeição tem um peso que multiplica esse valor — é o
   que permite criar "pré/pós treino" valendo 0,5 sem mexer no resto.

   O acumulado por dia fica em `dayPoints` e o total do membro em
   `totalPoints`; os dois saem da MESMA conta, feita em recountMember.
   ============================================================ */

export const POINTS_BOUGHT = DEFAULT_RULES.bought;
export const POINTS_HOMEMADE = DEFAULT_RULES.homemade;
export const STREAK_BONUS_FROM = DEFAULT_RULES.streakFrom;
export const STREAK_MULTIPLIER = DEFAULT_RULES.streakMultiplier;

/**
 * Pontos-base de um prato, já com o peso da refeição.
 * `repetida` é o segundo prato da mesma refeição no mesmo dia: continua
 * podendo ser postado (a galera chuta preço e caloria nele), só não soma.
 */
export function platePoints({ homemade, mealType, repetida = false } = {}, challenge) {
  const r = rulesOf(challenge);
  if (repetida) return Number(r.repeatMeal) || 0;
  const base = homemade ? Number(r.homemade) : Number(r.bought);
  return (isFinite(base) ? base : 0) * mealWeight(mealType, challenge);
}

/** Multiplica pelo bônus quando a sequência (contando o dia do prato) bate. */
export function applyStreak(base, streakWithToday, challenge) {
  const r = rulesOf(challenge);
  const mult = streakWithToday >= r.streakFrom ? Number(r.streakMultiplier) || 1 : 1;
  return base * mult;
}

/* Versões antigas, sem peso de refeição. Continuam existindo porque os
   pratos publicados antes disto são pontuados pela regra que valia na
   época — a mudança combinada foi "daqui pra frente". */
export function basePoints(homemade) {
  return homemade ? POINTS_HOMEMADE : POINTS_BOUGHT;
}

export function pointsFor(homemade, streakWithToday) {
  const bonus = streakWithToday >= STREAK_BONUS_FROM ? STREAK_MULTIPLIER : 1;
  return basePoints(homemade) * bonus;
}

/**
 * Marca gravada no prato dizendo por qual motor ele é pontuado.
 * Prato sem a marca é anterior à configuração por desafio e usa o
 * `basePoints` que já está gravado nele.
 */
export const MOTOR_ATUAL = 2;

/** Pontos-base de um prato já gravado, respeitando a era dele. */
export function storedPlatePoints(post, challenge, repetida = false) {
  if ((Number(post?.pointsRules) || 0) >= MOTOR_ATUAL) {
    return platePoints({ homemade: !!post.homemade, mealType: post.mealType, repetida }, challenge);
  }
  const guardado = Number(post?.basePoints);
  return isFinite(guardado) ? guardado : basePoints(!!post?.homemade);
}

/* ============================================================
   Eventos (missões com selo)

   "Mês alemão: coma 3 cozinhas da lista e leve 2 pontos." O evento olha
   quantos selos DIFERENTES da lista a pessoa carimbou dentro da janela.
   ============================================================ */

/** `marcas` = [{ cuisine, dia }] dos pratos da pessoa. */
export function eventProgress(evento, marcas = []) {
  const need = Math.max(1, Number(evento?.need) || 1);
  const alvo = new Set(evento?.cuisineIds || []);
  const feitas = new Set();
  let ultimoDia = "";

  // Em ordem de dia: o "dia da conclusão" tem que ser o do prato que fechou
  // a conta, não o do último prato que a lista por acaso trouxe primeiro.
  const emOrdem = [...marcas].sort((a, b) => String(a.dia).localeCompare(String(b.dia)));

  for (const { cuisine, dia } of emOrdem) {
    if (!cuisine || !alvo.has(cuisine) || feitas.has(cuisine)) continue;
    if (evento.from && dia && dia < evento.from) continue;
    if (evento.to && dia && dia > evento.to) continue;
    feitas.add(cuisine);
    if (dia > ultimoDia) ultimoDia = dia;
    // O dia da conclusão é o do prato que fechou a conta.
    if (feitas.size === need) return { feitas: feitas.size, need, ok: true, dia };
  }
  return { feitas: feitas.size, need, ok: feitas.size >= need, dia: ultimoDia };
}

/** Um evento está valendo na data de hoje? */
export function eventoAberto(evento, dia) {
  if (evento?.from && dia < evento.from) return false;
  if (evento?.to && dia > evento.to) return false;
  return true;
}

/**
 * 1.5 -> "1,5", 3 -> "3", 0.25 -> "0,25".
 *
 * Arredondava numa casa só, o que bastava enquanto todo ponto era múltiplo
 * de 0,5. Com peso por refeição isso passou a mentir: uma refeição de peso
 * 0,25 aparecia como "0,3" na tela e como 0,25 no placar.
 */
export function formatPoints(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  if (Number.isInteger(v)) return String(v);
  // duas casas só quando a segunda diz alguma coisa
  const casas = Math.round(v * 10) / 10 === v ? 1 : 2;
  return v.toFixed(casas).replace(".", ",");
}

/** "1 pt", "2 pts", "0,25 pts" — o singular só vale pro 1 exato. */
export function pointsLabel(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${formatPoints(v)} ${v === 1 ? "pt" : "pts"}`;
}

/** "1.240 kcal" — separador de milhar, sem casa decimal. */
export function formatKcal(n) {
  const v = Math.round(Number(n) || 0);
  return `${v.toLocaleString("pt-BR")} kcal`;
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

/**
 * Cravou? Chegar mais perto que os outros não é cravar — cravar é acertar.
 * A tolerância é configurável porque acertar caloria na unidade é quase
 * impossível: com `tolKcal: 25`, um chute de 700 crava um prato de 690.
 * O epsilon existe só pra 32,10 − 32,10 não dar 0,0000001 em ponto flutuante.
 */
export function cravou(palpite, real, tolerancia = 0) {
  const p = Number(palpite), r = Number(real);
  if (!isFinite(p) || !isFinite(r)) return false;
  return Math.abs(p - r) <= (Number(tolerancia) || 0) + 0.001;
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
