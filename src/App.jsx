import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ladeEinstellungen } from './db/db.js';
import Uebersicht from './pages/Uebersicht.jsx';
import BelegErfassen from './pages/BelegErfassen.jsx';
import Abrechnung from './pages/Abrechnung.jsx';
import Einstellungen from './pages/Einstellungen.jsx';
import { IconKamera, IconListe, IconSenden, IconZahnrad } from './components/Icons.jsx';

// Einfaches Hash-Routing: #/ | #/beleg | #/beleg/<id> | #/abrechnung | #/einstellungen
const leseRoute = () => {
  const [, seite = '', id = null] = window.location.hash.replace(/^#/, '').split('/');
  return { seite, id };
};

export default function App() {
  const [route, setRoute] = useState(leseRoute);
  useEffect(() => {
    const f = () => { setRoute(leseRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  // Einstellungen live (ändern sich sofort überall)
  const einst = useLiveQuery(async () => {
    await db.einstellungen.get('app');
    return ladeEinstellungen();
  }, []);
  if (!einst) return null;

  let seite;
  let titel = 'Spesen';
  if (route.seite === 'beleg') {
    seite = <BelegErfassen key={route.id || 'neu'} id={route.id} einst={einst} />;
    titel = route.id ? 'Beleg bearbeiten' : 'Neuer Beleg';
  } else if (route.seite === 'abrechnung') {
    seite = <Abrechnung einst={einst} />;
    titel = 'Abrechnung';
  } else if (route.seite === 'einstellungen') {
    seite = <Einstellungen einst={einst} />;
    titel = 'Einstellungen';
  } else {
    seite = <Uebersicht einst={einst} />;
  }

  const aktiv = (s) => (route.seite === s ? 'aktiv' : '');
  return (
    <div className="app">
      <header className="kopf">
        <img src={`${import.meta.env.BASE_URL}vorlage/logo-qps.png`} alt="QPS" />
        <h1>{titel}</h1>
        <span className="rechts">{einst.profil.vorname} {einst.profil.name}</span>
      </header>
      {seite}
      <nav className="unten">
        <div className="innen">
          <a href="#/" className={aktiv('')}><IconListe />Belege</a>
          <a href="#/beleg" className={`plus ${aktiv('beleg')}`}><span className="kreis"><IconKamera /></span>Erfassen</a>
          <a href="#/abrechnung" className={aktiv('abrechnung')}><IconSenden />Abrechnung</a>
          <a href="#/einstellungen" className={aktiv('einstellungen')}><IconZahnrad />Einstellungen</a>
        </div>
      </nav>
    </div>
  );
}
