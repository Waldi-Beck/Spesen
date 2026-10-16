// Erzeugt eine Muster-Abrechnung (Excel + PDF) aus den Juli-2026-Testdaten.
// Aufruf:  npm run beispiel   ->  Dateien landen in ./beispiel/
//
// Liegt eine leere QPS-Vorlage unter public/vorlage/Spesenvorlage.xlsx,
// wird diese befüllt – so lässt sich die Vorlagen-Zuordnung am PC testen.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { erstelleExcel } from '../src/lib/excelExport.js';
import { erstellePdf } from '../src/lib/pdfExport.js';
import { positionen, summen } from '../src/lib/berechnung.js';
import { dateiBasis } from '../src/lib/format.js';
import { JULI_2026, PROFIL } from '../tests/juli2026.js';

const lies = (p) => readFile(new URL(p, import.meta.url));
const gibtEs = (p) => access(new URL(p, import.meta.url)).then(() => true, () => false);

const logos = {
  qps: await lies('../public/vorlage/logo-qps.png'),
  engineering: await lies('../public/vorlage/logo-engineering.png'),
  labs: await lies('../public/vorlage/logo-labs.png'),
  measure: await lies('../public/vorlage/logo-measure.png'),
};
const vorlagePfad = '../public/vorlage/Spesenvorlage.xlsx';
const vorlage = (await gibtEs(vorlagePfad)) ? await lies(vorlagePfad) : null;
const platzhalter = await lies('../tests/fixtures/beleg-platzhalter.jpg');

const pos = positionen(JULI_2026, 'erfassung');
const dateien = new Map(pos.map((b) => [b.id, [{ typ: 'image/jpeg', bytes: platzhalter }]]));
const basis = { profil: PROFIL, monat: '2026-07', positionen: pos, datum: '2026-07-15', logos };

const excel = await erstelleExcel({ ...basis, vorlage });
const pdf = await erstellePdf({ ...basis, dateien, muster: true });

await mkdir(new URL('../beispiel/', import.meta.url), { recursive: true });
const name = dateiBasis('2026-07');
await writeFile(new URL(`../beispiel/${name} (Muster).xlsx`, import.meta.url), Buffer.from(excel.buffer));
await writeFile(new URL(`../beispiel/${name} + Belege (Muster).pdf`, import.meta.url), pdf);

const s = summen(pos);
console.log(`Excel aus: ${excel.quelle === 'vorlage' ? 'QPS-Vorlage' : 'App-Format (keine Vorlage gefunden)'}`);
excel.hinweise.forEach((h) => console.log(`  Hinweis: ${h}`));
console.log(`${s.anzahl} Positionen · CHF ${s.chf} · EUR ${s.eur} · MWST 8.1 % ${s.mwst81} · 2.6 % ${s.mwst26}`);
console.log('Dateien in ./beispiel/');
