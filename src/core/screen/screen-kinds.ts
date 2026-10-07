import type { CardKinds } from '../kinds/wikidata-kinds';

export type ScreenKind = 'film' | 'series' | 'person';

// Natures Wikidata : film, court métrage, film d'animation, film d'animation japonais, long métrage, film muet, documentaire, téléfilm ; série télévisée, série d'animation, mini-série.
const FILM = new Set(['Q11424', 'Q24862', 'Q202866', 'Q506240', 'Q20650540', 'Q29168811', 'Q24869', 'Q226730', 'Q93204']);
const SERIES = new Set(['Q5398426', 'Q581714', 'Q1259759']);
const HUMAN = 'Q5';
// Métiers : acteur, acteur de cinéma, de télévision, de voix-off ; réalisateur de cinéma, de télévision.
const ACTING = new Set(['Q33999', 'Q10800557', 'Q10798782', 'Q2405480']);
const DIRECTING = new Set(['Q2526255', 'Q2059704']);

// Ce que la fiche peut raconter d'une carte : film, série, ou personne de cinéma ; null si rien.
export function screenKindOf(kinds: CardKinds | undefined): ScreenKind | null {
  if (!kinds) return null;
  if (kinds.natures.some((id) => FILM.has(id))) return 'film';
  if (kinds.natures.some((id) => SERIES.has(id))) return 'series';
  const roles = personRoles(kinds);
  if (kinds.natures.includes(HUMAN) && (roles.acting || roles.directing)) return 'person';
  return null;
}

// Les filmographies à montrer : rôles d'acteur, réalisations, ou les deux.
export function personRoles(kinds: CardKinds | undefined): { acting: boolean; directing: boolean } {
  const occupations = kinds?.occupations ?? [];
  return { acting: occupations.some((id) => ACTING.has(id)), directing: occupations.some((id) => DIRECTING.has(id)) };
}
