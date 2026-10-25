import { FURNITURE_MODELS, STEAMPUNK_TRIM } from '../../furniture-models';
import { overhangOf, type Model } from '../../furniture-render3d';
import { itemPieces, type ItemPlacement } from '../../item-models';
import type { StandingKind } from '../../library-types';
import { celFromPieces } from '../convert';
import type { LifeState } from '../life-state';
import type { CelLook } from '../looks';
import type { CelPart } from '../mesh';
import { WARM_LIT } from '../tone';
import { CEL_ITEMS, CEL_MODELS } from './registry';

// Dessin 3D cellulo des meubles et des objets portés, par familles (remplis par les tâches suivantes). Un meuble sans dessin propre
// passe par la conversion de son modèle à boîtes (celFromModel) : il s'affiche tout de même, au même encombrement.

// Familles de dessins (chacune s'inscrit dans les registres à l'import).
import './seating';
import './wood';
import './storage';
import './plants';
import { PAPER } from './lights-pets'; // (s'inscrit aussi dans les registres)

export { CEL_ITEMS, CEL_MODELS, type CelBuilder, type CelItemBuilder } from './registry';

// Pièce du surplomb d'un meuble à socle (même règle que overhangOf, sur l'encombrement du maillage) : hors du socle à 0,5 cm près.
function overhanging(P: CelPart, model: Model): boolean {
  const b = model.base!;
  let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [x, , zc] of P.m.v) {
    // Repère centré → repère du modèle (z depuis l'avant).
    const [mx, mz] = [x + model.w / 2, model.d / 2 - zc];
    [x0, x1, z0, z1] = [Math.min(x0, mx), Math.max(x1, mx), Math.min(z0, mz), Math.max(z1, mz)];
  }
  return x1 <= b.x + 0.5 || x0 >= b.x + b.w - 0.5 || z1 <= b.z + 0.5 || z0 >= b.z + b.d - 0.5;
}

// Pièces cellulo d'un meuble : son dessin propre (CEL_MODELS) sinon la conversion de son modèle, plus la garniture Steampunk ;
// `lit` : abat-jour allumé (lumineux) ; `part` : le socle seul ('base') ou le surplomb seul ('overhang') d'un meuble à socle.
export function celPartsOf(kind: StandingKind, look: CelLook, life: LifeState, opts: { lit?: boolean; part?: 'base' | 'overhang' } = {}): CelPart[] {
  const model = FURNITURE_MODELS[kind];
  const trim = look.style === 'steampunk' ? (STEAMPUNK_TRIM[kind] ?? []) : [];
  const lit = opts.lit === true && model.glow !== undefined;
  const builder = CEL_MODELS[kind];
  if (!builder) {
    // Même découpe que le dessin à boîtes (model3d-art) : index des pièces du surplomb.
    const pieces = [...model.pieces, ...trim];
    const over = opts.part ? overhangOf({ ...model, pieces }) : null;
    const kept = over ? pieces.filter((_, i) => over.pieces.has(i) === (opts.part === 'overhang')) : pieces;
    return celFromPieces(kept, model, look, lit ? { glow: (p) => p.fill === 'shade' && !p.tag } : {});
  }
  let parts = [...builder(look, life), ...celFromPieces(trim, model, look)];
  if (opts.part && model.base) parts = parts.filter((P) => overhanging(P, model) === (opts.part === 'overhang'));
  // S'allume : toute pièce au ton `shade` (abat-jour, ampoule) et le papier de la lanterne (seul ton hors palette, cf. lights-pets).
  if (lit) parts = parts.map((P) => (P.col === look.tones.shade || P.col === PAPER ? { ...P, col: WARM_LIT, glow: true } : P));
  return parts;
}

// Pièces cellulo d'un objet porté (repère centré sur son point de pose, cf. CelItemBuilder) ; `lit` : son abat-jour allumé
// (petite lampe), allumé par défaut comme dans le dessin à boîtes.
export function celItemPartsOf(pl: ItemPlacement, look: CelLook, steampunk: boolean, opts: { lit?: boolean } = {}): CelPart[] {
  const builder = CEL_ITEMS[pl.shape];
  if (builder) return builder(look, pl);
  const pieces = itemPieces({ ...pl, x: 0, y: 0, z: 0 }, steampunk);
  const lit = opts.lit ?? true;
  return celFromPieces(pieces, { w: 0, d: 0 }, look, lit ? { glow: (p) => p.tag?.startsWith('glow:') === true } : {});
}
