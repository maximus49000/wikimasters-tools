// Retour S26 du 2026-10-18 (pré-prod 1758) : « les fesses en arrière, personne ne marche comme ça ». Les passants 3D
// marchaient le buste basculé de 9 à 11° vers l'avant, pli au bas du dos, bassin en arrière. Cause : la ligne Hips → Neck
// des vrais modèles est inclinée de 5 à 6° vers l'arrière au repos (corps droit) et elle était posée sur la ligne du
// pantin. Mesures sur le corps déformé (pas seulement les os) des 8 vrais modèles : buste, bassin, genoux, hauteur.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyPose, boneMap, type BoneMap } from '../../../src/core/citizens/retarget';
import { analyse } from '../../../src/core/citizens/wardrobe';
import { poseOf, type Gait } from '../../../src/core/library/figure/skeleton';

const persos = resolve(__dirname, '../../../relay/public/persos');
const manifest = JSON.parse(readFileSync(resolve(persos, 'manifest.json'), 'utf8')) as { bases: Record<string, { glb: string }> };
const NAMES = Object.keys(manifest.bases);
const DEG = 180 / Math.PI;

type Model = {
  body: THREE.SkinnedMesh; rig: THREE.Object3D; H: number; map: BoneMap;
  pel: number[]; che: number[]; rest: number; buttRest: number;
};
const cache = new Map<string, Model>();
const v = new THREE.Vector3();
const vtx = (m: Model, i: number): THREE.Vector3 => m.body.getVertexPosition(i, v).applyMatrix4(m.body.matrixWorld);
const centroid = (m: Model, ids: number[]): THREE.Vector3 => {
  const c = new THREE.Vector3();
  for (const i of ids) c.add(vtx(m, i));
  return c.divideScalar(ids.length);
};
// Point le plus en arrière d'une bande (le long de F).
const back = (m: Model, ids: number[], F: THREE.Vector3): number => {
  let mn = Infinity;
  for (const i of ids) mn = Math.min(mn, vtx(m, i).dot(F));
  return mn;
};
const lean = (t: THREE.Vector3, F: THREE.Vector3): number => Math.atan2(t.dot(F), t.y) * DEG;

async function model(name: string): Promise<Model> {
  const hit = cache.get(name);
  if (hit) return hit;
  const buf = readFileSync(resolve(persos, manifest.bases[name]!.glb));
  const gltf = await new Promise<{ scene: THREE.Group }>((ok, ko) =>
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', ok, ko));
  let body: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((o) => { if (!body && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh; });
  const b = body as unknown as THREE.SkinnedMesh;
  const H = analyse(b).H;
  // Bandes du tronc au repos (sommets liés surtout au bassin ou à la colonne) : bassin 0,50–0,56 H, poitrine 0,72–0,78 H.
  const g = b.geometry, P = g.attributes.position!, SI = g.attributes.skinIndex!, SW = g.attributes.skinWeight!;
  const names = b.skeleton.bones.map((x) => x.name.replace(/^mixamorig:?/, ''));
  const pel: number[] = [], che: number[] = [];
  for (let i = 0; i < P.count; i++) {
    const w = [SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)], ix = [SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)];
    const n = names[ix[w.indexOf(Math.max(...w))]!]!;
    if (!/^(Hips|Spine|Spine1|Spine2)$/.test(n)) continue;
    const y = P.getY(i) / H;
    if (y > 0.5 && y < 0.56) pel.push(i);
    if (y > 0.72 && y < 0.78) che.push(i);
  }
  const m: Model = { body: b, rig: b.parent!, H, map: boneMap(b.skeleton), pel, che, rest: 0, buttRest: 0 };
  // Référence « droit » : le modèle tel qu'il est modelé debout (pose de liaison).
  b.skeleton.pose();
  m.rig.updateMatrixWorld(true);
  const Z = new THREE.Vector3(0, 0, 1);
  m.rest = lean(centroid(m, che).sub(centroid(m, pel)), Z);
  m.buttRest = (back(m, pel, Z) - back(m, che, Z)) / H;
  cache.set(name, m);
  return m;
}

type Frame = { trunk: number; trunkBone: number; butt: number; kStance: number; kSwing: number; hip: number; off: number };
function measure(m: Model, yaw: number, ph: number, gait: Gait): Frame {
  const p = poseOf((yaw * Math.PI) / 8, (ph * Math.PI) / 6, gait);
  applyPose(m.rig, m.map, p, m.H / 40, gait);
  m.rig.updateMatrixWorld(true);
  const B = m.map.bones;
  const at = (b: THREE.Object3D): THREE.Vector3 => b.getWorldPosition(new THREE.Vector3());
  const F = new THREE.Vector3(p.fr.F[0], 0, p.fr.F[2]).normalize();
  const st = at(B.LeftFoot).y < at(B.RightFoot).y ? 'Left' : 'Right';
  const sw = st === 'Left' ? 'Right' : 'Left';
  const knee = (s: 'Left' | 'Right'): number =>
    at(B[`${s}Leg`]).sub(at(B[`${s}UpLeg`])).angleTo(at(B[`${s}Foot`]).sub(at(B[`${s}Leg`]))) * DEG;
  const restBone = lean(m.map.rest.torso.clone(), new THREE.Vector3(0, 0, 1));
  return {
    trunk: lean(centroid(m, m.che).sub(centroid(m, m.pel)), F) - m.rest,
    trunkBone: lean(at(B.Neck).sub(at(B.Hips)), F) - restBone,
    butt: ((back(m, m.pel, F) - back(m, m.che, F)) / m.H - m.buttRest) * 100,
    kStance: knee(st), kSwing: knee(sw),
    hip: at(B.LeftUpLeg).add(at(B.RightUpLeg)).multiplyScalar(0.5).y,
    off: (centroid(m, m.pel).sub(at(B[`${st}Foot`])).dot(F) / m.H) * 100,
  };
}

describe('marche droite, jambe d’appui tendue (8 vrais modèles)', () => {
  it('debout : buste et bassin comme le modèle debout, genoux tendus', async () => {
    for (const name of NAMES) {
      const m = await model(name);
      for (const yaw of [0, 4, 8, 12]) {
        const f = measure(m, yaw, 0, 'stand');
        const at = `${name} yaw ${yaw}`;
        expect(Math.abs(f.trunk), `${at} buste`).toBeLessThan(1.5);
        expect(Math.abs(f.butt), `${at} bassin`).toBeLessThan(0.8);
        expect(f.kStance, `${at} genou`).toBeLessThan(6);
        expect(f.kSwing, `${at} genou`).toBeLessThan(6);
      }
    }
  });

  it('marche : buste droit (≤ 3° de plus que le modèle debout), bassin jamais rejeté en arrière', async () => {
    for (const name of NAMES) {
      const m = await model(name);
      for (let yaw = 0; yaw < 16; yaw++)
        for (let ph = 0; ph < 12; ph++) {
          const f = measure(m, yaw, ph, 'walk');
          const at = `${name} yaw ${yaw} phase ${ph}`;
          // Ligne Hips → Neck : le seul penché du pantin (3° à la marche).
          expect(f.trunkBone, `${at} buste (os)`).toBeLessThan(3.2);
          expect(f.trunkBone, `${at} buste (os)`).toBeGreaterThan(-1);
          // Corps déformé (poitrine au-dessus du bassin) : la colonne plie un peu plus bas que la ligne des os.
          expect(f.trunk, `${at} buste`).toBeLessThan(5);
          expect(f.trunk, `${at} buste`).toBeGreaterThan(-2);
          // Fesses : le bas du dos ne recule pas de plus de 2,5 % H par rapport au haut du dos (avant : 4 à 5 %).
          expect(f.butt, `${at} bassin`).toBeGreaterThan(-2.5);
        }
    }
  });

  it('marche : jambe d’appui presque tendue, bassin haut et au-dessus du pied d’appui', async () => {
    for (const name of NAMES) {
      const m = await model(name);
      const stand = measure(m, 0, 0, 'stand').hip;
      for (let yaw = 0; yaw < 16; yaw++)
        for (let ph = 0; ph < 12; ph++) {
          const f = measure(m, yaw, ph, 'walk');
          const at = `${name} yaw ${yaw} phase ${ph}`;
          expect(f.kStance, `${at} genou d'appui`).toBeLessThan(20);
          expect(f.hip / stand, `${at} hauteur`).toBeGreaterThan(0.93);
          // Mi-appui (une seule jambe au sol, cuisse d'appui verticale) : genou ≤ 15°, bassin ≥ 97 %, au-dessus du pied.
          if (ph % 6 === 0) {
            expect(f.kStance, `${at} genou mi-appui`).toBeLessThan(15);
            expect(f.hip / stand, `${at} hauteur mi-appui`).toBeGreaterThan(0.97);
            expect(f.off, `${at} bassin / pied d'appui`).toBeGreaterThan(-3);
          }
        }
    }
  });

  it('marche de profil : genou libre plié à 52–66° au plus fort', async () => {
    for (const name of NAMES) {
      const m = await model(name);
      for (const yaw of [0, 8]) {
        let max = 0;
        for (let ph = 0; ph < 12; ph++) max = Math.max(max, measure(m, yaw, ph, 'walk').kSwing);
        expect(max, `${name} yaw ${yaw}`).toBeGreaterThan(52);
        expect(max, `${name} yaw ${yaw}`).toBeLessThan(66);
      }
    }
  });
});
