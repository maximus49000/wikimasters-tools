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

// Une carte à deux sauts : elle n'est pas liée directement, mais passe par un ou plusieurs articles intermédiaires (titres lisibles).
export type ViaCard = { card: KnownCard; via: string[] };

const readable = (slug: string): string => slug.replace(/_/g, ' ');

// Les cartes de la Collection à deux sauts, en passant par un article X, carte ou non : A et B citent X, X cite B, ou X cite A et B.
// Les liens d'un X hors Collection ne sont pas lus : pour lui, seul « A et B le citent » est connu. Les cartes déjà liées
// directement n'y sont pas reprises. Celles qui passent par le plus d'articles d'abord, puis les plus consultées, puis par titre.
export function linkedCardsViaArticle(cards: KnownCard[], links: LinksState, slug: string): ViaCard[] {
  const owned = new Map(cards.map((card) => [card.slug, card]));
  if (!owned.has(slug)) return [];
  const direct = new Set([...linksOf(links, slug), ...citersOf(links, slug)]);
  direct.delete(slug);
  if (direct.size === 0) return [];
  const idOf = new Map(links.titles.map((title, id) => [title, id]));
  const directById = new Map<number, string>();
  for (const article of direct) {
    const id = idOf.get(article);
    if (id !== undefined) directById.set(id, article);
  }
  const vias = new Map<string, Set<string>>();
  const add = (target: string, middle: string): void => {
    if (target === slug || direct.has(target) || !owned.has(target)) return;
    let set = vias.get(target);
    if (!set) vias.set(target, (set = new Set()));
    set.add(middle);
  };
  // B cite X.
  for (const [citer, entry] of Object.entries(links.cards)) {
    if (!owned.has(citer)) continue;
    for (const id of entry.links) {
      const middle = directById.get(id);
      if (middle !== undefined) add(citer, middle);
    }
  }
  // X (carte lue) cite B.
  for (const middle of direct) for (const target of linksOf(links, middle)) add(target, middle);
  const name = (article: string): string => owned.get(article)?.title ?? readable(article);
  return [...vias]
    .map(([target, middles]) => ({ card: owned.get(target) as KnownCard, via: [...middles].map(name).sort((a, b) => a.localeCompare(b, 'fr')) }))
    .sort(
      (a, b) =>
        b.via.length - a.via.length ||
        (b.card.pageviews ?? -1) - (a.card.pageviews ?? -1) ||
        a.card.title.localeCompare(b.card.title, 'fr'),
    );
}

// Au plus quatre cartes à deux sauts dans la fiche ; les autres s'ouvrent dans la fenêtre.
export const VIA_PREVIEW_MAX = 4;

// Au plus six cartes dans la fiche ; les autres s'ouvrent dans une fenêtre.
export const LINKED_PREVIEW_MAX = 6;

// Consultations en abrégé : « 412 k », « 1,2 M ».
export function formatViews(views: number | undefined): string {
  if (views === undefined) return '';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} M`;
  if (views >= 1_000) return `${Math.round(views / 1_000)} k`;
  return String(views);
}
