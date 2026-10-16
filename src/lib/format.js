import { MONATSNAMEN } from '../config/einstellungen.js';

export const runde2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

// 1234.5 -> "1'234.50" (Schweizer Schreibweise)
export function betragText(x) {
  if (x === null || x === undefined || x === '' || Number(x) === 0) return '-';
  const [ganz, dez] = runde2(x).toFixed(2).split('.');
  return `${ganz.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${dez}`;
}

// "2026-07-09" -> "09.07.2026"
export function datumCH(iso) {
  if (!iso) return '';
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

// "09.07.2026" / "9.7.26" -> "2026-07-09"
export function datumISO(text) {
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = String(text).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return '';
  const jahr = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${jahr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// ISO-Datum -> Excel-taugliches Date (UTC, damit keine Zeitzonen-Verschiebung)
export function datumAlsUTC(iso) {
  const [j, m, t] = iso.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, t));
}

export const heuteISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const aktuellerMonat = () => heuteISO().slice(0, 7);

// "2026-07" -> "Juli"
export const monatsname = (ym) => MONATSNAMEN[Number(ym.split('-')[1]) - 1];

// "2026-07" -> "Juli 2026"
export const monatJahr = (ym) => `${monatsname(ym)} ${ym.split('-')[0]}`;

export const neueId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Uint8Array/ArrayBuffer -> Base64 (Browser + Node)
export function zuBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

// Dateiname wie bisher: "Juli 2026 Spesen"
export const dateiBasis = (ym, nachname) =>
  `${monatJahr(ym)} Spesen${nachname ? ` ${nachname}` : ''}`;
