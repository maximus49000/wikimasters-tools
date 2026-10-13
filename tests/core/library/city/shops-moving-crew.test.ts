import { describe, expect, it } from 'vitest';
import { TAILGATE_S, moverAt, pieceAt, planCrew, type CrewInput } from '../../../../src/core/library/city/shops/moving-crew';

// Rue simplifiée : porte du local à x = 100, camion à droite (arrière vers x = 130), trois porteurs.
const base = (step: CrewInput['step'], prev: CrewInput['prev'], seed = 7): CrewInput => ({
  step,
  prev,
  t0: 1000,
  t1: 1000 + (step === 'carry-out' || step === 'carry-in' ? 1800 : step === 'pause' ? 600 : 90),
  n: 3,
  seed,
  door: { x: 100, y: 240 },
  truck: { x: 135, y: 256 },
  rear: { x: 127, y: 256 },
  cab: { x: 170, y: 256 },
  spots: [{ x: 122, y: 256 }, { x: 90, y: 257 }, { x: 80, y: 255 }],
  speed: 12,
});

describe('planning des déménageurs (revue du 2026-10-13 : désorganisé et vivant)', () => {
  it('portage : cartons portés seul, meubles lourds à deux (jamais toute l’équipe)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const plan = planCrew(base('carry-out', 'open-back', seed));
      const cartons = plan.jobs.filter((j) => j.load === 'carton');
      const heavy = plan.jobs.filter((j) => j.load !== 'carton');
      expect(cartons.length, `graine ${seed}`).toBeGreaterThan(5);
      expect(heavy.length, `graine ${seed}`).toBeGreaterThan(0);
      for (const j of cartons) expect(j.a).toBe(j.b);
      for (const j of heavy) expect(j.a).not.toBe(j.b);
    }
  });
  it('pas de file réglée : les porteurs ne sortent pas en même temps et ne font pas le même nombre d’allers', () => {
    const plan = planCrew(base('carry-out', 'open-back'));
    const exits = plan.segs.map((segs) => segs.filter((s) => s.k === 'sill' && s.from === 1).map((s) => Math.round(s.t)));
    // Au moins une sortie de chacun ne coïncide avec aucune sortie d'un autre.
    for (const [i, own] of exits.entries()) {
      const others = new Set(exits.filter((_, j) => j !== i).flat());
      expect(own.some((t) => !others.has(t) && !others.has(t + 1) && !others.has(t - 1))).toBe(true);
    }
    const trips = plan.segs.map((_, i) => plan.jobs.filter((j) => j.a === i || j.b === i).length);
    expect(new Set(trips).size).toBeGreaterThan(1);
  });
  it('des pauses sur le trottoir pendant que les autres travaillent (gestes variés)', () => {
    let pauses = 0;
    const arms = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const plan = planCrew(base('carry-in', 'pause', seed));
      for (const segs of plan.segs) for (const s of segs) if (s.k === 'stand' && s.t > 1030) { pauses++; s.arms.forEach((a) => arms.add(a)); }
    }
    expect(pauses).toBeGreaterThan(0);
    const pause = planCrew(base('pause', 'carry-out'));
    for (const segs of pause.segs) for (const s of segs) if (s.k === 'stand') s.arms.forEach((a) => arms.add(a));
    expect(arms.size).toBeGreaterThanOrEqual(3);
  });
  it('meuble lourd : visible seulement quand quelqu’un le porte, entre les deux porteurs', () => {
    const c = base('carry-out', 'open-back');
    const plan = planCrew(c);
    let seen = 0;
    for (let t = c.t0; t < c.t1; t += 0.5) {
      const movers = plan.segs.map((segs) => moverAt(segs, c.door, t));
      const piece = pieceAt(plan, movers, c.door, t);
      if (!piece) continue;
      seen++;
      const carriers = movers.filter((m) => m.load === piece.load);
      expect(carriers.length, `${t}`).toBeGreaterThan(0);
      // Entre les porteurs dehors et, si l'autre est encore dedans ou déjà arrivé, la porte ou l'arrière du camion.
      if (piece.where === 'street') {
        const xs = carriers.filter((m) => m.where === 'street').map((m) => m.x);
        expect(piece.x).toBeGreaterThanOrEqual(Math.min(...xs, c.door.x) - 1e-6);
        expect(piece.x).toBeLessThanOrEqual(Math.max(...xs, c.truck.x) + 1e-6);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
  it('hayon : quelques secondes, manœuvré par le premier arrivé, debout à l’arrière du camion', () => {
    for (const [step, prev] of [['open-back', 'truck-arrives'], ['close-back', 'carry-in']] as const) {
      const c = base(step, prev);
      const plan = planCrew(c);
      expect(plan.tailgate).not.toBeNull();
      expect(plan.tailgate!.dur).toBe(TAILGATE_S);
      expect(plan.tailgate!.at).toBeLessThan(c.t1);
      const m = moverAt(plan.segs[0]!, c.door, plan.tailgate!.at + 1);
      expect(m.arms).toBe('reach');
      expect(Math.hypot(m.x - c.rear.x, m.y - c.rear.y)).toBeLessThan(1e-6);
    }
  });
  it('fermeture : tout le monde finit dans la cabine ; ouverture : tout le monde finit à sa place, sur le trottoir', () => {
    const close = base('close-back', 'carry-in');
    const plan = planCrew(close);
    for (const segs of plan.segs) expect(moverAt(segs, close.door, close.t1 - 0.01).where).toBe('off');
    const open = base('open-back', 'truck-arrives');
    const p2 = planCrew(open);
    p2.segs.forEach((segs, i) => {
      const m = moverAt(segs, open.door, open.t1 - 0.01);
      expect(m.where).toBe('street');
      expect(Math.hypot(m.x - open.spots[i]!.x, m.y - open.spots[i]!.y)).toBeLessThan(1e-6);
    });
  });
  it('déterministe (même graine, même planning)', () => {
    expect(JSON.stringify(planCrew(base('carry-out', 'open-back', 3)))).toBe(JSON.stringify(planCrew(base('carry-out', 'open-back', 3))));
  });
});
