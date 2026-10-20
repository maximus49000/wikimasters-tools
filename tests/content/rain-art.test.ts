// @vitest-environment jsdom
// tests/content/rain-art.test.ts
// Dessin de la pluie (canvas simulé) : nombre d'appels, sprites réutilisés, aucun `ctx.filter`, aucune exception.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFogMask, drawGlass, drawRainAir, drawRainGround, makeLightField, type RainLight } from '../../src/content/rain-art';
import { createGlassSim, GLASS_BUDGET_PHONE, GLASS_BUDGET_WIDE, prefillGlass, stepGlass } from '../../src/core/library/weather/glass-rain';
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

  it('halo des lampadaires et lame du caniveau montent en fondu depuis leur seuil', () => {
    const world: RainWorld = { ...WORLD, drips: [] };
    const sim = createRainSim(world, 3, { soft: false, budget: RAIN_BUDGET_WIDE });
    const field = makeLightField(LIGHTS, SKY_NIGHT, 460);
    // halo : fillRect de 2R de côté juste après translate ; alpha lu au moment du fillRect
    const haloAlpha = (precip: number): number => {
      const ctx = fakeCtx();
      const seen: number[] = [];
      const fr = ctx.fillRect;
      ctx.fillRect = (x: number, y: number, w: number, h: number) => { if (w === h && w > 60 && w < 200) seen.push(ctx.globalAlpha); fr(x, y, w, h); };
      drawRainAir(asCtx(ctx), sim, world, env(precip, 0), field);
      return seen[0] ?? 0;
    };
    expect(haloAlpha(0.02)).toBe(0);
    expect(haloAlpha(0.03)).toBeGreaterThan(0);
    expect(haloAlpha(0.03)).toBeLessThan(haloAlpha(0.05) * 0.5);
    expect(haloAlpha(0.07)).toBeGreaterThan(haloAlpha(0.05));
    // caniveau : premier fillRect pleine largeur sur gutter.y
    const gutterAlpha = (precip: number): number => {
      const ctx = fakeCtx();
      const seen: number[] = [];
      const fr = ctx.fillRect;
      ctx.fillRect = (x: number, y: number, w: number, h: number) => { if (y === WORLD.gutter!.y && w === WORLD.width) seen.push(ctx.globalAlpha); fr(x, y, w, h); };
      drawRainGround(asCtx(ctx), sim, world, env(precip, 1), field);
      return seen[0] ?? 0;
    };
    expect(gutterAlpha(0.08)).toBe(0);
    expect(gutterAlpha(0.09)).toBeGreaterThan(0);
    expect(gutterAlpha(0.09)).toBeLessThan(gutterAlpha(0.11) * 0.5);
    expect(gutterAlpha(0.13)).toBeGreaterThan(gutterAlpha(0.11));
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

  it('60 s simulées d\'averse de nuit : au plus 4 sprites créés par image, au plus 120 après la première seconde, 40 après 30 s', () => {
    // 8 sources colorées (3 lampadaires + 5 vitrines) : beaucoup de teintes réfractées distinctes ; le cache ne doit plus
    // se vider d'un coup (éviction des plus anciennes + teinte quantifiée + 5 gabarits de rayon), sinon 100 à 150 canvas
    // renaissaient dans une seule image toutes les 8 s. Les teintes restantes apparaissent au fil des gouttes qui se posent
    // (mesuré : ~95 en 59 s, ~27 dans les 30 dernières secondes, jamais plus de 3 par image).
    const lights: RainLight[] = [
      { x: 170, y: 212, w: 10, color: '#FFD86A', k: 1 }, { x: 500, y: 212, w: 10, color: '#FFD86A', k: 1 }, { x: 830, y: 212, w: 10, color: '#FFD86A', k: 1 },
      { x: 90, y: 296, w: 50, color: '#FFF0C0', k: 0.7 }, { x: 300, y: 296, w: 60, color: '#C8DCFF', k: 0.7 }, { x: 460, y: 296, w: 40, color: '#FFB7C5', k: 0.7 },
      { x: 640, y: 296, w: 60, color: '#FFD86A', k: 0.7 }, { x: 900, y: 296, w: 55, color: '#9CC4FF', k: 0.7 },
    ];
    const field = makeLightField(lights, SKY_NIGHT, 460);
    const sim = createGlassSim(PANES, 23, GLASS_BUDGET_PHONE);
    prefillGlass(sim, genv);
    const fog = createFogMask(PANES);
    const e = { precip: 0.85, daylight: 0 };
    const dt = 1 / 30;
    let afterFirstSecond = -1, afterHalf = -1, worstFrame = 0;
    for (let f = 0; f < 60 * 30; f++) {
      stepGlass(sim, genv, dt);
      fog.regrow(dt);
      for (const R of sim.runners) fog.erase(R.trail);
      const before = created;
      drawGlass(asCtx(fakeCtx()), sim, e, field, fog);
      if (f >= 30) worstFrame = Math.max(worstFrame, created - before);
      if (f === 29) afterFirstSecond = created;
      if (f === 30 * 30 - 1) afterHalf = created;
    }
    expect(afterFirstSecond).toBeGreaterThan(0);
    expect(worstFrame).toBeLessThanOrEqual(4); // jamais de rafale de canvas dans une seule image
    expect(created - afterFirstSecond).toBeLessThanOrEqual(120);
    expect(created - afterHalf).toBeLessThanOrEqual(40);
  });

  it('cache plein (crépuscule sur une large baie) : l\'éviction se fait une à une, jamais de vidage', () => {
    // daylight balaie 1 → 0 en 60 s : chaque pas de nuit renouvelle les sprites à l'écran (au plus autant que de gouttes
    // visibles, une fois par pas) ; entre deux pas, aucune rafale même quand le cache a dépassé son plafond.
    const field = makeLightField(LIGHTS, SKY_NIGHT, 460);
    const sim = createGlassSim(PANES, 29, GLASS_BUDGET_WIDE);
    prefillGlass(sim, genv);
    const fog = createFogMask(PANES);
    const dt = 1 / 30;
    const perFrame: number[] = [];
    for (let f = 0; f < 60 * 30; f++) {
      stepGlass(sim, genv, dt);
      const before = created;
      drawGlass(asCtx(fakeCtx()), sim, { precip: 0.85, daylight: 1 - f / (60 * 30) }, field, fog);
      perFrame.push(created - before);
    }
    const bursts = perFrame.filter((n) => n > 4).length;
    expect(created).toBeGreaterThan(400); // le plafond a bien été dépassé
    expect(bursts).toBeLessThanOrEqual(9); // au plus une rafale par pas de nuit (8 pas + l'image froide)
    expect(Math.max(...perFrame.slice(1))).toBeLessThanOrEqual(sim.statics.length + sim.runners.length);
  });

  it('bascule jour/nuit des gouttes en fondu : les sprites du crépuscule diffèrent de ceux du jour et de la nuit', () => {
    const sim = createGlassSim(PANES, 11, GLASS_BUDGET_PHONE);
    prefillGlass(sim, genv);
    const field = makeLightField(LIGHTS, SKY_NIGHT, 460);
    const fog = createFogMask(PANES);
    const madeAt = (daylight: number): number => { const b = created; drawGlass(asCtx(fakeCtx()), sim, { precip: 0.85, daylight }, field, fog); return created - b; };
    expect(madeAt(1)).toBeGreaterThan(0); // jour
    expect(madeAt(1)).toBe(0); // réemploi
    expect(madeAt(0)).toBeGreaterThan(0); // nuit
    expect(madeAt(0.5)).toBeGreaterThan(0); // crépuscule : un rendu intermédiaire, pas l'un des deux
    expect(madeAt(0.5)).toBe(0);
  });

  it('la buée effacée repousse (masque sur 8 bits : pas de repousse perdue dans l’arrondi)', () => {
    // Faux masque d'un pixel, arrondi sur 8 bits comme un vrai canvas : `source-over` (a + d(1 − a)), `lighter` (addition),
    // `destination-out` (le trait de la coulure efface le pixel).
    type PixelCtx = FakeCtx & { px: number; globalCompositeOperation: string };
    const made: PixelCtx[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      const c = fakeCtx() as PixelCtx;
      c.px = 0;
      const alphaOf = (s: unknown): number => { const m = /rgba\([^)]*,\s*([\d.]+)\)/.exec(String(s)); return m ? Number(m[1]) : 1; };
      Object.assign(c, {
        fillRect: () => {
          const a = Math.round(alphaOf(c.fillStyle) * 255);
          if (c.globalCompositeOperation === 'lighter') c.px = Math.min(255, c.px + a);
          else if (c.globalCompositeOperation === 'source-over') c.px = Math.round(a + c.px * (1 - a / 255));
        },
        stroke: () => { if (c.globalCompositeOperation === 'destination-out') c.px = 0; },
      });
      made.push(c);
      return c as never;
    });
    const pane = { x: 0, y: 0, w: 40, h: 40 };
    const fog = createFogMask([pane]);
    const mask = made[0]!; // masque créé en premier, puis le calque de buée
    expect(mask.px).toBe(255); // buée pleine au départ
    fog.erase([{ x: 10, y: 10, r: 3 }, { x: 10, y: 14, r: 3 }, { x: 10, y: 18, r: 3 }]);
    expect(mask.px).toBe(0);
    for (let i = 0; i < 20 * 30; i++) fog.regrow(1 / 30);
    // 3 %/s pendant 20 s ≈ 60 % : nettement remontée, pas encore pleine
    expect(mask.px).toBeGreaterThan(0.45 * 255);
    expect(mask.px).toBeLessThan(0.75 * 255);
    for (let i = 0; i < 30 * 30; i++) fog.regrow(1 / 30);
    expect(mask.px).toBe(255); // et revient jusqu'à la buée pleine
  });

  it('pièce sans fenêtre : rien, aucune exception', () => {
    const sim = createGlassSim([], 5, GLASS_BUDGET_PHONE);
    const fog = createFogMask([]);
    const ctx = fakeCtx();
    expect(() => drawGlass(asCtx(ctx), sim, { precip: 0.5, daylight: 1 }, makeLightField([], SKY_DAY, 460), fog)).not.toThrow();
    expect(ctx.ops).toHaveLength(0);
  });
});
