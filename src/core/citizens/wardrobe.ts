// Garde-robe des habitants 3D (squelette Mixamo, pose de liaison en T, devant = +z, gauche = +x) : à partir des pièces
// du générateur (`expand`), construit vêtements, coiffures, barbes, couvre-chefs et accessoires, tous en maillages
// skinnés liés au MÊME squelette que le corps (ils suivent donc toutes les animations), en matériau toon deux tons.
// Port typé du banc (.superpowers/sdd/2026-10-18-habitants-3d/bench/wardrobe.js) ; découpé par familles de pièces
// dans `wardrobe/`. Aucun DOM : tout se calcule à partir de la géométrie du corps.
import type * as THREE from 'three';
import type { Piece } from './catalogue';
import type { BodyInfo } from './wardrobe/body';
import { garments, skirt } from './wardrobe/shell';
import { beard, bonnet, cap, hair } from './wardrobe/hair';
import { gilet, tablier } from './wardrobe/work';
import { accessory } from './wardrobe/accessories';

export { analyse, JOINTS, type BodyInfo, type JointName, type Part, type Skull, type VertexInfo } from './wardrobe/body';
export { toon, type Band, type Motif } from './wardrobe/materials';
export { garments, shell, skirt } from './wardrobe/shell';
export { beard, bonnet, cap, hair, HAIR_STYLES, skull } from './wardrobe/hair';
export { gilet, GILET_BANDE, GILET_ORANGE, tablier, TABLIER_CREME } from './wardrobe/work';
export { accessory, ACCESSORIES, type AccessoryName } from './wardrobe/accessories';

const flat = (m: THREE.SkinnedMesh | THREE.SkinnedMesh[]): THREE.SkinnedMesh[] => (Array.isArray(m) ? m : [m]);

// Une pièce → ses maillages. `A` porte la teinte de peau (bras nus).
function piece(A: BodyInfo, p: Piece): THREE.SkinnedMesh[] {
  switch (p.k) {
    case 'top': return [garments.top(A, p)];
    case 'bottom': return [garments.bottom(A, p)];
    case 'skirt': return [skirt(A, p)];
    case 'socks': return [garments.socks(A, p)];
    case 'shoes': return flat(garments.shoes(A, p));
    case 'boots': return flat(garments.boots(A, p));
    case 'skin': return [garments.skin(A, p)];
    case 'collar': return [garments.collar(A, p)];
    case 'hair': return hair(A, p.style, p.color);
    case 'beard': return beard(A, p.style, p.color);
    case 'cap': return cap(A, p.color, p.visor);
    case 'gilet': return [gilet(A)];
    case 'tablier': return tablier(A);
    case 'bonnet': return bonnet(A, p.color);
    case 'accessory': return accessory(A, p.what, p.color);
  }
}

// Habille un corps analysé : toutes les pièces, liées au squelette du corps. `skin` = teinte des bras nus.
// Le crâne mesuré est gardé dans `info` (une seule mesure par base, quel que soit le nombre d'habitants habillés).
export function dressRig(info: BodyInfo, pieces: Piece[], skin: string): THREE.Object3D[] {
  const A: BodyInfo = { ...info, skin };
  const out: THREE.Object3D[] = [];
  for (const p of pieces) {
    out.push(...piece(A, p));
    if (A.skull && !info.skull) info.skull = A.skull;
  }
  return out;
}
