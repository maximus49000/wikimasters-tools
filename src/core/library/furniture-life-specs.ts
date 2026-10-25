import type { Vec3 } from './cel/mesh';
import { EGG_HOOK, RUN_R, SAG_BOARD, TASSEL_PIVOT } from './cel/models/wood';
import type { StandingKind } from './library-types';

// Données générales de mouvement du mobilier vivant (spec §6) : comment un meuble bouge quand on s'en sert, dans le repère centré
// de son dessin (cm). Créé à la tâche 6 (bois, bascule, suspension, arbre à chat) ; complété à la tâche 15 (lois et autres meubles).
// `rock` : roulement sur les patins autour du centre de courbure ; `dent` : zones de creux ; `swing` : point d'accroche d'une
// oscillation ; `sag` : plateau qui ploie (index du plateau, flèche max en cm) ; `tassel` : accroche du pompon ; `rustle` :
// feuillage qui frémit ; `skirt` : jupe qui bouge ; `tremble` : tissu qui tremble sous les griffes.
export type LifeSpec = {
  rock?: { pivot: Vec3; radius: number };
  dent?: { at: Vec3; r: number; depth: number }[];
  swing?: { pivot: Vec3 };
  sag?: { board: number; max: number };
  tassel?: { pivot: Vec3 };
  rustle?: true;
  skirt?: true;
  tremble?: true;
};

export const LIFE_SPECS: Partial<Record<StandingKind, LifeSpec>> = {
  'rocking-chair': { rock: { pivot: [0, RUN_R, 0], radius: RUN_R } },
  'egg-chair': { swing: { pivot: EGG_HOOK } },
  'cat-tree': { sag: { board: SAG_BOARD, max: 1.2 }, tassel: { pivot: TASSEL_PIVOT } },
  // Plantes (tâche 8) : le feuillage frémit (`rustle`, flexion de 6° au plus par feuille, cf. cel/models/plants.ts).
  plant: { rustle: true }, monstera: { rustle: true }, strelitzia: { rustle: true }, palm: { rustle: true }, cactus: { rustle: true }, pampas: { rustle: true },
};
