// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BLANK_SPRITE } from '../../../src/content/figure/figure-host';
import { CarRegistry, layerBox, layerKey, litOf, paintLayer } from '../../../src/content/vehicle/car-host';
import { carArt } from '../../../src/core/library/city/traffic/car-art';
import { genCar } from '../../../src/core/library/city/traffic/cars';
import { skyAt, sunTimes } from '../../../src/core/library/sky';

const sky = skyAt(12 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const night = skyAt(23 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));

describe('registre des voitures', () => {
  it('clés par couche, sens et jour quantifié ; sans canvas : sprite vide', () => {
    const c = genCar(3, 'berline', 0.4);
    const d = { ...litOf(sky), dir: 1 as const };
    expect(layerKey(c, 'body', d)).not.toBe(layerKey(c, 'body', { ...d, dir: -1 }));
    expect(layerKey(c, 'body', d)).not.toBe(layerKey(c, 'body', { ...litOf(night), dir: 1 }));
    expect(litOf(night).night).toBe(true);
    expect(litOf(sky).night).toBe(false);
    expect(litOf(sky).day * 8).toBe(Math.round(litOf(sky).day * 8));
    expect(paintLayer(carArt(c), 'body', d)).toBe(BLANK_SPRITE);
  });
  it('cadre commun aux couches, en miroir pour la voie du fond', () => {
    const a = carArt(genCar(8, 'pick-up', 0.7));
    const r = layerBox(a, 1);
    const l = layerBox(a, -1);
    expect(r.x).toBeLessThan(a.x0);
    expect(r.x + r.w).toBeGreaterThan(a.x1);
    expect(r.y).toBeLessThan(a.top);
    expect(l.x).toBeCloseTo(-(r.x + r.w), 6);
    expect(l.w).toBe(r.w);
  });
  it('budget par image, plafond, demandes abandonnées jetées ; ensure peint tout de suite', () => {
    const r = new CarRegistry('t', { max: 5, perFrame: 2 });
    let painted = 0;
    const p = (): string => {
      painted++;
      return BLANK_SPRITE;
    };
    for (let i = 0; i < 6; i++) expect(r.request(`k${i}`, p)).toBeNull();
    r.flush();
    expect(painted).toBe(2);
    expect(r.request('k0', p)).toBe(BLANK_SPRITE);
    expect(r.ensure('now', p)).toBe(BLANK_SPRITE);
    expect(painted).toBe(3);
    for (let i = 0; i < 10; i++) r.flush();
    expect(r.size()).toBeLessThanOrEqual(5);
    expect(painted).toBeLessThanOrEqual(7);
  });
});
