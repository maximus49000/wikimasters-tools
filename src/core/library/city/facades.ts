import { PODIUM_H, citySkyline, hashString, mulberry32, type Building } from '../scene-world';
import { BUILDING_STRETCH, cityMetrics } from './metrics';
import { facadeInputs, facadeLayout, podiumInputs, podiumLayout, type FacadeLayout, type FacadeWindow, type Home, type PodiumLayout } from './facade-layout';

// Façades de la scène Ville, dérivées de `citySkyline` SANS en changer le tirage (mêmes largeurs, hauteurs, socles) :
// - les immeubles sont plus hauts d'un facteur BUILDING_STRETCH (proportions avec les passants et les entrées) ;
// - les fenêtres du premier plan sont celles de la mise en page en travées (facade-layout.ts : étages, logements, cage
//   d'escalier, lucarnes) ; les lampes tirées par `citySkyline` ne sont plus dessinées (elles restent tirées) ;
// - les immeubles du fond reçoivent quelques fenêtres « dissipées » (petites, peu nombreuses), tirées à part.
// Constantes déplacées dans metrics.ts (cassent un cycle d'import avec facade-layout.ts), réexportées ici.
export { BUILDING_STRETCH, GROUND_FLOOR } from './metrics';
// Plafond de fenêtres dessinées par immeuble du fond (coût mobile : quelques dizaines de nœuds par zone de 360 px).
export const FAR_WINDOWS_MAX = 8;
export const FAR_WINDOW = { w: 3.5, h: 5 } as const;

export type FarWindow = { x: number; y: number; u: number; blue: boolean };
// lamps : fenêtres de la mise en page puis, sur la 1re tour d'un jumeau, celles du socle ; `home` indexe `homes` (logements
// de la façade puis du socle). Immeubles du fond : layout null, lamps vides, farWindows non cachées par le premier plan.
export type Facade = Omit<Building, 'lamps'> & { lamps: FacadeWindow[]; homes: Home[]; farWindows: FarWindow[]; layout: FacadeLayout | null; podiumLayout: PodiumLayout | null };

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

// Une fenêtre du fond est cachée si son rectangle recoupe celui d'un immeuble (ou d'un socle) du premier plan,
// de son haut jusqu'au sol (le calque des fenêtres allumées est au-dessus du décor : elle se verrait devant la façade).
export function farWindowHidden(win: FarWindow, near: readonly { x: number; w: number; top: number }[]): boolean {
  return near.some((b) => win.x < b.x + b.w && win.x + FAR_WINDOW.w > b.x && win.y + FAR_WINDOW.h > b.top);
}

// Immeubles de la ville tels que dessinés : hauteur étirée ; au premier plan, fenêtres de la mise en page en travées
// (facade-layout.ts), suivies sur la 1re tour d'un jumeau de celles de son socle ; au fond, quelques fenêtres « dissipées »
// privées de celles que cache le premier plan. Un immeuble du premier plan sans mise en page (partie visible de moins de
// 12 px, au-delà du bord du monde) n'a pas de fenêtres de tour.
export function cityFacades(width: number, height: number, seed: number): Facade[] {
  const { ground } = cityMetrics(height);
  const raw = citySkyline(width, height, seed);
  const inputs = new Map(facadeInputs(width, height, seed).map((input) => [input.index, input]));
  const layouts = raw.map((_, i) => {
    const input = inputs.get(i);
    return input ? facadeLayout(input, ground, seed) : null;
  });
  // Socles visibles : partie visible et porte du lot.
  const podiums = podiumInputs(width, height, seed);
  const front = raw.filter((b) => !b.far);
  const near = [
    ...front.map((b) => ({ x: b.x, w: b.w, top: ground - b.h * BUILDING_STRETCH })),
    ...front.filter((b) => b.podium && b.x === b.podium.x).map((b) => ({ x: b.podium!.x, w: b.podium!.w, top: ground - PODIUM_H })),
  ];
  return raw.map((b, i): Facade => {
    const h = b.h * BUILDING_STRETCH;
    if (b.far) {
      const far = farWindows(b, ground, seed).filter((win) => !farWindowHidden(win, near));
      return { ...b, h, lamps: [], homes: [], farWindows: far, layout: null, podiumLayout: null };
    }
    const layout = layouts[i] ?? null;
    const pin = b.podium && b.x === b.podium.x ? podiums.get(b.podium.id) : undefined;
    const p = pin ? podiumLayout(b.podium!, ground, seed, pin.doorCx, pin.span) : null;
    const shift = layout?.homes.length ?? 0;
    const podiumLamps = (p?.windows ?? []).map((w) => ({ ...w, home: w.home + shift }));
    return {
      ...b,
      h,
      lamps: [...(layout?.windows ?? []), ...podiumLamps],
      homes: [...(layout?.homes ?? []), ...(p?.homes ?? [])],
      farWindows: [],
      layout,
      podiumLayout: p,
    };
  });
}

// Fenêtres de cage d'escalier par porte (clé = centre x de la porte, le même que `data-hall-light`), du bas vers le haut.
// Seuls les immeubles dont la porte est à l'aplomb d'une cage en ont une.
export function stairsFor(facades: readonly Facade[]): Map<number, FacadeWindow[]> {
  const out = new Map<number, FacadeWindow[]>();
  for (const f of facades) {
    const l = f.layout;
    if (!l || l.stairBay === null || l.doorCx === null) continue;
    out.set(l.doorCx, l.windows.filter((w) => w.kind === 'stair').sort((a, b) => b.y - a.y));
  }
  return out;
}
