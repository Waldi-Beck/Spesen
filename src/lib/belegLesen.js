// Beleg automatisch auslesen: Bild/PDF geht an den eigenen KI-Dienst (worker/),
// der es an die Claude-API weiterreicht. Der API-Schlüssel liegt nur im Worker,
// nie in der App.
import { BILD_MAX_KI } from '../config/einstellungen.js';
import { verkleinere, istPdf } from './bild.js';
import { mwstAusBrutto, detailsText } from './berechnung.js';
import { runde2, zuBase64 } from './format.js';

const MAX_BYTES = 9 * 1024 * 1024;

export async function liesBeleg(datei, einst) {
  if (!einst.kiUrl) throw new Error('Automatisches Auslesen ist nicht eingerichtet (Einstellungen → KI-Dienst).');
  const pdf = istPdf(datei);
  const blob = pdf ? datei : await verkleinere(datei, BILD_MAX_KI, 0.8);
  if (blob.size > MAX_BYTES) throw new Error('Datei ist zu gross für das automatische Auslesen (max. 9 MB).');

  const antwort = await fetch(`${einst.kiUrl.replace(/\/$/, '')}/lesen`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-code': einst.kiCode || '' },
    body: JSON.stringify({
      typ: pdf ? 'application/pdf' : 'image/jpeg',
      daten: zuBase64(new Uint8Array(await blob.arrayBuffer())),
      kategorien: einst.kategorien,
      kostenstellen: einst.kostenstellen,
    }),
    signal: AbortSignal.timeout?.(90000),
  });
  const json = await antwort.json().catch(() => ({}));
  if (!antwort.ok) throw new Error(json.fehler || `KI-Dienst antwortet mit Fehler ${antwort.status}`);
  return zuBelegFeldern(json);
}

/** Antwort des KI-Dienstes -> Felder des Beleg-Formulars */
export function zuBelegFeldern(r) {
  const waehrung = ['CHF', 'EUR'].includes(r.waehrung) ? r.waehrung : 'CHF';
  const betrag = r.betrag_total != null ? runde2(r.betrag_total) : '';
  // Für die QPS-Tabelle zählt nur Schweizer MWST auf CHF-Belegen
  const mwst = waehrung !== 'CHF' ? [] : (r.mwst || [])
    .filter((m) => m && m.satz != null)
    .map((m) => ({ satz: Number(m.satz), betrag: m.betrag != null ? runde2(m.betrag) : mwstAusBrutto(betrag || 0, Number(m.satz)) }));
  const felder = {
    haendler: r.haendler || '',
    datum: r.datum || '',
    waehrung,
    betrag,
    mwst,
    kategorie: r.kategorie || '',
    kostenstelle: r.kostenstelle || '',
    beschreibung: r.beschreibung || '',
    ki: {
      sicherheit: r.sicherheit || 'mittel',
      hinweise: r.hinweise || '',
      belegnummer: r.belegnummer || '',
      andereWaehrung: r.waehrung && !['CHF', 'EUR'].includes(r.waehrung) ? r.waehrung : null,
    },
  };
  felder.details = detailsText(felder);
  return felder;
}

export async function testeVerbindung(einst) {
  const r = await fetch(`${einst.kiUrl.replace(/\/$/, '')}/status`, { headers: { 'x-app-code': einst.kiCode || '' } });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.fehler || `Fehler ${r.status}`);
  return json;
}
