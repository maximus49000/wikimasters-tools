import type { KeyValueStore } from '../cache/store';
import type { CollectionRepo } from './collection-repo';
import { EMPTY_LEDGER, planMineEvents, type MineLedger } from './mine-events';

const LEDGER_KEY = 'collection-mine-ledger:v1';

type Mine = { selling?: unknown; history?: unknown; won?: unknown };

// Applique à la Collection les ventes, retours et gains d'une lecture de « mes enchères » (du site ou lue par la surcouche).
// Les lectures sont sérialisées : le registre est lu, planifié puis réécrit sans qu'une autre lecture s'intercale.
export function createMineApplier({ store, collection }: { store: KeyValueStore; collection: Pick<CollectionRepo, 'observe' | 'adjustCopies' | 'list'> }) {
  let tail: Promise<unknown> = Promise.resolve();

  return {
    apply(mine: Mine): Promise<void> {
      const run = tail.then(async () => {
        const plan = planMineEvents((await store.get<MineLedger>(LEDGER_KEY)) ?? EMPTY_LEDGER, mine);
        if (plan.gained.length > 0) await collection.observe(plan.gained);
        // Un dernier exemplaire mis en vente a quitté la Collection : à son retour la carte est inconnue, on la recrée avec ses données.
        const known = new Set((await collection.list()).map((card) => card.slug));
        const back = plan.returned.filter((card) => !known.has(card.slug) && (plan.deltas[card.slug] ?? 0) > 0);
        if (back.length > 0) await collection.observe(back.map((card) => ({ ...card, copies: plan.deltas[card.slug] ?? 1 })));
        const deltas = Object.fromEntries(Object.entries(plan.deltas).filter(([slug]) => !back.some((card) => card.slug === slug)));
        if (Object.keys(deltas).length > 0) await collection.adjustCopies(deltas);
        await store.set(LEDGER_KEY, plan.ledger);
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}
