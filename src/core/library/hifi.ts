// État du poste hi-fi, déduit du lecteur : rien de mémorisé.
import type { Layout, Placed } from './library-types';
import { ITEM_MODELS } from './item-models';
import { openingOf } from './opened-item';
import { SLEEVE_ZONE_CM } from './surface';

// Vue minimale du lecteur (PlayerView de src/content la satisfait structurellement ; core n'importe pas content).
export type PlayingView = { card: { slug: string } | null; track: { playing: boolean } | null };

export type HifiState = { hifiId: string | null; atHifi: string | null; spinning: boolean };

// Seul le premier poste posé (ordre du layout) sert.
export function activeHifi(layout: Layout): Placed | null {
  return layout.find((p) => p.kind === 'small' && p.item === 'hifi') ?? null;
}

export function hifiState(layout: Layout, view: PlayingView): HifiState {
  const hifi = activeHifi(layout);
  const slug = view.card?.slug;
  if (!hifi || !slug) return { hifiId: hifi?.id ?? null, atHifi: null, spinning: false };
  const at = layout.find((p) => 'slug' in p && p.slug === slug && openingOf(p) !== null) ?? null;
  const atHifi = at ? at.id : null;
  return { hifiId: hifi.id, atHifi, spinning: atHifi !== null && view.track?.playing === true };
}

// Emplacements d'origine vidés tant que l'objet est au poste.
export function hiddenAtHome(state: HifiState): ReadonlySet<string> {
  return state.hifiId !== null && state.atHifi !== null ? new Set([state.atHifi]) : new Set();
}

// ---------- Pochette couchée devant le poste ----------
// Objet au poste : un boîtier rangé (cd, dvd, game, book) ou un vinyle accroché au mur.
export type SleeveKind = 'cd' | 'dvd' | 'game' | 'book' | 'vinyl';
export function sleeveKindOf(p: Placed): SleeveKind | null {
  if (p.kind === 'stored' || p.kind === 'posed') return p.shape;
  if (p.kind === 'wall' && p.shape !== 'poster') return 'vinyl';
  return null;
}

// Mesures réelles (cm) : largeur, hauteur de la couverture, épaisseur.
const SLEEVE_CM: Record<SleeveKind, [number, number, number]> = {
  cd: [14.2, 12.5, 1], dvd: [13.5, 19, 1.4], game: [13.5, 17, 1.4], book: [15, 22, 2.4], vinyl: [31.4, 31.4, 0.5],
};
// La pochette tient entre le bord avant du bureau et la façade du poste : au-delà de 14,5 cm de profondeur elle est réduite (proportions gardées).
const SLEEVE_MAX_D = SLEEVE_ZONE_CM;
// Un peu de biais (degrés, autour de la verticale) et décalée vers la droite : posée à la main, elle ne cache pas l'afficheur.
const SLEEVE_TILT = -8;
const SLEEVE_SHIFT_X = 7;

type V3 = [number, number, number];
// Coins de la pochette posée (cm, repère du bureau ; z croît vers le fond) : dessus puis dessous, chacun dans l'ordre
// fond gauche, fond droit, avant droit, avant gauche (le haut de la couverture vers le poste) ; `w` × `d` : taille posée.
export function sleeveRest(hifi: { x: number; y: number; z: number }, kind: SleeveKind): { top: V3[]; bottom: V3[]; w: number; d: number } {
  const [w0, d0, t] = SLEEVE_CM[kind];
  const k = Math.min(1, SLEEVE_MAX_D / d0);
  const [w, d] = [w0 * k, d0 * k];
  const cx = hifi.x + ITEM_MODELS['small-hifi'].w / 2 + SLEEVE_SHIFT_X;
  const cz = Math.max(d / 2 + 0.5, hifi.z - d / 2 - 1);
  const a = (SLEEVE_TILT * Math.PI) / 180;
  const at = (u: number, v: number, y: number): V3 => [cx + u * Math.cos(a) - v * Math.sin(a), y, cz + u * Math.sin(a) + v * Math.cos(a)];
  const quad = (y: number): V3[] => [at(-w / 2, d / 2, y), at(w / 2, d / 2, y), at(w / 2, -d / 2, y), at(-w / 2, -d / 2, y)];
  return { top: quad(hifi.y + t), bottom: quad(hifi.y), w, d };
}
