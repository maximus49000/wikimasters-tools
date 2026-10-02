// Identifiant public de l'application Tidal (PKCE : aucun secret côté client). Le Client Secret ne doit JAMAIS entrer ici.
export const TIDAL_CLIENT_ID = 'Js7eZgbN3qENNo9e';
// Rechercher dans le catalogue ; lire pistes, albums et artistes n'exige aucun scope.
export const TIDAL_SCOPES = ['search.read'];
export const TIDAL_AUTHORIZE_URL = 'https://login.tidal.com/authorize';
export const TIDAL_TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';
export const TIDAL_API_URL = 'https://openapi.tidal.com/v2';
// Retour de l'autorisation dans l'application Android (filtre d'intent de MainActivity).
export const TIDAL_ANDROID_REDIRECT_URI = 'wikimasterstools://tidal';
export const TIDAL_HOME_URL = 'https://tidal.com';

// Pays du catalogue : celui de la langue de l'appareil (fr-FR donne FR), FR à défaut.
export const countryOf = (locale: string | undefined): string => /[-_]([A-Za-z]{2})$/.exec(locale ?? '')?.[1]?.toUpperCase() ?? 'FR';
