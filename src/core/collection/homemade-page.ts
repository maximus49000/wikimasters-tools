import type { KnownCard } from './collection-book';

// Dernier recours quand ni le scan ni la grille du site n'ont donné de taille de page.
export const DEFAULT_PAGE_SIZE = 12;

const RARITY_ORDER = ['L', 'UR', 'SR', 'R', 'PC', 'C'];
const rank = (rarity: string | undefined): number => {
  const index = rarity ? RARITY_ORDER.indexOf(rarity) : -1;
  return index === -1 ? RARITY_ORDER.length : index;
};

// Comme le tri par défaut du site : rareté décroissante, puis titre.
// `priceOf` : tri par dernier prix de vente connu, décroissant ; les cartes sans prix viennent en dernier.
// `siteOrder` : ordre donné par le site pour un autre tri (Nom, Favoris, Date d'ajout) ; les cartes qu'il n'a pas encore
// données viennent après, en ordre de rareté.
export function sortCards(cards: KnownCard[], priceOf?: (slug: string) => number | null, siteOrder?: { index: Map<string, number> }): KnownCard[] {
  const byRarity = (a: KnownCard, b: KnownCard) => rank(a.rarity) - rank(b.rarity) || a.title.localeCompare(b.title, 'fr');
  if (siteOrder && siteOrder.index.size > 0) {
    const { index } = siteOrder;
    return [...cards].sort((a, b) => {
      const ia = index.get(a.slug);
      const ib = index.get(b.slug);
      if (ia === undefined || ib === undefined) return ia === ib ? byRarity(a, b) : ia === undefined ? 1 : -1;
      return ia - ib;
    });
  }
  if (!priceOf) return [...cards].sort(byRarity);
  const prices = new Map(cards.map((card) => [card.slug, priceOf(card.slug)]));
  return [...cards].sort((a, b) => {
    const pa = prices.get(a.slug) ?? null;
    const pb = prices.get(b.slug) ?? null;
    if (pa === null || pb === null) return pa === pb ? byRarity(a, b) : pa === null ? 1 : -1;
    return pb - pa || byRarity(a, b);
  });
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
