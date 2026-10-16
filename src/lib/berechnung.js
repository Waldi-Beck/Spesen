// Reine Rechen- und Prüflogik – ohne Browser-Abhängigkeiten, daher gut testbar.
import { MWST_SAETZE, SORTIERUNG, WARNUNG_ALTER_TAGE } from '../config/einstellungen.js';
import { runde2, datumCH } from './format.js';

// MWST-Anteil aus einem Bruttobetrag: 34.10 bei 8.1 % -> 2.56
export const mwstAusBrutto = (brutto, satz) => runde2((Number(brutto) * satz) / (100 + satz));

// "Details"-Text für die Tabelle, so wie bisher geschrieben:
//   "Benzin" | "Teflonband (QxTec)" | "Qlabs"
export function detailsText({ beschreibung, kategorie, kostenstelle }) {
  const was = (beschreibung || kategorie || '').trim();
  const ks = (kostenstelle || '').trim();
  if (!was) return ks;
  if (!ks || was.toLowerCase().includes(ks.toLowerCase())) return was;
  return `${was} (${ks})`;
}

// MWST-Betrag eines Belegs für einen Satz (nur CHF-Belege zählen für die CH-Vorsteuer)
export function mwstFuerSatz(beleg, satz) {
  if (beleg.waehrung !== 'CHF') return 0;
  return runde2(
    (beleg.mwst || []).filter((m) => Number(m.satz) === satz).reduce((s, m) => s + Number(m.betrag || 0), 0),
  );
}

// Positionen in der Reihenfolge der Abrechnung (mit Nr. 1..n)
export function positionen(belege, sortierung = SORTIERUNG) {
  const liste = [...belege];
  if (sortierung === 'datum') {
    liste.sort((a, b) => (a.datum || '').localeCompare(b.datum || '') || (a.erstelltAm || 0) - (b.erstelltAm || 0));
  } else {
    liste.sort((a, b) => (a.erstelltAm || 0) - (b.erstelltAm || 0));
  }
  return liste.map((b, i) => ({ ...b, nr: i + 1 }));
}

// Eine Tabellenzeile genau wie in der QPS-Vorlage
export function tabellenZeile(beleg) {
  const chf = beleg.waehrung === 'CHF' ? runde2(beleg.betrag) : 0;
  const eur = beleg.waehrung === 'EUR' ? runde2(beleg.betrag) : 0;
  return {
    nr: beleg.nr,
    auslagen: beleg.haendler || '',
    datum: beleg.datum || '',
    datumText: datumCH(beleg.datum),
    details: beleg.details || detailsText(beleg),
    chf,
    mwst81: mwstFuerSatz(beleg, 8.1),
    mwst26: mwstFuerSatz(beleg, 2.6),
    eur,
  };
}

export function summen(belege) {
  const z = belege.map(tabellenZeile);
  const sum = (k) => runde2(z.reduce((s, r) => s + r[k], 0));
  return {
    anzahl: belege.length,
    chf: sum('chf'),
    eur: sum('eur'),
    mwst81: sum('mwst81'),
    mwst26: sum('mwst26'),
  };
}

// Prüfungen pro Beleg: fehler = blockiert die Abrechnung, hinweise = nur Info
export function pruefeBeleg(beleg, { heute = new Date() } = {}) {
  const fehler = [];
  const hinweise = [];
  if (!beleg.haendler?.trim()) fehler.push('Händler / Auslage fehlt');
  if (!beleg.datum) fehler.push('Datum fehlt');
  if (!(Number(beleg.betrag) > 0)) fehler.push('Betrag fehlt');
  if (!['CHF', 'EUR'].includes(beleg.waehrung)) fehler.push('Währung muss CHF oder EUR sein');
  if (!beleg.dateien?.length) fehler.push('Kein Foto/PDF des Belegs');

  if (beleg.datum) {
    const d = new Date(`${beleg.datum}T12:00:00`);
    const tage = (heute - d) / 86400000;
    if (tage < -1) fehler.push('Datum liegt in der Zukunft');
    else if (tage > WARNUNG_ALTER_TAGE) hinweise.push(`Beleg ist älter als ${WARNUNG_ALTER_TAGE} Tage`);
  }
  if (beleg.waehrung === 'CHF') {
    const mwstSumme = (beleg.mwst || []).reduce((s, m) => s + Number(m.betrag || 0), 0);
    if (!beleg.mwst?.length) hinweise.push('Keine MWST erfasst');
    if (mwstSumme > Number(beleg.betrag) * 0.2) fehler.push('MWST-Betrag unplausibel hoch');
    for (const m of beleg.mwst || []) {
      const def = MWST_SAETZE.find((s) => s.satz === Number(m.satz));
      if (def && !def.spalte && def.satz > 0) hinweise.push(`${def.label}: keine eigene Spalte in der QPS-Tabelle`);
    }
  }
  if (!beleg.details?.trim() && !beleg.kategorie) hinweise.push('Details / Kategorie leer');
  if (beleg.ki?.sicherheit === 'niedrig') hinweise.push('KI war unsicher – Werte bitte prüfen');
  return { fehler, hinweise, ok: fehler.length === 0 };
}

// Mögliche Doppelerfassungen: gleiche Währung + Betrag + Datum
export function moeglicheDuplikate(belege) {
  const gruppen = new Map();
  for (const b of belege) {
    const key = `${b.waehrung}|${runde2(b.betrag)}|${b.datum}`;
    gruppen.set(key, [...(gruppen.get(key) || []), b.id]);
  }
  return [...gruppen.values()].filter((ids) => ids.length > 1);
}
