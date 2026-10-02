import { describe, expect, it } from 'vitest';
import { ACTIONS_BAR, MAX_ZOOM, MIN_ZOOM, boundsOf, clampZoom, fitTransform, pinch, placeActions, zoomAt } from '../../../src/core/links/web-view';

describe('zoomAt', () => {
  it('garde sous le point visé le point du graphe qui s’y trouvait', () => {
    const before = { x: 30, y: -10, k: 1 };
    const after = zoomAt(before, 2, 100, 80);
    const graphPoint = { x: (100 - before.x) / before.k, y: (80 - before.y) / before.k };
    expect(after.k).toBe(2);
    expect(after.x + graphPoint.x * after.k).toBeCloseTo(100);
    expect(after.y + graphPoint.y * after.k).toBeCloseTo(80);
  });

  it('borne le zoom', () => {
    expect(zoomAt({ x: 0, y: 0, k: 1 }, 1000, 0, 0).k).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, k: 1 }, 0.0001, 0, 0).k).toBe(MIN_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });
});

describe('boundsOf / fitTransform', () => {
  it('rend null sans point', () => {
    expect(boundsOf([])).toBeNull();
  });

  it('cadre l’ensemble des points au centre de la zone', () => {
    const bounds = boundsOf([{ x: -100, y: -50 }, { x: 100, y: 50 }]);
    expect(bounds).toEqual({ minX: -100, minY: -50, maxX: 100, maxY: 50 });
    const t = fitTransform(bounds, 400, 300, 0);
    expect(t.k).toBeCloseTo(1.5);
    expect(t.x + 0 * t.k).toBeCloseTo(200);
    expect(t.y + 0 * t.k).toBeCloseTo(150);
  });

  it('ne dépasse pas un zoom confortable pour un petit graphe et centre une zone vide', () => {
    const t = fitTransform(boundsOf([{ x: 5, y: 5 }]), 400, 300);
    expect(t.k).toBeLessThanOrEqual(1.5);
    expect(fitTransform(null, 400, 300)).toEqual({ x: 200, y: 150, k: 1 });
  });
});

describe('pinch', () => {
  const start = { x: 10, y: 20, k: 1 };
  const from: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 100, y: 100 }, { x: 200, y: 100 }];

  it('ne change rien quand les doigts ne bougent pas', () => {
    expect(pinch(start, from, from)).toEqual(start);
  });

  it('déplace quand les doigts glissent ensemble', () => {
    const to: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 130, y: 90 }, { x: 230, y: 90 }];
    expect(pinch(start, from, to)).toEqual({ x: 40, y: 10, k: 1 });
  });

  it('zoome quand les doigts s’écartent, autour de leur milieu', () => {
    const to: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 50, y: 100 }, { x: 250, y: 100 }];
    const t = pinch(start, from, to);
    expect(t.k).toBe(2);
    const graphPoint = { x: (150 - start.x) / start.k, y: (100 - start.y) / start.k };
    expect(t.x + graphPoint.x * t.k).toBeCloseTo(150);
    expect(t.y + graphPoint.y * t.k).toBeCloseTo(100);
  });
});

describe('placeActions', () => {
  const area = { width: 600, height: 400 };

  it('pose la barre au-dessus de la carte, centrée sur elle', () => {
    const { x, y } = placeActions({ x: 300, y: 200 }, 17, area);
    expect(x).toBeCloseTo(300 - ACTIONS_BAR.width / 2);
    expect(y + ACTIONS_BAR.height).toBeLessThan(200 - 17);
  });

  it('la pose sous la carte quand le haut de la zone manque de place', () => {
    const { y } = placeActions({ x: 300, y: 30 }, 17, area);
    expect(y).toBeGreaterThan(30 + 17);
  });

  it('reste dans la zone, à gauche comme à droite', () => {
    expect(placeActions({ x: 2, y: 200 }, 17, area).x).toBeGreaterThanOrEqual(0);
    const right = placeActions({ x: 598, y: 200 }, 17, area);
    expect(right.x + ACTIONS_BAR.width).toBeLessThanOrEqual(area.width);
  });

  it('reste dans la zone en bas quand la carte en sort', () => {
    const { y } = placeActions({ x: 300, y: 5000 }, 17, area);
    expect(y + ACTIONS_BAR.height).toBeLessThanOrEqual(area.height);
  });
});
