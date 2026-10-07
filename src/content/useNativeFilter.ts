import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import type { ScanState } from '../core/collection/collection-scan';
import { filterLocally, filterProvisionally } from '../core/collection/local-filter';
import type { CollectionFilterSource } from './collection-filter';

type Args = {
  filterSource: CollectionFilterSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
  cards: KnownCard[];
  scan: ScanState;
};

// Cartes qui passent le filtre du site (étiquette, rareté, recherche) : lues localement quand la Collection est
// scannée, sinon demandées au site. `visible === null` : pas de filtre, ou lecture en cours (on montre tout).
export function useNativeFilter({ filterSource, loadFiltered, cards, scan }: Args) {
  const [filter, setFilter] = useState(() => filterSource.current());
  const [allowed, setAllowed] = useState<{ filter: string; slugs: Set<string> } | null>(null);
  const [error, setError] = useState(false);
  // Une sélection déjà lue est gardée : la retrouver est instantané.
  const cache = useRef(new Map<string, Set<string>>());

  useEffect(() => filterSource.subscribe(() => setFilter(filterSource.current())), [filterSource]);

  const localSlugs = useMemo(
    () => (filter && scan.status === 'done' ? filterLocally(cards, filter) : null),
    [filter, scan.status, cards],
  );

  useEffect(() => {
    setError(false);
    if (!filter || localSlugs) return;
    const cached = cache.current.get(filter);
    if (cached) {
      setAllowed({ filter, slugs: cached });
      return;
    }
    let cancelled = false;
    loadFiltered(filter, () => cancelled)
      .then((slugs) => {
        if (cancelled) return;
        cache.current.set(filter, slugs);
        setAllowed({ filter, slugs });
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [filter, loadFiltered, localSlugs]);

  const read = localSlugs ?? (filter && allowed?.filter === filter ? allowed.slugs : null);
  // En attendant la lecture complète du site : les cartes déjà connues qui passent, jamais toute la Collection.
  const provisional = useMemo(() => (filter && read === null ? filterProvisionally(cards, filter) : null), [filter, read, cards]);
  return { filter, visible: read ?? provisional, filtering: Boolean(filter) && read === null && !error, error };
}
