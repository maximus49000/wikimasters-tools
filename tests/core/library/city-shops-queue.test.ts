import { describe, expect, it } from 'vitest';
import { nightclubDoor, queueAt } from '../../../src/core/library/city/shops/queue';

const MIN = (h: number, m = 0): number => h * 60 + m;

describe('file de la boîte de nuit', () => {
  it('est vide quand la boîte est fermée', () => {
    for (const t of [0, 17, 400]) expect(queueAt(7, 'slot-a', t, MIN(0, 30), false)).toEqual([]);
  });

  it('a au plus 6 membres, des ids uniques et des slots consécutifs depuis 0', () => {
    for (let t = 0; t < 1200; t += 7) {
      const q = queueAt(3, 'slot-a', t, MIN(0, 45), true);
      expect(q.length).toBeLessThanOrEqual(6);
      expect(new Set(q.map((m) => m.id)).size).toBe(q.length);
      q.forEach((m, i) => expect(m.slot).toBe(i));
      for (const m of q) {
        expect(m.fade).toBeGreaterThanOrEqual(0);
        expect(m.fade).toBeLessThanOrEqual(1);
        expect(m.entersAt).toBeGreaterThan(t);
      }
    }
  });

  it('est déterministe', () => {
    expect(queueAt(9, 's', 123.4, MIN(1), true)).toEqual(queueAt(9, 's', 123.4, MIN(1), true));
  });

  it('garde l’identité d’une personne qui avance, et fait entrer le slot 0 toutes les 15 à 30 s', () => {
    const entries: number[] = [];
    let last = queueAt(5, 's', 0, MIN(1), true);
    for (let t = 0.5; t < 600; t += 0.5) {
      const q = queueAt(5, 's', t, MIN(1), true);
      if (q[0]!.id !== last[0]!.id) {
        entries.push(t);
        // l'ancien slot 1 est le nouveau slot 0
        expect(last[1]?.id).toBe(q[0]!.id);
      }
      last = q;
    }
    expect(entries.length).toBeGreaterThan(10);
    for (let i = 1; i < entries.length; i++) {
      const gap = entries[i]! - entries[i - 1]!;
      expect(gap).toBeGreaterThanOrEqual(14.5);
      expect(gap).toBeLessThanOrEqual(30.5);
    }
  });

  it('n’est jamais vide pendant l’ouverture, et compte 6 personnes au plus fort (0 h-2 h)', () => {
    for (const minutes of [MIN(23), MIN(23, 30), MIN(0), MIN(1), MIN(2, 30), MIN(4, 59)])
      for (let t = 0; t < 900; t += 13) expect(queueAt(4, 's', t, minutes, true).length, `${minutes} ${t}`).toBeGreaterThan(0);
    for (const minutes of [MIN(0, 5), MIN(1), MIN(1, 55)])
      for (let t = 0; t < 900; t += 13) expect(queueAt(4, 's', t, minutes, true)).toHaveLength(6);
  });

  it('reste continue à travers plusieurs fins de cycle de 64 entrées (ids, slots, instants d’entrée)', () => {
    const cycles = new Set<string>();
    let last = queueAt(11, 'club', 0, MIN(1), true);
    // ≈ 64 × 22,5 s ≈ 24 min par cycle : 6 500 s en traversent au moins trois.
    for (let t = 0.5; t < 6500; t += 0.5) {
      const q = queueAt(11, 'club', t, MIN(1), true);
      expect(q).toHaveLength(6);
      for (const m of q) cycles.add(m.id.split(':')[0]!);
      q.forEach((m, i) => {
        expect(m.slot).toBe(i);
        if (i > 0) expect(m.entersAt).toBeGreaterThan(q[i - 1]!.entersAt);
      });
      if (q[0]!.id === last[0]!.id) {
        // Personne n'est entré : même file, mêmes instants.
        expect(q.map((m) => m.id)).toEqual(last.map((m) => m.id));
        expect(q.map((m) => m.entersAt)).toEqual(last.map((m) => m.entersAt));
      } else {
        // Une seule entrée : tout le monde avance d'un cran, la tête est entrée à son instant prévu.
        expect(q.slice(0, 5).map((m) => m.id)).toEqual(last.slice(1).map((m) => m.id));
        expect(last[0]!.entersAt).toBeLessThanOrEqual(t);
        expect(last[0]!.entersAt).toBeGreaterThan(t - 0.5);
      }
      last = q;
    }
    expect(cycles.size).toBeGreaterThanOrEqual(4);
  });

  it('diffère d’un local à l’autre', () => {
    const a = queueAt(3, 'shop-1', 300, MIN(1), true);
    const b = queueAt(3, 'shop-2', 300, MIN(1), true);
    expect(a.map((m) => m.entersAt)).not.toEqual(b.map((m) => m.entersAt));
  });

  it('est plus longue entre 0 h et 2 h qu’à 23 h 15', () => {
    const maxLen = (minutes: number): number => {
      let best = 0;
      for (let t = 0; t < 600; t += 5) best = Math.max(best, queueAt(2, 's', t, minutes, true).length);
      return best;
    };
    expect(maxLen(MIN(1))).toBeGreaterThan(maxLen(MIN(23, 15)));
  });
});

describe('cordon et videurs', () => {
  it('2 videurs seulement de 30 min avant l’ouverture à la fermeture', () => {
    expect(nightclubDoor(false, MIN(22, 29)).bouncers).toBe(0);
    expect(nightclubDoor(false, MIN(22, 30)).bouncers).toBe(2);
    expect(nightclubDoor(false, MIN(22, 59))).toEqual({ cordon: true, bouncers: 2 });
    expect(nightclubDoor(true, MIN(23))).toEqual({ cordon: true, bouncers: 2 });
    expect(nightclubDoor(true, MIN(4, 59)).bouncers).toBe(2);
    expect(nightclubDoor(false, MIN(5))).toEqual({ cordon: false, bouncers: 0 });
    expect(nightclubDoor(false, MIN(14))).toEqual({ cordon: false, bouncers: 0 });
  });
});
