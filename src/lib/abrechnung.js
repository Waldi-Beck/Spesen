// Abrechnung im Browser zusammenstellen: Excel + PDF erzeugen.
// Wird erst beim Erstellen nachgeladen (ExcelJS + pdf-lib sind gross).
import { erstelleExcel } from './excelExport.js';
import { erstellePdf } from './pdfExport.js';
import { positionen, summen } from './berechnung.js';
import { dateiBasis, heuteISO } from './format.js';
import { ladeRessourcen } from './ressourcen.js';
import { dateienVon } from '../db/db.js';

const dataUrlZuBytes = (url) => {
  if (!url) return null;
  const bin = atob(url.split(',')[1]);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/**
 * Erzeugt Excel + PDF für die übergebenen (offenen) Belege.
 * @returns {{ excel, pdf, hinweise, summen, belegIds }}
 */
export async function erstelleAbrechnung({ monat, belege, einst }) {
  const { logos, vorlage } = await ladeRessourcen();
  const pos = positionen(belege);
  const dateien = new Map();
  for (const b of pos) {
    const liste = await dateienVon(b.id);
    const sortiert = (b.dateien || []).map((id) => liste.find((d) => d.id === id)).filter(Boolean);
    dateien.set(b.id, await Promise.all(sortiert.map(async (d) => ({ typ: d.typ, bytes: new Uint8Array(await d.blob.arrayBuffer()) }))));
  }
  const basis = {
    profil: einst.profil, monat, positionen: pos, datum: heuteISO(),
    unterschrift: dataUrlZuBytes(einst.unterschrift), logos,
  };
  const [excel, pdf] = await Promise.all([
    erstelleExcel({ ...basis, vorlage: vorlage ? vorlage.slice() : null }),
    erstellePdf({ ...basis, dateien }),
  ]);
  const name = dateiBasis(monat, einst.profil?.name);
  return {
    excel: {
      name: `${name}.xlsx`,
      typ: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      blob: new Blob([excel.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    },
    pdf: { name: `${name} + Belege.pdf`, typ: 'application/pdf', blob: new Blob([pdf], { type: 'application/pdf' }) },
    hinweise: excel.hinweise,
    quelle: excel.quelle,
    summen: summen(pos),
    belegIds: pos.map((b) => b.id),
  };
}
