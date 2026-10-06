import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { EMPTY_LINKS, needsLinksLookup, type LinksState } from '../core/links/links-book';
import { linkedCards } from '../core/links/linked-cards';
import type { LinksRepo } from '../core/links/links-repo';
import { createThrottledLoader } from './throttle';

const RELOAD_MS = 1000;
const LOG = '[wikimasters-tools]';

export type LinkedSource = {
  subscribe(listener: () => void): () => void;
  // Les cartes liées à cette carte (plus consultées d'abord) : même tableau tant que rien ne change, pour un rendu stable.
  linked(slug: string): KnownCard[];
  // Demande la lecture des liens manquants (cette carte d'abord, puis le reste de la Collection) : les liens sont mémorisés.
  ensure(slug: string): void;
};

// Cartes liées d'une fiche : calculées à partir de la Collection et des liens Wikipédia déjà lus (les mêmes que la Toile).
export function createLinkedSource(deps: {
  collection: Pick<CollectionRepo, 'list' | 'subscribe'>;
  links: Pick<LinksRepo, 'load' | 'subscribe' | 'resolveMissing'>;
  now?: () => number;
}): LinkedSource {
  const { collection, links, now = () => Date.now() } = deps;
  let cards: KnownCard[] = [];
  let state: LinksState = EMPTY_LINKS;
  const cache = new Map<string, KnownCard[]>();
  const listeners = new Set<() => void>();
  let started = false;

  const changed = (): void => {
    cache.clear();
    for (const listener of listeners) listener();
  };
  const loadCards = (): void =>
    void collection.list().then(
      (next) => {
        cards = next;
        changed();
      },
      (error) => console.warn(LOG, 'cartes liées : Collection illisible :', error),
    );
  const loadLinks = (): void =>
    void links.load().then(
      (next) => {
        state = next;
        changed();
      },
      (error) => console.warn(LOG, 'cartes liées : liens illisibles :', error),
    );
  const reloadCards = createThrottledLoader(loadCards, RELOAD_MS);
  const reloadLinks = createThrottledLoader(loadLinks, RELOAD_MS);

  // Lecture paresseuse : rien ne démarre tant qu'aucune fiche n'a affiché le bloc.
  const start = (): void => {
    if (started) return;
    started = true;
    collection.subscribe(reloadCards.call);
    links.subscribe(reloadLinks.call);
    loadCards();
    loadLinks();
  };

  return {
    subscribe(listener) {
      start();
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    linked(slug) {
      let list = cache.get(slug);
      if (!list) {
        list = linkedCards(cards, state, slug);
        cache.set(slug, list);
      }
      return list;
    },
    ensure(slug) {
      start();
      const at = now();
      const missing = [slug, ...cards.map((card) => card.slug)].filter(
        (candidate, index, all) => all.indexOf(candidate) === index && needsLinksLookup(state, candidate, at),
      );
      if (missing.length > 0) void links.resolveMissing(missing).catch((error) => console.warn(LOG, 'cartes liées : liens non lus :', error));
    },
  };
}
