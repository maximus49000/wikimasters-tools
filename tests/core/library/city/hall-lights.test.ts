import { describe, expect, it } from 'vitest';
import { doorsFor, tripAt, tripsFor, type Trip } from '../../../../src/core/library/city/doors';
import { HALL_TIMER_S, RETURN_WINDOW_MIN, STAIR_RETURN_S, climbRun, crossingDoorX, hookKey, hallLit, passageDir, passageFloors, returnFloor, seedHallTimers, seedStairFloors, stairCountTo, stairFigureAt, stairFloorsLit, stairNewPassage } from '../../../../src/core/library/city/hall-lights';
import type { Dwelling } from '../../../../src/core/library/city/households';
import type { Schedule, Segment } from '../../../../src/core/library/city/schedules';

const W = 1440;
const trips = tripsFor(doorsFor(W, 340, 1), 1, W);

// Premier instant (au demi-seconde) où le trajet est sur un seuil, à partir de `from`.
function firstThreshold(trip: Trip, from: number): number {
  for (let s = from; s < from + 400; s += 0.5) if (tripAt(trip, W, s)?.stage === 'threshold') return s;
  throw new Error('aucun seuil');
}

describe('minuterie des halls', () => {
  it('allumé seulement de nuit, tant que la minuterie court', () => {
    const until = new Map([[100, 500]]);
    expect(hallLit(until, 100, 499, true)).toBe(true);
    expect(hallLit(until, 100, 501, true)).toBe(false);
    expect(hallLit(until, 100, 499, false)).toBe(false);
    expect(hallLit(until, 200, 0, true)).toBe(false);
  });

  it('un passage allume le hall de sa porte pendant 2 minutes, puis il s’éteint', () => {
    const trip = trips.find((tr) => tr.kind === 'out')!;
    const s0 = firstThreshold(trip, 1000);
    const only = (tr: Trip): number => (tr === trip ? 1 : 0);
    const door = crossingDoorX(trip, tripAt(trip, W, s0)!);
    expect(hallLit(seedHallTimers(trips, W, s0 + 60, only), door, s0 + 60, true)).toBe(true);
    // Le seuil dure 1 s : 2 minutes après sa fin, plus rien.
    const late = s0 + 1 + HALL_TIMER_S + 1;
    expect(hallLit(seedHallTimers(trips, W, late, only), door, late, true)).toBe(false);
  });

  it('personne ne passe : aucun hall allumé', () => {
    const until = seedHallTimers(trips, W, 5000, () => 0);
    expect(until.size).toBe(0);
  });

  it('un habitant qui arrive à une autre entrée allume le hall de cette entrée', () => {
    const trip = trips.find((tr) => tr.kind === 'out' && tr.endDoorX !== null)!;
    const leave = firstThreshold(trip, 0);
    // Après le seuil de départ, le prochain seuil est celui d'arrivée, à l'autre porte.
    let s = leave + 2;
    while (tripAt(trip, W, s)?.stage !== 'threshold') s += 0.5;
    expect(crossingDoorX(trip, tripAt(trip, W, leave)!)).toBe(trip.doorX);
    expect(crossingDoorX(trip, tripAt(trip, W, s)!)).toBe(trip.endDoorX);
  });
});

describe('cage d’escalier : étage atteint', () => {
  it('cage : étage atteint entre 1 et floors, déterministe', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const doorX = 100 + (i % 20) * 37.5;
      const until = 1000 + i * 3.5;
      const f = stairFloorsLit(doorX, until, 6);
      expect(Number.isInteger(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(6);
      expect(stairFloorsLit(doorX, until, 6)).toBe(f);
      seen.add(f);
    }
    expect(seen.size).toBe(6);
    expect(stairFloorsLit(250, 42, 1)).toBe(1);
    expect(stairFloorsLit(250, 42, 0)).toBe(0);
    expect(stairFloorsLit(250, 42, -3)).toBe(0);
  });
});

describe('cage d’escalier : un tirage par passage', () => {
  it('nouveau passage : porte éteinte ou minuterie relancée après plus d’un seuil ; même passage tant qu’il reste sur le seuil', () => {
    expect(stairNewPassage(undefined, 1120, 1000)).toBe(true);
    expect(stairNewPassage(990, 1120, 1000)).toBe(true); // minuterie échue
    expect(stairNewPassage(1119.97, 1120, 1000)).toBe(false); // image suivante sur le seuil
    expect(stairNewPassage(1119.2, 1120, 1000)).toBe(false);
    expect(stairNewPassage(1110, 1120, 1000)).toBe(true); // autre habitant 10 s plus tard
  });

  it('au montage : un étage par porte à cage dont la minuterie est amorcée', () => {
    const stairs = new Map<number, unknown[]>([[10, [1, 2, 3]], [20, [1, 2]]]);
    const got = seedStairFloors(new Map([[10, 1234.5], [30, 99]]), stairs);
    expect([...got]).toEqual([[10, stairFloorsLit(10, 1234.5, 3)]]);
  });
});

// Foyer minimal : seuls doorX, floorIdx et climb comptent pour les retours.
const home = (id: string, doorX: number | null, floorIdx: number): Dwelling => ({ id, doorX, floorIdx, climb: 0.35 + 0.22 * (floorIdx + 1) }) as unknown as Dwelling;
const sched = (id: string, segments: Segment[]): Schedule => ({ dwelling: id, segments, shutUser: false, maxActors: 1 });
// Fenêtres de cage : un niveau par fenêtre, avec un entresol (niveau 0) sans fenêtre de cage.
const wins = [1, 2, 3, 4].map((level) => ({ level }));

describe('retours accrochés aux passages', () => {
  const dws = [home('a', 300, 1), home('b', 300, 3), home('c', 500, 2)];
  const scheds = new Map([
    ['a', sched('a', [{ k: 'depart', t: 8 * 60, m: 0 }, { k: 'return', t: 18 * 60 + 40, m: 0 }])],
    ['b', sched('b', [{ k: 'return', t: 19 * 60, m: 0 }, { k: 'return', t: 19 * 60 + 5, m: 1 }])],
    ['c', sched('c', [{ k: 'return', t: 19 * 60, m: 0 }])],
  ]);

  it('passage entrant dans la fenêtre de retour → étage du foyer', () => {
    // 18 h 58 : b (19 h) est plus proche que a (18 h 40) ; c a une autre porte.
    expect(returnFloor(dws, scheds, 300, 18 * 60 + 58, 'in')).toBe(3);
    expect(returnFloor(dws, scheds, 300, 18 * 60 + 25, 'in')).toBe(1);
    // L'habitant passe la porte avant l'heure de son retour (son logement s'allume ensuite, à l'heure prévue + la montée) :
    // un passage après l'heure du retour n'est plus ce retour (le logement est déjà allumé) ; à 18 h 45, celui de b (19 h).
    expect(returnFloor(dws, scheds, 300, 18 * 60 + 45, 'in')).toBe(3);
    expect(returnFloor(dws, scheds, 500, 19 * 60 + 1, 'in')).toBeNull();
    // Départ : la sortie suit l'heure du départ (le logement s'est éteint avant la descente), jamais avant.
    expect(returnFloor(dws, scheds, 300, 7 * 60 + 55, 'out')).toBeNull();
    expect(returnFloor(dws, scheds, 500, 19 * 60 - RETURN_WINDOW_MIN, 'in')).toBe(2);
    // Départ du matin : un passage sortant à 8 h 10 est celui de a ; un passage entrant à la même heure n'est le retour de personne.
    expect(returnFloor(dws, scheds, 300, 8 * 60 + 10, 'out')).toBe(1);
    expect(returnFloor(dws, scheds, 300, 8 * 60 + 10, 'in')).toBeNull();
    // Étage du foyer → fenêtres de cage allumées jusqu'à son niveau (l'entresol n'en a pas).
    const got = passageFloors(dws, scheds, wins, 300, 1234, 18 * 60 + 58, 'in');
    expect(got.home?.id).toBe('b');
    expect(got.floors).toBe(stairCountTo(wins, 3));
    expect(got.floors).toBe(3);
    // Un retour n'est accroché qu'une fois : le passage suivant prend le retour le plus proche encore libre.
    expect(got.key).toBe(hookKey(dws[1]!, 'return', 19 * 60));
    expect(passageFloors(dws, scheds, wins, 300, 1234, 18 * 60 + 58, 'in', new Set([got.key!])).key).toBe(hookKey(dws[1]!, 'return', 19 * 60 + 5));
    expect(returnFloor(dws, scheds, 300, 18 * 60 + 58, 'in')).toBe(3);
    expect(STAIR_RETURN_S).toBe(180);
    expect(HALL_TIMER_S).toBe(120);
  });

  it('hors fenêtre → étage tiré comme avant', () => {
    expect(returnFloor(dws, scheds, 300, 12 * 60, 'in')).toBeNull();
    expect(returnFloor(dws, scheds, 500, 19 * 60 + RETURN_WINDOW_MIN + 1, 'in')).toBeNull();
    const got = passageFloors(dws, scheds, wins, 300, 1234, 12 * 60, 'in');
    expect(got.home).toBeNull();
    expect(got.floors).toBe(stairFloorsLit(300, 1234, wins.length));
  });

  it('immeuble sans porte : null, aucun plantage', () => {
    const none = [home('z', null, 2)];
    const s = new Map([['z', sched('z', [{ k: 'return', t: 19 * 60, m: 0 }])]]);
    expect(returnFloor(none, s, 300, 19 * 60, 'in')).toBeNull();
    expect(returnFloor([], new Map(), 300, 19 * 60, 'in')).toBeNull();
    // Logement sans emploi du temps : ignoré.
    expect(returnFloor([home('y', 300, 1)], new Map(), 300, 19 * 60, 'in')).toBeNull();
    expect(passageFloors(none, s, [], 300, 1234, 19 * 60, 'in')).toEqual({ floors: 0, home: null });
  });

  it('sens du passage : seuil de départ = sortie, seuil d’arrivée = entrée', () => {
    const trip = trips.find((tr) => tr.kind === 'out' && tr.endDoorX !== null)!;
    const leave = firstThreshold(trip, 0);
    let s = leave + 2;
    while (tripAt(trip, W, s)?.stage !== 'threshold') s += 0.5;
    expect(passageDir(tripAt(trip, W, leave)!)).toBe('out');
    expect(passageDir(tripAt(trip, W, s)!)).toBe('in');
  });

  it('silhouette : un étage à la fois, du rez-de-chaussée à l’étage du foyer', () => {
    const b = dws[1]!;
    const up = climbRun(b, 3, 1000, 'in');
    // Montée : 10 s après le seuil, pendant la montée du foyer moins 12 s.
    expect(up.start).toBe(1010);
    expect(up.dur).toBeCloseTo(b.climb * 60 - 12, 6);
    const seq: number[] = [];
    for (let t = 990; t < up.start + up.dur + 20; t += 0.25) {
      const k = stairFigureAt(up, t);
      if (seq[seq.length - 1] !== k) seq.push(k);
    }
    // Rien avant, puis chaque fenêtre de cage une seule fois, du bas vers l'étage du foyer, puis plus rien.
    expect(seq).toEqual([-1, 0, 1, 2, -1]);
    // Départ : la descente finit 12 s avant la sortie (à 2000), de l'étage du foyer au rez-de-chaussée.
    const down = climbRun(b, 3, 2000, 'out');
    expect(down.start).toBeCloseTo(2000 - b.climb * 60 + 2, 6);
    expect(down.start + down.dur).toBeCloseTo(2000 - 12, 6);
    const seq2: number[] = [];
    for (let t = down.start - 5; t < 2010; t += 0.25) {
      const k = stairFigureAt(down, t);
      if (seq2[seq2.length - 1] !== k) seq2.push(k);
    }
    expect(seq2).toEqual([-1, 2, 1, 0, -1]);
    // Sans fenêtre de cage : jamais de silhouette.
    expect(stairFigureAt(climbRun(b, 0, 1000, 'in'), 1015)).toBe(-1);
  });
});
