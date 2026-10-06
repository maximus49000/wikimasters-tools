import { describe, expect, it } from 'vitest';
import { EMPTY_LEDGER, planMineEvents } from '../../../src/core/collection/mine-events';

const auction = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: 'active',
  card: { wikipedia_title: title, rarity: 'UR', image_url: 'https://img/x.jpg', atk: 10, def: 20 },
  ...extra,
});

describe('planMineEvents', () => {
  it('la première lecture mémorise l’existant sans rien appliquer', () => {
    const plan = planMineEvents(EMPTY_LEDGER, {
      selling: [auction('s1', 'Paris', { owned: false })],
      history: [auction('h1', 'Rome', { status: 'settled_sold', owned: false })],
      won: [auction('w1', 'Lyon')],
    });
    expect(plan.deltas).toEqual({});
    expect(plan.gained).toEqual([]);
    expect(plan.ledger.ready).toBe(true);
  });

  it('une carte mise en vente et que le site ne possède plus est décomptée une seule fois', () => {
    const base = planMineEvents(EMPTY_LEDGER, {}).ledger;
    const mine = { selling: [auction('s1', 'Paris', { owned: false })] };
    const first = planMineEvents(base, mine);
    expect(first.deltas).toEqual({ Paris: -1 });
    expect(planMineEvents(first.ledger, mine).deltas).toEqual({});
  });

  it('une vente conclue retire la carte, une vente sans acheteur la rend', () => {
    const base = planMineEvents(EMPTY_LEDGER, { selling: [auction('s1', 'Paris'), auction('s2', 'Rome', { owned: false })] }).ledger;
    const sold = planMineEvents(base, { history: [auction('s1', 'Paris', { status: 'settled_sold', owned: false }), auction('s2', 'Rome', { status: 'settled_unsold', owned: true })] });
    expect(sold.deltas).toEqual({ Paris: -1, Rome: 1 });
  });

  it('une enchère gagnée apporte la carte complète, une seule fois', () => {
    const base = planMineEvents(EMPTY_LEDGER, { won: [auction('w1', 'Lyon')] }).ledger;
    const mine = { won: [auction('w1', 'Lyon'), auction('w2', 'Nice')] };
    const plan = planMineEvents(base, mine);
    expect(plan.gained).toEqual([expect.objectContaining({ slug: 'Nice', rarity: 'UR', imageUrl: 'https://img/x.jpg', attack: 10, defense: 20 })]);
    expect(planMineEvents(plan.ledger, mine).gained).toEqual([]);
  });
});
