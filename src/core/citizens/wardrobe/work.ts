// Tenues de travail posées par-dessus les vêtements : gilet haute visibilité (coque du torse sans manches, bande
// réfléchissante par motif `bindPos`) et tablier (devant seulement : bavette tirée du corps, pan tombant comme une jupe).
import * as THREE from 'three';
import { skinned, type BodyInfo, type VertexInfo } from './body';
import { aT, bodyRadius, clamp01, shell } from './shell';

// Bande réfléchissante du gilet (la couleur du gilet et celle du tablier viennent de la pièce).
export const GILET_BANDE = '#E8E8E0';

// Gilet : comme un haut sans manches (emmanchure au ras de l'épaule, encolure large), un peu plus gonflé que le plus
// épais des hauts (manteau 0,018 + aisance 0,008) pour passer par-dessus ; une bande claire à mi-hauteur.
export function gilet(A: BodyInfo, color: string): THREE.SkinnedMesh {
  const hemY = A.waistY - 0.05 * A.H, colY = A.J.Neck.y;
  const nx = A.J.Neck.x, nz = A.J.Neck.z, r0 = 0.075 * A.H;
  const col = (v: VertexInfo) => Math.max(colY - v.y, Math.hypot(v.x - nx, v.z - nz) - r0);
  const chest = A.J.Spine2.y;
  const off = (v: VertexInfo) => 0.022 + 0.008 * clamp01((chest - v.y) / (chest - hemY));
  const mid = hemY + 0.45 * (chest - hemY), half = 0.013 * A.H;
  return shell(A, (v) => Math.min(v.y - hemY, col(v), (-0.02 - aT(v)) * 0.2, v.part === 'hand' || v.part === 'head' ? -1 : 1), off, color, {
    pattern: { kind: 'bande', color: GILET_BANDE, lo: mid - half, hi: mid + half },
  });
}

// Tablier : bavette sur le devant de la poitrine (coque coupée sur z), pan du ventre aux genoux construit autour du
// bassin sur le seul secteur avant (même principe que la jupe : il tombe droit au lieu de passer entre les jambes),
// cordon à la taille.
export function tablier(A: BodyInfo, color: string): THREE.SkinnedMesh[] {
  const zc = A.J.Spine2.z, cx = A.J.Spine2.x;
  const chestY = A.J.Spine2.y + 0.35 * (A.J.Neck.y - A.J.Spine2.y), bibLow = A.waistY - 0.03 * A.H, halfW = 0.075 * A.H;
  const out = (v: VertexInfo) => v.part === 'hand' || v.part === 'head' || v.part === 'arm' || v.part === 'neck';
  const bib = shell(A, (v) => (out(v) ? -1 : Math.min(v.z - zc, chestY - v.y, v.y - bibLow, halfW - Math.abs(v.x - cx))), 0.022, color);
  const tie = shell(A, (v) => (out(v) ? -1 : Math.min(v.y - (A.waistY - 0.01 * A.H), A.waistY + 0.01 * A.H - v.y)), 0.026, color);
  return [bib, apronPanel(A, color), tie];
}

function apronPanel(A: BodyInfo, color: string): THREE.SkinnedMesh {
  const R = bodyRadius(A), c = A.J.Hips;
  const top = A.waistY, hem = A.J.LeftLeg.y + 0.02 * A.H, off = 0.024 * A.H;
  const AZ = 1.25, NA = 24, NY = 16, pos: number[] = [], si: number[] = [], sw: number[] = [], ind: number[] = [];
  const H = A.idx.Hips, L = A.idx.LeftUpLeg, Rr = A.idx.RightUpLeg;
  // Rayon : celui du ventre en haut, puis le plus large du bassin et du haut des cuisses (le pan tombe sans coller).
  const base = (az: number) => { let r = 0; for (let y = top; y >= top - 0.4 * (top - hem); y -= 0.01) r = Math.max(r, R(y, az)); return r; };
  for (let iy = 0; iy <= NY; iy++) {
    const t = iy / NY, y = top + (hem - top) * t;
    for (let ia = 0; ia <= NA; ia++) {
      const az = -AZ + (ia / NA) * 2 * AZ;
      let r0 = 0.02;
      for (let dy = -0.03; dy <= 0.03; dy += 0.01) r0 = Math.max(r0, R(top + dy * A.H, az));
      const r = r0 + (base(az) - r0) * Math.min(1, t * 4) + off + 0.05 * (top - hem) * t * t;
      pos.push(c.x + Math.sin(az) * r, y, c.z + Math.cos(az) * r);
      const s = Math.sin(az);
      const wl = t * 0.8 * (0.5 + 0.5 * s), wr = t * 0.8 * (0.5 - 0.5 * s);
      si.push(H, L, Rr, 0); sw.push(1 - wl - wr, wl, wr, 0);
    }
  }
  for (let iy = 0; iy < NY; iy++) for (let ia = 0; ia < NA; ia++) {
    const a = iy * (NA + 1) + ia, b = a + NA + 1;
    ind.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return skinned(A, pos, null, si, sw, ind, color, THREE.DoubleSide);
}
