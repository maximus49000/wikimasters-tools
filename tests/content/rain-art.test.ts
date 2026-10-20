// @vitest-environment jsdom
// tests/content/rain-art.test.ts
// Dessin de la pluie (canvas simulé) : nombre d'appels, sprites réutilisés, aucun `ctx.filter`, aucune exception.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFogMask, drawGlass, drawRainAir, drawRainGround, makeLightField, type RainLight } from '../../src/content/rain-art';
import { createGlassSim, GLASS_BUDGET_PHONE, prefillGlass, stepGlass } from '../../src/core/library/weather/glass-rain';
import { createRainSim, prefillRain, RAIN_BUDGET_WIDE, stepRain, type RainEnv, type RainWorld } from '../../src/core/library/weather/rain-drops';
import { recordingCtx, type RecordingCtx } from '../core/library/paint/recording-ctx';

// Faux contexte complet : celui du peintre + ce que la pluie emploie (drawImage, transformations), et un piège sur `filter`.
type FakeCtx = RecordingCtx & { filterSets: number; images: number };
function fakeCtx(): FakeCtx {
  const base = recordingCtx() as FakeCtx;
  base.filterSets = 0;
  base.images = 0;
  Object.defineProperty(base, 'filter', { get: () => 'none', set: () => { base.filterSets++; } });
  Object.assign(base, {
    drawImage: () => { base.images++; base.ops.push({ op: 'drawImage', args: [] }); },
    clearRect: (x: number, y: number, w: number, h: number) => base.ops.push({ op: 'clearRect', args: [x, y, w, h] }),
    setTransform: () => undefined,
    getTransform: () => ({ a: 1, d: 1 }),
    lineCap: 'butt',
    canvas: { width: 1000, height: 460 },
  });
  return base;
}
const asCtx = (c: FakeCtx): CanvasRenderingContext2D => c as unknown as CanvasRenderingContext2D;

const SKY_DAY = { top: '#6FB1E8', bottom: '#BFE0F5' };
const SKY_NIGHT = { top: '#0B1030', bottom: '#1B2250' };
const LIGHTS: RainLight[] = [
  { x: 170, y: 212, w: 10, color: '#FFD86A', k: 1 },
  { x: 500, y: 212, w: 10, color: '#FFD86A', k: 1 },
  { x: 300, y: 296, w: 60, color: '#FFF0C0', k: 0.7 },
];
const WORLD: RainWorld = {
  width: 1000, height: 460, groundTop: 300, groundBottom: 460,
  puddles: [{ x: 120, y: 330, rx: 34 }, { x: 640, y: 338, rx: 48 }],
  drips: [{ x: 400, y: 263, kind: 'auvent' }, { x: 690, y: 246, kind: 'gouttiere' }],
  gutter: { y: 346, grateX: 700 },
  splashGround: true,
};
const env = (precip: number, daylight: number): RainEnv => ({ precip, wind: 0.4, daylight, t: 5 });

const strokes = (c: FakeCtx): number => c.ops.filter((o) => o.op === 'stroke').length;

let created = 0;
beforeEach(() => {
  created = 0;
  // jsdom n'a pas de canvas : chaque canvas hors écran reçoit un faux contexte ; on compte les créations.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => asCtx(fakeCtx()) as never);
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'canvas') created++;
    return realCreate(tag);
  }) as typeof document.createElement);
});
afterEach(() => vi.restoreAllMocks());

describe('drawRainAir', () => {
  it('dessine autant de traits que de gouttes visibles', () => {
    const world: RainWorld = { ...WORLD, drips: [], gutter: null };
    const sim = createRainSim(world, 7, { soft: false, budget: RAIN_BUDGET_WIDE });
    const e = env(0.5, 1); // plein jour : toute goutte est visible
    prefillRain(sim, e);
    stepRain(sim, e, 1 / 60);
    const field = makeLightField([], SKY_DAY, 460);
    const ctx = fakeCtx();
    drawRainAir(asCtx(ctx), sim, world, e, field);
    const near = sim.drops.filter((d) => d.layer === 2).length; // la couche proche a un halo flou en plus (second trait)
    expect(sim.drops.length).toBeGreaterThan(100);
    expect(strokes(ctx)).toBe(sim.drops.length + near);
  });

  it('la nuit, une goutte hors des lumières reste visible (30 %) et aucune n\'est sautée', () => {
    const world: RainWorld = { ...WORLD, drips: [], gutter: null };
    const sim = createRainSim(world, 7, { soft: false, budget: RAIN_BUDGET_WIDE });
    const e = env(0.5, 0);
    prefillRain(sim, e);
    const field = makeLightField(LIGHTS, SKY_NIGHT, 460);
    const ctx = fakeCtx();
    drawRainAir(asCtx(ctx), sim, world, e, field);
    const near = sim.drops.filter((d) => d.layer === 2).length;
    // + halos des lampadaires (fillRect, pas des traits) : les traits restent ceux des gouttes
    expect(strokes(ctx)).toBe(sim.drops.length + near);
    expect(ctx.filterSets).toBe(0);
  });

  it('bords qui gouttent, caniveau et sol : aucune exception, des traits en plus', () => {
    const sim = createRainSim(WORLD, 3, { soft: false, budget: RAIN_BUDGET_WIDE });
    const e = env(0.9, 0.2);
    prefillRain(sim, e);
    for (let i = 0; i < 90; i++) stepRain(sim, e, 1 / 30);
    const field = makeLightField(LIGHTS, SKY_NIGHT, 460);
    const air = fakeCtx();
    const ground = fakeCtx();
    expect(() => drawRainAir(asCtx(air), sim, WORLD, e, field)).not.toThrow();
    expect(() => drawRainGround(asCtx(ground), sim, WORLD, e, field)).not.toThrow();
    expect(sim.splashes.length + sim.ripples.length).toBeGreaterThan(0);
    expect(ground.ops.length).toBeGreaterThan(sim.splashes.length);
    expect(air.filterSets + ground.filterSets).toBe(0);
  });

  it('sans pluie ni goutte : rien n\'est dessiné', () => {
    const sim = createRainSim(WORLD, 3, { soft: false, budget: RAIN_BUDGET_WIDE });
    const e = env(0, 1);
    const field = makeLightField([], SKY_DAY, 460);
    const air = fakeCtx();
    const ground = fakeCtx();
    drawRainAir(asCtx(air), sim, WORLD, e, field);
    drawRainGround(asCtx(ground), sim, WORLD, e, field);
    expect(air.ops.filter((o) => o.op === 'fill' || o.op === 'stroke' || o.op === 'fillRect')).toHaveLength(0);
    expect(ground.ops.filter((o) => o.op === 'fill' || o.op === 'stroke' || o.op === 'fillRect')).toHaveLength(0);
  });
});

describe('makeLightField', () => {
  it('lightAt : cône sous le lampadaire, rien loin de tout ; colorAt : ciel teinté par la lumière', () => {
    const field = makeLightField(LIGHTS, SKY_NIGHT, 460);
    expect(field.lightAt(170, 290)).toBeGreaterThan(0.3);
    expect(field.lightAt(170, 290)).toBeGreaterThan(field.lightAt(200, 290));
    expect(field.lightAt(900, 100)).toBe(0);
    expect(field.lightAt(300, 280)).toBeGreaterThan(0.3); // devant la vitrine
    expect(field.colorAt(900, 100)).toBe(field.colorAt(950, 100));
    expect(field.colorAt(170, 215)).not.toBe(field.colorAt(900, 215));
    expect(field.colorAt(0, 0)).toMatch(/^rgba?\(/);
  });
});

describe('drawGlass', () => {
  const PANES = [{ x: 170, y: 40, w: 300, h: 362 }, { x: 500, y: 40, w: 330, h: 362 }];
  const genv = { precip: 0.85, wind: 0.45, t: 5 };

  it('sprites de vitre réutilisés (pas de nouveau canvas après la première image)', () => {
    const sim = createGlassSim(PANES, 11, GLASS_BUDGET_PHONE);
    prefillGlass(sim, genv);
    for (let i = 0; i < 60; i++) stepGlass(sim, genv, 1 / 30);
    const field = makeLightField(LIGHTS, SKY_NIGHT, 460);
    const fog = createFogMask(PANES);
    const e = { precip: 0.85, daylight: 0 };
    const ctx1 = fakeCtx();
    drawGlass(asCtx(ctx1), sim, e, field, fog);
    expect(ctx1.images).toBeGreaterThan(sim.statics.length); // buée + une image par goutte posée au moins
    const after1 = created;
    expect(after1).toBeGreaterThan(0);
    const ctx2 = fakeCtx();
    drawGlass(asCtx(ctx2), sim, e, field, fog);
    expect(created).toBe(after1);
    expect(ctx2.images).toBe(ctx1.images);
    expect(ctx1.filterSets + ctx2.filterSets).toBe(0);
  });

  it('aucun appel à ctx.filter, et la buée s\'efface le long des coulures sans exception', () => {
    const sim = createGlassSim(PANES, 5, GLASS_BUDGET_PHONE);
    prefillGlass(sim, genv);
    const fog = createFogMask(PANES);
    const field = makeLightField([], SKY_DAY, 460);
    const ctx = fakeCtx();
    for (let i = 0; i < 120; i++) {
      stepGlass(sim, genv, 1 / 30);
      fog.regrow(1 / 30);
      for (const R of sim.runners) fog.erase(R.trail);
      drawGlass(asCtx(ctx), sim, { precip: 0.85, daylight: 1 }, field, fog);
    }
    expect(sim.runners.length + sim.trails.length).toBeGreaterThan(0);
    expect(ctx.filterSets).toBe(0);
    // chaque vitre est découpée (clip) à chaque image
    expect(ctx.ops.filter((o) => o.op === 'clip').length).toBe(120 * PANES.length);
  });

  it('pièce sans fenêtre : rien, aucune exception', () => {
    const sim = createGlassSim([], 5, GLASS_BUDGET_PHONE);
    const fog = createFogMask([]);
    const ctx = fakeCtx();
    expect(() => drawGlass(asCtx(ctx), sim, { precip: 0.5, daylight: 1 }, makeLightField([], SKY_DAY, 460), fog)).not.toThrow();
    expect(ctx.ops).toHaveLength(0);
  });
});
