import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../../../src/core/library/library-book';
import type { Layout, Pet, PetPlan, Room } from '../../../src/core/library/library-types';
import { layoutSig } from '../../../src/core/library/pets/brain';
import { NO_CONTEXT, type PetContext } from '../../../src/core/library/pets/context';
import { barkPlan, createOutsideWatch, startlePlan, windowOf, STARTLE_MS, OUTSIDE_COOLDOWN_MS } from '../../../src/core/library/pets/outside';
import { createPetRunner } from '../../../src/core/library/pets/runner';
import { standPoint } from '../../../src/core/library/pets/walk-map';
import { CELL_W, WALL_ROWS } from '../../../src/core/library/room-grid';

const sofa: Layout = [{ id: 's', kind: 'sofa', col: 14, row: 10 }] as Layout;
const env = (still = false) => ({ layout: sofa, cols: 24, rng: () => 0.5, still, occupied: new Set<string>() });
const from = { pt: standPoint(3, 16), on: null, hostId: null, facing: 'r' as const };
const WIN_X = 6 * CELL_W;

describe('plans de la vague 1c', () => {
  it('le chien court au pied de la fenêtre et aboie', () => {
    const p = barkPlan(env(), from, WIN_X, 1000);
    expect(p.action).toBe('bark');
    expect(p.route.length).toBeGreaterThan(0);
    expect(Math.abs(p.at.x - WIN_X)).toBeLessThan(3 * CELL_W);
    expect(p.at.y).toBeLessThan(standPoint(0, WALL_ROWS + 2).y);
    expect(p.actMs).toBeGreaterThanOrEqual(3000);
    expect(p.actMs).toBeLessThanOrEqual(5000);
  });
  it('mouvement réduit : sur place', () => {
    expect(barkPlan(env(true), from, WIN_X, 1000).route).toEqual([]);
    expect(startlePlan(env(true), from, 1000, true).action).toBe('startle');
  });
  it('le chat sursaute sur place, ou file sous le canapé', () => {
    const s = startlePlan(env(), from, 1000, false);
    expect(s).toMatchObject({ action: 'startle', route: [], actMs: STARTLE_MS });
    const h = startlePlan(env(), from, 1000, true);
    expect(h.action).toBe('hide');
    expect(h.hostId).toBe('s');
  });
  it('axe d’une vitre', () => {
    expect(windowOf(105, [{ x: 100, w: 40 }])).toBe(120);
    expect(windowOf(200, [{ x: 100, w: 40 }])).toBeNull();
  });
  it('le guet retient un passage par id, dans l’axe, avec un délai entre deux réactions', () => {
    const w = createOutsideWatch();
    const glasses = [{ x: 100, w: 40 }];
    // Un passage hors de l'axe : rien.
    expect(w.update(0, [{ id: 'a', kind: 'dog-walker', x: 400 }], glasses)).toBeNull();
    // Cherche des ids retenus (tirage par id) : le premier retenu devient l'événement, gardé ensuite.
    let got: ReturnType<typeof w.update> = null;
    for (let i = 0; i < 40 && !got; i++) got = w.update(1000, [{ id: `g${i}`, kind: 'costumed', x: 110 }], glasses);
    expect(got).not.toBeNull();
    expect(got!.window).toBe(120);
    const again = w.update(2000, [{ id: 'zz-other', kind: 'dog-walker', x: 110 }], glasses);
    expect(again!.id).toBe(got!.id);
    // Après le délai, un nouveau passage peut être retenu.
    let next = got;
    for (let i = 0; i < 40 && next!.id === got!.id; i++) next = w.update(1000 + OUTSIDE_COOLDOWN_MS + 1, [{ id: `h${i}`, kind: 'dog-walker', x: 110 }], glasses);
    expect(next!.id).not.toBe(got!.id);
  });
});

describe('runner : réaction à un passage', () => {
  const sit = (at: { x: number; y: number }, action: PetPlan['action'] = 'sit'): PetPlan => ({ action, hostId: null, at, on: null, route: [], startedAt: 0, actMs: 1_000_000, facing: 'r', sig: layoutSig(sofa, 24) });
  const room = (pets: Pet[]): Room => ({ ...createInitialState().rooms[0]!, layout: sofa, cols: 24, pets });
  const ctx = (id: string, since = 10_000): PetContext => ({ ...NO_CONTEXT, outside: { id, since, window: WIN_X } });
  const dog = (plan: PetPlan): Pet => ({ id: 'd', species: 'dog', name: 'Rex', coat: 'brown', plan });
  const cat = (plan: PetPlan): Pet => ({ id: 'c', species: 'cat', name: 'Minou', coat: 'orange', plan });
  it('chien éveillé : aboie ; chat proche : sursaute ou se cache ; une seule fois par passage', () => {
    const onPlan = vi.fn();
    const r = createPetRunner({ onPlan, rng: () => 0.9 });
    const rm = room([dog(sit(standPoint(3, 16))), cat(sit(standPoint(5, 16)))]);
    r.step(rm, 10_000, NO_CONTEXT);
    onPlan.mockClear();
    r.step(rm, 10_100, ctx('p1'));
    const plans = new Map(onPlan.mock.calls.map(([id, p]) => [id, p as PetPlan]));
    expect(plans.get('d')?.action).toBe('bark');
    expect(plans.get('c')?.action).toBe('startle');
    onPlan.mockClear();
    r.step(rm, 10_200, ctx('p1'));
    expect(onPlan.mock.calls.filter(([, p]) => (p as PetPlan).action === 'bark')).toHaveLength(0);
  });
  it('chien endormi : rien ; chat loin d’un chien qui aboie : rien', () => {
    const onPlan = vi.fn();
    const r = createPetRunner({ onPlan, rng: () => 0.9 });
    const rm = room([dog(sit(standPoint(3, 16), 'sleep')), cat(sit(standPoint(20, 16)))]);
    r.step(rm, 10_000, NO_CONTEXT);
    onPlan.mockClear();
    r.step(rm, 10_100, ctx('p2'));
    expect(onPlan.mock.calls.some(([, p]) => ['bark', 'startle'].includes((p as PetPlan).action))).toBe(false);
  });
  it('mouvement réduit ou nouvelle trop ancienne : rien', () => {
    for (const [still, since] of [[true, 10_000], [false, 0]] as const) {
      const onPlan = vi.fn();
      const r = createPetRunner({ onPlan, rng: () => 0.9, still });
      const rm = room([dog(sit(standPoint(3, 16)))]);
      r.step(rm, 10_000, NO_CONTEXT);
      onPlan.mockClear();
      r.step(rm, 10_100, ctx('p3', since));
      expect(onPlan.mock.calls.some(([, p]) => (p as PetPlan).action === 'bark')).toBe(false);
    }
  });
});
