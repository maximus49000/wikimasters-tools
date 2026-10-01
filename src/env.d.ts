declare module '*.css?inline' {
  const css: string;
  export default css;
}

interface ImportMetaEnv {
  readonly WXT_TMDB_API_KEY?: string;
}
