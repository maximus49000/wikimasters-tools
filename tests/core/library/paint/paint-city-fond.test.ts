import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityPaintPlan, clearPlanCacheForTests, hillCrestY, HILL_ROWS } from '../../../../src/core/library/paint/city-plan';
import { paintCityTile, TILE, tileCount, tileKey } from '../../../../src/core/library/paint/city-painter';
import { BAND, escapeHit, fondCoverage, isTree, itemBox, itemHitsEscape, treeHitsEscape, houseBouquet, type FondHouse, type FondItem } from '../../../../src/core/library/paint/fond-plan';
import { fondTile, paintVerdure } from '../../../../src/core/library/paint/fond-painter';
import { bedState, fondMoment, foliageOf, leavesOnGround, sweptKey, SUNNY } from '../../../../src/core/library/paint/fond-time';
import { treeOfItem } from '../../../../src/core/library/paint/fond-plan';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

// Fond vivant (PR 2a, maquette docs/superpowers/maquettes/fond-ville/).
const cases = [1, 7, 42].flatMap((seed) => [720, 1440, 2880].map((w) => ({ seed, w })));
const allVerdure = (plan: ReturnType<typeof cityPaintPlan>): FondItem[] => [...plan.fond.crestVerdure, ...plan.fond.rowVerdure.flat(), ...plan.fond.escapes.flatMap((e) => e.verdure)];

describe('fond vivant : plan', () => {
  it('déterministe (plan recalculé, pas seulement mis en cache), et dépend de la graine', () => {
    const a = cityPaintPlan(1440, 340, 7);
    clearPlanCacheForTests();
    const b = cityPaintPlan(1440, 340, 7);
    expect(b).not.toBe(a);
    expect(JSON.stringify(b.fond)).toBe(JSON.stringify(a.fond));
    expect(b.hill).toEqual(a.hill);
    expect(JSON.stringify(cityPaintPlan(1440, 340, 8).fond)).not.toBe(JSON.stringify(a.fond));
  });

  for (const { seed, w } of cases) {
    it(`graine ${seed}, ${w} px : une échappée par bande, loin des bords, mur du fond abaissé et rangs 1-2 écartés`, () => {
      const plan = cityPaintPlan(w, 340, seed);
      const bands = Math.ceil(w / BAND);
      expect(plan.fond.escapes.length).toBeGreaterThanOrEqual(1);
      expect(plan.fond.escapes.length).toBeLessThanOrEqual(bands);
      for (const e of plan.fond.escapes) {
        expect(e.x).toBeGreaterThanOrEqual(e.band * BAND + 40);
        expect(e.x1).toBeLessThanOrEqual(Math.min(w, (e.band + 1) * BAND) - 40);
        expect(e.x1 - e.x).toBeGreaterThanOrEqual(170);
        expect(e.x1 - e.x).toBeLessThanOrEqual(290);
        // Gares, voie, route et escalier dans la scène.
        expect(e.road.length).toBeGreaterThan(20);
        expect(e.funi.y1).toBeLessThan(e.funi.y0);
        // Rangs 1-2 écartés (sauf la maison gardée pour le père Noël, sans bouquet et hors de la route).
        const inside = plan.hill.houses.filter((h) => h.row > 0 && h.x + h.w > e.x + 1 && h.x < e.x1 - 1);
        expect(inside.length).toBeLessThanOrEqual(1);
        for (const h of inside) expect(escapeHit(e, [h.x - 1.5 * h.s, h.top, h.x + h.w + 1.5 * h.s, h.base + 2])).toBe(false);
      }
    });

    it(`graine ${seed}, ${w} px : route, voie, gares et escalier jamais recouverts par la verdure`, () => {
      const plan = cityPaintPlan(w, 340, seed);
      for (const e of plan.fond.escapes) {
        // Peints après la route : arbres de la crête, verdure des rangs, arbres de l'échappée, bouquets des maisons.
        const after = [...plan.fond.crestVerdure.filter(isTree), ...plan.fond.rowVerdure.flat(), ...plan.fond.escapes.flatMap((x) => x.verdure.filter(isTree))];
        for (const v of after) expect(itemHitsEscape(e, v), `${v.kind} @ ${v.x}`).toBe(false);
        for (const h of plan.hill.houses as FondHouse[]) {
          const m = houseBouquet(h);
          if (m) expect(treeHitsEscape(e, m)).toBe(false);
        }
      }
    });

    it(`graine ${seed}, ${w} px : herbe nue ≤ 12 %, aucune zone nue de 12 × 8 px (masque géométrique)`, () => {
      const plan = cityPaintPlan(w, 340, seed);
      const { cover, visible } = fondCoverage(plan.fond, plan.hill.houses as never, { width: w, height: 340, ground: plan.ground, crest: (x) => hillCrestY(plan, x), landmarks: plan.hill.landmarks }, plan.fond.hillTop);
      const W = cover.W;
      const H = cover.H;
      let bare = 0;
      let vis = 0;
      const nu = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        if (!visible.a[i]) continue;
        vis++;
        if (!cover.a[i]) {
          bare++;
          nu[i] = 1;
        }
      }
      expect(bare / vis).toBeLessThanOrEqual(0.12);
      let windows = 0;
      for (let y = 0; y + 8 <= H; y++) for (let x = 0; x + 12 <= W; x++) {
        let all = true;
        for (let a = 0; a < 8 && all; a++) for (let b = 0; b < 12; b++) if (!nu[(y + a) * W + x + b]) { all = false; break; }
        if (all) windows++;
      }
      expect(windows).toBe(0);
    });
  }

  it('les boîtes des éléments englobent tout ce que le peintre touche (été, hiver sous la neige)', () => {
    const plan = cityPaintPlan(1440, 340, 7);
    for (const D of [fondMoment({ y: 2026, m: 7, d: 7 }, 900, SUNNY), fondMoment({ y: 2027, m: 1, d: 20 }, 600, { ...SUNNY, snow: true })]) {
      for (const v of allVerdure(plan)) {
        const ctx = recordingCtx();
        paintVerdure(ctx, v, 0, D, 15);
        const [x0, y0, x1, y1] = itemBox(v);
        const out = ctx.points.filter(([x, y]) => x < x0 - 1e-6 || x > x1 + 1e-6 || y < y0 - 1e-6 || y > y1 + 1e-6);
        expect(out.slice(0, 2), `${v.kind} @ ${v.x}`).toEqual([]);
      }
    }
  });

  it('arbres : le fût et la ramure ne dépendent jamais de la date (365 jours), le feuillage suit le calendrier', () => {
    const plan = cityPaintPlan(1440, 340, 7);
    const trees = allVerdure(plan).filter((v) => treeOfItem(v));
    expect(trees.length).toBeGreaterThan(50);
    const sample = trees.slice(0, 40);
    const boxes = sample.map((v) => JSON.stringify(treeOfItem(v)!.m.trunkBox));
    for (let doy = 0; doy < 365; doy += 7) {
      const D = fondMoment({ y: 2027, m: 1, d: 1 + doy }, 900, SUNNY);
      sample.forEach((v, i) => {
        expect(JSON.stringify(treeOfItem(v)!.m.trunkBox)).toBe(boxes[i]);
        void D;
      });
    }
    const juillet = foliageOf(fondMoment({ y: 2026, m: 7, d: 7 }, 0, SUNNY), 'b-x');
    const fevrier = foliageOf(fondMoment({ y: 2027, m: 2, d: 10 }, 0, SUNNY), 'b-x');
    expect(juillet.d).toBe(1);
    expect(fevrier.d).toBe(0);
  });

  it('crête : rien du fond vivant ne dépasse le haut du fond déclaré (découpe du ciel)', () => {
    const plan = cityPaintPlan(1440, 340, 7);
    for (const v of plan.fond.crestVerdure) {
      const [x0, y0, x1] = itemBox(v);
      if (y0 < hillCrestY(plan, (x0 + x1) / 2)) expect(plan.hill.tops.some(([a, b, y]) => a <= x0 && b >= x1 && y <= y0)).toBe(true);
    }
    expect(plan.hill.houses.every((h) => h.base === 340 * HILL_ROWS[h.row].y)).toBe(true);
  });
});

describe('fond vivant : tranches', () => {
  const plan = cityPaintPlan(1440, 340, 7);
  const at = (m: number, d: number, minutes: number, meteo = SUNNY) => fondMoment({ y: 2026, m, d }, minutes, meteo);

  it('clé : stable dans une tranche de 10 min et tant que les poses ne changent pas', () => {
    for (let t = 0; t < tileCount(1440); t++) {
      expect(tileKey(plan, t, at(7, 8, 15 * 60 + 1))).toBe(tileKey(plan, t, at(7, 8, 15 * 60 + 9)));
    }
    // 3 h 00 → 3 h 30 (nuit d'été) : volets fermés, rien ne bouge.
    for (let t = 0; t < tileCount(1440); t++) expect(tileKey(plan, t, at(7, 8, 180))).toBe(tileKey(plan, t, at(7, 8, 210)));
  });

  it('clé : change avec la date (saison), la neige et les poses de la tranche de 10 min', () => {
    const k = (D: ReturnType<typeof at>): string[] => Array.from({ length: tileCount(1440) }, (_, t) => tileKey(plan, t, D));
    expect(k(at(10, 27, 900))).not.toEqual(k(at(7, 8, 900)));
    expect(k(at(7, 8, 900, { ...SUNNY, snow: true }))).not.toEqual(k(at(7, 8, 900)));
    // Matin : les volets s'ouvrent entre 7 h et 9 h 10 ; au moins une tranche change sur la matinée, et pas toutes à chaque créneau.
    let changes = 0;
    for (let m = 6 * 60; m < 10 * 60; m += 10) {
      const a = k(at(7, 8, m));
      const b = k(at(7, 8, m + 10));
      changes += a.filter((x, i) => x !== b[i]).length;
    }
    expect(changes).toBeGreaterThan(0);
    // Sans instant, la clé ne porte que le dessin (calque de neige posée).
    expect(tileKey(plan, 0)).not.toContain('2026-07-08');
  });

  it('raccord : tout élément à cheval sur le bord de deux tranches est peint par les deux, dans le même ordre', () => {
    for (const seed of [1, 7, 42]) {
      const p = cityPaintPlan(1440, 340, seed);
      for (let t = 0; t + 1 < tileCount(1440); t++) {
        const a = fondTile(p, t * TILE, (t + 1) * TILE);
        const b = fondTile(p, (t + 1) * TILE, (t + 2) * TILE);
        const edge = (t + 1) * TILE;
        const at2 = <T>(l: T[], box: (v: T) => readonly number[]): T[] => l.filter((v) => box(v)[0]! <= edge + 2 && box(v)[1]! >= edge - 2);
        const bx = (v: FondItem): number[] => [itemBox(v)[0], itemBox(v)[2]];
        expect(at2(a.crest, bx)).toEqual(at2(b.crest, bx));
        for (const r of [0, 1] as const) expect(at2(a.rows[r], bx)).toEqual(at2(b.rows[r], bx));
        const ex = (e: (typeof a.escapes)[number]): number[] => e.span;
        expect(at2(a.escapes, ex)).toEqual(at2(b.escapes, ex));
        const hx = (h: { x: number; w: number }): number[] => [h.x, h.x + h.w];
        expect(at2(a.houses, hx)).toEqual(at2(b.houses, hx));
        expect(at2(a.crestHouses, hx)).toEqual(at2(b.crestHouses, hx));
      }
    }
  });

  it('n’utilise jamais Math.random (plan et peinture, été et hiver)', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random interdit');
    });
    clearPlanCacheForTests();
    const p = cityPaintPlan(1080, 340, 11);
    for (let t = 0; t < tileCount(1080); t++) {
      paintCityTile(recordingCtx(), p, t, at(7, 8, 900));
      paintCityTile(recordingCtx(), p, t, fondMoment({ y: 2027, m: 1, d: 20 }, 480, { cloud: 0.85, precip: 0.5, wind: 0.2, snow: true }));
    }
  });
});

describe('calendrier de la rue', () => {
  const doy = (n: number) => ({ doy: n });
  it('parterres : une saison par plage, sol nu entre deux replantations', () => {
    expect(bedState(doy(80)).kind).toBe('spring');
    expect(bedState(doy(80)).shoots).toBeGreaterThan(0);
    expect(bedState(doy(120))).toMatchObject({ kind: 'spring', bloom: 1 });
    expect(bedState(doy(153)).kind).toBe('bare');
    expect(bedState(doy(200)).kind).toBe('summer');
    expect(bedState(doy(281)).kind).toBe('bare');
    expect(bedState(doy(300)).kind).toBe('autumn');
    expect(bedState(doy(337)).kind).toBe('bare');
    expect(bedState(doy(10))).toMatchObject({ kind: 'winter', bloom: 1, faded: 0 });
  });

  it('feuilles mortes : aucune en juillet, il en tombe en novembre, déterministe', () => {
    for (let s = 1; s <= 20; s++) expect(leavesOnGround({ y: 2026, month: 7, day: 10 }, 15, s)).toBe(0);
    const nov = { y: 2026, month: 11, day: 10 };
    expect([...Array(20).keys()].some((i) => leavesOnGround(nov, 18, i + 1) > 0)).toBe(true);
    expect(leavesOnGround(nov, 18, 5)).toBe(leavesOnGround(nov, 18, 5));
  });

  it('balayage à 7 h 30 : des feuilles juste avant, le sol propre juste après', () => {
    let hit: { D: { y: number; month: number; day: number }; s: number } | null = null;
    for (let s = 1; s <= 50 && !hit; s++) {
      for (let d = 5; d <= 25 && !hit; d++) {
        const D = { y: 2026, month: 11, day: d };
        if (sweptKey(D, 7.5, s) === 'b' && leavesOnGround(D, 7.49, s) > 0) hit = { D, s };
      }
    }
    expect(hit).not.toBeNull();
    expect(sweptKey(hit!.D, 7.49, hit!.s)).toBe('');
    expect(leavesOnGround(hit!.D, 7.49, hit!.s)).toBeGreaterThan(0);
    expect(leavesOnGround(hit!.D, 7.51, hit!.s)).toBe(0);
  });

  it('parterres : bornes exactes des plages', () => {
    const kinds = [72, 73, 150, 151, 155, 156, 278, 279, 282, 283, 334, 335, 339, 340].map((n) => bedState({ doy: n }).kind);
    expect(kinds).toEqual(['winter', 'spring', 'spring', 'bare', 'bare', 'summer', 'summer', 'bare', 'bare', 'autumn', 'autumn', 'bare', 'bare', 'winter']);
  });
});
