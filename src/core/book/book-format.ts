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

// Prix en euros à la française, avec une espace ordinaire (l'espace insécable de Intl complique les comparaisons et les césures).
export const formatEuro = (amount: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount).replace(/[\u00a0\u202f]/g, ' ');

// Jour de lecture d'un prix : « 07/10 ».
export const formatDay = (ms: number): string => {
  const date = new Date(ms);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
};
