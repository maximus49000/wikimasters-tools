import type { StyleId } from '../library-types';
import type { Fill } from '../furniture-render3d';
import { COOL } from '../paint/cel';
import { hexRgb, mixRgb, type Rgb } from '../paint/color';
import { paletteOf } from '../styles';
import { rgbHex, tone, type Tone } from './tone';

// Allures cellulo des huit styles (G6, tâche 10) : un style = les teintes de sa palette (aplat, ombre, rehaut) + des variantes de
// pièces (pieds, capitons, rivets, plaid, motif) que le dessin 3D des meubles lit, sans changer les volumes (spec §3 : « un style =
// un jeu de couleurs + des variantes de pièces »). Reprise des styles de la maquette (l. 174-178 : scandinave pieds fuselés + plaid,
// bohème pieds droits + plaid à franges + losanges, steampunk pieds griffes + capitons + rivets) étendue aux cinq autres styles.

// Variantes de pièces d'un style : le dessin 3D des meubles les lit.
// legs : 'taper' fuselé (scandinave), 'straight' droit fin (moderne, néon), 'hairpin' épingle en métal (industriel), 'turned' tourné
// (bohème), 'compass' compas (rétro 70 : fuselé, posé en biais), 'block' bloc bas (japandi), 'claw' griffe (steampunk).
export type CelVariant = {
  legs: 'taper' | 'straight' | 'turned' | 'hairpin' | 'block' | 'claw' | 'compass';
  tufted: boolean;
  rivets: boolean;
  throw: 'none' | 'plain' | 'fringed';
  pattern: 'none' | 'diamonds' | 'stripes' | 'neon-edge';
};
// Clés de palette choisies par style pour les pièces dont la clé historique ne contraste pas dans toutes les palettes (reports des
// tâches 5, 6 et 9) : le plaid (ton `rug` à la tâche 5 : même ton qu'un tapis voisin), le pompon de l'arbre à chat (`leaf` faute de
// rouge), le coussin du panier (`fabricLight`, presque le brun de la vannerie `warm` en Steampunk et en Industriel).
export type CelPick = { throw: Fill; tassel: Fill; cushion: Fill };
// Allure cellulo d'une pièce : teintes de chaque couleur de la palette, sol, variantes, clés choisies.
export type CelLook = { style: StyleId; tones: Record<Fill, Tone>; floor: string; variant: CelVariant; pick: CelPick };

const VARIANTS: Record<StyleId, CelVariant> = {
  scandinave: { legs: 'taper', tufted: false, rivets: false, throw: 'plain', pattern: 'none' },
  moderne: { legs: 'straight', tufted: false, rivets: false, throw: 'none', pattern: 'none' },
  industriel: { legs: 'hairpin', tufted: false, rivets: false, throw: 'none', pattern: 'none' },
  boheme: { legs: 'turned', tufted: false, rivets: false, throw: 'fringed', pattern: 'diamonds' },
  retro70: { legs: 'compass', tufted: false, rivets: false, throw: 'none', pattern: 'stripes' },
  japandi: { legs: 'block', tufted: false, rivets: false, throw: 'none', pattern: 'none' },
  neon: { legs: 'straight', tufted: false, rivets: false, throw: 'none', pattern: 'neon-edge' },
  steampunk: { legs: 'claw', tufted: true, rivets: true, throw: 'none', pattern: 'none' },
};
// Clés choisies (contraste mesuré par le test de looks : distance RVB ≥ 55 avec la pièce voisine).
// Plaid : crème (`shade`) sur l'accoudoir sombre, jamais le ton du tapis. Pompon : la couleur vive de chaque palette. Coussin du panier :
// clair dans la vannerie brune (Industriel : gris clair `text` ; Japandi : lin `rug` ; Néon : cyan `text` ; Steampunk : fauve `desk`).
const PICKS: Record<StyleId, CelPick> = {
  scandinave: { throw: 'shade', tassel: 'warm', cushion: 'fabricLight' },
  moderne: { throw: 'shade', tassel: 'leaf', cushion: 'fabricLight' },
  industriel: { throw: 'shade', tassel: 'shade', cushion: 'text' },
  boheme: { throw: 'shade', tassel: 'warm', cushion: 'fabricDark' },
  retro70: { throw: 'shade', tassel: 'warm', cushion: 'fabricLight' },
  japandi: { throw: 'shade', tassel: 'door', cushion: 'rug' },
  neon: { throw: 'shade', tassel: 'shade', cushion: 'text' },
  steampunk: { throw: 'shade', tassel: 'edge', cushion: 'desk' },
};

const lum = ([r, g, b]: Rgb): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
// Teinte d'une couleur de palette. La recette de la maquette (ombre = mélange à 32 % vers COOL, violet de luminance 0,33) n'assombrit
// franchement que les couleurs nettement plus claires que COOL : sur une palette sombre (néon, industriel, steampunk), l'« ombre »
// d'un brun ou d'un bleu nuit serait PLUS CLAIRE que l'aplat et le modelé s'inverserait ; autour de 0,35 elle n'est plus sombre que
// de quelques pour cent (porte scandinave #6B5B45 : ombre invisible). Sous DARK_LIMIT de luminance, l'ombre est l'aplat assombri
// (luminance visée : 92 % de l'aplat à la limite, continue avec la recette, jusqu'à 72 % pour le noir) légèrement teinté de COOL (15 %) ;
// au-dessus, la recette de la maquette telle quelle (toutes les teintes du scandinave validé sauf sa porte).
const DARK_LIMIT = 0.44;
function styledTone(c: string): Tone {
  const t = tone(c), base = hexRgb(c), L = lum(base);
  if (L >= DARK_LIMIT) return t;
  // Luminance visée f·L (f de 0,72 à 0,92) : k tel que lum(0,85·k·base + 0,15·COOL) = f·L (lum est linéaire).
  const f = 0.72 + (0.2 * L) / DARK_LIMIT;
  const k = Math.max(0, (f * L - 0.15 * lum(COOL)) / (0.85 * L || 1));
  const dark: Rgb = [base[0] * k, base[1] * k, base[2] * k];
  return { ...t, shade: rgbHex(mixRgb(dark, COOL, 0.15)) };
}

// Une allure par style, calculée une fois (les teintes sont comparées par identité : abat-jour allumé, cel/models).
const looks = new Map<StyleId, CelLook>();
export function lookOf(style: StyleId): CelLook {
  const hit = looks.get(style);
  if (hit) return hit;
  const palette = paletteOf(style);
  const tones = Object.fromEntries(Object.entries(palette).map(([k, c]) => [k, styledTone(c)])) as Record<Fill, Tone>;
  const look: CelLook = { style, tones, floor: palette.floor, variant: VARIANTS[style], pick: PICKS[style] };
  looks.set(style, look);
  return look;
}
