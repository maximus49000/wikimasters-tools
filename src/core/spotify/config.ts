// Identifiant public de l'application Spotify (PKCE : aucun secret côté client).
export const SPOTIFY_CLIENT_ID = '30d88341188741668651e8ab170849cb';
// Piloter la lecture et lire son état, rien d'autre.
export const SPOTIFY_SCOPES = ['user-modify-playback-state', 'user-read-playback-state'];
export const ACCOUNTS_URL = 'https://accounts.spotify.com';
export const API_URL = 'https://api.spotify.com/v1';
// Retour de l'autorisation dans l'application Android (filtre d'intent de MainActivity).
export const ANDROID_REDIRECT_URI = 'wikimasterstools://spotify';
