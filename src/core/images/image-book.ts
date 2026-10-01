// Image de remplacement d'une carte sans image : `url` est l'image affichée (`null` : rien de trouvé),
// `candidates` les autres images proposées par la recherche, `rejected` celles écartées par « Mauvaise image »,
// `art` : la pochette / l'affiche officielle (Spotify, TMDB) a été trouvée et placée en tête.
export type CardImage = { url: string | null; candidates: string[]; rejected: string[]; art?: true };

// Clé : slug de l'article Wikipédia.
export type ImageState = Record<string, CardImage>;

export const EMPTY_IMAGES: ImageState = {};

// Première image proposée qui n'a pas été écartée.
export const pickImage = (candidates: string[], rejected: string[]): string | null =>
  candidates.find((url) => !rejected.includes(url)) ?? null;

export function setFound(state: ImageState, slug: string, candidates: string[], art = false): ImageState {
  return { ...state, [slug]: { url: pickImage(candidates, []), candidates, rejected: [], ...(art ? { art: true as const } : {}) } };
}

// Pochette officielle trouvée après coup : elle passe en tête, sauf si elle a déjà été écartée par « Mauvaise image ».
export function promoteArt(state: ImageState, slug: string, art: string): ImageState {
  const known = state[slug];
  if (!known || known.rejected.includes(art)) return state;
  const candidates = [art, ...known.candidates.filter((url) => url !== art)];
  return { ...state, [slug]: { ...known, candidates, url: art, art: true } };
}

// « Mauvaise image » : l'image affichée est écartée, la suivante des candidats prend sa place.
export function rejectCurrent(state: ImageState, slug: string): ImageState {
  const known = state[slug];
  if (!known) return state;
  const rejected = known.url && !known.rejected.includes(known.url) ? [...known.rejected, known.url] : known.rejected;
  return { ...state, [slug]: { ...known, rejected, url: pickImage(known.candidates, rejected) } };
}

// Nouveaux candidats après épuisement des précédents : on garde les écartés pour ne pas les reproposer.
export function addCandidates(state: ImageState, slug: string, fresh: string[]): ImageState {
  const known = state[slug] ?? { url: null, candidates: [], rejected: [] };
  const candidates = [...known.candidates, ...fresh.filter((url) => !known.candidates.includes(url))];
  return { ...state, [slug]: { ...known, candidates, url: pickImage(candidates, known.rejected) } };
}
