import { RELAY_BASE } from '../documentary/config';

// IGDB passe par le relais Cloudflare, qui détient les identifiants Twitch et le jeton : l'extension et l'APK n'en contiennent aucun.
export const IGDB_RELAY = `${RELAY_BASE}/igdb/games`;

export const STEAM_STORE_BASE = 'https://store.steampowered.com';
export const STEAM_API_BASE = 'https://api.steampowered.com';
// Images de la boutique Steam (affiches, bandeaux) : chemin donné par IStoreBrowseService/GetItems.
export const STEAM_ASSETS_BASE = 'https://shared.akamai.steamstatic.com/store_item_assets';
export const IGDB_COVER_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_big';
export const IGDB_THUMB_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_small';

// TheGamesDB (versions par console, scans de boîtes) : même principe, la clé reste dans le relais.
export const TGDB_RELAY = `${RELAY_BASE}/tgdb`;
// Images de TheGamesDB par le relais : son CDN n'envoie pas d'en-têtes CORS (image illisible, impossible à garder sur l'appareil).
export const TGDB_IMAGES = `${RELAY_BASE}/tgdb-img`;
