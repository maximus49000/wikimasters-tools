// src/core/game/igdb-queries.ts
// Requêtes IGDB (langage « APIcalypse ») : le client les fabrique, le relais n'accepte que ces formes exactes.
export const DETAIL_FIELDS =
  'id,name,summary,first_release_date,url,genres.name,platforms.name,involved_companies.developer,involved_companies.company.name,aggregated_rating,aggregated_rating_count,total_rating,total_rating_count,videos.video_id,cover.image_id';
export const SEARCH_FIELDS = 'id,name,first_release_date,platforms.name,cover.image_id,total_rating_count';

// Les guillemets, les barres obliques inverses et les points-virgules casseraient la requête.
const clean = (text: string): string => text.replace(/[\\";]/g, ' ').trim();

export function detailQuery(by: { id: number } | { slug: string }): string {
  const where = 'id' in by ? `id = ${by.id}` : `slug = "${clean(by.slug)}"`;
  return `fields ${DETAIL_FIELDS}; where ${where}; limit 1;`;
}

export const searchQuery = (title: string): string => `search "${clean(title)}"; fields ${SEARCH_FIELDS}; limit 10;`;
