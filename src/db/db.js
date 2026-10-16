// Lokale Datenbank im Browser (IndexedDB über Dexie).
// Alle Belege, Fotos und Abrechnungen bleiben auf dem Gerät.
import Dexie from 'dexie';
import { STANDARD_KATEGORIEN, STANDARD_KOSTENSTELLEN } from '../config/einstellungen.js';
import { neueId } from '../lib/format.js';

export const db = new Dexie('qps-spesen');

db.version(1).stores({
  // status: 'offen' | 'eingereicht'
  belege: 'id, status, datum, abrechnungId, erstelltAm',
  // Fotos/PDFs eines Belegs (ein Beleg kann mehrere Seiten haben)
  dateien: 'id, belegId',
  // erzeugte Abrechnungen inkl. Excel/PDF zum erneuten Senden
  abrechnungen: 'id, monat, erstelltAm',
  // Schlüssel/Wert – aktuell nur 'app'
  einstellungen: 'schluessel',
});

export const STANDARD_EINSTELLUNGEN = {
  profil: { name: '', vorname: '', email: '', filialeStein: true },
  unterschrift: null, // PNG als dataURL
  empfaenger: '', // z. B. Buchhaltung
  kiUrl: import.meta.env?.VITE_KI_URL || '',
  kiCode: '',
  kategorien: STANDARD_KATEGORIEN,
  kostenstellen: STANDARD_KOSTENSTELLEN,
};

export async function ladeEinstellungen() {
  const e = await db.einstellungen.get('app');
  return { ...STANDARD_EINSTELLUNGEN, ...(e?.wert || {}), profil: { ...STANDARD_EINSTELLUNGEN.profil, ...(e?.wert?.profil || {}) } };
}

export async function speichereEinstellungen(teil) {
  const akt = await ladeEinstellungen();
  await db.einstellungen.put({ schluessel: 'app', wert: { ...akt, ...teil } });
}

/** Beleg speichern. `dateien` = [{ id?, blob, typ, name }] – ersetzt die bisherigen Dateien. */
export async function speichereBeleg(beleg, dateien) {
  const id = beleg.id || neueId();
  const jetzt = Date.now();
  await db.transaction('rw', db.belege, db.dateien, async () => {
    if (dateien) {
      await db.dateien.where('belegId').equals(id).delete();
      const mitId = dateien.map((d) => ({ id: d.id || neueId(), belegId: id, blob: d.blob, typ: d.typ, name: d.name || '' }));
      await db.dateien.bulkPut(mitId);
      beleg = { ...beleg, dateien: mitId.map((d) => d.id) };
    }
    await db.belege.put({
      status: 'offen', abrechnungId: null, erstelltAm: jetzt, ...beleg, id, geaendertAm: jetzt,
    });
  });
  return id;
}

export async function loescheBeleg(id) {
  await db.transaction('rw', db.belege, db.dateien, async () => {
    await db.dateien.where('belegId').equals(id).delete();
    await db.belege.delete(id);
  });
}

export const dateienVon = (belegId) => db.dateien.where('belegId').equals(belegId).toArray();

export async function speichereAbrechnung(abr) {
  const id = abr.id || neueId();
  await db.abrechnungen.put({ erstelltAm: Date.now(), status: 'erstellt', ...abr, id });
  return id;
}

/** Abrechnung als eingereicht markieren: Belege wandern ins Archiv. */
export async function markiereEingereicht(abrechnungId) {
  const abr = await db.abrechnungen.get(abrechnungId);
  await db.transaction('rw', db.belege, db.abrechnungen, async () => {
    await db.belege.where('id').anyOf(abr.belegIds).modify({ status: 'eingereicht', abrechnungId });
    await db.abrechnungen.update(abrechnungId, { status: 'eingereicht', eingereichtAm: Date.now() });
  });
}

/** Rückgängig: Belege wieder offen setzen (z. B. wenn Buchhaltung etwas zurückweist). */
export async function abrechnungZuruecknehmen(abrechnungId) {
  const abr = await db.abrechnungen.get(abrechnungId);
  await db.transaction('rw', db.belege, db.abrechnungen, async () => {
    await db.belege.where('id').anyOf(abr.belegIds).modify({ status: 'offen', abrechnungId: null });
    await db.abrechnungen.delete(abrechnungId);
  });
}

// Browser bitten, die Daten nicht automatisch zu löschen (wichtig v. a. auf iPhone)
export async function speicherDauerhaft() {
  if (!navigator.storage?.persist) return false;
  return (await navigator.storage.persisted()) || navigator.storage.persist();
}
