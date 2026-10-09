import { describe, expect, it } from 'vitest';
import type { Layout, Pet, PetPlan } from '../../../src/core/library/library-types';
import { layoutSig, type BrainEnv } from '../../../src/core/library/pets/brain';
import { planEndsAt, routeMs, stateAt } from '../../../src/core/library/pets/motion';
import { proposeScene, sceneIsValid } from '../../../src/core/library/pets/scenes';
import { buildWalkMap, cellOf, isFree, standPoint } from '../../../src/core/library/pets/walk-map';

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};
const layout: Layout = [];
const env = (seed: number): BrainEnv => ({ layout, cols: 36, rng: seeded(seed), still: false, occupied: new Set() });
const seeds = Array.from({ length: 150 }, (_, i) => i + 1);
const cat = (id: string): Pet => ({ id, species: 'cat', name: id, coat: 'orange' });
const dog = (id: string): Pet => ({ id, species: 'dog', name: id, coat: 'brown' });
const resting = (action: PetPlan['action'], at: { x: number; y: number }, extra: Partial<PetPlan> = {}): PetPlan => ({
  action, hostId: null, at, on: null, route: [], startedAt: 0, actMs: 100_000, facing: 'r', sig: layoutSig(layout, 36), ...extra,
});
const from = { pt: standPoint(2, 16), on: null, hostId: null, facing: 'r' as const };
const propose = (lead: Pet, other: Pet, otherPlan: PetPlan, seed: number) => proposeScene(env(seed), { pet: lead, from }, [{ pet: other, plan: otherPlan }], 1000);
const awake = resting('sit', standPoint(12, 16));

describe('proposeScene', () => {
  it('ne propose rien sans partenaire éligible (en marche, dans une scène, endormi sur un meuble, sur un meuble)', () => {
    const walking = resting('sit', standPoint(12, 16), { route: [{ kind: 'walk', from: standPoint(10, 16), to: standPoint(12, 16), ms: 3000, fromOn: null, on: null }], startedAt: 900 });
    const inScene = resting('sit', standPoint(12, 16), { with: { petId: 'x', role: 'follow', scene: 'greet' } });
    const onSofa = resting('sit', standPoint(12, 16), { on: 'f', hostId: 'f' });
    for (const plan of [walking, inScene, onSofa]) expect(propose(cat('a'), cat('b'), plan, 1)).toBeNull();
    expect(proposeScene(env(1), { pet: cat('a'), from }, [], 1000)).toBeNull();
  });

  it('les deux plans sont appariés : mêmes horodatages, références croisées, fins proches', () => {
    let found = 0;
    for (const s of seeds) {
      const r = propose(cat('a'), cat('b'), awake, s);
      if (!r || !r.partner) continue;
      found++;
      expect(r.lead.startedAt).toBe(1000);
      expect(r.partner.startedAt).toBe(1000);
      expect(r.lead.with).toEqual({ petId: 'b', role: 'lead', scene: r.scene });
      expect(r.partner.with).toEqual({ petId: 'a', role: 'follow', scene: r.scene });
      expect(Math.abs(planEndsAt(r.lead) - planEndsAt(r.partner))).toBeLessThanOrEqual(2500);
      expect(planEndsAt(r.lead) - 1000).toBeLessThanOrEqual(30_000);
    }
    expect(found).toBeGreaterThan(0);
  });

  it('la durée d action d une scène ne dépasse pas 8 s (hors sommeil)', () => {
    for (const s of seeds) {
      const r = propose(dog('a'), cat('b'), awake, s);
      if (r && r.scene !== 'nap') expect(r.lead.actMs).toBeLessThanOrEqual(8000);
    }
  });

  it('selon le couple : chat→chien = salut ou remise à sa place, chien→chat = salut ou poursuite, même espèce = toilette possible', () => {
    const kinds = (lead: Pet, other: Pet) => new Set(seeds.map((s) => propose(lead, other, awake, s)?.scene).filter(Boolean));
    expect([...kinds(cat('a'), dog('b'))].sort()).toEqual(['greet', 'shoo']);
    expect([...kinds(dog('a'), cat('b'))].sort()).toEqual(['chase', 'greet']);
    expect(kinds(cat('a'), cat('b')).has('groom')).toBe(true);
    expect(kinds(dog('a'), dog('b')).has('chase')).toBe(true);
    expect(kinds(cat('a'), cat('b')).has('shoo')).toBe(false);
  });

  it('remise à sa place : le chien attend, puis recule ; le chat souffle', () => {
    const r = seeds.map((s) => propose(cat('a'), dog('b'), awake, s)).find((x) => x?.scene === 'shoo')!;
    expect(r.lead.action).toBe('hiss');
    expect(r.partner!.action).toBe('cower');
    expect(r.partner!.lag).toBe(routeMs(r.lead.route));
    expect(stateAt(r.partner!, 1000 + 10).phase === 'wait' || r.partner!.route.length === 0).toBe(true);
  });

  it('poursuite : le poursuivi file loin pendant que le poursuivant arrive derrière lui', () => {
    const r = seeds.map((s) => propose(dog('a'), cat('b'), awake, s)).find((x) => x?.scene === 'chase')!;
    expect(r.partner!.route.length).toBeGreaterThan(0);
    expect(r.partner!.lag).toBeGreaterThan(0);
    expect(r.lead.action).toBe('play');
    expect(r.partner!.action).toBe('play');
    expect(routeMs(r.lead.route)).toBeGreaterThan(r.partner!.lag!);
  });

  it('dormir côte à côte : seulement près d un dormeur au sol, qui n est pas touché', () => {
    const sleeper = resting('sleep', standPoint(12, 16));
    const kinds = new Set(seeds.map((s) => propose(cat('a'), dog('b'), sleeper, s)).filter(Boolean).map((r) => r!.scene));
    expect([...kinds]).toEqual(['nap']);
    const r = seeds.map((s) => propose(cat('a'), dog('b'), sleeper, s)).find(Boolean)!;
    expect(r.partner).toBeNull();
    expect(r.lead.action).toBe('sleep');
    expect(Math.abs(r.lead.at.x - standPoint(12, 16).x)).toBeLessThanOrEqual(130);
  });
});

describe('sceneIsValid', () => {
  const lead: PetPlan = resting('greet', standPoint(3, 16), { startedAt: 500, with: { petId: 'b', role: 'lead', scene: 'greet' } });
  const partner: PetPlan = resting('greet', standPoint(4, 16), { startedAt: 500, with: { petId: 'a', role: 'follow', scene: 'greet' } });

  it('valide si le partenaire est là avec le plan jumeau', () => {
    expect(sceneIsValid(lead, partner, true)).toBe(true);
    expect(sceneIsValid({ ...lead, with: undefined }, undefined, false)).toBe(true);
  });
  it('invalide si le partenaire est parti, a changé de plan ou une autre scène a commencé', () => {
    expect(sceneIsValid(lead, partner, false)).toBe(false);
    expect(sceneIsValid(lead, resting('sit', standPoint(4, 16)), true)).toBe(false);
    expect(sceneIsValid(lead, { ...partner, startedAt: 600 }, true)).toBe(false);
  });
  it('le sommeil côte à côte ne demande que la présence du dormeur', () => {
    const nap: PetPlan = { ...lead, with: { petId: 'b', role: 'lead', scene: 'nap' } };
    expect(sceneIsValid(nap, resting('sleep', standPoint(4, 16)), true)).toBe(true);
    expect(sceneIsValid(nap, undefined, false)).toBe(false);
  });
});

describe('correctifs des scènes', () => {
  it('poursuite près du mur : jamais à travers le meneur', () => {
    const wall = resting('sit', standPoint(34, 16));
    const lead = { pt: standPoint(30, 16), on: null, hostId: null, facing: 'r' as const };
    for (const s of seeds) {
      const r = proposeScene(env(s), { pet: dog('a'), from: lead }, [{ pet: cat('b'), plan: wall }], 1000);
      if (r?.scene === 'chase') {
        const meetX = r.lead.route[0]!.to.x;
        const fleeEnd = r.partner!.route.at(-1)!.to.x;
        expect(Math.sign(fleeEnd - wall.at.x)).not.toBe(Math.sign(meetX - wall.at.x));
      }
    }
  });

  it('chien qui poursuit un chat : ne le dépasse jamais', () => {
    let n = 0;
    for (const s of seeds) {
      const r = propose(dog('a'), cat('b'), awake, s);
      if (r?.scene !== 'chase') continue;
      n++;
      const end = Math.max(planEndsAt(r.lead), planEndsAt(r.partner!));
      for (let t = 1000; t <= end; t += 100) {
        const a = stateAt(r.lead, t).pos, b = stateAt(r.partner!, t).pos;
        const dir = Math.sign(r.partner!.at.x - r.lead.at.x) || 1;
        expect((b.x - a.x) * dir, `seed ${s} t ${t} a ${a.x} b ${b.x} at ${r.partner!.at.x} lead ${r.lead.at.x} meet ${r.lead.route[0]!.to.x}`).toBeGreaterThanOrEqual(-1);
      }
    }
    expect(n).toBeGreaterThan(0);
  });

  it('pas de salut / toilette / remise à sa place sans recul quand le partenaire est loin', () => {
    const far = resting('sit', standPoint(30, 16));
    for (const s of seeds) {
      const r = proposeScene(env(s), { pet: cat('a'), from }, [{ pet: cat('b'), plan: far }], 1000);
      expect(r === null || r.scene === 'nap' || r.scene === 'chase').toBe(true);
    }
  });

  it('pas de sieste près d un dormeur sur un meuble', () => {
    const sleeper = resting('sleep', standPoint(12, 16), { hostId: 'f', on: 'f' });
    for (const s of seeds) expect(propose(cat('a'), dog('b'), sleeper, s)).toBeNull();
  });
});

describe('correctifs de la passe finale', () => {
  const props = (lead: Pet, other: Pet, plan: PetPlan) => seeds.map((s) => propose(lead, other, plan, s)).filter((r): r is NonNullable<typeof r> => r !== null);

  it('un animal en train d être caressé (ronronnement) n est jamais abordé', () => {
    expect(props(cat('a'), cat('b'), resting('purr', standPoint(12, 16)))).toHaveLength(0);
  });

  it('l approche du meneur ne dépasse jamais 6 s, quelle que soit la scène', () => {
    for (const col of [6, 10, 14, 18, 22, 26, 30, 34]) {
      for (const [lead, other, plan] of [[cat('a'), dog('b'), awake], [dog('a'), cat('b'), awake], [dog('a'), dog('b'), awake], [cat('a'), cat('b'), resting('sleep', standPoint(col, 16))]] as const) {
        const target = plan.action === 'sleep' ? plan : resting('sit', standPoint(col, 16));
        for (const r of props(lead, other, target)) {
          const wait = r.scene === 'chase' ? r.partner!.lag! : routeMs(r.lead.route);
          expect(wait).toBeLessThanOrEqual(6000);
        }
      }
    }
    expect(props(cat('a'), cat('b'), resting('sleep', standPoint(34, 16)))).toHaveLength(0);
  });

  it('sieste : jamais auprès d un dormeur déjà parti, durée limitée à son sommeil restant', () => {
    expect(props(cat('a'), cat('b'), resting('sleep', standPoint(18, 16), { actMs: 11_000 }))).toHaveLength(0);
    const rs = props(cat('a'), cat('b'), resting('sleep', standPoint(18, 16), { actMs: 13_000 }));
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) {
      expect(r.lead.actMs).toBeGreaterThanOrEqual(5000);
      expect(planEndsAt(r.lead)).toBeLessThanOrEqual(13_000);
    }
  });

  it('sceneIsValid : une sieste exige que le partenaire dorme encore', () => {
    const nap: PetPlan = resting('sleep', standPoint(3, 16), { with: { petId: 'b', role: 'lead', scene: 'nap' } });
    expect(sceneIsValid(nap, undefined, true)).toBe(false);
    expect(sceneIsValid(nap, resting('sleep', standPoint(4, 16)), true)).toBe(true);
    expect(sceneIsValid(nap, resting('purr', standPoint(4, 16)), true)).toBe(false);
  });

  it('poursuite : les deux plans finissent au même instant, actions <= 8 s', () => {
    let seen = 0;
    for (const [lead, other] of [[dog('a'), cat('b')], [dog('a'), dog('b')], [cat('a'), cat('b')]] as const) {
      for (const r of props(lead, other, awake)) {
        if (r.scene !== 'chase') continue;
        seen++;
        expect(planEndsAt(r.lead)).toBe(planEndsAt(r.partner!));
        expect(r.lead.actMs).toBeLessThanOrEqual(8000);
        expect(r.partner!.actMs).toBeLessThanOrEqual(8000);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('remise à sa place : le recul de deux cases exige aussi la case intermédiaire libre', () => {
    const blocked: Layout = [{ id: 'k', kind: 'basket', col: 13, row: 16 }];
    const e = (s: number): BrainEnv => ({ ...env(s), layout: blocked });
    const at = standPoint(12, 16);
    const map = buildWalkMap(blocked, 36);
    let shoo = 0;
    for (const s of seeds) {
      const r = proposeScene(e(s), { pet: cat('a'), from }, [{ pet: dog('b'), plan: { ...awake, at, sig: layoutSig(blocked, 36) } }], 1000);
      if (r?.scene !== 'shoo') continue;
      shoo++;
      for (const seg of r.partner!.route) {
        const c = Math.floor(seg.to.x / 30);
        expect(isFree(map, c, 16)).toBe(true);
      }
      expect(Math.abs(cellOf(r.partner!.at).col - 12)).toBeLessThanOrEqual(1);
    }
    expect(shoo).toBeGreaterThan(0);
  });
});

describe('recul de la remise à sa place', () => {
  it('ne saute pas par-dessus une case intermédiaire occupée pour atteindre la case à deux pas', () => {
    // Le chien est posé sur une gamelle (cases 11-12) : la case 10 est libre mais la case 11, entre les deux, ne l'est pas.
    const bowl: Layout = [{ id: 'g', kind: 'bowl', col: 11, row: 16 }];
    const right = { pt: standPoint(20, 16), on: null, hostId: null, facing: 'l' as const };
    const sitting = resting('sit', standPoint(12, 16), { sig: layoutSig(bowl, 36) });
    let shoo = 0;
    for (const s of seeds) {
      const r = proposeScene({ ...env(s), layout: bowl }, { pet: cat('a'), from: right }, [{ pet: dog('b'), plan: sitting }], 1000);
      if (r?.scene !== 'shoo') continue;
      shoo++;
      expect(cellOf(r.partner!.at).col).not.toBe(10);
    }
    expect(shoo).toBeGreaterThan(0);
  });
});

describe('scènes avec un robot', () => {
  const robot = (id: string): Pet => ({ id, species: 'robot', name: id, coat: 'blue' });
  const scenesOf = (lead: Pet, other: Pet, plan: PetPlan = awake) => new Set(seeds.map((s) => propose(lead, other, plan, s)?.scene).filter(Boolean));

  it('chaque couple avec un robot a les bonnes scènes, et aucune toilette, poursuite ni sieste', () => {
    expect([...scenesOf(cat('a'), robot('b'))].sort()).toEqual(['greet', 'shoo']);
    expect([...scenesOf(dog('a'), robot('b'))].sort()).toEqual(['follow', 'greet']);
    expect([...scenesOf(robot('a'), cat('b'))]).toEqual(['greet']);
    expect([...scenesOf(robot('a'), dog('b'))]).toEqual(['greet']);
    expect([...scenesOf(robot('a'), robot('b'))]).toEqual(['greet']);
  });

  it('un robot ne s allonge pas près d un dormeur', () => {
    expect(scenesOf(robot('a'), cat('b'), resting('sleep', standPoint(12, 16))).size).toBe(0);
  });

  it('salut : plans au même départ, références croisées, antenne levée des deux côtés', () => {
    let seen = 0;
    for (const [lead, other] of [[cat('a'), robot('b')], [dog('a'), robot('b')], [robot('a'), cat('b')], [robot('a'), robot('b')]] as const) {
      for (const s of seeds) {
        const r = propose(lead, other, awake, s);
        if (r?.scene !== 'greet') continue;
        seen++;
        expect(r.lead.startedAt).toBe(r.partner!.startedAt);
        expect(r.lead.with).toEqual({ petId: other.id, role: 'lead', scene: 'greet' });
        expect(r.partner!.with).toEqual({ petId: lead.id, role: 'follow', scene: 'greet' });
        expect(r.lead.action).toBe('greet');
        expect(r.partner!.action).toBe('greet');
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('suite : le robot roule, le chien le suit, sans jeu ni accélération, finissent ensemble', () => {
    const rs = seeds.map((s) => propose(dog('a'), robot('b'), awake, s)).filter((r) => r?.scene === 'follow');
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) {
      expect(r!.partner!.route.length).toBeGreaterThan(0);
      expect(['play']).not.toContain(r!.lead.action);
      expect(['play']).not.toContain(r!.partner!.action);
      expect(r!.partner!.action).toBe('scan');
      expect(planEndsAt(r!.lead)).toBe(planEndsAt(r!.partner!));
      expect(r!.lead.actMs).toBeLessThanOrEqual(8000);
      expect(r!.partner!.actMs).toBeLessThanOrEqual(8000);
    }
  });

  it('suite : un seul rythme (pas de course) : le robot parcourt sa route à sa vitesse de scène', () => {
    const chase = seeds.map((s) => propose(dog('a'), cat('b'), awake, s)).find((r) => r?.scene === 'chase')!;
    const follow = seeds.map((s) => propose(dog('a'), robot('b'), awake, s)).find((r) => r?.scene === 'follow')!;
    const perPx = (route: PetPlan['route']) => routeMs(route) / route.reduce((t, x) => t + Math.hypot(x.to.x - x.from.x, x.to.y - x.from.y), 0);
    expect(perPx(follow.partner!.route)).toBeGreaterThan(perPx(chase.partner!.route));
  });

  it('shoo : le chat souffle, le robot attend, recule en cower de deux cases au plus', () => {
    const r = seeds.map((s) => propose(cat('a'), robot('b'), awake, s)).find((x) => x?.scene === 'shoo')!;
    expect(r.lead.action).toBe('hiss');
    expect(r.partner!.action).toBe('cower');
    expect(r.partner!.lag).toBe(routeMs(r.lead.route));
    expect(r.partner!.route.length).toBeGreaterThan(0);
    expect(Math.abs(cellOf(r.partner!.at).col - 12)).toBeLessThanOrEqual(2);
  });

  it('un robot qui scanne peut être abordé ; en veille ou en recharge, jamais (réservé à la sieste du chat)', () => {
    expect(scenesOf(cat('a'), robot('b'), resting('scan', standPoint(12, 16))).size).toBeGreaterThan(0);
    for (const action of ['standby', 'charge'] as const) {
      for (const lead of [cat('a'), dog('a'), robot('a')]) expect(scenesOf(lead, robot('b'), resting(action, standPoint(12, 16))).size).toBe(0);
    }
  });
});
