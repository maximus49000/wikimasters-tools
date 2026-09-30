import { z } from 'zod';
import { slugToTitle } from '../market/market-book';

const claimSchema = z.object({
  rank: z.string().optional(),
  mainsnak: z.object({
    datavalue: z.object({ value: z.object({ time: z.string(), precision: z.number() }) }).optional(),
  }),
});

const responseSchema = z.object({
  entities: z.record(
    z.string(),
    z.object({
      missing: z.unknown().optional(),
      claims: z.object({ P569: z.array(claimSchema).optional() }).optional(),
    }),
  ),
});

// « +1889-04-20T00:00:00Z » → année décimale (1889.3) ; « -0384-… » → -384 (le mois n'est lu qu'au jour ou au mois près).
function toYear(time: string, precision: number): number | null {
  const match = /^([+-])(\d+)-(\d{2})-/.exec(time);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const year = sign * Number(match[2]);
  const month = precision >= 10 ? Number(match[3]) : 0;
  return year + (month > 0 ? (month - 1) / 12 : 0);
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de date de naissance ».
export function parseWikidataBirth(json: unknown): number | null {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  for (const entity of Object.values(parsed.data.entities)) {
    const claims = (entity.claims?.P569 ?? []).filter((claim) => claim.rank !== 'deprecated');
    // Rang « préféré » d'abord, sinon la première date connue (au moins à l'année près).
    const ordered = [...claims.filter((c) => c.rank === 'preferred'), ...claims.filter((c) => c.rank !== 'preferred')];
    for (const claim of ordered) {
      const value = claim.mainsnak.datavalue?.value;
      if (value && value.precision >= 9) {
        const year = toYear(value.time, value.precision);
        if (year !== null) return year;
      }
    }
  }
  return null;
}

export type FetchLike = (url: string) => Promise<Response>;

// Seul le titre de l'article est envoyé : aucune donnée du jeu ni du compte.
export async function fetchWikidataBirth(fetchFn: FetchLike, slug: string): Promise<number | null> {
  const params = new URLSearchParams({
    action: 'wbgetentities',
    sites: 'frwiki',
    titles: slugToTitle(slug),
    normalize: '1',
    props: 'claims',
    format: 'json',
    origin: '*',
  });
  const response = await fetchFn(`https://www.wikidata.org/w/api.php?${params.toString()}`);
  if (!response.ok) throw new Error(`Wikidata : HTTP ${response.status}`);
  return parseWikidataBirth(await response.json());
}
