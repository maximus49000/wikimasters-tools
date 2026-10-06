import { STEAM_STORE_BASE } from './config';

export const formatCount = (count: number): string => count.toLocaleString('fr-FR');

export const formatPrice = (currency: string, cents: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);

// Les verdicts de Steam arrivent en anglais.
const VERDICTS: Record<string, string> = {
  'Overwhelmingly Positive': 'Extrêmement positives',
  'Very Positive': 'Très positives',
  Positive: 'Positives',
  'Mostly Positive': 'Plutôt positives',
  Mixed: 'Mitigées',
  'Mostly Negative': 'Plutôt négatives',
  Negative: 'Négatives',
  'Very Negative': 'Très négatives',
  'Overwhelmingly Negative': 'Extrêmement négatives',
};
export const verdictFr = (description: string | undefined): string | undefined => (description === undefined ? undefined : (VERDICTS[description] ?? description));

export const yearOfText = (text: string | undefined): number | undefined => {
  const match = text?.match(/\b(\d{4})\b/);
  return match?.[1] ? Number(match[1]) : undefined;
};

export const normalizeTitle = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Affiches de la boutique Steam : portrait (celle d'une carte), puis bandeau ; construites sur l'identifiant, sans appel à l'API.
export const steamArtUrls = (appid: number): string[] => [
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`,
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
];

export const steamPageUrl = (appid: number): string => `${STEAM_STORE_BASE}/app/${appid}`;

export type GameLink = { source: 'steam'; id: number } | { source: 'igdb'; slug: string };

// Une adresse collée par l'utilisateur : page Steam (`/app/<id>`) ou page IGDB (`/games/<slug>`).
export function parseGameLink(text: string): GameLink | null {
  const value = text.trim();
  const steam = value.match(/^(?:https?:\/\/)?store\.steampowered\.com\/(?:agecheck\/)?app\/(\d+)(?:[/?#]|$)/i);
  if (steam?.[1]) return { source: 'steam', id: Number(steam[1]) };
  const igdb = value.match(/^(?:https?:\/\/)?(?:www\.)?igdb\.com\/games\/([a-z0-9][a-z0-9-]*)(?:[/?#]|$)/i);
  if (igdb?.[1]) return { source: 'igdb', slug: igdb[1].toLowerCase() };
  return null;
}
