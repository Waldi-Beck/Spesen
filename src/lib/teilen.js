// Senden über das Teilen-Menü des Handys bzw. Download als Fallback.
import { monatJahr } from './format.js';

export function teilText(monat, s, profil) {
  return `Spesenabrechnung ${monatJahr(monat)} – ${profil?.vorname ?? ''} ${profil?.name ?? ''}\n`
    + `${s.anzahl} Belege · CHF ${s.chf.toFixed(2)} · EUR ${s.eur.toFixed(2)}\n`
    + 'Excel-Tabelle und PDF mit allen Belegen im Anhang.';
}

/** Dateien über das Teilen-Menü des Handys senden (Outlook, Teams …) – sonst herunterladen. */
export async function teilen(dateien, { titel, text }) {
  const files = dateien.map((d) => new File([d.blob], d.name, { type: d.typ }));
  if (navigator.canShare?.({ files })) {
    await navigator.share({ files, title: titel, text });
    return 'geteilt';
  }
  dateien.forEach(herunterladen);
  return 'heruntergeladen';
}

export function herunterladen({ name, blob }) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
