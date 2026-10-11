import { describe, expect, it } from 'vitest';
import { passCtx, tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { R, fitText } from '../../../../../src/core/library/paint/shop/cel';
import { recordingCtx } from '../recording-ctx';

describe('contexte des commerces', () => {
  it('teinte chaque couleur, sauf dans glowing', () => {
    const rec = recordingCtx();
    const ctx = tintedCtx(rec, (c) => `T(${c})`);
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(0, 0, 1, 1);
    ctx.glowing(() => {
      ctx.fillStyle = '#00FF00';
      ctx.fillRect(0, 0, 1, 1);
    });
    expect(rec.fills).toEqual(['T(#FF0000)', '#00FF00']);
  });

  it('teinte aussi les couleurs rgba, alpha conservé', () => {
    const rec = recordingCtx();
    const ctx = tintedCtx(rec, () => '#000010');
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(0, 0, 1, 1);
    expect(rec.fills[0]).toMatch(/^rgba\(0, ?0, ?16, ?0\.5\)$/);
  });

  it('passe : le fond jusqu’à toFront, le premier plan après', () => {
    const back = recordingCtx();
    const front = recordingCtx();
    for (const [rec, want] of [[back, 'back'], [front, 'front']] as const) {
      const ctx = passCtx(rec, want);
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, 1, 1);
      ctx.toFront();
      ctx.fillStyle = '#222222';
      ctx.fillRect(0, 0, 1, 1);
    }
    expect(back.fills).toEqual(['#111111']);
    expect(front.fills).toEqual(['#222222']);
  });

  it('forme cellulo : aplat, ombre, rehaut et trait', () => {
    const rec = recordingCtx();
    R(rec, 0, 0, 10, 4, '#C08040');
    expect(rec.ops.filter((o) => o.op === 'fill').length).toBe(1);
    expect(rec.ops.filter((o) => o.op === 'fillRect').length).toBe(2);
    expect(rec.ops.some((o) => o.op === 'stroke')).toBe(true);
  });

  it('nom comprimé à la largeur demandée', () => {
    const name = 'Un nom beaucoup trop long pour le bandeau';
    const rec = recordingCtx();
    fitText(rec, name, 10, 3, 4, '#FFFFFF', { w: 18 });
    const sc = rec.ops.find((o) => o.op === 'scale')!;
    expect(sc.args[0]! * name.length * 0.55 * 4).toBeLessThanOrEqual(18 + 1e-6);
    expect(rec.texts).toEqual([name]);
  });
});
