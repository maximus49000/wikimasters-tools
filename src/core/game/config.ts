// Identifiants IGDB (application Twitch « confidentielle »), injectés à la compilation depuis `.env.local` ; vides : IGDB est désactivé.
export const IGDB_CLIENT_ID: string = import.meta.env.WXT_IGDB_CLIENT_ID ?? '';
export const IGDB_CLIENT_SECRET: string = import.meta.env.WXT_IGDB_CLIENT_SECRET ?? '';
export const IGDB_ENABLED: boolean = IGDB_CLIENT_ID !== '' && IGDB_CLIENT_SECRET !== '';

export const STEAM_STORE_BASE = 'https://store.steampowered.com';
export const STEAM_API_BASE = 'https://api.steampowered.com';
export const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
export const IGDB_BASE = 'https://api.igdb.com/v4';
export const IGDB_COVER_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_big';
export const IGDB_THUMB_BASE = 'https://images.igdb.com/igdb/image/upload/t_cover_small';
