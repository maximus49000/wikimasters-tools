// Banc de perf de l'appli : la vraie scène Ville (ScenePanorama, Ghibli, population comprise), à la largeur `w`, heure `T` de
// la date `date`. Sert à comparer une branche à main (même fichier, même largeur), CPU ralenti au banc (perf2b.mjs).
import { createRoot } from 'react-dom/client';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { skyAt } from '../../src/core/library/sky';
import { dayContext } from '../../src/core/library/city/calendar';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 1440);
const H = 340;
const T = Number(q.get('T') ?? 15);
const [y, m, d] = (q.get('date') ?? '2026-07-07').split('-').map(Number) as [number, number, number];
const SUNS = [[8.7, 17.3], [8.1, 18.2], [7.2, 19.0], [7.1, 20.7], [6.3, 21.4], [5.8, 21.9], [6.1, 21.8], [6.8, 21.1], [7.5, 20.1], [8.2, 19.0], [8.0, 17.3], [8.6, 16.9]];
const [sr, ss] = SUNS[m - 1]!;
const minutes = Math.floor(T * 60);
const sky = skyAt(minutes, { kind: 'normal', sunrise: sr * 60, sunset: ss * 60 });
const day = dayContext({ y, m, d }, []);
const city = { minutes, day, precip: 0, snow: false, storm: false, daylight: sky.daylight };
const host = document.createElement('div');
document.body.appendChild(host);
createRoot(host).render(
  <svg id="out" width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
    <ScenePanorama scene="city" width={W} height={H} sky={sky} minutes={minutes} seed={7} city={q.get('pop') === '0' ? undefined : city} />
  </svg>,
);
// Prêt quand les tranches peintes sont affichées.
const ready = (): void => {
  if (document.querySelector('[data-painted-city][data-ready="true"]')) (window as unknown as { done: boolean }).done = true;
  else setTimeout(ready, 200);
};
ready();
