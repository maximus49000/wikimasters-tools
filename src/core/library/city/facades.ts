import { PODIUM_H, SKYLINE_GROUND, citySkyline, hashString, mulberry32, type Building, type Lamp, type Podium } from '../scene-world';
import { BUILDING_STRETCH, GROUND_FLOOR, cityMetrics } from './metrics';

// Façades de la scène Ville, dérivées de `citySkyline` SANS en changer le tirage (mêmes largeurs, hauteurs et fenêtres) :
// - les immeubles sont plus hauts d'un facteur BUILDING_STRETCH (proportions avec les passants et les entrées) ;
//   les fenêtres tirées par `citySkyline` restent en haut, à leur espacement, et les étages ajoutés en bas reçoivent
//   des fenêtres tirées à part (générateur propre à l'immeuble), en laissant un rez-de-chaussée sans fenêtre pour l'entrée ;
// - les immeubles du fond reçoivent quelques fenêtres « dissipées » (petites, peu nombreuses), elles aussi tirées à part.
// Constantes déplacées dans metrics.ts (cassent un cycle d'import avec facade-layout.ts), réexportées ici.
export { BUILDING_STRETCH, GROUND_FLOOR } from './metrics';
// Plafond de fenêtres dessinées par immeuble du fond (coût mobile : quelques dizaines de nœuds par zone de 360 px).
export const FAR_WINDOWS_MAX = 8;
export const FAR_WINDOW = { w: 3.5, h: 5 } as const;

export type FarWindow = { x: number; y: number; u: number; blue: boolean };
export type Facade = Building & { farWindows: FarWindow[] };

// Bas des étages d'un immeuble : haut du socle pour une tour de jumeaux, haut du rez-de-chaussée sinon.
const floorsBottom = (b: Building, ground: number): number => ground - (b.podium ? PODIUM_H : GROUND_FLOOR);

// Fenêtres des étages ajoutés sous la grille d'origine (même grille : colonnes de 10 px, rangées de 14 px, fenêtres 5 × 7).
export function extraFloorWindows(b: Building, ground: number, seed: number): Lamp[] {
  const top = ground - b.h * BUILDING_STRETCH;
  const rows = Math.floor(b.h / 14);
  const cols = Math.floor(b.w / 10);
  const rng = mulberry32(seed ^ hashString('extra-floors') ^ Math.round(b.x * 8));
  const out: Lamp[] = [];
  for (let r = rows; top + 4 + r * 14 + 7 <= floorsBottom(b, ground); r++) {
    for (let c = 0; c < cols; c++) out.push({ x: b.x + 4 + c * 10, y: top + 4 + r * 14, u: rng(), blue: rng() < 0.15 });
  }
  return out;
}

// Étage du socle des jumeaux : une rangée de fenêtres 5 × 7 au pas de 10, centrée sur la largeur du socle.
export function podiumWindows(p: Podium, ground: number, seed: number): Lamp[] {
  const n = Math.floor((p.w - 6) / 10);
  const x0 = p.x + (p.w - (n * 10 - 5)) / 2;
  const rng = mulberry32(seed ^ hashString('podium-floor') ^ Math.round(p.x * 8));
  const y = ground - PODIUM_H + (PODIUM_H - GROUND_FLOOR - 7) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * 10, y, u: rng(), blue: rng() < 0.15 }));
}

// Quelques fenêtres d'un immeuble du fond, réparties dans sa moitié haute (le bas est caché par le premier plan).
export function farWindows(b: Building, ground: number, seed: number): FarWindow[] {
  const top = ground - b.h * BUILDING_STRETCH;
  const cols = Math.max(1, Math.floor((b.w - 6) / 8));
  const rows = Math.max(1, Math.floor((b.h * BUILDING_STRETCH * 0.55) / 11));
  const rng = mulberry32(seed ^ hashString('far-lights') ^ Math.round(b.x * 8));
  // Tirage sans remise de cellules de la grille (Fisher-Yates partiel), puis seuil et teinte par fenêtre.
  const cells = Array.from({ length: cols * rows }, (_, i) => i);
  const count = Math.min(FAR_WINDOWS_MAX, cells.length);
  const out: FarWindow[] = [];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (cells.length - i));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
    const cell = cells[i]!;
    out.push({ x: b.x + 4 + (cell % cols) * 8, y: top + 5 + Math.floor(cell / cols) * 11, u: rng(), blue: rng() < 0.3 });
  }
  return out;
}

// Immeubles de la ville tels que dessinés : hauteur étirée, fenêtres d'origine remontées en haut + étages ajoutés.
// `citySkyline` pose ses fenêtres sur son propre sol (SKYLINE_GROUND) : elles sont recalées sur le sol de la rue.
export function cityFacades(width: number, height: number, seed: number): Facade[] {
  const { ground } = cityMetrics(height);
  const shift = height * SKYLINE_GROUND - ground;
  return citySkyline(width, height, seed).map((b) => {
    const lift = b.h * (BUILDING_STRETCH - 1);
    const h = b.h * BUILDING_STRETCH;
    if (b.far) return { ...b, h, farWindows: farWindows(b, ground, seed) };
    const bottom = floorsBottom(b, ground);
    const lamps = [
      ...b.lamps.map((l) => ({ ...l, y: l.y - lift - shift })).filter((l) => l.y + 7 <= bottom),
      ...extraFloorWindows(b, ground, seed),
      ...(b.podium && b.x === b.podium.x ? podiumWindows(b.podium, ground, seed) : []),
    ];
    return { ...b, h, lamps, farWindows: [] };
  });
}
