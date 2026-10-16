// Vrais logos de consoles (SVG de Wikimedia Commons, voir src/assets/console-logos/SOURCES.md), embarqués dans le paquet :
// servis en `data:` (hors ligne, mêmes octets dans l'extension et l'app Android).
import threeDs from '../assets/console-logos/3ds.svg?raw';
import ds from '../assets/console-logos/ds.svg?raw';
import nintendo from '../assets/console-logos/nintendo.svg?raw';
import playstation from '../assets/console-logos/playstation.svg?raw';
import ps4 from '../assets/console-logos/ps4.svg?raw';
import ps5 from '../assets/console-logos/ps5.svg?raw';
import switchMark from '../assets/console-logos/switch.svg?raw';
import wii from '../assets/console-logos/wii.svg?raw';
import wiiu from '../assets/console-logos/wiiu.svg?raw';
import xboxOne from '../assets/console-logos/xbox-one.svg?raw';
import xboxSeries from '../assets/console-logos/xbox-series.svg?raw';
import xboxSphere from '../assets/console-logos/xbox-sphere.svg?raw';

export type ConsoleLogo = 'playstation' | 'ps4' | 'ps5' | 'xbox-sphere' | 'xbox-one' | 'xbox-series' | 'switch' | 'wii' | 'wiiu' | 'ds' | '3ds' | 'nintendo';

const RAW: Record<ConsoleLogo, string> = {
  playstation, ps4, ps5, 'xbox-sphere': xboxSphere, 'xbox-one': xboxOne, 'xbox-series': xboxSeries,
  switch: switchMark, wii, wiiu, ds, '3ds': threeDs, nintendo,
};
// Fichiers « logo + mot » recadrés sur le mot seul (le logo PS est posé à part, au-dessus, comme sur la vraie tranche).
const CROP: Partial<Record<ConsoleLogo, string>> = { ps4: '165 0 338 105', ps5: '330 0 661 216' };

const ROOT = /<svg\b[^>]*>/;
// Racine sans largeur/hauteur propres (le logo suit son cadre), cadre éventuellement recadré.
function prepared(name: ConsoleLogo): { svg: string; aspect: number } {
  const raw = RAW[name];
  const root = ROOT.exec(raw)![0];
  const vb = CROP[name] ?? /viewBox="([^"]*)"/.exec(root)![1]!;
  const [, , vw, vh] = vb.trim().split(/[\s,]+/).map(Number) as [number, number, number, number];
  const fixed = root.replace(/\s(width|height|viewBox)="[^"]*"/g, '').replace(/<svg\b/, `<svg viewBox="${vb}"`);
  return { svg: raw.replace(root, fixed), aspect: vw / vh };
}

const cache = new Map<string, string>();
const shapes = new Map<ConsoleLogo, { svg: string; aspect: number }>();
const shapeOf = (name: ConsoleLogo) => {
  let s = shapes.get(name);
  if (!s) shapes.set(name, (s = prepared(name)));
  return s;
};

// Largeur / hauteur du logo (cadre recadré compris).
export const logoAspect = (name: ConsoleLogo): number => shapeOf(name).aspect;

// Image `data:` du logo ; `tint` : teinte unie (blanc sur un bandeau de couleur…) posée par un filtre ajouté au fichier.
export function logoUri(name: ConsoleLogo, tint?: string): string {
  const key = `${name}|${tint ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let svg = shapeOf(name).svg;
  if (tint) {
    const root = ROOT.exec(svg)![0];
    const filter = `<defs><filter id="wmt-tint" color-interpolation-filters="sRGB"><feFlood flood-color="${tint}"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs><g filter="url(#wmt-tint)">`;
    const end = svg.lastIndexOf('</svg>');
    svg = `${svg.slice(0, end).replace(root, root + filter)}</g></svg>`;
  }
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, uri);
  return uri;
}
