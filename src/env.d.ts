declare module '*.css?inline' {
  const css: string;
  export default css;
}

interface ImportMetaEnv {
}

declare const __WMT_FIXES__: { id: string; title: string }[];
// Graphisme par défaut de la ville : défini seulement par vitest (« classic », le moteur) ; absent en production (Ghibli).
declare const __WMT_ART_DEFAULT__: 'classic' | 'ghibli';
declare const __WMT_BUILD__: string;

// Polices intégrées en data: URL (deco-fonts.ts).
declare module '*.woff2?inline' {
  const src: string;
  export default src;
}
