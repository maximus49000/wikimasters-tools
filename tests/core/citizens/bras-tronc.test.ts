// Retours du 2026-10-18 (audit des postures) : sur les bases larges, le bras qui balance ou pend entrait dans le ventre
// et la hanche (le pantin suppose un buste mince). Mesuré sur les vrais modèles posés (peau calculée par three.js) :
// coude, avant-bras, poignet et main restent hors du tronc, à la moitié de l'épaisseur du bras près (il s'y appuie).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyPose, boneMap } from '../../../src/core/citizens/retarget';
import { boneName, comp } from '../../../src/core/citizens/wardrobe/body';
import { poseOf, type ArmPose, type Gait } from '../../../src/core/library/figure/skeleton';

const persos = resolve(__dirname, '../../../relay/public/persos');
const manifest = JSON.parse(readFileSync(resolve(persos, 'manifest.json'), 'utf8')) as { bases: Record<string, { glb: string }> };
const TORSO = new Set(['Hips', 'Spine', 'Spine1', 'Spine2']);

async function load(name: string): Promise<{ body: THREE.SkinnedMesh; torso: number[]; H: number }> {
  const buf = readFileSync(resolve(persos, manifest.bases[name]!.glb));
  const gltf = await new Promise<{ scene: THREE.Group }>((ok, ko) =>
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', ok, ko));
  let body: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((o) => { if (!body && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh; });
  const b = body as unknown as THREE.SkinnedMesh;
  const g = b.geometry, P = g.attributes.position!, SI = g.attributes.skinIndex!, SW = g.attributes.skinWeight!;
  const names = b.skeleton.bones.map((x) => boneName(x.name));
  const torso: number[] = [];
  const hipsY = new THREE.Vector3().setFromMatrixPosition(b.skeleton.boneInverses[names.indexOf('Hips')]!.clone().invert()).y;
  let H = 0;
  for (let i = 0; i < P.count; i++) {
    H = Math.max(H, P.getY(i));
    let best = 0, bw = 0;
    for (let k = 0; k < 4; k++) if (comp(SW, i, k) > bw) { bw = comp(SW, i, k); best = comp(SI, i, k); }
    // Tronc + haut des cuisses (hanches, fesses).
    if (TORSO.has(names[best]!) || (/UpLeg$/.test(names[best]!) && P.getY(i) > hipsY - 0.08)) torso.push(i);
  }
  return { body: b, torso, H };
}

// Pire entrée (fraction de H) d'un point du bras dans le tronc posé : rayon du tronc autour de l'axe vertical des hanches
// posées, dans la tranche du point et son secteur (±12°), moins la distance du point à l'axe.
function worstDepth(body: THREE.SkinnedMesh, torso: number[], H: number, map: ReturnType<typeof boneMap>): number {
  body.parent!.updateMatrixWorld(true);
  body.skeleton.update();
  const v = new THREE.Vector3(), pts: THREE.Vector3[] = [];
  for (const i of torso) pts.push(body.applyBoneTransform(i, v.fromBufferAttribute(body.geometry.attributes.position as THREE.BufferAttribute, i)).clone().applyMatrix4(body.matrixWorld));
  const hip = map.bones.Hips.getWorldPosition(new THREE.Vector3());
  let worst = -Infinity;
  for (const s of ['Left', 'Right'] as const) {
    const e = map.bones[`${s}ForeArm`].getWorldPosition(new THREE.Vector3()), w = map.bones[`${s}Hand`].getWorldPosition(new THREE.Vector3());
    for (const t of [0, 0.5, 1]) {
      const p = e.clone().lerp(w, t);
      const az = Math.atan2(p.x - hip.x, p.z - hip.z), d = Math.hypot(p.x - hip.x, p.z - hip.z);
      let r = 0;
      for (const q of pts) {
        if (Math.abs(q.y - p.y) > 0.012 * H) continue;
        const a = Math.atan2(q.x - hip.x, q.z - hip.z);
        if (Math.abs(Math.atan2(Math.sin(a - az), Math.cos(a - az))) > 0.21) continue;
        r = Math.max(r, Math.hypot(q.x - hip.x, q.z - hip.z));
      }
      if (r) worst = Math.max(worst, (r - d) / H);
    }
  }
  return worst;
}

describe('bras hors du tronc', () => {
  const CASES: [Gait, ArmPose][] = [['walk', 'swing'], ['stand', 'down'], ['stand', 'swing']];
  it('bases larges : avant-bras et poignet ne s’enfoncent plus dans le ventre ni la hanche', async () => {
    for (const name of ['femme-forte', 'homme-fort', 'mamie', 'papy', 'femme-frele']) {
      const { body, torso, H } = await load(name);
      const map = boneMap(body.skeleton);
      let worst = -Infinity, before = -Infinity, where = '';
      for (const [g, arms] of CASES)
        for (let y = 0; y < 16; y += 2)
          for (let ph = 0; ph < 12; ph += g === 'walk' ? 1 : 12) {
            const p = poseOf((y * Math.PI) / 8, (ph * Math.PI) / 6, g, { arms });
            // Sans enveloppe (le pantin tel quel), puis avec.
            const saved = map.hull;
            map.hull = null;
            applyPose(body.parent!, map, p, H / 40, g);
            before = Math.max(before, worstDepth(body, torso, H, map));
            map.hull = saved;
            applyPose(body.parent!, map, p, H / 40, g);
            const d = worstDepth(body, torso, H, map);
            if (d > worst) { worst = d; where = `${g} ${arms} y${y} p${ph}`; }
          }
      // Le bras peut s'appuyer de la moitié de son épaisseur (≈ 0,02 H), pas entrer dans le tronc.
      expect(worst, `${name} ${where}`).toBeLessThan(0.003);
      if (name === 'femme-forte' || name === 'mamie') expect(before, `${name} sans correction`).toBeGreaterThan(0.012);
    }
  });
});
