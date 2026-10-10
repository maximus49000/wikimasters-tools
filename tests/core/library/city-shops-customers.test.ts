import { describe, expect, it } from 'vitest';
import { customerGate, visitAt, visitHappens, visitsFor, VISIT_CYCLE } from '../../../src/core/library/city/shops/customers';
import { takesAway } from '../../../src/core/library/city/shops/gestures';
import type { ShopTypeId } from '../../../src/core/library/city/shops/catalog';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';

const slots = shopSlotsFor(720, 340, 9);
const frames = new Map(slots.map((s) => [s.id, shopFrame(s, 238)]));
const visits = visitsFor(slots, frames, 9, () => 'bakery');

describe('clients', () => {
  it('donne deux visites par local', () => {
    expect(visits).toHaveLength(slots.length * 2);
  });
  it('entre par la porte du magasin, reste dans la vitrine, ressort', () => {
    const v = visits[0]!;
    const stages = new Set<string>();
    for (let t = 0; t < VISIT_CYCLE; t += 0.5) {
      const s = visitAt(v, 720, t - v.phase);
      if (!s) continue;
      stages.add(s.stage);
      if (s.stage === 'inside') {
        const f = frames.get(v.slotId)!;
        expect(s.x).toBeGreaterThanOrEqual(f.window.x);
        expect(s.x).toBeLessThanOrEqual(f.window.x + f.window.w);
      }
    }
    expect([...stages].sort()).toEqual(['in', 'inside', 'out']);
  });
  it('n’envoie personne dans un local fermé', () => {
    const closed = { phase: 'closed' } as Parameters<typeof customerGate>[0];
    expect(customerGate(closed, 600, { walkers: 1 } as Parameters<typeof customerGate>[2])).toBe(0);
  });
  it('garde la population raisonnable : au plus 2 clients par local et environ 4 en route par 720 px', () => {
    const open = { phase: 'open', sign: { type: 'bakery', name: 'x' } } as Parameters<typeof customerGate>[0];
    const gate = customerGate(open, 8 * 60, { walkers: 1 } as Parameters<typeof customerGate>[2]);
    let sum = 0;
    let max = 0;
    let n = 0;
    for (let t = 0; t < 3600; t += 2) {
      let walking = 0;
      for (const v of visits) {
        const s = visitAt(v, 720, t);
        if (s && s.stage !== 'inside' && visitHappens(v, t, gate)) walking++;
      }
      sum += walking;
      max = Math.max(max, walking);
      n++;
    }
    expect(sum / n).toBeLessThanOrEqual(4);
    expect(max).toBeLessThanOrEqual(9);
  });

  it('place chaque client dans la vitrine, deux places distinctes par local, selon la famille', () => {
    for (const type of ['bakery', 'hairdresser', 'restaurant'] as ShopTypeId[]) {
      const vs = visitsFor(slots, frames, 9, () => type);
      for (const slot of slots) {
        const f = frames.get(slot.id)!;
        const [a, b] = vs.filter((v) => v.slotId === slot.id);
        expect(a!.seat.x).not.toBe(b!.seat.x);
        for (const v of [a!, b!]) {
          expect(v.seat.x).toBeGreaterThanOrEqual(f.window.x);
          expect(v.seat.x).toBeLessThanOrEqual(f.window.x + f.window.w);
          expect([1, -1]).toContain(v.seat.facing);
        }
      }
    }
  });
  it('ne change pas le tirage des visites selon le type', () => {
    const a = visitsFor(slots, frames, 9, () => 'bakery');
    const b = visitsFor(slots, frames, 9, () => 'restaurant');
    expect(b.map((v) => [v.phase, v.stay, v.dir])).toEqual(a.map((v) => [v.phase, v.stay, v.dir]));
  });
  it('geste seulement à l’intérieur ; emporte un objet à la sortie si le type s’y prête', () => {
    for (const type of ['bakery', 'restaurant'] as ShopTypeId[]) {
      const v = visitsFor(slots, frames, 9, () => type)[0]!;
      for (let t = 0; t < VISIT_CYCLE; t += 0.5) {
        const s = visitAt(v, 720, t - v.phase);
        if (!s) continue;
        if (s.stage === 'inside') expect(s.gesture).not.toBeNull();
        else expect(s.gesture).toBeNull();
        expect(s.carry).toBe(s.stage === 'out' && takesAway(type));
      }
    }
  });
  it('sans type connu : pas de geste, rien d’emporté', () => {
    const v = visitsFor(slots, frames, 9, () => null)[0]!;
    for (let t = 0; t < VISIT_CYCLE; t += 0.5) {
      const s = visitAt(v, 720, t - v.phase);
      if (s) { expect(s.gesture).toBeNull(); expect(s.carry).toBe(false); }
    }
  });
});
