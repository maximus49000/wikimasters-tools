import { describe, expect, it } from 'vitest';
import { actorShadow, lampBlobs, nearestLamp, patchBox, shopBlobs, wetStrokes } from '../../../../src/core/library/city/night-light';

describe('lumière de nuit', () => {
  it('quatre zones par lampadaire : mur, cœur du mur autour de la lanterne, flaque au pied, chaussée', () => {
    const b = lampBlobs(100, 300, 1, 0.85);
    expect(b).toHaveLength(4);
    expect(b[1]!.cy).toBeCloseTo(298);
    expect(b[1]!.rx).toBeCloseTo(56);
    expect(b[2]!.peak).toBeCloseTo(0.6);
    // Cœur du mur : centré sur la lanterne (9, −77)·k, plus serré que la lueur du mur (îlot doré net, maquette street-night).
    const core = b[3]!;
    expect(core.cx).toBeCloseTo(100 + 9 * 0.85);
    expect(Math.abs(core.cy - (300 - 77 * 0.85))).toBeLessThanOrEqual(8);
    expect(core.rx).toBeLessThan(b[0]!.rx);
    expect(core.peak).toBeGreaterThanOrEqual(0.8);
  });
  it('la découpe englobe toutes les zones', () => {
    const box = patchBox(lampBlobs(100, 300, 1, 0.85));
    expect(box.x).toBeLessThanOrEqual(100 + 3 - 56);
    expect(box.x + box.w).toBeGreaterThanOrEqual(100 + 3 + 56);
  });
  it('ombre à l’opposé de la lampe, rien au-delà de 75u', () => {
    const left = actorShadow(120, 300, 6, 18, 100, 1)!;
    const xs = left.points.split(' ').map((p) => Number(p.split(',')[0]));
    expect(Math.max(...xs)).toBeGreaterThan(123);
    expect(actorShadow(200, 300, 6, 18, 100, 1)).toBeNull();
  });
  it('lampe la plus proche', () => {
    expect(nearestLamp(250, [{ x: 100 }, { x: 270 }])).toBe(270);
    expect(nearestLamp(10, [])).toBeNull();
  });
  it('vitrine : lueur sur le mur, demi-ellipse et trapèze sur le trottoir, sous la façade seulement', () => {
    const b = shopBlobs(200, 40, 250, 220, 1);
    expect(b).toHaveLength(3);
    expect(b[0]!.peak).toBeCloseTo(0.35);
    expect(b[1]).toMatchObject({ cx: 220, cy: 250, rx: 30, ry: 20, peak: 0.85, clipTop: 250 });
    expect(b[2]!.flare).toBeGreaterThan(0);
    // La découpe ne monte pas au-dessus de la lueur du mur, ni ne descend sous le trapèze.
    const box = patchBox(b);
    expect(box.y + box.h).toBeGreaterThanOrEqual(250 + 22);
  });
  it('ombre : plus loin de la lampe, plus longue et plus pâle', () => {
    const near = actorShadow(105, 300, 6, 18, 100, 1)!;
    const far = actorShadow(160, 300, 6, 18, 100, 1)!;
    expect(far.opacity).toBeLessThan(near.opacity);
    const xs = (s: NonNullable<typeof near>) => s.points.split(' ').map((p) => Number(p.split(',')[0]));
    expect(Math.max(...xs(far)) - 160).toBeGreaterThan(Math.max(...xs(near)) - 105);
    // Lampe à droite : l'ombre part vers la gauche.
    expect(Math.min(...xs(actorShadow(80, 300, 6, 18, 100, 1)!))).toBeLessThan(77);
  });
  it('colonne de pluie : 120 traits, un sur trois au cœur ambre, nets en haut et de plus en plus pâles vers le bas', () => {
    const s = wetStrokes(7, 60, 1, 42);
    expect(s).toHaveLength(120);
    expect(s.filter((t) => t.core).length).toBe(40);
    expect(s.every((t) => t.y >= 0 && t.y <= 60 && t.a >= 0 && t.a <= 1)).toBe(true);
    // Les traits du haut (premier quart) sont francs : alpha moyen ≥ 0,6 (maquette night-rain).
    const top = s.filter((t) => t.y < 15);
    expect(top.reduce((a, t) => a + t.a, 0) / top.length).toBeGreaterThanOrEqual(0.6);
    expect(wetStrokes(7, 60, 1, 42)).toEqual(s);
  });
});
