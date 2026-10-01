import type { CardKinds } from '../kinds/wikidata-kinds';

export type MusicKind = 'track' | 'album' | 'artist';

// Natures Wikidata d'une œuvre musicale : chanson, single, composition ; albums (studio, live, compilation, EP).
const TRACK = new Set(['Q7366', 'Q134556', 'Q105543609']);
const ALBUM = new Set(['Q482994', 'Q208569', 'Q209939', 'Q222910']);
// Groupe musical ; ou personne dont un métier est musical (chanteur, musicien, compositeur, rappeur, DJ, guitariste…).
const BAND = new Set(['Q215380']);
const HUMAN = 'Q5';
const MUSIC_OCCUPATIONS = new Set(['Q177220', 'Q639669', 'Q36834', 'Q488205', 'Q2252262', 'Q130857', 'Q855091', 'Q386854', 'Q158852']);

// Ce qu'on peut écouter d'une carte : son morceau, son album ou ses titres ; null si ce n'est pas de la musique.
export function musicKindOf(kinds: CardKinds | undefined): MusicKind | null {
  if (!kinds) return null;
  if (kinds.natures.some((id) => ALBUM.has(id))) return 'album';
  if (kinds.natures.some((id) => TRACK.has(id))) return 'track';
  if (kinds.natures.some((id) => BAND.has(id))) return 'artist';
  if (kinds.natures.includes(HUMAN) && kinds.occupations.some((id) => MUSIC_OCCUPATIONS.has(id))) return 'artist';
  return null;
}
