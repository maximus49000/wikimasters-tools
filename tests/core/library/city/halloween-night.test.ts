import { describe, expect, it } from 'vitest';
import { doorsFor } from '../../../../src/core/library/city/doors';
import { doorStateAt, groupFigures, halloweenNight, pieceAt, residentAt, scareAt, NOBODY_S, TREAT_S, type NightStreet } from '../../../../src/core/library/city/halloween-night';
import { halloweenDoorIds } from '../../../../src/core/library/city/install';
import { DOOR_WIDTH } from '../../../../src/core/library/city/metrics';

const N31 = { y: 2026, m: 10, d: 31 };
const W = 1440;
const H = 600;
const street = (seed: number): NightStreet => {
  const doors = doorsFor(W, H, seed);
  return { doors, decorated: halloweenDoorIds(N31, 17 * 60, W, H, seed), pumpkins: new Set(doors.slice(0, 2).map((d) => d.id)), width: W, unit: 1 };
};

describe('nuit d’Halloween : plan de la soirée', () => {
  it('rien les autres jours ; déterministe le 31', () => {
    expect(halloweenNight({ y: 2026, m: 10, d: 30 }, street(3), 3, false).groups).toEqual([]);
    const a = halloweenNight(N31, street(3), 3, false);
    expect(a.groups.length).toBeGreaterThan(50);
    expect(halloweenNight(N31, street(3), 3, false)).toEqual(a);
    expect(halloweenNight(N31, street(4), 4, false).groups.map((g) => g.t0)).not.toEqual(a.groups.map((g) => g.t0));
  });
  it('des entrées sont décorées le 31 au soir', () => {
    expect(street(3).decorated.size).toBeGreaterThan(0);
  });
  it('heures : rien avant 16 h ni après minuit ; familles de 17 h 15 à 20 h 45', () => {
    const p = halloweenNight(N31, street(3), 3, false);
    for (const g of p.groups) {
      expect(g.t0).toBeGreaterThanOrEqual(16 * 3600);
      expect(g.t0).toBeLessThan(24 * 3600);
      if (g.kind === 'family') {
        expect(g.t0).toBeGreaterThanOrEqual(17.25 * 3600);
        expect(g.t0).toBeLessThan(20.8 * 3600);
      }
    }
  });
  it('arrêts seulement devant une entrée décorée ou à citrouille ; une scène à la fois par porte', () => {
    const st = street(3);
    const p = halloweenNight(N31, st, 3, false);
    const ok = new Set([...st.decorated, ...st.pumpkins]);
    const stops = p.groups.flatMap((g) => g.pieces.filter((x) => x.stop && x.stop.kind !== 'ring').map((x) => x.stop!));
    expect(stops.length).toBeGreaterThan(10);
    for (const s of stops) expect(ok.has(s.doorId)).toBe(true);
    for (const [, evs] of p.doors) {
      const sorted = [...evs].sort((a, b) => a.t0 - b.t0);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.t0 - sorted[i - 1]!.t0).toBeGreaterThanOrEqual(20);
    }
  });
  it('pièces de trajet jointives : positions continues', () => {
    const p = halloweenNight(N31, street(3), 3, false);
    for (const g of p.groups.slice(0, 40)) {
      for (let i = 1; i < g.pieces.length; i++) {
        expect(g.pieces[i]!.t0).toBeCloseTo(g.pieces[i - 1]!.t1, 6);
        expect(g.pieces[i]!.x0).toBeCloseTo(g.pieces[i - 1]!.x1, 6);
      }
      expect(pieceAt(g, g.t0 - 1)).toBeNull();
      expect(pieceAt(g, g.t1 + 1)).toBeNull();
    }
  });
  it('pluie : moins de familles, les farces restent possibles', () => {
    const dry = halloweenNight(N31, street(3), 3, false);
    const wet = halloweenNight(N31, street(3), 3, true);
    const fam = (x: typeof dry) => x.groups.filter((g) => g.kind === 'family').length;
    expect(fam(wet)).toBeLessThan(fam(dry) * 0.6);
    expect(wet.groups.filter((g) => g.kind === 'teens').length).toBeGreaterThan(0);
    expect(wet.groups.flatMap((g) => g.members).some((m) => m.umbrella)).toBe(true);
  });
});

describe('nuit d’Halloween : scènes à la porte', () => {
  const p = halloweenNight(N31, street(3), 3, false);
  const treat = [...p.doors.values()].flat().find((e) => e.kind === 'treat')!;
  const ring = [...p.doors.values()].flat().find((e) => e.kind === 'ring')!;
  it('bonbons : hall allumé à 4,5 s pour 2 min, porte ouverte de 7,5 à 20,5 s, habitant qui donne', () => {
    const at = (t: number) => doorStateAt([treat], treat.t0 + t);
    expect(at(3).hallUntil).toBeNull();
    expect(at(5).hallUntil).toBeCloseTo(treat.t0 + 124.5, 6);
    expect(at(7).open).toBe(0);
    expect(at(12).open).toBe(1);
    expect(at(21).open).toBe(0);
    expect(residentAt(treat, treat.t0 + 6)).toBeNull();
    expect(residentAt(treat, treat.t0 + 10)?.arms).toBe('give');
    // les enfants sont au pas de la porte, de dos, pendant la distribution
    const g = treat.group!;
    const kids = groupFigures(g, treat.t0 + 12, 1).filter((f) => f.member.kid);
    expect(kids.length).toBeGreaterThan(0);
    for (const k of kids) expect(k.step).toBe(1);
    expect(Math.abs(kids[0]!.x - treat.door)).toBeLessThan(10);
  });
  it('sonner et s’enfuir : personne à la porte quand elle s’ouvre, la bande a détalé', () => {
    expect(ring).toBeDefined();
    expect(doorStateAt([ring], ring.t0 + 9).hallUntil).not.toBeNull();
    expect(doorStateAt([ring], ring.t0 + 14).open).toBe(1);
    expect(residentAt(ring, ring.t0 + 15)?.arms).toBe('down');
    const g = ring.group!;
    const figs = groupFigures(g, ring.t0 + 14, 1);
    for (const f of figs) expect(Math.abs(f.x - ring.door)).toBeGreaterThan(30);
  });
  it('pas de réponse : aucune lumière', () => {
    const g = p.groups.find((x) => x.pieces.some((q) => q.stop?.kind === 'nobody'));
    if (!g) return;
    const st = g.pieces.find((q) => q.stop?.kind === 'nobody')!;
    expect(st.t1 - st.t0).toBe(NOBODY_S);
    expect(p.doors.get(st.stop!.door)?.some((e) => Math.abs(e.t0 - st.t0) < 1) ?? false).toBe(false);
  });
  it('faire peur : le jeune surgit à 5,5 s, le passant sursaute puis repart', () => {
    const sc = p.scares[0]!;
    expect(sc).toBeDefined();
    expect(scareAt(sc, sc.t0, 1, W).teen?.hidden).toBe(true);
    expect(scareAt(sc, sc.t0 + 7, 1, W).teen?.arms).toBe('overhead');
    expect(scareAt(sc, sc.t0 + 6.2, 1, W).victim?.arms).toBe('stretch-1');
    expect(scareAt(sc, sc.t0 + 8, 1, W).victim?.arms).toBe('cup');
    expect(scareAt(sc, sc.t0 + 12, 1, W).victim?.gait).toBe('walk');
    expect(doorStateAt(p.doors.get(sc.door), sc.t0).open).toBeGreaterThan(0);
  });
  it('durées', () => {
    const st = treat.group!.pieces.find((q) => q.stop === treat.stop)!;
    expect(st.t1 - st.t0).toBe(TREAT_S);
    expect(treat.door).toBe(doorsFor(W, H, 3).find((d) => d.id === treat.stop!.doorId)!.x + DOOR_WIDTH / 2);
  });
});
