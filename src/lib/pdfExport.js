// PDF-Export: Seite 1 = Spesenabrechnung im QPS-Layout (A4 quer, mit Unterschrift),
// danach alle Belege – jeder Beleg mit Positionsnummer gestempelt.
// Ersetzt das bisherige "Excel als PDF drucken + Belege einzeln scannen".
//
// Läuft im Browser und in Node.
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { FIRMA } from '../config/einstellungen.js';
import { tabellenZeile, summen } from './berechnung.js';
import { betragText, datumCH, monatsname } from './format.js';

const QUER = [841.92, 595.32];
const HOCH = [595.28, 841.89];
const SCHWARZ = rgb(0, 0, 0);
const BLAU = rgb(0.18, 0.46, 0.71);
const GRAU = rgb(0.45, 0.45, 0.45);

// Spalten der Tabelle (x-Breiten in pt)
const SPALTEN = [
  { key: 'nr', titel: '', breite: 18, ausr: 'rechts' },
  { key: 'auslagen', titel: 'Auslagen', breite: 150, ausr: 'mitte' },
  { key: 'datumText', titel: 'Datum', breite: 68, ausr: 'mitte' },
  { key: 'details', titel: 'Details', breite: 186, ausr: 'mitte' },
  { key: 'chf', titel: 'Betrag CHF', breite: 82, waehrung: 'CHF' },
  { key: 'mwst81', titel: '8.1%', breite: 68, waehrung: 'CHF' },
  { key: 'mwst26', titel: '2.6%', breite: 68, waehrung: 'CHF' },
  { key: 'eur', titel: 'Betrag EUR', breite: 82, waehrung: 'EUR' },
];
const X0 = 62;
const ZEILE = 11.5; // Zeilenhöhe der Tabelle
const FUSS_HOEHE = 140; // Platz für Summen + Unterschrift unter der Tabelle
const RAND_UNTEN = 36;

/**
 * @param {object} p
 * @param {object} p.profil       { name, vorname, email, filialeStein }
 * @param {string} p.monat        "2026-07"
 * @param {Array}  p.positionen   Belege mit nr
 * @param {string} p.datum        ISO
 * @param {Uint8Array} [p.unterschrift] PNG
 * @param {object} [p.logos]      { qps, engineering, labs, measure } PNG-Bytes
 * @param {Map<string, Array<{typ:string, bytes:Uint8Array}>>} [p.dateien] Beleg-ID -> Dateien
 * @param {boolean} [p.muster]    "MUSTER"-Wasserzeichen (für Tests)
 * @returns {Promise<Uint8Array>}
 */
export async function erstellePdf(p) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Spesenauslagen ${monatsname(p.monat)} ${p.monat.slice(0, 4)} – ${p.profil?.vorname ?? ''} ${p.profil?.name ?? ''}`.trim());
  doc.setAuthor(`${p.profil?.vorname ?? ''} ${p.profil?.name ?? ''}`.trim());
  doc.setCreator('QPS Spesen-App');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const kursiv = await doc.embedFont(StandardFonts.HelveticaOblique);
  const F = { font, fett, kursiv };

  const logos = {};
  for (const [k, bytes] of Object.entries(p.logos || {})) {
    if (bytes) logos[k] = await doc.embedPng(bytes);
  }
  const unterschrift = p.unterschrift ? await doc.embedPng(p.unterschrift) : null;

  // --- Abrechnungsseiten (Kopf auf jeder Seite, Summen + Unterschrift auf der letzten)
  const zeilen = p.positionen.map(tabellenZeile);
  const abrechnung = [];
  let rest = zeilen;
  for (;;) {
    const page = doc.addPage(QUER);
    abrechnung.push(page);
    const y = zeichneKopf(page, p, F, logos);
    const platzMitFuss = Math.floor((y - ZEILE - FUSS_HOEHE) / ZEILE) - 1; // 1 Leerzeile
    const platzOhneFuss = Math.floor((y - ZEILE - RAND_UNTEN) / ZEILE);
    const letzte = rest.length <= platzMitFuss;
    const teil = letzte ? rest : rest.slice(0, Math.min(platzOhneFuss, rest.length - 1));
    const yEnde = zeichneTabelle(page, teil, y, F, { leerzeilen: letzte ? 1 : 0 });
    if (letzte) zeichneFuss(page, p, yEnde, F, unterschrift);
    rest = rest.slice(teil.length);
    if (letzte) break;
  }
  abrechnung.forEach((page, i) =>
    fusszeile(page, F, `${FIRMA} – Spesenauslagen ${monatsname(p.monat)} ${p.monat.slice(0, 4)}`,
      `Abrechnung Seite ${i + 1}/${abrechnung.length} · ${zeilen.length} Belege im Anhang`));

  // --- Belege anhängen
  for (const pos of p.positionen) {
    const dateien = p.dateien?.get(pos.id) || [];
    const z = tabellenZeile(pos);
    const betrag = z.chf ? `CHF ${betragText(z.chf)}` : `EUR ${betragText(z.eur)}`;
    const stempel = `Beleg Pos. ${pos.nr} · ${z.auslagen} · ${z.datumText} · ${betrag} · ${z.details}`;
    if (!dateien.length) {
      const page = doc.addPage(HOCH);
      stempelOben(page, F, stempel);
      text(page, 'Kein Beleg-Bild vorhanden', 60, page.getHeight() / 2, F.kursiv, 14, GRAU);
      continue;
    }
    for (const [k, d] of dateien.entries()) {
      const zusatz = dateien.length > 1 ? ` (Seite ${k + 1}/${dateien.length})` : '';
      if (d.typ === 'application/pdf') {
        const quelle = await PDFDocument.load(d.bytes, { ignoreEncryption: true });
        const kopien = await doc.copyPages(quelle, quelle.getPageIndices());
        kopien.forEach((pg, j) => {
          doc.addPage(pg);
          stempelOben(pg, F, stempel + (kopien.length > 1 ? ` (Seite ${j + 1}/${kopien.length})` : zusatz), true);
        });
      } else {
        const bild = d.typ === 'image/png' ? await doc.embedPng(d.bytes) : await doc.embedJpg(d.bytes);
        const page = doc.addPage(HOCH);
        const oben = stempelOben(page, F, stempel + zusatz);
        const rand = 28;
        const maxB = page.getWidth() - 2 * rand;
        const maxH = oben - rand - 6;
        const s = Math.min(maxB / bild.width, maxH / bild.height, 1.5);
        const b = bild.width * s;
        const h = bild.height * s;
        page.drawImage(bild, { x: (page.getWidth() - b) / 2, y: oben - 6 - h, width: b, height: h });
      }
    }
  }

  if (p.muster) {
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      page.drawText('MUSTER', {
        x: width / 2 - 170, y: height / 2 - 60, size: 110, font: fett,
        color: rgb(0.85, 0.1, 0.1), opacity: 0.12, rotate: degrees(25),
      });
    }
  }
  return doc.save();
}

// ---------------------------------------------------------------------------

function zeichneKopf(page, p, F, logos) {
  const H = page.getHeight();
  let y = H - 30;
  if (logos.qps) {
    const h = 24;
    const b = (logos.qps.width / logos.qps.height) * h;
    page.drawImage(logos.qps, { x: X0, y: y - h, width: b, height: h });
    text(page, '–  Intern: Spesenauslagen', X0 + b + 10, y - 17, F.fett, 13);
  } else {
    text(page, 'QPS – Intern: Spesenauslagen', X0, y - 17, F.fett, 13);
  }
  y -= 29;
  let x = X0;
  for (const k of ['engineering', 'labs', 'measure']) {
    const l = logos[k];
    if (!l) continue;
    const h = 14;
    const b = (l.width / l.height) * h;
    page.drawImage(l, { x, y: y - h, width: b, height: h });
    x += b + 1;
  }
  y -= 22;

  // Titelbox
  rahmen(page, X0 + 18, y - 24, 390, 24);
  zentriert(page, `Spesenauslagen - ${FIRMA} ${p.monat.slice(0, 4)}`, X0 + 18, 390, y - 16, F.font, 12);
  y -= 30;

  // Name / E-Mail / Filiale
  const zeile = (felder, yy) => {
    let xx = X0 + 18;
    for (const [inhalt, breite, opts = {}] of felder) {
      rahmen(page, xx, yy - 12, breite, 12, 0.5);
      if (opts.mitte) zentriert(page, inhalt ?? '', xx, breite, yy - 9, opts.font ?? F.font, 7.5, opts.farbe);
      else text(page, kuerze(inhalt ?? '', F.font, 7.5, breite - 4), xx + 2, yy - 9, opts.font ?? F.font, 7.5, opts.farbe);
      xx += breite;
    }
  };
  const ja = !!p.profil?.filialeStein;
  zeile([['Name', 66], [p.profil?.name, 120, { mitte: true }], ['Vorname', 66], [p.profil?.vorname, 138, { mitte: true }]], y);
  zeile([['E-Mail', 66], [p.profil?.email, 120, { mitte: true, farbe: BLAU }], ['Filiale Stein', 66],
    ['Ja', 40, { mitte: true }], [ja ? 'X' : '', 20, { mitte: true }], ['Nein', 50, { mitte: true }], [ja ? '' : 'X', 28, { mitte: true }]], y - 12);
  y -= 30;
  zeile([['Monat', 40], [monatsname(p.monat), 60]], y);

  // MWST-Hinweis über den Steuerspalten
  const xSteuer = X0 + SPALTEN.slice(0, 5).reduce((s, c) => s + c.breite, 0);
  zentriert(page, 'siehe deine Belege i. d. Regel', xSteuer, 136, y - 4, F.kursiv, 6.5);
  zentriert(page, '8.1 % oder 2.6 % MWST', xSteuer, 136, y - 12, F.kursiv, 6.5);
  return y - 18;
}

function zeichneTabelle(page, zeilen, y, F, { leerzeilen = 0 } = {}) {
  // Kopf
  let x = X0;
  for (const c of SPALTEN) {
    if (c.key !== 'nr') {
      rahmen(page, x, y - ZEILE, c.breite, ZEILE, 0.6);
      zentriert(page, c.titel, x, c.breite, y - 9, F.font, 8);
    }
    x += c.breite;
  }
  y -= ZEILE;
  const alle = [...zeilen, ...Array.from({ length: leerzeilen }, () => null)];
  for (const z of alle) {
    x = X0;
    for (const c of SPALTEN) {
      const yy = y - ZEILE;
      if (c.key === 'nr') {
        if (z) text(page, String(z.nr), x + c.breite - 4 - F.font.widthOfTextAtSize(String(z.nr), 6.5), yy + 3.2, F.font, 6.5, GRAU);
      } else {
        rahmen(page, x, yy, c.breite, ZEILE, 0.4);
        if (z && c.waehrung) {
          text(page, c.waehrung, x + 3, yy + 3.2, F.font, 7.5);
          const w = betragText(z[c.key]);
          text(page, w, x + c.breite - 4 - F.font.widthOfTextAtSize(w, 7.5), yy + 3.2, F.font, 7.5);
        } else if (z) {
          zentriert(page, kuerze(String(z[c.key] ?? ''), F.font, 7.5, c.breite - 6), x, c.breite, yy + 3.2, F.font, 7.5);
        }
      }
      x += c.breite;
    }
    y -= ZEILE;
  }
  return y;
}

function zeichneFuss(page, p, y, F, unterschrift) {
  const s = summen(p.positionen);
  const xSpalte = (key) => X0 + SPALTEN.slice(0, SPALTEN.findIndex((c) => c.key === key)).reduce((a, c) => a + c.breite, 0);
  const betragIn = (key, wert, yy, font, size, farbe) => {
    const c = SPALTEN.find((k) => k.key === key);
    const x = xSpalte(key);
    text(page, c.waehrung, x + 3, yy, font, size, farbe);
    const w = betragText(wert);
    text(page, w, x + c.breite - 4 - font.widthOfTextAtSize(w, size), yy, font, size, farbe);
  };

  // Summe Steuer
  const yS = y - 9;
  const xChf = xSpalte('chf');
  text(page, 'Summe Steuer', xChf - 4 - F.fett.widthOfTextAtSize('Summe Steuer', 7.5) + 60, yS, F.fett, 7.5, BLAU);
  betragIn('mwst81', s.mwst81, yS, F.fett, 7.5, BLAU);
  betragIn('mwst26', s.mwst26, yS, F.fett, 7.5, BLAU);

  // Gesamtbeträge
  const yC = y - 34;
  const xLab = X0 + 18 + 60;
  const lab = 'Gesamtauszahlungsbetrag für den Mitarbeiter';
  rahmen(page, xLab, yC, xChf - xLab, 15, 0.6);
  zentriert(page, lab, xLab, xChf - xLab, yC + 4.5, F.font, 8.5, BLAU);
  rahmen(page, xChf, yC, SPALTEN[4].breite, 15, 0.6);
  betragIn('chf', s.chf, yC + 4.5, F.fett, 8.5, BLAU);

  const yE = yC - 24;
  const xD = xSpalte('details') + 40;
  const xEur = xSpalte('eur');
  rahmen(page, xD, yE, xEur - xD, 15, 0.6);
  zentriert(page, lab, xD, xEur - xD, yE + 4.5, F.font, 8.5, BLAU);
  rahmen(page, xEur, yE, SPALTEN[7].breite, 15, 0.6);
  betragIn('eur', s.eur, yE + 4.5, F.fett, 8.5, BLAU);

  // Datum + Unterschrift
  const yL = yE - 44;
  const xDat = X0 + 110;
  page.drawLine({ start: { x: xDat, y: yL }, end: { x: xDat + 90, y: yL }, thickness: 0.5, color: SCHWARZ });
  zentriert(page, datumCH(p.datum), xDat, 90, yL + 3, F.font, 7.5);
  zentriert(page, 'Datum', xDat, 90, yL - 9, F.font, 6.5);
  const xU = xDat + 140;
  page.drawLine({ start: { x: xU, y: yL }, end: { x: xU + 170, y: yL }, thickness: 0.5, color: SCHWARZ });
  zentriert(page, 'Unterschrift', xU, 170, yL - 9, F.font, 6.5);
  if (unterschrift) {
    const h = 36;
    const b = Math.min((unterschrift.width / unterschrift.height) * h, 160);
    page.drawImage(unterschrift, { x: xU + (170 - b) / 2, y: yL + 1, width: b, height: (b / unterschrift.width) * unterschrift.height });
  }
}

function stempelOben(page, F, inhalt, ueberlagert = false) {
  const { width, height } = page.getSize();
  const h = 20;
  page.drawRectangle({
    x: 0, y: height - h, width, height: h,
    color: rgb(0.93, 0.95, 0.98), opacity: ueberlagert ? 0.92 : 1,
  });
  text(page, kuerze(inhalt, F.fett, 8.5, width - 40), 20, height - 13.5, F.fett, 8.5, BLAU);
  return height - h;
}

function fusszeile(page, F, links, rechts) {
  const w = page.getWidth();
  text(page, links, X0, 20, F.font, 6.5, GRAU);
  text(page, rechts, w - X0 - F.font.widthOfTextAtSize(sicher(F.font, rechts), 6.5), 20, F.font, 6.5, GRAU);
}

// --- Zeichen-Helfer --------------------------------------------------------

function rahmen(page, x, y, b, h, dicke = 0.7) {
  page.drawRectangle({ x, y, width: b, height: h, borderColor: SCHWARZ, borderWidth: dicke });
}

function text(page, inhalt, x, y, font, size, color = SCHWARZ) {
  page.drawText(sicher(font, String(inhalt)), { x, y, size, font, color });
}

function zentriert(page, inhalt, x, breite, y, font, size, color = SCHWARZ) {
  const t = sicher(font, String(inhalt));
  page.drawText(t, { x: x + (breite - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
}

function kuerze(inhalt, font, size, max) {
  let t = sicher(font, String(inhalt));
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > max) t = t.slice(0, -1);
  return `${t}…`;
}

// Standard-PDF-Schriften kennen nur WinAnsi – unbekannte Zeichen ersetzen statt abstürzen
function sicher(font, t) {
  let aus = '';
  for (const ch of t.replace(/[‘’]/g, "'").replace(/[“”„]/g, '"')) {
    try {
      font.encodeText(ch);
      aus += ch;
    } catch {
      aus += '?';
    }
  }
  return aus;
}
