import type { CardKinds } from './wikidata-kinds';

export type KindsState = {
  // Une entrée par article interrogé ; toutes les listes vides = article sans valeur (on ne le redemande pas).
  cards: Record<string, CardKinds>;
  // Libellé de chaque identifiant Q rencontré.
  labels: Record<string, string>;
};

export const EMPTY_KINDS: KindsState = { cards: {}, labels: {} };

export const needsKindsLookup = (state: KindsState, slug: string): boolean =>
  !Object.prototype.hasOwnProperty.call(state.cards, slug);

export function setKinds(state: KindsState, kinds: Record<string, CardKinds>, labels: Record<string, string>): KindsState {
  return { cards: { ...state.cards, ...kinds }, labels: { ...state.labels, ...labels } };
}

const HUMAN = 'Q5';
export const PERSON_NATURE = 'group:Personne';
export const UNKNOWN_NATURE = 'unknown';

// Natures voisines réunies sous un même nom à l'affichage et au filtre. Les valeurs stockées restent brutes :
// changer ce tableau ne demande aucun nouveau téléchargement.
const NATURE_GROUPS: Record<string, string> = {
  Q5: 'Personne',
  Q482994: 'Album',
  Q208569: 'Album',
  Q209939: 'Album',
  Q222910: 'Album',
  Q134556: 'Single',
  Q7366: 'Chanson',
  Q11424: 'Film',
  Q571: 'Livre',
  Q8261: 'Livre',
  Q5398426: 'Série télévisée',
  Q7889: 'Jeu vidéo',
  Q131436: 'Jeu de société',
  Q3244175: 'Jeu de société',
  Q573573: 'Jeu de société',
  Q676977: 'Jeu de société',
  Q839864: 'Jeu de société',
  Q142714: 'Jeu de cartes',
  Q734698: 'Jeu de cartes',
  Q1515156: 'Jeu de dés',
  Q1643932: 'Jeu de rôle',
  Q532716: 'Jeu de figurines',
  Q1501543: 'Jeu de figurines',
  Q515: 'Ville',
  Q6256: 'Pays',
};

const capitalize = (text: string): string => text.charAt(0).toLocaleUpperCase('fr') + text.slice(1);

// Clés de nature d'une carte : groupe (« group:Album ») ou identifiant Q non regroupé. Jamais vide.
export function natureKeys(kinds: CardKinds | undefined): string[] {
  const keys = new Set((kinds?.natures ?? []).map((id) => (NATURE_GROUPS[id] ? `group:${NATURE_GROUPS[id]}` : id)));
  return keys.size > 0 ? [...keys] : [UNKNOWN_NATURE];
}

export function natureLabel(state: KindsState, key: string): string {
  if (key === UNKNOWN_NATURE) return 'Inconnu';
  if (key.startsWith('group:')) return key.slice('group:'.length);
  return capitalize(state.labels[key] ?? key);
}

// Occupations d'une personne ; genres de tout le reste.
export function facetsOf(kinds: CardKinds | undefined): string[] {
  if (!kinds) return [];
  return kinds.natures.includes(HUMAN) ? kinds.occupations : kinds.genres;
}

export const facetLabel = (state: KindsState, id: string): string => capitalize(state.labels[id] ?? id);
