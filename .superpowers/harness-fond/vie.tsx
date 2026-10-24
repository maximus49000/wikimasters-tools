// Banc de la vie du fond (PR 2b) : tranches peintes (vrai peintre) étalonnées comme dans l'appli, calque FondLife (vrai
// composant React) à l'heure fixe `T`, fenêtres du fond (GhibliWindows). Paramètres de main.ts, plus still=1 (mouvement réduit),
// anim=1 (heure qui avance avec l'horloge murale : mesures de perf), novie=1 (sans le calque : référence « main »).
import { createRoot } from 'react-dom/client';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
import { paintCityTile, tileCount } from '../../src/core/library/paint/city-painter';
import { paintSnowTile } from '../../src/core/library/paint/snow-painter';
import type { PaintCtx } from '../../src/core/library/paint/paint-ctx';
import type { FondMoment } from '../../src/core/library/paint/fond-time';
import { gradeFor, gradeValues } from '../../src/core/library/paint/grade';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { dayContext } from '../../src/core/library/city/calendar';
import { cityFacades } from '../../src/core/library/city/facades';
import { FondLife } from '../../src/content/fond-life';
import { sunsAt } from '../../src/core/library/paint/fond-vie';
import { GhibliWindows } from '../../src/content/ghibli-windows';

export function mountVie(o: { W: number; H: number; SEED: number; SCALE: number; T: number; moment: FondMoment; view: [number, number, number, number]; q: URLSearchParams; fog: number }): void {
  const { W, H, SEED, SCALE, T, moment, q } = o;
  const [vx, vy, vw, vh] = o.view;
  const plan = cityPaintPlan(W, H, SEED);
  const c = document.createElement('canvas');
  c.width = W * SCALE;
  c.height = H * SCALE;
  const ctx = c.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  for (let t = 0; t < tileCount(W); t++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(t * 360, 0, 360, H);
    ctx.clip();
    paintCityTile(ctx as unknown as PaintCtx, plan, t, moment);
    if (moment.meteo.snow) paintSnowTile(ctx as unknown as PaintCtx, plan, t);
    ctx.restore();
  }
  const url = c.toDataURL();
  const ymd = { y: moment.y, m: moment.month, d: moment.day };
  // Paris, heure d'été ou d'hiver (approximation : avril à octobre).
  const tz = moment.month >= 4 && moment.month <= 10 ? 120 : 60;
  // Lever et coucher de la maquette (table de Paris) : mêmes lumières que ses captures.
  const [sr, ss] = sunsAt(moment.month, moment.day);
  const sky = skyAt(T * 60, { kind: 'normal', sunrise: sr * 60, sunset: ss * 60 });
  void tz;
  void sunTimes;
  const gloom = moment.meteo.cloud > 0.75;
  const dim = Math.max(1 - sky.daylight, gloom ? 0.7 : 0);
  const day = dayContext(ymd, []);
  const anim = q.has('anim');
  const novie = q.has('novie');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const buildings = cityFacades(W, H, SEED);
  const App = () => (
    <svg id="out" width={vw * SCALE} height={vh * SCALE} viewBox={`${vx} ${vy} ${vw} ${vh}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.top} />
          <stop offset="1" stopColor={sky.bottom} />
        </linearGradient>
        <filter id="grade" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={gradeValues(gradeFor(sky.daylight, sky.twilight, gloom))} />
        </filter>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="url(#ciel)" />
      <g filter="url(#grade)">
        <image href={url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
      </g>
      {!novie && <FondLife plan={plan} moment={moment} minutes={Math.floor(T * 60)} daylight={sky.daylight} twilight={sky.twilight} gloom={gloom} dim={dim} day={day} fog={o.fog} at={anim ? undefined : T} still={q.has('still')} />}
      <GhibliWindows buildings={buildings} minutes={Math.floor(T * 60)} day={day} daylight={sky.daylight} gloom={gloom} dim={dim} farLight={0.5} plan={plan} moment={moment} />
    </svg>
  );
  createRoot(host).render(<App />);
  requestAnimationFrame(() => requestAnimationFrame(() => ((window as unknown as { done: boolean }).done = true)));
}
