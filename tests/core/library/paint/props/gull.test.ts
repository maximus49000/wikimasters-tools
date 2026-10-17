import { describe, expect, it } from 'vitest';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import { GULL_FLAP_HZ, GULL_FLAP_PERIOD_S, gullWing } from '../../../../../src/core/library/paint/props/gull';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { recordingCtx } from '../recording-ctx';
import { touched } from './replay';

type Args = Record<string, string | number | boolean>;
const WINGS = ['flap', 'glide', 'turn', 'perched'] as const;

const paint = (a: Args, frame = 0, lit = false, dir: 1 | -1 = 1): ReturnType<typeof recordingCtx> => {
  const c = recordingCtx();
  PROPS.gull!.paint(tintedCtx(c, (s) => s), a, { day: lit ? 0 : 1, lit, dir, frame });
  return c;
};
const pts = (a: Args, frame = 0): [number, number][] => touched(paint(a, frame).ops);
const ys = (p: [number, number][]): number[] => p.map(([, y]) => y);
const xs = (p: [number, number][]): number[] => p.map(([x]) => x);

// Dans le cadre du peintre (à 1 u près) pour chaque pose déclarée, allumé ou non, et déterministe.
function inFrame(a: Args): void {
  const [x, y, w, h] = PROPS.gull!.box(a);
  const n = PROPS.gull!.frames ?? 1;
  for (let frame = 0; frame < n; frame++) {
    for (const lit of [false, true]) {
      const c1 = paint(a, frame, lit);
      expect(c1.ops.length).toBeGreaterThan(0);
      expect(c1.ops).toEqual(paint(a, frame, lit).ops);
      const p = touched(c1.ops);
      expect(p.length).toBeGreaterThan(0);
      for (const [px, py] of p) {
        expect(px, `${JSON.stringify(a)} x (pose ${frame})`).toBeGreaterThanOrEqual(x - 1); expect(px, `x (pose ${frame})`).toBeLessThanOrEqual(x + w + 1);
        expect(py, `${JSON.stringify(a)} y (pose ${frame})`).toBeGreaterThanOrEqual(y - 1); expect(py, `y (pose ${frame})`).toBeLessThanOrEqual(y + h + 1);
      }
    }
  }
}

describe('Mouette cellulo (battement 8 poses, plané, virage, posé)', () => {
  it('déclarée dans PROPS, 8 poses, dans son cadre à chaque pose et déterministe pour chaque aile', () => {
    expect(PROPS.gull).toBeDefined();
    expect(PROPS.gull!.frames).toBe(8);
    for (const wing of WINGS) inFrame({ wing });
    // Argument absent ou inconnu : battement.
    expect(gullWing({})).toBe('flap');
    expect(gullWing({ wing: 'n’importe' })).toBe('flap');
    expect(paint({}).ops).toEqual(paint({ wing: 'flap' }).ops);
  });
  it('battement : 8 poses distinctes deux à deux ; pose 0 ailes à plat, pose 2 ailes basses, pose 6 ailes hautes', () => {
    const seen = new Set<string>();
    for (let f = 0; f < 8; f++) seen.add(JSON.stringify(paint({ wing: 'flap' }, f).ops));
    expect(seen.size).toBe(8);
    const low = Math.max(...ys(pts({ wing: 'flap' }, 2)));
    const high = Math.min(...ys(pts({ wing: 'flap' }, 6)));
    const mid = pts({ wing: 'flap' }, 0);
    // Bouts d'aile à ±3,6 (maquette), bout noir à −0,9 au-dessus, corps décalé de ∓0,6 en sens inverse.
    expect(low).toBeGreaterThan(3);
    expect(high).toBeLessThan(-3.5);
    expect(Math.max(...ys(mid))).toBeLessThan(low);
    expect(Math.min(...ys(mid))).toBeGreaterThan(high);
  });
  it('plané, virage et posé : fixes (même dessin à chaque pose), différents entre eux et du battement', () => {
    for (const wing of ['glide', 'turn', 'perched'] as const) {
      const ref = JSON.stringify(paint({ wing }).ops);
      for (let f = 1; f < 8; f++) expect(JSON.stringify(paint({ wing }, f).ops), wing).toBe(ref);
      for (let f = 0; f < 8; f++) expect(JSON.stringify(paint({ wing: 'flap' }, f).ops)).not.toBe(ref);
    }
    expect(paint({ wing: 'glide' }).ops).not.toEqual(paint({ wing: 'turn' }).ops);
    expect(paint({ wing: 'glide' }).ops).not.toEqual(paint({ wing: 'perched' }).ops);
    expect(paint({ wing: 'turn' }).ops).not.toEqual(paint({ wing: 'perched' }).ops);
    // Plané : envergure complète (±7 u), ailes légèrement relevées ; virage : aile du côté du virage raccourcie ; posé : ailes
    // repliées vers le bas, envergure réduite.
    const glide = pts({ wing: 'glide' });
    expect(Math.min(...xs(glide))).toBeLessThan(-6.5);
    expect(Math.max(...xs(glide))).toBeGreaterThan(6.5);
    expect(Math.min(...ys(glide))).toBeLessThan(-2);
    const turn = pts({ wing: 'turn' });
    expect(Math.max(...xs(turn)) - Math.min(...xs(turn))).toBeLessThan(Math.max(...xs(glide)) - Math.min(...xs(glide)));
    const perched = pts({ wing: 'perched' });
    expect(Math.max(...xs(perched)) - Math.min(...xs(perched))).toBeLessThan(Math.max(...xs(glide)) - Math.min(...xs(glide)) - 2);
    expect(Math.max(...ys(perched))).toBeGreaterThan(2);
  });
  it('corps 5,2 × 2 blanc à dos gris, tête, bec jaune, œil ; aucune partie lumineuse ; dir −1 sans miroir du dessin', () => {
    const c = paint({ wing: 'glide' });
    expect(c.fills).toContain('#F8F8F4');
    expect(c.fills).toContain('#B8BEC8');
    expect(c.fills).toContain('#E8B030');
    expect(c.fills).toContain('#1E1A18');
    expect(c.fills).toContain('#3A3E48');
    const t = tintedCtx(recordingCtx(), (s) => s);
    let glows = 0;
    const g = t.glowing;
    t.glowing = (fn) => { glows++; g(fn); };
    PROPS.gull!.paint(t, { wing: 'flap' }, { day: 0, lit: true, dir: 1, frame: 3 });
    expect(glows).toBe(0);
    expect(paint({ wing: 'flap' }, 0, false, -1).ops.some((o) => o.op === 'scale' && o.args[0] === -1)).toBe(false);
    expect(paint({ wing: 'flap' }, 0, false, -1).ops.length).toBe(paint({ wing: 'flap' }).ops.length);
  });
  it('rythme : 3,3 battements par seconde (période ≈ 0,303 s)', () => {
    expect(GULL_FLAP_HZ).toBe(3.3);
    expect(GULL_FLAP_PERIOD_S).toBeCloseTo(1 / 3.3, 6);
  });
});
