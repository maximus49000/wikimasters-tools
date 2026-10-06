import type { KnownCard } from './collection-book';

// Dernier recours quand ni le scan ni la grille du site n'ont donné de taille de page.
export const DEFAULT_PAGE_SIZE = 12;

const RARITY_ORDER = ['L', 'UR', 'SR', 'R', 'PC', 'C'];
const rank = (rarity: string | undefined): number => {
  const index = rarity ? RARITY_ORDER.indexOf(rarity) : -1;
  return index === -1 ? RARITY_ORDER.length : index;
};

// Mêmes ordres que la liste « Trier la collection » du site (vérifiés sur /api/my-collection) :
// - rareté : rareté décroissante, puis date d'obtention la plus récente d'abord ;
// - « name » : titre, sans tenir compte de la rareté ni des nombres (« (129881) » avant « (13345) ») ;
// - « starred » : favoris d'abord, puis date d'obtention la plus récente d'abord ;
// - « added » : date d'obtention la plus récente d'abord.
// Les cartes sans date viennent après celles qui en ont ; le titre départage les égalités.
// `priceOf` : tri propre à l'extension, par dernier prix de vente connu décroissant ; les cartes sans prix viennent en dernier.
export function sortCards(cards: KnownCard[], priceOf?: (slug: string) => number | null, siteSort = ''): KnownCard[] {
  const byTitle = (a: KnownCard, b: KnownCard) => a.title.localeCompare(b.title, 'fr');
  const byDate = (a: KnownCard, b: KnownCard) => {
    if (a.obtainedAt === undefined || b.obtainedAt === undefined) return a.obtainedAt === b.obtainedAt ? 0 : a.obtainedAt === undefined ? 1 : -1;
    return b.obtainedAt - a.obtainedAt;
  };
  const byRarity = (a: KnownCard, b: KnownCard) => rank(a.rarity) - rank(b.rarity) || byDate(a, b) || byTitle(a, b);
  if (siteSort === 'name') return [...cards].sort(byTitle);
  if (siteSort === 'starred') return [...cards].sort((a, b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)) || byDate(a, b) || byTitle(a, b));
  if (siteSort === 'added') return [...cards].sort((a, b) => byDate(a, b) || byRarity(a, b));
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
