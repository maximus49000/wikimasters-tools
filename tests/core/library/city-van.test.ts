// tests/core/library/city-van.test.ts
import { describe, expect, it } from 'vitest';
import { LIFT_FETCH, absMinute, decorSetsFor, footWindow, inVehicle, itemPhase, setWindow } from '../../../src/core/library/city/install';
import { dayNumber } from '../../../src/core/library/city/shops/hours';
import { TRANSPORT_SPEED, VAN_TIMING, vanAt, vanCrewAt, vanSchedule, vanVisit } from '../../../src/core/library/city/van';

const W = 1300;
const OFF = 60;
const SPEED = 25; // px/s
const visit = (park: number, first = 1000, last = 1100) => vanVisit({ park, width: W, offstage: OFF, first, last, speed: SPEED, door: 20 });

describe('camionnette : arrive, se gare, repart en roulant', () => {
  it('vient du bord le plus proche et repart en marche avant jusqu au bord opposé', () => {
    const l = visit(200);
    expect(l.edgeIn).toBe(-OFF);
    expect(l.dir).toBe(1);
    expect(l.edgeOut).toBe(W + OFF);
    const r = visit(1100);
    expect(r.edgeIn).toBe(W + OFF);
    expect(r.dir).toBe(-1);
    expect(r.edgeOut).toBe(-OFF);
    // Portière arrière : du côté d'où elle vient.
    expect(l.door).toBe(180);
    expect(r.door).toBe(1120);
  });

  it('position continue (jamais de saut au-delà de la vitesse), hors champ à l apparition et à la disparition', () => {
    for (const park of [90, 400, 650, 900, 1250]) {
      const v = visit(park);
      const dt = 0.25;
      let prev: ReturnType<typeof vanAt> = null;
      let seen = 0;
      let first: number | null = null;
      let last: number | null = null;
      for (let t = 900; t < 1200; t += dt) {
        const s = vanAt(v, t);
        if (s && prev) expect(Math.abs(s.x - prev.x), `${park} @${t}`).toBeLessThanOrEqual(SPEED * 60 * dt + 1e-6);
        if (s && !prev) {
          expect(seen, `${park} : une seule apparition`).toBe(0);
          first = s.x;
        }
        if (!s && prev) last = prev.x;
        if (s) seen++;
        prev = s;
      }
      expect(first).not.toBeNull();
      expect(last).not.toBeNull();
      expect(first! < 0 || first! > W).toBe(true);
      expect(last! < 0 || last! > W).toBe(true);
    }
  });

  it('roule dans la file de circulation et se range contre le trottoir pour se garer', () => {
    const v = vanVisit({ park: 400, width: W, offstage: OFF, first: 1000, last: 1100, speed: SPEED, door: 20, pull: 70 });
    let prev = -1;
    for (let t = 980; t < 1120; t += 0.25) {
      const s = vanAt(v, t);
      if (!s) continue;
      if (s.phase === 'parked') expect(s.lane).toBe(0);
      if (Math.abs(s.x - 400) >= 70) expect(s.lane).toBe(1);
      if (prev >= 0) expect(Math.abs(s.lane - prev)).toBeLessThanOrEqual((SPEED * 60 * 0.25) / 70 + 1e-9);
      prev = s.lane;
    }
  });

  it('garée avant le premier créneau (portière ouverte), repartie après le dernier', () => {
    const v = visit(400);
    expect(vanAt(v, 1000 - VAN_TIMING.alight)?.phase).toBe('parked');
    expect(vanAt(v, 1000 - VAN_TIMING.alight)?.door).toBe(true);
    expect(vanAt(v, 1050)?.phase).toBe('parked');
    expect(vanAt(v, 1050)?.door).toBe(false);
    expect(vanAt(v, 1100)?.door).toBe(true);
    expect(vanAt(v, 1100 + VAN_TIMING.board + 1 + VAN_TIMING.pause + 0.5)?.phase).toBe('leave');
    expect(vanAt(v, 1200)).toBeNull();
    expect(vanAt(v, 900)).toBeNull();
  });

  it('ouvriers : dans la cabine, descendent juste avant le créneau, dehors pendant, remontent à la fin', () => {
    const v = visit(400);
    expect(vanCrewAt(v, 990)).toEqual({ phase: 'inside' });
    expect(vanCrewAt(v, 1000 - VAN_TIMING.alight)).toEqual({ phase: 'alight', q: 0 });
    expect(vanCrewAt(v, 999)).toEqual({ phase: 'alight', q: 0.5 });
    expect(vanCrewAt(v, 1000)).toEqual({ phase: 'out' });
    expect(vanCrewAt(v, 1100)).toEqual({ phase: 'board', q: 0 });
    expect(vanCrewAt(v, 1101)).toEqual({ phase: 'board', q: 0.5 });
    expect(vanCrewAt(v, 1100 + VAN_TIMING.board)).toEqual({ phase: 'inside' });
    // La camionnette est garée tant qu'un ouvrier est dehors ou descend / remonte.
    for (let t = 1000 - VAN_TIMING.alight; t < 1100 + VAN_TIMING.board; t += 0.5) expect(vanAt(v, t)?.phase, `${t}`).toBe('parked');
  });
});

describe('footWindow : créneaux de l équipe à pied d une fenêtre', () => {
  it('barrières du 14/7 : de 7 h à 8 h, puis de 12 h 30 à 13 h 30', () => {
    const d14 = { y: 2026, m: 7, d: 14 };
    const set = decorSetsFor(d14, 1440, 600, 1).find((s) => s.id === 'barriers-bastille')!;
    expect(footWindow(set, false)).toEqual({ first: absMinute(dayNumber(d14), 420), last: absMinute(dayNumber(d14), 480) });
    expect(footWindow(set, true)).toEqual({ first: absMinute(dayNumber(d14), 750), last: absMinute(dayNumber(d14), 810) });
  });
  it('scène : seul le plancher est à la main (premier au montage, dernier au démontage)', () => {
    const d = { y: 2026, m: 6, d: 21 };
    const set = decorSetsFor(d, 1440, 600, 1).find((s) => s.id === 'stage-music-0')!;
    const day = dayNumber(d);
    expect(footWindow(set, false)).toEqual({ first: absMinute(day, 540), last: absMinute(day, 680) });
    expect(footWindow(set, true)).toEqual({ first: absMinute(day + 1, 160), last: absMinute(day + 1, 240) });
  });
  it('drapeaux de lampadaires : aucune équipe à pied', () => {
    const set = decorSetsFor({ y: 2026, m: 7, d: 14 }, 1440, 600, 1).find((s) => s.id === 'lamps-bastille')!;
    expect(footWindow(set, false)).toBeNull();
  });
});

describe('véhicules de transport : vélo porteur et camion plateau', () => {
  it('chaque jeu a son transport : camionnette, vélo porteur, camion plateau, plateau du camion élévateur', () => {
    const want = (id: string): string => (id.startsWith('doors-') ? 'cargo-bike' : id.startsWith('lamps-') ? 'lift' : id.startsWith('barriers-') ? 'van' : 'truck');
    let n = 0;
    for (const d of [{ y: 2026, m: 7, d: 14 }, { y: 2026, m: 6, d: 21 }, { y: 2026, m: 11, d: 11 }, { y: 2026, m: 5, d: 1 }]) {
      for (const set of decorSetsFor(d, 1440, 600, 1)) {
        n++;
        expect(set.transport, set.id).toBe(want(set.id));
        if (set.id.startsWith('stage-music') || set.id === 'beer-stands-music') expect(set.transport).toBe('truck');
      }
    }
    expect(n).toBeGreaterThan(6);
    // Déterministe : même résultat d'un appel à l'autre.
    expect(decorSetsFor({ y: 2026, m: 6, d: 21 }, 1440, 600, 1).map((s) => s.transport)).toEqual(decorSetsFor({ y: 2026, m: 6, d: 21 }, 1440, 600, 1).map((s) => s.transport));
  });

  it('vélo porteur et camion plateau : position continue à leur vitesse, arrivée et départ hors champ', () => {
    for (const kind of ['cargo-bike', 'truck'] as const) {
      const speed = TRANSPORT_SPEED[kind];
      for (const park of [90, 650, 1250]) {
        const hold = kind === 'truck' ? { from: 990, to: 1150 } : null;
        const v = vanVisit({ park, width: W, offstage: OFF, first: 1000, last: 1060, speed, door: 20, hold });
        const dt = 0.25;
        let prev: ReturnType<typeof vanAt> = null;
        let first: number | null = null;
        let last: number | null = null;
        for (let t = 800; t < 1400; t += dt) {
          const s = vanAt(v, t);
          if (s && prev) expect(Math.abs(s.x - prev.x), `${kind} ${park} @${t}`).toBeLessThanOrEqual(speed * 60 * dt + 1e-6);
          if (s && !prev) first = s.x;
          if (!s && prev) last = prev.x;
          prev = s;
        }
        expect(first! < 0 || first! > W, `${kind} arrive hors champ`).toBe(true);
        expect(last! < 0 || last! > W, `${kind} repart hors champ`).toBe(true);
      }
    }
  });

  it('camion plateau : garé pendant toute la fenêtre tenue, même après le dernier créneau à pied', () => {
    const v = vanVisit({ park: 400, width: W, offstage: OFF, first: 1000, last: 1060, speed: TRANSPORT_SPEED.truck, door: 20, hold: { from: 990, to: 1150 } });
    for (let t = 990; t <= 1150; t += 0.5) expect(vanAt(v, t)?.phase, `${t}`).toBe('parked');
    expect(vanSchedule(v).depart).toBeGreaterThan(1150);
    // Les ouvriers, eux, remontent dans la cabine après leur dernier créneau (et attendent).
    expect(vanCrewAt(v, 1100)).toEqual({ phase: 'inside' });
  });

  it('entreposé : avant la pose, après la dépose ; au camion élévateur, jusqu à la prise et dès le rangement', () => {
    const d = { y: 2026, m: 7, d: 13 };
    const lamps = decorSetsFor(d, 1440, 600, 1).find((s) => s.id === 'lamps-bastille')!;
    const doors = decorSetsFor(d, 1440, 600, 1).find((s) => s.id === 'doors-bastille')!;
    const win = setWindow(lamps, false);
    expect(win).toEqual({ from: absMinute(dayNumber(d), 540), to: absMinute(dayNumber(d), 1020) });
    let taken = 0;
    for (const item of lamps.items) {
      let prev = true;
      for (let t = win.from - 5; t < win.to + 5; t += 0.25) {
        const now = inVehicle(lamps, item, t);
        const p = itemPhase(lamps, item, t, lamps.day);
        if (prev && !now) {
          taken++;
          expect(p.phase === 'installing' && p.step === 'deploy' && p.progress >= LIFT_FETCH.from, `${item.id} pris au déploiement`).toBe(true);
        }
        if (p.phase === 'present') expect(now).toBe(false);
        prev = now;
      }
      expect(prev).toBe(false);
    }
    expect(taken).toBe(lamps.items.length);
    // Dépose : rangé au repli, puis jusqu'au départ.
    const rw = setWindow(lamps, true);
    for (const item of lamps.items) {
      let stored = 0;
      for (let t = rw.from; t < rw.to + 2; t += 0.25) {
        const p = itemPhase(lamps, item, t, lamps.day);
        if (inVehicle(lamps, item, t) && p.phase === 'removing') {
          stored++;
          expect(p.step === 'leave' || (p.step === 'stow' && p.progress >= LIFT_FETCH.to)).toBe(true);
        }
      }
      expect(stored).toBeGreaterThan(0);
      expect(inVehicle(lamps, item, rw.to + 1)).toBe(true);
    }
    // À l'échelle (vélo porteur) : entreposé tant que le créneau n'a pas commencé.
    for (const item of doors.items) expect(inVehicle(doors, item, setWindow(doors, false).from - 1)).toBe(true);
  });
});

// Bogue du 2026-10-24 : à 90-120 px par minute, les véhicules des équipes roulaient au pas.
describe('véhicules de transport : vitesse en route (px/s)', () => {
  it('camionnette et camion plateau 15-40 px/s, vélo porteur 8-20 px/s ; démarrage et arrêt doux, puis garé', () => {
    const range = { van: [15, 40], truck: [15, 40], 'cargo-bike': [8, 20] } as const;
    for (const kind of ['van', 'truck', 'cargo-bike'] as const) {
      const v = vanVisit({ park: 400, width: W, offstage: OFF, first: 1000, last: 1060, speed: TRANSPORT_SPEED[kind], door: 20 });
      let top = 0;
      let prev = vanAt(v, 900)?.x ?? null;
      for (let t = 900; t < 1200; t += 1 / 60) {
        const x = vanAt(v, t)?.x ?? null;
        if (x !== null && prev !== null) {
          const speed = Math.abs(x - prev); // px/s
          expect(speed, `${kind} @${t.toFixed(3)}`).toBeLessThanOrEqual(range[kind][1]);
          top = Math.max(top, speed);
        }
        prev = x;
      }
      expect(top, kind).toBeGreaterThanOrEqual(range[kind][0]);
      // Garée dès l'arrivée, jusqu'au départ.
      const s = vanSchedule(v);
      expect(vanAt(v, s.parked)?.x).toBe(400);
      expect(s.driveIn * 60, `${kind} : trajet en secondes`).toBeLessThan(60);
    }
  });
});
