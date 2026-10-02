import type { KnownCard } from '../collection/collection-book';

export const MAX_SUGGESTIONS = 8;

// Sans accents ni majuscules : « eleve » trouve « Élève ».
export const fold = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Les cartes dont le titre contient le texte tapé : celles qui le commencent d'abord (ou commencent un mot), puis les autres, par ordre alphabétique.
export function matchCards(cards: KnownCard[], query: string, limit = MAX_SUGGESTIONS): KnownCard[] {
  const wanted = fold(query.trim());
  if (!wanted) return [];
  const ranked: { card: KnownCard; rank: number; title: string }[] = [];
  for (const card of cards) {
    const title = fold(card.title);
    const at = title.indexOf(wanted);
    if (at < 0) continue;
    const rank = at === 0 ? 0 : /[\s'’(-]/.test(title.charAt(at - 1)) ? 1 : 2;
    ranked.push({ card, rank, title });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, 'fr'));
  return ranked.slice(0, limit).map((entry) => entry.card);
}
