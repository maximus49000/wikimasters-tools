import type { ItemPlacement, ItemShape } from '../../item-models';
import type { StandingKind } from '../../library-types';
import type { LifeState } from '../life-state';
import type { CelLook } from '../looks';
import type { CelPart } from '../mesh';

// Registres des dessins 3D cellulo (remplis par les fichiers de familles : seating, wood, …). Séparés de `index.ts` pour que
// chaque famille puisse s'y inscrire sans import circulaire (index importe les familles ; les familles n'importent que ce fichier).

// Pièces d'un meuble dans le repère centré (origine au centre de la base, x à droite, y en haut, z vers le spectateur, cm).
// L'abat-jour d'une lampe porte la teinte `look.tones.shade` (même objet) : c'est elle qui s'allume.
export type CelBuilder = (look: CelLook, life: LifeState) => CelPart[];
export const CEL_MODELS: Partial<Record<StandingKind, CelBuilder>> = {};
// Garnitures cellulo d'une pièce Steampunk (équivalent dessiné de STEAMPUNK_TRIM, furniture-models : cuir, clous, laiton, bagues),
// posées sur le dessin 3D du meuble (toutes marquées `trim`). Un meuble garni sans dessin de garniture passe par la conversion
// de STEAMPUNK_TRIM (pièces à boîtes).
export type CelTrimBuilder = (look: CelLook) => CelPart[];
export const CEL_TRIMS: Partial<Record<StandingKind, CelTrimBuilder>> = {};

// Pièces d'un objet porté dans un repère centré sur son point de pose (coin bas avant gauche de sa boîte, `pl.x/y/z` ignorés),
// x à droite, y en haut, z vers le spectateur (cm) : l'hôte de sprites le translate à sa place chez son porteur.
export type CelItemBuilder = (look: CelLook, pl: ItemPlacement) => CelPart[];
export const CEL_ITEMS: Partial<Record<ItemShape, CelItemBuilder>> = {};
