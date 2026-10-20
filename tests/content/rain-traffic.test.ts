// tests/content/rain-traffic.test.ts
// Pont circulation → pluie : la pluie ne relit que les voies publiées récemment, sans allocation d'une image à l'autre.
import { describe, expect, it } from 'vitest';
import { createRainTraffic, rainCarSlot } from '../../src/content/rain-traffic';

describe('pont circulation → pluie', () => {
  it('relit les deux voies publiées, oublie une voie qui ne publie plus, réutilise ses cases', () => {
    const tr = createRainTraffic();
    const near = tr.lanes.near, far = tr.lanes.far;
    const a = rainCarSlot(near, near.n++); a.id = 'a';
    const b = rainCarSlot(far, far.n++); b.id = 'b';
    near.at = 1000; far.at = 1000;
    const out = tr.read(1200, []);
    expect(out.map((c) => c.id)).toEqual(['b', 'a']); // fond d'abord
    far.at = 600; // voie du fond démontée depuis 600 ms
    expect(tr.read(1200, out).map((c) => c.id)).toEqual(['a']);
    near.n = 0;
    expect(rainCarSlot(near, 0)).toBe(a); // même objet à l'image suivante
    expect(tr.read(1200, out)).toHaveLength(0);
  });
});
