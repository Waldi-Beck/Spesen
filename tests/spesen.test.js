import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import {
  mwstAusBrutto, detailsText, positionen, summen, tabellenZeile, pruefeBeleg, moeglicheDuplikate,
} from '../src/lib/berechnung.js';
import { betragText, datumCH, datumISO } from '../src/lib/format.js';
import { baueTabelle, erstelleExcel, zellText } from '../src/lib/excelExport.js';
import { erstellePdf } from '../src/lib/pdfExport.js';
import { JULI_2026, PROFIL } from './juli2026.js';

const platzhalter = readFileSync(new URL('./fixtures/beleg-platzhalter.jpg', import.meta.url));

describe('Berechnung', () => {
  it('ergibt die Summen der Original-Abrechnung Juli 2026', () => {
    const s = summen(JULI_2026);
    expect(s.anzahl).toBe(22);
    expect(s.chf).toBe(168.11);
    expect(s.eur).toBe(801.93);
  });

  it('rechnet MWST aus dem Bruttobetrag', () => {
    expect(mwstAusBrutto(34.1, 8.1)).toBe(2.56);
    expect(mwstAusBrutto(32, 8.1)).toBe(2.4);
    expect(mwstAusBrutto(10.26, 2.6)).toBe(0.26);
  });

  it('zählt MWST nur bei CHF-Belegen', () => {
    const eur = { waehrung: 'EUR', betrag: 119, mwst: [{ satz: 8.1, betrag: 19 }] };
    expect(tabellenZeile(eur).mwst81).toBe(0);
  });

  it('baut den Details-Text wie in der QPS-Tabelle', () => {
    expect(detailsText({ kategorie: 'Benzin' })).toBe('Benzin');
    expect(detailsText({ beschreibung: 'Teflonband', kostenstelle: 'QxTec' })).toBe('Teflonband (QxTec)');
    expect(detailsText({ kostenstelle: 'QLabs' })).toBe('QLabs');
    expect(detailsText({ beschreibung: 'QxTec Werkstatt', kostenstelle: 'QxTec' })).toBe('QxTec Werkstatt');
  });

  it('nummeriert lückenlos (kein doppeltes "15" mehr)', () => {
    const nr = positionen(JULI_2026).map((p) => p.nr);
    expect(nr).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
  });

  it('prüft Pflichtfelder und erkennt Duplikate', () => {
    const r = pruefeBeleg({ haendler: '', datum: '', betrag: 0, waehrung: 'CHF', dateien: [] });
    expect(r.ok).toBe(false);
    expect(r.fehler.length).toBeGreaterThanOrEqual(4);
    const a = { id: 'a', waehrung: 'EUR', betrag: 9.79, datum: '2026-05-07' };
    expect(moeglicheDuplikate([a, { ...a, id: 'b' }])).toEqual([['a', 'b']]);
  });

  it('formatiert Schweizer Beträge und Daten', () => {
    expect(betragText(1234.5)).toBe("1'234.50");
    expect(betragText(0)).toBe('-');
    expect(datumCH('2026-07-09')).toBe('09.07.2026');
    expect(datumISO('9.7.26')).toBe('2026-07-09');
  });
});

describe('Excel-Export', () => {
  const basis = { profil: PROFIL, monat: '2026-07', positionen: positionen(JULI_2026, 'erfassung'), datum: '2026-07-15' };

  it('erzeugt ohne Vorlage eine Tabelle im QPS-Aufbau', async () => {
    const { buffer, quelle } = await erstelleExcel({ ...basis, vorlage: null });
    expect(quelle).toBe('app');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    expect(ws.getCell('B14').value).toBe('Autoport Brunner');
    expect(ws.getCell('H14').value).toBe(51.19);
    expect(ws.getCell('E19').value).toBe(102.01);
  });

  it('befüllt eine vorhandene Vorlage über die Beschriftungen', async () => {
    // Leere Vorlage simulieren (gleicher Aufbau wie die QPS-Tabelle, 25 Zeilen)
    const leer = baueTabelle({ profil: {}, monat: '2026-01', positionen: [], datum: null }, { mindestZeilen: 25 });
    const vorlage = await leer.xlsx.writeBuffer();
    const { buffer, quelle, hinweise } = await erstelleExcel({ ...basis, vorlage });
    expect(hinweise).toEqual([]);
    expect(quelle).toBe('vorlage');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    expect(zellText(ws.getCell('B5'))).toBe('Spesenauslagen - QPS Engineering AG 2026');
    expect(ws.getCell('C8').value).toBe('Becker');
    expect(ws.getCell('E8').value).toBe('Waldemar');
    expect(ws.getCell('F9').value).toBe('X');
    expect(ws.getCell('H9').value).toBe(null);
    expect(ws.getCell('C11').value).toBe('Juli');
    expect(ws.getCell('B35').value).toBe('Amazon');
    expect(ws.getCell('B36').value).toBe(null); // ungenutzte Zeilen leer
    expect(ws.getCell('F23').value).toBe(2.56); // bp, 8.1 %
  });

  it('weicht auf das App-Format aus, wenn die Vorlage zu wenige Zeilen hat', async () => {
    const leer = baueTabelle({ profil: {}, monat: '2026-01', positionen: [], datum: null }, { mindestZeilen: 10 });
    const { quelle, hinweise } = await erstelleExcel({ ...basis, vorlage: await leer.xlsx.writeBuffer() });
    expect(quelle).toBe('app');
    expect(hinweise[0]).toMatch(/nur 10 Positionszeilen/);
  });
});

describe('PDF-Export', () => {
  it('hängt jeden Beleg als eigene Seite an', async () => {
    const pos = positionen(JULI_2026);
    const dateien = new Map(pos.map((b) => [b.id, [{ typ: 'image/jpeg', bytes: platzhalter }]]));
    const bytes = await erstellePdf({ profil: PROFIL, monat: '2026-07', positionen: pos, datum: '2026-07-15', dateien });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1 + 22);
  });

  it('übernimmt PDF-Belege (z. B. Amazon-Rechnung) seitenweise', async () => {
    const rechnung = await PDFDocument.create();
    rechnung.addPage();
    rechnung.addPage();
    const pdfBeleg = await rechnung.save();
    const pos = positionen(JULI_2026.slice(0, 1));
    const dateien = new Map([[pos[0].id, [{ typ: 'application/pdf', bytes: pdfBeleg }]]]);
    const bytes = await erstellePdf({ profil: PROFIL, monat: '2026-07', positionen: pos, datum: '2026-07-15', dateien });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1 + 2);
  });

  it('verteilt viele Positionen auf mehrere Abrechnungsseiten', async () => {
    const viele = Array.from({ length: 60 }, (_, i) => ({ ...JULI_2026[i % 22], id: `x${i}`, erstelltAm: i }));
    const bytes = await erstellePdf({ profil: PROFIL, monat: '2026-07', positionen: positionen(viele), datum: '2026-07-15' });
    const n = (await PDFDocument.load(bytes)).getPageCount();
    expect(n).toBeGreaterThan(60 + 1);
  });
});
