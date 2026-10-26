import { describe, expect, it } from 'vitest';
import { ROOM_CAMERA, centeredOf, viewPoint, yawOf } from '../../../src/core/library/cel/camera';
import { roomLightSide } from '../../../src/core/library/cel/light';

const cam = ROOM_CAMERA;

describe('caméra en perspective de la pièce', () => {
  it('yaw = −angle·π/4', () => expect(yawOf(2)).toBeCloseTo(-Math.PI / 2, 12));
  it('à l’angle 2, un point de la face avant sort à gauche de l’origine', () => {
    expect(viewPoint(cam, yawOf(2), centeredOf({ w: 80, d: 40 }, [40, 50, 0]))[0]).toBeLessThan(0);
  });
  it('perspective : à l’angle 0, un point plus haut est dessiné plus large', () => {
    expect(Math.abs(viewPoint(cam, 0, [40, 180, 0])[0])).toBeGreaterThan(Math.abs(viewPoint(cam, 0, [40, 0, 0])[0]));
  });
  it('un point du fond est plus haut à l’écran qu’un point de devant', () => {
    const fond = viewPoint(cam, 0, centeredOf({ w: 80, d: 40 }, [40, 0, 40]));
    const devant = viewPoint(cam, 0, centeredOf({ w: 80, d: 40 }, [40, 0, 0]));
    expect(fond[1]).toBeLessThan(devant[1]);
  });
});

describe('côté de la lumière de la pièce', () => {
  it('sans fenêtre : à gauche', () => expect(roomLightSide([], 600)).toBe('left'));
  it('la plus grande vitre décide', () => expect(roomLightSide([{ x: 400, w: 120 }, { x: 40, w: 60 }], 600)).toBe('right'));
});
