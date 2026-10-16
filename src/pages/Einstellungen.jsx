import { useEffect, useState } from 'react';
import { speichereEinstellungen, speicherDauerhaft } from '../db/db.js';
import { testeVerbindung } from '../lib/belegLesen.js';
import { ladeRessourcen } from '../lib/ressourcen.js';
import { Meldung, UnterschriftPad } from '../components/Bausteine.jsx';

export default function Einstellungen({ einst }) {
  const [profil, setProfil] = useState(einst.profil);
  const [empfaenger, setEmpfaenger] = useState(einst.empfaenger);
  const [kiUrl, setKiUrl] = useState(einst.kiUrl);
  const [kiCode, setKiCode] = useState(einst.kiCode);
  const [kategorien, setKategorien] = useState(einst.kategorien.join('\n'));
  const [kostenstellen, setKostenstellen] = useState(einst.kostenstellen.join('\n'));
  const [meldung, setMeldung] = useState(null);
  const [vorlage, setVorlage] = useState(null);
  const [dauerhaft, setDauerhaft] = useState(null);

  useEffect(() => {
    ladeRessourcen().then((r) => setVorlage(!!r.vorlage));
    navigator.storage?.persisted?.().then(setDauerhaft);
  }, []);

  const liste = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);
  const speichern = async () => {
    await speichereEinstellungen({
      profil, empfaenger, kiUrl: kiUrl.trim(), kiCode: kiCode.trim(),
      kategorien: liste(kategorien), kostenstellen: liste(kostenstellen),
    });
    setMeldung({ art: 'info', text: 'Gespeichert.' });
  };

  const test = async () => {
    setMeldung({ art: 'info', text: 'Teste Verbindung …' });
    try {
      const r = await testeVerbindung({ kiUrl, kiCode });
      setMeldung({ art: 'info', text: `KI-Dienst erreichbar (Modell: ${r.modell}).` });
    } catch (e) {
      setMeldung({ art: 'fehler', text: `Keine Verbindung: ${e.message}` });
    }
  };

  const p = (k) => (e) => setProfil({ ...profil, [k]: e.target.value });

  return (
    <main>
      <section className="karte formular">
        <h2>Profil (erscheint auf der Abrechnung)</h2>
        <div className="zwei">
          <label>Name<input value={profil.name} onChange={p('name')} autoComplete="family-name" /></label>
          <label>Vorname<input value={profil.vorname} onChange={p('vorname')} autoComplete="given-name" /></label>
        </div>
        <label>E-Mail<input type="email" value={profil.email} onChange={p('email')} autoComplete="email" /></label>
        <div>
          <label>Filiale Stein</label>
          <div className="segment">
            <button type="button" className={profil.filialeStein ? 'aktiv' : ''} onClick={() => setProfil({ ...profil, filialeStein: true })}>Ja</button>
            <button type="button" className={!profil.filialeStein ? 'aktiv' : ''} onClick={() => setProfil({ ...profil, filialeStein: false })}>Nein</button>
          </div>
        </div>
        <label>Abrechnung senden an (z. B. Buchhaltung)
          <input type="email" value={empfaenger} onChange={(e) => setEmpfaenger(e.target.value)} placeholder="buchhaltung@…" />
        </label>
      </section>

      <section className="karte">
        <h2>Unterschrift</h2>
        <p className="sub">Einmal mit dem Finger unterschreiben – wird auf Excel und PDF gesetzt.</p>
        <UnterschriftPad wert={einst.unterschrift} onSpeichern={(png) => speichereEinstellungen({ unterschrift: png })} />
      </section>

      <section className="karte formular">
        <h2>Automatisches Auslesen (KI-Dienst)</h2>
        <label>Adresse des KI-Dienstes
          <input value={kiUrl} onChange={(e) => setKiUrl(e.target.value)} placeholder="https://qps-spesen-ki.<name>.workers.dev" />
        </label>
        <label>Zugangscode
          <input type="password" value={kiCode} onChange={(e) => setKiCode(e.target.value)} autoComplete="off" />
        </label>
        <button type="button" onClick={test} disabled={!kiUrl}>Verbindung testen</button>
      </section>

      <section className="karte formular">
        <h2>Auswahllisten</h2>
        <div className="zwei">
          <label>Kategorien (eine pro Zeile)<textarea rows={8} value={kategorien} onChange={(e) => setKategorien(e.target.value)} /></label>
          <label>Kostenstellen / Projekte<textarea rows={8} value={kostenstellen} onChange={(e) => setKostenstellen(e.target.value)} /></label>
        </div>
      </section>

      {meldung && <Meldung art={meldung.art}>{meldung.text}</Meldung>}
      <button className="primaer gross" onClick={speichern}>Einstellungen speichern</button>

      <section className="karte formular">
        <h2>System</h2>
        <div>QPS-Excel-Vorlage: {vorlage === null ? '…' : vorlage ? <span className="badge ok">gefunden</span> : <span className="badge warn">nicht hinterlegt – App-Format wird verwendet</span>}</div>
        <div>Daten dauerhaft gespeichert: {dauerhaft ? <span className="badge ok">ja</span> : <span className="badge warn">nein</span>}</div>
        {!dauerhaft && (
          <button type="button" className="klein" onClick={async () => setDauerhaft(await speicherDauerhaft())}>Dauerhafte Speicherung anfordern</button>
        )}
        <p className="sub">Tipp: App über «Zum Home-Bildschirm» installieren – dann löscht das iPhone die Daten nicht automatisch.</p>
      </section>
    </main>
  );
}
