import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { schema } from '../worker/src/index.js';
import { zuBelegFeldern } from '../src/lib/belegLesen.js';

const env = { APP_CODE: 'geheim', ANTHROPIC_API_KEY: 'sk-test', MODEL: 'claude-sonnet-5-5', ALLOWED_ORIGINS: 'https://waldi-beck.github.io' };
const anfrage = (pfad, { code = 'geheim', body, origin = 'https://waldi-beck.github.io' } = {}) =>
  new Request(`https://ki.example.dev${pfad}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-app-code': code, origin, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

afterEach(() => vi.restoreAllMocks());

describe('KI-Worker', () => {
  it('lehnt falschen Zugangscode und fremde Herkunft ab', async () => {
    expect((await worker.fetch(anfrage('/status', { code: 'falsch' }), env)).status).toBe(401);
    expect((await worker.fetch(anfrage('/status', { origin: 'https://fremd.example' }), env)).status).toBe(403);
    const ok = await worker.fetch(anfrage('/status'), env);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://waldi-beck.github.io');
  });

  it('schickt Bild + Schema an die Claude-API und gibt die Felder zurück', async () => {
    const ki = {
      haendler: 'bp', datum: '2026-06-19', waehrung: 'CHF', betrag_total: 34.1,
      mwst: [{ satz: 8.1, betrag: 2.56 }], kategorie: 'Benzin', kostenstelle: null,
      beschreibung: '', belegnummer: '4711', sicherheit: 'hoch', hinweise: '',
    };
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(ki) }] })),
    );
    const res = await worker.fetch(anfrage('/lesen', { body: { typ: 'image/jpeg', daten: 'QUJD', kategorien: ['Benzin', 'Maut'], kostenstellen: ['QxTec'] } }), env);
    expect(res.status).toBe(200);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-test');
    const gesendet = JSON.parse(init.body);
    expect(gesendet.model).toBe('claude-sonnet-5-5');
    expect(gesendet.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
    expect(gesendet.output_config.format.type).toBe('json_schema');
    expect(gesendet.output_config.format.schema.properties.kategorie.enum).toEqual(['Benzin', 'Maut', '']);

    const felder = zuBelegFeldern(await res.json());
    expect(felder).toMatchObject({ haendler: 'bp', betrag: 34.1, waehrung: 'CHF', kategorie: 'Benzin', details: 'Benzin' });
    expect(felder.mwst).toEqual([{ satz: 8.1, betrag: 2.56 }]);
  });

  it('sendet PDFs als document-Block', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }] })),
    );
    await worker.fetch(anfrage('/lesen', { body: { typ: 'application/pdf', daten: 'JVBERi0=' } }), env);
    expect(JSON.parse(spy.mock.calls[0][1].body).messages[0].content[0].type).toBe('document');
  });

  it('Schema erfüllt die Vorgaben für Structured Outputs', () => {
    const s = schema(['Benzin']);
    const pruefe = (o) => {
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false);
        expect(o.required.sort()).toEqual(Object.keys(o.properties).sort());
        Object.values(o.properties).forEach(pruefe);
      }
      if (o.items) pruefe(o.items);
      (o.anyOf || []).forEach(pruefe);
      for (const verboten of ['minimum', 'maximum', 'minLength', 'maxLength']) expect(o[verboten]).toBeUndefined();
    };
    pruefe(s);
  });

  it('EUR-Belege bekommen keine CH-MWST', () => {
    const f = zuBelegFeldern({ haendler: 'Toom', waehrung: 'EUR', betrag_total: 59.83, mwst: [{ satz: 19, betrag: 9.55 }], kategorie: 'Material' });
    expect(f.mwst).toEqual([]);
  });
});
