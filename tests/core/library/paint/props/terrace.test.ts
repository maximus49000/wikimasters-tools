import { describe, expect, it } from 'vitest';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import '../../../../../src/core/library/paint/props/terrace';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { paintProp, type PropSpec, type PropSurface } from '../../../../../src/content/prop/prop-host';
import { ACCESSORY_KINDS } from '../../../../../src/content/shop-gesture-sprites';
import { recordingCtx, type RecordingCtx } from '../recording-ctx';

const ARGS: Record<string, Record<string, string | number | boolean>> = {
  table: {},
  chair: {},
  parasol: { hue: '#C0302B' },
  apron: {},
  'cordon-post': {},
  'carried-sign': { w: 24, sign: '#2F7D64', ink: '#F6F3EC', name: 'Boulangerie' },
  'carried-placard': { w: 14 },
  'for-sale': { w: 20 },
  ladder: { h: 30 },
};

// Faux canvas : contexte enregistreur (+ setTransform/clearRect ignorés), comme tests/content/prop-host.test.tsx.
function fakeSurface(): { ctx: RecordingCtx; surf: PropSurface } {
  const ctx = Object.assign(recordingCtx(), { setTransform: () => undefined, clearRect: () => undefined });
  return { ctx, surf: { canvas: { width: 0, height: 0, toDataURL: () => 'data:image/png;base64,' }, ctx } };
}

function inFrame(id: string, a: Record<string, string | number | boolean>): void {
  const p = PROPS[id]!;
  const [x, y, w, h] = p.box(a);
  const c1 = recordingCtx();
  const c2 = recordingCtx();
  p.paint(tintedCtx(c1, (c) => c), a, { day: 1, lit: false, dir: 1, frame: 0 });
  p.paint(tintedCtx(c2, (c) => c), a, { day: 1, lit: false, dir: 1, frame: 0 });
  expect(c1.ops.length).toBeGreaterThan(0);
  expect(c1.ops).toEqual(c2.ops);
  for (const [px, py] of c1.points) {
    expect(px).toBeGreaterThanOrEqual(x - 1); expect(px).toBeLessThanOrEqual(x + w + 1);
    expect(py).toBeGreaterThanOrEqual(y - 1); expect(py).toBeLessThanOrEqual(y + h + 1);
  }
}

describe('mobilier des commerces cellulo', () => {
  for (const [id, a] of Object.entries(ARGS)) {
    it(`${id} : dans son cadre et déterministe`, () => inFrame(id, a));
  }
  it('accessoires tenus : les 32 ids, chacun dans son cadre et déterministe', () => {
    expect(ACCESSORY_KINDS.length).toBe(32);
    for (const kind of ACCESSORY_KINDS) inFrame('accessory', { kind });
  });
  it('enseigne et écriteau portés : le texte est écrit', () => {
    const c = recordingCtx();
    PROPS['carried-sign']!.paint(tintedCtx(c, (s) => s), ARGS['carried-sign']!, { day: 1, lit: false, dir: 1, frame: 0 });
    expect(c.texts).toEqual(['Boulangerie']);
    const d = recordingCtx();
    PROPS['carried-placard']!.paint(tintedCtx(d, (s) => s), { w: 14 }, { day: 1, lit: false, dir: 1, frame: 0 });
    expect(d.texts).toEqual(['À VENDRE']);
  });
  it('chaise : l’autre côté passe par dir (canvas retourné par l’hôte), l’ombre de l’assise reste à droite du monde', () => {
    // Le peintre dessine toujours vers +x : à −1 l'hôte retourne le canvas et le kit place ses ombres à gauche du repère local.
    const seatShadow = (dir: 1 | -1): { ops: RecordingCtx['ops']; world: number } => {
      const { surf, ctx } = fakeSurface();
      paintProp({ id: 'chair', day: 1, dir } as PropSpec, surf);
      const sx = ctx.ops.find((o) => o.op === 'scale')!.args[0]!;
      expect(sx).toBe(dir);
      // Première bande d'ombre d'une forme `cel` (fillRect après un clip) : celle de l'assise.
      const i = ctx.ops.findIndex((o) => o.op === 'clip');
      const band = ctx.ops.slice(i).find((o) => o.op === 'fillRect')!.args as [number, number, number, number];
      return { ops: ctx.ops, world: (sx * (band[0] + band[0] + band[2])) / 2 };
    };
    const r = seatShadow(1);
    const l = seatShadow(-1);
    // Même chaise, mais pas les mêmes rectangles d'ombre (côté opposé dans le repère local) ; de chaque côté, l'ombre est à
    // droite (monde) du centre de l'assise (x = 0).
    expect(l.ops).not.toEqual(r.ops);
    expect(r.world).toBeGreaterThan(0);
    expect(l.world).toBeGreaterThan(0);
  });
});
