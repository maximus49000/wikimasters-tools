import { z } from 'zod';
import { TGDB_CDN, TGDB_RELAY } from './config';
import type { GameFetch } from './game-detail';
import { caseStyleOfTgdbPlatform, formatOfTgdbPlatform, type BoxFormat, type CaseStyle } from './platform-boxes';

// Ids de région TheGamesDB signifiant « PAL » (Europe).
// Source : pages publiques https://thegamesdb.net/game.php?id=… (ligne « Region »), relevées le 2026-10-16 :
// region_id 0 = Region Not Set, 1 = NTSC, 2 = NTSC-U, 6 = PAL, 9 = Other.
export const PAL_REGION_IDS: number[] = [6];

// Libellé court de la région d'une version (rien si elle n'est pas renseignée ou ambiguë).
export function regionLabel(id?: number): string | null {
  if (id === 6) return 'Europe (PAL)';
  if (id === 2) return 'Amérique (NTSC-U)';
  if (id === 1) return 'NTSC';
  return null;
}

// Une version d'un jeu sur une console ; front/back = nom de fichier de la pochette sur le CDN.
export type TgdbVersion = {
  id: number;
  title: string;
  platformId: number;
  platformName: string;
  format: BoxFormat;
  style: CaseStyle;
  year?: number;
  regionId?: number;
  overview?: string;
  front?: string;
  back?: string;
};

const game = z.object({
  id: z.number(),
  game_title: z.string(),
  release_date: z.string().nullish(),
  platform: z.number(),
  region_id: z.number().nullish(),
  overview: z.string().nullish(),
});
const boxartItem = z.object({ side: z.string().nullish(), type: z.string().nullish(), filename: z.string() });
// TheGamesDB renvoie un tableau vide à la place d'un objet quand il n'y a rien.
const boxartData = z.record(z.string(), z.array(boxartItem)).or(z.array(z.unknown()));
const platformData = z.record(z.string(), z.object({ name: z.string() })).or(z.array(z.unknown()));
const gamesResponse = z.object({
  data: z.object({ games: z.array(game).optional() }),
  include: z.object({ boxart: z.object({ data: boxartData }).optional(), platform: z.object({ data: platformData }).optional() }).optional(),
});

export function parseTgdbGames(json: unknown): TgdbVersion[] {
  const parsed = gamesResponse.safeParse(json);
  if (!parsed.success) return [];
  const boxart = parsed.data.include?.boxart?.data;
  const platforms = parsed.data.include?.platform?.data;
  const boxOf = (id: number): z.infer<typeof boxartItem>[] => (boxart && !Array.isArray(boxart) ? (boxart as Record<string, z.infer<typeof boxartItem>[]>)[String(id)] : undefined) ?? [];
  const nameOf = (id: number): string => (platforms && !Array.isArray(platforms) ? (platforms as Record<string, { name: string }>)[String(id)]?.name : undefined) ?? '';
  return (parsed.data.data.games ?? []).map((item) => {
    const year = item.release_date ? Number(item.release_date.slice(0, 4)) : Number.NaN;
    const art = boxOf(item.id).filter((entry) => !entry.type || entry.type === 'boxart');
    const front = art.find((entry) => entry.side === 'front')?.filename;
    const back = art.find((entry) => entry.side === 'back')?.filename;
    return {
      id: item.id,
      title: item.game_title,
      platformId: item.platform,
      platformName: nameOf(item.platform),
      format: formatOfTgdbPlatform(item.platform),
      style: caseStyleOfTgdbPlatform(item.platform),
      ...(Number.isFinite(year) ? { year } : {}),
      ...(item.region_id !== null && item.region_id !== undefined ? { regionId: item.region_id } : {}),
      ...(item.overview ? { overview: item.overview } : {}),
      ...(front ? { front } : {}),
      ...(back ? { back } : {}),
    };
  });
}

// Casse, accents, ponctuation et « the » initial ne comptent pas.
function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

// Fiches au titre exact. Avec `year` (choix de la version par défaut) : à ±1 an seulement, pour zéro faux positif ;
// sans (fenêtre « Changer de version ») : tous les portages, quelle que soit leur année.
export function matchingVersions(all: TgdbVersion[], titles: string[], year?: number): TgdbVersion[] {
  const wanted = new Set(titles.map(normalizeTitle).filter((title) => title !== ''));
  return all.filter((version) => wanted.has(normalizeTitle(version.title)) && (year === undefined || version.year === undefined || Math.abs(version.year - year) <= 1));
}

// Ordre : a un dos > format préféré > région PAL > année la plus ancienne > plus petit id.
export function defaultVersion(list: TgdbVersion[], preferred?: BoxFormat): TgdbVersion | null {
  const rank = (version: TgdbVersion): number[] => [
    version.back ? 0 : 1,
    preferred !== undefined && version.format === preferred ? 0 : 1,
    version.regionId !== undefined && PAL_REGION_IDS.includes(version.regionId) ? 0 : 1,
    version.year ?? Number.MAX_SAFE_INTEGER,
    version.id,
  ];
  const before = (a: number[], b: number[]): boolean => {
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return (a[i] ?? 0) < (b[i] ?? 0);
    return false;
  };
  let best: TgdbVersion | null = null;
  for (const version of list) if (best === null || before(rank(version), rank(best))) best = version;
  return best;
}

export function boxartUrl(file: string, size: 'medium' | 'original'): string {
  return `${TGDB_CDN}/${size}/${file}`;
}

async function getJson(fetchFn: GameFetch, url: string): Promise<unknown> {
  try {
    const response = await fetchFn(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// null = panne (réseau, relais, amont) ; [] = rien trouvé.
export async function fetchTgdbVersions(name: string, fetchFn: GameFetch): Promise<TgdbVersion[] | null> {
  const json = await getJson(fetchFn, `${TGDB_RELAY}/games?name=${encodeURIComponent(name)}`);
  return json === null ? null : parseTgdbGames(json);
}

const imageItem = z.object({ type: z.string(), filename: z.string() });
const imagesResponse = z.object({ data: z.object({ images: z.record(z.string(), z.array(imageItem)).or(z.array(z.unknown())) }) });

// Captures d'écran et logo de chaque jeu (noms de fichiers du CDN) ; null = panne.
export async function fetchTgdbImages(ids: number[], fetchFn: GameFetch): Promise<Record<number, { shots: string[]; logo?: string }> | null> {
  if (ids.length === 0) return {};
  const json = await getJson(fetchFn, `${TGDB_RELAY}/images?ids=${ids.join(',')}`);
  if (json === null) return null;
  const parsed = imagesResponse.safeParse(json);
  if (!parsed.success) return null;
  const images = parsed.data.data.images;
  const out: Record<number, { shots: string[]; logo?: string }> = {};
  if (Array.isArray(images)) return out;
  for (const [id, list] of Object.entries(images as Record<string, z.infer<typeof imageItem>[]>)) {
    const shots = list.filter((item) => item.type === 'screenshot').map((item) => item.filename);
    const logo = list.find((item) => item.type === 'clearlogo')?.filename;
    if (shots.length > 0 || logo) out[Number(id)] = { shots, ...(logo ? { logo } : {}) };
  }
  return out;
}
