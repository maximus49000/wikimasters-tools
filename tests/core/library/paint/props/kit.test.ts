import { describe, expect, it } from 'vitest';
import { ball, facing, flagArt, RD, tube, upright } from '../../../../../src/core/library/paint/props/kit';
import { recordingCtx } from '../recording-ctx';

describe('kit cellulo des accessoires', () => {
  it('déterministe', () => {
    const a = recordingCtx();
    const b = recordingCtx();
    for (const c of [a, b]) {
      tube(c, 0, 0, 0, -72, 3, '#3E5452');
      ball(c, 9, -77, 2, '#FFF3C4');
      flagArt(c, { w: 10, h: 7, t: 0.4, wave: true, phase: 1 });
    }
    expect(a.ops).toEqual(b.ops);
  });
  it('facing(-1) met l’ombre à gauche du repère local', () => {
    const right = recordingCtx();
    facing(1);
    RD(right, 0, 0, 10, 10, '#C0302B');
    const left = recordingCtx();
    facing(-1);
    RD(left, 0, 0, 10, 10, '#C0302B');
    facing(1);
    const shadowX = (c: typeof right) => c.ops.filter((o) => o.op === 'fillRect')[0]!.args[0]!;
    expect(shadowX(right)).toBeGreaterThan(5);
    expect(shadowX(left)).toBeLessThan(0);
  });
  it('drapeau plat quand wave = false (mouvement réduit) : même tracé à tout instant', () => {
    const a = recordingCtx();
    const b = recordingCtx();
    flagArt(a, { w: 10, h: 7, t: 0, wave: false, phase: 0 });
    flagArt(b, { w: 10, h: 7, t: 3.3, wave: false, phase: 2 });
    expect(a.ops).toEqual(b.ops);
  });
  it('upright redresse un texte seulement quand le canvas est retourné', () => {
    const plain = recordingCtx();
    upright(plain, 5, () => plain.fillText('A', 5, 0));
    expect(plain.ops.map((o) => o.op)).toEqual(['fillText']);
    const flipped = recordingCtx();
    facing(-1);
    upright(flipped, 5, () => flipped.fillText('A', 5, 0));
    facing(1);
    expect(flipped.ops).toEqual([
      { op: 'save', args: [] },
      { op: 'translate', args: [5, 0] },
      { op: 'scale', args: [-1, 1] },
      { op: 'translate', args: [-5, 0] },
      { op: 'fillText', args: [5, 0] },
      { op: 'restore', args: [] },
    ]);
  });
});
