// KI-Dienst für die QPS Spesen-App (Cloudflare Worker).
//
// Nimmt ein Belegfoto oder -PDF entgegen, lässt es von Claude auslesen und gibt
// strukturierte Felder zurück (Händler, Datum, Betrag, MWST, Kategorie …).
// Der Anthropic-API-Schlüssel liegt NUR hier als Secret – nie in der App.
//
// Secrets:  ANTHROPIC_API_KEY, APP_CODE        (npx wrangler secret put …)
// Variablen: MODEL, ALLOWED_ORIGINS            (wrangler.toml)

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const STANDARD_MODELL = 'claude-sonnet-5-5';
const TYPEN = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BASE64 = 13_000_000; // ~9.5 MB Datei

const SYSTEM = `Du liest Belege (Quittungen, Rechnungen, Tankbelege, Maut- und Parkbelege) für die
Spesenabrechnung der QPS Engineering AG in Stein (Schweiz) aus. Mitarbeitende kaufen in der
Schweiz (CHF) und in Deutschland/Frankreich (EUR) ein. Gib ausschliesslich die Felder des Schemas zurück.
Erfinde nichts: Was nicht lesbar ist, wird null bzw. leer, und "sicherheit" wird "niedrig".`;

function auftrag(kategorien, kostenstellen) {
  return `Lies diesen Beleg aus. Regeln:
- haendler: Firmenname kurz wie auf dem Beleg, z. B. "Shell Station", "Voegtlin Meyer AG", "Amazon", "APRR".
- datum: Kauf-/Belegdatum als YYYY-MM-DD (nicht Druck- oder Fälligkeitsdatum). Belege nutzen meist TT.MM.JJ(JJ).
- waehrung: ISO-Code ("CHF" bei Fr./SFr./CHF, "EUR" bei €).
- betrag_total: tatsächlich bezahlter Endbetrag inkl. MWST (TOTAL / Summe / zu zahlen), nach Rabatten.
- mwst: jeder ausgewiesene Steuersatz mit Steuerbetrag (z. B. 8.1 / 2.6 / 3.8 in der Schweiz, 19 / 7 in DE).
  Ist nur der Satz erkennbar, betrag = null. Keine MWST ausgewiesen: leere Liste.
- kategorie: genau einer dieser Werte: ${kategorien.map((k) => `"${k}"`).join(', ')} – oder "" wenn nichts passt.
  Treibstoff = "Benzin" (falls vorhanden), Autobahn-/Tunnelgebühren = "Maut" (falls vorhanden).
- kostenstelle: nur wenn auf dem Beleg erkennbar (Projektnummer, Besteller, Lieferadresse), sonst null.
  Bekannte Kostenstellen: ${kostenstellen.join(', ') || 'keine'}.
- beschreibung: was gekauft wurde, max. 4 Wörter (z. B. "Teflonband", "Zutrittskarten"); bei Treibstoff leer.
- belegnummer: Beleg-/Rechnungsnummer falls vorhanden, sonst null.
- sicherheit: "hoch" wenn alles klar lesbar, "mittel" bei kleinen Unsicherheiten, "niedrig" wenn unscharf/unvollständig.
- hinweise: ein kurzer Satz zu Unklarheiten (z. B. "Betrag teilweise verdeckt"), sonst "".`;
}

const nullbar = (s) => ({ anyOf: [s, { type: 'null' }] });

export function schema(kategorien) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['haendler', 'datum', 'waehrung', 'betrag_total', 'mwst', 'kategorie', 'kostenstelle',
      'beschreibung', 'belegnummer', 'sicherheit', 'hinweise'],
    properties: {
      haendler: { type: 'string' },
      datum: nullbar({ type: 'string', format: 'date' }),
      waehrung: { type: 'string', description: 'ISO-4217-Code, z. B. CHF oder EUR' },
      betrag_total: nullbar({ type: 'number' }),
      mwst: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['satz', 'betrag'],
          properties: { satz: { type: 'number' }, betrag: nullbar({ type: 'number' }) },
        },
      },
      kategorie: { type: 'string', enum: [...new Set([...kategorien, ''])] },
      kostenstelle: nullbar({ type: 'string' }),
      beschreibung: { type: 'string' },
      belegnummer: nullbar({ type: 'string' }),
      sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
      hinweise: { type: 'string' },
    },
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const erlaubt = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
    const offen = erlaubt.includes('*');
    const cors = {
      'access-control-allow-origin': offen ? '*' : erlaubt.includes(origin) ? origin : erlaubt[0] || '',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-app-code',
      'access-control-max-age': '86400',
      vary: 'origin',
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!offen && origin && !erlaubt.includes(origin)) return json({ fehler: 'Herkunft nicht erlaubt' }, 403);
    if (!env.APP_CODE || request.headers.get('x-app-code') !== env.APP_CODE) {
      return json({ fehler: 'Zugangscode fehlt oder ist falsch' }, 401);
    }

    const modell = env.MODEL || STANDARD_MODELL;
    const { pathname } = new URL(request.url);
    if (pathname === '/status') return json({ ok: true, modell });
    if (pathname !== '/lesen' || request.method !== 'POST') return json({ fehler: 'Nicht gefunden' }, 404);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ fehler: 'Ungültige Anfrage' }, 400);
    }
    const { typ, daten } = body;
    const kategorien = Array.isArray(body.kategorien) ? body.kategorien.map(String).slice(0, 50) : [];
    const kostenstellen = Array.isArray(body.kostenstellen) ? body.kostenstellen.map(String).slice(0, 50) : [];
    if (!TYPEN.includes(typ) || typeof daten !== 'string' || !daten) return json({ fehler: 'Dateityp nicht unterstützt' }, 400);
    if (daten.length > MAX_BASE64) return json({ fehler: 'Datei zu gross' }, 413);

    const quelle = { type: 'base64', media_type: typ, data: daten };
    const block = typ === 'application/pdf' ? { type: 'document', source: quelle } : { type: 'image', source: quelle };

    const antwort = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modell,
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: 'user', content: [block, { type: 'text', text: auftrag(kategorien, kostenstellen) }] }],
        output_config: { format: { type: 'json_schema', schema: schema(kategorien) } },
      }),
    });
    const r = await antwort.json().catch(() => ({}));
    if (!antwort.ok) return json({ fehler: `KI-Dienst: ${r.error?.message || `Fehler ${antwort.status}`}` }, 502);
    if (r.stop_reason === 'refusal') return json({ fehler: 'Beleg konnte nicht ausgelesen werden' }, 422);

    const text = r.content?.find((b) => b.type === 'text')?.text;
    try {
      return json(JSON.parse(text));
    } catch {
      return json({ fehler: 'Antwort der KI nicht lesbar' }, 502);
    }
  },
};
