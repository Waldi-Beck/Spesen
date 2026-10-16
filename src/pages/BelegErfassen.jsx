import { useEffect, useRef, useState } from 'react';
import { db, dateienVon, loescheBeleg, speichereBeleg } from '../db/db.js';
import { BILD_MAX_ARCHIV, MWST_SAETZE, WAEHRUNGEN } from '../config/einstellungen.js';
import { verkleinere, drehe, istPdf } from '../lib/bild.js';
import { liesBeleg } from '../lib/belegLesen.js';
import { detailsText, mwstAusBrutto, pruefeBeleg } from '../lib/berechnung.js';
import { heuteISO, runde2 } from '../lib/format.js';
import { Meldung, useBlobUrl } from '../components/Bausteine.jsx';
import { IconDatei, IconKamera } from '../components/Icons.jsx';
import { geheZu } from '../lib/navigation.js';

const LEER = {
  haendler: '', datum: '', waehrung: 'CHF', betrag: '', mwst: [],
  kategorie: '', kostenstelle: '', beschreibung: '', details: '', ki: null,
};

const zahl = (t) => {
  const n = parseFloat(String(t).replace(/'/g, '').replace(',', '.'));
  return Number.isFinite(n) ? runde2(n) : '';
};

export default function BelegErfassen({ id, einst }) {
  const [f, setF] = useState(LEER);
  const [dateien, setDateien] = useState([]);
  const [status, setStatus] = useState(null); // eingereicht?
  const [detailsManuell, setDetailsManuell] = useState(false);
  const [lesen, setLesen] = useState({ zustand: 'aus', text: '' });
  const [loeschFrage, setLoeschFrage] = useState(false);
  const [gespeichert, setGespeichert] = useState('');
  const kamera = useRef(null);
  const datei = useRef(null);
  // Felder, die der Benutzer selbst geändert hat – die KI überschreibt sie nie
  const beruehrt = useRef(new Set());

  // Bestehenden Beleg laden
  useEffect(() => {
    if (!id) return;
    (async () => {
      const b = await db.belege.get(id);
      if (!b) return geheZu('/');
      const liste = await dateienVon(id);
      setDateien((b.dateien || []).map((d) => liste.find((x) => x.id === d)).filter(Boolean));
      setF({
        ...LEER, ...b,
        betrag: typeof b.betrag === 'number' ? b.betrag.toFixed(2) : '',
        mwst: (b.mwst || []).map((m) => ({ ...m, betrag: Number(m.betrag || 0).toFixed(2) })),
      });
      beruehrt.current = new Set(Object.keys(LEER));
      setStatus(b.status);
      setDetailsManuell(b.details !== detailsText(b));
    })();
  }, [id]);

  const setze = (feld, wert, { auto = false } = {}) => setF((alt) => {
    if (!auto) beruehrt.current.add(feld);
    const neu = { ...alt, [feld]: wert };
    if (!detailsManuell && ['kategorie', 'kostenstelle', 'beschreibung'].includes(feld)) neu.details = detailsText(neu);
    if (feld === 'waehrung' && wert !== 'CHF') neu.mwst = [];
    return neu;
  });

  async function hinzufuegen(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const ersteDatei = dateien.length === 0 && !id;
    const neue = [];
    for (const file of files) {
      const pdf = istPdf(file);
      neue.push({
        blob: pdf ? file : await verkleinere(file, BILD_MAX_ARCHIV),
        typ: pdf ? 'application/pdf' : 'image/jpeg',
        name: file.name,
      });
    }
    setDateien((d) => [...d, ...neue]);
    if (ersteDatei && !f.datum) setze('datum', heuteISO(), { auto: true });
    if (ersteDatei && einst.kiUrl) auslesen(files[0]);
  }

  async function auslesen(file) {
    setLesen({ zustand: 'laeuft', text: '' });
    try {
      const r = await liesBeleg(file, einst);
      setF((alt) => {
        // Nur Felder übernehmen, die der Benutzer nicht selbst geändert hat
        const neu = { ...alt };
        for (const [k, v] of Object.entries(r)) {
          if (!beruehrt.current.has(k) && v !== '' && v != null) neu[k] = v;
        }
        if (typeof neu.betrag === 'number') neu.betrag = neu.betrag.toFixed(2);
        neu.mwst = neu.mwst.map((m) => ({ ...m, betrag: typeof m.betrag === 'number' ? m.betrag.toFixed(2) : m.betrag }));
        neu.details = detailsManuell ? alt.details : detailsText(neu);
        return neu;
      });
      setLesen({ zustand: 'fertig', text: r.ki?.hinweise || '' });
    } catch (e) {
      setLesen({ zustand: 'fehler', text: e.message });
    }
  }

  async function speichern(naechster) {
    const beleg = { ...f, betrag: zahl(f.betrag), mwst: f.mwst.map((m) => ({ satz: Number(m.satz), betrag: zahl(m.betrag) || 0 })) };
    if (!beleg.details) beleg.details = detailsText(beleg);
    await speichereBeleg(id ? { ...beleg, id } : beleg, dateien);
    if (!naechster) return geheZu('/');
    setF(LEER);
    setDateien([]);
    setDetailsManuell(false);
    beruehrt.current = new Set();
    setLesen({ zustand: 'aus', text: '' });
    setGespeichert(`«${beleg.haendler || 'Beleg'}» gespeichert.`);
    window.scrollTo(0, 0);
  }

  const pruefung = pruefeBeleg({ ...f, betrag: zahl(f.betrag), dateien });

  return (
    <main>
      {gespeichert && <Meldung art="info">{gespeichert} Nächsten Beleg fotografieren:</Meldung>}
      {status === 'eingereicht' && <Meldung art="warn">Dieser Beleg wurde bereits eingereicht und kann nur angesehen werden.</Meldung>}

      {/* 1. Foto / Datei */}
      <section className="karte">
        <h2>{dateien.length ? 'Beleg' : '1. Beleg aufnehmen'}</h2>
        {dateien.length > 0 && (
          <div className="seiten">
            {dateien.map((d, i) => (
              <Seite key={d.id || i} datei={d}
                onDrehen={async () => {
                  const blob = await drehe(d.blob);
                  setDateien((ds) => ds.map((x, k) => (k === i ? { ...x, blob, id: undefined } : x)));
                }}
                onEntfernen={() => setDateien((ds) => ds.filter((_, k) => k !== i))} />
            ))}
          </div>
        )}
        <input ref={kamera} className="versteckt" type="file" accept="image/*" capture="environment"
          onChange={(e) => { hinzufuegen(e.target.files); e.target.value = ''; }} />
        <input ref={datei} className="versteckt" type="file" accept="image/*,application/pdf" multiple
          onChange={(e) => { hinzufuegen(e.target.files); e.target.value = ''; }} />
        <div className="zeile" style={{ marginTop: dateien.length ? 12 : 0 }}>
          <button type="button" className={dateien.length ? '' : 'primaer gross'} onClick={() => kamera.current.click()}>
            <IconKamera /> {dateien.length ? 'Weitere Seite' : 'Foto aufnehmen'}
          </button>
          <button type="button" className={dateien.length ? '' : 'gross'} onClick={() => datei.current.click()}>
            <IconDatei /> Bild / PDF wählen
          </button>
        </div>
        {lesen.zustand === 'laeuft' && <p className="lade"><span className="spinner" /> Beleg wird gelesen …</p>}
        {lesen.zustand === 'fertig' && (
          <Meldung art={f.ki?.sicherheit === 'niedrig' ? 'warn' : 'info'}>
            Automatisch ausgefüllt{f.ki?.sicherheit ? ` (Sicherheit: ${f.ki.sicherheit})` : ''} – bitte kurz prüfen.
            {lesen.text && <div>{lesen.text}</div>}
          </Meldung>
        )}
        {lesen.zustand === 'fehler' && <Meldung art="warn">Automatisches Auslesen nicht möglich: {lesen.text} Bitte Felder von Hand ausfüllen.</Meldung>}
        {!einst.kiUrl && dateien.length > 0 && <Meldung art="info">Automatisches Auslesen ist noch nicht eingerichtet – Felder bitte von Hand ausfüllen.</Meldung>}
      </section>

      {/* 2. Angaben */}
      <section className="karte formular">
        <h2>2. Angaben prüfen</h2>
        <label>Auslagen (Händler)
          <input value={f.haendler} onChange={(e) => setze('haendler', e.target.value)} placeholder="z. B. Shell Station" />
        </label>
        <div className="zwei">
          <label>Datum
            <input type="date" value={f.datum} onChange={(e) => setze('datum', e.target.value)} />
          </label>
          <label>Betrag (inkl. MWST)
            <input inputMode="decimal" value={f.betrag} onChange={(e) => setze('betrag', e.target.value)} placeholder="0.00" />
          </label>
        </div>
        <div className="segment" role="group" aria-label="Währung">
          {WAEHRUNGEN.map((w) => (
            <button type="button" key={w} className={f.waehrung === w ? 'aktiv' : ''} onClick={() => setze('waehrung', w)}>{w}</button>
          ))}
        </div>
        {f.ki?.andereWaehrung && <Meldung art="warn">Beleg ist in {f.ki.andereWaehrung} – die QPS-Tabelle kennt nur CHF und EUR. Bitte mit der Buchhaltung klären.</Meldung>}

        {f.waehrung === 'CHF' && (
          <div className="formular">
            <h3>MWST (Schweiz)</h3>
            {f.mwst.map((m, i) => (
              <div className="zwei" key={i}>
                <select value={m.satz} onChange={(e) => setze('mwst', f.mwst.map((x, k) => (k === i ? { ...x, satz: Number(e.target.value) } : x)))}>
                  {MWST_SAETZE.map((s) => <option key={s.satz} value={s.satz}>{s.label}</option>)}
                </select>
                <div className="zeile">
                  <input inputMode="decimal" value={m.betrag} placeholder="MWST CHF"
                    onChange={(e) => setze('mwst', f.mwst.map((x, k) => (k === i ? { ...x, betrag: e.target.value } : x)))} />
                  <button type="button" className="klein" style={{ flex: '0 0 auto' }}
                    onClick={() => setze('mwst', f.mwst.filter((_, k) => k !== i))}>✕</button>
                </div>
              </div>
            ))}
            <div className="zeile">
              <button type="button" className="klein" onClick={() => setze('mwst', [...f.mwst, { satz: 8.1, betrag: '' }])}>+ MWST-Satz</button>
              {f.mwst.length === 1 && zahl(f.betrag) > 0 && (
                <button type="button" className="klein"
                  onClick={() => setze('mwst', [{ ...f.mwst[0], betrag: mwstAusBrutto(zahl(f.betrag), Number(f.mwst[0].satz)) }])}>
                  Aus Betrag berechnen
                </button>
              )}
            </div>
          </div>
        )}

        <div className="zwei">
          <label>Kategorie
            <input list="kategorien" value={f.kategorie} onChange={(e) => setze('kategorie', e.target.value)} placeholder="z. B. Benzin" />
          </label>
          <label>Kostenstelle / Projekt
            <input list="kostenstellen" value={f.kostenstelle} onChange={(e) => setze('kostenstelle', e.target.value)} placeholder="z. B. QxTec, 4054" />
          </label>
        </div>
        <datalist id="kategorien">{einst.kategorien.map((k) => <option key={k} value={k} />)}</datalist>
        <datalist id="kostenstellen">{einst.kostenstellen.map((k) => <option key={k} value={k} />)}</datalist>
        <label>Beschreibung (optional)
          <input value={f.beschreibung} onChange={(e) => setze('beschreibung', e.target.value)} placeholder="z. B. Teflonband, Fahrt Dublin" />
        </label>
        <label>Details (so erscheint es in der Tabelle)
          <input value={f.details} onChange={(e) => { setDetailsManuell(true); setF({ ...f, details: e.target.value }); }} />
        </label>

        <Meldung art="fehler" liste={pruefung.fehler} titel={pruefung.fehler.length ? 'Fehlt noch:' : null} />
        <Meldung art="warn" liste={pruefung.hinweise} titel={pruefung.hinweise.length ? 'Hinweise:' : null} />
      </section>

      {status !== 'eingereicht' && (
        <div className="formular">
          <div className="zeile">
            <button className="primaer gross" onClick={() => speichern(false)}>Speichern</button>
            {!id && <button className="gross" onClick={() => speichern(true)}>Speichern + nächster</button>}
          </div>
          {id && !loeschFrage && <button className="gefahr" onClick={() => setLoeschFrage(true)}>Beleg löschen</button>}
          {id && loeschFrage && (
            <div className="zeile">
              <button onClick={() => setLoeschFrage(false)}>Abbrechen</button>
              <button className="gefahr" onClick={async () => { await loescheBeleg(id); geheZu('/'); }}>Wirklich löschen</button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function Seite({ datei, onDrehen, onEntfernen }) {
  const pdf = datei.typ === 'application/pdf';
  const url = useBlobUrl(datei.blob);
  return (
    <div className="seite">
      {pdf ? <a className="pdf" href={url || undefined} target="_blank" rel="noreferrer">PDF</a> : <img src={url || undefined} alt="Beleg" />}
      <div className="aktionen">
        {!pdf && <button type="button" onClick={onDrehen} title="Drehen">↻</button>}
        <button type="button" onClick={onEntfernen} title="Entfernen">✕</button>
      </div>
    </div>
  );
}
