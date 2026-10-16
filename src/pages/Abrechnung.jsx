import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, markiereEingereicht, abrechnungZuruecknehmen, speichereAbrechnung } from '../db/db.js';
import { positionen, summen, pruefeBeleg, moeglicheDuplikate, tabellenZeile } from '../lib/berechnung.js';
import { herunterladen, teilen, teilText } from '../lib/teilen.js';
import { aktuellerMonat, betragText, monatJahr } from '../lib/format.js';
import { Meldung, Summen } from '../components/Bausteine.jsx';
import { IconSenden } from '../components/Icons.jsx';

export default function Abrechnung({ einst }) {
  const [monat, setMonat] = useState(aktuellerMonat());
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [ergebnisId, setErgebnisId] = useState(null);
  const [info, setInfo] = useState('');

  const offene = useLiveQuery(() => db.belege.where('status').equals('offen').toArray(), []);
  const archiv = useLiveQuery(() => db.abrechnungen.orderBy('erstelltAm').reverse().toArray(), []);
  if (!offene || !archiv) return null;

  const pos = positionen(offene);
  const s = summen(pos);
  const unvollstaendig = pos.filter((b) => !pruefeBeleg(b).ok);
  const duplikate = moeglicheDuplikate(pos);
  const p = einst.profil;
  const checks = [
    { ok: !!(p.name && p.vorname && p.email), text: 'Profil (Name, Vorname, E-Mail)', link: '#/einstellungen' },
    { ok: !!einst.unterschrift, text: 'Unterschrift hinterlegt', link: '#/einstellungen' },
    { ok: pos.length > 0, text: `${pos.length} offene Belege` },
    { ok: unvollstaendig.length === 0, text: unvollstaendig.length ? `${unvollstaendig.length} Beleg(e) unvollständig` : 'Alle Belege vollständig', link: '#/' },
  ];
  const bereit = checks.every((c) => c.ok);
  const ergebnis = archiv.find((a) => a.id === ergebnisId);

  async function erstellen() {
    setLaeuft(true);
    setFehler('');
    try {
      const { erstelleAbrechnung } = await import('../lib/abrechnung.js');
      const r = await erstelleAbrechnung({ monat, belege: offene, einst });
      const id = await speichereAbrechnung({
        monat, belegIds: r.belegIds, summen: r.summen, hinweise: r.hinweise, quelle: r.quelle,
        excel: r.excel, pdf: r.pdf,
      });
      setErgebnisId(id);
    } catch (e) {
      console.error(e);
      setFehler(e.message);
    } finally {
      setLaeuft(false);
    }
  }

  async function senden(abr) {
    try {
      const art = await teilen([abr.excel, abr.pdf], { titel: `Spesen ${monatJahr(abr.monat)}`, text: teilText(abr.monat, abr.summen, p) });
      setInfo(art === 'geteilt'
        ? 'Geteilt. Wurde die E-Mail gesendet? Dann «Als eingereicht markieren».'
        : 'Teilen wird hier nicht unterstützt – Dateien wurden heruntergeladen. Bitte per E-Mail anhängen.');
    } catch (e) {
      if (e.name !== 'AbortError') setFehler(e.message);
    }
  }

  return (
    <main>
      {!ergebnis && (
        <>
          <section className="karte formular">
            <h2>Neue Abrechnung</h2>
            <label>Abrechnungsmonat
              <input type="month" value={monat} onChange={(e) => setMonat(e.target.value)} />
            </label>
            <Summen s={s} />
            <ul className="check">
              {checks.map((c) => (
                <li key={c.text}>
                  <span className={`badge ${c.ok ? 'ok' : 'fehler'}`}>{c.ok ? 'OK' : '!'}</span>
                  {c.link && !c.ok ? <a href={c.link}>{c.text}</a> : c.text}
                </li>
              ))}
            </ul>
            {duplikate.length > 0 && <Meldung art="warn">{duplikate.length} mögliche Doppelerfassung(en) – gleicher Betrag am gleichen Tag. Bitte in der Liste prüfen.</Meldung>}
          </section>

          {pos.length > 0 && (
            <section className="karte">
              <h2>Vorschau</h2>
              <div className="scroll">
                <table className="vorschau">
                  <thead><tr><th>#</th><th>Auslagen</th><th>Datum</th><th>Details</th><th className="zahl">CHF</th><th className="zahl">EUR</th></tr></thead>
                  <tbody>
                    {pos.map((b) => {
                      const z = tabellenZeile(b);
                      return (
                        <tr key={b.id}>
                          <td>{z.nr}</td><td>{z.auslagen}</td><td>{z.datumText}</td><td>{z.details}</td>
                          <td className="zahl">{betragText(z.chf)}</td><td className="zahl">{betragText(z.eur)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr><th colSpan={4}>MWST 8.1 % / 2.6 %: {betragText(s.mwst81)} / {betragText(s.mwst26)}</th><th className="zahl">{betragText(s.chf)}</th><th className="zahl">{betragText(s.eur)}</th></tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {fehler && <Meldung art="fehler">{fehler}</Meldung>}
          <button className="primaer gross" disabled={!bereit || laeuft} onClick={erstellen}>
            {laeuft ? <><span className="spinner" /> Wird erstellt …</> : 'Abrechnung erstellen (Excel + PDF)'}
          </button>
        </>
      )}

      {ergebnis && (
        <section className="karte formular">
          <h2>Abrechnung {monatJahr(ergebnis.monat)} erstellt</h2>
          <Summen s={ergebnis.summen} />
          {ergebnis.quelle === 'app' && <Meldung art="info">Excel im App-Format erstellt (keine QPS-Vorlage hinterlegt).</Meldung>}
          <Meldung art="warn" liste={ergebnis.hinweise} />
          {info && <Meldung art="info">{info}</Meldung>}
          {fehler && <Meldung art="fehler">{fehler}</Meldung>}
          <button className="primaer gross" onClick={() => senden(ergebnis)}><IconSenden /> Senden (E-Mail, Teams …)</button>
          <div className="zeile">
            <button onClick={() => herunterladen(ergebnis.excel)}>Excel</button>
            <button onClick={() => herunterladen(ergebnis.pdf)}>PDF mit Belegen</button>
          </div>
          {einst.empfaenger && <p className="sub">Empfänger: {einst.empfaenger}</p>}
          <button className="gross" onClick={async () => { await markiereEingereicht(ergebnis.id); setErgebnisId(null); setInfo(''); }}>
            Als eingereicht markieren
          </button>
          <button className="klein" onClick={async () => { await db.abrechnungen.delete(ergebnis.id); setErgebnisId(null); }}>
            Verwerfen (Belege bleiben offen)
          </button>
        </section>
      )}

      <section className="karte">
        <h2>Archiv</h2>
        {archiv.length === 0 && <div className="leer">Noch keine Abrechnungen.</div>}
        <div className="liste">
          {archiv.map((a) => (
            <div key={a.id} className="formular" style={{ borderBottom: '1px solid var(--linie)', paddingBottom: 10 }}>
              <div>
                <strong>{monatJahr(a.monat)}</strong> · {a.summen.anzahl} Belege · CHF {betragText(a.summen.chf)} · EUR {betragText(a.summen.eur)}{' '}
                <span className={`badge ${a.status === 'eingereicht' ? 'ok' : 'warn'}`}>{a.status === 'eingereicht' ? 'eingereicht' : 'noch nicht eingereicht'}</span>
              </div>
              <div className="zeile">
                {a.status !== 'eingereicht' && <button className="klein primaer" onClick={() => setErgebnisId(a.id)}>Öffnen</button>}
                <button className="klein" onClick={() => senden(a)}>{a.status === 'eingereicht' ? 'Erneut senden' : 'Senden'}</button>
                <button className="klein" onClick={() => herunterladen(a.pdf)}>PDF</button>
                <button className="klein" onClick={() => herunterladen(a.excel)}>Excel</button>
                {a.status === 'eingereicht' && <button className="klein gefahr" onClick={() => abrechnungZuruecknehmen(a.id)}>Zurücknehmen</button>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
