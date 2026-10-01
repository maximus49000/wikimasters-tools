import { useEffect, useState } from 'react';
import { EMPTY_KINDS, type KindsState } from '../core/kinds/kinds-book';
import type { KindFilter } from '../core/kinds/kinds-filter';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { KindFilterSource } from './kind-filter';
import { createThrottledLoader } from './throttle';

// État Wikidata (natures, occupations, genres) et filtre choisi dans la rangée de listes, tenus à jour pour une vue.
export function useKindState(kinds: KindsRepo, source: KindFilterSource): { kindsState: KindsState; kindFilter: KindFilter } {
  const [kindsState, setKindsState] = useState<KindsState>(EMPTY_KINDS);
  const [kindFilter, setKindFilter] = useState<KindFilter>(() => source.current());

  useEffect(() => {
    let alive = true;
    const load = () => void kinds.load().then((state) => alive && setKindsState(state));
    const reload = createThrottledLoader(load, 1000);
    load();
    const off = kinds.subscribe(reload.call);
    return () => {
      alive = false;
      reload.cancel();
      off();
    };
  }, [kinds]);

  useEffect(() => source.subscribe(() => setKindFilter(source.current())), [source]);

  return { kindsState, kindFilter };
}
