import { describe, expect, it } from 'vitest';
import { castFor } from '../../../src/core/library/city/shops/scene/cast';
import { ARRIVAL_SHARE, SLOT_S, inScene, slotIndexAt, slotStart } from '../../../src/core/library/city/shops/scene/slots';

const base = { seed: 9, slotId: 'shop-0', type: 'bakery' as const, day: 20738, index: 120, gate: 1, capacity: 4, dayMinutesAtStart: 480 };

describe('distribution des partis', () => {
  it('est déterministe', () => expect(castFor(base)).toEqual(castFor(base)));
  it('change avec le créneau', () => expect(castFor({ ...base, index: 121 })).not.toEqual(castFor(base)));
  it("n'a aucune arrivée après ARRIVAL_SHARE du créneau", () => {
    for (let i = 0; i < 200; i++) for (const p of castFor({ ...base, index: i })) expect(p.arriveAt).toBeLessThanOrEqual(SLOT_S('bakery') * ARRIVAL_SHARE);
  });
  it('personne avec un gate nul', () => expect(castFor({ ...base, gate: 0 })).toEqual([]));
  it('respecte à peu près la composition (solo majoritaire, groupes présents)', () => {
    const kinds = new Map<string, number>();
    for (let i = 0; i < 2000; i++) for (const p of castFor({ ...base, type: 'cafe', index: i })) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
    const total = [...kinds.values()].reduce((a, b) => a + b, 0);
    expect(kinds.get('solo')! / total).toBeGreaterThan(0.5);
    expect(kinds.get('friends')! / total).toBeGreaterThan(0.1);
    expect(kinds.get('parent-child')! / total).toBeGreaterThan(0.03);
  });
  it('un enfant seulement dans parent-child, connaissances réciproques', () => {
    for (let i = 0; i < 300; i++) {
      const ps = castFor({ ...base, index: i });
      for (const p of ps) {
        expect(p.members.some((m) => m.child)).toBe(p.kind === 'parent-child');
        if (p.knows) expect(ps.find((q) => q.id === p.knows)?.knows).toBe(p.id);
      }
    }
  });
  it('créneaux par famille', () => {
    expect(SLOT_S('bakery')).toBe(240);
    expect(SLOT_S('bookshop')).toBe(360);
    expect(SLOT_S('restaurant')).toBe(600);
    expect(SLOT_S('tattoo')).toBe(900);
    expect(slotStart('bakery', slotIndexAt('bakery', 3600 * 8 + 10))).toBe(3600 * 8);
  });

  // Compléments : invariants du brief non couverts ci-dessus.
  it('plafonne le nombre de partis à capacity + 2, arrivées triées et après 2 s', () => {
    for (let i = 0; i < 300; i++) {
      const ps = castFor({ ...base, gate: 5, capacity: 2, index: i });
      expect(ps.length).toBeLessThanOrEqual(4);
      for (let k = 0; k < ps.length; k++) {
        expect(ps[k]!.arriveAt).toBeGreaterThanOrEqual(2);
        if (k > 0) expect(ps[k]!.arriveAt).toBeGreaterThanOrEqual(ps[k - 1]!.arriveAt);
      }
    }
  });
  it('ids, meneur adulte, child-tug seulement en parent-child, une connaissance au plus', () => {
    for (let i = 0; i < 300; i++) {
      const ps = castFor({ ...base, index: i });
      ps.forEach((p, k) => {
        expect(p.id).toBe(`shop-0-c${i}-p${k}`);
        expect(p.members[0]!.child).toBe(false);
        if (p.incidents.includes('child-tug')) expect(p.kind).toBe('parent-child');
        for (const m of p.members) if (m.child) { expect(m.scale).toBeGreaterThanOrEqual(0.6); expect(m.scale).toBeLessThanOrEqual(0.7); }
      });
      const known = ps.filter((p) => p.knows).map((p) => p.knows);
      expect(new Set(known).size).toBe(known.length);
    }
  });
  it('hors scène (famille dance) : aucun parti', () => {
    expect(inScene('nightclub')).toBe(false);
    expect(inScene('arcade')).toBe(false);
    expect(inScene('bakery')).toBe(true);
    expect(castFor({ ...base, type: 'nightclub' })).toEqual([]);
  });
  it('créneaux des autres familles', () => {
    expect(SLOT_S('greengrocer')).toBe(240);
    expect(SLOT_S('bar')).toBe(240);
    expect(SLOT_S('laundry')).toBe(360);
    expect(SLOT_S('hairdresser')).toBe(600);
  });
});
