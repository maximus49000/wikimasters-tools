import { readSlot, writeSlot, type SlotStorage } from './session-slot';
import { runSearch, waitFor, type SearchOutcome } from './market-search';

const KEY = 'wmt:pendingAuctionSearch';
const MAX_AGE_MS = 60_000;
const ENDING_SOON = 'ending_soon';

// Recherche demandée depuis une fiche d'enchère : elle survit à la navigation vers la liste du marché.
export function setPendingAuctionSearch(storage: SlotStorage, title: string, now: number): void {
  writeSlot(storage, KEY, { title }, now);
}

export function takePendingAuctionSearch(storage: SlotStorage, now: number): string | null {
  const value = readSlot<{ title?: unknown }>(storage, KEY, MAX_AGE_MS, now, true);
  return typeof value?.title === 'string' ? value.title : null;
}

// Le menu de tri est repéré par son option « Fin imminente », pas par des classes CSS.
export function findSortSelect(root: ParentNode): HTMLSelectElement | null {
  for (const select of root.querySelectorAll<HTMLSelectElement>('select')) {
    if (select.querySelector(`option[value="${ENDING_SOON}"]`)) return select;
  }
  return null;
}

// Un menu contrôlé (React…) ignore `select.value = …` : on passe par le setter natif puis on émet `change`.
function chooseEndingSoon(select: HTMLSelectElement): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(select, ENDING_SOON);
  else select.value = ENDING_SOON;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

// Tri « Fin imminente » d'abord (les résultats arrivent déjà triés), puis la recherche du titre de la carte.
export async function showAuctionsEndingSoon(
  root: ParentNode,
  title: string,
  timeoutMs = 10_000,
): Promise<SearchOutcome> {
  const select = await waitFor(() => findSortSelect(root), timeoutMs);
  if (select) chooseEndingSoon(select);
  return runSearch(root, title, { timeoutMs });
}
