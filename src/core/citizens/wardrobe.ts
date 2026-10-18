// Garde-robe des habitants 3D (squelette Mixamo, pose de liaison en T, devant = +z, gauche = +x) : à partir des pièces
// du générateur (`expand`), construit vêtements, coiffures, barbes, couvre-chefs et accessoires, tous en maillages
// skinnés liés au MÊME squelette que le corps (ils suivent donc toutes les animations), en matériau toon deux tons.
// Port typé du banc (.superpowers/sdd/2026-10-18-habitants-3d/bench/wardrobe.js) ; découpé par familles de pièces
// dans `wardrobe/`. Aucun DOM : tout se calcule à partir de la géométrie du corps.
import * as THREE from 'three';
import type { Piece } from './catalogue';
import type { BodyInfo } from './wardrobe/body';
import { garments, overCloth, skirt, skirtTop, TUCK_DEPTH } from './wardrobe/shell';
import { beard, bonnet, BONNET_BAND, cap, CAP_BAND, hair, skull } from './wardrobe/hair';
import { gilet, tablier } from './wardrobe/work';
import { accessory } from './wardrobe/accessories';

export { analyse, JOINTS, type BodyInfo, type JointName, type Part, type Skull, type VertexInfo } from './wardrobe/body';
export { toon, TOON_RAMP, type Band, type Motif } from './wardrobe/materials';
export { garments, shell, skirt } from './wardrobe/shell';
export { beard, bonnet, cap, hair, HAIR_STYLES, skull } from './wardrobe/hair';
export { gilet, GILET_BANDE, tablier } from './wardrobe/work';
export { accessory, ACCESSORIES, PARAPLUIE_DEFAUT, parapluieOuvert, type AccessoryName } from './wardrobe/accessories';

// Contexte d'une pièce : `tops` = hauts déjà construits, rentrés dans une jupe ; `tuck` = une jupe est portée (les hauts
// y sont rentrés) ; `under` = vêtements déjà construits (une jupe passe par-dessus une autre, sangles et sacs se posent
// dessus) ; `brim` = lisière d'un couvre-chef porté (les cheveux restent dessous).
// `trousers` : longueur (sur la jambe) d'un pantalon porté : la tige des bottes commence juste sous son ourlet (glissée
// dessous, elle ressortait en taches brunes à travers la jambe du pantalon à chaque pas).
type Ctx = { tops: THREE.Mesh[]; tuck: boolean; under: THREE.Mesh[]; brim?: (az: number) => number; trousers?: number };
const BOOT_UNDER = 0.04;

// Une pièce → ses maillages. `A` porte la teinte de peau (bras nus).
function piece(A: BodyInfo, p: Piece, c: Ctx): THREE.SkinnedMesh[] {
  switch (p.k) {
    case 'top': return [garments.top(A, c.tuck ? { ...p, tuckY: skirtTop(A) - TUCK_DEPTH * A.H } : p)];
    case 'bottom': return [garments.bottom(A, p)];
    case 'skirt': return [skirt(A, { ...p, over: c.under })];
    case 'socks': return [garments.socks(A, p)];
    case 'shoes': return [garments.shoes(A, p)];
    case 'boots': return [garments.boots(A, c.trousers === undefined ? p : { ...p, from: Math.max(p.from, c.trousers - BOOT_UNDER) })];
    case 'skin': return [garments.skin(A, p)];
    case 'collar': return [garments.collar(A, p)];
    case 'hair': return hair(A, p.style, p.color, c.brim);
    case 'beard': return beard(A, p.style, p.color);
    case 'cap': return cap(A, p.color, p.visor);
    case 'gilet': return overCloth(A, [gilet(A, p.color)], c.under, GILET_GAP * A.H);
    case 'tablier': return overCloth(A, tablier(A, p.color), c.under, GILET_GAP * A.H);
    case 'bonnet': return bonnet(A, p.color);
    case 'accessory': return markAccessory(accessory(A, p.what, p.color, c.under));
  }
}
// Écart entre une tenue de travail et le vêtement qu'elle recouvre (fraction de la hauteur du corps).
const GILET_GAP = 0.006;

// Sacs, sangles, écharpe… : marqués (`userData.accessory`) pour l'enveloppe du tronc (bras tenus hors du corps,
// retarget.ts), qui ne garde d'eux que ce qui pend au bassin : le bras passe à côté d'un sac à dos plus étroit que les
// épaules, mais devant le sac en bandoulière.
function markAccessory(ms: THREE.SkinnedMesh[]): THREE.SkinnedMesh[] {
  for (const m of ms) m.userData.accessory = true;
  return ms;
}

// Couche de chaque pièce, du corps vers l'extérieur. Les vêtements se recouvrent par géométrie (aisances croissantes),
// et le décalage de profondeur (polygonOffset) départage ce qui reste confondu : plus fort pour les couches extérieures.
// Un décalage commun à toutes les couches (l'ancien −2 partout) se multiplie par la pente du triangle : sur les bords de
// la silhouette il valait plusieurs centimètres et faisait ressortir la couche du dessous (haut à travers la jupe sur
// les flancs, débardeur blanc sous le gilet, semelle sur la chaussure, tiges de bottes sous le pantalon).
const LAYER: Record<Piece['k'], number> = {
  skin: 0, socks: 0, hair: 0, beard: 0, boots: 1, shoes: 1, cap: 1, bonnet: 1, bottom: 2, top: 3, collar: 4, skirt: 4,
  gilet: 6, tablier: 6, accessory: 7,
};
const layerOf = (p: Piece): number => (p.k === 'skirt' && p.off !== undefined ? 5 : LAYER[p.k]); // pan de manteau : sur la jupe
function setLayer(ms: THREE.Object3D[], layer: number): void {
  for (const o of ms) {
    o.traverse((n) => {
      if (!(n instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
        m.polygonOffset = true;
        m.polygonOffsetFactor = -1 - 0.35 * layer;
        m.polygonOffsetUnits = -1 - layer;
      }
    });
  }
}

// Vêtements du corps, construits avant les accessoires (sangles et sacs se posent sur le tissu mesuré au repos), dans
// cet ordre : hauts, bas, jupes (le pan d'un manteau après la jupe qu'il recouvre), cols, puis tenues de travail
// par-dessus tout le reste.
const CLOTH_ORDER: ((p: Piece) => boolean)[] = [
  (p) => p.k === 'top',
  (p) => p.k === 'bottom',
  (p) => p.k === 'skirt' && p.off === undefined,
  (p) => p.k === 'skirt',
  (p) => p.k === 'collar',
  (p) => p.k === 'gilet' || p.k === 'tablier',
];

// Pièces mesurées sur le crâne.
const HEAD_PIECES = new Set<Piece['k']>(['hair', 'beard', 'cap', 'bonnet']);

// Habille un corps analysé : toutes les pièces, liées au squelette de `body` — le corps analysé lui-même, ou un clone
// (SkeletonUtils.clone) de la même base, qui partage sa géométrie au repos mais a son propre squelette.
// `skin` = teinte des bras nus. Le crâne est mesuré une fois et gardé sur `info` (objet de la base, partagé par tous
// les habitants de cette base).
export function dressRig(info: BodyInfo, pieces: Piece[], skin: string, body: THREE.SkinnedMesh = info.body): THREE.Object3D[] {
  if (pieces.some((p) => HEAD_PIECES.has(p.k))) info.skull ??= skull(info);
  const A: BodyInfo = { ...info, body, skin };
  // Tout ou rien : si une pièce échoue, celles déjà construites sont libérées avant de propager l'erreur.
  // Vêtements d'abord (voir CLOTH_ORDER), chacun posé sur ceux déjà construits ; l'ordre de sortie reste celui des pièces.
  const out: THREE.Object3D[] = [];
  const built = new Map<Piece, THREE.SkinnedMesh[]>();
  try {
    const tuck = pieces.some((p) => p.k === 'skirt');
    const hat = pieces.find((p) => p.k === 'cap' || p.k === 'bonnet');
    const legs = pieces.find((p) => p.k === 'bottom');
    const c: Ctx = { tops: [], tuck, under: [], ...(hat ? { brim: hat.k === 'cap' ? CAP_BAND : BONNET_BAND } : {}), ...(legs?.k === 'bottom' ? { trousers: legs.cut } : {}) };
    for (const first of CLOTH_ORDER)
      for (const p of pieces) {
        if (built.has(p) || !first(p)) continue;
        const ms = piece(A, p, c);
        built.set(p, ms);
        c.under = [...c.under, ...ms];
        if (p.k === 'top') c.tops = [...c.tops, ...ms];
      }
    for (const p of pieces) {
      const ms = built.get(p) ?? piece(A, p, c);
      setLayer(ms, layerOf(p));
      out.push(...ms);
    }
  } catch (e) {
    disposeRig([...new Set([...out, ...[...built.values()].flat()])]);
    throw e;
  }
  return out;
}

// Libère géométries et matériaux d'un habillage (la rampe toon, partagée par tous les matériaux, est gardée).
export function disposeRig(objs: THREE.Object3D[]): void {
  for (const o of objs) {
    o.traverse((n) => {
      if (!(n instanceof THREE.Mesh)) return;
      n.geometry.dispose();
      for (const m of Array.isArray(n.material) ? n.material : [n.material]) m.dispose();
    });
  }
}
