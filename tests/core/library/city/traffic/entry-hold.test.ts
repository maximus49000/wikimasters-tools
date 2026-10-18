import { describe, expect, it } from 'vitest';
import { DT, HOLD_MAX_S, MARGIN, advance, scheduledCrew, warmTraffic, type Agent, type ScheduledArrival, type TrafficEnv, type TrafficWorld } from '../../../../../src/core/library/city/traffic/engine';
import { specialArt } from '../../../../../src/core/library/city/traffic/special-art';

// Habitants 3D : un véhicule dont un personnage attend sa 3D est retenu juste hors champ (≤ HOLD_MAX_S), sans chevauchement ;
// sans attente (interrupteur à false), le moteur est strictement celui d'avant.
const env = (d: number, extra: Partial<TrafficEnv> = {}): TrafficEnv => ({ demand: { near: d, far: d, bike: d * 0.4 }, closed: false, arrivals: [], deliveries: [], crowd: 0.6, crossPx: 90, ...extra });
const T0 = 1_800_000_000;
const world = (e: TrafficEnv, seed = 1): TrafficWorld => warmTraffic({ width: 1080, seed, unit: 1, startS: T0 }, e);
const front = (a: Agent): number => a.s + a.half;
const gate = (w: TrafficWorld): number => MARGIN * w.unit;
function overlaps(w: TrafficWorld): string[] {
  const bad: string[] = [];
  for (const road of [['near', 'bike'], ['far']] as const) {
    const list = w.agents.filter((a) => (road as readonly string[]).includes(a.track)).sort((p, q) => q.s - p.s);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]!;
      const b = list[i]!;
      if (b.passing === a.id || a.passing === b.id || a.pulled || b.pulled || a.kind === 'ambulance' || b.kind === 'ambulance') continue;
      if (b.s + b.half > a.s - a.half + 0.01) bad.push(`${b.id}→${a.id}`);
    }
  }
  return bad;
}
const snap = (w: TrafficWorld): string => JSON.stringify(w.agents.map((a) => [a.id, a.kind, a.s.toFixed(4), a.v.toFixed(4), a.stop, a.special?.seed ?? null]));

describe('véhicules retenus hors champ (habitants 3D)', () => {
  it('chaque véhicule qui attend reste hors champ HOLD_MAX_S au plus, sans chevauchement', () => {
    const e = env(1);
    const w = world(e);
    const wait = new Set<string>();
    const first = new Map<string, number>(); // premier pas où le véhicule attend, avant le bord
    const crossed = new Map<string, number>();
    let held = 0;
    for (let t = T0 + DT; t < T0 + 600; t += DT) {
      // Tout véhicule pas encore entré attend sa 3D (pire cas : la 3D n'arrive jamais).
      wait.clear();
      for (const a of w.agents) if (front(a) <= gate(w)) wait.add(a.id);
      for (const a of w.agents) if (wait.has(a.id) && !first.has(a.id)) first.set(a.id, w.t);
      advance(w, t, e, wait);
      expect(overlaps(w)).toEqual([]);
      for (const a of w.agents) {
        if (front(a) > gate(w) && !crossed.has(a.id)) {
          crossed.set(a.id, w.t);
          const since = first.get(a.id);
          if (since !== undefined) {
            // Entré seulement après l'attente maximale (la 3D n'arrive jamais), et pas bien plus tard.
            expect(w.t - since).toBeGreaterThanOrEqual(HOLD_MAX_S - 1e-6);
            if (w.t - since > HOLD_MAX_S + 0.5) held++;
          }
        }
      }
    }
    expect(crossed.size).toBeGreaterThan(50);
    // Ceux qui entrent bien après la limite sont ceux qui suivent un véhicule retenu (file naturelle), pas des retenus.
    expect(held).toBeLessThan(crossed.size);
  });

  it('3D prête : le véhicule repart aussitôt ; jamais retenu une fois entré', () => {
    const arrivals: ScheduledArrival[] = [{ key: 'bus-a', kind: 'bus', track: 'near', start: T0 + 5, line: 0 }];
    const e = env(0, { arrivals, timetable: true });
    const w = world(e);
    const wait = new Set<string>();
    let bus: Agent | undefined;
    let readyAt = 0;
    let crossedAt = 0;
    for (let t = T0 + DT; t < T0 + 60; t += DT) {
      bus = w.agents.find((a) => a.event === 'bus-a') ?? bus;
      if (bus && !readyAt && w.t < T0 + 6.5) wait.add(bus.id);
      if (bus && !readyAt && w.t >= T0 + 6.5) { wait.delete(bus.id); readyAt = w.t; }
      if (bus && crossedAt) wait.add(bus.id); // une fois entré, plus aucune attente ne le retient
      advance(w, t, e, wait);
      if (bus && !crossedAt && front(bus) > gate(w)) crossedAt = w.t;
    }
    expect(readyAt).toBeGreaterThan(0);
    expect(crossedAt).toBeGreaterThan(readyAt);
    expect(crossedAt - readyAt).toBeLessThan(2.5);
    expect(bus!.s).toBeGreaterThan(gate(w) + 200); // reparti, toujours en route ou à l'arrêt plus loin
  });

  it('bus à horaires : un bus retenu n’arrive à l’arrêt que ≤ HOLD_MAX_S + 2 s plus tard', () => {
    const arrivals: ScheduledArrival[] = [{ key: 'bus-b', kind: 'bus', track: 'near', start: T0 + 5, line: 1 }];
    const e = env(0, { arrivals, timetable: true });
    const atStop = (hold: boolean): number => {
      const w = world(e);
      const wait = new Set<string>();
      for (let t = T0 + DT; t < T0 + 90; t += DT) {
        const b = w.agents.find((a) => a.event === 'bus-b');
        if (b && hold) wait.add(b.id);
        advance(w, t, e, wait);
        if (b?.stop === 'bus') return w.t;
      }
      return Infinity;
    };
    const free = atStop(false);
    const late = atStop(true);
    expect(free).toBeLessThan(Infinity);
    expect(late - free).toBeGreaterThan(HOLD_MAX_S - 1);
    expect(late - free).toBeLessThan(HOLD_MAX_S + 2);
  });

  it('interrupteur à false (aucune attente) : horaires et positions identiques', () => {
    const arrivals: ScheduledArrival[] = [
      { key: 'b1', kind: 'bus', track: 'near', start: T0 + 20, line: 0 },
      { key: 't1', kind: 'tram', track: 'far', start: T0 + 50 },
    ];
    const e = env(0.8, { arrivals, timetable: true });
    const a = world(e);
    const b = world(e);
    const c = world({ ...e, keyedCrews: true });
    const none = new Set<string>();
    for (let t = T0; t < T0 + 300; t += 0.5) {
      advance(a, t, e);
      advance(b, t, e, none);
      advance(c, t, { ...e, keyedCrews: true }, none);
      expect(snap(b)).toEqual(snap(a));
      // Occupants tirés de la clé : seule la graine du modèle change, jamais la marche.
      expect(snap(c).replace(/,(-?\d+|null)\]/g, ']')).toEqual(snap(a).replace(/,(-?\d+|null)\]/g, ']'));
      expect(a.nextBus).toEqual(b.nextBus);
    }
  });

  it('occupants d’une arrivée planifiée connus avant son entrée (préparés d’avance)', () => {
    const arrivals: ScheduledArrival[] = [
      { key: 'bus-c', kind: 'bus', track: 'near', start: T0 + 30, line: 2 },
      { key: 'tram-c', kind: 'tram', track: 'far', start: T0 + 30 },
    ];
    const e = env(0.6, { arrivals, timetable: true, keyedCrews: true });
    const w = world(e);
    const before = arrivals.map((x) => scheduledCrew(w, x));
    expect(before.every((x) => x !== null)).toBe(true);
    advance(w, T0 + 60, e);
    for (const [i, x] of arrivals.entries()) {
      const a = w.agents.find((g) => g.event === x.key)!;
      expect(a).toBeDefined();
      expect(specialArt(a.special!).seats.map((s) => s.outfitSeed)).toEqual(specialArt(before[i]!).seats.map((s) => s.outfitSeed));
    }
  });
});
