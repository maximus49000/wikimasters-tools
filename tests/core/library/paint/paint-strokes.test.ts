import { describe, expect, it } from 'vitest';
import { cobbles, foliage, glass, roofTiles } from '../../../../src/core/library/paint/strokes';
import { mulberry32 } from '../../../../src/core/library/scene-world';
import { recordingCtx } from './recording-ctx';

const inBox = (pts: [number, number][], b: { x: number; y: number; w: number; h: number }, eps = 1e-6) =>
  pts.every(([x, y]) => x >= b.x - eps && x <= b.x + b.w + eps && y >= b.y - eps && y <= b.y + b.h + eps);

describe('tuiles', () => {
  it('toutes dans la boîte, versant gauche plus clair', () => {
    const ctx = recordingCtx();
    const box = { x: 10, y: 5, w: 40, h: 14 };
    roofTiles(ctx, mulberry32(1), box, [198, 90, 48], 30, 3.2, 2.2);
    expect(ctx.fills.length).toBeGreaterThan(40);
    expect(inBox(ctx.points, box)).toBe(true);
  });
});

describe('pavés', () => {
  it('même couleur pour le même pavé, peint depuis deux tranches voisines', () => {
    const a = recordingCtx();
    const b = recordingCtx();
    cobbles(a, 3, { x: 0, y: 260, w: 100, h: 60 }, 2.2, 0.12, [182, 160, 124]);
    cobbles(b, 3, { x: 80, y: 260, w: 120, h: 60 }, 2.2, 0.12, [182, 160, 124]);
    const byCenter = (ctx: ReturnType<typeof recordingCtx>) => {
      const out = new Map<string, string>();
      let fill = 0;
      for (const o of ctx.ops) {
        if (o.op === 'ellipse') out.set(`${o.args[0]!.toFixed(2)},${o.args[1]!.toFixed(2)},${o.args[2]!.toFixed(2)}`, ctx.fills[fill] ?? '');
        if (o.op === 'fill') fill++;
      }
      return out;
    };
    const ma = byCenter(a);
    const mb = byCenter(b);
    let shared = 0;
    for (const [k, v] of ma) if (mb.has(k)) { shared++; expect(mb.get(k)).toBe(v); }
    expect(shared).toBeGreaterThan(5);
  });
  it('les rangées grandissent vers le bas', () => {
    const ctx = recordingCtx();
    cobbles(ctx, 1, { x: 0, y: 0, w: 60, h: 80 }, 2, 0.2, [150, 130, 100]);
    const ry = ctx.ops.filter((o) => o.op === 'ellipse').map((o) => [o.args[1]!, o.args[3]!] as const);
    const top = ry.filter(([y]) => y < 10).map(([, r]) => r);
    const bottom = ry.filter(([y]) => y > 60).map(([, r]) => r);
    expect(Math.max(...bottom)).toBeGreaterThan(Math.max(...top));
  });
});

describe('feuillage', () => {
  it('tout dans la couronne', () => {
    const ctx = recordingCtx();
    foliage(ctx, mulberry32(5), { cx: 100, cy: 80, r: 18 }, 1);
    expect(ctx.fills.length).toBeGreaterThan(100);
    for (const [x, y] of ctx.points) expect(Math.hypot(x - 100, y - 80)).toBeLessThanOrEqual(18 + 1e-6);
  });
});

describe('vitre', () => {
  it('tout dans la fenêtre, avec ou sans rideau', () => {
    for (const curtain of [true, false]) {
      const ctx = recordingCtx();
      const win = { x: 20, y: 30, w: 5, h: 7 };
      glass(ctx, mulberry32(2), win, curtain);
      expect(inBox(ctx.points, win)).toBe(true);
    }
  });
});
