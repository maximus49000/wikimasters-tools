// tests/core/library/city-beer.test.ts
import { describe, expect, it } from 'vitest';
import {
  BEER_MAX_SPEED,
  MAX_QUEUE,
  SERVE_HOURS,
  beerSchedule,
  beerServers,
  customerAt,
  queueAt,
  serverAt,
  servingOpen,
  type BeerSchedule,
} from '../../../src/core/library/city/beer';
import { absMinute, beerStandsFor, decorSetsFor, itemPhase } from '../../../src/core/library/city/install';
import { dayNumber } from '../../../src/core/library/city/shops/hours';

const W = 1440;
const H = 600;
const UNIT = H / 340;
const SEED = 4242;
const D21 = { y: 2026, m: 6, d: 21 };
const DAY = dayNumber(D21);
const set = decorSetsFor(D21, W, H, SEED).find((s) => s.id === 'beer-stands-music')!;
const stands = beerStandsFor(W, H, SEED);
const DOORS = [100, 300, 520, 700, 980, 1200, 1390];
const sched = (k = 0, seed = SEED): BeerSchedule => beerSchedule({ seed, stand: stands[k]!, day: DAY, width: W, unit: UNIT, doors: DOORS });
const OPEN = absMinute(DAY, SERVE_HOURS.from);
const CLOSE = absMinute(DAY, SERVE_HOURS.to);

describe('servingOpen', () => {
  it('de 17 h à 1 h, seulement comptoir et auvent posés', () => {
    const id = stands[0]!.id;
    expect(SERVE_HOURS).toEqual({ from: 1020, to: 1500 });
    expect(servingOpen(set, id, OPEN - 0.01)).toBe(false);
    expect(servingOpen(set, id, OPEN)).toBe(true);
    expect(servingOpen(set, id, absMinute(DAY + 1, 0))).toBe(true);
    expect(servingOpen(set, id, CLOSE - 0.01)).toBe(true);
    expect(servingOpen(set, id, CLOSE)).toBe(false);
    expect(servingOpen(set, 'stand-inconnu', OPEN + 60)).toBe(false);
  });
  it('fermé si le comptoir ou l’auvent n’est pas posé (jeu décalé dans le temps)', () => {
    // Même jeu, fenêtre de montage repoussée : à 17 h, le stand n'est pas encore posé.
    const late = { ...set, install: { dayOffset: 0, from: 1000, to: 1300 } };
    const id = stands[0]!.id;
    const counter = late.items.find((i) => i.id === `${id}-counter`)!;
    const awning = late.items.find((i) => i.id === `${id}-awning`)!;
    for (let t = OPEN; t < CLOSE; t += 1) {
      const posed = itemPhase(late, counter, t, DAY).phase === 'present' && itemPhase(late, awning, t, DAY).phase === 'present';
      expect(servingOpen(late, id, t)).toBe(posed);
    }
  });
});

describe('beerSchedule', () => {
  it('est déterministe et dépend de la graine et du stand', () => {
    expect(sched(0)).toEqual(sched(0));
    expect(sched(0).customers.slice(0, 5).map((c) => c.arrive)).not.toEqual(sched(1).customers.slice(0, 5).map((c) => c.arrive));
    expect(sched(0, 1).customers[0]!.arrive).not.toBe(sched(0, 2).customers[0]!.arrive);
  });
  it('arrive ≤ start < end < leave, FIFO, service pendant les heures d’ouverture et stand posé', () => {
    const s = sched(0);
    expect(s.customers.length).toBeGreaterThan(1000);
    let prev = -Infinity;
    for (const c of s.customers) {
      expect(c.walkIn).toBeLessThanOrEqual(c.arrive);
      expect(c.arrive).toBeLessThanOrEqual(c.start);
      expect(c.start).toBeLessThan(c.end);
      expect(c.end).toBeLessThan(c.leave);
      expect(c.start).toBeGreaterThanOrEqual(prev);
      prev = c.start;
      expect(c.start).toBeGreaterThanOrEqual(OPEN);
      expect(c.end).toBeLessThanOrEqual(CLOSE);
      expect(servingOpen(set, s.stand.id, c.start)).toBe(true);
      expect(servingOpen(set, s.stand.id, c.end - 1e-6)).toBe(true);
    }
  });
  it('un service dure environ 14 s, deux serveurs : jamais plus de deux clients servis à la fois', () => {
    const s = sched(0);
    const dur = s.customers.map((c) => (c.end - c.start) * 60);
    const mean = dur.reduce((a, b) => a + b, 0) / dur.length;
    expect(mean).toBeGreaterThan(12);
    expect(mean).toBeLessThan(16);
    for (let t = OPEN; t < CLOSE; t += 0.05) {
      const served = s.customers.filter((c) => c.start <= t && t < c.end);
      expect(served.length).toBeLessThanOrEqual(2);
      expect(new Set(served.map((c) => c.server)).size).toBe(served.length);
    }
  }, 40000);
  it('arrivées toutes les 8 à 14 s en moyenne hors pointe, plus soutenues de 19 h à 23 h', () => {
    const s = sched(0);
    const count = (from: number, to: number): number => s.customers.filter((c) => c.arrive >= absMinute(DAY, from) && c.arrive < absMinute(DAY, to)).length;
    const calm = count(1020, 1140) / 120; // par minute, 17 h-19 h
    const peak = count(1200, 1320) / 120; // 20 h-22 h
    expect(60 / calm).toBeGreaterThan(7);
    expect(60 / calm).toBeLessThan(15);
    expect(peak).toBeGreaterThan(calm * 1.3);
  });
  it('une vraie file : elle se forme en pointe, ne dépasse jamais MAX_QUEUE (8) et se vide', () => {
    for (const k of [0, 1, 2]) {
      const s = sched(k);
      let longest = 0;
      let empty = 0;
      for (let t = OPEN - 5; t < CLOSE + 5; t += 1 / 12) {
        const waiting = queueAt(s, t).filter((p) => p.mode === 'waiting');
        expect(waiting.length).toBeLessThanOrEqual(MAX_QUEUE);
        longest = Math.max(longest, waiting.length);
        if (waiting.length === 0) empty++;
        // Rangs distincts, consécutifs depuis 0.
        expect(waiting.map((p) => p.rank).sort((a, b) => a! - b!)).toEqual(waiting.map((_, i) => i));
      }
      expect(MAX_QUEUE).toBe(8);
      expect(longest).toBeGreaterThanOrEqual(5);
      expect(empty).toBeGreaterThan(0);
      expect(queueAt(s, CLOSE + 10)).toEqual([]);
    }
  }, 40000);
});

describe('queueAt : positions', () => {
  it('jamais de saut : écart ≤ vitesse × dt (marche, avancée d’un cran, pas vers le comptoir)', () => {
    const s = sched(1);
    const dt = 0.25 / 60; // 0,25 s
    for (const [from, to] of [[OPEN - 3, OPEN + 25], [absMinute(DAY, 1230), absMinute(DAY, 1250)], [CLOSE - 15, CLOSE + 5]] as const) {
      let prev = new Map<string, { x: number; depth: number }>();
      for (let t = from; t < to; t += dt) {
        const now = new Map(queueAt(s, t).map((p) => [p.id, p]));
        for (const [id, p] of now) {
          const b = prev.get(id);
          if (b) expect(Math.hypot(p.x - b.x, (p.depth - b.depth) * UNIT), `${id} @${t}`).toBeLessThanOrEqual(BEER_MAX_SPEED * UNIT * dt * 60 + 1e-6);
        }
        prev = new Map([...now].map(([id, p]) => [id, { x: p.x, depth: p.depth }]));
      }
    }
  }, 40000);
  it('entre et sort hors champ ou par une entrée d’immeuble (fondu à la porte seulement)', () => {
    const s = sched(2);
    for (const c of s.customers.slice(0, 300)) {
      const first = customerAt(s, c, c.walkIn + 1e-6);
      const last = customerAt(s, c, c.leave - 1e-6);
      expect(customerAt(s, c, c.walkIn - 0.01).mode).toBe('absent');
      expect(customerAt(s, c, c.leave + 0.01).mode).toBe('absent');
      expect(first.mode).toBe('walking-in');
      expect(last.mode).toBe('leaving');
      if (c.fromDoor) expect(DOORS).toContain(first.x);
      else expect(first.x < 0 || first.x > W).toBe(true);
      if (c.toDoor) expect(DOORS.some((d) => Math.abs(d - last.x) < 0.5)).toBe(true);
      else expect(last.x < 0 || last.x > W).toBe(true);
      // Fondu seulement à l'encadrement d'une porte, jamais en file ni au comptoir.
      for (const t of [c.arrive, (c.arrive + c.start) / 2, (c.start + c.end) / 2]) expect(customerAt(s, c, t).fade).toBeUndefined();
      expect(customerAt(s, c, (c.start + c.end) / 2).mode).toBe('being-served');
      expect(customerAt(s, c, c.end + 1e-4).drinking).toBe(true);
      expect(customerAt(s, c, c.arrive - 1e-4).drinking).toBe(false);
    }
  });
  it('la file s’étire du côté tiré du stand, en s’éloignant du comptoir', () => {
    const s = sched(0);
    const side = s.stand.side;
    for (let t = absMinute(DAY, 1230); t < absMinute(DAY, 1240); t += 0.5) {
      const waiting = queueAt(s, t).filter((p) => p.mode === 'waiting').sort((a, b) => a.rank! - b.rank!);
      for (const p of waiting) expect(Math.sign(p.x - s.stand.x)).toBe(side);
      for (let i = 1; i < waiting.length; i++) expect((waiting[i]!.x - waiting[i - 1]!.x) * side).toBeGreaterThan(0);
    }
  });
});

describe('serveurs', () => {
  it('deux par stand, en place pendant le service, arrivés et repartis à pied (jamais d’apparition sur place)', () => {
    const s = sched(0);
    const servers = beerServers({ seed: SEED, stand: s.stand, day: DAY, width: W, unit: UNIT, doors: DOORS });
    expect(servers).toHaveLength(2);
    for (const v of servers) {
      expect(v.arrive).toBeLessThanOrEqual(OPEN);
      expect(v.depart).toBeGreaterThanOrEqual(CLOSE);
      for (let t = OPEN; t < CLOSE; t += 5) expect(serverAt(v, t).mode).toBe('serving');
      const dt = 0.25 / 60;
      let prev = serverAt(v, v.arrive - 30);
      expect(prev.mode).toBe('absent');
      for (const [a, b] of [[v.arrive - 30, v.arrive + 1], [v.depart - 1, v.depart + 30]] as const) {
        prev = serverAt(v, a);
        for (let t = a; t < b; t += dt) {
          const p = serverAt(v, t);
          if (p.mode !== 'absent' && prev.mode !== 'absent') expect(Math.hypot(p.x - prev.x, (p.depth - prev.depth) * UNIT)).toBeLessThanOrEqual(BEER_MAX_SPEED * UNIT * dt * 60 + 1e-6);
          if (p.mode !== prev.mode && (p.mode === 'absent' || prev.mode === 'absent')) {
            const x = p.mode === 'absent' ? prev.x : p.x;
            expect(x < 0 || x > W || DOORS.includes(x) || DOORS.some((d) => Math.abs(d - x) < 0.5)).toBe(true);
          }
          prev = p;
        }
      }
      expect(serverAt(v, v.depart + 30).mode).toBe('absent');
    }
    // Tirage : certains repartent à la fermeture, d'autres restent jusqu'à l'équipe de nuit (2 h 30).
    const all = [0, 1, 2, 3, 4, 5].flatMap((k) => beerServers({ seed: SEED, stand: stands[k]!, day: DAY, width: W, unit: UNIT, doors: DOORS }));
    expect(all.some((v) => v.stays)).toBe(true);
    expect(all.some((v) => !v.stays)).toBe(true);
    for (const v of all) if (v.stays) expect(v.depart).toBe(absMinute(DAY + 1, 150));
  });
});
