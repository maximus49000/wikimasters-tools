import { memo, useId, useLayoutEffect, useMemo, useRef, type ReactElement, type RefObject } from 'react';
import type { SceneId } from '../core/library/library-types';
import { mulberry32 } from '../core/library/scene-world';
import { mixHex, type Sky } from '../core/library/sky';
import { lightningAt, rainbowOf } from '../core/library/weather/weather-clock';
import { CLOUD_BLOBS, godRayTarget, rayWindow, sunCoverage, type CloudSpot } from '../core/library/weather/weather-rays';
import { smooth, type Weather } from '../core/library/weather/weather-types';
import { celestialPlace } from './scene-panorama';

// Scènes qui ont une météo : l'espace et la Terre vue de l'orbite n'en ont pas.
export const WEATHER_SCENES: readonly SceneId[] = ['city', 'countryside', 'mountain', 'sea'];

type Props = {
  scene: SceneId;
  width: number;
  height: number;
  seed: number;
  sky: Sky;
  clock: { read(nowMs: number): Weather };
  // Identifiants des deux groupes, pour les copier dans chaque fenêtre (`<use>`) : le ciel (au-dessus des acteurs) et le sol (en dessous).
  id?: string;
  groundId?: string;
  // Appelé quand la pluie devient (ou cesse d'être) assez forte pour des gouttes sur la vitre (avec hystérésis) : rare, sans boucle React.
  onWet?: (wet: boolean) => void;
};

const FRAME_MS = 30;
const TILE = 80;
const COVER_MS = 250;
// Durée (s) du fondu d'un nuage qui apparaît ou disparaît quand la couverture change.
const CLOUD_FADE_S = 1.5;
// Gouttes sur la vitre : apparaissent au-delà de 0,12 de pluie, disparaissent sous 0,08.
const WET_ON = 0.12;
const WET_OFF = 0.08;
// Hauteur du sol (fraction de la hauteur du monde) où se posent flaques et neige : celle du décor de chaque scène.
// En mer, pas de sol sous la fenêtre : ni flaques ni neige sur l'eau.
const GROUND: Partial<Record<SceneId, number>> = { city: 0.78, countryside: 0.78, mountain: 0.82 };
// Pied de l'arc-en-ciel (sol ou horizon).
const ARC_FOOT: Partial<Record<SceneId, number>> = { city: 0.78, countryside: 0.78, mountain: 0.82, sea: 0.5 };
// Bas de la bande où flottent les nuages : au-dessus des toits, des collines ou de l'horizon (jamais devant les immeubles).
const CLOUD_FLOOR: Partial<Record<SceneId, number>> = { city: 0.42, countryside: 0.5, mountain: 0.55, sea: 0.42 };
const RAINBOW = ['#FF6B6B', '#FFD166', '#7BD389', '#6FA8FF'];
const RAY_COUNT = 7;
const RAY_SPREAD = 40; // degrés de part et d'autre de la verticale
const RAY_HALF = 1.6; // demi-largeur d'un filet, en degrés

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number): number => smooth(clamp01((v - a) / (b - a)));
const positiveMod = (a: number, n: number): number => ((a % n) + n) % n;
// Réserve de nuages tirée de la graine : `cloud × réserve` sont visibles (jamais plus de 140).
const cloudPoolSize = (width: number): number => Math.min(140, Math.round((34 * width) / 680));
const windSpeed = (wind: number): number => 4 + 14 * Math.max(0, wind); // px/s : les nuages ne s'arrêtent jamais
const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Motifs de stries (pluie) et de points (neige) : la boucle ne fait que les translater et les incliner — aucun nœud par goutte.
function PatternDefs({ id, seed }: { id: string; seed: number }): ReactElement {
  const { marks, flakes } = useMemo(() => {
    const rng = mulberry32(seed ^ 0x77ea);
    return {
      marks: Array.from({ length: 14 }, () => ({ x: rng() * TILE, y: rng() * TILE, l: 8 + rng() * 10 })),
      flakes: Array.from({ length: 12 }, () => ({ x: rng() * TILE, y: rng() * TILE, r: 0.8 + rng() * 1.4 })),
    };
  }, [seed]);
  return (
    <defs>
      <pattern id={`${id}-rain-far`} data-wx-pattern="rain-far" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {marks.slice(0, 9).map((m, i) => <line key={i} x1={m.x} y1={m.y} x2={m.x} y2={m.y + m.l * 0.7} stroke="#DCE6F2" strokeWidth={0.8} />)}
      </pattern>
      <pattern id={`${id}-rain-near`} data-wx-pattern="rain-near" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {marks.map((m, i) => <line key={i} x1={m.x} y1={m.y} x2={m.x} y2={m.y + m.l * 1.4} stroke="#EEF4FB" strokeWidth={1.4} />)}
      </pattern>
      <pattern id={`${id}-snow-far`} data-wx-pattern="snow-far" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {flakes.slice(0, 8).map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={f.r * 0.7} fill="#FFFFFF" />)}
      </pattern>
      <pattern id={`${id}-snow-near`} data-wx-pattern="snow-near" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {flakes.map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={f.r * 1.5} fill="#FFFFFF" />)}
      </pattern>
    </defs>
  );
}

type LoopInput = { clock: Props['clock']; seed: number; width: number; height: number; pool: CloudSpot[]; sky: RefObject<Sky>; onWet: RefObject<Props['onWet']> };

// Met la météo à l'écran sans re-rendu React : même horloge murale pour toutes les fenêtres, même règle d'économie que les acteurs
// (~30 images/s, en pause quand la page est cachée, figée si l'utilisateur demande moins de mouvement).
// Rend la fonction de placement, pour qu'un changement de ciel (chaque minute) la rejoue quand le mouvement est figé.
function useWeatherLoop(sky: RefObject<SVGGElement | null>, ground: RefObject<SVGGElement | null>, input: LoopInput): RefObject<(() => void) | null> {
  const placeRef = useRef<(() => void) | null>(null);
  const { clock, seed, width, height, pool } = input;
  const skyRef = input.sky;
  const onWetRef = input.onWet;
  useLayoutEffect(() => {
    const el = sky.current;
    const floor = ground.current;
    if (!el) return;
    const q = (name: string): SVGElement | null => el.querySelector<SVGElement>(`[data-wx="${name}"]`) ?? floor?.querySelector<SVGElement>(`[data-wx="${name}"]`) ?? null;
    const pat = (name: string): SVGElement | null => el.querySelector<SVGElement>(`[data-wx-pattern="${name}"]`);
    const nodes = {
      tint: q('tint'), overcast: q('overcast'), clouds: q('clouds'), drift: q('clouds-drift'), fog: q('fog'), rainFar: q('rain-far'), rainNear: q('rain-near'), snowFar: q('snow-far'), snowNear: q('snow-near'),
      puddles: q('puddles'), snowCover: q('snow-cover'), flash: q('flash'), bolt: q('bolt'), rainbow: q('rainbow'), godrays: q('godrays'), rays: el.querySelector<SVGElement>('[data-wx-rays]'),
    };
    const patterns = { rainFar: pat('rain-far'), rainNear: pat('rain-near'), snowFar: pat('snow-far'), snowNear: pat('snow-near') };
    const tintStops = Array.from(el.querySelectorAll<SVGElement>('[data-wx-stop="tint"]'));
    const overcastStops = Array.from(el.querySelectorAll<SVGElement>('[data-wx-stop="overcast"]'));
    const cloudNodes = Array.from(el.querySelectorAll<SVGElement>('[data-wx-cloud]'));
    // N'écrit un attribut que s'il change : les copies `<use>` ne sont pas invalidées pour rien.
    const put = (node: SVGElement | null, name: string, value: string): void => {
      if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
    };
    const set = (node: SVGElement | null, value: number): void => put(node, 'opacity', value.toFixed(3));
    const still = reducedMotion();
    const svg = el.ownerSVGElement;

    // Opacité courante de chaque nuage (−1 : pas encore posé) ; un nuage apparaît ou s'efface en fondu, jamais d'un coup.
    const cloudOpacity = cloudNodes.map(() => -1);
    let colorKey = '';
    let lastPrecip = '';
    let lastHidden = '';
    let lastOvercast = '';
    // null : pas encore signalé — le premier placement signale toujours l'état (une relance de la boucle ne laisse pas d'état périmé).
    let wet: boolean | null = null;
    let lastMs = Date.now();
    // Positions intégrées (vitesse × durée) : un changement de vent change la VITESSE, jamais la position d'un coup.
    const w0 = clock.read(lastMs);
    let drift = positiveMod((lastMs / 1000) * windSpeed(w0.wind), width);
    let snowFarX = 0;
    let snowNearX = 0;
    let rayStrength = -1;
    let hidden = 0;
    let coveredAt = -Infinity;

    const place = (): void => {
      const now = Date.now();
      const t = now / 1000;
      const dt = still ? 0 : Math.min(0.25, Math.max(0, (now - lastMs) / 1000));
      lastMs = now;
      const w = clock.read(now);
      const { daylight, sunFrac } = skyRef.current;
      const rain = w.kind === 'rain' ? w.precip : 0;
      const snow = w.kind === 'snow' ? w.precip : 0;
      const lean = -12 - w.wind * 22; // inclinaison des gouttes (degrés)

      // Ciel : de vrais nuages (leur NOMBRE = la couverture) ; leur teinte et l'obscurité du ciel suivent l'intensité de la pluie.
      const rainDark = clamp01(w.precip * (w.kind === 'rain' ? 1.15 : 0.7));
      const dark = clamp01(rainDark + 0.35 * smoothstep(0.85, 1, w.cloud));
      // Ciel couvert sans pluie : des nuages nettement plus sombres que le voile gris du fond (le voile ne couvre que le ciel).
      const cloudDark = Math.max(dark, 0.75 * smoothstep(0.7, 1, w.cloud));
      // Le voile par-dessus le décor ne dépend que de la pluie : les immeubles restent bien visibles quand il ne pleut pas.
      const thick = w.cloud * (0.3 + 0.7 * rainDark);
      // Couleurs recalculées seulement quand l'obscurité ou le jour bougent d'un cran (1/64) : pas de chaînes neuves à chaque image.
      const key = `${Math.round(dark * 64)}|${Math.round(cloudDark * 64)}|${Math.round(daylight * 64)}`;
      if (key !== colorKey) {
        colorKey = key;
        const tintColor = mixHex('#1A1E2B', mixHex('#9AA4B2', '#4E5663', dark), daylight);
        for (const stop of tintStops) put(stop, 'stop-color', tintColor);
        put(nodes.clouds, 'fill', mixHex(mixHex('#262C46', '#FFFFFF', daylight), mixHex('#2F3542', '#6A7280', daylight), cloudDark));
        const overcastColor = mixHex('#1A1E2B', mixHex('#B9C0CA', '#454C58', dark), daylight);
        for (const stop of overcastStops) put(stop, 'stop-color', overcastColor);
        svg?.style.setProperty('--wmt-overcast-color', overcastColor);
      }
      set(nodes.tint, 0.92 * thick);
      // Ciel entièrement couvert : le voile gris doit cacher le bleu (même sans pluie), pas seulement le tamiser.
      const overcast = w.cloud > 0.8 ? clamp01((w.cloud - 0.8) / 0.15) * (0.95 + 0.05 * dark) : 0;
      // Le gris du ciel couvert est dessiné DANS le décor, sous les immeubles (voir SkyAndStars) ; ici il ne reste qu'un léger voile.
      set(nodes.overcast, overcast * 0.15);
      const overcastText = overcast.toFixed(2);
      if (overcastText !== lastOvercast) {
        lastOvercast = overcastText;
        svg?.style.setProperty('--wmt-overcast', overcastText);
      }
      // Nombre de nuages = couverture × réserve ; le nuage « à la frontière » est partiellement visible, et chacun suit sa cible en fondu.
      const wanted = w.cloud * cloudNodes.length;
      const maxStep = dt / CLOUD_FADE_S;
      cloudNodes.forEach((node, i) => {
        const goal = clamp01(wanted - i);
        const prev = cloudOpacity[i]!;
        const next = prev < 0 || still ? goal : prev + Math.max(-maxStep, Math.min(maxStep, goal - prev));
        cloudOpacity[i] = next;
        const shownOpacity = Math.round(next * 50) / 50;
        put(node, 'opacity', shownOpacity.toFixed(2));
        if (shownOpacity <= 0) put(node, 'display', 'none');
        else if (node.hasAttribute('display')) node.removeAttribute('display');
      });
      drift = positiveMod(drift + dt * windSpeed(w.wind), width);
      put(nodes.drift, 'transform', `translate(${drift.toFixed(1)} 0)`);

      set(nodes.fog, w.fog * 0.8);
      set(nodes.rainFar, rain * 0.7);
      set(nodes.rainNear, rain);
      set(nodes.snowFar, snow * 0.8);
      set(nodes.snowNear, snow);
      set(nodes.puddles, w.wet);
      set(nodes.snowCover, w.snowCover);
      set(nodes.rainbow, rainbowOf(w, daylight));
      // Motifs : seulement s'ils se voient (et figés si moins de mouvement).
      const tm = still ? 0 : t;
      if (rain > 0) {
        put(patterns.rainFar, 'patternTransform', `rotate(${(lean * 0.6).toFixed(1)}) translate(0 ${((tm * 220) % TILE).toFixed(1)})`);
        put(patterns.rainNear, 'patternTransform', `rotate(${lean.toFixed(1)}) translate(0 ${((tm * 420) % TILE).toFixed(1)})`);
      }
      snowFarX += dt * 8 * (w.wind + 0.2);
      snowNearX += dt * 14 * (w.wind + 0.2);
      if (snow > 0) {
        put(patterns.snowFar, 'patternTransform', `translate(${((Math.sin(tm * 0.6) * 12 + snowFarX) % TILE).toFixed(1)} ${((tm * 18) % TILE).toFixed(1)})`);
        put(patterns.snowNear, 'patternTransform', `translate(${((Math.sin(tm * 0.8) * 18 + snowNearX) % TILE).toFixed(1)} ${((tm * 34) % TILE).toFixed(1)})`);
      }

      // Éclairs : jamais quand le mouvement est réduit (un flash figé plusieurs secondes serait pire).
      const flash = still ? null : lightningAt(w, now, seed);
      set(nodes.flash, flash ? flash.strength * 0.55 : 0);
      if (nodes.bolt) {
        if (flash) {
          const x = flash.x * width;
          put(nodes.bolt, 'd', `M${x.toFixed(0)} 0 L${(x - 10).toFixed(0)} ${(height * 0.22).toFixed(0)} L${(x + 4).toFixed(0)} ${(height * 0.22).toFixed(0)} L${(x - 14).toFixed(0)} ${(height * 0.5).toFixed(0)}`);
          set(nodes.bolt, flash.strength);
        } else set(nodes.bolt, 0);
      }

      // Filets de lumière : part du soleil masquée (nuages visibles + voile continu), relue au plus toutes les 250 ms.
      if (sunFrac === null) hidden = 1;
      else if (now - coveredAt >= COVER_MS || still) {
        coveredAt = now;
        const sun = celestialPlace(sunFrac, width, height);
        const cov = sunCoverage(sun.x, sun.y, pool.filter((_, i) => (cloudOpacity[i] ?? 0) >= 0.5), drift, width);
        hidden = 1 - (1 - cov) * (1 - clamp01(overcast));
      }
      // Part du soleil masquée, lue par le calque de lumière sur le <svg> de la pièce.
      const hiddenText = hidden.toFixed(2);
      if (hiddenText !== lastHidden) {
        lastHidden = hiddenText;
        svg?.style.setProperty('--wmt-sun-hidden', hiddenText);
      }
      const target = godRayTarget(hidden, w, daylight, sunFrac !== null, rayWindow(now, seed));
      // Fondu doux : les filets apparaissent et s'effacent, ils ne s'allument jamais d'un coup.
      rayStrength = rayStrength < 0 || still ? target : rayStrength + (target - rayStrength) * 0.08;
      if (rayStrength < 0.01) {
        set(nodes.godrays, 0);
        put(nodes.godrays, 'display', 'none');
      } else {
        nodes.godrays?.removeAttribute('display');
        set(nodes.godrays, rayStrength);
        if (nodes.rays && sunFrac !== null && !still) {
          const sun = celestialPlace(sunFrac, width, height);
          put(nodes.rays, 'transform', `rotate(${(Math.sin(t * 0.15) * 4).toFixed(2)} ${sun.x.toFixed(1)} ${sun.y.toFixed(1)})`);
        }
      }

      // Les gouttes sur la vitre (dans WindowArt) lisent cette variable sur le <svg> de la pièce.
      const precipText = rain.toFixed(2);
      if (precipText !== lastPrecip) {
        lastPrecip = precipText;
        svg?.style.setProperty('--wmt-precip', precipText);
      }
      const nextWet = wet ? rain > WET_OFF : rain > WET_ON;
      if (nextWet !== wet) {
        wet = nextWet;
        onWetRef.current?.(wet);
      }
    };
    placeRef.current = place;
    place();
    if (still) {
      return () => {
        placeRef.current = null;
        svg?.style.removeProperty('--wmt-precip');
        svg?.style.removeProperty('--wmt-sun-hidden');
      };
    }
    let frame = 0;
    let last = 0;
    const tick = (now: number): void => {
      frame = window.requestAnimationFrame(tick);
      if (document.visibilityState === 'hidden' || now - last < FRAME_MS) return;
      last = now;
      place();
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      placeRef.current = null;
      svg?.style.removeProperty('--wmt-precip');
      svg?.style.removeProperty('--wmt-sun-hidden');
    };
  }, [sky, ground, clock, seed, width, height, pool, skyRef]);
  return placeRef;
}

function WeatherLayerView({ scene, width, height, seed, sky, clock, id, groundId, onWet }: Props): ReactElement {
  // Préfixe des motifs/dégradés, propre à chaque pièce (deux pièces affichées ne partagent pas leurs motifs).
  const uid = `wx${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const floorFrac = CLOUD_FLOOR[scene] ?? 0.45;
  const pool = useMemo<CloudSpot[]>(() => {
    const rng = mulberry32(seed ^ 0xc10d5);
    return Array.from({ length: cloudPoolSize(width) }, () => ({ x: rng() * width, y: height * (0.05 + rng() * (floorFrac - 0.05)), s: 0.8 + rng() * 1.1 }));
  }, [seed, width, height, floorFrac]);
  const skyRoot = useRef<SVGGElement | null>(null);
  const groundRoot = useRef<SVGGElement | null>(null);
  const skyRef = useRef<Sky>(sky);
  skyRef.current = sky;
  const onWetRef = useRef(onWet);
  onWetRef.current = onWet;
  const placeRef = useWeatherLoop(skyRoot, groundRoot, { clock, seed, width, height, pool, sky: skyRef, onWet: onWetRef });
  // Mouvement réduit : pas de boucle, mais le ciel (chaque minute) relance un placement pour suivre la météo.
  useLayoutEffect(() => {
    if (reducedMotion()) placeRef.current?.();
  }, [sky, placeRef]);

  const groundFrac = GROUND[scene];
  const ground = groundFrac === undefined ? height : height * groundFrac;
  const puddles = useMemo(() => {
    if (groundFrac === undefined) return [];
    const rng = mulberry32(seed ^ 0x9d1e);
    const top = height * groundFrac;
    return Array.from({ length: Math.max(1, Math.round(width / 70)) }, () => ({ x: rng() * width, y: top + 4 + rng() * (height - top - 8), rx: 12 + rng() * 22 }));
  }, [seed, width, height, groundFrac]);
  const arcFoot = height * (ARC_FOOT[scene] ?? 0.78);
  const arc = width * 0.28;
  // Filets : éventail vers le bas depuis le soleil (posé au milieu la nuit, éteint de toute façon).
  const sun = sky.sunFrac === null ? { x: width / 2, y: 0 } : celestialPlace(sky.sunFrac, width, height);
  const rayLength = 0.9 * height;
  const rays = Array.from({ length: RAY_COUNT }, (_, i) => {
    const a = -RAY_SPREAD + (i * 2 * RAY_SPREAD) / (RAY_COUNT - 1);
    const end = (deg: number): string => {
      const r = (deg * Math.PI) / 180;
      return `${(sun.x + Math.sin(r) * rayLength).toFixed(1)},${(sun.y + Math.cos(r) * rayLength).toFixed(1)}`;
    };
    return { points: `${sun.x.toFixed(1)},${sun.y.toFixed(1)} ${end(a - RAY_HALF)} ${end(a + RAY_HALF)}`, opacity: 0.25 + 0.25 * (((i * 3) % RAY_COUNT) / (RAY_COUNT - 1)) };
  });

  return (
    <>
      {/* Sol : flaques et neige, sous les passants et les voitures. */}
      <g data-weather-ground="" data-scene={scene} id={groundId} ref={groundRoot}>
        <g data-wx="puddles" opacity={0}>
          {puddles.map((p, i) => <ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.rx * 0.18} fill="#9FB4C8" opacity={0.6} />)}
        </g>
        <rect data-wx="snow-cover" x={0} y={ground} width={width} height={height - ground} fill="#F4F8FC" opacity={0} />
      </g>
      {/* Ciel et précipitations, par-dessus le décor et les acteurs. */}
      <g data-weather="" data-scene={scene} id={id} ref={skyRoot}>
        <PatternDefs id={uid} seed={seed} />
        <defs>
          <linearGradient id={`${uid}-tint`} x1="0" y1="0" x2="0" y2="1">
            <stop data-wx-stop="tint" offset="0" stopColor="#9AA4B2" stopOpacity={1} />
            <stop data-wx-stop="tint" offset="1" stopColor="#9AA4B2" stopOpacity={0.45} />
          </linearGradient>
          <linearGradient id={`${uid}-overcast`} x1="0" y1="0" x2="0" y2="1">
            <stop data-wx-stop="overcast" offset="0" stopColor="#B9C0CA" stopOpacity={1} />
            <stop data-wx-stop="overcast" offset="0.6" stopColor="#B9C0CA" stopOpacity={1} />
            <stop data-wx-stop="overcast" offset="1" stopColor="#B9C0CA" stopOpacity={0.5} />
          </linearGradient>
          <linearGradient id={`${uid}-fog`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E7ECF1" stopOpacity={0.35} />
            <stop offset="1" stopColor="#E7ECF1" stopOpacity={0.95} />
          </linearGradient>
          <g id={`${uid}-strip`} data-wx="clouds" fill="#FFFFFF">
            {pool.map((c, i) => (
              <g key={i} data-wx-cloud="" display="none" opacity={0} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) scale(${c.s.toFixed(2)})`}>
                {CLOUD_BLOBS.map((b, j) => <ellipse key={j} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} />)}
              </g>
            ))}
          </g>
        </defs>
        {/* Voile du ciel : plus fort en haut, il assombrit sans effacer le paysage. */}
        <rect data-wx="tint" x={0} y={0} width={width} height={height} fill={`url(#${uid}-tint)`} opacity={0} />
        {/* Nuages : une bande translatée d'un bloc, avec sa copie une largeur plus à gauche pour boucler. */}
        <g data-wx="clouds-drift">
          <use href={`#${uid}-strip`} />
          <use href={`#${uid}-strip`} x={-width} />
        </g>
        <rect data-wx="overcast" x={0} y={0} width={width} height={height} fill={`url(#${uid}-overcast)`} opacity={0} />
        <g data-wx="rainbow" opacity={0} fill="none" strokeOpacity={0.55} strokeWidth={5}>
          {RAINBOW.map((color, i) => {
            const r = arc - i * 5;
            return <path key={color} d={`M${width * 0.5 - r} ${arcFoot} A${r} ${r} 0 0 1 ${width * 0.5 + r} ${arcFoot}`} stroke={color} />;
          })}
        </g>
        <g data-wx="godrays" opacity={0} display="none" fill="#FFF3C4">
          {[42, 30, 20].map((r) => <circle key={r} cx={sun.x} cy={sun.y} r={r} opacity={0.12} />)}
          <g data-wx-rays="">
            {rays.map((ray, i) => <polygon key={i} points={ray.points} opacity={ray.opacity} />)}
          </g>
        </g>
        <rect data-wx="fog" x={0} y={height * 0.3} width={width} height={height * 0.7} fill={`url(#${uid}-fog)`} opacity={0} />
        <rect data-wx="rain-far" x={0} y={0} width={width} height={height} fill={`url(#${uid}-rain-far)`} opacity={0} />
        <rect data-wx="snow-far" x={0} y={0} width={width} height={height} fill={`url(#${uid}-snow-far)`} opacity={0} />
        <rect data-wx="rain-near" x={0} y={0} width={width} height={height} fill={`url(#${uid}-rain-near)`} opacity={0} />
        <rect data-wx="snow-near" x={0} y={0} width={width} height={height} fill={`url(#${uid}-snow-near)`} opacity={0} />
        <path data-wx="bolt" d="M0 0" fill="none" stroke="#FFFFFF" strokeWidth={2.5} opacity={0} />
        <rect data-wx="flash" x={0} y={0} width={width} height={height} fill="#F4F6FF" opacity={0} />
      </g>
    </>
  );
}

// Ne se redessine que si la scène, la taille, le ciel (chaque minute) ou l'horloge changent ; le reste passe par la boucle.
export const WeatherLayer = memo(WeatherLayerView);
