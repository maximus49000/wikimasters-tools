import { RELAY_BASE } from '../documentary/config';

// IGDB passe par le relais Cloudflare, qui détient les identifiants Twitch et le jeton : l'extension et l'APK n'en contiennent aucun.
export const IGDB_RELAY = `${RELAY_BASE}/igdb/games`;

export const STEAM_STORE_BASE = 'https://store.steampowered.com';
export const STEAM_API_BASE = 'https://api.steampowered.com';
export const IGDB_COVER_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_big';
export const IGDB_THUMB_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_small';

// TheGamesDB (versions par console, scans de boîtes) : même principe, la clé reste dans le relais.
export const TGDB_RELAY = `${RELAY_BASE}/tgdb`;
export const TGDB_CDN = 'https://cdn.thegamesdb.net/images';
