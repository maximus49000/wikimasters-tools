import { describe, expect, it } from 'vitest';
import { ARM_POSES, YAWS } from '../../../src/core/library/figure/skeleton';
import { bakeFigure, anchorsOf } from '../../../src/core/library/figure/bake';
import { shapeFromSignature } from '../../../src/core/library/figure/dress';
import { SPRITE_BOX } from '../../../src/content/figure/figure-host';

// Gestes des commerces (G4b) : noms exacts repris par la bibliothèque de gestes (MOVES), variantes de poses clés -1 / -2.
const G4B = ['give', 'take', 'point', 'chin', 'wave', 'beckon', 'pay-card', 'pay-cash', 'wipe-1', 'wipe-2', 'shelve', 'phone', 'yawn', 'stretch-1', 'stretch-2', 'read', 'toast-1', 'toast-2', 'weigh', 'wrap-1', 'wrap-2', 'scissors-1', 'scissors-2', 'shampoo', 'taste', 'sniff', 'pour', 'notepad', 'plates', 'mirror', 'frames', 'hold-child', 'tug', 'sneeze', 'pick'] as const;
const SIG = 'short.long.pants.none.n.n';

describe('gestes G4b du pantin', () => {
  it('déclare chaque geste', () => {
    for (const a of G4B) expect(ARM_POSES).toContain(a);
  });
  it('cuit chaque geste sous les 16 orientations, mains dans le cadre du sprite', () => {
    for (const arms of G4B)
      for (let yaw = 0; yaw < YAWS; yaw++) {
        const key = { sig: SIG, yaw, gait: 'stand' as const, phase: 0, head: 0, arms, lean: 0 };
        expect(bakeFigure(shapeFromSignature(SIG), key).groups.length).toBeGreaterThan(0);
        const { handR, handL } = anchorsOf(key);
        for (const [x, y] of [handR, handL]) {
          expect(Math.abs(x)).toBeLessThan(-SPRITE_BOX.x0);
          expect(y).toBeGreaterThan(SPRITE_BOX.y0);
        }
      }
  });
  it("accroupi : bassin bas, pieds au sol, main droite près du sol avec 'pick'", () => {
    const key = { sig: SIG, yaw: 4, gait: 'crouch' as const, phase: 0, head: 0, arms: 'pick' as const, lean: 1 };
    expect(anchorsOf(key).handR[1]).toBeGreaterThan(-8);
  });
});
