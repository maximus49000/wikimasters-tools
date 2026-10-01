import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { filterLocally } from '../core/collection/local-filter';
import type { KindsState } from '../core/kinds/kinds-book';
import { buildKindOptions, hasDuplicates, selectNature } from '../core/kinds/kinds-filter';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { CollectionFilterSource } from './collection-filter';
import type { KindFilterSource } from './kind-filter';
import { KIND_ROW_ATTRIBUTE, ensureKindRow, removeKindRow, type KindRowModel } from './kind-row';

const LOG = '[wikimasters-tools]';

export type KindRowDeps = {
  collection: Pick<CollectionRepo, 'list' | 'subscribe'>;
  kinds: Pick<KindsRepo, 'load' | 'subscribe' | 'resolveMissing'>;
  filterSource: Pick<CollectionFilterSource, 'current' | 'subscribe'>;
  kindFilterSource: KindFilterSource;
};

// Rangée de listes nature / occupation : elle propose les valeurs des cartes que laisse le filtre natif en cours
// (étiquette, rareté), lance le relevé Wikidata des cartes pas encore classées, et écrit le choix dans `kindFilterSource`.
export function createKindRowController({ collection, kinds, filterSource, kindFilterSource }: KindRowDeps) {
  let target: HTMLElement | null = null;
  let subscribed = false;
  let version = 0;
  // Dernières données lues : nécessaires pour réagir à un choix de nature.
  let base: KnownCard[] = [];
  let state: KindsState | null = null;

  const handlers = {
    onNature(value: string) {
      if (state) kindFilterSource.set({ ...selectNature(base, state, kindFilterSource.current(), value), duplicates: kindFilterSource.current().duplicates });
    },
    onFacet(value: string) {
      kindFilterSource.set({ ...kindFilterSource.current(), facet: value });
    },
  };

  async function refresh(): Promise<void> {
    if (!target) return;
    const mine = ++version;
    const [cards, loaded] = await Promise.all([collection.list(), kinds.load()]);
    if (mine !== version || !target) return;
    void kinds.resolveMissing(cards.map((card) => card.slug)).catch((error) => console.warn(LOG, 'natures non relevées :', error));

    const native = filterLocally(cards, filterSource.current());
    const filter = kindFilterSource.current();
    const nativeCards = native ? cards.filter((card) => native.has(card.slug)) : cards;
    base = filter.duplicates ? nativeCards.filter(hasDuplicates) : nativeCards;
    state = loaded;
    const options = buildKindOptions(base, loaded, filter);
    const classified = cards.filter((card) => Object.prototype.hasOwnProperty.call(loaded.cards, card.slug)).length;
    const model: KindRowModel = {
      nature: filter.nature,
      facet: filter.facet,
      natures: options.natures,
      facets: options.facets,
      facetPlaceholder: options.facetPlaceholder,
      progress: classified < cards.length ? `${classified} / ${cards.length} cartes classées` : null,
    };
    ensureKindRow(target, model, handlers);
  }

  function subscribeOnce(): void {
    if (subscribed) return;
    subscribed = true;
    const refreshLater = () => void refresh().catch((error) => console.warn(LOG, 'filtres nature indisponibles :', error));
    collection.subscribe(refreshLater);
    kinds.subscribe(refreshLater);
    filterSource.subscribe(refreshLater);
    kindFilterSource.subscribe(refreshLater);
  }

  return {
    // Appelé à chaque changement du DOM : rien à faire quand la rangée est déjà en place (les sources abonnées
    // la tiennent à jour) ; sinon (premier appel, cible changée, rangée perdue) on la pose.
    mount(next: HTMLElement): void {
      const placed = next.previousElementSibling?.hasAttribute(KIND_ROW_ATTRIBUTE) === true;
      if (target === next && placed) return;
      target = next;
      subscribeOnce();
      void refresh().catch((error) => console.warn(LOG, 'filtres nature indisponibles :', error));
    },
    unmount(): void {
      target = null;
      version += 1;
      removeKindRow(document);
    },
  };
}

export type KindRowController = ReturnType<typeof createKindRowController>;
