// tests/core/library/city-music-crowd.test.ts
import { describe, expect, it } from 'vitest';
import { BEER_MAX_SPEED, COUNTER_HALF, STAND_DEPTH } from '../../../src/core/library/city/beer';
import { absMinute, beerStandsFor, stageXs } from '../../../src/core/library/city/install';
import { CROWD_STEP, STAGE_ZONE, musicCrowdAt, musicCrowdFor, standBlocks, type MusicSpectator } from '../../../src/core/library/city/music-crowd';
import { dayNumber } from '../../../src/core/library/city/shops/hours';
import { walkAt, walkDuration } from '../../../src/core/library/city/walk-path';
import { YAW_BACK, YAW_FRONT, yawToward } from '../../../src/core/library/figure/gait';

const W = 1440;
const H = 600;
const UNIT = H / 340;
const SEED = 99;
const DAY = dayNumber({ y: 2026, m: 6, d: 21 });
const DOORS = [90, 260, 470, 650, 830, 1010, 1220, 1380];
const stages = stageXs(W, SEED);
const stands = beerStandsFor(W, H, SEED);
const crowd = musicCrowdFor({ seed: SEED, width: W, day: DAY, stages, stands, doors: DOORS, unit: UNIT });
const at = (h: number, m = 0): number => absMinute(DAY, h * 60 + m);

describe('musicCrowdFor', () => {
  it('est déterministe et dépend de la graine', () => {
    expect(musicCrowdFor({ seed: SEED, width: W, day: DAY, stages, stands, doors: DOORS, unit: UNIT })).toEqual(crowd);
    const other = musicCrowdFor({ seed: SEED + 1, width: W, day: DAY, stages, stands, doors: DOORS, unit: UNIT });
    expect(other.map((s) => s.x)).not.toEqual(crowd.map((s) => s.x));
  });
  it('dense devant chaque scène (≈ 1 spectateur toutes les 8 unités par rang, plusieurs rangs), sur la chaussée', () => {
    stages.forEach((xs, k) => {
      const front = crowd.filter((s) => s.zone === 'stage' && s.stage === k);
      const inZone = front.filter((s) => Math.abs(s.x - xs) <= STAGE_ZONE * UNIT);
      // Quatre rangs d'environ 2 × 80 / 8 = 20 spectateurs dans la zone (moins ceux qu'écarte un stand voisin).
      expect(inZone.length, `scène ${k}`).toBeGreaterThan(50);
      expect(inZone.length).toBeLessThan(110);
      expect(CROWD_STEP).toBe(8);
      for (const s of front) {
        expect(s.depth).toBeGreaterThan(0);
        expect(s.depth).toBeLessThan(40);
        // Tourné vers la scène.
        expect(s.dir).toBe(s.x < xs ? 1 : -1);
      }
      // Demi-cercle : au centre, plus loin du trottoir que sur les bords.
      const mid = front.filter((s) => Math.abs(s.x - xs) < 15 * UNIT);
      const edge = front.filter((s) => Math.abs(s.x - xs) > 75 * UNIT);
      expect(Math.max(...mid.map((s) => s.depth))).toBeGreaterThan(Math.max(...edge.map((s) => s.depth)));
      expect(front.filter((s) => s.dance).length).toBeGreaterThan(front.length / 2);
    });
  });
  it('des petits groupes autour des stands, du côté opposé à la file, et personne sur un comptoir', () => {
    for (const st of stands) {
      const group = crowd.filter((s) => s.zone === 'stand' && Math.abs(s.x - st.x) < 90 * UNIT && (s.x - st.x) * st.side < 0);
      expect(group.length, st.id).toBeGreaterThanOrEqual(4);
      expect(group.every((s) => s.beer && s.depth > STAND_DEPTH)).toBe(true);
    }
    for (const s of crowd) expect(standBlocks(stands, UNIT, s.x, s.depth), s.id).toBe(false);
    // Personne au milieu d'un comptoir (serveurs et clients servis compris).
    for (const st of stands) expect(standBlocks(stands, UNIT, st.x, STAND_DEPTH)).toBe(true);
    expect(COUNTER_HALF).toBeGreaterThan(0);
    expect(crowd.filter((s) => s.zone === 'back').length).toBeGreaterThan(5);
  });
});

describe('musicCrowdAt', () => {
  const sample = crowd.filter((_, i) => i % 3 === 0);
  it('arrivée à pied entre 17 h et 20 h, départ à pied entre 23 h 30 et 1 h, foule complète entre 20 h 30 et 23 h 30', () => {
    for (const s of crowd) {
      expect(musicCrowdAt(s, at(16, 59)).mode).toBe('absent');
      expect(s.walkIn).toBeGreaterThanOrEqual(at(17));
      expect(s.walkIn).toBeLessThanOrEqual(at(20));
      expect(s.leave).toBeGreaterThanOrEqual(at(23, 30));
      expect(s.leave).toBeLessThanOrEqual(at(25));
      for (const t of [at(20, 30), at(22), at(23, 29)]) expect(musicCrowdAt(s, t).mode).toBe('standing');
      expect(musicCrowdAt(s, s.gone + 0.01).mode).toBe('absent');
    }
  });
  it('n’apparaît et ne disparaît qu’hors champ ou à une entrée d’immeuble (seuil de la porte, jamais de fondu)', () => {
    for (const s of crowd) {
      for (const p of [musicCrowdAt(s, s.walkIn + 1e-6), musicCrowdAt(s, s.gone - 1e-6)]) {
        expect(p.mode).toBe('walking');
        expect(p.x < 0 || p.x > W || DOORS.some((d) => Math.abs(d - p.x) < 0.5)).toBe(true);
      }
      for (const t of [s.walkIn - 0.1, s.walkIn + 1e-6, (s.walkIn + s.arrive) / 2, (s.arrive + s.leave) / 2, s.gone - 1e-6, s.gone + 0.1]) expect('fade' in musicCrowdAt(s, t)).toBe(false);
      // Seuil de la porte : de face en sortant de l'immeuble, de dos en y rentrant ; jamais ailleurs.
      const a = musicCrowdAt(s, s.walkIn + 1e-6);
      const b = musicCrowdAt(s, s.gone - 1e-6);
      if (s.fromDoor) expect([a.sill! > 0.99, a.yaw]).toEqual([true, YAW_FRONT]);
      else expect(a.sill).toBeUndefined();
      if (s.toDoor) expect([b.sill! > 0.99, b.yaw]).toEqual([true, YAW_BACK]);
      else expect(b.sill).toBeUndefined();
      expect(musicCrowdAt(s, (s.walkIn + s.arrive) / 2).sill).toBeUndefined();
      expect(musicCrowdAt(s, (s.arrive + s.leave) / 2).sill).toBeUndefined();
    }
  });
  it('pantin en place : tourné vers sa scène (de dos, trois quarts) ; groupes des stands et fond de trois quarts', () => {
    for (const s of crowd) {
      const p = musicCrowdAt(s, at(22));
      expect([p.yaw, p.gait]).toEqual([s.yaw, 'stand']);
      if (s.zone === 'stage') {
        const toward = yawToward(stages[s.stage!]! - s.x, -s.depth * UNIT);
        expect(s.yaw).toBe(toward >= 9 ? toward : s.x < stages[s.stage!]! ? 15 : 9);
        expect(s.yaw).toBeGreaterThanOrEqual(9);
        expect(s.yaw).toBeLessThanOrEqual(15);
      } else expect(s.yaw).toBe(s.dir > 0 ? 2 : 6);
    }
  });
  it('pantin en marche : pas réglés sur la distance, demi-tour sur place à l’arrivée, durée du trajet = arrive − walkIn', () => {
    for (const s of crowd.filter((_, i) => i % 7 === 0)) {
      const opts = { fromDoor: s.fromDoor, endYaw: s.yaw };
      expect((s.arrive - s.walkIn) * 60).toBeCloseTo(walkDuration(s.pathIn, UNIT, s.speed, opts), 6);
      expect((s.gone - s.leave) * 60).toBeCloseTo(walkDuration(s.pathOut, UNIT, s.speed, { startYaw: s.yaw, toDoor: s.toDoor }), 6);
      const mid = musicCrowdAt(s, (s.walkIn + s.arrive) / 2);
      const w = walkAt(s.pathIn, UNIT, s.speed, opts, ((s.arrive - s.walkIn) / 2) * 60);
      expect(mid).toMatchObject({ yaw: w.yaw, gait: w.gait, mode: 'walking' });
      expect([mid.x, mid.depth, mid.walked].map((v) => v.toFixed(3))).toEqual([w.x, w.d, w.walked].map((v) => v.toFixed(3)));
      const end = musicCrowdAt(s, s.arrive - 1e-7);
      expect(end.yaw).toBe(s.yaw);
    }
  });
  it('jamais de saut : écart ≤ vitesse × dt', () => {
    const dt = 0.5 / 60;
    const check = (from: number, to: number, list: readonly MusicSpectator[]): void => {
      for (const s of list) {
        let prev = musicCrowdAt(s, from);
        for (let t = from + dt; t < to; t += dt) {
          const p = musicCrowdAt(s, t);
          if (p.mode !== 'absent' && prev.mode !== 'absent') expect(Math.hypot(p.x - prev.x, (p.depth - prev.depth) * UNIT), s.id).toBeLessThanOrEqual(BEER_MAX_SPEED * UNIT * dt * 60 + 1e-6);
          prev = p;
        }
      }
    };
    const few = sample.filter((_, i) => i % 4 === 0);
    for (const s of few) check(s.walkIn - 0.1, s.arrive + 0.1, [s]);
    for (const s of few) check(s.leave - 0.1, s.gone + 0.1, [s]);
  }, 40000);
  it('présence continue à travers minuit', () => {
    const before = crowd.map((s) => musicCrowdAt(s, absMinute(DAY + 1, 0) - 1e-4));
    const after = crowd.map((s) => musicCrowdAt(s, absMinute(DAY + 1, 0) + 1e-4));
    before.forEach((p, i) => {
      const q = after[i]!;
      if (p.mode !== 'absent' && q.mode !== 'absent') expect(Math.hypot(q.x - p.x, (q.depth - p.depth) * UNIT)).toBeLessThanOrEqual(BEER_MAX_SPEED * UNIT * 2e-4 * 60 + 1e-9);
      if (p.mode === 'standing') expect(q.mode).toBe('standing');
    });
    const standing = (t: number): number => crowd.filter((s) => musicCrowdAt(s, t).mode === 'standing').length;
    expect(standing(absMinute(DAY + 1, 0))).toBeGreaterThan(crowd.length * 0.4);
    expect(standing(absMinute(DAY + 1, 30))).toBeGreaterThan(0);
    expect(standing(absMinute(DAY + 1, 30))).toBeLessThan(standing(absMinute(DAY + 1, 0)));
    // On danse pendant que les musiciens jouent, plus après minuit.
    expect(crowd.some((s) => musicCrowdAt(s, at(23)).dance)).toBe(true);
    expect(crowd.some((s) => musicCrowdAt(s, absMinute(DAY + 1, 5)).dance)).toBe(false);
  });
});
