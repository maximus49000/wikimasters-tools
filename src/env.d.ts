declare module '*.css?inline' {
  const css: string;
  export default css;
}

interface ImportMetaEnv {
  readonly WXT_TMDB_API_KEY?: string;
  readonly WXT_GITHUB_ISSUES_TOKEN?: string;
  readonly WXT_IGDB_CLIENT_ID?: string;
  readonly WXT_IGDB_CLIENT_SECRET?: string;
  readonly WXT_GOOGLE_BOOKS_API_KEY?: string;
}

declare const __WMT_FIXES__: { id: string; title: string }[];
declare const __WMT_BUILD__: string;
