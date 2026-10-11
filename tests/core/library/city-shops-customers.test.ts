import { describe, expect, it } from 'vitest';
import { customerGate, visitAt, visitHappens, visitsFor, VISIT_CYCLE } from '../../../src/core/library/city/shops/customers';
import { DOOR_WIDTH, doorsFor } from '../../../src/core/library/city/doors';
import { YAW_BACK } from '../../../src/core/library/figure/gait';
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
        expect(s.inner!.x).toBeGreaterThanOrEqual(0);
        expect(s.inner!.x).toBeLessThanOrEqual(f.window.w);
      }
    }
    expect([...stages].sort()).toEqual(['enter', 'exit', 'in', 'inside', 'out']);
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
        if (s && (s.stage === 'in' || s.stage === 'out') && visitHappens(v, t, gate)) walking++;
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
  it('geste seulement à sa place (pas en marchant dans le local) ; emporte un objet à la sortie si le type s’y prête', () => {
    for (const type of ['bakery', 'restaurant'] as ShopTypeId[]) {
      const v = visitsFor(slots, frames, 9, () => type)[0]!;
      let still = 0;
      for (let t = 0; t < VISIT_CYCLE; t += 0.5) {
        const s = visitAt(v, 720, t - v.phase);
        if (!s) continue;
        const atSeat = s.stage === 'inside' && (s.inner!.gait === 'stand' || s.inner!.gait === 'seated');
        if (atSeat) still++;
        if (atSeat) expect(s.gesture).not.toBeNull();
        else expect(s.gesture).toBeNull();
        expect(s.carry).toBe(s.stage === 'out' && takesAway(type));
      }
      expect(still).toBeGreaterThan(0);
    }
  });
  it('sans type connu : pas de geste, rien d’emporté', () => {
    const v = visitsFor(slots, frames, 9, () => null)[0]!;
    for (let t = 0; t < VISIT_CYCLE; t += 0.5) {
      const s = visitAt(v, 720, t - v.phase);
      if (s) { expect(s.gesture).toBeNull(); expect(s.carry).toBe(false); }
    }
  });

  it('un client entre de dos par la porte du local, puis marche dans la vitrine jusqu’à sa place', () => {
    const sl = shopSlotsFor(720, 340, 2);
    const fr = new Map(sl.map((s) => [s.id, shopFrame(s, 238)]));
    const doorXs = doorsFor(720, 340, 2).map((d) => d.x + DOOR_WIDTH / 2);
    const v = visitsFor(sl, fr, 2, () => 'bakery', doorXs, 720)[0]!;
    const f = fr.get(v.slotId)!;
    const edge = f.door.x + f.door.w / 2 < f.window.x ? 0 : f.window.w;
    const seat = v.seat.x - f.window.x;
    const order: string[] = [];
    let lastEnter: ReturnType<typeof visitAt> = null;
    let firstInside: ReturnType<typeof visitAt> = null;
    let reached = false;
    for (let t = 0; t < VISIT_CYCLE; t += 0.1) {
      const s = visitAt(v, 720, t - v.phase);
      if (!s) continue;
      if (order[order.length - 1] !== s.stage) order.push(s.stage);
      if (s.stage === 'enter') lastEnter = s;
      if (s.stage === 'inside') {
        firstInside ??= s;
        if (Math.abs(s.inner!.x - seat) < 0.5) reached = true;
      }
    }
    expect(order).toEqual(['in', 'enter', 'inside', 'exit', 'out']);
    expect(lastEnter!.passage!.depth).toBeGreaterThan(0.9);
    expect(lastEnter!.passage!.yaw).toBe(YAW_BACK);
    expect(Math.abs(firstInside!.inner!.x - edge)).toBeLessThan(2);
    expect(reached).toBe(true);
  });
  it('aucun champ fade dans l’état d’une visite', () => {
    const v = visits[0]!;
    let seen = 0;
    for (let t = 0; t < VISIT_CYCLE; t += 7) {
      const s = visitAt(v, 720, t - v.phase);
      if (!s) continue;
      seen++;
      expect(s).not.toHaveProperty('fade');
    }
    expect(seen).toBeGreaterThan(0);
  });
  it('se tourne vers sa place : yaw 2 si la place regarde à droite, 6 sinon', () => {
    for (const v of visits) {
      let yaw: number | null = null;
      for (let t = 0; t < VISIT_CYCLE && yaw === null; t += 0.5) {
        const s = visitAt(v, 720, t - v.phase);
        if (s?.stage === 'inside' && s.inner!.gait === 'stand') yaw = s.inner!.yaw;
      }
      expect(yaw).toBe(v.seat.facing > 0 ? 2 : 6);
    }
  });
});

describe('durée des visites', () => {
  it('jamais coupées par le cycle, partent et finissent à une porte ou hors champ (graines 1 à 6, mondes de 720 à 6000 px)', () => {
    let total = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const width of [720, 1440, 3456, 6000]) {
        const sl = shopSlotsFor(width, 340, seed);
        const fr = new Map(sl.map((s) => [s.id, shopFrame(s, 238)]));
        const doorXs = doorsFor(width, 340, seed).map((d) => d.x + DOOR_WIDTH / 2);
        for (const v of visitsFor(sl, fr, seed, () => 'bakery', doorXs, width)) {
          const base = { ...v, phase: 0 };
          let first: ReturnType<typeof visitAt> = null;
          let last: ReturnType<typeof visitAt> = null;
          let lastT = 0;
          for (let t = 0; t < VISIT_CYCLE; t += 0.1) {
            const s = visitAt(base, width, t);
            if (!s) continue;
            first ??= s;
            last = s;
            lastT = t;
          }
          expect(first).not.toBeNull();
          total++;
          expect(lastT).toBeLessThan(VISIT_CYCLE - 1);
          for (const end of [first!, last!]) {
            const p = end.passage!;
            expect(p.stage === 'threshold' || p.x < 0 || p.x > width).toBe(true);
          }
        }
      }
    }
    expect(total).toBeGreaterThan(0);
  });
});
