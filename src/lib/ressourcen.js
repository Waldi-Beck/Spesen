// Logos und (optionale) QPS-Excel-Vorlage aus public/vorlage/ laden.
import { VORLAGE } from '../config/vorlage.js';

const basisUrl = import.meta.env.BASE_URL;
let cache = null;

async function ladeBytes(pfad, { pruefeXlsx = false } = {}) {
  try {
    const r = await fetch(basisUrl + pfad, { cache: 'no-cache' });
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    // Dev-Server liefert bei fehlenden Dateien index.html – echte xlsx beginnt mit "PK"
    if (pruefeXlsx && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) return null;
    return bytes;
  } catch {
    return null;
  }
}

export async function ladeRessourcen() {
  if (cache) return cache;
  const [qps, engineering, labs, measure, vorlage] = await Promise.all([
    ladeBytes('vorlage/logo-qps.png'),
    ladeBytes('vorlage/logo-engineering.png'),
    ladeBytes('vorlage/logo-labs.png'),
    ladeBytes('vorlage/logo-measure.png'),
    ladeBytes(VORLAGE.datei, { pruefeXlsx: true }),
  ]);
  cache = { logos: { qps, engineering, labs, measure }, vorlage };
  return cache;
}
