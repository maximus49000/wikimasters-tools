import { slugToTitle } from '../core/market/market-book';
import { findSearchControls, runSearch, type SearchOutcome } from './market-search';
import { setPendingSearch, type PendingStorage } from './pending-search';

export type StartSearchOutcome = SearchOutcome | 'navigating';

export type SearchStarterDeps = {
  root: ParentNode;
  pathname: () => string;
  navigate: (url: string) => void;
  storage: PendingStorage;
  now: () => number;
  timeoutMs?: number;
};

const MARKETPLACE_PATH = '/marketplace';

export function createSearchStarter(deps: SearchStarterDeps) {
  const { root, pathname, navigate, storage, now, timeoutMs } = deps;

  return async function startSearch(slug: string): Promise<StartSearchOutcome> {
    const query = slugToTitle(slug);

    // Champ déjà à l'écran : on cherche sur place.
    if (findSearchControls(root)) return runSearch(root, query, { timeoutMs });

    // Sur la page Marché, le champ est en train d'apparaître.
    if (pathname().startsWith(MARKETPLACE_PATH)) return runSearch(root, query, { timeoutMs });

    // Ailleurs : on va sur la page Marché ; la recherche reprendra au chargement.
    setPendingSearch(storage, slug, now());
    navigate(MARKETPLACE_PATH);
    return 'navigating';
  };
}

export type SearchStarter = ReturnType<typeof createSearchStarter>;
