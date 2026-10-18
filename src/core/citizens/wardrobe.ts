// Garde-robe des habitants 3D (squelette Mixamo, pose de liaison en T, devant = +z, gauche = +x) : à partir des pièces
// du générateur (`expand`), construit vêtements, coiffures, barbes, couvre-chefs et accessoires, tous en maillages
// skinnés liés au MÊME squelette que le corps (ils suivent donc toutes les animations), en matériau toon deux tons.
// Port typé du banc (.superpowers/sdd/2026-10-18-habitants-3d/bench/wardrobe.js) ; découpé par familles de pièces
// dans `wardrobe/`. Aucun DOM : tout se calcule à partir de la géométrie du corps.
import * as THREE from 'three';
import type { Piece } from './catalogue';
import type { BodyInfo } from './wardrobe/body';
import { garments, skirt } from './wardrobe/shell';
import { beard, bonnet, cap, hair, skull } from './wardrobe/hair';
import { gilet, tablier } from './wardrobe/work';
import { accessory } from './wardrobe/accessories';

export { analyse, JOINTS, type BodyInfo, type JointName, type Part, type Skull, type VertexInfo } from './wardrobe/body';
export { toon, TOON_RAMP, type Band, type Motif } from './wardrobe/materials';
export { garments, shell, skirt } from './wardrobe/shell';
export { beard, bonnet, cap, hair, HAIR_STYLES, skull } from './wardrobe/hair';
export { gilet, GILET_BANDE, tablier } from './wardrobe/work';
export { accessory, ACCESSORIES, PARAPLUIE_DEFAUT, parapluieOuvert, type AccessoryName } from './wardrobe/accessories';

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
    case 'gilet': return [gilet(A, p.color)];
    case 'tablier': return tablier(A, p.color);
    case 'bonnet': return bonnet(A, p.color);
    case 'accessory': return accessory(A, p.what, p.color);
  }
}

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
  const out: THREE.Object3D[] = [];
  try {
    for (const p of pieces) out.push(...piece(A, p));
  } catch (e) {
    disposeRig(out);
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
