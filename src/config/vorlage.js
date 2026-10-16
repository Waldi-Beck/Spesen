// Zuordnung zur bestehenden QPS-Excel-Vorlage ("Spesenauslagen - QPS Engineering AG").
//
// Die App sucht die Felder über ihre Beschriftungen (z. B. "Auslagen", "Betrag CHF")
// statt über feste Zelladressen. Dadurch funktioniert sie auch, wenn in der
// Vorlage Zeilen eingefügt oder Spalten verschoben werden.
//
// Ablage der leeren Vorlage:  public/vorlage/Spesenvorlage.xlsx
// Fehlt die Datei, erzeugt die App die Tabelle im gleichen Aufbau selbst.

export const VORLAGE = {
  datei: 'vorlage/Spesenvorlage.xlsx',

  // Beschriftungen in der Vorlage (Gross/Klein und Leerzeichen egal)
  kopf: {
    titel: 'Spesenauslagen - QPS Engineering AG', // Jahr dahinter wird ersetzt
    name: 'Name',
    vorname: 'Vorname',
    email: 'E-Mail',
    filiale: 'Filiale Stein',
    monat: 'Monat',
  },
  tabelle: {
    auslagen: ['Auslagen'],
    datum: ['Datum'],
    details: ['Details'],
    chf: ['Betrag CHF'],
    mwst81: ['8.1%', '8,1%', '8.1 %', 0.081],
    mwst26: ['2.6%', '2,6%', '2.6 %', 0.026],
    eur: ['Betrag EUR'],
  },
  tabellenEnde: 'Summe Steuer', // erste Zeile NACH den Positionen
  fussDatum: 'Datum', // Beschriftung unter der Datumslinie (2. Vorkommen)
  unterschrift: 'Unterschrift',

  // true  = MWST-Betrag vom Beleg als Wert in die passende Spalte schreiben
  // false = Spalten nicht anfassen (falls die Vorlage dort Formeln hat, die bleiben sollen)
  mwstAlsWert: true,
};
