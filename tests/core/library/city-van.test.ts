// tests/core/library/city-van.test.ts
import { describe, expect, it } from 'vitest';
import { absMinute, decorSetsFor, footWindow } from '../../../src/core/library/city/install';
import { dayNumber } from '../../../src/core/library/city/shops/hours';
import { VAN_TIMING, vanAt, vanCrewAt, vanVisit } from '../../../src/core/library/city/van';

const W = 1300;
const OFF = 60;
const SPEED = 120;
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
        if (s && prev) expect(Math.abs(s.x - prev.x), `${park} @${t}`).toBeLessThanOrEqual(SPEED * dt + 1e-6);
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
      if (prev >= 0) expect(Math.abs(s.lane - prev)).toBeLessThanOrEqual((SPEED * 0.25) / 70 + 1e-9);
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
