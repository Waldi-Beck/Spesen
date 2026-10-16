// Excel-Export im Format der QPS-Spesentabelle.
//
// Weg 1 (bevorzugt): die originale, leere QPS-Vorlage (.xlsx) wird geladen und befüllt.
//                    Formatierung, Logos und Formeln der Vorlage bleiben erhalten.
// Weg 2 (Fallback):  Ist keine Vorlage vorhanden oder passt sie nicht, baut die App
//                    die Tabelle im gleichen Aufbau selbst.
//
// Läuft im Browser und in Node (Tests, Beispiel-Skript).
import ExcelJS from 'exceljs';
import { VORLAGE } from '../config/vorlage.js';
import { FIRMA } from '../config/einstellungen.js';
import { tabellenZeile, summen } from './berechnung.js';
import { datumAlsUTC, monatsname, zuBase64 } from './format.js';

const FMT_CHF = '"CHF"* #,##0.00;"CHF"* -#,##0.00;"CHF"* "-"';
const FMT_EUR = '"EUR"* #,##0.00;"EUR"* -#,##0.00;"EUR"* "-"';
const FMT_DATUM = 'dd.mm.yyyy';

/**
 * @param {object} p
 * @param {ArrayBuffer|Uint8Array|null} p.vorlage   leere QPS-Vorlage oder null
 * @param {object} p.profil        { name, vorname, email, filialeStein }
 * @param {string} p.monat         "2026-07"
 * @param {Array}  p.positionen    Belege mit nr (siehe berechnung.positionen)
 * @param {string} p.datum         Datum der Abrechnung, ISO
 * @param {Uint8Array} [p.unterschrift] PNG
 * @param {object} [p.logos]       { qps, engineering, labs, measure } PNG-Bytes
 * @returns {Promise<{ buffer: ArrayBuffer, quelle: 'vorlage'|'app', hinweise: string[] }>}
 */
export async function erstelleExcel(p) {
  const hinweise = [];
  if (p.vorlage) {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(p.vorlage);
      fuelleVorlage(wb, p, hinweise);
      return { buffer: await wb.xlsx.writeBuffer(), quelle: 'vorlage', hinweise };
    } catch (e) {
      hinweise.push(`QPS-Vorlage konnte nicht befüllt werden (${e.message}) – Tabelle im App-Format erstellt.`);
    }
  }
  const wb = baueTabelle(p);
  return { buffer: await wb.xlsx.writeBuffer(), quelle: 'app', hinweise };
}

// ---------------------------------------------------------------------------
// Weg 1: Vorlage befüllen
// ---------------------------------------------------------------------------

export function fuelleVorlage(wb, p, hinweise = []) {
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Vorlage enthält kein Tabellenblatt');

  // --- Tabellenkopf finden
  const kopf = finde(ws, istText(VORLAGE.tabelle.auslagen))[0];
  if (!kopf) throw new Error('Spalte "Auslagen" nicht gefunden');
  const kopfZeile = kopf.row;
  const spalten = {};
  for (const [key, kand] of Object.entries(VORLAGE.tabelle)) {
    const z = finde(ws, istText(kand), { zeile: kopfZeile })[0];
    if (!z) throw new Error(`Spalte "${kand[0]}" nicht gefunden`);
    spalten[key] = z.col;
  }
  const ende = finde(ws, istText([VORLAGE.tabellenEnde]), { abZeile: kopfZeile + 1 })[0];
  if (!ende) throw new Error(`"${VORLAGE.tabellenEnde}" nicht gefunden`);
  const ersteZeile = kopfZeile + 1;
  const kapazitaet = ende.row - ersteZeile;
  if (p.positionen.length > kapazitaet) {
    throw new Error(`Vorlage hat nur ${kapazitaet} Positionszeilen, benötigt ${p.positionen.length}`);
  }

  // Betragsspalten: steht "CHF"/"EUR" als Text in eigener Zelle, liegt der Wert rechts daneben
  for (const key of ['chf', 'mwst81', 'mwst26', 'eur']) {
    const z = ws.getCell(ersteZeile, spalten[key]);
    if (typeof zellText(z) === 'string' && /^(CHF|EUR)$/i.test(String(zellText(z)).trim())) {
      spalten[key] = naechsteZelle(ws, z).col;
    }
  }

  // Laufnummer links neben "Auslagen"?
  let nrSpalte = null;
  if (spalten.auslagen > 1) {
    for (let r = ersteZeile; r < ende.row; r++) {
      if (typeof zellText(ws.getCell(r, spalten.auslagen - 1)) === 'number') nrSpalte = spalten.auslagen - 1;
    }
  }

  // --- Kopfdaten
  const titel = finde(ws, (t) => typeof t === 'string' && norm(t).startsWith(norm(VORLAGE.kopf.titel)))[0];
  if (titel) titel.value = `${VORLAGE.kopf.titel} ${p.monat.slice(0, 4)}`;
  setzeRechts(ws, VORLAGE.kopf.name, p.profil?.name, hinweise);
  setzeRechts(ws, VORLAGE.kopf.vorname, p.profil?.vorname, hinweise);
  setzeRechts(ws, VORLAGE.kopf.email, p.profil?.email, hinweise);
  setzeRechts(ws, VORLAGE.kopf.monat, monatsname(p.monat), hinweise);

  const filiale = finde(ws, istText([VORLAGE.kopf.filiale]))[0];
  if (filiale) {
    const ja = naechsteZelle(ws, filiale);
    const jaX = naechsteZelle(ws, ja);
    const nein = naechsteZelle(ws, jaX);
    const neinX = naechsteZelle(ws, nein);
    if (norm(zellText(ja)) === 'ja' && norm(zellText(nein)) === 'nein') {
      jaX.value = p.profil?.filialeStein ? 'X' : null;
      neinX.value = p.profil?.filialeStein ? null : 'X';
    } else hinweise.push('Feld "Filiale Stein Ja/Nein" nicht eindeutig gefunden');
  }

  // --- Positionen
  for (let i = 0; i < kapazitaet; i++) {
    const r = ersteZeile + i;
    const pos = p.positionen[i];
    const z = pos ? tabellenZeile(pos) : null;
    if (nrSpalte) ws.getCell(r, nrSpalte).value = i + 1;
    ws.getCell(r, spalten.auslagen).value = z ? z.auslagen : null;
    const dz = ws.getCell(r, spalten.datum);
    dz.value = z?.datum ? datumAlsUTC(z.datum) : null;
    if (z?.datum) dz.numFmt = FMT_DATUM;
    ws.getCell(r, spalten.details).value = z ? z.details : null;
    ws.getCell(r, spalten.chf).value = z ? z.chf : null;
    ws.getCell(r, spalten.eur).value = z ? z.eur : null;
    if (VORLAGE.mwstAlsWert) {
      ws.getCell(r, spalten.mwst81).value = z ? z.mwst81 : null;
      ws.getCell(r, spalten.mwst26).value = z ? z.mwst26 : null;
    }
  }

  // --- Fuss: Datum + Unterschrift
  const fussDatum = finde(ws, istText([VORLAGE.fussDatum]), { abZeile: ende.row + 1 })[0];
  if (fussDatum && p.datum) {
    const zelle = ws.getCell(fussDatum.row - 1, fussDatum.col).master;
    zelle.value = datumAlsUTC(p.datum);
    zelle.numFmt = FMT_DATUM;
  } else hinweise.push('Feld "Datum" unter der Tabelle nicht gefunden');

  const ul = finde(ws, istText([VORLAGE.unterschrift]), { abZeile: ende.row + 1 })[0];
  if (ul && p.unterschrift) {
    const bild = wb.addImage({ base64: zuBase64(p.unterschrift), extension: 'png' });
    ws.addImage(bild, { tl: ankerUeber(ws, ul.row, ul.col, 46), ext: { width: 170, height: 46 } });
  }

  // Excel soll Summen-Formeln beim Öffnen neu berechnen
  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
  return { ersteZeile, kapazitaet, spalten };
}

// ---------------------------------------------------------------------------
// Weg 2: Tabelle im QPS-Aufbau selbst bauen
// ---------------------------------------------------------------------------

export function baueTabelle(p, { mindestZeilen = 20 } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'QPS Spesen-App';
  const ws = wb.addWorksheet('Spesen', {
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = [
    { width: 4 }, { width: 24 }, { width: 22 }, { width: 28 },
    { width: 14 }, { width: 12 }, { width: 12 }, { width: 14 },
  ];
  const rand = { style: 'thin', color: { argb: 'FF000000' } };
  const box = { top: rand, left: rand, bottom: rand, right: rand };
  const blau = { argb: 'FF2F75B5' };
  const f = (size = 9, extra = {}) => ({ name: 'Arial', size, ...extra });

  // Logos
  const logo = (bytes, tl, ext) => {
    if (!bytes) return;
    ws.addImage(wb.addImage({ base64: zuBase64(bytes), extension: 'png' }), { tl, ext });
  };
  // Anker in Pixeln ab Spalte B (Breite ~173 px), damit nichts verrutscht
  const px = (x, zeile) => ({ nativeCol: 1, nativeColOff: x * 9525, nativeRow: zeile, nativeRowOff: 2 * 9525 });
  logo(p.logos?.qps, px(0, 0), { width: 76, height: 36 });
  logo(p.logos?.engineering, px(0, 2), { width: 74, height: 22 });
  logo(p.logos?.labs, px(75, 2), { width: 37, height: 22 });
  logo(p.logos?.measure, px(113, 2), { width: 58, height: 22 });
  ws.getRow(1).height = 30;
  ws.getRow(3).height = 20;
  ws.getCell('C1').value = '– Intern: Spesenauslagen';
  ws.getCell('C1').font = f(13, { bold: true });
  ws.getCell('C1').alignment = { vertical: 'middle' };
  ws.getColumn(2).width = 24;

  // Titel
  ws.mergeCells('B5:E6');
  const t = ws.getCell('B5');
  t.value = `${VORLAGE.kopf.titel} ${p.monat.slice(0, 4)}`;
  t.font = f(12);
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  t.border = box;

  // Kopfdaten
  const feld = (adr, wert, opts = {}) => {
    const c = ws.getCell(adr);
    c.value = wert ?? null;
    c.font = f(9, opts.font);
    c.border = box;
    c.alignment = { horizontal: opts.zentriert ? 'center' : 'left', vertical: 'middle', shrinkToFit: true };
  };
  feld('B8', VORLAGE.kopf.name);
  feld('C8', p.profil?.name, { zentriert: true });
  feld('D8', VORLAGE.kopf.vorname);
  ws.mergeCells('E8:G8');
  feld('E8', p.profil?.vorname, { zentriert: true });
  feld('B9', VORLAGE.kopf.email);
  feld('C9', p.profil?.email, { zentriert: true, font: { color: { argb: 'FF0563C1' }, underline: true, size: 8 } });
  feld('D9', VORLAGE.kopf.filiale);
  feld('E9', 'Ja', { zentriert: true });
  feld('F9', p.profil?.filialeStein ? 'X' : null, { zentriert: true });
  feld('G9', 'Nein', { zentriert: true });
  feld('H9', p.profil?.filialeStein ? null : 'X', { zentriert: true });
  feld('B11', VORLAGE.kopf.monat);
  feld('C11', monatsname(p.monat));

  ws.mergeCells('F12:G12');
  ws.getCell('F12').value = 'siehe deine Belege i. d. Regel 8.1 % oder 2.6 % MWST';
  ws.getCell('F12').font = f(7, { italic: true });
  ws.getCell('F12').alignment = { horizontal: 'center', wrapText: true };
  ws.getRow(12).height = 20;

  // Tabellenkopf
  const kopfZeile = 13;
  ['', 'Auslagen', 'Datum', 'Details', 'Betrag CHF', '8.1%', '2.6%', 'Betrag EUR'].forEach((txt, i) => {
    const c = ws.getCell(kopfZeile, i + 1);
    c.value = txt || null;
    if (i === 0) return;
    c.font = f(9);
    c.alignment = { horizontal: 'center' };
    c.border = box;
  });

  // Positionen
  const anzahl = Math.max(mindestZeilen, p.positionen.length);
  const erste = kopfZeile + 1;
  const letzte = erste + anzahl - 1;
  for (let i = 0; i < anzahl; i++) {
    const r = erste + i;
    const pos = p.positionen[i];
    const z = pos ? tabellenZeile(pos) : null;
    const nr = ws.getCell(r, 1);
    nr.value = i + 1;
    nr.font = f(7);
    nr.alignment = { horizontal: 'right' };
    const werte = [
      z?.auslagen, z?.datum ? datumAlsUTC(z.datum) : null, z?.details,
      z ? z.chf : null, z ? z.mwst81 : null, z ? z.mwst26 : null, z ? z.eur : null,
    ];
    const formate = [null, FMT_DATUM, null, FMT_CHF, FMT_CHF, FMT_CHF, FMT_EUR];
    werte.forEach((w, k) => {
      const c = ws.getCell(r, k + 2);
      c.value = w ?? null;
      c.font = f(9);
      c.border = box;
      if (formate[k]) c.numFmt = formate[k];
      if (k <= 2) c.alignment = { horizontal: 'center' };
    });
  }

  // Summen (Formeln mit vorberechnetem Ergebnis)
  const s = summen(p.positionen);
  const sr = letzte + 1;
  ws.getCell(sr, 1).value = anzahl + 1;
  ws.getCell(sr, 1).font = f(7);
  ws.getCell(sr, 5).value = 'Summe Steuer';
  ws.getCell(sr, 5).font = f(8, { bold: true, color: blau });
  ws.getCell(sr, 5).alignment = { horizontal: 'right' };
  const summe = (col, ergebnis, fmt, zelle = ws.getCell(sr, col)) => {
    const L = String.fromCharCode(64 + col);
    zelle.value = { formula: `SUM(${L}${erste}:${L}${letzte})`, result: ergebnis };
    zelle.numFmt = fmt;
    zelle.font = f(8, { bold: true, color: blau });
  };
  summe(6, s.mwst81, FMT_CHF);
  summe(7, s.mwst26, FMT_CHF);

  const g1 = sr + 3;
  ws.mergeCells(g1, 2, g1, 4);
  ws.getCell(g1, 2).value = 'Gesamtauszahlungsbetrag für den Mitarbeiter';
  ws.getCell(g1, 2).font = f(9, { color: blau });
  ws.getCell(g1, 2).alignment = { horizontal: 'center' };
  ws.getCell(g1, 2).border = box;
  const gChf = ws.getCell(g1, 5);
  gChf.border = box;
  summe(5, s.chf, FMT_CHF, gChf);
  gChf.font = f(10, { color: blau });

  const g2 = g1 + 2;
  ws.mergeCells(g2, 4, g2, 7);
  ws.getCell(g2, 4).value = 'Gesamtauszahlungsbetrag für den Mitarbeiter';
  ws.getCell(g2, 4).font = f(9, { color: blau });
  ws.getCell(g2, 4).alignment = { horizontal: 'center' };
  ws.getCell(g2, 4).border = box;
  const gEur = ws.getCell(g2, 8);
  gEur.border = box;
  const L = 'H';
  gEur.value = { formula: `SUM(${L}${erste}:${L}${letzte})`, result: s.eur };
  gEur.numFmt = FMT_EUR;
  gEur.font = f(10, { color: blau });

  // Datum + Unterschrift
  const fz = g2 + 5;
  ws.getRow(fz - 1).height = 34;
  const d = ws.getCell(fz - 1, 3);
  d.value = p.datum ? datumAlsUTC(p.datum) : null;
  d.numFmt = FMT_DATUM;
  d.font = f(8);
  d.alignment = { horizontal: 'center', vertical: 'bottom' };
  d.border = { bottom: rand };
  ws.getCell(fz, 3).value = 'Datum';
  ws.getCell(fz, 3).font = f(7);
  ws.getCell(fz, 3).alignment = { horizontal: 'center' };
  ws.mergeCells(fz - 1, 5, fz - 1, 6);
  ws.getCell(fz - 1, 5).border = { bottom: rand };
  ws.mergeCells(fz, 5, fz, 6);
  ws.getCell(fz, 5).value = 'Unterschrift';
  ws.getCell(fz, 5).font = f(7);
  ws.getCell(fz, 5).alignment = { horizontal: 'center' };
  if (p.unterschrift) {
    ws.addImage(wb.addImage({ base64: zuBase64(p.unterschrift), extension: 'png' }), {
      tl: ankerUeber(ws, fz, 5, 42, 20), ext: { width: 150, height: 42 },
    });
  }

  ws.pageSetup.printArea = `A1:H${fz}`;
  ws.headerFooter.oddFooter = `&8${FIRMA} – Spesenauslagen ${p.monat}`;
  return wb;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

export function zellText(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return v;
  if (v.richText) return v.richText.map((t) => t.text).join('');
  if ('formula' in v || 'sharedFormula' in v) return v.result ?? '';
  if (v.text) return typeof v.text === 'string' ? v.text : zellText({ value: v.text });
  return String(v);
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const istText = (kandidaten) => (t) =>
  kandidaten.some((k) =>
    typeof k === 'number'
      ? typeof t === 'number' && Math.abs(t - k) < 1e-9
      : typeof t === 'string' && norm(t) === norm(k),
  );

// Alle (Master-)Zellen, deren Inhalt zur Bedingung passt – zeilenweise von oben
function finde(ws, bedingung, { zeile = null, abZeile = 1 } = {}) {
  const treffer = [];
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r < abZeile || (zeile && r !== zeile)) return;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.master && cell.master.address !== cell.address) return; // Teil einer Verbindung
      if (bedingung(zellText(cell))) treffer.push(cell);
    });
  });
  return treffer;
}

// Nächste eigenständige Zelle rechts (verbundene Zellen werden übersprungen)
function naechsteZelle(ws, cell) {
  const m = cell.master ?? cell;
  let c = m.col + 1;
  while (ws.getCell(m.row, c).master.address === m.address) c++;
  return ws.getCell(m.row, c).master;
}

// Bild-Anker so, dass die Unterkante genau auf der Oberkante von `zeile` liegt
// (= auf der Unterschriftslinie). Berücksichtigt die echten Zeilenhöhen.
function ankerUeber(ws, zeile, spalte, hoehePx, einzugPx = 0) {
  let rest = hoehePx;
  for (let r = zeile - 1; r >= 1; r--) {
    const h = ((ws.getRow(r).height ?? 15) * 96) / 72;
    if (rest <= h) {
      return { nativeCol: spalte - 1, nativeColOff: einzugPx * 9525, nativeRow: r - 1, nativeRowOff: Math.round((h - rest) * 9525) };
    }
    rest -= h;
  }
  return { nativeCol: spalte - 1, nativeColOff: 0, nativeRow: 0, nativeRowOff: 0 };
}

function setzeRechts(ws, label, wert, hinweise) {
  const l = finde(ws, istText([label]))[0];
  if (!l) return hinweise.push(`Feld "${label}" nicht gefunden`);
  naechsteZelle(ws, l).value = wert ?? null;
}
