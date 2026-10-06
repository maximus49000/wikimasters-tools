declare module '*.css?inline' {
  const css: string;
  export default css;
}

interface ImportMetaEnv {
  readonly WXT_TMDB_API_KEY?: string;
  readonly WXT_GITHUB_ISSUES_TOKEN?: string;
  readonly WXT_IGDB_CLIENT_ID?: string;
  readonly WXT_IGDB_CLIENT_SECRET?: string;
}

// Build allégé de hls.js : mêmes types que le paquet complet.
declare module 'hls.js/light' {
  export { default } from 'hls.js';
}
