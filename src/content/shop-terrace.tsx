import { useEffect, useMemo, useReducer, type ReactElement } from 'react';
import type { YMD } from '../core/library/city/calendar';
import { STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import { SHOP_DEFS } from '../core/library/city/shops/catalog';
import { openRangeAt } from '../core/library/city/shops/hours';
import type { ShopFrame } from '../core/library/city/shops/slots';
import { WEATHER_HOLD, holdWeather, terraceAt, terraceGuests, terraceWeatherAt, type TerraceState, type TerraceWeather } from '../core/library/city/shops/terrace';
import type { ShopView } from '../core/library/city/shops/view';
import { hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { FADE_MS } from '../core/library/weather/weather-clock';
import type { Weather } from '../core/library/weather/weather-types';
import { PersonSprite, tone } from './city-sprites';

// Terrasses (vague 1b-iv-b) : bar, café, restaurant, salon de thé et pizzeria sortent des tables rondes (deux chaises chacune)
// sur le trottoir, devant la façade, selon le moteur (terrace.ts) : montage juste après l'ouverture (les tables glissent depuis
// la porte, un employé les sort), démontage avant la fermeture, rien par mauvais temps ni de 22 h à 7 h, parasols en plein soleil.
// Rendu à la minute (re-rendu React) ; les tables glissent par une transition CSS d'une minute ; le serveur qui va servir est
// placé par la boucle d'animation (collectWaiters / placeWaiters). Aucun id SVG.

// Échelle du mobilier et des convives (un peu plus petits que les passants : le trottoir est étroit).
const TERRACE_SCALE = 0.9;
// Largeur de façade par table : les tables alternent sur deux rangs (contre la façade, puis vers la rue).
const TABLE_PITCH = 6.5;
const ROW_DEPTH = [0.35, 0.72] as const; // fraction de l'écart entre la ligne des portes et celle des passants
const SLIDE = 'transform 60s linear, opacity 0.4s ease';
// Le serveur se tient à côté de la table (unités du passant), du côté de la porte.
const WAITER_BESIDE = 9;

// ---------- Météo de la rue : relevés de la dernière minute et des WEATHER_HOLD précédentes ----------
export type TerraceSky = { now: TerraceWeather; before: TerraceWeather };

// Historique des relevés par minute d'horloge. Seuls les relevés réels de la minute courante sont gardés (`store`) ; les minutes
// manquantes de la fenêtre sont relues sur l'horloge de météo au passé À CHAQUE relevé, sans être gardées (dix lectures par
// minute) : un relevé pris avant que l'horloge ait sa vraie source (réglée par un effet du parent, après le montage de la ville)
// ne fige donc pas une fausse fenêtre pendant dix minutes. L'hystérésis tient dès l'ouverture de la scène.
export function weatherHistory(): { sample(read: (nowMs: number) => Weather, nowMs: number, store?: boolean): TerraceSky } {
  const seen = new Map<number, TerraceWeather>();
  return {
    sample(read, nowMs, store = true) {
      const minute = Math.floor(nowMs / 60_000);
      const now = terraceWeatherAt(read(nowMs));
      if (store) seen.set(minute, now);
      const window: TerraceWeather[] = [];
      for (let k = 1; k <= WEATHER_HOLD; k++) window.push(seen.get(minute - k) ?? terraceWeatherAt(read(nowMs - k * 60_000)));
      for (const key of seen.keys()) if (key < minute - WEATHER_HOLD) seen.delete(key);
      return { now, before: holdWeather(window) };
    },
  };
}

// Sans horloge de météo (scène sans météo) : seulement le drapeau « pluie » du décor, sans soleil.
// Au montage, l'horloge peut encore rendre sa météo par défaut (useWeather lui donne sa source dans un effet, qui passe après
// ceux de la ville) puis fondre 30 s vers la vraie : deux relevés forcés (juste après les effets, puis à la fin du fondu), et
// aucun relevé gardé avant la fin du fondu.
export function useTerraceWeather(clock: { read(nowMs: number): Weather } | undefined, rainy: boolean, minutes: number): TerraceSky {
  const history = useMemo(() => weatherHistory(), [clock]);
  const settledAt = useMemo(() => Date.now() + FADE_MS, [clock]);
  const [resample, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!clock) return;
    const timers = [window.setTimeout(bump, 0), window.setTimeout(bump, FADE_MS + 100)];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [clock]);
  // Effet de bord idempotent dans useMemo : l'historique ne fait qu'enregistrer le relevé de la minute (le même relevé refait
  // donne le même résultat) ; il est propre à cette horloge.
  return useMemo(() => {
    if (clock) {
      const now = Date.now();
      return history.sample((ms) => clock.read(ms), now, now >= settledAt);
    }
    const w: TerraceWeather = { rain: rainy, snow: false, storm: false, wind: false, sunny: false };
    return { now: w, before: w };
    // `minutes` : nouveau relevé à chaque minute de la scène ; `resample` : relevés forcés après le montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, clock, rainy, minutes, resample, settledAt]);
}

// ---------- Géométrie ----------
const span = (f: ShopFrame): [number, number] => [Math.min(f.window.x, f.door.x), Math.max(f.window.x + f.window.w, f.door.x + f.door.w)];

// 2 à `max` tables selon la largeur de la façade.
export const tablesFor = (max: number, f: ShopFrame): number => {
  const [a, b] = span(f);
  return Math.min(max, Math.max(2, Math.floor((b - a) / TABLE_PITCH)));
};

// Place de chaque table (pied, repère du monde) : réparties sur la façade, en quinconce sur deux rangs.
export function terraceTables(f: ShopFrame, m: CityMetrics, n: number): { x: number; y: number; row: 0 | 1 }[] {
  const [a, b] = span(f);
  return Array.from({ length: n }, (_, i) => {
    const row = (i % 2) as 0 | 1;
    return { x: a + ((i + 0.5) * (b - a)) / n, y: m.doorY + (m.walkY - m.doorY) * ROW_DEPTH[row], row };
  });
}

// Avancée de chaque table entre la porte (0) et sa place (1) : au montage elles sortent une à une, au démontage elles rentrent
// dans l'ordre inverse ; posées sinon (et toujours en mouvement réduit).
function slideOf(state: TerraceState, progress: number, n: number, i: number, still: boolean): number {
  const clamp = (x: number): number => Math.min(1, Math.max(0, x));
  if (still) return 1;
  if (state === 'setting-up') return clamp(progress * n - i);
  if (state === 'clearing') return 1 - clamp(progress * n - (n - 1 - i));
  return 1;
}

// ---------- Serveur ----------
const WAITER_CYCLE = 36; // un aller-retour toutes les 36 s : 4 s de marche, 6 s à la table, 4 s de retour, le reste à l'intérieur
const WAITER_WALK = 4;
const WAITER_SERVE = 6;
const WAITER_FADE = 0.4;

// Position du serveur à l'instant t (s) : sort de la porte, va à l'une des tables (`targets`, tirée à chaque tour), revient.
export function waiterAt(t: number, phase: number, doorX: number, targets: readonly number[]): { x: number; dir: 1 | -1; opacity: number } {
  const u = t + phase;
  const turn = Math.floor(u / WAITER_CYCLE);
  const c = u - turn * WAITER_CYCLE;
  if (targets.length === 0) return { x: doorX, dir: 1, opacity: 0 };
  const target = targets[(Math.imul(turn + 1, 2654435761) >>> 0) % targets.length]!;
  const out: 1 | -1 = target >= doorX ? 1 : -1;
  const back = (-out) as 1 | -1;
  const lerp = (p: number): number => doorX + (target - doorX) * p;
  if (c < WAITER_WALK) return { x: lerp(c / WAITER_WALK), dir: out, opacity: Math.min(1, c / WAITER_FADE) };
  if (c < WAITER_WALK + WAITER_SERVE) return { x: target, dir: out, opacity: 1 };
  const r = c - WAITER_WALK - WAITER_SERVE;
  if (r < WAITER_WALK) return { x: lerp(1 - r / WAITER_WALK), dir: back, opacity: Math.min(1, (WAITER_WALK - r) / WAITER_FADE) };
  return { x: doorX, dir: back, opacity: 0 };
}

export type Waiter = { node: Element; door: number; targets: number[]; phase: number; y: number; k: number };
export function collectWaiters(root: Element): Waiter[] {
  const out: Waiter[] = [];
  for (const node of root.querySelectorAll('[data-terrace-waiter]')) {
    out.push({
      node,
      door: Number(node.getAttribute('data-door-x')),
      targets: (node.getAttribute('data-targets') ?? '').split(' ').filter(Boolean).map(Number),
      phase: Number(node.getAttribute('data-phase')),
      y: Number(node.getAttribute('data-y')),
      k: Number(node.getAttribute('data-k')),
    });
  }
  return out;
}
const waiterTransform = (x: number, y: number, dir: number, k: number): string => `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(dir * k).toFixed(3)} ${k.toFixed(3)})`;
const setIfChanged = (node: Element, name: string, value: string): void => {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
};
export function placeWaiters(waiters: Waiter[], t: number): void {
  for (const w of waiters) {
    const s = waiterAt(t, w.phase, w.door, w.targets);
    setIfChanged(w.node, 'opacity', s.opacity.toFixed(2));
    if (s.opacity > 0) setIfChanged(w.node, 'transform', waiterTransform(s.x, w.y, s.dir, w.k));
  }
}

// ---------- Sprites (repère du passant : pieds à l'origine, il regarde vers +x) ----------
function TableSprite({ sky }: { sky: Sky }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g data-table-top="">
      <ellipse cx={0} cy={0} rx={3} ry={0.8} fill={t('#3A3A40')} />
      <rect x={-0.7} y={-12} width={1.4} height={12} fill={t('#3A3A40')} />
      <ellipse cx={0} cy={-12.4} rx={6} ry={1.6} fill={t('#D9D4C7')} />
    </g>
  );
}
// Chaise de bistrot, dossier du côté extérieur (`side` : -1 à gauche de la table, 1 à droite).
function ChairSprite({ side, sky }: { side: -1 | 1; sky: Sky }): ReactElement {
  const c = tone('#6B4A2E', sky);
  return (
    <g data-terrace-chair="" transform={`translate(${side * 9} 0) scale(${side} 1)`}>
      <rect x={-3} y={-8.6} width={6} height={1.4} fill={c} />
      <rect x={2.2} y={-17} width={1.2} height={17} fill={c} />
      <rect x={-3} y={-8} width={1} height={8} fill={c} />
    </g>
  );
}
function ParasolSprite({ sky, hue }: { sky: Sky; hue: string }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  return (
    <g data-parasol="">
      <rect x={-0.4} y={-40} width={0.8} height={28} fill={t('#5A5A5A')} />
      <path d="M-14 -37 Q0 -49 14 -37 Z" fill={t(hue)} />
      <path d="M-14 -37 Q-5 -45 0 -46.5 Q-3 -42 -5 -37 Z" fill={t('#F4F1E8')} opacity={0.85} />
      <path d="M14 -37 Q5 -45 0 -46.5 Q3 -42 5 -37 Z" fill={t('#F4F1E8')} opacity={0.85} />
    </g>
  );
}
// Tablier blanc par-dessus la tenue : le serveur se distingue des clients.
function Apron({ sky }: { sky: Sky }): ReactElement {
  return <rect data-apron="" x={-4.2} y={-21} width={8.4} height={13} rx={1} fill={tone('#F4F1E8', sky)} />;
}

type TerraceProps = {
  view: ShopView;
  frame: ShopFrame;
  metrics: CityMetrics;
  minutes: number;
  date: YMD;
  weather: TerraceSky;
  // Affluence (0..1) déjà réglée sur l'activité de la rue : chance qu'une chaise soit prise.
  crowd: number;
  reduced: boolean;
  sky: Sky;
  seed: number;
  // Tenue de l'employé qui sort le mobilier et sert : une figure en plus de l'équipe derrière la vitrine (l'invariant
  // « un local ouvert montre au moins une personne à l'intérieur » n'est pas touché).
  waiterOutfit: Outfit;
};

export function ShopTerrace({ view, frame, metrics, minutes, date, weather, crowd, reduced, sky, seed, waiterOutfit }: TerraceProps): ReactElement | null {
  const type = view.sign?.type ?? null;
  if (!type || SHOP_DEFS[type].terrace === 0) return null;
  const def = SHOP_DEFS[type];
  const id = view.slot.id;
  const range = openRangeAt(def, date, minutes);
  const isOpen = view.phase === 'open' && range !== null;
  const t = terraceAt(def, isOpen, minutes, weather.now, range?.[0] ?? 0, range?.[1] ?? 0, weather.before);
  if (t.state === 'none' || t.tables === 0) return null;
  const n = tablesFor(t.tables, frame);
  const places = terraceTables(frame, metrics, n);
  let guests = terraceGuests(n, seed, id, minutes, crowd, t.state);
  // Mouvement réduit : une personne assise par table au plus.
  if (reduced) guests = guests.filter((g, i) => guests.findIndex((x) => x.table === g.table) === i);
  const k = metrics.unit * STREET_SCALE.person * TERRACE_SCALE;
  const doorX = frame.door.x + frame.door.w / 2;
  const hue = def.sign;
  const move = reduced ? undefined : SLIDE;
  const slides = places.map((_, i) => slideOf(t.state, t.progress, n, i, reduced));
  const at = (i: number): number => doorX + (places[i]!.x - doorX) * slides[i]!;
  const parasols = t.state === 'umbrellas';
  // Montage / démontage : l'employé accompagne la table en mouvement, du côté de la porte.
  const moving = !reduced && (t.state === 'setting-up' || t.state === 'clearing');
  const carried = t.state === 'setting-up' ? Math.min(n - 1, Math.floor(t.progress * n)) : n - 1 - Math.min(n - 1, Math.floor(t.progress * n));
  const toward = (x: number): 1 | -1 => (x >= doorX ? 1 : -1);
  const waiterY = metrics.doorY + (metrics.walkY - metrics.doorY) * 0.5;
  const served = [...new Set(guests.map((g) => g.table))].map((i) => places[i]!.x - toward(places[i]!.x) * WAITER_BESIDE * k);
  const phase = (hashString(`${id}/waiter`) % 3600) / 100;
  const t0 = Date.now() / 1000;
  const w0 = waiterAt(t0, phase, doorX, served);
  // Rang du fond d'abord : les tables du rang côté rue passent devant.
  const order = places.map((p, i) => ({ p, i })).sort((a, b) => a.p.row - b.p.row || a.i - b.i);
  return (
    <g data-shop-terrace={id} data-terrace-state={t.state}>
      {order.map(({ p, i }) => {
        const shown = slides[i]! > 0;
        return (
          <g key={i} data-terrace-table={i} opacity={shown ? 1 : 0} style={{ transform: `translate(${at(i).toFixed(1)}px, ${p.y.toFixed(1)}px)`, transition: move }}>
            <g transform={`scale(${k.toFixed(3)})`}>
              <ChairSprite side={-1} sky={sky} />
              <ChairSprite side={1} sky={sky} />
              {guests
                .filter((g) => g.table === i)
                .map((g) => (
                  <g key={`${g.seat}-${g.leavesAt}`} data-terrace-guest="" data-table={i} transform={`translate(${g.seat === 0 ? -9 : 9} 0) scale(${g.seat === 0 ? 1 : -1} 1)`}>
                    <PersonSprite outfit={outfitFor('ordinary', mulberry32(seed ^ hashString(`${id}/terrace/${i}/${g.seat}/${g.leavesAt}`)))} sky={sky} rainy={false} umbrella={false} seated />
                  </g>
                ))}
              <TableSprite sky={sky} />
              {parasols && <ParasolSprite sky={sky} hue={hue} />}
            </g>
          </g>
        );
      })}
      {moving && (
        <g data-terrace-carrier="" style={{ transform: `translate(${(at(carried) - toward(places[carried]!.x) * WAITER_BESIDE * k).toFixed(1)}px, ${waiterY.toFixed(1)}px)`, transition: SLIDE }}>
          <g transform={`scale(${(toward(places[carried]!.x) * k).toFixed(3)} ${k.toFixed(3)})`}>
            <PersonSprite outfit={waiterOutfit} sky={sky} rainy={false} umbrella={false} />
            <Apron sky={sky} />
          </g>
        </g>
      )}
      {!reduced && served.length > 0 && (
        <g
          data-terrace-waiter=""
          data-door-x={doorX.toFixed(1)}
          data-targets={served.map((x) => x.toFixed(1)).join(' ')}
          data-phase={phase}
          data-y={waiterY.toFixed(1)}
          data-k={k.toFixed(4)}
          opacity={w0.opacity.toFixed(2)}
          transform={waiterTransform(w0.x, waiterY, w0.dir, k)}
        >
          <PersonSprite outfit={waiterOutfit} sky={sky} rainy={false} umbrella={false} />
          <Apron sky={sky} />
        </g>
      )}
    </g>
  );
}
