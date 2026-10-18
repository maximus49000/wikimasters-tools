// Retours du 2026-10-18 : sac en bandoulière (poche souple à taille réelle, sangle par-dessus le tissu, bras qui ne le
// traverse pas en marchant) et pas des passants (le 3D ne plie jamais le genou plus que le pantin de la même clé, le
// pied libre ne monte pas plus haut que celui du pantin, à proportion de la taille). Sur les vrais modèles habillés.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Piece } from '../../../src/core/citizens/catalogue';
import { BASES } from '../../../src/core/citizens/catalogue-data';
import { applyPose, boneMap } from '../../../src/core/citizens/retarget';
import { analyse, dressRig, type BodyInfo } from '../../../src/core/citizens/wardrobe';
import { SAC, withCloth } from '../../../src/core/citizens/wardrobe/accessories';
import { slab } from '../../../src/core/citizens/wardrobe/body';
import { LIMB, poseOf, type Gait } from '../../../src/core/library/figure/skeleton';
import type { V3 } from '../../../src/core/library/figure/geometry';

const persos = resolve(__dirname, '../../../relay/public/persos');
const manifest = JSON.parse(readFileSync(resolve(persos, 'manifest.json'), 'utf8')) as { bases: Record<string, { glb: string }> };
const NAMES = Object.keys(manifest.bases);

type Model = { body: THREE.SkinnedMesh; rig: THREE.Object3D; A: BodyInfo };
const cache = new Map<string, Model>();
async function model(name: string): Promise<Model> {
  const hit = cache.get(name);
  if (hit) return hit;
  const buf = readFileSync(resolve(persos, manifest.bases[name]!.glb));
  const gltf = await new Promise<{ scene: THREE.Group }>((ok, ko) =>
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', ok, ko));
  let body: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((o) => { if (!body && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh; });
  const b = body as unknown as THREE.SkinnedMesh;
  const A = analyse(b);
  const ease = BASES[name]?.ease;
  if (ease) A.ease = ease;
  const m = { body: b, rig: b.parent!, A };
  cache.set(name, m);
  return m;
}

// Tenues : tee-shirt + pantalon, et manteau long (haut épais + jupe de manteau, comme le catalogue).
const TENUES: Record<string, Piece[]> = {
  tee: [{ k: 'top', sleeve: 0.45, color: '#7A8C6E' }, { k: 'bottom', cut: 0.96, color: '#4A5568' }],
  manteau: [{ k: 'bottom', cut: 0.96, color: '#4A5568' }, { k: 'top', sleeve: 0.93, off: 0.018, hem: 0, collar: 0.4, neckR: 0.07, color: '#555' }, { k: 'skirt', len: 0.85, flare: 0.15, off: 0.024, color: '#555' }],
};
const SAC_PIECE: Piece = { k: 'accessory', what: 'sac', color: '#3B7DD8' };

// Maillages du sac (poche, rabat, fermoir, sangle) : les quatre derniers de l'habillage.
const dressSac = (m: Model, tenue: string): { cloth: THREE.Mesh[]; sac: THREE.SkinnedMesh[] } => {
  const all = dressRig(m.A, [...TENUES[tenue]!, SAC_PIECE], '#C68642') as THREE.SkinnedMesh[];
  return { cloth: all.slice(0, -4), sac: all.slice(-4) };
};
const restBox = (ms: THREE.Mesh[]): THREE.Box3 => {
  const b = new THREE.Box3();
  for (const m of ms) b.union(new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position as THREE.BufferAttribute));
  return b;
};

describe('sac en bandoulière', () => {
  it('taille réelle : ≈ 25 × 20 × 8 cm ramenés à 1,70 m (poche + rabat)', async () => {
    for (const name of NAMES) {
      const m = await model(name);
      const { sac } = dressSac(m, 'tee');
      const s = restBox(sac.slice(0, 2)).getSize(new THREE.Vector3()).multiplyScalar(170 / m.A.H);
      // Largeur le long de z (devant-derrière), hauteur y, épaisseur x (rabat compris).
      expect(s.z, `${name} largeur`).toBeGreaterThan(21);
      expect(s.z, `${name} largeur`).toBeLessThan(28);
      expect(s.y, `${name} hauteur`).toBeGreaterThan(17);
      expect(s.y, `${name} hauteur`).toBeLessThan(24);
      expect(s.x, `${name} épaisseur`).toBeGreaterThan(6);
      expect(s.x, `${name} épaisseur`).toBeLessThan(11);
      expect(SAC.w * 170).toBeCloseTo(24.65, 1);
    }
  });

  it('pas une boîte : poche plus épaisse en bas qu’en haut, fond arrondi', async () => {
    const m = await model('homme-fort');
    const bag = dressSac(m, 'tee').sac[0]!;
    const P = bag.geometry.attributes.position!;
    const b = restBox([bag]);
    const h = b.max.y - b.min.y;
    // Étendue le long de x (épaisseur) ou de z (largeur) des sommets dans une tranche de hauteur.
    const span = (k: 'x' | 'z', y0: number, y1: number): number => {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < P.count; i++) {
        if (P.getY(i) < y0 || P.getY(i) > y1) continue;
        const c = k === 'x' ? P.getX(i) : P.getZ(i);
        lo = Math.min(lo, c); hi = Math.max(hi, c);
      }
      return hi - lo;
    };
    expect(span('x', b.min.y + 0.15 * h, b.min.y + 0.3 * h)).toBeGreaterThan(1.4 * span('x', b.max.y - 0.12 * h, b.max.y - 0.04 * h));
    // Fond arrondi : tout en bas, la largeur est nettement plus petite qu'à mi-hauteur (coins du bas ronds).
    expect(span('z', b.min.y, b.min.y + 0.06 * h)).toBeLessThan(0.8 * span('z', b.min.y + 0.4 * h, b.min.y + 0.6 * h));
  });

  // L'axe de la sangle (centre de chaque anneau du tube) ne passe jamais dans le corps habillé ; le tube lui-même ne
  // rentre jamais dans la peau. Tranche de 1,6 % de la hauteur autour de chaque point : devant, dos ou dessus.
  it('sangle par-dessus le tissu : jamais dans le corps habillé (tee-shirt, manteau long)', async () => {
    const depth = (E: BodyInfo, x: number, y: number, z: number, tol: number): number => {
      const e = 0.008 * E.H, s = slab(E, y - e, y + e, (v) => v.part !== 'arm' && v.part !== 'hand' && v.part !== 'head' && Math.abs(v.x - x) < e);
      if (!s.n || z >= s.maxZ - tol || z <= s.minZ + tol || y >= s.maxY - tol) return 0;
      return Math.min(s.maxZ - z, z - s.minZ, s.maxY - y);
    };
    for (const name of NAMES)
      for (const tenue of Object.keys(TENUES)) {
        const m = await model(name);
        const { cloth, sac } = dressSac(m, tenue);
        const E = withCloth(m.A, cloth), H = m.A.H, low = m.A.J.Hips.y + 0.04 * H; // en dessous : attaches sur le sac
        const P = sac[3]!.geometry.attributes.position!;
        let skin = 0, axis = 0, where = '';
        let wSkin = '';
        for (let i = 0; i < P.count; i++) {
          const dd = P.getY(i) > low ? depth(m.A, P.getX(i), P.getY(i), P.getZ(i), 0.003 * H) : 0;
          if (dd > skin) { skin = dd; wSkin = [P.getX(i), P.getY(i), P.getZ(i)].map((t) => t.toFixed(3)).join(','); }
        }
        // Anneaux de 9 sommets (8 segments + couture).
        for (let i = 0; i + 8 < P.count; i += 9) {
          let x = 0, y = 0, z = 0;
          for (let j = 0; j < 8; j++) { x += P.getX(i + j) / 8; y += P.getY(i + j) / 8; z += P.getZ(i + j) / 8; }
          if (y > low && depth(E, x, y, z, 0) > axis) { axis = depth(E, x, y, z, 0); where = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`; }
        }
        expect(skin / H, `${name} ${tenue} : tube dans la peau ${wSkin}`).toBe(0);
        // Axe : au plus 2 ‰ de H sous la surface (col d'un manteau à l'aisance forte, maillage lâche).
        expect(axis / H, `${name} ${tenue} : axe dans le tissu ${where}`).toBeLessThan(0.002);
      }
  });

  it('poche hors du corps habillé au repos', async () => {
    for (const name of NAMES)
      for (const tenue of Object.keys(TENUES)) {
        const m = await model(name);
        const { cloth, sac } = dressSac(m, tenue);
        const bag = restBox([sac[0]!]);
        const E = withCloth(m.A, cloth);
        const s = slab(E, bag.min.y, bag.max.y, (v) => (v.part === 'torso' || v.part === 'leg') && v.z > bag.min.z && v.z < bag.max.z);
        expect(bag.max.x, `${name} ${tenue}`).toBeLessThan(s.minX);
      }
  });

  it('en marchant, l’avant-bras droit ne traverse pas la poche (toutes orientations et phases)', async () => {
    const at = (m: Model, n: string): THREE.Bone => m.body.skeleton.bones.find((b) => b.name.replace(/^mixamorig:?/, '') === n)!;
    for (const name of NAMES) {
      const m = await model(name);
      const { cloth, sac } = dressSac(m, 'tee');
      // Habillage posé sur le rig comme par le moteur de rendu : l'enveloppe du tronc (bras hors du corps) le mesure.
      const worn = [...cloth, ...sac];
      for (const o of worn) m.rig.add(o);
      const bag = restBox([sac[0]!]);
      const map = boneMap(m.body.skeleton);
      const H = m.A.H, hips = at(m, 'Hips'), hi = m.body.skeleton.bones.indexOf(hips);
      const toRest = new THREE.Matrix4(), q = new THREE.Vector3();
      let worst = -Infinity, where = '';
      for (let y = 0; y < 16; y++)
        for (let ph = 0; ph < 12; ph++) {
          applyPose(m.rig, map, poseOf((y * Math.PI) / 8, (ph * Math.PI) / 6, 'walk'), H / 40, 'walk');
          m.rig.updateMatrixWorld(true);
          // Monde → repos du bassin (le sac y est rigide).
          toRest.copy(m.body.matrixWorld).multiply(m.body.bindMatrixInverse).multiply(hips.matrixWorld).multiply(m.body.skeleton.boneInverses[hi]!).multiply(m.body.bindMatrix).invert();
          const a = at(m, 'RightForeArm').getWorldPosition(new THREE.Vector3()), b = at(m, 'RightHand').getWorldPosition(new THREE.Vector3());
          // Avant-bras + main (prolongée de 0,08 H) : profondeur d'entrée dans la poche, rayon du bras compris.
          const dir = b.clone().sub(a);
          for (let k = 0; k <= 20; k++) {
            q.copy(a).addScaledVector(dir, (k / 20) * (1 + (0.08 * H) / dir.length())).applyMatrix4(toRest);
            const depth = Math.min(q.x - bag.min.x, bag.max.x - q.x, q.y - bag.min.y, bag.max.y - q.y, q.z - bag.min.z, bag.max.z - q.z) + 0.02 * H;
            if (depth > worst) { worst = depth; where = `y${y} p${ph} ${[q.x - bag.min.x, bag.max.x - q.x, q.y - bag.min.y, bag.max.y - q.y, q.z - bag.min.z, bag.max.z - q.z].map((t) => (t / H).toFixed(3)).join(',')}`; }
          }
        }
      // Profondeur = entrée de l'axe du bras dans la boîte englobante de la poche + rayon du bras (0,02 H). L'axe peut au
      // plus effleurer la boîte (0,005 H : les bords arrondis de la poche sont bien en retrait de sa boîte) — la main qui
      // frôle le sac entre la hanche et la poche, jamais un bras qui le traverse.
      for (const o of worn) m.rig.remove(o);
      expect(worst / H, `${name} ${where}`).toBeLessThan(0.025);
    }
  });
});

describe('pas des passants', () => {
  const v = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);
  const GAITS: Gait[] = ['walk', 'step', 'stand', 'crouch', 'climb', 'seated'];
  // Marche et petit pas : genou recalé en 3D (retarget.ts walkKnee) — tibia jamais à plus de 50° (de profil) à 68°
  // (de face) derrière la verticale, pied libre jamais plus haut que le plus haut du pantin sur le cycle. Autres allures :
  // genou jamais plus plié que le pantin de la même clé (+5°).
  it('genou : pas de pied botté en arrière à la marche, jamais plus plié que le pantin ailleurs', async () => {
    for (const name of NAMES) {
      const m = await model(name);
      const map = boneMap(m.body.skeleton);
      const bone = (n: string): THREE.Vector3 => m.body.skeleton.bones.find((b) => b.name.replace(/^mixamorig:?/, '') === n)!.getWorldPosition(new THREE.Vector3());
      const H = m.A.H, legP = LIMB.thigh + LIMB.shin + LIMB.ankle;
      const legR = map.rest.thigh.Left + map.rest.shin.Left + map.rest.ankleY;
      for (const g of GAITS)
        for (let y = 0; y < 16; y++)
          for (let ph = 0; ph < 12; ph++) {
            const p = poseOf((y * Math.PI) / 8, (ph * Math.PI) / 6, g);
            applyPose(m.rig, map, p, H / 40, g);
            m.rig.updateMatrixWorld(true);
            const walk = g === 'walk' || g === 'step';
            // Plus haut levé du pied libre du pantin sur tout le cycle à cette orientation (longueurs de jambe).
            let liftMax = 0;
            if (walk)
              for (let q = 0; q < 12; q++) {
                const pq = poseOf((y * Math.PI) / 8, (q * Math.PI) / 6, g), lo = Math.min(...pq.legs.map((l) => l.ankle[1]));
                for (const l of pq.legs) liftMax = Math.max(liftMax, (l.ankle[1] - lo) / legP);
              }
            const f = Math.abs(Math.sin((y * Math.PI) / 8));
            const F = new THREE.Vector3(p.fr.F[0], 0, p.fr.F[2]);
            for (const leg of p.legs) {
              const s = leg.l < 0 ? 'Left' : 'Right';
              const kp = (v(leg.knee).sub(v(leg.hip)).angleTo(v(leg.ankle).sub(v(leg.knee))) * 180) / Math.PI;
              const k3 = (bone(`${s}Leg`).sub(bone(`${s}UpLeg`)).angleTo(bone(`${s}Foot`).sub(bone(`${s}Leg`))) * 180) / Math.PI;
              if (!walk) { expect(k3, `${name} ${g} y${y} p${ph} ${s}`).toBeLessThan(kp + 5); continue; }
              // Tibia dans le plan de marche : angle derrière la verticale.
              const shin = bone(`${s}Foot`).sub(bone(`${s}Leg`));
              const back = (Math.atan2(-shin.dot(F), -shin.y) * 180) / Math.PI;
              expect(back, `${name} ${g} y${y} p${ph} ${s} tibia`).toBeLessThan(50 + 18 * f ** 3 + 3);
              const lift3 = (bone(`${s}Foot`).y - Math.min(bone('LeftFoot').y, bone('RightFoot').y)) / legR;
              expect(lift3, `${name} ${g} y${y} p${ph} ${s} pied`).toBeLessThan(liftMax + 0.03);
            }
          }
    }
  });
});
