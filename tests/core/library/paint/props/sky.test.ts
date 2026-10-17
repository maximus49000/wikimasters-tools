import { describe, expect, it } from 'vitest';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import { BALLOON_CYCLE_S, BANNER_CYCLE_S, BELLS_CYCLE_S, DRONE_CYCLE_S, FEST_BALLOONS_CYCLE_S, HELI_CYCLE_S, KITE_CYCLE_S } from '../../../../../src/core/library/paint/props/sky';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { recordingCtx } from '../recording-ctx';
import { touched } from './replay';

type Args = Record<string, string | number | boolean>;
const ARGS: Record<string, Args[]> = {
  plane: [{ far: false }, { far: true }],
  helicopter: [{ c: '#C0463A' }, { c: '#4B5320', roundel: true }],
  drone: [{}],
  balloon: [{ a: '#E0A21E', b: '#C0463A' }, { a: '#3B6FD6', b: '#F2C94C' }],
  'banner-plane': [{ col: '#F2C94C' }],
  kite: [{ c: '#E07A8C' }, { c: '#2E8B6A' }],
  crane: [{ side: 1 }, { side: -1 }],
  'apartment-glow': [{}],
  'fest-balloons': [{ bunny: false }, { bunny: true }],
  bells: [{}],
  'garbage-truck': [{}],
  'delivery-bike': [{ box: '#2A9DAA' }, { box: '#E0A21E' }],
  jet: [{}],
};

const paint = (id: string, a: Args, frame = 0, lit = false, dir: 1 | -1 = 1): ReturnType<typeof recordingCtx> => {
  const c = recordingCtx();
  PROPS[id]!.paint(tintedCtx(c, (s) => s), a, { day: lit ? 0 : 1, lit, dir, frame });
  return c;
};
const pts = (id: string, a: Args, frame = 0, lit = false): [number, number][] => touched(paint(id, a, frame, lit).ops);
// Passages par glowing() (parties lumineuses, non teintes).
const glows = (id: string, a: Args, lit: boolean, frame = 0): number => {
  const t = tintedCtx(recordingCtx(), (c) => c);
  let n = 0;
  const g = t.glowing;
  t.glowing = (fn) => { n++; g(fn); };
  PROPS[id]!.paint(t, a, { day: 0, lit, dir: 1, frame });
  return n;
};

// Dans le cadre du peintre (à 1 u près) pour chaque pose déclarée, allumé ou non, et déterministe.
function inFrame(id: string, a: Args): void {
  const [x, y, w, h] = PROPS[id]!.box(a);
  const n = PROPS[id]!.frames ?? 1;
  for (let frame = 0; frame < n; frame++) {
    for (const lit of [false, true]) {
      const c1 = paint(id, a, frame, lit);
      expect(c1.ops.length).toBeGreaterThan(0);
      expect(c1.ops).toEqual(paint(id, a, frame, lit).ops);
      const p = touched(c1.ops);
      expect(p.length).toBeGreaterThan(0);
      for (const [px, py] of p) {
        expect(px, `${id} ${JSON.stringify(a)} x (pose ${frame})`).toBeGreaterThanOrEqual(x - 1); expect(px, `${id} x (pose ${frame})`).toBeLessThanOrEqual(x + w + 1);
        expect(py, `${id} ${JSON.stringify(a)} y (pose ${frame})`).toBeGreaterThanOrEqual(y - 1); expect(py, `${id} y (pose ${frame})`).toBeLessThanOrEqual(y + h + 1);
      }
    }
  }
}
// Poses distinctes deux à deux (une animation à poses clés change à chaque pose).
const allDistinct = (id: string, a: Args): boolean => {
  const n = PROPS[id]!.frames ?? 1;
  const seen = new Set<string>();
  for (let f = 0; f < n; f++) seen.add(JSON.stringify(paint(id, a, f).ops));
  return seen.size === n;
};

describe('Engins du ciel et événements de rue cellulo (avion, hélicoptère, drone, montgolfière, banderole, cerf-volant, grue, appartement, ballons, cloches, camion-poubelle, vélo de livraison, Patrouille)', () => {
  for (const [id, list] of Object.entries(ARGS)) {
    it(`${id} : déclaré, dans son cadre à chaque pose et déterministe`, () => {
      expect(PROPS[id]).toBeDefined();
      for (const a of list) inFrame(id, a);
    });
  }
  it('poses : hélicoptère 8, drone 4, montgolfière 8, banderole 8, cerf-volant 8, ballons 8, cloches 8 ; les autres fixes', () => {
    expect(PROPS.helicopter!.frames).toBe(8);
    expect(PROPS.drone!.frames).toBe(4);
    expect(PROPS.balloon!.frames).toBe(8);
    expect(PROPS['banner-plane']!.frames).toBe(8);
    expect(PROPS.kite!.frames).toBe(8);
    expect(PROPS['fest-balloons']!.frames).toBe(8);
    expect(PROPS.bells!.frames).toBe(8);
    for (const id of ['plane', 'crane', 'apartment-glow', 'garbage-truck', 'delivery-bike', 'jet']) expect(PROPS[id]!.frames ?? 1).toBe(1);
    for (const id of ['helicopter', 'drone', 'balloon', 'banner-plane', 'kite', 'fest-balloons', 'bells']) expect(allDistinct(id, ARGS[id]![0]!), id).toBe(true);
    for (const s of [HELI_CYCLE_S, DRONE_CYCLE_S, BALLOON_CYCLE_S, BANNER_CYCLE_S, KITE_CYCLE_S, FEST_BALLOONS_CYCLE_S, BELLS_CYCLE_S]) expect(s).toBeGreaterThan(0);
    expect(BELLS_CYCLE_S).toBe(1.6);
    expect(BALLOON_CYCLE_S).toBe(4);
  });
  it('avion : cadre du sprite classique (fuselage −20..18, aile vers le bas, dérive) ; lointain plus pâle ; feux la nuit dans glowing', () => {
    const p = pts('plane', { far: false });
    const xs = p.map(([x]) => x);
    const ys = p.map(([, y]) => y);
    expect(Math.min(...xs)).toBeLessThan(-18);
    expect(Math.max(...xs)).toBeGreaterThan(17);
    expect(Math.max(...ys)).toBeGreaterThan(9);
    expect(Math.min(...ys)).toBeLessThan(-7);
    expect(paint('plane', { far: true }).fills).not.toEqual(paint('plane', { far: false }).fills);
    expect(glows('plane', { far: false }, false)).toBe(0);
    expect(glows('plane', { far: false }, true)).toBeGreaterThan(0);
  });
  it('hélicoptère : cabine 13 × 7, poutre jusqu’à −30, rotor à −10 ; balise et projecteur la nuit dans glowing ; cocarde en option', () => {
    const p = pts('helicopter', { c: '#C0463A' });
    const xs = p.map(([x]) => x);
    const ys = p.map(([, y]) => y);
    expect(Math.min(...xs)).toBeLessThan(-28);
    expect(Math.max(...xs)).toBeGreaterThan(20);
    expect(Math.min(...ys)).toBeLessThan(-9);
    expect(glows('helicopter', { c: '#C0463A' }, false)).toBe(0);
    expect(glows('helicopter', { c: '#C0463A' }, true)).toBeGreaterThan(0);
    // Projecteur : dégradé la nuit seulement.
    expect(paint('helicopter', { c: '#C0463A' }, 0, true).ops.some((o) => o.op === 'gradient')).toBe(true);
    expect(paint('helicopter', { c: '#C0463A' }).ops.some((o) => o.op === 'gradient')).toBe(false);
    expect(paint('helicopter', { c: '#4B5320', roundel: true }).ops.length).toBeGreaterThan(paint('helicopter', { c: '#4B5320' }).ops.length);
  });
  it('drone : corps 10 × 4, bras ±10 ; LED verte la nuit (glowing)', () => {
    const xs = pts('drone', {}).map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThan(-14);
    expect(Math.max(...xs)).toBeGreaterThan(14);
    expect(glows('drone', {}, true)).toBeGreaterThan(0);
    expect(glows('drone', {}, false)).toBe(0);
  });
  it('montgolfière : enveloppe −16..16 × −36..8, nacelle jusqu’à 21 ; brûleur à la pose 0 ; lueur interne la nuit à la bouffée seulement', () => {
    const p = pts('balloon', { a: '#E0A21E', b: '#C0463A' });
    const ys = p.map(([, y]) => y);
    expect(Math.min(...ys)).toBeLessThan(-34);
    expect(Math.max(...ys)).toBeGreaterThan(20);
    expect(glows('balloon', { a: '#E0A21E', b: '#C0463A' }, true, 0)).toBeGreaterThan(0);
    expect(glows('balloon', { a: '#E0A21E', b: '#C0463A' }, true, 4)).toBe(0);
    expect(glows('balloon', { a: '#E0A21E', b: '#C0463A' }, false, 0)).toBe(0);
    expect(paint('balloon', { a: '#E0A21E', b: '#C0463A' }).fills).not.toEqual(paint('balloon', { a: '#3B6FD6', b: '#F2C94C' }).fills);
  });
  it('banderole : avion −12..12, banderole jusqu’à −104, « Wikimasters » peint à dir 1 et −1', () => {
    const xs = pts('banner-plane', { col: '#F2C94C' }).map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThan(-100);
    expect(Math.max(...xs)).toBeGreaterThan(11);
    expect(paint('banner-plane', { col: '#F2C94C' }).texts).toContain('Wikimasters');
    expect(paint('banner-plane', { col: '#F2C94C' }, 0, false, -1).texts).toContain('Wikimasters');
  });
  it('cerf-volant : losange autour de l’origine, ficelle jusque vers (−40, 150), couleur de l’argument', () => {
    const p = pts('kite', { c: '#E07A8C' });
    expect(Math.max(...p.map(([, y]) => y))).toBeGreaterThan(140);
    expect(Math.min(...p.map(([x]) => x))).toBeLessThan(-36);
    expect(paint('kite', { c: '#E07A8C' }).fills).toContain('#E07A8C');
  });
  it('grue : mât 0..−200, flèche −30..70 côté `side`, cadre retourné pour side = −1 (sans miroir du dessin)', () => {
    const r = pts('crane', { side: 1 });
    const l = pts('crane', { side: -1 });
    expect(Math.min(...r.map(([, y]) => y))).toBeLessThan(-205);
    expect(Math.max(...r.map(([x]) => x))).toBeGreaterThan(65);
    expect(Math.min(...l.map(([x]) => x))).toBeLessThan(-65);
    const [bx, , bw] = PROPS.crane!.box({ side: -1 });
    expect(bx + bw).toBeLessThan(40);
    expect(paint('crane', { side: -1 }).ops.some((o) => o.op === 'scale' && o.args[0] === -1)).toBe(false);
  });
  it('lueur d’appartement : fenêtre 0..5 × 0..7 et auréole, toujours lumineuse (glowing)', () => {
    const p = pts('apartment-glow', {});
    expect(Math.min(...p.map(([x]) => x))).toBeLessThan(-2);
    expect(Math.max(...p.map(([, y]) => y))).toBeGreaterThan(9);
    expect(glows('apartment-glow', {}, false)).toBeGreaterThan(0);
  });
  it('ballons de fête : trois ballons à ±14, nœud à 34 ; lapins ≠ cœurs ; cloches ±11 sous le ruban', () => {
    const b = pts('fest-balloons', { bunny: false });
    expect(Math.min(...b.map(([x]) => x))).toBeLessThan(-20);
    expect(Math.max(...b.map(([x]) => x))).toBeGreaterThan(20);
    expect(Math.max(...b.map(([, y]) => y))).toBeGreaterThanOrEqual(33);
    expect(paint('fest-balloons', { bunny: true }).ops).not.toEqual(paint('fest-balloons', { bunny: false }).ops);
    const c = pts('bells', {});
    expect(Math.min(...c.map(([x]) => x))).toBeLessThan(-15);
    expect(Math.max(...c.map(([, y]) => y))).toBeGreaterThan(9);
    expect(Math.min(...c.map(([, y]) => y))).toBeLessThan(-15);
  });
  it('camion-poubelle : benne −30..10, cabine jusqu’à 26, roues au sol ; phare la nuit dans glowing', () => {
    const p = pts('garbage-truck', {});
    expect(Math.min(...p.map(([x]) => x))).toBeLessThan(-32);
    expect(Math.max(...p.map(([x]) => x))).toBeGreaterThan(25);
    expect(Math.min(...p.map(([, y]) => y))).toBeLessThan(-30);
    expect(glows('garbage-truck', {}, true)).toBeGreaterThan(0);
    expect(glows('garbage-truck', {}, false)).toBe(0);
  });
  it('vélo de livraison : roues ±7, caisse −13..−1 × −34..−23 à la couleur donnée, logo « W », pas de livreur peint', () => {
    const c = paint('delivery-bike', { box: '#2A9DAA' });
    const p = touched(c.ops);
    expect(Math.min(...p.map(([, y]) => y))).toBeLessThan(-32);
    expect(Math.max(...p.map(([x]) => x))).toBeGreaterThan(11);
    expect(c.texts).toContain('W');
    expect(c.fills).toContain('#2A9DAA');
    expect(paint('delivery-bike', { box: '#E0A21E' }).fills).toContain('#E0A21E');
    expect(PROPS['delivery-bike']!.box({})[1]).toBeGreaterThan(-40);
  });
  it('Patrouille : petit avion −5..8 bleu-blanc-rouge dans son cadre', () => {
    const c = paint('jet', {});
    const xs = touched(c.ops).map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThan(-4);
    expect(Math.max(...xs)).toBeGreaterThan(7);
    expect(c.fills.some((f) => f === '#2B4FA0')).toBe(true);
    expect(c.fills.some((f) => f === '#C0302B')).toBe(true);
  });
});
