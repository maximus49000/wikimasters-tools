import { describe, expect, it } from 'vitest';
import { boundingRect, gapRects } from '../../src/content/window-gaps';

const r = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const area = (rs: { w: number; h: number }[]) => rs.reduce((s, q) => s + q.w * q.h, 0);

describe('gapRects', () => {
  it('une seule vitre : aucun trou', () => {
    expect(gapRects([r(10, 10, 50, 40)])).toEqual([]);
    expect(gapRects([])).toEqual([]);
  });

  it('deux vitres à égalité sur la même rangée : seulement la bande entre elles', () => {
    expect(gapRects([r(10, 10, 50, 40), r(100, 10, 60, 40)])).toEqual([r(60, 10, 40, 40)]);
  });

  it('deux vitres collées : aucun trou', () => {
    expect(gapRects([r(10, 10, 50, 40), r(60, 10, 60, 40)])).toEqual([]);
  });

  it('deux vitres sur des rangées différentes : des trous en L, et le total est exact', () => {
    const g = [r(0, 0, 40, 40), r(60, 20, 40, 60)];
    const gaps = gapRects(g);
    const box = boundingRect(g)!;
    expect(box).toEqual(r(0, 0, 100, 80));
    expect(area(gaps)).toBe(box.w * box.h - area(g));
    // Aucun trou ne recouvre une vitre.
    for (const q of gaps) for (const v of g) expect(q.x < v.x + v.w && v.x < q.x + q.w && q.y < v.y + v.h && v.y < q.y + q.h).toBe(false);
    expect(gaps.length).toBeGreaterThan(1);
  });

  it('une vitre écartée (fenêtre soulevée) laisse sa place en trou si elle est dans le englobant', () => {
    const all = [r(0, 0, 40, 40), r(50, 0, 40, 40), r(100, 0, 40, 40)];
    const shown = [all[0]!, all[2]!];
    expect(gapRects(shown)).toEqual([r(40, 0, 60, 40)]);
  });
});
