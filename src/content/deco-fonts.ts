import caveat from '@fontsource/caveat/files/caveat-latin-600-normal.woff2?inline';
import oswald from '@fontsource/oswald/files/oswald-latin-500-normal.woff2?inline';
import pacifico from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff2?inline';
import patrick from '@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2?inline';
import type { Measure } from '../core/library/text-fit';

// Polices des panneaux (licence OFL), réduites au latin et intégrées au paquet (extension et Android). Déclarées dans le document de la page
// (une déclaration dans une racine fantôme ne charge pas de police) ; si la page les refuse, `fallback` garde le panneau lisible.
export const PANEL_FONTS = {
  'panel-chalk': { family: 'WMT Caveat', weight: 600, lineHeight: 1.05, fallback: '"Segoe Print", "Comic Sans MS", cursive' },
  'panel-letter': { family: 'WMT Oswald', weight: 500, lineHeight: 1.25, fallback: '"Arial Narrow", "Roboto Condensed", sans-serif', upper: true },
  'panel-neon': { family: 'WMT Pacifico', weight: 400, lineHeight: 1.25, fallback: '"Brush Script MT", cursive' },
  'panel-cork': { family: 'WMT Patrick Hand', weight: 400, lineHeight: 1.15, fallback: '"Segoe Print", cursive' },
} as const;

const FACES: [string, number, string][] = [['WMT Caveat', 600, caveat], ['WMT Oswald', 500, oswald], ['WMT Pacifico', 400, pacifico], ['WMT Patrick Hand', 400, patrick]];
const STYLE_ID = 'wmt-deco-fonts';

export function ensureDecoFonts(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = FACES.map(([family, weight, url]) => `@font-face{font-family:"${family}";font-weight:${weight};font-display:swap;src:url(${url}) format("woff2");}`).join('');
  (doc.head ?? doc.documentElement).append(style);
}

// Mesure d'une ligne par un canevas caché (unité : celle de `size`) ; sans canevas (tests), chasse moyenne de 0,55.
let ctx: CanvasRenderingContext2D | null | undefined;
export function measureWith(family: string, weight: number): Measure {
  return (text, size) => {
    if (ctx === undefined) ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext?.('2d') ?? null : null;
    if (!ctx) return text.length * size * 0.55;
    ctx.font = `${weight} ${size * 10}px "${family}"`;
    return ctx.measureText(text).width / 10;
  };
}
