// src/content/rain-canvas.tsx
// Pluie naturelle à l'écran : canvas 2D insérés DANS le <svg> de la pièce par <foreignObject> (technique retenue par l'essai,
// tâche 1 : coût mesuré nul en vue pièce, ≈ 4 % en vue rue), aux bons endroits de l'empilement (spec §5) :
// - « sol » (éclaboussures, anneaux, caniveau, reflets) dans le groupe du sol de la météo, SOUS les passants et les voitures ;
// - « air » (gouttes qui tombent, gouttes des bords, halos, brume) dans le groupe du ciel, AU-DESSUS des acteurs, sous l'éclair ;
// - « vitre » (vue pièce seulement) juste après la météo dans le calque des vues : sous les châssis, les meubles et la lumière.
// Les canvas « sol » et « air » d'une même vue partagent UNE simulation et une seule boucle (`RainHub`).
// Économies : la boucle ne tourne que s'il pleut (ou s'il reste des gouttes en vol / sur la vitre) ; sinon les canvas sont vidés
// et une simple minuterie (1 s) guette la pluie et suit le séchage du sol. Neige : aucune boucle. Mouvement réduit : une image
// fixe, aucune boucle. Onglet caché : la boucle saute ses images. Résolution : au plus min(devicePixelRatio, 2) par pixel CSS,
// basse définition (×1) sur téléphone pour la pluie, et plafonnée en vue zoomée (caméra ×4) à 2 px par unité de scène et 4 Mpx.
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactElement } from 'react';
import type { SceneId } from '../core/library/library-types';
import { CITY_GROUND, STREET_SCALE, cityMetrics } from '../core/library/city/metrics';
import { cityFacades } from '../core/library/city/facades';
import { roofOutline } from '../core/library/city/facade-layout';
import { lampLit, lampsFor } from '../core/library/city/lamps';
import { LANTERN } from '../core/library/city/night-light';
import { shopFrame, shopSlotsFor } from '../core/library/city/shops/slots';
import { hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import type { Weather } from '../core/library/weather/weather-types';
import {
  createRainSim, prefillRain, stepRain, RAIN_BUDGET_PHONE, RAIN_BUDGET_WIDE,
  type RainDripKind, type RainEnv, type RainSim, type RainWorld,
} from '../core/library/weather/rain-drops';
import { createGlassSim, glassActive, prefillGlass, stepGlass, GLASS_BUDGET_PHONE, GLASS_BUDGET_WIDE, type GlassSim, type Pane } from '../core/library/weather/glass-rain';
import { createFogMask, drawGlass, drawRainAir, drawRainGround, makeLightField, type FogMask, type LightField, type RainLight } from './rain-art';

type Clock = { read(nowMs: number): Weather };
type Box = { x: number; y: number; w: number; h: number };

// Hauteur du sol (fraction de la hauteur du monde) où tombent les gouttes et se posent les flaques : celle du décor de chaque
// scène (la même que la couche météo). En mer, pas de sol : les gouttes finissent sur l'eau, sous l'horizon.
const GROUND: Partial<Record<SceneId, number>> = { city: CITY_GROUND, countryside: 0.78, mountain: 0.82 };
const SEA_TOP = 0.5;
export const weatherGroundFrac = (scene: SceneId): number | undefined => GROUND[scene];

/** Flaques de la scène (mêmes tirages que la couche météo, qui les dessine) ; aucune en mer. */
export function weatherPuddles(scene: SceneId, width: number, height: number, seed: number): { x: number; y: number; rx: number }[] {
  const frac = GROUND[scene];
  if (frac === undefined) return [];
  const rng = mulberry32(seed ^ 0x9d1e);
  const top = height * frac;
  return Array.from({ length: Math.max(1, Math.round(width / 70)) }, () => ({ x: rng() * width, y: top + 4 + rng() * (height - top - 8), rx: 12 + rng() * 22 }));
}

const MAX_DRIPS = 40; // points des bords qui gouttent (notes §Android)

/** Monde de la pluie d'une scène. Ville : bords qui gouttent accrochés au vrai décor (corniches et bouts de toit des façades du
 *  premier plan, bandeau des boutiques), caniveau à la bordure du trottoir et une grille tirée. Autres scènes : sans bâti ;
 *  mer : pas d'éclaboussures au sol. */
export function rainWorldFor(scene: SceneId, width: number, height: number, seed: number): RainWorld {
  const frac = GROUND[scene];
  const groundTop = height * (frac ?? SEA_TOP);
  const base: RainWorld = { width, height, groundTop, groundBottom: height, puddles: weatherPuddles(scene, width, height, seed), drips: [], gutter: null, splashGround: scene !== 'sea' };
  if (scene !== 'city') return base;
  const rng = mulberry32(seed ^ hashString('rain-drips'));
  const m = cityMetrics(height);
  const drips: { x: number; y: number; kind: RainDripKind }[] = [];
  const inside = (x: number, y: number): boolean => x >= 0 && x <= width && y >= 0 && y < groundTop;
  for (const f of cityFacades(width, height, seed)) {
    const l = f.layout;
    if (!l) continue;
    // corniche : quelques points le long de l'égout du toit ; toit : ses deux bouts qui débordent
    const n = Math.max(1, Math.min(3, Math.round(l.w / 30)));
    for (let i = 0; i < n; i++) {
      const x = l.x + (l.w * (i + 0.25 + rng() * 0.5)) / n;
      if (inside(x, l.eave + 1)) drips.push({ x, y: l.eave + 1, kind: 'corniche' });
    }
    const outline = roofOutline(l);
    for (const [x, y] of [outline[0]!, outline[outline.length - 1]!]) if (inside(x, y + 0.5)) drips.push({ x, y: y + 0.5, kind: 'toit' });
  }
  // bandeau des boutiques (au-dessus de la vitrine) : on y voit l'eau perler et tomber sur le trottoir
  for (const slot of shopSlotsFor(width, height, seed)) {
    const sign = shopFrame(slot, m.ground).sign;
    for (const u of [0.22 + rng() * 0.15, 0.62 + rng() * 0.15]) {
      const x = sign.x + sign.w * u;
      if (inside(x, sign.y + sign.h)) drips.push({ x, y: sign.y + sign.h, kind: 'auvent' });
    }
  }
  // au plus 40 points : tirés sans remise (déterministe), puis rangés de gauche à droite
  for (let i = drips.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [drips[i], drips[j]] = [drips[j]!, drips[i]!];
  }
  const kept = drips.slice(0, MAX_DRIPS).sort((a, b) => a.x - b.x);
  return { ...base, drips: kept, gutter: { y: m.curb, grateX: Math.round(width * (0.25 + 0.5 * rng())) } };
}

/** Lumières de la scène pour la pluie : lampadaires allumés (lanterne) et vitrines des commerces ouverts (`shops`, la nuit) ;
 *  vide hors de la Ville. Les fenêtres allumées des immeubles ne sont pas des sources (v1). */
export function rainLightsFor(
  scene: SceneId, width: number, height: number, seed: number, minutes: number, daylight: number,
  opts: { forcedNight?: boolean; shops?: readonly { x: number; w: number; top: number; lit: boolean }[] } = {},
): RainLight[] {
  if (scene !== 'city') return [];
  const m = cityMetrics(height);
  const k = m.unit * STREET_SCALE.lamp;
  const out: RainLight[] = [];
  for (const lamp of lampsFor(width, seed)) {
    if (!lampLit(lamp, minutes, daylight, opts.forcedNight ?? false)) continue;
    out.push({ x: lamp.x + LANTERN.dx * k, y: m.curb + LANTERN.dy * k, w: 6, color: '#FFD86A', k: 1 });
  }
  if (daylight < 0.45) for (const s of opts.shops ?? []) if (s.lit) out.push({ x: s.x + s.w / 2, y: m.ground - 2, w: Math.max(11, s.w / 2), color: '#FFE6B0', k: 0.7 });
  return out;
}

// ───────────── environnement commun ─────────────
const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Téléphone : petit côté de l'écran < 600 px CSS (budgets « téléphone » de notes §Android). */
export const isPhone = (): boolean => typeof screen !== 'undefined' && Math.min(screen.width || 0, screen.height || 0) > 0 && Math.min(screen.width, screen.height) < 600;
// Guet de la pluie quand rien ne tourne (temps sec, neige) : une minuterie d'une seconde, pas une boucle d'images. Elle relit
// l'horloge météo (rien d'autre ne prévient quand la pluie commence) et redessine les reflets du sol qui sèche ; coût négligeable.
const IDLE_MS = 1000;
const RAIN_FRAME_MS = 1000 / 60 - 1; // pluie dehors : 60 Hz au plus (écrans 120 Hz : pas de coût doublé)
const MAX_UNIT_SCALE = 2; // px de tampon par unité de scène au plus (vue zoomée)
const MAX_PIXELS = 4_200_000;
const RESIZE_EVERY = 30; // images entre deux relevés de la taille affichée (zoom de la caméra)

let loops = 0;
/** Boucles d'animation de la pluie en cours (tests, mesures). */
export const rainLoopsActive = (): number => loops;

// Pluie (pas neige) et sol mouillé lus dans la météo.
const rainOf = (w: Weather): number => (w.kind === 'rain' && Number.isFinite(w.precip) ? Math.max(0, w.precip) : 0);
const wetOf = (w: Weather): number => (w.kind === 'rain' && Number.isFinite(w.wet) ? Math.max(0, w.wet) : 0);

// `ctx` : pris au premier dessin seulement (undefined = pas encore demandé) — par temps sec, aucun contexte n'est créé.
type Surface = { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null | undefined; box: Box; dprCap: number; scale: number; dirty: boolean; painted: boolean };

function makeSurface(cv: HTMLCanvasElement, box: Box, dprCap: number): Surface {
  return { cv, ctx: undefined, box, dprCap, scale: 0, dirty: true, painted: false };
}
function contextOf(s: Surface): CanvasRenderingContext2D | null {
  if (s.ctx === undefined) {
    try { s.ctx = s.cv.getContext('2d'); } catch { s.ctx = null; }
  }
  return s.ctx;
}

// Taille du tampon : taille affichée × dpr (plafonné), au plus 2 px par unité de scène et 4 Mpx. Sans mise en page (tests),
// la boîte en unités de scène × dpr.
function fit(s: Surface): void {
  const r = typeof s.cv.getBoundingClientRect === 'function' ? s.cv.getBoundingClientRect() : null;
  const dpr = Math.min(typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1, s.dprCap);
  let k = r && r.width > 0 ? (r.width / s.box.w) * dpr : dpr;
  k = Math.min(k, MAX_UNIT_SCALE);
  if (s.box.w * s.box.h * k * k > MAX_PIXELS) k = Math.sqrt(MAX_PIXELS / (s.box.w * s.box.h));
  k = Math.max(0.25, Math.round(k * 8) / 8);
  const w = Math.max(1, Math.round(s.box.w * k));
  const h = Math.max(1, Math.round(s.box.h * k));
  if (s.cv.width !== w) s.cv.width = w;
  if (s.cv.height !== h) s.cv.height = h;
  s.scale = k;
  s.dirty = false;
}

// Efface puis place le repère de la scène (unités du monde) sur le tampon.
function begin(s: Surface): CanvasRenderingContext2D | null {
  if (s.dirty) fit(s);
  const c = contextOf(s);
  if (!c) return null;
  s.painted = true;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.clearRect(0, 0, s.cv.width, s.cv.height);
  c.setTransform(s.scale, 0, 0, s.scale, -s.box.x * s.scale, -s.box.y * s.scale);
  return c;
}
function wipe(s: Surface): void {
  if (!s.painted || !s.ctx) return; // jamais dessiné : rien à effacer
  s.painted = false;
  if (s.dirty) fit(s);
  s.ctx.setTransform(1, 0, 0, 1, 0, 0);
  s.ctx.clearRect(0, 0, s.cv.width, s.cv.height);
}

// Boucle rAF commune : `frame(dt)` rend faux quand il n'y a plus rien à animer (la boucle s'arrête, `idle` prend le relais).
// `minMs` : intervalle minimal entre deux images (vitre à 30 Hz). dt borné à [0 ; 0,1] s (horodatage rAF parfois antérieur
// à l'armement : dt négatif à la première image, piège trouvé par l'essai).
function createLoop(frame: (dt: number) => boolean, idle: () => void, minMs = 0) {
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let last = -1;
  const tick = (now: number): void => {
    if (!running) return;
    raf = window.requestAnimationFrame(tick);
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { last = now; return; }
    if (last >= 0 && now - last < minMs) return;
    const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (!frame(dt)) stop();
  };
  const stop = (): void => {
    if (running) { running = false; loops--; window.cancelAnimationFrame(raf); }
    idle();
  };
  return {
    start(): void {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      if (running) return;
      running = true;
      loops++;
      last = -1;
      raf = window.requestAnimationFrame(tick);
    },
    /** Arrête tout (démontage). */
    dispose(): void {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      if (running) { running = false; loops--; window.cancelAnimationFrame(raf); }
    },
    poll(fn: () => void): void {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn(); }, IDLE_MS);
    },
    get running(): boolean { return running; },
  };
}

// ───────────── pluie dehors : une simulation, deux canvas (sol + air) ─────────────
export type RainHubConfig = { world: RainWorld; seed: number; soft: boolean; clock: Clock; sky: Sky; lights: readonly RainLight[] };
export type RainHub = {
  attach(role: 'ground' | 'air', cv: HTMLCanvasElement, box: Box): void;
  detach(role: 'ground' | 'air'): void;
  configure(cfg: RainHubConfig): void;
  /** Taille affichée à relire (redimensionnement, zoom). */
  resized(): void;
};

export function createRainHub(): RainHub {
  const surfaces: { ground?: Surface; air?: Surface } = {};
  let cfg: RainHubConfig | null = null;
  let sim: RainSim | null = null;
  let simKey: { world: RainWorld; seed: number; soft: boolean } | null = null;
  let field: LightField | null = null;
  let fieldKey: { lights: readonly RainLight[]; top: string; bottom: string; h: number } | null = null;
  let t = 0;
  let frames = 0;
  let lastWet = -1;
  const env: RainEnv = { precip: 0, wind: 0, daylight: 1, t: 0 };
  const groundEnv: RainEnv & { wet: number } = { precip: 0, wind: 0, daylight: 1, t: 0, wet: 0 };

  const read = (): Weather => cfg!.clock.read(Date.now());
  const fillEnv = (w: Weather): void => {
    env.precip = rainOf(w);
    env.wind = Number.isFinite(w.wind) ? w.wind : 0;
    env.daylight = cfg!.sky.daylight;
    env.t = t;
  };
  const busy = (s: RainSim): boolean => s.drops.length > 0 || s.splashes.length > 0 || s.ripples.length > 0 || s.drips.length > 0;

  const paint = (w: Weather): void => {
    if (!sim || !field || !cfg) return;
    const wet = wetOf(w);
    lastWet = wet;
    if (surfaces.ground) {
      const c = begin(surfaces.ground);
      if (c) {
        Object.assign(groundEnv, env);
        groundEnv.wet = wet;
        drawRainGround(c, sim, cfg.world, groundEnv, field);
      }
    }
    if (surfaces.air) {
      const c = begin(surfaces.air);
      if (c) drawRainAir(c, sim, cfg.world, env, field);
    }
  };
  const clear = (): void => {
    if (surfaces.ground) wipe(surfaces.ground);
    if (surfaces.air) wipe(surfaces.air);
  };

  const frame = (dt: number): boolean => {
    if (!sim || !cfg) return false;
    t += dt;
    const w = read();
    fillEnv(w);
    stepRain(sim, env, dt);
    if (++frames % RESIZE_EVERY === 0) for (const s of [surfaces.ground, surfaces.air]) if (s) s.dirty = true;
    paint(w);
    return env.precip > 0 || busy(sim);
  };
  // Rien en vol : canvas vidés, ou reflets du sol mouillé qui sèche (redessinés au guet, chaque seconde).
  const idle = (): void => {
    if (!cfg || !sim) return;
    const w = read();
    fillEnv(w);
    const wet = wetOf(w);
    if (wet > 0.01 && field?.lights?.length) { if (Math.abs(wet - lastWet) > 0.005) paint(w); }
    else { clear(); lastWet = 0; }
    if (surfaces.ground || surfaces.air) loop.poll(wake);
  };
  const loop = createLoop(frame, idle, RAIN_FRAME_MS);

  const wake = (): void => {
    if (!cfg || !(surfaces.ground || surfaces.air)) { loop.dispose(); return; }
    ensure();
    const w = read();
    fillEnv(w);
    if (reducedMotion()) {
      // image fixe, aucune boucle : gouttes figées posées quand la pluie est là (gardées tant qu'elle dure), vidées quand elle cesse
      loop.dispose();
      if (env.precip > 0) {
        if (!sim || sim.drops.length === 0) {
          sim = createRainSim(cfg.world, cfg.seed, { soft: cfg.soft, budget: isPhone() ? RAIN_BUDGET_PHONE : RAIN_BUDGET_WIDE });
          prefillRain(sim, env);
        }
        paint(w);
      } else {
        sim = createRainSim(cfg.world, cfg.seed, { soft: cfg.soft, budget: isPhone() ? RAIN_BUDGET_PHONE : RAIN_BUDGET_WIDE });
        if (wetOf(w) > 0.01 && field?.lights?.length) paint(w);
        else clear();
      }
      return;
    }
    if (env.precip > 0 || (sim && busy(sim))) loop.start();
    else idle();
  };

  // Simulation (re)créée quand le monde, la graine ou la douceur changent : à la même graine, et préremplie s'il pleut déjà
  // (ouverture, rotation du téléphone : pas de vide visible). Champ de lumière refait seulement si les lumières ou le ciel changent.
  const ensure = (): void => {
    const c = cfg!;
    if (!sim || !simKey || simKey.world !== c.world || simKey.seed !== c.seed || simKey.soft !== c.soft) {
      sim = createRainSim(c.world, c.seed, { soft: c.soft, budget: isPhone() ? RAIN_BUDGET_PHONE : RAIN_BUDGET_WIDE });
      simKey = { world: c.world, seed: c.seed, soft: c.soft };
      fillEnv(read());
      if (env.precip > 0) prefillRain(sim, env);
      lastWet = -1;
    }
    if (!field || !fieldKey || fieldKey.lights !== c.lights || fieldKey.top !== c.sky.top || fieldKey.bottom !== c.sky.bottom || fieldKey.h !== c.world.height) {
      field = makeLightField(c.lights, c.sky, c.world.height);
      fieldKey = { lights: c.lights, top: c.sky.top, bottom: c.sky.bottom, h: c.world.height };
      lastWet = -1;
    }
  };

  return {
    attach(role, cv, box) {
      surfaces[role] = makeSurface(cv, box, isPhone() ? 1 : 2);
      if (cfg) wake();
    },
    detach(role) {
      const s = surfaces[role];
      if (s) { s.cv.width = 0; s.cv.height = 0; } // tampon rendu tout de suite (WebView : mémoire)
      delete surfaces[role];
      if (!surfaces.ground && !surfaces.air) loop.dispose();
    },
    configure(next) {
      cfg = next;
      wake();
      // pluie en cours, boucle arrêtée (taille changée…) : une image tout de suite, sans attendre
      if (loop.running && sim) paint(read());
    },
    resized() {
      for (const s of [surfaces.ground, surfaces.air]) if (s) s.dirty = true;
      if (!loop.running && cfg) wake();
    },
  };
}

export type RainCanvasProps = {
  width: number;
  height: number;
  scene: SceneId;
  seed: number;
  clock: Clock;
  sky: Sky;
  lights: readonly RainLight[];
  world: RainWorld;
  /** Derrière la vitre (vue pièce) : pluie adoucie (70 %, couche proche réduite, éclaboussures × 0,4). */
  soft?: boolean;
  /** Simulation partagée avec l'autre canvas de la vue ; sans elle, ce canvas a la sienne. */
  hub?: RainHub;
};

// Haut du canvas « sol » : un peu au-dessus du sol (gouttelettes des éclaboussures qui rebondissent).
const SPLASH_ROOM = 40;

function useOwnHub(hub: RainHub | undefined): RainHub {
  const own = useRef<RainHub | null>(null);
  if (!hub && !own.current) own.current = createRainHub();
  return hub ?? own.current!;
}

function RainLayerCanvas(p: RainCanvasProps & { role: 'ground' | 'air' }): ReactElement {
  const hub = useOwnHub(p.hub);
  const ref = useRef<HTMLCanvasElement | null>(null);
  const top = p.role === 'ground' ? Math.max(0, Math.floor(p.world.groundTop - SPLASH_ROOM)) : 0;
  const box = useMemo<Box>(() => ({ x: 0, y: top, w: p.width, h: Math.max(1, p.height - top) }), [top, p.width, p.height]);
  // Branché une fois par canvas ; la boîte change sans remonter (redimensionnement : même élément, tampon refait).
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    hub.attach(p.role, cv, box);
    return () => hub.detach(p.role);
  }, [hub, p.role, box]);
  useLayoutEffect(() => {
    hub.configure({ world: p.world, seed: p.seed, soft: p.soft ?? false, clock: p.clock, sky: p.sky, lights: p.lights });
  }, [hub, p.world, p.seed, p.soft, p.clock, p.sky, p.lights, box]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const on = (): void => hub.resized();
    window.addEventListener('resize', on);
    const ro = typeof ResizeObserver === 'function' && ref.current ? new ResizeObserver(on) : null;
    if (ro && ref.current) ro.observe(ref.current);
    return () => { window.removeEventListener('resize', on); ro?.disconnect(); };
  }, [hub]);
  return (
    <foreignObject data-rain-canvas={p.role} x={box.x} y={box.y} width={box.w} height={box.h} style={{ pointerEvents: 'none' }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
    </foreignObject>
  );
}

/** Sol mouillé de la pluie (sous les acteurs). */
export function RainGroundCanvas(p: RainCanvasProps): ReactElement {
  return <RainLayerCanvas {...p} role="ground" />;
}
/** Pluie qui tombe (au-dessus des acteurs). */
export function RainAirCanvas(p: RainCanvasProps): ReactElement {
  return <RainLayerCanvas {...p} role="air" />;
}
/** Une simulation pour les deux canvas d'une vue (stable pour la vie du composant). */
export function useRainHub(): RainHub {
  const ref = useRef<RainHub | null>(null);
  if (!ref.current) ref.current = createRainHub();
  return ref.current;
}

// ───────────── vitre (vue pièce) ─────────────
export type RainGlassProps = {
  panes: readonly Pane[];
  seed: number;
  clock: Clock;
  sky: Sky;
  lights: readonly RainLight[];
  /** Vitre soulevée pendant un glissé : ni gouttes ni buée sur elle (elle reprend quand la fenêtre est posée). */
  skip?: number | null;
  /** Hauteur du monde (dégradé du ciel derrière les gouttes) ; par défaut le bas des vitres. */
  worldHeight?: number;
};

const GLASS_FRAME_MS = 1000 / 30 - 1; // coulures lentes : 30 Hz suffisent (notes §Android)
const NO_PANE: Pane = { x: 0, y: 0, w: 0, h: 0 };

function boundsOf(panes: readonly Pane[]): Box | null {
  const ok = panes.filter((p) => p.w > 0 && p.h > 0);
  if (ok.length === 0) return null;
  const x0 = Math.min(...ok.map((p) => p.x)), y0 = Math.min(...ok.map((p) => p.y));
  const x1 = Math.max(...ok.map((p) => p.x + p.w)), y1 = Math.max(...ok.map((p) => p.y + p.h));
  return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - Math.floor(x0)), h: Math.ceil(y1 - Math.floor(y0)) };
}

/** Gouttes sur les vitres de la pièce : un canvas couvrant les vitres, découpé à chacune. */
export function RainGlassCanvas(p: RainGlassProps): ReactElement | null {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const paneKey = p.panes.map((q) => `${q.x},${q.y},${q.w},${q.h}`).join('|');
  const panes = useMemo(() => p.panes.map((q) => ({ ...q })), [paneKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const box = useMemo(() => boundsOf(panes), [panes]);
  const live = useRef(p);
  live.current = p;
  const field = useMemo(
    () => makeLightField(p.lights, p.sky, p.worldHeight ?? (box ? box.y + box.h : 1)),
    [p.lights, p.sky.top, p.sky.bottom, p.worldHeight, box], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const fieldRef = useRef(field);
  fieldRef.current = field;
  // Une simulation (et sa buée) par jeu de vitres : recréées ensemble à la même graine, préremplies s'il pleut déjà.
  const ctl = useRef<{ redraw(): void } | null>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || !box) return undefined;
    const surface = makeSurface(cv, box, isPhone() ? 1.5 : 2);
    const budget = isPhone() ? GLASS_BUDGET_PHONE : GLASS_BUDGET_WIDE;
    let sim: GlassSim = createGlassSim(panes, p.seed, budget);
    // Buée créée à la première image de pluie seulement (rien d'alloué par temps sec), recréée avec la simulation.
    let fog: FogMask | null = null;
    const fogOf = (): FogMask => (fog ??= createFogMask(panes));
    const env = { precip: 0, wind: 0, t: 0 };
    const drawEnv = { precip: 0, daylight: 1 };
    let t = 0;
    const read = (): void => {
      const w = live.current.clock.read(Date.now());
      env.precip = rainOf(w);
      env.wind = Number.isFinite(w.wind) ? w.wind : 0;
      env.t = t;
      drawEnv.precip = env.precip;
      drawEnv.daylight = live.current.sky.daylight;
    };
    // vitre soulevée : la même simulation, sa vitre réduite à rien (drawGlass saute les vitres vides)
    let masked: GlassSim | null = null;
    let maskedFor: number | null = null;
    const view = (): GlassSim => {
      const skip = live.current.skip;
      if (skip === null || skip === undefined || skip < 0 || skip >= sim.panes.length) return sim;
      if (!masked || maskedFor !== skip) { maskedFor = skip; masked = { ...sim, panes: sim.panes.map((q, i) => (i === skip ? NO_PANE : q)) }; }
      masked.statics = sim.statics; masked.runners = sim.runners; masked.trails = sim.trails;
      return masked;
    };
    const paint = (): void => {
      const c = begin(surface);
      if (c) drawGlass(c, view(), drawEnv, fieldRef.current, fogOf());
    };
    const frame = (dt: number): boolean => {
      t += dt;
      read();
      stepGlass(sim, env, dt);
      const f = fogOf();
      f.regrow(dt);
      for (const R of sim.runners) f.erase(R.trail);
      paint();
      return env.precip > 0 || glassActive(sim);
    };
    const idle = (): void => {
      wipe(surface);
      loop.poll(wake);
    };
    const loop = createLoop(frame, idle, GLASS_FRAME_MS);
    const wake = (): void => {
      read();
      if (reducedMotion()) {
        // image fixe, aucune boucle : la vitre se couvre quand la pluie est là (gouttes gardées tant qu'elle dure), se vide quand
        // elle cesse
        loop.dispose();
        if (env.precip > 0) {
          if (!glassActive(sim)) { sim = createGlassSim(panes, p.seed, budget); masked = null; fog = null; prefillGlass(sim, env); }
          paint();
        } else {
          sim = createGlassSim(panes, p.seed, budget);
          masked = null;
          fog = null;
          wipe(surface);
        }
        return;
      }
      if (env.precip > 0 || glassActive(sim)) loop.start();
      else idle();
    };
    read();
    if (env.precip > 0) prefillGlass(sim, env);
    ctl.current = { redraw: () => { surface.dirty = true; if (!loop.running) wake(); else paint(); } };
    if (env.precip > 0 && !reducedMotion()) paint(); // pluie déjà là : pas de première image vide (mouvement réduit : wake dessine)
    wake();
    // Taille affichée : relue sur redimensionnement (pas de caméra en vue pièce, donc pas de relevé périodique).
    const onResize = (): void => { surface.dirty = true; if (!loop.running) ctl.current?.redraw(); };
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    ro?.observe(cv);
    return () => {
      loop.dispose();
      ctl.current = null;
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      cv.width = 0; // tampon rendu tout de suite (WebView : mémoire) ; la buée part avec la simulation
      cv.height = 0;
      fog = null;
    };
  }, [panes, box, p.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  // ciel (chaque minute), lumières, vitre soulevée : une image refaite (la boucle, si elle tourne, relit tout à chaque
  // image) ; en mouvement réduit, c'est aussi ce qui fait suivre la météo à l'image fixe.
  useLayoutEffect(() => { ctl.current?.redraw(); }, [field, p.skip, p.sky, p.clock]);
  if (!box) return null;
  return (
    <foreignObject data-rain-canvas="glass" data-skip-pane={p.skip ?? undefined} x={box.x} y={box.y} width={box.w} height={box.h} style={{ pointerEvents: 'none' }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
    </foreignObject>
  );
}
