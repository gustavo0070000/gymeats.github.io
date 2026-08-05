// Compressão de imagem no próprio navegador.
// A foto vira um data URL (base64) que cabe num documento do Firestore
// (teto do Firestore é 1 MiB por documento — trabalhamos bem abaixo disso).

// Maior lado do canvas intermediário. Tudo que o app gera sai deste canvas,
// então a foto original é decodificada uma vez só.
const TRABALHO_MAX = 1080;

const MIME = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  return c.toDataURL("image/webp").startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
})();

async function loadBitmap(file) {
  const kb = Math.round((file?.size || 0) / 1024);

  // `from-image` respeita o EXIF (foto de celular deitada).
  // Se a decodificação cheia falhar — foto de 50 MP num aparelho sem RAM
  // sobrando —, tenta de novo pedindo pro próprio navegador reduzir na
  // decodificação, que custa bem menos memória.
  if (typeof createImageBitmap === "function") {
    for (const opcoes of [
      { imageOrientation: "from-image" },
      { imageOrientation: "from-image", resizeWidth: TRABALHO_MAX, resizeQuality: "medium" },
      { imageOrientation: "from-image", resizeHeight: TRABALHO_MAX, resizeQuality: "medium" },
    ]) {
      try {
        return await createImageBitmap(file, opcoes);
      } catch { /* tenta a próxima */ }
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((ok, fail) => {
      img.onload = ok;
      img.onerror = () => fail(new Error(
        `Não consegui ler essa imagem (${file?.type || "tipo desconhecido"}, ${kb} KB). `
        + "Tente escolher a foto pela galeria, ou tire outra."));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function draw(bitmap, maxEdge, square) {
  const sw = bitmap.width, sh = bitmap.height;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (square) {
    const side = Math.min(maxEdge, Math.min(sw, sh));
    canvas.width = canvas.height = side;
    const crop = Math.min(sw, sh);
    ctx.drawImage(bitmap, (sw - crop) / 2, (sh - crop) / 2, crop, crop, 0, 0, side, side);
  } else {
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

const toDataURL = (canvas, quality) =>
  new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(canvas.toDataURL(MIME, quality));
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
      }, MIME, quality);
    } else {
      resolve(canvas.toDataURL(MIME, quality));
    }
  });

/**
 * Uma decodificação só, já reduzida ao tamanho de trabalho.
 *
 * Antes cada saída (foto, miniatura, micro) decodificava o arquivo
 * original por conta própria — e o post fazia as três em paralelo. Numa
 * câmera de 50 MP isso é decodificar três imagens gigantes ao mesmo
 * tempo, e num aparelho sem RAM sobrando as três falham juntas. Era o
 * "Não consegui ler essa imagem" que travava um membro do grupo.
 */
async function canvasDeTrabalho(file) {
  const bitmap = await loadBitmap(file);
  try {
    return draw(bitmap, TRABALHO_MAX, false);
  } finally {
    bitmap.close?.();   // libera a original antes de gerar qualquer saída
  }
}

/** Reduz qualidade e depois resolução até caber em maxBytes. */
async function comprimirDe(fonte, { maxEdge = 1080, maxBytes = 700 * 1024, square = false } = {}) {
  let edge = maxEdge;
  for (let pass = 0; pass < 5; pass++) {
    const canvas = draw(fonte, edge, square);
    for (const q of [0.75, 0.62, 0.5, 0.4]) {
      const url = await toDataURL(canvas, q);
      if (url.length <= maxBytes) return url;
    }
    edge = Math.round(edge * 0.75);
  }
  // Último recurso: bem pequena, mas garantidamente dentro do limite.
  return toDataURL(draw(fonte, 480, square), 0.4);
}

/** Comprime até caber em maxBytes. Retorna um data URL. */
export async function compress(file, opcoes = {}) {
  return comprimirDe(await canvasDeTrabalho(file), opcoes);
}

/**
 * As três saídas de um prato, de uma decodificação só.
 * É o caminho que o post usa; separado, ele multiplicava por três o pico
 * de memória sem nenhum ganho.
 */
export async function prepararFotos(file, { maxEdge = 1080, maxBytes = 700 * 1024 } = {}) {
  const fonte = await canvasDeTrabalho(file);
  return {
    photo: await comprimirDe(fonte, { maxEdge, maxBytes }),
    thumb: await comprimirDe(fonte, { maxEdge: 160, maxBytes: 14 * 1024, square: true }),
    micro: await comprimirDe(fonte, { maxEdge: 96, maxBytes: 2400, square: true }),
  };
}

/** Miniatura quadrada minúscula (~5 KB) que fica embutida no post. */
export function thumbnail(file) {
  return compress(file, { maxEdge: 160, maxBytes: 14 * 1024, square: true });
}

/** Menor ainda: cabe no orçamento de 4 KB do payload da notificação. */
export function microThumbnail(file) {
  return compress(file, { maxEdge: 96, maxBytes: 2400, square: true });
}

/** Converte um data URL de volta para File (usado ao reabrir a foto no editor). */
export async function dataUrlToFile(dataUrl, name = "foto") {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type });
}

export function approxKB(dataUrl) {
  return Math.round((dataUrl?.length || 0) / 1024);
}
