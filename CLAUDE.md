# CLAUDE.md – Hinweise zur Weiterentwicklung

QPS Spesen-App: React + Vite PWA, Daten lokal in IndexedDB (Dexie), Excel via ExcelJS, PDF via pdf-lib,
Belegerkennung über einen Cloudflare Worker (`worker/`), der die Claude API mit JSON-Schema aufruft.
Fachliches Konzept: `KONZEPT.md`.

## Regeln

- Sprache: Oberfläche, Kommentare und Bezeichner auf Deutsch (Schweizer Schreibweise: «ss», CHF 1'234.50).
- `src/lib/berechnung.js`, `format.js`, `excelExport.js`, `pdfExport.js` bleiben **browserunabhängig**
  (kein `document`, kein `import.meta.env`), damit sie in Node getestet werden können.
- Nach jeder Änderung: `npm test` und `npm run build`. Für Export-Änderungen zusätzlich `npm run beispiel`
  und die Dateien in `./beispiel/` ansehen. Kontrollwerte Juli 2026: CHF 168.11 / EUR 801.93.
- QPS-spezifische Werte (MWST-Sätze, Kategorien, Beschriftungen der Vorlage) nur in `src/config/` pflegen.
- Die Original-Vorlage `public/vorlage/Spesenvorlage.xlsx` wird nie verändert, nur kopiert und befüllt.
- Keine Secrets ins Repository: API-Schlüssel und Zugangscode nur als Worker-Secrets bzw. in der App.
- Die KI darf Felder, die der Benutzer geändert hat, nie überschreiben (`beruehrt` in `BelegErfassen.jsx`).
- Neue Felder im Worker-Schema: Structured Outputs verlangen `additionalProperties: false`, alle Felder in
  `required`, keine `minimum/maximum/minLength`. Test `tests/worker.test.js` prüft das.
