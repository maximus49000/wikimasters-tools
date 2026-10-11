import { describe, expect, it } from 'vitest';
import { createPuffs, emitPuffs, forgetPuffSources, puffView } from '../../../../../src/core/library/city/traffic/exhaust';

describe('échappement', () => {
  it('cadence : plus dense à l’accélération qu’en roulant, plus qu’au ralenti', () => {
    const count = (acc: number, v: number): number => {
      const p = createPuffs(400);
      for (let t = 0; t < 10; t += 0.05) emitPuffs(p, { id: 'a', x: 0, y: 0, k: 1, acc, v, unit: 1 }, t);
      return p.next;
    };
    expect(count(5, 30)).toBeGreaterThan(count(0, 30));
    expect(count(0, 30)).toBeGreaterThan(count(0, 0));
  });
  it('pool fixe, bouffées qui montent, grossissent et s’effacent, puis meurent', () => {
    const p = createPuffs(8);
    for (let t = 0; t < 20; t += 0.05) emitPuffs(p, { id: 'a', x: 0, y: 0, k: 1, acc: 5, v: 30, unit: 1 }, t);
    expect(p.puffs).toHaveLength(8);
    const q = { x: 0, y: 0, k: 1, born: 0, dark: false, jitter: 0.5, live: true, dir: 1 as const };
    const v0 = puffView(q, 0.1)!;
    const v1 = puffView(q, 1.2)!;
    expect(v1.cy).toBeLessThan(v0.cy);
    expect(v1.r).toBeGreaterThan(v0.r);
    expect(v1.alpha).toBeLessThan(v0.alpha);
    expect(puffView(q, 2)).toBeNull();
  });
  it('la bouffée dérive vers l’ARRIÈRE du véhicule, dans les deux sens', () => {
    for (const dir of [1, -1] as const) {
      const p = createPuffs(4);
      emitPuffs(p, { id: 'a', x: 100, y: 0, k: 1, acc: 0, v: 30, unit: 1, dir }, 0);
      const v = puffView(p.puffs[0]!, 1.5)!;
      expect(Math.sign(v.cx - 100)).toBe(-dir);
    }
  });
  it('sources oubliées quand l’agent est sorti', () => {
    const p = createPuffs(8);
    emitPuffs(p, { id: 'a', x: 0, y: 0, k: 1, acc: 0, v: 30, unit: 1 }, 0);
    forgetPuffSources(p, new Set());
    expect(p.last.size).toBe(0);
  });
});
