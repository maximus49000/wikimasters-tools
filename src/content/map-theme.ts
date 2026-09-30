const RGB = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/;

// null : couleur illisible ou transparente (on regarde alors l'élément parent).
export function isDarkColor(css: string): boolean | null {
  const match = RGB.exec(css);
  if (!match) return null;
  if (match[4] !== undefined && Number.parseFloat(match[4]) === 0) return null;
  const luminance = 0.299 * Number(match[1]) + 0.587 * Number(match[2]) + 0.114 * Number(match[3]);
  return luminance < 128;
}

// Le fond de carte suit le thème de la page, pas celui du système.
export function pageIsDark(): boolean {
  for (const element of [document.body, document.documentElement]) {
    const dark = isDarkColor(getComputedStyle(element).backgroundColor);
    if (dark !== null) return dark;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
