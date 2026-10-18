// Coiffures, barbes et couvre-chefs. Coiffures : surface construite autour du crâne mesuré, liée à 100 % à l'os de la
// tête ; barbes : coques des sommets du bas du visage, liées comme la peau.
import * as THREE from 'three';
import { rigid, skinned, type BodyInfo, type Skull } from './body';
import { shell, type Field } from './shell';

// Champ du crâne : rayon max des sommets de la tête par direction depuis le centre de la tête.
export function skull(A: BodyInfo): Skull {
  const c = new THREE.Vector3(A.J.Head.x, 0, A.J.Head.z);
  let top = 0, low = 1e9;
  for (const v of A.info) if (v.part === 'head') { top = Math.max(top, v.y); low = Math.min(low, v.y); }
  c.y = A.J.Head.y + 0.52 * (top - A.J.Head.y);
  let zmax = -1e9;
  for (const v of A.info) if (v.part === 'head') zmax = Math.max(zmax, v.z);
  c.z = A.J.Head.z + 0.1 * (zmax - A.J.Head.z);
  const NA = 72, NE = 36, rad = new Float32Array(NA * NE);
  // Crâne + haut du cou (la nuque est portée par l'os du cou) : la couronne et les nuques descendent sur la vraie surface.
  for (const v of A.info) {
    if (v.part !== 'head' && !(v.part === 'neck' && v.y > A.J.Neck.y)) continue;
    const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z, L = Math.hypot(dx, dy, dz);
    const ia = Math.floor(((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * NA) % NA;
    const ie = Math.min(NE - 1, Math.floor(((Math.asin(dy / L) + Math.PI / 2) / Math.PI) * NE));
    rad[ie * NA + ia] = Math.max(rad[ie * NA + ia]!, L);
  }
  // Cases vides sous le crâne (nuque, sous les oreilles : sommets du cou) : on prolonge la case remplie juste au-dessus.
  for (let ia = 0; ia < NA; ia++) for (let ie = NE - 2; ie >= 0; ie--) if (!rad[ie * NA + ia]) rad[ie * NA + ia] = rad[(ie + 1) * NA + ia]! * 0.97;
  const R = (az: number, el: number): number => {
    const ia = (((Math.floor(((az + Math.PI) / (2 * Math.PI)) * NA) % NA) + NA) % NA);
    let best = 0;
    for (let de = -1; de <= 1; de++) for (let da = -1; da <= 1; da++) {
      const ie = Math.max(0, Math.min(NE - 1, Math.floor(((el + Math.PI / 2) / Math.PI) * NE) + de));
      best = Math.max(best, rad[ie * NA + ((ia + da + NA) % NA)]!);
    }
    return best;
  };
  return { c, R, top, low, size: top - A.J.Head.y };
}
const skullOf = (A: BodyInfo): Skull => (A.skull ??= skull(A));
const sm = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export type HairOpts = { off?: number; drop?: (az: number) => number; keep: (az: number, el: number) => boolean; bump?: number; volume?: number; hug?: boolean };

// Surface de cheveux : sphère déformée sur le crâne ; au-dessus de l'équateur elle épouse le crâne, en dessous elle tombe
// en rideau vertical jusqu'à `drop(az)` (hauteur relative sous le centre, en tailles de tête). `keep(az, el)` découpe le visage.
export function hairSurface(A: BodyInfo, S: Skull, { off = 0.008, drop = () => 0, keep, bump = 0, volume = 0, hug = false }: HairOpts, color: string): THREE.SkinnedMesh {
  const g = new THREE.SphereGeometry(1, 128, 96);
  const P = g.attributes.position!;
  const ok = new Uint8Array(P.count);
  const offA = off * A.H, vol = volume * S.size;
  const Rh = (az: number) => { let r = 0; for (let e = -0.35; e <= 0.15; e += 0.05) r = Math.max(r, S.R(az, e)); return r + offA + vol; };
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const el = Math.asin(Math.max(-1, Math.min(1, y))), az = Math.atan2(x, z);
    const noise = bump ? bump * S.size * (Math.sin(az * 9) * Math.sin(el * 11) * 0.5 + 0.5) : 0;
    let p: [number, number, number];
    if (hug) {
      const r = Math.max(S.R(az, el), 0.3 * S.size) + offA + vol * Math.max(0, Math.sin(el)) + noise;
      p = [S.c.x + Math.sin(az) * Math.cos(el) * r, S.c.y + Math.sin(el) * r, S.c.z + Math.cos(az) * Math.cos(el) * r];
    } else if (el >= 0) {
      const r0 = Math.max(S.R(az, el), 0.3 * S.size) + offA + vol * (0.4 + 0.6 * Math.sin(el)) + noise;
      const r = r0 + (Rh(az) + noise - r0) * (1 - sm(0, 0.7, el));
      p = [S.c.x + Math.sin(az) * Math.cos(el) * r, S.c.y + Math.sin(el) * r, S.c.z + Math.cos(az) * Math.cos(el) * r];
    } else {
      const t = -el / (Math.PI / 2);
      const rh = (Rh(az) + noise) * (1 + 0.05 * t - 0.09 * Math.pow(t, 4));
      p = [S.c.x + Math.sin(az) * rh, S.c.y - t * drop(az) * S.size, S.c.z + Math.cos(az) * rh];
    }
    P.setXYZ(i, p[0], p[1], p[2]);
    ok[i] = keep(az, el) ? 1 : 0;
  }
  // Seuls les sommets des triangles gardés sont conservés (indices renumérotés) : la sphère de départ en compte 12 513.
  const src = g.index!.array, ind: number[] = [], pos: number[] = [], remap = new Int32Array(P.count).fill(-1);
  const at = (v: number): number => {
    if (remap[v]! < 0) { remap[v] = pos.length / 3; pos.push(P.getX(v), P.getY(v), P.getZ(v)); }
    return remap[v]!;
  };
  for (let k = 0; k < src.length; k += 3) if (ok[src[k]!] && ok[src[k + 1]!] && ok[src[k + 2]!]) ind.push(at(src[k]!), at(src[k + 1]!), at(src[k + 2]!));
  const si: number[] = [], sw: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) { si.push(A.idx.Head, 0, 0, 0); sw.push(1, 0, 0, 0); }
  g.dispose();
  return skinned(A, pos, null, si, sw, ind, color);
}
// Boule (chignon, bout de couette) ou tube effilé (queue de cheval), liés à un os (la tête par défaut).
export function blob(A: BodyInfo, center: THREE.Vector3, radius: number, color: string, scale: [number, number, number] = [1, 1, 1], bone: number = A.idx.Head): THREE.SkinnedMesh {
  const g = new THREE.SphereGeometry(radius, 24, 16);
  g.scale(...scale);
  g.translate(center.x, center.y, center.z);
  return rigid(A, g, bone, color);
}
export function tube(A: BodyInfo, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, color: string, bone: number = A.idx.Head): THREE.SkinnedMesh {
  const len = from.distanceTo(to);
  const g = new THREE.CylinderGeometry(r1, r0, len, 16, 6);
  const dir = to.clone().sub(from).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  const mid = from.clone().add(to).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return rigid(A, g, bone, color);
}

// Ligne d'implantation des cheveux courts : élévation minimale selon l'azimut (0 = front, π = nuque), interpolée.
const LINE: ReadonlyArray<readonly [number, number]> = [[0, 0.72], [0.9, 0.62], [1.3, 0.42], [1.6, 0.3], [1.9, 0.25], [2.3, -0.15], [Math.PI, -0.45]];
function hairline(az: number, lift = 0): number {
  const a = Math.abs(az);
  for (let k = 1; k < LINE.length; k++) if (a <= LINE[k]![0]) { const [a0, e0] = LINE[k - 1]!, [a1, e1] = LINE[k]!; return e0 + ((e1 - e0) * (a - a0)) / (a1 - a0) + lift; }
  return LINE[LINE.length - 1]![1] + lift;
}

export const HAIR_STYLES = ['court', 'raie', 'degarni', 'couronne', 'carre', 'long', 'chignon', 'boucles', 'queue', 'couettes', 'rase', 'frise', 'afro', 'tresses', 'enfant'] as const;

// Coiffures : chaque style rend une liste de maillages.
export function hair(A: BodyInfo, style: string, color: string): THREE.SkinnedMesh[] {
  const S = skullOf(A);
  const face = 1.2;
  const fringe = (lo: number, hi: number) => (az: number) => hi - (hi - lo) * Math.pow(Math.min(1, Math.abs(az) / face), 2);
  const front = (az: number) => Math.abs(az) < face;
  switch (style) {
    case 'court': // homme : front dégagé, dégagé sur les oreilles, nuque courte
      return [hairSurface(A, S, { hug: true, off: 0.004, keep: (az, el) => el > hairline(az) }, color)];
    case 'raie': // homme : plus de volume, mèche un peu plus basse sur le front
      return [hairSurface(A, S, { hug: true, off: 0.005, volume: 0.07, keep: (az, el) => el > hairline(az, Math.abs(az) < 1.2 ? -0.12 : 0) }, color)];
    case 'degarni': // homme mûr : golfes profonds sur les tempes, petite avancée au milieu du front
      return [hairSurface(A, S, { hug: true, off: 0.004, keep: (az, el) => el > hairline(az, Math.abs(az) < 1.3 ? 0.32 * Math.sin((Math.PI * Math.abs(az)) / 1.3) + 0.12 : 0) }, color)];
    case 'couronne': // papy : sommet dégarni, couronne autour de la nuque et au-dessus des oreilles
      return [hairSurface(A, S, { hug: true, off: 0.004, keep: (az, el) => Math.abs(az) > 1.35 && el > hairline(az) && el < 0.28 + 0.3 * ((Math.abs(az) - 1.35) / (Math.PI - 1.35)) }, color)];
    case 'carre':
      return [hairSurface(A, S, { drop: () => 0.62, keep: (az, el) => (front(az) ? el >= fringe(0.02, 0.24)(az) : true) }, color)];
    case 'long':
      return [hairSurface(A, S, { volume: 0.03, drop: (az) => (Math.abs(az) > 2.2 ? 1.5 : 1.1), keep: (az, el) => (front(az) ? el >= fringe(0.05, 0.28)(az) : true) }, color)];
    case 'chignon': { // mamie ou femme : cheveux tirés + chignon haut derrière
      const m = hairSurface(A, S, { off: 0.004, drop: () => 0.3, keep: (az, el) => (front(az) ? el > 0.35 : Math.abs(az) < 2.0 ? el > 0.05 : el > -0.6) }, color);
      const b = blob(A, new THREE.Vector3(S.c.x, S.c.y + 0.35 * S.size, S.c.z - 0.62 * S.size), 0.28 * S.size, color, [1, 0.9, 0.9]);
      return [m, b];
    }
    case 'boucles': // mamie : mise en plis courte et bouffante
      return [hairSurface(A, S, { off: 0.006, volume: 0.1, bump: 0.05, drop: () => 0.45, keep: (az, el) => (front(az) ? el > fringe(0.25, 0.4)(az) : true) }, color)];
    case 'queue': { // queue de cheval
      const m = hairSurface(A, S, { off: 0.004, drop: () => 0.3, keep: (az, el) => (front(az) ? el > 0.32 : Math.abs(az) < 2.0 ? el > 0.05 : el > -0.6) }, color);
      const root = new THREE.Vector3(S.c.x, S.c.y + 0.1 * S.size, S.c.z - 0.6 * S.size);
      const tip = new THREE.Vector3(S.c.x, S.c.y - 1.1 * S.size, S.c.z - 0.85 * S.size);
      return [m, blob(A, root, 0.14 * S.size, color), tube(A, root, tip, 0.14 * S.size, 0.05 * S.size, color)];
    }
    case 'couettes': { // enfant : deux couettes sur les côtés
      const m = hairSurface(A, S, { off: 0.004, drop: () => 0.3, keep: (az, el) => (front(az) ? el > fringe(0.12, 0.28)(az) : el > -0.3) }, color);
      const out = [m];
      for (const s of [1, -1]) {
        const root = new THREE.Vector3(S.c.x + s * 0.68 * S.size, S.c.y + 0.0 * S.size, S.c.z - 0.15 * S.size);
        const tip = new THREE.Vector3(S.c.x + s * 0.88 * S.size, S.c.y - 0.6 * S.size, S.c.z - 0.2 * S.size);
        out.push(blob(A, root, 0.1 * S.size, color), tube(A, root, tip, 0.09 * S.size, 0.035 * S.size, color));
      }
      return out;
    }
    case 'rase': // tondeuse : très court, épouse le crâne
      return [hairSurface(A, S, { hug: true, off: 0.0025, keep: (az, el) => el > hairline(az, 0.04) }, color)];
    case 'frise': // cheveux courts frisés / crépus : volume et relief
      return [hairSurface(A, S, { hug: true, off: 0.006, volume: 0.12, bump: 0.05, keep: (az, el) => el > hairline(az, Math.abs(az) < 1.2 ? -0.05 : 0) }, color)];
    case 'afro': // volume rond tout autour
      return [hairSurface(A, S, { hug: true, off: 0.008, volume: 0.42, bump: 0.06, keep: (az, el) => el > hairline(az, Math.abs(az) < 1.2 ? -0.08 : -0.1) }, color)];
    case 'tresses': { // deux tresses dans le dos (anneaux successifs)
      const m = hairSurface(A, S, { hug: true, off: 0.005, volume: 0.03, keep: (az, el) => el > hairline(az, Math.abs(az) < 1.2 ? -0.05 : -0.05) }, color);
      const out = [m];
      for (const s of [1, -1]) {
        for (let k = 0; k < 7; k++) {
          const c = new THREE.Vector3(S.c.x + s * (0.42 - k * 0.02) * S.size, S.c.y - (0.35 + k * 0.17) * S.size, S.c.z - (0.55 - k * 0.03) * S.size);
          out.push(blob(A, c, (0.1 - k * 0.006) * S.size, color, [1, 1.25, 1]));
        }
      }
      return out;
    }
    case 'enfant': // garçon : court avec une petite frange
      return [hairSurface(A, S, { hug: true, off: 0.005, volume: 0.06, keep: (az, el) => el > hairline(az, Math.abs(az) < 1.2 ? -0.28 : -0.05) }, color)];
    default:
      return [];
  }
}

// Casquette (pas pour les anciens) : calotte au-dessus d'une ligne autour de la tête + visière devant.
export function cap(A: BodyInfo, color: string, visor = color): THREE.SkinnedMesh[] {
  const S = skullOf(A);
  const band = (az: number) => 0.26 + 0.1 * Math.max(0, -Math.cos(az)); // un peu plus haute derrière
  const crown = hairSurface(A, S, { hug: true, off: 0.012, volume: 0.015, keep: (az, el) => el > band(az) }, color);
  // Visière : demi-disque aplati, centré devant le front, inclinée de ~12° vers le bas.
  const r = 0.58 * S.size, front = S.R(0, 0.26) + 0.012 * A.H;
  const g = new THREE.CircleGeometry(r, 24, 0, Math.PI);
  g.rotateX(-Math.PI / 2 + 0.2);
  g.scale(1.05, 1, 0.75);
  const yv = S.c.y + Math.sin(0.26) * front;
  g.translate(S.c.x, yv, S.c.z + Math.cos(0.26) * front - 0.06 * S.size);
  const v = rigid(A, g, A.idx.Head, visor);
  return [crown, v];
}

// Bonnet : calotte qui épouse le crâne jusqu'au-dessus des sourcils et des oreilles (un peu plus bas sur la nuque), un
// peu lâche sur le dessus, avec un revers : bande plus épaisse en bas. Lié à 100 % à la tête comme les coiffures.
export function bonnet(A: BodyInfo, color: string): THREE.SkinnedMesh[] {
  const S = skullOf(A);
  const band = (az: number) => 0.14 - 0.2 * Math.max(0, -Math.cos(az));
  const crown = hairSurface(A, S, { hug: true, off: 0.012, volume: 0.06, keep: (az, el) => el > band(az) }, color);
  const rim = hairSurface(A, S, { hug: true, off: 0.02, keep: (az, el) => el > band(az) - 0.02 && el < band(az) + 0.2 }, color);
  return [crown, rim];
}

// Barbes : coques des sommets du bas du visage (repère : centre du crâne, en tailles de tête), liées comme la peau.
type HeadRel = { u: number; f: number; s: number };
export function beard(A: BodyInfo, style: string, color: string): THREE.SkinnedMesh[] {
  const S = skullOf(A);
  const rel = (v: { x: number; y: number; z: number }): HeadRel => ({ u: (v.y - S.c.y) / S.size, f: (v.z - S.c.z) / S.size, s: (v.x - S.c.x) / S.size });
  // Champs continus dans le repère de la tête (u = hauteur, f = avant, s = côté, en tailles de tête) ; hors tête : −1.
  // Repères mesurés sur le profil des bases : nez ≈ −0,22, bouche ≈ −0,33, menton ≈ −0,5 ; face avant f ≈ 0,43.
  const mouth = (r: HeadRel) => Math.min(r.u + 0.39, -0.28 - r.u, 0.16 - Math.abs(r.s), r.f - 0.3);
  const must = (r: HeadRel) => Math.min(r.f - 0.3, -0.25 - r.u, r.u + 0.32, 0.22 - Math.abs(r.s));
  const F: ((r: HeadRel) => number) | undefined = ({
    pleine: (r: HeadRel) => Math.min(r.f + 0.05, -0.2 - r.u, -mouth(r)),
    courte: (r: HeadRel) => Math.min(r.f - 0.05, -0.3 - r.u, -mouth(r)),
    moustache: must,
    bouc: (r: HeadRel) => Math.max(Math.min(r.f - 0.2, -0.39 - r.u, 0.14 - Math.abs(r.s)), must(r)),
  } as Record<string, (r: HeadRel) => number>)[style];
  const keep: Field | undefined = F && ((v) => (v.part === 'head' ? F(rel(v)) : -1));
  return keep ? [shell(A, keep, 0.004, color)] : [];
}
