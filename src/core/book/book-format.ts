import { OPENLIBRARY_BASE, OPENLIBRARY_COVER_BASE, WIKIPEDIA_ARTICLE_BASE } from './config';

export { normalizeTitle } from '../game/game-format';

// Couverture Open Library (grand format) : adresse construite sur l'identifiant de couverture, sans appel à l'API.
export const coverUrl = (coverId: number): string => `${OPENLIBRARY_COVER_BASE}/${coverId}-L.jpg`;
// Miniature (résultats de la fenêtre « Changer de livre »).
export const coverThumbUrl = (coverId: number): string => `${OPENLIBRARY_COVER_BASE}/${coverId}-S.jpg`;
export const workPageUrl = (workId: string): string => `${OPENLIBRARY_BASE}/works/${workId}`;
export const articleUrl = (slug: string): string => `${WIKIPEDIA_ARTICLE_BASE}/${encodeURIComponent(slug)}`;

// Les identifiants d'œuvre finissent dans une adresse : ils sont vérifiés avant d'être posés.
export const isWorkId = (id: string): boolean => /^OL\d+W$/.test(id);

export function firstIsbn13(isbns: readonly string[] | undefined): string | undefined {
  return isbns?.find((isbn) => /^\d{13}$/.test(isbn));
}
