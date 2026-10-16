// Zentrale Standardwerte der Spesen-App.
// Alles, was QPS-spezifisch ist und sich ändern kann, steht hier –
// nicht verstreut im Code.

export const FIRMA = 'QPS Engineering AG';

// Schweizer MWST-Sätze (gültig ab 01.01.2024, Stand 2026).
// `spalte` = Spalte in der QPS-Vorlage. 3.8 % hat dort keine eigene Spalte.
export const MWST_SAETZE = [
  { satz: 8.1, label: '8.1 % Normalsatz', spalte: 'mwst81' },
  { satz: 2.6, label: '2.6 % reduziert (Lebensmittel, Bücher …)', spalte: 'mwst26' },
  { satz: 3.8, label: '3.8 % Beherbergung', spalte: null },
  { satz: 0, label: 'ohne MWST', spalte: null },
];

// Die QPS-Tabelle führt CHF und EUR getrennt (keine Umrechnung).
export const WAEHRUNGEN = ['CHF', 'EUR'];

// Vorschläge aus der bisherigen Spesentabelle (Juli 2026) abgeleitet.
// In der App unter Einstellungen änderbar.
export const STANDARD_KATEGORIEN = [
  'Benzin',
  'Maut',
  'Material',
  'Werkzeug',
  'Entsorgung',
  'Verpflegung',
  'Übernachtung',
  'Parkieren',
  'Bahn / ÖV',
  'Spesen',
  'Sonstiges',
];

export const STANDARD_KOSTENSTELLEN = ['QxTec', 'QLabs', 'QMeasure', 'Engineering'];

export const MONATSNAMEN = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

// Reihenfolge der Positionen in der Abrechnung: 'datum' oder 'erfassung'
export const SORTIERUNG = 'datum';

// Bildgrössen (lange Kante in Pixel)
export const BILD_MAX_ARCHIV = 2000; // für PDF/Archiv
export const BILD_MAX_KI = 1568; // für die KI-Erkennung (spart Kosten)

// Warnung, wenn ein Beleg älter ist als X Tage
export const WARNUNG_ALTER_TAGE = 90;
