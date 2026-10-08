declare module '*.css?inline' {
  const css: string;
  export default css;
}

interface ImportMetaEnv {
}

declare const __WMT_FIXES__: { id: string; title: string }[];
declare const __WMT_BUILD__: string;
