import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { betragText, datumCH } from '../lib/format.js';
import { pruefeBeleg, tabellenZeile } from '../lib/berechnung.js';

/** Object-URL für einen Blob – wird beim Unmount freigegeben */
export function useBlobUrl(blob) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function Summen({ s }) {
  return (
    <div className="summen">
      <div className="summe"><div className="wert">{s.anzahl}</div><div className="lab">Belege</div></div>
      <div className="summe"><div className="wert">{betragText(s.chf)}</div><div className="lab">CHF</div></div>
      <div className="summe"><div className="wert">{betragText(s.eur)}</div><div className="lab">EUR</div></div>
    </div>
  );
}

export function BelegKarte({ beleg, onClick, duplikat }) {
  const datei = useLiveQuery(() => (beleg.dateien?.[0] ? db.dateien.get(beleg.dateien[0]) : null), [beleg.dateien?.[0]]);
  const url = useBlobUrl(datei && datei.typ !== 'application/pdf' ? datei.blob : null);
  const z = tabellenZeile(beleg);
  const p = pruefeBeleg(beleg);
  return (
    <button className="beleg" onClick={onClick}>
      <span className="bild" style={url ? { backgroundImage: `url(${url})` } : undefined}>
        {datei?.typ === 'application/pdf' ? 'PDF' : !url ? '–' : ''}
      </span>
      <span>
        <div className="titel">{beleg.nr && <span className="nr">{beleg.nr}</span>}{z.auslagen || 'Ohne Händler'}</div>
        <div className="sub">{datumCH(beleg.datum)} · {z.details || '–'}</div>
        <div>
          {!p.ok && <span className="badge fehler">{p.fehler[0]}</span>}
          {p.ok && p.hinweise.length > 0 && <span className="badge warn">{p.hinweise[0]}</span>}
          {duplikat && <span className="badge warn">Doppelt?</span>}
        </div>
      </span>
      <span className="betrag">{beleg.waehrung} {betragText(beleg.betrag)}</span>
    </button>
  );
}

export function Meldung({ art = 'info', titel, liste, children }) {
  if (liste && !liste.length && !children) return null;
  return (
    <div className={`meldung ${art}`}>
      {titel && <strong>{titel}</strong>}
      {children}
      {liste?.length > 0 && <ul>{liste.map((t) => <li key={t}>{t}</li>)}</ul>}
    </div>
  );
}

/** Unterschrift mit Finger/Stift zeichnen -> PNG (transparenter Hintergrund) */
export function UnterschriftPad({ wert, onSpeichern }) {
  const ref = useRef(null);
  const [leer, setLeer] = useState(true);
  const zeichnet = useRef(false);

  useEffect(() => {
    const c = ref.current;
    const r = c.getBoundingClientRect();
    c.width = r.width * 2;
    c.height = r.height * 2;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b1b3a';
  }, []);

  const punkt = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const start = (e) => {
    zeichnet.current = true;
    ref.current.setPointerCapture(e.pointerId);
    const ctx = ref.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(...punkt(e));
  };
  const bewege = (e) => {
    if (!zeichnet.current) return;
    const ctx = ref.current.getContext('2d');
    ctx.lineTo(...punkt(e));
    ctx.stroke();
    setLeer(false);
  };
  const ende = () => { zeichnet.current = false; };
  const loeschen = () => {
    const c = ref.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setLeer(true);
  };

  return (
    <div className="formular">
      {wert && <img src={wert} alt="Gespeicherte Unterschrift" style={{ maxHeight: 70, maxWidth: '100%' }} />}
      <canvas ref={ref} className="pad" onPointerDown={start} onPointerMove={bewege} onPointerUp={ende} onPointerLeave={ende} />
      <div className="zeile">
        <button type="button" onClick={loeschen}>Leeren</button>
        <button type="button" className="primaer" disabled={leer} onClick={() => { onSpeichern(zuschneiden(ref.current)); loeschen(); }}>
          Unterschrift speichern
        </button>
      </div>
    </div>
  );
}

// Leeren Rand um die Unterschrift entfernen
function zuschneiden(canvas) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  const pad = 8;
  const out = document.createElement('canvas');
  out.width = Math.max(1, x1 - x0 + 2 * pad);
  out.height = Math.max(1, y1 - y0 + 2 * pad);
  out.getContext('2d').drawImage(canvas, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
