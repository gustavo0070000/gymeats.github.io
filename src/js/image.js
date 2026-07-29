// Compressão de imagem no próprio navegador.
// A foto vira um data URL (base64) que cabe num documento do Firestore
// (teto do Firestore é 1 MiB por documento — trabalhamos bem abaixo disso).

const MIME = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  return c.toDataURL("image/webp").startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
})();

async function loadBitmap(file) {
  // `from-image` respeita o EXIF (foto de celular deitada)
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch { /* cai no fallback */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((ok, fail) => {
      img.onload = ok;
      img.onerror = () => fail(new Error("Não consegui ler essa imagem."));
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
 * Comprime até caber em maxBytes, baixando qualidade e depois resolução.
 * Retorna um data URL.
 */
export async function compress(file, { maxEdge = 1080, maxBytes = 700 * 1024, square = false } = {}) {
  const bitmap = await loadBitmap(file);
  let edge = maxEdge;

  for (let pass = 0; pass < 5; pass++) {
    const canvas = draw(bitmap, edge, square);
    for (const q of [0.75, 0.62, 0.5, 0.4]) {
      const url = await toDataURL(canvas, q);
      if (url.length <= maxBytes) {
        bitmap.close?.();
        return url;
      }
    }
    edge = Math.round(edge * 0.75);
  }

  // Último recurso: bem pequena, mas garantidamente dentro do limite.
  const url = await toDataURL(draw(bitmap, 480, square), 0.4);
  bitmap.close?.();
  return url;
}

/** Miniatura quadrada minúscula (~5 KB) que fica embutida no post, pro feed carregar rápido. */
export function thumbnail(file) {
  return compress(file, { maxEdge: 160, maxBytes: 14 * 1024, square: true });
}

/**
 * Versão ainda menor, pra viajar dentro da notificação push.
 * O campo de dados do FCM tem teto de 4 KB no total, então a miniatura do
 * feed não cabe — esta precisa ficar abaixo de ~2,5 KB sozinha.
 */
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
