import { describe, expect, it } from 'vitest';
import type { Layout, Pet, PetPlan } from '../../../src/core/library/library-types';
import { layoutSig, type BrainEnv } from '../../../src/core/library/pets/brain';
import { planEndsAt, routeMs, stateAt } from '../../../src/core/library/pets/motion';
import { proposeScene, sceneIsValid } from '../../../src/core/library/pets/scenes';
import { standPoint } from '../../../src/core/library/pets/walk-map';

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
