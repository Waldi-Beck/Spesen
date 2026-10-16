import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { positionen, summen, moeglicheDuplikate, pruefeBeleg } from '../lib/berechnung.js';
import { BelegKarte, Meldung, Summen } from '../components/Bausteine.jsx';
import { IconKamera } from '../components/Icons.jsx';
import { geheZu } from '../lib/navigation.js';

export default function Uebersicht({ einst }) {
  const offene = useLiveQuery(() => db.belege.where('status').equals('offen').toArray(), []);
  if (!offene) return null;

  const pos = positionen(offene);
  const s = summen(pos);
  const doppelt = new Set(moeglicheDuplikate(pos).flat());
  const mitFehler = pos.filter((b) => !pruefeBeleg(b).ok).length;
  const profilFehlt = !einst.profil.name || !einst.profil.email;

  return (
    <main>
      {profilFehlt && (
        <Meldung art="warn" titel="Einmalig einrichten">
          <div>Name, E-Mail und Unterschrift unter <a href="#/einstellungen">Einstellungen</a> eintragen – sie erscheinen auf jeder Abrechnung.</div>
        </Meldung>
      )}

      <section className="karte">
        <h2>Offene Belege</h2>
        <Summen s={s} />
      </section>

      <button className="primaer gross" onClick={() => geheZu('/beleg')}>
        <IconKamera /> Beleg fotografieren
      </button>

      {mitFehler > 0 && <Meldung art="fehler">{mitFehler} Beleg(e) unvollständig – antippen zum Ergänzen.</Meldung>}

      <section className="liste">
        {pos.length === 0 && (
          <div className="leer">
            Noch keine offenen Belege.<br />Tippe auf «Beleg fotografieren».
          </div>
        )}
        {pos.map((b) => (
          <BelegKarte key={b.id} beleg={b} duplikat={doppelt.has(b.id)} onClick={() => geheZu(`/beleg/${b.id}`)} />
        ))}
      </section>

      {pos.length > 0 && (
        <button className="gross" onClick={() => geheZu('/abrechnung')}>Weiter zur Abrechnung</button>
      )}
    </main>
  );
}
