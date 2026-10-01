import { describe, expect, it } from 'vitest';
import { placePopup } from '../../src/content/card-popup-position';

const size = { width: 288, height: 470 };
const viewport = { width: 1200, height: 900 };
const at = (left: number, top: number) => ({ left, right: left + 20, top, bottom: top + 20 });

function expectInside(result: ReturnType<typeof placePopup>, vp = viewport, s = size) {
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.top).toBeGreaterThanOrEqual(0);
  expect(result.left + s.width * result.scale).toBeLessThanOrEqual(vp.width);
  expect(result.top + s.height * result.scale).toBeLessThanOrEqual(vp.height);
}

describe('placePopup', () => {
  it('se place au-dessus de l’ancre quand il y a la place', () => {
    const result = placePopup(at(600, 700), size, viewport);
    expect(result.top + size.height).toBeLessThanOrEqual(700);
    expect(result.scale).toBe(1);
    expectInside(result);
  });

  it('passe en dessous quand le haut manque', () => {
    const result = placePopup(at(600, 100), size, viewport);
    expect(result.top).toBeGreaterThanOrEqual(120);
    expectInside(result);
  });

  it('se met sur le côté quand ni le haut ni le bas ne suffisent', () => {
    const result = placePopup(at(300, 400), size, viewport);
    expect(result.left).toBeGreaterThanOrEqual(320);
    expectInside(result);
  });

  it('passe à gauche quand la droite manque', () => {
    const result = placePopup(at(1150, 400), size, viewport);
    expect(result.left + size.width).toBeLessThanOrEqual(1150);
    expectInside(result);
  });

  it('reste entier dans les coins', () => {
    for (const [x, y] of [[0, 0], [1180, 0], [0, 880], [1180, 880]] as const) expectInside(placePopup(at(x, y), size, viewport));
  });

  it('se réduit quand la fenêtre est plus petite que la carte', () => {
    const small = { width: 360, height: 300 };
    const result = placePopup(at(100, 100), size, small);
    expect(result.scale).toBeLessThan(1);
    expectInside(result, small);
  });
});
