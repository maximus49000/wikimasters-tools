import { describe, expect, it } from 'vitest';
import {
  HAUSSMANN,
  MIN_FLOOR,
  facadeInputs,
  facadeLayout,
  podiumLayout,
  roofOutline,
  splitBays,
  type FacadeInput,
  type FacadeLayout,
} from '../../../../src/core/library/city/facade-layout';
import { GROUND_FLOOR, cityMetrics } from '../../../../src/core/library/city/metrics';
import { PODIUM_H, mulberry32 } from '../../../../src/core/library/scene-world';

const ground = cityMetrics(340).ground;
// Tour de jumeaux de 26 px (porte du socle à gauche) et immeuble simple de 64 px de haut (le plus bas possible), à la main.
const handmade: FacadeInput[] = [
  { x: 100, w: 26, h: 72, base: ground - PODIUM_H, span: { x0: 100, x1: 126 }, doorCx: 109.9, podium: true },
  { x: 300, w: 40, h: 64, base: ground - GROUND_FLOOR, span: { x0: 300, x1: 340 }, doorCx: 330, podium: false },
];
const pairs: { input: FacadeInput; l: FacadeLayout }[] = [
  ...Array.from({ length: 20 }, (_, k) => k + 1).flatMap((s) => facadeInputs(1440, 340, s).map((input) => ({ input, l: facadeLayout(input, ground, s) }))),
  ...handmade.map((input) => ({ input, l: facadeLayout(input, ground, 3) })),
];
const layouts = pairs.map((p) => p.l);
const spans = new Map(pairs.map((p) => [p.l, p.input.span]));
const span = (l: FacadeLayout) => spans.get(l)!;

describe('mise en page des façades', () => {
  it('marges égales et aplomb sur la porte', () => {
    for (const l of layouts) {
      expect(Math.abs(l.bays[0]! - span(l).x0 - (span(l).x1 - l.bays.at(-1)!))).toBeLessThanOrEqual(0.1);
      if (l.doorCx !== null) expect(l.bays[l.doorBay!]).toBe(l.doorCx);
      for (const w of l.windows.filter((v) => v.kind !== 'dormer')) expect(w.x + w.w / 2).toBeCloseTo(l.bays[w.bay]!, 9);
    }
  });

  it('étages d’au moins 10 px, fenêtres dans la façade, sans chevauchement (écart ≥ 2 px)', () => {
    for (const l of layouts) {
      for (const lv of l.levels) if (lv.level !== 'mezz') expect(lv.h).toBeGreaterThanOrEqual(MIN_FLOOR);
      const floors = l.windows.filter((w) => w.kind !== 'dormer');
      for (const w of floors) {
        expect(w.x).toBeGreaterThanOrEqual(span(l).x0 + 1);
        expect(w.x + w.w).toBeLessThanOrEqual(span(l).x1 - 1);
        expect(w.y).toBeGreaterThanOrEqual(l.eave - 1e-9);
        expect(w.y + w.h).toBeLessThanOrEqual(l.base + 1e-9);
        expect(w.w).toBeGreaterThanOrEqual(3);
      }
      for (const a of floors) {
        for (const b of floors) {
          if (a === b || a.level !== b.level || a.x > b.x) continue;
          expect(b.x - (a.x + a.w)).toBeGreaterThanOrEqual(2 - 1e-9);
        }
      }
    }
  });

  it('70 à 80 % de haussmanniens', () => {
    const share = layouts.filter((l) => l.kind === 'haussmann').length / layouts.length;
    expect(share).toBeGreaterThanOrEqual(0.7);
    expect(share).toBeLessThanOrEqual(0.8);
    expect(HAUSSMANN.minW).toBeLessThanOrEqual(26);
  });

  it('mansarde : au moins une lucarne habitée, jamais une par travée', () => {
    const mansards = layouts.filter((l) => l.roof.kind === 'mansard');
    expect(mansards.length).toBeGreaterThan(0);
    for (const l of mansards) {
      const bays = l.dormers.filter((d) => d.type !== 'tabatiere').map((d) => d.bay);
      expect(new Set(bays).size).toBe(bays.length);
      expect(bays.length).toBeLessThan(l.bays.length);
      expect(l.windows.filter((w) => w.kind === 'dormer').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('lucarnes et cheminées dans la boîte de l’immeuble', () => {
    for (const l of layouts) {
      for (const d of l.dormers) {
        expect(d.y).toBeGreaterThanOrEqual(l.top - 1e-9);
        expect(d.y + d.h).toBeLessThanOrEqual(l.eave + 1e-9);
      }
      for (const w of l.windows.filter((v) => v.kind === 'dormer')) {
        expect(w.y).toBeGreaterThanOrEqual(l.top - 1e-9);
        expect(w.y + w.h).toBeLessThanOrEqual(l.eave + 1e-9);
      }
      expect(l.chimneys.length).toBeGreaterThanOrEqual(1);
      for (const c of l.chimneys) {
        expect(c.top - 2.3).toBeGreaterThanOrEqual(l.top - 1e-9);
        expect(c.base).toBeGreaterThan(c.top);
        expect(c.base).toBeLessThanOrEqual(l.eave + 1e-9);
      }
    }
  });

  it('fenêtres d’un logement : même seuil, une seule pièce principale', () => {
    for (const l of layouts) {
      const byHome = new Map<number, typeof l.windows>();
      for (const w of l.windows) if (w.home >= 0) byHome.set(w.home, [...(byHome.get(w.home) ?? []), w]);
      expect(byHome.size).toBe(l.homes.length);
      for (const [i, ws] of byHome) {
        const home = l.homes[i]!;
        expect(new Set(ws.map((w) => w.u)).size).toBe(1);
        expect(ws[0]!.u).toBe(home.u);
        expect(ws.filter((w) => w.main)).toHaveLength(1);
        expect(new Set(ws.map((w) => w.key))).toEqual(new Set([home.key]));
        for (const w of ws) expect(w.blue).toBe(w.main && home.tone === 'tv');
      }
      expect(new Set(l.homes.map((h) => h.key)).size).toBe(l.homes.length);
    }
  });

  it('cage d’escalier à l’aplomb de la porte, entresol jamais allumable', () => {
    let stairs = 0;
    let mezz = 0;
    for (const l of layouts) {
      if (l.stairBay !== null) {
        stairs++;
        expect(l.stairBay).toBe(l.doorBay);
      }
      if (l.doorCx === null) expect(l.stairBay).toBeNull();
      for (const w of l.windows) {
        if (w.kind === 'stair') expect(w.bay).toBe(l.stairBay);
        if (w.kind !== 'stair' && w.kind !== 'mezz') continue;
        if (w.kind === 'mezz') mezz++;
        expect(w.home).toBe(-1);
        expect(w.key).toBe(-1);
        expect(w.u).toBe(1);
      }
    }
    expect(stairs).toBeGreaterThan(0);
    expect(mezz).toBeGreaterThan(0);
  });

  it('déterministe', () => {
    const i = facadeInputs(1440, 340, 7)[3]!;
    expect(facadeLayout(i, 238, 7)).toEqual(facadeLayout(i, 238, 7));
  });

  it('contour du toit : mansarde à terrasson, toit simple à faîtage décalé', () => {
    const m = layouts.find((l) => l.roof.kind === 'mansard')!;
    expect(roofOutline(m)).toEqual([[m.x - 1.5, m.eave], [m.x + 2.5, m.top + 4], [m.x + 5, m.top + 0.5], [m.x + m.w - 5, m.top + 0.5], [m.x + m.w - 2.5, m.top + 4], [m.x + m.w + 1.5, m.eave]]);
    const s = layouts.find((l) => l.roof.kind !== 'mansard')!;
    expect(roofOutline(s)).toEqual([[s.x - 2, s.eave], [s.x + 0.42 * s.w, s.top + 0.5], [s.x + s.w + 2, s.eave]]);
  });

  it('splitBays : groupes de 2 ou 3 travées voisines', () => {
    const rng = mulberry32(1);
    expect(splitBays([0, 1], rng)).toEqual([[0, 1]]);
    expect(splitBays([0, 1, 2], rng)).toEqual([[0, 1, 2]]);
    expect(splitBays([0, 1, 2, 3], rng)).toEqual([[0, 1], [2, 3]]);
    for (let k = 0; k < 10; k++) expect(splitBays([0, 1, 2, 3, 4], rng).map((g) => g.length).sort()).toEqual([2, 3]);
  });

  it('socle des jumeaux : une rangée dans la bande du socle, à l’aplomb de sa porte', () => {
    const p = { id: 0, x: 200, w: 70, h: PODIUM_H };
    const pl = podiumLayout(p, ground, 4, 209.9);
    expect(pl.bays[0]).toBe(209.9);
    expect(pl.bays.at(-1)).toBe(260);
    expect(pl).toEqual(podiumLayout(p, ground, 4, 209.9));
    for (const w of pl.windows) {
      expect(w.y).toBeGreaterThanOrEqual(ground - PODIUM_H);
      expect(w.y + w.h).toBeLessThanOrEqual(ground - GROUND_FLOOR);
      expect(w.x + w.w / 2).toBeCloseTo(pl.bays[w.bay]!, 9);
      expect(w.u).toBe(pl.homes[w.home]!.u);
    }
    expect(pl.windows).toHaveLength(pl.bays.length);
  });
});
