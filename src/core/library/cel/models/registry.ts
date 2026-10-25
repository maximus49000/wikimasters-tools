import type { Piece } from '../../furniture-render3d';
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
// Garniture Steampunk du modèle à boîtes (STEAMPUNK_TRIM) gardée pour un meuble redessiné : par défaut tout ; une famille peut écarter
// une pièce qui ne correspond plus à son volume (cerclage du dôme du lampadaire arc, resté à l'ancienne place du dôme) et la redessiner.
export const CEL_TRIM_KEEP: Partial<Record<StandingKind, (p: Piece) => boolean>> = {};

// Pièces d'un objet porté dans un repère centré sur son point de pose (coin bas avant gauche de sa boîte, `pl.x/y/z` ignorés),
// x à droite, y en haut, z vers le spectateur (cm) : l'hôte de sprites le translate à sa place chez son porteur.
export type CelItemBuilder = (look: CelLook, pl: ItemPlacement) => CelPart[];
export const CEL_ITEMS: Partial<Record<ItemShape, CelItemBuilder>> = {};
