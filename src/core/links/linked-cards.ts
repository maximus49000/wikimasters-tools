import type { KnownCard } from '../collection/collection-book';
import { citersOf, linksOf, type LinksState } from './links-book';

// Un article « passe-partout » (France, Film…) est cité par une grande part des cartes lues : le lien ne dit rien de précis.
// Seuils : au moins HUB_MIN_CITERS cartes ET au moins HUB_SHARE des cartes lues (une petite Collection n'a pas de passe-partout).
export const HUB_MIN_CITERS = 30;
export const HUB_SHARE = 0.05;

type Citations = { counts: Map<string, number>; threshold: number };

// Nombre de cartes lues qui citent chaque article : calculé une fois par état des liens.
const citationsCache = new WeakMap<LinksState, Citations>();
function citationsOf(links: LinksState): Citations {
  let found = citationsCache.get(links);
  if (!found) {
    const byId = new Map<number, number>();
    const entries = Object.values(links.cards);
    for (const entry of entries) for (const id of entry.links) byId.set(id, (byId.get(id) ?? 0) + 1);
    const counts = new Map<string, number>();
    for (const [id, count] of byId) {
      const title = links.titles[id];
      if (title !== undefined) counts.set(title, count);
    }
    found = { counts, threshold: Math.max(HUB_MIN_CITERS, Math.ceil(entries.length * HUB_SHARE)) };
    citationsCache.set(links, found);
  }
  return found;
}

const citedBy = (citations: Citations, slug: string): number => citations.counts.get(slug) ?? 0;
const isHub = (citations: Citations, slug: string): boolean => citedBy(citations, slug) >= citations.threshold;
// Plus un article est cité par d'autres cartes, moins le lien est précis.
const specificity = (citations: Citations, slug: string): number => 1 / Math.log2(2 + citedBy(citations, slug));

// Les cartes de la Collection à un saut de cette carte : celles qu'elle cite et celles qui la citent (jamais un article hors Collection,
// ni un point partagé de la Toile). Les cartes passe-partout sont écartées, sauf si les deux articles se citent l'un l'autre.
// Ordre : les liens dans les deux sens d'abord, puis les cartes les moins citées ailleurs (les plus précises) ; à égalité, les plus
// consultées, puis par titre.
export function linkedCards(cards: KnownCard[], links: LinksState, slug: string): KnownCard[] {
  const owned = new Map(cards.map((card) => [card.slug, card]));
  if (!owned.has(slug)) return [];
  const cites = new Set(linksOf(links, slug));
  const citers = new Set(citersOf(links, slug));
  const linked = new Set([...cites, ...citers]);
  linked.delete(slug);
  const citations = citationsOf(links);
  return [...linked]
    .flatMap((link) => {
      const card = owned.get(link);
      if (!card) return [];
      const mutual = cites.has(link) && citers.has(link);
      if (!mutual && isHub(citations, link)) return [];
      return [{ card, mutual, score: specificity(citations, link) }];
    })
    .sort(
      (a, b) =>
        Number(b.mutual) - Number(a.mutual) ||
        b.score - a.score ||
        (b.card.pageviews ?? -1) - (a.card.pageviews ?? -1) ||
        a.card.title.localeCompare(b.card.title, 'fr'),
    )
    .map(({ card }) => card);
}

// Une carte à deux sauts : elle n'est pas liée directement, mais passe par un ou plusieurs articles intermédiaires (titres lisibles).
export type ViaCard = { card: KnownCard; via: string[] };

const readable = (slug: string): string => slug.replace(/_/g, ' ');

// Les cartes de la Collection à deux sauts, en passant par un article X, carte ou non : A et B citent X, X cite B, ou X cite A et B.
// Les liens d'un X hors Collection ne sont pas lus : pour lui, seul « A et B le citent » est connu. Les cartes déjà liées
// directement n'y sont pas reprises. Un article passe-partout ne sert jamais d'intermédiaire, et une carte passe-partout n'est pas
// proposée. Les plus précises d'abord (somme de la précision de leurs intermédiaires), puis les plus consultées, puis par titre.
export function linkedCardsViaArticle(cards: KnownCard[], links: LinksState, slug: string): ViaCard[] {
  const owned = new Map(cards.map((card) => [card.slug, card]));
  if (!owned.has(slug)) return [];
  const direct = new Set([...linksOf(links, slug), ...citersOf(links, slug)]);
  direct.delete(slug);
  if (direct.size === 0) return [];
  const citations = citationsOf(links);
  const middles = [...direct].filter((article) => !isHub(citations, article));
  const idOf = new Map(links.titles.map((title, id) => [title, id]));
  const directById = new Map<number, string>();
  for (const article of middles) {
    const id = idOf.get(article);
    if (id !== undefined) directById.set(id, article);
  }
  const vias = new Map<string, Set<string>>();
  const add = (target: string, middle: string): void => {
    if (target === slug || direct.has(target) || !owned.has(target) || isHub(citations, target)) return;
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
  for (const middle of middles) for (const target of linksOf(links, middle)) add(target, middle);
  const name = (article: string): string => owned.get(article)?.title ?? readable(article);
  return [...vias]
    .map(([target, through]) => ({
      card: owned.get(target) as KnownCard,
      via: [...through].map(name).sort((a, b) => a.localeCompare(b, 'fr')),
      score: [...through].reduce((sum, middle) => sum + specificity(citations, middle), 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.card.pageviews ?? -1) - (a.card.pageviews ?? -1) ||
        a.card.title.localeCompare(b.card.title, 'fr'),
    )
    .map(({ card, via }) => ({ card, via }));
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
