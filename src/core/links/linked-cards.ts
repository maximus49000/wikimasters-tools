import type { KnownCard } from '../collection/collection-book';
import { citersOf, linksOf, type LinksState } from './links-book';

// Les cartes de la Collection à un saut de cette carte : celles qu'elle cite et celles qui la citent (jamais un article hors Collection,
// ni un point partagé de la Toile). Les plus consultées d'abord ; sans chiffre, en dernier ; à égalité, par titre.
export function linkedCards(cards: KnownCard[], links: LinksState, slug: string): KnownCard[] {
  const owned = new Map(cards.map((card) => [card.slug, card]));
  if (!owned.has(slug)) return [];
  const linked = new Set([...linksOf(links, slug), ...citersOf(links, slug)]);
  linked.delete(slug);
  return [...linked]
    .flatMap((link) => owned.get(link) ?? [])
    .sort((a, b) => (b.pageviews ?? -1) - (a.pageviews ?? -1) || a.title.localeCompare(b.title, 'fr'));
}

// Au plus six cartes dans la fiche ; les autres s'ouvrent dans une fenêtre.
export const LINKED_PREVIEW_MAX = 6;

// Consultations en abrégé : « 412 k », « 1,2 M ».
export function formatViews(views: number | undefined): string {
  if (views === undefined) return '';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} M`;
  if (views >= 1_000) return `${Math.round(views / 1_000)} k`;
  return String(views);
}
