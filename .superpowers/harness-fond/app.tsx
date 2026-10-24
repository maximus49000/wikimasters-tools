// Banc de perf de l'appli : la vraie scène Ville (ScenePanorama, Ghibli, population comprise), à la largeur `w`, heure `T` de
// la date `date`. Sert à comparer une branche à main (même fichier, même largeur), CPU ralenti au banc (perf2b.mjs).
// Mouvement réduit (still=1) : on force la requête média avant tout rendu (le décor la lit au rendu).
if (new URLSearchParams(location.search).get('still') === '1') {
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (query: string): MediaQueryList => (query.includes('prefers-reduced-motion') ? ({ ...mm(query), matches: true } as MediaQueryList) : mm(query));
}
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
// Météo du banc (optionnelle) : meteo=soleil|pluie|orage|neige|vent, wind=0..1 (force le vent), seed=N, still=1 (mouvement réduit).
const meteo = q.get('meteo') ?? '';
const SEED = Number(q.get('seed') ?? 7);
const base = { cloud: 0.1, precip: 0, kind: 'rain' as const, fog: 0, wind: 0.2, lightning: 0, wet: 0, snowCover: 0 };
const PRESETS: Record<string, typeof base> = {
  soleil: base,
  pluie: { ...base, cloud: 0.92, precip: 0.65, wind: 0.5, wet: 0.8 },
  orage: { ...base, cloud: 1, precip: 1, wind: 0.9, lightning: 1, wet: 1 },
  neige: { ...base, cloud: 0.85, precip: 0.5, kind: 'snow' as never, wind: 0.2, snowCover: 0.8 },
  vent: { ...base, cloud: 0.4, wind: 0.9 },
};
const preset = PRESETS[meteo];
const windQ = q.get('wind');
const wx = preset || windQ !== null ? { ...(preset ?? base), ...(windQ !== null ? { wind: Math.max(0, Math.min(1, Number(windQ))) } : {}) } : null;
// Identité stable : le décor mémoïse sur l'objet `weather`.
const weather = wx ? { read: () => wx } : undefined;
const city = { minutes, day, precip: wx && wx.kind === 'rain' ? wx.precip : 0, snow: wx?.kind === 'snow' || (wx?.snowCover ?? 0) >= 0.35, storm: meteo === 'orage', daylight: sky.daylight };
const host = document.createElement('div');
document.body.appendChild(host);
createRoot(host).render(
  <svg id="out" width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
    <ScenePanorama scene="city" width={W} height={H} sky={sky} minutes={minutes} seed={SEED} weather={weather} rainy={(wx?.precip ?? 0) > 0 && wx?.kind === 'rain'} gloom={(wx?.cloud ?? 0) > 0.7} city={q.get('pop') === '0' ? undefined : city} />
  </svg>,
);
// Prêt quand les tranches peintes sont affichées.
const ready = (): void => {
  if (document.querySelector('[data-painted-city][data-ready="true"]')) (window as unknown as { done: boolean }).done = true;
  else setTimeout(ready, 200);
};
ready();
