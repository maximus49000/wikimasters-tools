import { describe, expect, it } from 'vitest';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import { HORSE_CYCLE_S, INSTRUMENT_CYCLE_S } from '../../../../../src/core/library/paint/props/parade';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { recordingCtx } from '../recording-ctx';
import { touched } from './replay';

type Args = Record<string, string | number | boolean>;
const HEADS = ['kepi', 'beret', 'shako', 'bachi', 'plume', 'bicorne', 'crested', 'calot'] as const;
const KINDS = ['tuba', 'trumpet', 'bass-drum', 'snare', 'bugle', 'baton'] as const;
const ARGS: Record<string, Args[]> = {
  horse: [{ coat: '#6B3F22' }, { coat: '#3A2416' }],
  'parade-flag': [{ w: 27, h: 18, pole: 51 }, { w: 7, h: 4.6 }, { w: 6, h: 4, still: true }],
  instrument: KINDS.map((kind) => ({ kind })),
  rifle: [{}, { tunic: '#1F2A4A', arm: true }],
  headgear: HEADS.map((kind) => ({ kind, cap: '#1F2A4A', capTop: '#C0302B' })),
  'crowd-prop': [{ kind: 'flag' }, { kind: 'flag', still: true }, { kind: 'phone' }],
};

const paint = (id: string, a: Args, frame = 0, lit = false): ReturnType<typeof recordingCtx> => {
  const c = recordingCtx();
  PROPS[id]!.paint(tintedCtx(c, (s) => s), a, { day: 1, lit, dir: 1, frame });
  return c;
};
const pts = (id: string, a: Args, frame = 0): [number, number][] => touched(paint(id, a, frame).ops);

// Dans le cadre du peintre (à 1 u près) pour chaque pose déclarée, et déterministe.
function inFrame(id: string, a: Args): void {
  const [x, y, w, h] = PROPS[id]!.box(a);
  const n = PROPS[id]!.frames ?? 1;
  for (let frame = 0; frame < n; frame++) {
    const c1 = paint(id, a, frame);
    expect(c1.ops.length).toBeGreaterThan(0);
    expect(c1.ops).toEqual(paint(id, a, frame).ops);
    const p = touched(c1.ops);
    expect(p.length).toBeGreaterThan(0);
    for (const [px, py] of p) {
      expect(px, `${id} ${JSON.stringify(a)} x (pose ${frame})`).toBeGreaterThanOrEqual(x - 1); expect(px, `${id} x (pose ${frame})`).toBeLessThanOrEqual(x + w + 1);
      expect(py, `${id} ${JSON.stringify(a)} y (pose ${frame})`).toBeGreaterThanOrEqual(y - 1); expect(py, `${id} y (pose ${frame})`).toBeLessThanOrEqual(y + h + 1);
    }
  }
}
// Passages par glowing() (rien n'est lumineux dans le cortège).
const glows = (id: string, a: Args): number => {
  const t = tintedCtx(recordingCtx(), (c) => c);
  let n = 0;
  const g = t.glowing;
  t.glowing = (fn) => { n++; g(fn); };
  PROPS[id]!.paint(t, a, { day: 0, lit: true, dir: 1, frame: 2 });
  return n;
};

describe('14 juillet cellulo (cheval, drapeau de parade, instruments, fusil, coiffes, accessoires des spectateurs)', () => {
  for (const [id, list] of Object.entries(ARGS)) {
    it(`${id} : dans son cadre et déterministe, à chaque pose`, () => {
      for (const a of list) inFrame(id, a);
    });
  }
  it('cheval : 8 poses sur le cycle de 1,2 s ; les sabots des poses 0 et 4 ne sont pas aux mêmes x ; tout le cheval au-dessus du sol (y ≤ 0,5)', () => {
    expect(PROPS.horse!.frames).toBe(8);
    expect(HORSE_CYCLE_S).toBe(1.2);
    const a = { coat: '#6B3F22' };
    // Sabots : points les plus bas de chaque pose (y > −2,5).
    const hooves = (frame: number): number[] => pts('horse', a, frame).filter(([, y]) => y > -2.5).map(([x]) => Math.round(x * 100) / 100).sort((p, q) => p - q);
    expect(hooves(0).length).toBeGreaterThan(0);
    expect(hooves(0)).not.toEqual(hooves(4));
    for (let frame = 0; frame < 8; frame++) for (const [, y] of pts('horse', a, frame)) expect(y, `pose ${frame}`).toBeLessThanOrEqual(0.5);
    // La robe change le dessin, pas la géométrie.
    expect(paint('horse', a).fills).not.toEqual(paint('horse', { coat: '#3A2416' }).fills);
    expect(paint('horse', a).points).toEqual(paint('horse', { coat: '#3A2416' }).points);
    // Le cavalier n'est pas peint : le dessin tient sous la selle (rien au-dessus des oreilles, y < −39).
    expect(pts('horse', a).every(([, y]) => y > -39)).toBe(true);
  });
  it('drapeau de parade : tissu vers −x depuis la hampe à x = 0, 8 poses qui diffèrent ; `pole` ajoute la hampe et sa pointe ; `still` : tissu plat identique à toutes les poses', () => {
    expect(PROPS['parade-flag']!.frames).toBe(8);
    const cloth = pts('parade-flag', { w: 27, h: 18 });
    expect(Math.min(...cloth.map(([x]) => x))).toBeLessThan(-26);
    expect(Math.max(...cloth.map(([x]) => x))).toBeLessThan(1);
    expect(paint('parade-flag', { w: 27, h: 18 }, 0).points).not.toEqual(paint('parade-flag', { w: 27, h: 18 }, 3).points);
    const withPole = pts('parade-flag', { w: 27, h: 18, pole: 51 });
    expect(Math.max(...withPole.map(([, y]) => y))).toBeGreaterThanOrEqual(51);
    expect(PROPS['parade-flag']!.box({ w: 27, h: 18, pole: 51 })[3]).toBeGreaterThan(PROPS['parade-flag']!.box({ w: 27, h: 18 })[3]);
    expect(paint('parade-flag', { w: 6, h: 4, still: true }, 0).ops).toEqual(paint('parade-flag', { w: 6, h: 4, still: true }, 5).ops);
    expect(paint('parade-flag', { w: 6, h: 4, still: true }, 0).points).not.toEqual(paint('parade-flag', { w: 6, h: 4 }, 0).points);
  });
  it('instruments : grosse caisse (1 s), caisse claire (0,5 s) et canne (2 s) battent sur 8 poses ; cuivres immobiles ; le bras n’est peint que sur demande', () => {
    expect(PROPS.instrument!.frames).toBe(8);
    expect(INSTRUMENT_CYCLE_S).toEqual({ 'bass-drum': 1, snare: 0.5, baton: 2 });
    for (const kind of ['bass-drum', 'snare', 'baton']) expect(pts('instrument', { kind }, 0), kind).not.toEqual(pts('instrument', { kind }, 4));
    for (const kind of ['tuba', 'trumpet', 'bugle']) expect(paint('instrument', { kind }, 0).ops, kind).toEqual(paint('instrument', { kind }, 4).ops);
    expect(paint('instrument', { kind: 'tuba', tunic: '#1F2A4A', arm: true }).ops.length).toBeGreaterThan(paint('instrument', { kind: 'tuba' }).ops.length);
    inFrame('instrument', { kind: 'bass-drum', tunic: '#1F2A4A', arm: true });
    inFrame('instrument', { kind: 'baton', tunic: '#1F2A4A', arm: true });
    // Le cadre suit l'instrument : la canne monte plus haut que la caisse claire.
    expect(PROPS.instrument!.box({ kind: 'baton' })[1]).toBeLessThan(PROPS.instrument!.box({ kind: 'snare' })[1]);
  });
  it('fusil : canon de (4, −19) à (−5, −46) au-dessus de l’épaule ; coiffes : chacune autour de la tête (−33), le plumet du shako monte à −55', () => {
    const r = pts('rifle', {});
    expect(r.some(([x, y]) => x < -4.5 && y < -45)).toBe(true);
    expect(r.every(([, y]) => y > -47.5 && y < -16)).toBe(true);
    for (const kind of HEADS) {
      const p = pts('headgear', { kind, cap: '#1F2A4A' });
      expect(p.every(([, y]) => y <= -31), kind).toBe(true);
      expect(Math.max(...p.map(([, y]) => y)), kind).toBeGreaterThan(-45);
    }
    expect(Math.min(...pts('headgear', { kind: 'shako', cap: '#1C1C22' }).map(([, y]) => y))).toBeLessThanOrEqual(-54.5);
    expect(Math.min(...pts('headgear', { kind: 'calot', cap: '#1C1C22' }).map(([, y]) => y))).toBeGreaterThan(-41);
    // Couleur de la coiffe et du bandeau tirées des arguments.
    expect(paint('headgear', { kind: 'kepi', cap: '#FFFFFF', capTop: '#FFFFFF' }).fills).toContain('#FFFFFF');
    expect(paint('headgear', { kind: 'kepi', cap: '#FFFFFF' }).fills).not.toEqual(paint('headgear', { kind: 'kepi', cap: '#1F2A4A' }).fills);
  });
  it('accessoires des spectateurs (repère de la main) : drapeau sur sa hampe au-dessus de la main, qui ondule sur 8 poses ; téléphone immobile', () => {
    expect(PROPS['crowd-prop']!.frames).toBe(8);
    const flag = pts('crowd-prop', { kind: 'flag' });
    expect(flag.some(([x, y]) => x > 5 && y < -10)).toBe(true);
    expect(paint('crowd-prop', { kind: 'flag' }, 0).points).not.toEqual(paint('crowd-prop', { kind: 'flag' }, 3).points);
    expect(paint('crowd-prop', { kind: 'phone' }, 0).ops).toEqual(paint('crowd-prop', { kind: 'phone' }, 3).ops);
    expect(paint('crowd-prop', { kind: 'flag', still: true }, 0).ops).toEqual(paint('crowd-prop', { kind: 'flag', still: true }, 3).ops);
    expect(pts('crowd-prop', { kind: 'phone' }).every(([x, y]) => Math.abs(x) < 3 && y < 0.5)).toBe(true);
  });
  it('rien de lumineux : glowing jamais appelé, même allumé', () => {
    for (const [id, list] of Object.entries(ARGS)) expect(glows(id, list[0]!), id).toBe(0);
  });
});
