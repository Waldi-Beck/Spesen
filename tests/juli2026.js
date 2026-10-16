// Testdaten = Spesenabrechnung Juli 2026 (aus "Spesen Juli 26.pdf").
// Kontrollwerte des Originals: CHF 168.11 / EUR 801.93.
const b = (haendler, datum, details, waehrung, betrag, mwst = []) => ({
  haendler, datum, details, waehrung, betrag, mwst, dateien: ['platzhalter'],
});

let n = 0;
export const JULI_2026 = [
  b('Autoport Brunner', '2026-07-09', '4054', 'EUR', 51.19),
  b('Toom (Werkstatt)', '2026-07-09', 'QxTec', 'EUR', 3.29),
  b('Toom (Werkstatt)', '2026-06-24', 'QxTec', 'EUR', 59.83),
  b('Shell Station', '2026-05-29', 'Benzin', 'EUR', 138.57),
  b('Esso', '2026-06-23', 'Benzin', 'EUR', 120.51),
  b('Voegtlin Meyer AG', '2026-05-27', 'Benzin', 'CHF', 102.01, [{ satz: 8.1, betrag: 7.64 }]),
  b('APRR', '2026-05-22', 'Maut Fahrt Dublin', 'EUR', 44.9),
  b('APRR', '2026-05-23', 'Maut Fahrt Dublin', 'EUR', 3.1),
  b('Station AVIA', '2026-05-22', 'Benzin', 'EUR', 131.29),
  b('bp', '2026-06-19', 'Benzin', 'CHF', 34.1, [{ satz: 8.1, betrag: 2.56 }]),
  b('Station AVIA', '2026-05-22', 'Spesen', 'EUR', 14.3),
  b('Entsorgung Eiken AG', '2026-05-29', 'Müll', 'CHF', 32.0, [{ satz: 8.1, betrag: 2.4 }]),
  b('Amazon', '2026-06-26', 'Teflonband (QxTec)', 'EUR', 7.49),
  b('Amazon', '2026-05-28', 'EVVA Airkey (Zutrittskarten)', 'EUR', 109.9),
  b('Amazon', '2026-05-07', 'QLabs', 'EUR', 9.79),
  b('Amazon', '2026-06-22', 'QLabs', 'EUR', 40.38),
  b('Amazon', '2026-06-21', 'QLabs', 'EUR', 10.99),
  b('Amazon', '2026-05-07', 'QLabs', 'EUR', 12.99),
  b('Amazon', '2026-05-07', 'QLabs', 'EUR', 18.79),
  b('Amazon', '2026-05-08', 'QLabs', 'EUR', 9.89),
  b('Amazon', '2026-05-07', 'QLabs', 'EUR', 6.74),
  b('Amazon', '2026-05-07', 'QLabs', 'EUR', 7.99),
].map((x) => ({ ...x, id: `juli-${++n}`, erstelltAm: n }));

export const PROFIL = {
  name: 'Becker', vorname: 'Waldemar', email: 'w.becker@qps-engineering.ch', filialeStein: true,
};
