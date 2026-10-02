import { useEffect, useMemo, useRef, useState } from 'react';
import type { CollectionFilterSource } from './collection-filter';

const NONE = { key: '', index: new Map<string, number>() };
export type SiteOrder = { key: string; index: Map<string, number> };

// Ordre que le site donne à ses cartes quand son tri n'est pas « Rareté » (Nom, Favoris, Date d'ajout…) : lu auprès de
// l'API avec le même tri et les mêmes filtres. Vide tant que la lecture n'est pas finie, ou pour la rareté.
export function useSiteOrder(
  filterSource: CollectionFilterSource,
  loadOrdered: (filter: string, sort: string, isCancelled: () => boolean) => Promise<string[]>,
  filter: string,
): SiteOrder {
  const [sort, setSort] = useState(() => filterSource.sort());
  const [loaded, setLoaded] = useState<{ key: string; slugs: string[] } | null>(null);
  // Une sélection déjà lue est gardée : la retrouver est instantané.
  const cache = useRef(new Map<string, string[]>());

  useEffect(() => filterSource.subscribe(() => setSort(filterSource.sort())), [filterSource]);

  const key = sort ? `${sort}|${filter}` : '';
  useEffect(() => {
    if (!key) return;
    const cached = cache.current.get(key);
    if (cached) {
      setLoaded({ key, slugs: cached });
      return;
    }
    let cancelled = false;
    loadOrdered(filter, sort, () => cancelled)
      .then((slugs) => {
        if (cancelled) return;
        cache.current.set(key, slugs);
        setLoaded({ key, slugs });
      })
      .catch(() => undefined); // lecture impossible : l'ordre par rareté reste
    return () => {
      cancelled = true;
    };
  }, [key, filter, sort, loadOrdered]);

  return useMemo(() => {
    if (!key || loaded?.key !== key) return NONE;
    return { key, index: new Map(loaded.slugs.map((slug, i) => [slug, i])) };
  }, [key, loaded]);
}
