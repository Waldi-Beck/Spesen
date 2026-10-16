# QPS Spesen-App

Belege fotografieren → automatisch auslesen → Spesenabrechnung als **QPS-Excel-Tabelle** und **PDF mit allen Belegen** erzeugen → per Teilen-Menü senden.

Konzept, Datenmodell und offene Fragen: siehe [KONZEPT.md](KONZEPT.md).

## Schnellstart (lokal)

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer, VS Code.

```bash
npm install
npm run dev          # App starten → Adresse im Terminal öffnen (auch vom Handy im selben WLAN)
npm test             # 18 automatische Tests
npm run beispiel     # Muster-Abrechnung aus den Juli-2026-Daten → Ordner ./beispiel/
npm run build        # fertige App nach ./dist/
```

## 1. QPS-Vorlage einbinden

1. Die bisherige Excel-Datei kopieren, **alle Positionen, Namen und Summen leeren** und genügend Positionszeilen anlegen (z. B. 30).
2. Als `public/vorlage/Spesenvorlage.xlsx` speichern.
3. `npm run beispiel` ausführen. In der Ausgabe muss «Excel aus: QPS-Vorlage» stehen. Die Datei in `./beispiel/` öffnen und prüfen.

Werden Felder nicht gefunden, die Beschriftungen in `src/config/vorlage.js` anpassen. Ohne Vorlage erzeugt die App die Tabelle im gleichen Aufbau selbst.

## 2. KI-Dienst einrichten (automatisches Auslesen)

Einmalig, etwa 15 Minuten. Ohne KI-Dienst funktioniert die App auch, dann mit Handeingabe.

### Lokal testen

1. Erstelle im Anthropic Console einen API-Schlüssel. API-Nutzung wird separat abgerechnet; ein Claude-Chat-Abo enthält keinen API-Zugang.
2. Kopiere `worker/.dev.vars.example` nach `worker/.dev.vars` und ersetze dort die Beispielwerte mit deinem API-Schlüssel und einem eigenen Zugangscode. Die Datei ist in `.gitignore` ausgeschlossen. Teile diese Geheimnisse nicht im Chat und speichere sie nicht in der App oder im Repository.
3. Starte im Projektordner zwei Terminals: `npm run dev` für die App und `npm run dev:ki` für den lokalen Worker. Beim ersten Start kann Wrangler Komponenten herunterladen.
4. Öffne in der App **Einstellungen → Automatisches Auslesen**. Trage als Adresse `http://localhost:8787` und als Zugangscode denselben Wert wie `APP_CODE` in `worker/.dev.vars` ein. Verbindung testen, dann Einstellungen speichern.
5. Einen neuen Beleg erfassen und ein gut lesbares Foto wählen. Die Erkennung startet automatisch; Ergebnisse vor dem Speichern kontrollieren.

Für Tests auf einem Smartphone müssen App und Worker beide im lokalen Netzwerk erreichbar sein. Verwende dort die Rechner-IP statt `localhost`; der Netzwerk-Origin muss zusätzlich in `worker/wrangler.toml` erlaubt sein. Für echte Belege vorher die Datenschutzfreigabe klären.

1. **API-Schlüssel:** Auf [platform.claude.com](https://platform.claude.com) ein Konto anlegen (am besten ein QPS-Konto) und unter *API Keys* einen Schlüssel erstellen.
2. **Cloudflare:** Kostenloses Konto auf [cloudflare.com](https://dash.cloudflare.com) anlegen.
3. Im Terminal:

   ```bash
   cd worker
   npx wrangler login
   npx wrangler secret put ANTHROPIC_API_KEY   # Schlüssel aus Schritt 1 einfügen
   npx wrangler secret put APP_CODE            # selbst gewählter langer Zugangscode
   npx wrangler deploy                         # → Adresse https://qps-spesen-ki.<name>.workers.dev
   ```

4. In `worker/wrangler.toml` `ALLOWED_ORIGINS` auf die App-Adresse setzen (z. B. `https://waldi-beck.github.io`) und nochmals `npx wrangler deploy` ausführen.
5. In der App unter **Einstellungen → KI-Dienst** die Adresse und den Zugangscode eintragen und «Verbindung testen» antippen.

## 3. Online stellen (GitHub Pages)

1. Neues Repository auf GitHub anlegen, z. B. `QPS-Spesen`, und den Projektordner hochladen (VS Code: *Source Control → Publish to GitHub*).
2. Auf GitHub unter **Settings → Pages → Source** «GitHub Actions» wählen.
3. Optional unter **Settings → Secrets and variables → Actions → Variables** die Variable `KI_URL` mit der Worker-Adresse anlegen. Dann ist sie in der App schon vorausgefüllt.
4. Jeder Push auf `main` testet, baut und veröffentlicht automatisch. Die Adresse lautet `https://<benutzer>.github.io/QPS-Spesen/`.
5. Den Link in Odoo hinterlegen, wie beim HSE-Rundgang.

## 4. Auf dem Handy installieren

- **iPhone (Safari):** Teilen → «Zum Home-Bildschirm». Wichtig, damit Safari die Daten nicht löscht.
- **Android (Chrome):** Menü → «App installieren».
- Danach in den Einstellungen einmalig Name, E-Mail, Filiale und Unterschrift erfassen.

## Ordner

| Ordner | Inhalt |
|---|---|
| `src/pages/` | Bildschirme: Belege, Erfassen, Abrechnung, Einstellungen |
| `src/lib/` | Logik: Berechnung, Excel-, PDF-Export, KI-Aufruf, Bilder |
| `src/config/` | QPS-spezifische Einstellungen und Vorlagen-Zuordnung |
| `src/db/` | Lokale Datenbank (IndexedDB) |
| `worker/` | KI-Dienst (Cloudflare Worker) |
| `public/vorlage/` | QPS-Logos und Excel-Vorlage |
| `tests/` | Tests inkl. Juli-2026-Kontrolldaten |
