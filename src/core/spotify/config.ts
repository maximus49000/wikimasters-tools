// Ancien identifiant partagé de l'application Spotify de Wikimasters : il ne sert plus qu'à conserver la liaison des
// installations qui l'utilisaient déjà (voir client-id.ts). Chacun saisit désormais sa propre clé (PKCE : aucun secret côté client).
export const LEGACY_SPOTIFY_CLIENT_ID = '30d88341188741668651e8ab170849cb';
// Réglage local : la clé Spotify de l'utilisateur. Jamais effacée par « Délier ».
export const CLIENT_ID_KEY = 'spotify-client-id';
// Jetons du compte lié.
export const SESSION_KEY = 'spotify-session';
// Piloter la lecture et lire son état, rien d'autre.
export const SPOTIFY_SCOPES = ['user-modify-playback-state', 'user-read-playback-state'];
export const ACCOUNTS_URL = 'https://accounts.spotify.com';
export const API_URL = 'https://api.spotify.com/v1';
// Retour de l'autorisation dans l'application Android (filtre d'intent de MainActivity).
export const ANDROID_REDIRECT_URI = 'wikimasterstools://spotify';
