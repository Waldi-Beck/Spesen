# QPS Spesen-App – Konzept

Stand: 16.10.2026 · Version 0.1 · Autor: Waldemar Becker

## 1. Ziel

**Heute:** Excel-Tabelle «Spesenauslagen – QPS Engineering AG» von Hand ausfüllen, als PDF drucken, jeden Beleg einzeln fotografieren, alles zusammen als PDF per E-Mail senden.

**Neu:** Alles in einer App auf dem Handy:

1. Beleg fotografieren, die Felder werden automatisch ausgefüllt.
2. Am Monatsende auf «Abrechnung erstellen» tippen.
3. Die App erzeugt die **Excel-Tabelle im QPS-Format** und **ein PDF mit Abrechnung und allen Belegen**.
4. Über das Teilen-Menü senden (Outlook, Teams …), fertig.

## 2. Ablauf

```
 Einmalig                Laufend (pro Beleg)                     Monatsende
┌──────────────┐   ┌───────────────────────────────────┐   ┌──────────────────────────────┐
│ Profil       │   │ Foto  ──▶  KI liest aus  ──▶      │   │ Checkliste prüfen            │
│ Unterschrift │   │ Händler, Datum, Betrag, Währung,  │   │ «Abrechnung erstellen»       │
│ KI-Code      │   │ MWST, Kategorie, Kostenstelle     │   │  → Excel  (QPS-Tabelle)      │
└──────────────┘   │ ──▶ kurz prüfen ──▶ Speichern     │   │  → PDF    (Abrechnung+Belege)│
                   └───────────────────────────────────┘   │ Senden → «eingereicht»       │
                                                           └──────────────────────────────┘
```

- **Mehrseitige Belege:** «Weitere Seite» hinzufügen.
- **PDF-Rechnungen** (z. B. Amazon) direkt importieren statt abfotografieren.
- **Ohne Internet oder ohne KI:** Felder von Hand ausfüllen, alles andere funktioniert offline.
- **Belege aus Vormonaten:** Die Abrechnung enthält alle *offenen* Belege, egal aus welchem Monat (wie bisher: Juli-Abrechnung mit Belegen ab Mai).

### Ergebnis-Dateien

| Datei | Inhalt |
|---|---|
| `Juli 2026 Spesen Becker.xlsx` | QPS-Spesentabelle, befüllt (aus der Original-Vorlage, wenn hinterlegt) |
| `Juli 2026 Spesen Becker + Belege.pdf` | Seite 1: Abrechnung im QPS-Layout mit Unterschrift · ab Seite 2: jeder Beleg mit Stempel «Beleg Pos. 7 · APRR · 22.05.2026 · EUR 44.90» |

## 3. Architektur

```
 Handy / PC (Browser, installierbar)          Cloudflare Worker              Claude API
┌─────────────────────────────────┐  Foto   ┌───────────────────────┐ Bild ┌───────────────┐
│ React-App (PWA)                 │ ──────▶ │ qps-spesen-ki         │ ───▶ │ Modell        │
│ • IndexedDB: Belege, Fotos,     │         │ • API-Key (Secret)    │      │ claude-sonnet │
│   Abrechnungen (nur lokal)      │ ◀────── │ • Zugangscode-Prüfung │ ◀─── │ -5-5          │
│ • ExcelJS  → .xlsx              │  JSON   │ • JSON-Schema         │ JSON └───────────────┘
│ • pdf-lib  → .pdf               │         └───────────────────────┘
└─────────────────────────────────┘
          │ Excel + PDF über das Teilen-Menü
          ▼
   Outlook / Teams → Buchhaltung
```

| Baustein | Technik | Warum |
|---|---|---|
| App | React 18 + Vite, PWA | Läuft auf iPhone, Android und PC; installierbar; offline nutzbar |
| Hosting | GitHub Pages | Gleicher Weg wie HSE-Rundgang; kostenlos; Link in Odoo |
| Datenhaltung | IndexedDB (Dexie) | Kein Server, keine Datenbank; Daten bleiben auf dem Gerät |
| Fotos | Canvas → JPEG, 2000 px | Klein genug fürs PDF, scharf genug zum Lesen |
| Belegerkennung | Cloudflare Worker → Claude API (Structured Outputs) | Hohe Genauigkeit; API-Schlüssel bleibt geheim |
| Excel | ExcelJS | Befüllt die Original-Vorlage, Formatierung bleibt |
| PDF | pdf-lib | Abrechnung zeichnen + Fotos/PDF-Belege anhängen |
| Senden | Web Share API | Öffnet das Teilen-Menü mit beiden Dateien als Anhang |

## 4. Projektstruktur

```
qps-spesen-app/
├── KONZEPT.md                  ← dieses Dokument
├── README.md                   ← Einrichtung Schritt für Schritt
├── CLAUDE.md                   ← Hinweise für Weiterentwicklung mit Claude Code
├── package.json · vite.config.js · index.html · .env.example
├── .github/workflows/deploy.yml← Test + Build + Veröffentlichung auf GitHub Pages
├── public/
│   ├── icons/                  ← App-Icons (Home-Bildschirm)
│   └── vorlage/                ← QPS-Logos + Spesenvorlage.xlsx (leere Original-Vorlage)
├── src/
│   ├── main.jsx · App.jsx      ← Start, Navigation (Belege · Erfassen · Abrechnung · Einstellungen)
│   ├── styles.css
│   ├── config/
│   │   ├── einstellungen.js    ← MWST-Sätze, Kategorien, Kostenstellen, Bildgrössen
│   │   └── vorlage.js          ← Zuordnung zur QPS-Excel-Vorlage (über Beschriftungen)
│   ├── db/db.js                ← Lokale Datenbank: Belege, Dateien, Abrechnungen, Einstellungen
│   ├── lib/
│   │   ├── berechnung.js       ← Summen, MWST, Details-Text, Prüfungen, Duplikate (rein, getestet)
│   │   ├── format.js           ← CHF-Format 1'234.50, Datum, Dateinamen
│   │   ├── excelExport.js      ← Vorlage befüllen bzw. Tabelle im QPS-Aufbau erzeugen
│   │   ├── pdfExport.js        ← Abrechnungsseite + Belegseiten
│   │   ├── belegLesen.js       ← Aufruf KI-Dienst, Antwort → Formularfelder
│   │   ├── bild.js             ← Fotos verkleinern/drehen
│   │   ├── abrechnung.js       ← Excel + PDF zusammenstellen (wird erst bei Bedarf geladen)
│   │   ├── ressourcen.js       ← Logos/Vorlage laden
│   │   ├── teilen.js           ← Teilen-Menü / Download
│   │   └── navigation.js
│   ├── components/             ← Bausteine (Belegkarte, Summen, Unterschrift-Pad, Meldungen), Icons
│   └── pages/
│       ├── Uebersicht.jsx      ← offene Belege + Summen
│       ├── BelegErfassen.jsx   ← Foto → KI → Formular → Speichern
│       ├── Abrechnung.jsx      ← Checkliste, Vorschau, Erstellen, Senden, Archiv
│       └── Einstellungen.jsx   ← Profil, Unterschrift, KI-Dienst, Listen
├── worker/                     ← KI-Dienst (Cloudflare Worker)
│   ├── src/index.js            ← Prüft Zugangscode, ruft Claude mit JSON-Schema auf
│   └── wrangler.toml
├── scripts/beispiel-export.mjs ← Muster-Abrechnung aus den Juli-Daten erzeugen
└── tests/                      ← 18 automatische Tests (Summen, Excel, PDF, Worker)
```

## 5. Datenmodell (IndexedDB)

**Beleg**

| Feld | Beispiel | Bemerkung |
|---|---|---|
| `id` | uuid | |
| `haendler` | «bp» | → Spalte *Auslagen* |
| `datum` | 2026-06-19 | → Spalte *Datum* (TT.MM.JJJJ) |
| `waehrung` | CHF / EUR | QPS-Tabelle führt beide getrennt, keine Umrechnung |
| `betrag` | 34.10 | Brutto, inkl. MWST |
| `mwst` | `[{ satz: 8.1, betrag: 2.56 }]` | mehrere Sätze möglich; nur bei CHF relevant |
| `kategorie` | Benzin | aus Auswahlliste |
| `kostenstelle` | QxTec / 4054 | Kostenstelle oder Projektnummer |
| `beschreibung` | Teflonband | optional |
| `details` | «Teflonband (QxTec)» | → Spalte *Details*, automatisch, änderbar |
| `dateien` | [id, id] | Fotos/PDF-Seiten in Tabelle `dateien` |
| `ki` | `{ sicherheit, hinweise, belegnummer }` | Ergebnis der Erkennung |
| `status` | offen / eingereicht | |
| `abrechnungId` | | gesetzt, sobald eingereicht |

**Datei:** `id, belegId, typ (image/jpeg | application/pdf), blob, name`
**Abrechnung:** `id, monat, belegIds, summen, excel, pdf, status (erstellt | eingereicht), erstelltAm, eingereichtAm`
**Einstellungen:** Profil (Name, Vorname, E-Mail, Filiale Stein), Unterschrift (PNG), Empfänger, KI-Adresse + Code, Kategorien, Kostenstellen

## 6. Zuordnung zur QPS-Tabelle

| QPS-Tabelle | Quelle in der App |
|---|---|
| Titel «Spesenauslagen – QPS Engineering AG 2026» | Jahr aus dem Abrechnungsmonat |
| Name / Vorname / E-Mail | Profil |
| Filiale Stein Ja ☒ / Nein ☐ | Profil |
| Monat | Abrechnungsmonat (z. B. «Juli») |
| Nr. 1, 2, 3 … | automatisch, lückenlos |
| Auslagen | Händler |
| Datum | Belegdatum |
| Details | Beschreibung bzw. Kategorie + «(Kostenstelle)» |
| Betrag CHF | Betrag, wenn Währung CHF |
| 8.1 % / 2.6 % | MWST-Betrag des Belegs im jeweiligen Satz (nur CHF) |
| Betrag EUR | Betrag, wenn Währung EUR |
| Summe Steuer, Gesamtauszahlungsbetrag CHF/EUR | Formeln der Vorlage (werden beim Öffnen neu berechnet) |
| Datum / Unterschrift | Erstellungsdatum + gespeicherte Unterschrift |

Die App findet die Felder über ihre **Beschriftungen** («Auslagen», «Betrag CHF», «Summe Steuer» …), nicht über feste Zelladressen. Ohne hinterlegte Vorlage, oder wenn sie zu wenige Zeilen hat, erzeugt die App die Tabelle im gleichen Aufbau selbst.

## 7. Auffälligkeiten in der Abrechnung Juli 2026

Beim Nachrechnen der Juli-Abrechnung sind mir ein paar Punkte aufgefallen. Die Summen stimmen: **CHF 168.11** und **EUR 801.93**.

1. **MWST-Spalten:** Bei bp (CHF 34.10) und Entsorgung Eiken (CHF 32.00) sind *beide* Spalten gefüllt (2.56 **und** 0.86 bzw. 2.40 **und** 0.81). Das sieht nach einer Formel aus, die beide Sätze aus jedem CHF-Betrag rechnet. Bei Voegtlin Meyer (CHF 102.01) fehlt die MWST ganz. Die «Summe Steuer» (4.95 / 1.68) ist dadurch vermutlich nicht korrekt. Die App trägt nur den Satz ein, der auf dem Beleg steht. Mit 8.1 % auf allen drei Belegen wären das 12.60 / 0.00.
2. **Laufnummer 15 kommt fünfmal vor:** Das passiert beim Kopieren von Zeilen. Die App nummeriert automatisch.
3. **«Details» mischt zwei Dinge:** Art der Ausgabe (Benzin, Müll) und Kostenstelle (QxTec, Qlabs, 4054). Die App erfasst beides getrennt (für spätere Auswertungen) und setzt den Text wie gewohnt zusammen.

Die Original-Vorlage wird von der App **nicht verändert**. Sie dient nur als Kopiervorlage für jede neue Abrechnung.

## 8. Belegerkennung (KI)

- **Ablauf:** Das Foto wird auf 1568 px verkleinert und an den Worker geschickt. Der Worker ruft die Claude API mit festem JSON-Schema auf (`output_config.format`). Zurück kommen strukturierte Felder, und die Kategorie ist garantiert ein Wert aus der Liste.
- **Modell:** `claude-sonnet-5-5` (Standard). Günstiger geht es mit `claude-haiku-5-5`, Umstellung in `worker/wrangler.toml`.
- **Kosten (Schätzung):** etwa 2'000–3'000 Eingabe-Token pro Beleg, also **unter 1 Rappen pro Beleg** mit Sonnet (Preisliste Oktober 2026: USD 2 bzw. 10 pro Mio. Token Ein-/Ausgabe). Bei 25 Belegen im Monat sind das ein paar Rappen.
- **Regeln:** Die KI überschreibt **nie** Felder, die man selbst geändert hat. Bei unsicherer Erkennung zeigt die App einen Hinweis zum Prüfen.
- **Datenschutz:** Belegfotos werden zur Erkennung an Anthropic übermittelt. Vor dem Einsatz bei QPS mit IT/Datenschutz abklären. Ohne KI-Dienst funktioniert die App weiterhin, dann mit Handeingabe.

## 9. Sicherheit und Datenhaltung

- **Keine zentrale Datenbank:** Belege und Fotos liegen nur auf dem Gerät des Mitarbeitenden.
- **iPhone:** Die App über «Zum Home-Bildschirm» installieren. Sonst kann Safari die Daten löschen, wenn die Seite 7 Tage nicht benutzt wurde. Die App fordert zusätzlich dauerhaften Speicher an.
- **Massgebend ist die gesendete Abrechnung (PDF + Excel)**, nicht das App-Archiv.
- **API-Schlüssel** nur als Secret im Worker. Der **Zugangscode** wird in der App eingetippt, nicht im Code gespeichert. `ALLOWED_ORIGINS` auf die GitHub-Pages-Adresse beschränken.
- **Repository:** Keine persönlichen Daten. Unter `public/vorlage/` nur die *leere* Vorlage ablegen, denn GitHub Pages ist öffentlich.

## 10. Ausbaustufen

| Phase | Inhalt |
|---|---|
| **1 – dieses Gerüst** | Erfassen (Foto/PDF), KI-Erkennung, Prüfungen, Excel nach Vorlage, PDF mit Belegen, Teilen, Archiv |
| 2 | Belegkanten automatisch erkennen und gerade ziehen (Scan-Effekt); Datensicherung (Export/Import); Statistik je Kostenstelle |
| 3 | Direkte Ablage in SharePoint/OneDrive (Microsoft Graph) oder Odoo statt E-Mail; Kilometer-Spesen |
| 4 | Mehrere Mitarbeitende mit Microsoft-Login und Freigabe durch Vorgesetzte |

## 11. Offene Fragen

1. **MWST-Spalten:** Sind das in der Vorlage Formeln? Darf die App dort den echten Satz vom Beleg eintragen (Standard), oder sollen die Formeln bleiben? Umschaltbar über `mwstAlsWert` in `src/config/vorlage.js`.
2. **3.8 % Beherbergung (Hotel):** In der Tabelle gibt es dafür keine Spalte. Soll eine neue Spalte dazukommen?
3. **Papier-Originale:** Müssen sie weiterhin abgegeben werden, oder reicht das PDF?
4. **Empfänger:** Wohin geht die Abrechnung (E-Mail Buchhaltung, Odoo)?
5. **KI-Dienst:** Wer gibt die Nutzung frei, und läuft das API-Konto über QPS?
6. **Leere Original-Vorlage (.xlsx):** Bitte nach `public/vorlage/Spesenvorlage.xlsx` legen und `npm run beispiel` ausführen, um die Zuordnung zu testen.
