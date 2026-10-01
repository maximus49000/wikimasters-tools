import type { KnownCard } from './collection-book';

// Dernier recours quand ni le scan ni la grille du site n'ont donné de taille de page.
export const DEFAULT_PAGE_SIZE = 12;

const RARITY_ORDER = ['L', 'UR', 'SR', 'R', 'PC', 'C'];
const rank = (rarity: string | undefined): number => {
  const index = rarity ? RARITY_ORDER.indexOf(rarity) : -1;
  return index === -1 ? RARITY_ORDER.length : index;
};

// Comme le tri par défaut du site : rareté décroissante, puis titre.
export function sortCards(cards: KnownCard[]): KnownCard[] {
  return [...cards].sort((a, b) => rank(a.rarity) - rank(b.rarity) || a.title.localeCompare(b.title, 'fr'));
}

// Nombre de cartes par page du site : la plus grande page vue par le scan, ou comptée dans la grille native.
export function pageSizeOf(scanPageSize: number | undefined, domCount: number): number {
  return Math.max(scanPageSize ?? 0, domCount) || DEFAULT_PAGE_SIZE;
}

export function pageSlice<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pages };
}
