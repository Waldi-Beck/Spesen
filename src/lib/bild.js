// Fotos verkleinern, richtig drehen und als JPEG speichern (nur Browser).

async function ladeBitmap(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // Fallback für ältere Browser
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const zuBlob = (canvas, qualitaet) =>
  new Promise((ok, fehler) => canvas.toBlob((b) => (b ? ok(b) : fehler(new Error('Bild konnte nicht gespeichert werden'))), 'image/jpeg', qualitaet));

/** Bild auf max. `maxSeite` px (lange Kante) verkleinern und als JPEG zurückgeben. */
export async function verkleinere(blob, maxSeite, qualitaet = 0.82) {
  const bmp = await ladeBitmap(blob);
  const s = Math.min(1, maxSeite / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * s);
  canvas.height = Math.round(bmp.height * s);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return zuBlob(canvas, qualitaet);
}

/** Bild um 90° im Uhrzeigersinn drehen. */
export async function drehe(blob) {
  const bmp = await ladeBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.height;
  canvas.height = bmp.width;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bmp, 0, 0);
  return zuBlob(canvas, 0.85);
}

export const istPdf = (datei) => datei.type === 'application/pdf' || /\.pdf$/i.test(datei.name || '');
