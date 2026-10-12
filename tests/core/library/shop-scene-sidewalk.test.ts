// tests/core/library/shop-scene-sidewalk.test.ts — trottoir des clients des partitions (G4b, tâche 10)
import { describe, expect, it } from 'vitest';
import { THRESHOLD_S } from '../../../src/core/library/city/doorway';
import { sidewalkAt, sidewalkPlan } from '../../../src/core/library/city/shops/scene/sidewalk';
import type { ActorTrack } from '../../../src/core/library/city/shops/scene/types';
import { outfitFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';
import { YAW_BACK } from '../../../src/core/library/figure/gait';

const geo = { doorX: 300, width: 720, doorXs: [] as number[] };
const track = (o: Partial<ActorTrack>): ActorTrack => ({
  id: 'p0:0', role: 'customer', outfit: outfitFor('ordinary', mulberry32(1)), scale: 1, party: 'p0', enter: 40, exit: 90, arriveAt: 39, dir: 1, segments: [], ...o,
});

describe('trottoir des clients (sidewalkPlan)', () => {
  it('entre : atteint la porte avant l’entrée, passe le seuil de dos et franchit la porte à enter', () => {
    const plan = sidewalkPlan(track({}), geo)!;
    // Le seuil tient avant l'entrée : arrivée avancée.
    const sill = sidewalkAt(plan, 40 - THRESHOLD_S / 2)!;
    expect(sill.stage).toBe('threshold');
    expect(sill.x).toBe(300);
    expect(sill.yaw).toBe(YAW_BACK);
    expect(sidewalkAt(plan, 40.01)).toBeNull();
    // Vient de la gauche (dir = 1) : plus tôt, il est à gauche de la porte et marche.
    const before = sidewalkAt(plan, 20)!;
    expect(before.x).toBeLessThan(300);
    expect(before.gait).toBe('walk');
  });
  it('ressort à exit et repart d’où il vient (sens −dir)', () => {
    const plan = sidewalkPlan(track({}), geo)!;
    expect(sidewalkAt(plan, 60)).toBeNull();
    const out = sidewalkAt(plan, 90.2)!;
    expect(out.stage).toBe('threshold');
    const later = sidewalkAt(plan, 100)!;
    expect(later.x).toBeLessThan(300);
  });
  it('rebroussé : attend debout devant la porte puis se retourne, sans seuil', () => {
    const plan = sidewalkPlan(track({ enter: null, exit: 70, arriveAt: 50 }), geo)!;
    const wait = sidewalkAt(plan, 60)!;
    expect(wait.gait).toBe('stand');
    expect(wait.x).toBe(300);
    for (let t = 50; t < 80; t += 0.25) expect(sidewalkAt(plan, t)?.stage).not.toBe('threshold');
    expect(sidewalkAt(plan, 85)!.x).toBeLessThan(300);
  });
  it('passant : dépasse la porte à arriveAt sans s’arrêter, dans le sens dir', () => {
    const plan = sidewalkPlan(track({ enter: null, exit: null, arriveAt: 50 }), geo)!;
    expect(sidewalkAt(plan, 50)!.x).toBeCloseTo(300, 5);
    expect(sidewalkAt(plan, 55)!.x).toBeGreaterThan(300);
    expect(sidewalkAt(plan, 45)!.x).toBeLessThan(300);
  });
  it('employé : pas de trottoir', () => expect(sidewalkPlan(track({ role: 'staff', arriveAt: null, dir: null }), geo)).toBeNull());
});
