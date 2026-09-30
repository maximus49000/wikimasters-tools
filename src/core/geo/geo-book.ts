import type { KnownCard } from '../collection/collection-book';
import type { LatLon } from './wiki-coords';

export type GeoState = {
  // null = article interrogé, sans coordonnées (on ne le redemande pas).
  wiki: Record<string, LatLon | null>;
  manual: Record<string, LatLon>;
};

export type Position = LatLon & { source: 'wiki' | 'manual' };

export const EMPTY_GEO: GeoState = { wiki: {}, manual: {} };

// `in` ou l'accès direct verraient « constructor » : on ne regarde que les clés propres.
function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

export function resolvePosition(state: GeoState, slug: string): Position | null {
  const manual = own(state.manual, slug);
  if (manual) return { lat: manual.lat, lon: manual.lon, source: 'manual' };
  const wiki = own(state.wiki, slug);
  return wiki ? { lat: wiki.lat, lon: wiki.lon, source: 'wiki' } : null;
}

export function needsLookup(state: GeoState, slug: string): boolean {
  return !Object.prototype.hasOwnProperty.call(state.wiki, slug);
}

export function setWiki(state: GeoState, slug: string, coords: LatLon | null): GeoState {
  return { ...state, wiki: { ...state.wiki, [slug]: coords } };
}

export function setManual(state: GeoState, slug: string, pos: LatLon): GeoState {
  return { ...state, manual: { ...state.manual, [slug]: { lat: pos.lat, lon: pos.lon } } };
}

export function clearManual(state: GeoState, slug: string): GeoState {
  const manual = { ...state.manual };
  delete manual[slug];
  return { ...state, manual };
}

export type PlacedCard = { card: KnownCard; position: Position };

const byTitle = (a: KnownCard, b: KnownCard) => a.title.localeCompare(b.title, 'fr');

export function partitionCards(
  cards: KnownCard[],
  state: GeoState,
): { placed: PlacedCard[]; unplaced: KnownCard[] } {
  const placed: PlacedCard[] = [];
  const unplaced: KnownCard[] = [];
  for (const card of [...cards].sort(byTitle)) {
    const position = resolvePosition(state, card.slug);
    if (position) placed.push({ card, position });
    else unplaced.push(card);
  }
  return { placed, unplaced };
}
