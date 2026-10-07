import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createCollectionRepo } from '../../../src/core/collection/collection-repo';
import { createMineApplier } from '../../../src/core/collection/mine-apply';

const auction = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: 'active',
  card: { wikipedia_title: title },
  ...extra,
});

async function setup() {
  const store = createMemoryStore();
  const collection = createCollectionRepo(store);
  await collection.observe([{ slug: 'Paris', title: 'Paris', copies: 1 }, { slug: 'Rome', title: 'Rome', copies: 1 }]);
  return { collection, applier: createMineApplier({ store, collection }) };
}

describe('createMineApplier', () => {
  it('une vente repérée à la lecture suivante retire la carte, sans visite du Marché', async () => {
    const { collection, applier } = await setup();
    await applier.apply({ selling: [], history: [] });
    await applier.apply({ selling: [auction('s1', 'Paris', { owned: false })], history: [] });
    expect((await collection.list()).map((card) => card.slug)).toEqual(['Rome']);
  });

  it('une vente sans acheteur rend la carte', async () => {
    const { collection, applier } = await setup();
    await applier.apply({ selling: [], history: [] });
    await applier.apply({ selling: [auction('s1', 'Paris', { owned: false })] });
    await applier.apply({ history: [auction('s1', 'Paris', { status: 'settled_unsold', owned: true })] });
    expect((await collection.list()).find((card) => card.slug === 'Paris')?.copies).toBe(1);
  });

  it('une même lecture appliquée deux fois ne décompte qu’une fois', async () => {
    const { collection, applier } = await setup();
    await collection.observe([{ slug: 'Paris', title: 'Paris', copies: 2 }]);
    await applier.apply({});
    const mine = { selling: [auction('s1', 'Paris', { owned: false })] };
    await Promise.all([applier.apply(mine), applier.apply(mine)]);
    expect((await collection.list()).find((card) => card.slug === 'Paris')?.copies).toBe(1);
  });
});
