// Garde-robe 3D sur le corps synthétique : toutes les pièces liées au squelette du corps, coupes et poids corrects,
// pièces à la bonne hauteur (cheveux sur la tête, chaussures sous les genoux, gilet sur le torse…).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Piece } from '../../../src/core/citizens/catalogue';
import { analyse, disposeRig, dressRig, garments, hair, parapluieOuvert, PARAPLUIE_DEFAUT, skirt, type BodyInfo } from '../../../src/core/citizens/wardrobe';
import { vi } from 'vitest';
import { makeHumanoid } from './fixtures/humanoid';

const HAIRS = ['court', 'raie', 'degarni', 'couronne', 'carre', 'long', 'chignon', 'boucles', 'queue', 'couettes', 'rase', 'frise', 'afro', 'tresses', 'enfant'];
const BEARDS = ['pleine', 'courte', 'moustache', 'bouc'];
const ACCESSOIRES = ['sac-a-dos', 'sac', 'mallette', 'ballon', 'echarpe', 'parapluie'];

const body = makeHumanoid();
const A: BodyInfo = analyse(body);

const triangles = (m: THREE.Object3D): number => {
  const g = (m as THREE.Mesh).geometry;
  return (g.index ? g.index.count : g.attributes.position!.count) / 3;
};
const box = (ms: THREE.Object3D[]): THREE.Box3 => {
  const b = new THREE.Box3();
  for (const m of ms) {
    const g = (m as THREE.Mesh).geometry, P = g.attributes.position!, idx = g.index;
    // Seulement les sommets réellement utilisés par des triangles (les coiffures gardent des sommets orphelins).
    const used = idx ? new Set(Array.from(idx.array)) : null;
    for (let i = 0; i < P.count; i++) if (!used || used.has(i)) b.expandByPoint(new THREE.Vector3().fromBufferAttribute(P, i));
  }
  return b;
};
const dress = (p: Piece): THREE.Object3D[] => dressRig(A, [p], '#C8906A');
// Toutes les pièces sont des SkinnedMesh non vides, liées au squelette du corps, en matériau toon.
const checkBound = (ms: THREE.Object3D[]): void => {
  expect(ms.length).toBeGreaterThan(0);
  for (const m of ms) {
    expect(m).toBeInstanceOf(THREE.SkinnedMesh);
    const s = m as THREE.SkinnedMesh;
    expect(s.skeleton).toBe(body.skeleton);
    expect(s.material).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(triangles(s)).toBeGreaterThan(0);
  }
};
// Liée à 100 % à un seul os.
const rigidOn = (m: THREE.Object3D, bone: number): void => {
  const g = (m as THREE.Mesh).geometry, SI = g.attributes.skinIndex!, SW = g.attributes.skinWeight!;
  for (let i = 0; i < SI.count; i++) {
    expect(SI.getX(i)).toBe(bone);
    expect(SW.getX(i)).toBe(1);
    expect(SW.getY(i) + SW.getZ(i) + SW.getW(i)).toBe(0);
  }
};

describe('analyse', () => {
  it('repères, hauteur et un relevé par sommet', () => {
    expect(A.H).toBeGreaterThan(1.65);
    expect(A.H).toBeLessThan(1.75);
    expect(A.info.length).toBe(body.geometry.attributes.position!.count);
    expect(A.info.length).toBeGreaterThan(1500);
    expect(A.info.length).toBeLessThan(3200);
    expect(A.J.Hips.y).toBeCloseTo(0.95, 3);
    expect(A.waistY).toBeGreaterThan(A.J.Hips.y);
    expect(A.waistY).toBeLessThan(A.J.Spine2.y);
    expect(A.idx.Head).toBe(body.skeleton.bones.findIndex((b) => b.name.endsWith('Head')));
    expect(A.info.some((v) => v.part === 'head')).toBe(true);
    expect(A.info.some((v) => v.part === 'hand')).toBe(true);
  });
  it('noms d’os avec ou sans préfixe mixamorig', () => {
    for (const prefix of ['', 'mixamorig', 'mixamorig:']) {
      const B = analyse(makeHumanoid({ prefix }));
      expect(B.idx.Hips).toBe(0);
      expect(B.J.Head.y).toBeCloseTo(1.53, 3);
    }
  });
});

describe('pièces du banc', () => {
  it('chaque pièce : géométrie non vide liée au même squelette', () => {
    const pieces: Piece[] = [
      { k: 'top', sleeve: 0.45, color: '#B5523B', pattern: { kind: 'rayures', color: '#FFFFFF', freq: 60 } },
      { k: 'bottom', cut: 0.97, color: '#2A3A5E' },
      { k: 'skirt', len: 0.6, flare: 0.35, color: '#8FA77F', pattern: { kind: 'carreaux', color: '#FFFFFF', freq: 25 } },
      { k: 'socks', from: 0.8, color: '#FFFFFF' },
      { k: 'shoes', color: '#3A2A20', sole: '#EEEEEE' },
      { k: 'boots', from: 0.72, color: '#3A2A20', sole: '#222222' },
      { k: 'skin', from: 0.28, to: 0.55 },
      { k: 'collar', color: '#FFFFFF' },
      { k: 'cap', color: '#C03030', visor: '#FFFFFF' },
    ];
    for (const p of pieces) checkBound(dress(p));
    for (const s of HAIRS) checkBound(dress({ k: 'hair', style: s, color: '#3A2A20' }));
    for (const s of BEARDS) checkBound(dress({ k: 'beard', style: s, color: '#3A2A20' }));
  });
  it('chaussures avec semelle : deux maillages', () => {
    expect(dress({ k: 'shoes', color: '#000000', sole: '#FFFFFF' })).toHaveLength(2);
    expect(dress({ k: 'shoes', color: '#000000' })).toHaveLength(1);
  });
  it('coque top coupée : aucun sommet sous hemY', () => {
    const hem = 0.065, hemY = A.waistY - hem * A.H;
    const m = garments.top(A, { sleeve: 0.45, color: '#B5523B', hem });
    const g = m.geometry, B = g.attributes.bindPos!, P = g.attributes.position!;
    for (let i = 0; i < B.count; i++) {
      expect(B.getY(i)).toBeGreaterThanOrEqual(hemY - 1e-5);
      // Position gonflée le long des normales : à peine sous la coupe.
      expect(P.getY(i)).toBeGreaterThanOrEqual(hemY - 0.01);
    }
  });
  it('skirt : poids bassin = 1 en haut, somme des poids = 1 partout', () => {
    const m = skirt(A, { len: 0.6, flare: 0.35, color: '#8FA77F' });
    const g = m.geometry, SI = g.attributes.skinIndex!, SW = g.attributes.skinWeight!, P = g.attributes.position!;
    let top = -Infinity;
    for (let i = 0; i < P.count; i++) top = Math.max(top, P.getY(i));
    let seen = 0;
    for (let i = 0; i < SW.count; i++) {
      expect(SW.getX(i) + SW.getY(i) + SW.getZ(i) + SW.getW(i)).toBeCloseTo(1, 5);
      if (Math.abs(P.getY(i) - top) < 1e-6) {
        seen++;
        expect(SI.getX(i)).toBe(A.idx.Hips);
        expect(SW.getX(i)).toBeCloseTo(1, 6);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
  it("hair('afro') liée à 100 % à l'os de tête", () => {
    const ms = hair(A, 'afro', '#111111');
    expect(ms.length).toBe(1);
    rigidOn(ms[0]!, A.idx.Head);
  });
  it('cheveux au-dessus du cou, chaussures sous les genoux', () => {
    for (const s of ['court', 'raie', 'rase', 'afro', 'frise']) expect(box(dress({ k: 'hair', style: s, color: '#000000' })).min.y).toBeGreaterThan(A.J.Neck.y);
    expect(box(dress({ k: 'shoes', color: '#000000', sole: '#FFFFFF' })).max.y).toBeLessThan(A.J.LeftLeg.y);
    expect(box(dress({ k: 'shoes', color: '#000000' })).min.y).toBeGreaterThanOrEqual(0);
  });
});

describe('nouvelles pièces', () => {
  it('gilet : sur le torse, sans manches, bande réfléchissante', () => {
    const ms = dress({ k: 'gilet', color: '#F28C28' });
    checkBound(ms);
    const b = box(ms);
    expect(b.min.y).toBeGreaterThan(A.J.Hips.y - 0.08 * A.H);
    expect(b.max.y).toBeLessThan(A.J.Head.y);
    // Pas de manches : rien au-delà de l'attache des bras.
    expect(b.max.x).toBeLessThan(A.J.LeftArm.x + 0.06 * A.H);
    expect(b.min.x).toBeGreaterThan(A.J.RightArm.x - 0.06 * A.H);
    const m = ms[0] as THREE.SkinnedMesh;
    expect(m.geometry.attributes.bindPos).toBeDefined();
    expect((m.material as THREE.MeshToonMaterial).color.getHexString()).toBe('f28c28');
    expect((m.material as THREE.Material).onBeforeCompile.toString()).toContain('bindPos');
  });
  it('gilet par-dessus le haut', () => {
    const top = garments.top(A, { sleeve: 0.45, color: '#FFFFFF' });
    const gilet = dress({ k: 'gilet', color: '#F28C28' })[0] as THREE.SkinnedMesh;
    // Même sommet du corps → le gilet ressort davantage : son volume englobe celui du haut au niveau de la poitrine.
    const width = (m: THREE.Mesh): number => {
      const P = m.geometry.attributes.position!;
      let w = 0;
      for (let i = 0; i < P.count; i++) if (Math.abs(P.getY(i) - A.J.Spine.y) < 0.02) w = Math.max(w, P.getZ(i));
      return w;
    };
    expect(width(gilet)).toBeGreaterThan(width(top));
  });
  it('tablier : devant seulement, de la poitrine aux genoux', () => {
    const ms = dress({ k: 'tablier', color: '#F4F1EA' });
    checkBound(ms);
    // Bavette et pan (le cordon de taille, lui, fait le tour).
    const b = box(ms.slice(0, 2));
    expect(b.min.z).toBeGreaterThan(A.J.Hips.z - 0.01);
    expect(b.max.y).toBeLessThan(A.J.Neck.y);
    expect(b.min.y).toBeLessThan(A.J.LeftLeg.y + 0.08 * A.H);
    expect(b.min.y).toBeGreaterThan(A.J.LeftLeg.y - 0.08 * A.H);
    expect(((ms[0] as THREE.SkinnedMesh).material as THREE.MeshToonMaterial).color.getHexString()).toBe('f4f1ea');
  });
  it('bonnet : sur le crâne, lié à la tête, couleur de la pièce', () => {
    const ms = dress({ k: 'bonnet', color: '#C03030' });
    checkBound(ms);
    for (const m of ms) rigidOn(m, A.idx.Head);
    const b = box(ms);
    expect(b.min.y).toBeGreaterThan(A.J.Neck.y);
    expect(b.max.y).toBeGreaterThan(A.H - 0.01);
    expect(((ms[0] as THREE.SkinnedMesh).material as THREE.MeshToonMaterial).color.getHexString()).toBe('c03030');
  });
});

describe('accessoires', () => {
  // Os attendu pour chaque maillage de chaque accessoire, dans l'ordre de construction.
  const BONES: Record<string, string[]> = {
    'sac-a-dos': ['Spine2', 'Spine2', 'Spine2', 'Spine2'],
    sac: ['Hips', 'Hips', 'Spine2'],
    mallette: ['RightHand', 'RightHand'],
    ballon: ['RightHand'],
    echarpe: ['Neck', 'Spine2'],
    parapluie: ['RightHand', 'RightHand', 'RightHand'],
  };
  it('chacun non vide, lié au même squelette, rigide sur son os', () => {
    for (const what of ACCESSOIRES) {
      const ms = dress({ k: 'accessory', what, color: '#2A3A5E' });
      checkBound(ms);
      const expected = BONES[what]!;
      expect(ms).toHaveLength(expected.length);
      ms.forEach((m, i) => rigidOn(m, A.idx[expected[i]!]!));
    }
  });
  it('sac : sac au bassin, bandoulière au torse ; écharpe : cou + pan au torse', () => {
    const sac = dress({ k: 'accessory', what: 'sac', color: '#6B4A2E' });
    const bones = sac.map((m) => (m as THREE.Mesh).geometry.attributes.skinIndex!.getX(0));
    expect(bones).toContain(A.idx.Hips);
    expect(bones).toContain(A.idx.Spine2);
    const ech = dress({ k: 'accessory', what: 'echarpe', color: '#C03030' });
    const eb = ech.map((m) => (m as THREE.Mesh).geometry.attributes.skinIndex!.getX(0));
    expect(eb).toContain(A.idx.Neck);
    expect(eb).toContain(A.idx.Spine2);
  });
  it('placement : sac à dos dans le dos, mallette et parapluie à la main droite, sac à droite', () => {
    // Le sac lui-même (les bretelles passent devant).
    expect(box(dress({ k: 'accessory', what: 'sac-a-dos', color: '#000000' }).slice(0, 2)).max.z).toBeLessThan(A.J.Spine2.z);
    for (const what of ['mallette', 'parapluie', 'ballon']) {
      const b = box(dress({ k: 'accessory', what, color: '#000000' }));
      expect(b.max.x).toBeLessThan(A.J.RightHand.x + 0.05 * A.H);
      expect(b.min.x).toBeLessThan(A.J.RightHand.x);
    }
    const bag = dress({ k: 'accessory', what: 'sac', color: '#000000' })[0]!;
    expect(box([bag]).max.x).toBeLessThan(0);
    const ech = box(dress({ k: 'accessory', what: 'echarpe', color: '#000000' }));
    expect(ech.max.y).toBeLessThan(A.J.Head.y + 0.02 * A.H);
    expect(ech.min.y).toBeGreaterThan(A.waistY);
  });
  it('accessoire inconnu : rien', () => {
    expect(dress({ k: 'accessory', what: 'trottinette', color: '#000000' })).toEqual([]);
  });
});

describe('toutes les pièces', () => {
  const ALL: Piece[] = [
    { k: 'top', sleeve: 0.45, color: '#B5523B' }, { k: 'bottom', cut: 0.97, color: '#2A3A5E' },
    { k: 'skirt', len: 0.6, flare: 0.35, color: '#8FA77F' }, { k: 'socks', from: 0.8, color: '#FFFFFF' },
    { k: 'shoes', color: '#3A2A20', sole: '#EEEEEE' }, { k: 'boots', from: 0.72, color: '#3A2A20', sole: '#222222' },
    { k: 'skin', from: 0.28, to: 0.55 }, { k: 'collar', color: '#FFFFFF' }, { k: 'cap', color: '#C03030', visor: '#FFFFFF' },
    { k: 'gilet', color: '#F28C28' }, { k: 'tablier', color: '#F4F1EA' }, { k: 'bonnet', color: '#C03030' },
    ...HAIRS.map((style): Piece => ({ k: 'hair', style, color: '#3A2A20' })),
    ...BEARDS.map((style): Piece => ({ k: 'beard', style, color: '#3A2A20' })),
    ...ACCESSOIRES.map((what): Piece => ({ k: 'accessory', what, color: '#2A3A5E' })),
  ];
  it('poids de peau : somme = 1 et os existants, pour chaque sommet', () => {
    const nb = body.skeleton.bones.length;
    for (const p of ALL) {
      for (const m of dress(p)) {
        const g = (m as THREE.Mesh).geometry, SI = g.attributes.skinIndex!, SW = g.attributes.skinWeight!;
        expect(SI.count).toBe(g.attributes.position!.count);
        for (let i = 0; i < SW.count; i++) {
          expect(Math.abs(SW.getX(i) + SW.getY(i) + SW.getZ(i) + SW.getW(i) - 1)).toBeLessThan(1e-4);
          for (const b of [SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)]) expect(b).toBeLessThan(nb);
        }
      }
    }
  });
  it('couleur de la pièce pour le gilet et le tablier', () => {
    const c = (ms: THREE.Object3D[]) => ((ms[0] as THREE.SkinnedMesh).material as THREE.MeshToonMaterial).color.getHexString();
    expect(c(dress({ k: 'gilet', color: '#123456' }))).toBe('123456');
    expect(c(dress({ k: 'tablier', color: '#654321' }))).toBe('654321');
  });
});

describe('habillage', () => {
  it('lié au squelette du clone, crâne mesuré une seule fois', () => {
    const base = makeHumanoid(), info = analyse(base);
    let clone: THREE.SkinnedMesh | undefined;
    cloneSkinned(base).traverse((o) => { if (o instanceof THREE.SkinnedMesh) clone = o; });
    expect(clone).toBeDefined();
    expect(clone!.skeleton).not.toBe(base.skeleton);
    expect(info.skull).toBeUndefined();
    const pieces: Piece[] = [{ k: 'hair', style: 'court', color: '#000000' }, { k: 'top', sleeve: 0.45, color: '#FFFFFF' }];
    const ms = dressRig(info, pieces, '#C8906A', clone!);
    for (const m of ms) expect((m as THREE.SkinnedMesh).skeleton).toBe(clone!.skeleton);
    const S = info.skull;
    expect(S).toBeDefined();
    dressRig(info, pieces, '#C8906A');
    expect(info.skull).toBe(S);
  });
  it('coiffures compactées : seulement les sommets utilisés', () => {
    for (const style of ['afro', 'court']) {
      const [m] = hair(A, style, '#000000');
      const g = m!.geometry, n = g.attributes.position!.count;
      expect(n).toBeLessThan(7000); // sphère de départ : 12 513 sommets
      expect(Math.max(...Array.from(g.index!.array))).toBeLessThan(n);
      expect(new Set(Array.from(g.index!.array)).size).toBe(n);
    }
  });
  it('disposeRig libère géométries et matériaux, pas la rampe toon', () => {
    const ms = dress({ k: 'top', sleeve: 0.45, color: '#FFFFFF' });
    const m = ms[0] as THREE.SkinnedMesh, mat = m.material as THREE.MeshToonMaterial;
    const seen: string[] = [];
    m.geometry.addEventListener('dispose', () => seen.push('geo'));
    mat.addEventListener('dispose', () => seen.push('mat'));
    mat.gradientMap!.addEventListener('dispose', () => seen.push('grad'));
    disposeRig(ms);
    expect(seen.sort()).toEqual(['geo', 'mat']);
  });

  it('dressRig tout ou rien : une pièce en échec libère celles déjà construites', () => {
    const spy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    try {
      const bad = { k: 'inconnue' } as unknown as Piece;
      expect(() => dressRig(A, [{ k: 'top', sleeve: 0.45, color: '#FFFFFF' }, bad], '#C8906A')).toThrow();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('parapluie ouvert', () => {
  it('manche vertical depuis le poing, toile en dôme au-dessus de la tête du pantin 2D', () => {
    const g = parapluieOuvert(A, '#123456');
    expect(g.children).toHaveLength(3);
    const b = new THREE.Box3().setFromObject(g);
    const k = A.H / 37.5;
    // Toile de rayon 9,5 unités du pantin, sommet à 11 + 3,6 au-dessus du poing.
    expect(b.max.x).toBeCloseTo(9.5 * k, 2);
    expect(b.max.y).toBeCloseTo(14.6 * k, 1);
    expect(b.min.y).toBeLessThan(0);
    const colors = g.children.map((m) => '#' + ((m as THREE.Mesh).material as THREE.MeshToonMaterial).color.getHexString());
    expect(colors).toContain('#123456');
    expect(PARAPLUIE_DEFAUT).toMatch(/^#[0-9A-F]{6}$/i);
    disposeRig([g]);
  });
});
