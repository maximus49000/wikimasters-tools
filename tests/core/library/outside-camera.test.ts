import { describe, expect, it } from 'vitest';
import { centerOn, clampCamera, clientToWorld, easeInOut, followStep, initialCamera, lerpRect, pan, viewBoxOf, viewRect, viewSize, zoomAt } from '../../../src/core/library/outside-camera';

const box = { w: 720, h: 340 };
const world = { w: 1440, h: 340 };

describe('caméra dehors', () => {
  it('zoom 1 : la hauteur du monde remplit la boîte', () => {
    expect(viewSize(box, world, 1)).toEqual({ w: 720, h: 340 });
    expect(viewSize(box, world, 2)).toEqual({ w: 360, h: 170 });
  });

  it('borne le zoom à [1, 4] et la caméra aux bords du monde', () => {
    expect(clampCamera({ x: -50, y: -10, zoom: 0.5 }, box, world)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(clampCamera({ x: 5000, y: 5000, zoom: 9 }, box, world)).toEqual({ x: 1440 - 180, y: 340 - 85, zoom: 4 });
  });

  it('centre un monde plus étroit que la boîte', () => {
    expect(clampCamera({ x: 0, y: 0, zoom: 1 }, box, { w: 600, h: 340 }).x).toBe(-60);
  });

  it('zoome autour du point touché : il reste sous le doigt', () => {
    const cam = zoomAt({ x: 0, y: 0, zoom: 1 }, box, world, 2, 360, 170);
    expect(cam).toEqual({ x: 180, y: 85, zoom: 2 });
    expect(clientToWorld(cam, box, world, 360, 170)).toEqual({ x: 360, y: 170 });
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, box, world, 10, 0, 0).zoom).toBe(4);
  });

  it('glisser déplace à l’opposé du doigt, à l’échelle du zoom', () => {
    expect(pan({ x: 400, y: 0, zoom: 1 }, box, world, 100, 0).x).toBe(300);
    expect(pan({ x: 400, y: 50, zoom: 2 }, box, world, -100, 20)).toEqual({ x: 450, y: 40, zoom: 2 });
  });

  it('centre sur un point, borné', () => {
    expect(centerOn({ x: 0, y: 0, zoom: 2 }, box, world, { x: 1000, y: 170 })).toEqual({ x: 820, y: 85, zoom: 2 });
    expect(centerOn({ x: 0, y: 0, zoom: 1 }, box, world, { x: 1430, y: 0 }).x).toBe(720);
  });

  it('le suivi converge vers le personnage sans sauter', () => {
    let cam = { x: 0, y: 0, zoom: 2 };
    const first = followStep(cam, box, world, { x: 1000, y: 170 }, 16);
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(820 * 0.1);
    for (let i = 0; i < 200; i++) cam = followStep(cam, box, world, { x: 1000, y: 170 }, 16);
    expect(cam.x).toBeCloseTo(820, 0);
    expect(cam.y).toBeCloseTo(85, 0);
  });

  it('cadre initial : zoom 1 centré sur la fenêtre la plus proche, sinon le centre du monde', () => {
    const wins = [{ x: 60, y: 30, w: 180, h: 150 }, { x: 900, y: 30, w: 240, h: 150 }];
    expect(initialCamera(box, world, wins, 1000)).toEqual({ x: 1020 - 360, y: 0, zoom: 1 });
    expect(initialCamera(box, world, wins, 100)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(initialCamera(box, world, [], 0)).toEqual({ x: 360, y: 0, zoom: 1 });
  });

  it('rectangle de vue, viewBox, interpolation', () => {
    expect(viewRect({ x: 10, y: 20, zoom: 2 }, box, world)).toEqual({ x: 10, y: 20, w: 360, h: 170 });
    expect(viewBoxOf({ x: 1, y: 2.5, w: 3, h: 4 })).toBe('1.00 2.50 3.00 4.00');
    expect(lerpRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 20, w: 30, h: 40 }, 0.5)).toEqual({ x: 5, y: 10, w: 20, h: 25 });
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });
});
