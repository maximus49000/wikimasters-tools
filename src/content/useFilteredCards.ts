import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { IDLE_SCAN, type CollectionScanner, type ScanState } from '../core/collection/collection-scan';
import { filterLocally, filterProvisionally } from '../core/collection/local-filter';
import { intersectSlugs, kindSlugs } from '../core/kinds/kinds-filter';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { CollectionFilterSource } from './collection-filter';
import type { KindFilterSource } from './kind-filter';
import { createThrottledLoader } from './throttle';
import { useKindState } from './useKindState';

type Args = {
  collection: CollectionRepo;
  scanner: CollectionScanner;
  kinds: KindsRepo;
  kindFilterSource: KindFilterSource;
  filterSource: CollectionFilterSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
};

// Les cartes de la Collection, et celles qui passent les filtres de la page (site, nature / occupation, ×2).
// `visible` vaut null tant qu'aucun filtre n'est actif (ou que sa lecture n'est pas finie) : toutes les cartes.
export function useFilteredCards({ collection, scanner, kinds, kindFilterSource, filterSource, loadFiltered }: Args) {
  const [cards, setCards] = useState<KnownCard[]>([]);
  const [scan, setScan] = useState<ScanState>(IDLE_SCAN);
  const [filter, setFilter] = useState(() => filterSource.current());
  const [allowed, setAllowed] = useState<{ filter: string; slugs: Set<string> } | null>(null);
  const [filterError, setFilterError] = useState(false);

  useEffect(() => {
    let alive = true;
    const loadCards = () => void collection.list().then((list) => alive && setCards(list));
    const loadScan = () => void scanner.state().then((state) => alive && setScan(state));
    const cardsReload = createThrottledLoader(loadCards, 1000);
    loadCards();
    loadScan();
    const offCollection = collection.subscribe(cardsReload.call);
    const offScan = scanner.subscribe(loadScan);
    return () => {
      alive = false;
      cardsReload.cancel();
      offCollection();
      offScan();
    };
  }, [collection, scanner]);

  useEffect(() => filterSource.subscribe(() => setFilter(filterSource.current())), [filterSource]);

  // Collection entièrement scannée et filtre simple (rareté, étiquette) : les cartes sont déjà connues, pas de requête.
  const localSlugs = useMemo(
    () => (filter && scan.status === 'done' ? filterLocally(cards, filter) : null),
    [filter, scan.status, cards],
  );
  // Une sélection déjà lue est gardée : la retrouver est instantané.
  const filterCache = useRef(new Map<string, Set<string>>());

  useEffect(() => {
    setFilterError(false);
    if (!filter || localSlugs) return;
    const cached = filterCache.current.get(filter);
    if (cached) {
      setAllowed({ filter, slugs: cached });
      return;
    }
    let cancelled = false;
    loadFiltered(filter, () => cancelled)
      .then((slugs) => {
        if (cancelled) return;
        filterCache.current.set(filter, slugs);
        setAllowed({ filter, slugs });
      })
      .catch(() => !cancelled && setFilterError(true));
    return () => {
      cancelled = true;
    };
  }, [filter, loadFiltered, localSlugs]);

  const nativeRead = localSlugs ?? (filter && allowed?.filter === filter ? allowed.slugs : null);
  // En attendant la lecture complète du site : les cartes déjà connues qui passent, jamais toute la Collection.
  const provisional = useMemo(() => (filter && nativeRead === null ? filterProvisionally(cards, filter) : null), [filter, nativeRead, cards]);
  const nativeVisible = nativeRead ?? provisional;
  const { kindsState, kindFilter } = useKindState(kinds, kindFilterSource);
  const kindVisible = useMemo(() => kindSlugs(cards, kindsState, kindFilter), [cards, kindsState, kindFilter]);
  // Filtre du site (étiquette, rareté) et filtre nature / occupation : une carte doit passer les deux.
  const visible = useMemo(() => intersectSlugs(nativeVisible, kindVisible), [nativeVisible, kindVisible]);
  const filtering = Boolean(filter) && nativeRead === null && !filterError;
  return { cards, visible, filtering, filterError };
}
