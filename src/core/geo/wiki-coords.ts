import { z } from 'zod';
import { slugToTitle } from '../market/market-book';

export type LatLon = { lat: number; lon: number };

const responseSchema = z.object({
  query: z.object({
    pages: z.array(
      z.object({
        coordinates: z.array(z.object({ lat: z.number(), lon: z.number() })).optional(),
      }),
    ),
  }),
});

// Un format inattendu lève : il ne doit pas être enregistré comme « article sans coordonnées ».
export function parseWikiCoords(json: unknown): LatLon | null {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikipédia inattendue');
  const first = parsed.data.query.pages[0]?.coordinates?.[0];
  return first ? { lat: first.lat, lon: first.lon } : null;
}

export type FetchLike = (url: string) => Promise<Response>;

// Seul le titre de l'article est envoyé : aucune donnée du jeu ni du compte.
export async function fetchWikiCoords(fetchFn: FetchLike, slug: string): Promise<LatLon | null> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'coordinates',
    titles: slugToTitle(slug),
    redirects: '1',
    coprimary: 'primary',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const response = await fetchFn(`https://fr.wikipedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) throw new Error(`Wikipédia : HTTP ${response.status}`);
  return parseWikiCoords(await response.json());
}
