// tests/core/library/paint/paint-sky-clip.test.ts
import { describe, expect, it } from 'vitest';
import { cityPaintPlan, hillTopY } from '../../../../src/core/library/paint/city-plan';
import { alphaTopProfile, cityTopY, skylinePath, skylinePathFromProfile, skylinePoints } from '../../../../src/core/library/paint/sky-clip';
import { roofLineY, roofSpan } from '../../../../src/core/library/paint/snow-painter';

// y de la ligne brisée en x (dernier segment qui contient x : les marches verticales prennent la valeur de droite).
const at = (pts: [number, number][], x: number): number => {
  for (let i = pts.length - 1; i > 0; i--) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    if (x >= x0 && x <= x1 && x1 > x0) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return NaN;
};

describe('silhouette du ciel (découpe des nuages peints)', () => {
  it('haut de la ville : le plus haut des toits et du fond', () => {
    const plan = cityPaintPlan(1080, 340, 1);
    for (let x = 0; x < 1080; x += 3) {
      const roofs = Math.min(plan.ground, ...plan.buildings.filter((b) => x >= roofSpan(b).x0 && x <= roofSpan(b).x1).map((b) => roofLineY(b, x)));
      expect(cityTopY(plan, x)).toBeCloseTo(Math.min(roofs, hillTopY(plan, x)), 9);
    }
  });

  for (const seed of [1, 7]) {
    it(`graine ${seed} : suit le haut de la ville sans jamais descendre dessous`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      const pts = skylinePoints(plan);
      expect(pts[0]![0]).toBe(0);
      expect(pts[pts.length - 1]![0]).toBe(1080);
      for (let x = 0.3; x < 1080; x += 0.7) {
        const y = at(pts, x);
        expect(y).toBeLessThanOrEqual(cityTopY(plan, x) + 0.1);
        expect(y).toBeGreaterThan(cityTopY(plan, x) - 3);
      }
    });
  }

  it('chemin fermé par le haut du monde', () => {
    const d = skylinePath(cityPaintPlan(720, 340, 1));
    expect(d.startsWith('M0 0L0 ')).toBe(true);
    expect(d.endsWith('L720 0Z')).toBe(true);
  });
});

// Sommets [x, y] d'un chemin `M0 0L…Z`.
const vertices = (d: string): [number, number][] =>
  [...d.matchAll(/L(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe('profil alpha du haut des tranches', () => {
  it('plus petit y CSS où un pixel est opaque, h / dpr si la colonne est vide', () => {
    const w = 4;
    const h = 6;
    const data = new Uint8ClampedArray(w * h * 4);
    // Colonne CSS 0 (pixels 0 et 1) : alpha 10 au pixel (1, 5) ; colonne CSS 1 (pixels 2 et 3) : vide.
    data[(5 * w + 1) * 4 + 3] = 10;
    expect([...alphaTopProfile(data, w, h, 2)]).toEqual([2.5, 3]);
    data[(0 * w + 0) * 4 + 3] = 255;
    expect(alphaTopProfile(data, w, h, 2)[0]).toBe(0);
  });
});

describe('découpe des nuages au pixel', () => {
  const plan = cityPaintPlan(1440, 340, 7);
  const front = plan.buildings.filter((b) => !b.far);
  const underFront = (x: number): boolean => front.some((b) => x >= roofSpan(b).x0 - 1 && x <= roofSpan(b).x1 + 1);

  it('sans profil : exactement la découpe des boîtes (repli)', () => {
    expect(skylinePathFromProfile(plan, null)).toBe(skylinePath(plan));
  });

  it('suit le profil des tranches, plus aucune boîte du fond', () => {
    expect(plan.hill.tops.length).toBeGreaterThan(0);
    const profile = new Float32Array(1440).fill(100);
    profile.fill(40, 600, 620);
    const d = skylinePathFromProfile(plan, profile);
    expect(d.startsWith('M0 0L0 ')).toBe(true);
    expect(d.endsWith('L1440 0Z')).toBe(true);
    const pts = vertices(d);
    for (const [x, y] of pts) {
      if (x > 600 && x < 620) expect(y).toBeLessThanOrEqual(40);
      else if ((x < 599 || x > 621) && !underFront(x)) expect(y).toBeGreaterThanOrEqual(99.9);
    }
    // Jamais sous le profil (chaque segment reste dans des colonnes dont il ne descend pas sous le haut).
    for (let x = 0.25; x < 1440; x += 0.5) expect(at(pts, x)).toBeLessThanOrEqual(profile[Math.floor(x)]! + 0.1);
  });

  it('un immeuble du premier plan garde sa ligne de toit analytique', () => {
    const profile = new Float32Array(1440).fill(340);
    const pts = vertices(skylinePathFromProfile(plan, profile));
    expect(front.length).toBeGreaterThan(0);
    for (const b of front) {
      const s = roofSpan(b);
      for (let x = Math.max(0.3, s.x0 + 0.3); x < Math.min(1440, s.x1); x += 0.7) expect(at(pts, x)).toBeLessThanOrEqual(roofLineY(b, x) + 0.1);
    }
  });

  // Grue et ailes des moulins : devant les nuages (nuages derrière la ville), plus de boîte retirée du ciel autour d'elles
  // (trous dans les nuages, capture de l'utilisateur du 2026-10-24) : au-dessus d'elles, la découpe est le profil seul.
  it('grue et moulins : aucune boîte, la découpe reste le profil (hors toits du premier plan)', () => {
    const profile = new Float32Array(1440).fill(100);
    const pts = vertices(skylinePathFromProfile(plan, profile));
    const spans: [number, number][] = [];
    for (const e of plan.fond.escapes) {
      spans.push([e.crane.x - e.crane.boom - 1, e.crane.x + e.crane.boom + 1]);
      if (e.mill) {
        const r = 9 * e.mill.s + 2;
        const hx = e.mill.x - 0.5 * e.mill.s;
        spans.push([hx - r, hx + r]);
      }
    }
    expect(spans.length).toBeGreaterThan(0);
    let seen = 0;
    for (let x = 0.25; x < 1440; x += 0.5) {
      if (underFront(x - 1) || underFront(x + 1) || !spans.some(([a, b]) => x >= a && x <= b)) continue;
      seen++;
      expect(at(pts, x)).toBe(100);
    }
    expect(seen).toBeGreaterThan(0);
  });
});
