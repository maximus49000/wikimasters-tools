import type { KnownCard } from '../collection/collection-book';
import { rarityName } from '../collection/work-marks';
import type { KindsState } from '../kinds/kinds-book';
import { applyKindFilter, type KindFilter, type KindOption } from '../kinds/kinds-filter';

// Filtres du sélecteur de cartes de « Ma Pièce » : ceux de la Collection (catégorie, nature, occupation / genre, rareté,
// étiquette), sans « ×2 ». Propres au sélecteur : ils ne touchent pas à la page Collection.
export type PickerFilter = { kind: KindFilter; rarity: string; tag: string };
export const NO_PICKER_FILTER: PickerFilter = { kind: { nature: '', facet: '' }, rarity: '', tag: '' };

export const isPickerFilterActive = (filter: PickerFilter): boolean =>
  filter.rarity !== '' || filter.tag !== '' || filter.kind.nature !== '' || filter.kind.facet !== '' || (filter.kind.category ?? '') !== '';

const RARITY_ORDER = ['L', 'UR', 'SR', 'R', 'PC', 'C'];

// Raretés présentes dans les cartes (de la plus rare à la plus commune), avec leur nombre.
export function rarityOptions(cards: KnownCard[]): KindOption[] {
  const counts = new Map<string, number>();
  for (const card of cards) if (card.rarity) counts.set(card.rarity, (counts.get(card.rarity) ?? 0) + 1);
  const rank = (rarity: string): number => {
    const index = RARITY_ORDER.indexOf(rarity);
    return index === -1 ? RARITY_ORDER.length : index;
  };
  return [...counts]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([id, count]) => ({ id, label: rarityName(id) ?? id, count }));
}

const tagKey = (tag: { id?: string; name: string }): string => tag.id ?? tag.name;

// Étiquettes posées sur les cartes, les plus utilisées d'abord.
export function tagOptions(cards: KnownCard[]): KindOption[] {
  const found = new Map<string, KindOption>();
  for (const card of cards) {
    for (const tag of card.tags ?? []) {
      const id = tagKey(tag);
      const known = found.get(id);
      if (known) known.count += 1;
      else found.set(id, { id, label: tag.name, count: 1 });
    }
  }
  return [...found.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
}

// Les cartes qui passent tous les filtres actifs.
export function applyPickerFilter(cards: KnownCard[], state: KindsState, filter: PickerFilter): KnownCard[] {
  const byKind = applyKindFilter(cards, state, filter.kind);
  return byKind.filter(
    (card) => (!filter.rarity || card.rarity === filter.rarity) && (!filter.tag || (card.tags ?? []).some((tag) => tagKey(tag) === filter.tag)),
  );
}
