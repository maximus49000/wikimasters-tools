import type { KnownCard } from '../collection/collection-book';
import { PERSON_NATURE, facetLabel, facetsOf, natureKeys, natureLabel, type KindsState } from './kinds-book';
import type { CardKinds } from './wikidata-kinds';

// `''` = pas de choix. `nature` est une clé de `natureKeys` ; `facet` un identifiant Q (occupation ou genre).
// `duplicates` : ne garder que les cartes possédées en 2 exemplaires ou plus.
export type KindFilter = { nature: string; facet: string; duplicates?: boolean };
export const NO_KIND_FILTER: KindFilter = { nature: '', facet: '' };
export const isKindFilterActive = (filter: KindFilter): boolean => filter.nature !== '' || filter.facet !== '' || filter.duplicates === true;

export type KindOption = { id: string; label: string; count: number };
export type KindOptions = { natures: KindOption[]; facets: KindOption[]; facetPlaceholder: string };

const byCountThenLabel = (a: KindOption, b: KindOption): number => b.count - a.count || a.label.localeCompare(b.label, 'fr');

// Une carte compte une fois par valeur, même si elle la porte plusieurs fois.
function tally(lists: string[][], label: (id: string) => string): KindOption[] {
  const counts = new Map<string, number>();
  for (const list of lists) for (const id of new Set(list)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, label: label(id), count })).sort(byCountThenLabel);
}

// La valeur déjà choisie reste proposée (avec 0 carte) : la liste ne se vide pas sous les yeux de l'utilisateur.
const withSelected = (options: KindOption[], id: string, label: string): KindOption[] =>
  id === '' || options.some((option) => option.id === id) ? options : [...options, { id, label, count: 0 }];

export function buildKindOptions(cards: KnownCard[], state: KindsState, filter: KindFilter): KindOptions {
  const natures = withSelected(
    tally(cards.map((card) => natureKeys(state.cards[card.slug])), (key) => natureLabel(state, key)),
    filter.nature,
    natureLabel(state, filter.nature),
  );
  // Les choix du 2ᵉ filtre ne viennent que des cartes de la nature active.
  const pool = filter.nature ? cards.filter((card) => natureKeys(state.cards[card.slug]).includes(filter.nature)) : cards;
  const facets = withSelected(
    tally(pool.map((card) => facetsOf(state.cards[card.slug])), (id) => facetLabel(state, id)),
    filter.facet,
    facetLabel(state, filter.facet),
  );
  const facetPlaceholder =
    facets.length === 0 ? 'Aucun choix' : !filter.nature ? 'Occupation / genre' : filter.nature === PERSON_NATURE ? 'Occupation' : 'Genre';
  return { natures, facets, facetPlaceholder };
}

export const hasDuplicates = (card: KnownCard): boolean => (card.copies ?? 0) >= 2;

function matches(card: KnownCard, kinds: CardKinds | undefined, filter: KindFilter): boolean {
  if (filter.duplicates && !hasDuplicates(card)) return false;
  if (filter.nature && !natureKeys(kinds).includes(filter.nature)) return false;
  if (filter.facet && !facetsOf(kinds).includes(filter.facet)) return false;
  return true;
}

export function applyKindFilter(cards: KnownCard[], state: KindsState, filter: KindFilter): KnownCard[] {
  return isKindFilterActive(filter) ? cards.filter((card) => matches(card, state.cards[card.slug], filter)) : cards;
}

// Cartes qui passent le filtre ; `null` : filtre inactif, aucune contrainte.
export function kindSlugs(cards: KnownCard[], state: KindsState, filter: KindFilter): Set<string> | null {
  return isKindFilterActive(filter) ? new Set(applyKindFilter(cards, state, filter).map((card) => card.slug)) : null;
}

// `null` = pas de contrainte de ce côté.
export function intersectSlugs(a: Set<string> | null, b: Set<string> | null): Set<string> | null {
  if (a === null) return b;
  if (b === null) return a;
  return new Set([...a].filter((slug) => b.has(slug)));
}

// Changer de nature garde la facette seulement si elle existe encore parmi les choix de cette nature.
export function selectNature(cards: KnownCard[], state: KindsState, filter: KindFilter, nature: string): KindFilter {
  const facets = buildKindOptions(cards, state, { nature, facet: '' }).facets;
  return { nature, facet: facets.some((option) => option.id === filter.facet) ? filter.facet : '' };
}
