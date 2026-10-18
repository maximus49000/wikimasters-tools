// Habitants 3D : le pantin pilote les os Mixamo. Chaque segment du corps synthétique suit la direction du segment du
// pantin (moins de 3°), genoux et coudes plient du bon côté, gauche et droite ne sont pas inversées, pieds au sol.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyPose, boneMap } from '../../../src/core/citizens/retarget';
import { PERCH, poseOf, type ArmPose, type Gait, type Pose } from '../../../src/core/library/figure/skeleton';
import type { V3 } from '../../../src/core/library/figure/geometry';
import { makeHumanoid } from './fixtures/humanoid';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const GAITS: Gait[] = ['stand', 'step', 'walk', 'seated', 'climb', 'pedal', 'mount', 'crouch', 'perch'];
const ARMS: ArmPose[] = ['swing', 'pay-card', 'pour', 'scissors-1', 'hold-child', 'handlebar', 'overhead'];
// Indices comme le cuiseur des sprites : 16 orientations, 12 phases.
const yawOf = (i: number): number => (i * Math.PI) / 8;
const phaseOf = (i: number): number => (i * 2 * Math.PI) / 12;
// Hauteur du corps synthétique au bassin / hauteur du bassin du pantin debout (jambe tendue + cheville).
const U = 0.9 / 16.4;
// Hauteur de cheville du corps synthétique au repos (os Foot).
const ANKLE = 0.08;

const v = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);
const deg = (a: THREE.Vector3, b: THREE.Vector3): number => (a.angleTo(b) * 180) / Math.PI;

function rig(): { mesh: THREE.SkinnedMesh; map: ReturnType<typeof boneMap>; at: (n: string) => THREE.Vector3 } {
  const mesh = makeHumanoid();
  const map = boneMap(mesh.skeleton);
  const at = (n: string): THREE.Vector3 => {
    const b = mesh.skeleton.bones.find((x) => x.name === `mixamorig${n}`)!;
    return b.getWorldPosition(new THREE.Vector3());
  };
  return { mesh, map, at };
}

// Segments [os de départ, os d'arrivée] du rig ↔ segment du pantin.
function segments(p: Pose): [string, string, THREE.Vector3, THREE.Vector3][] {
  const out: [string, string, THREE.Vector3, THREE.Vector3][] = [];
  for (const leg of p.legs) {
    const s = leg.l < 0 ? 'Left' : 'Right';
    out.push([`${s}UpLeg`, `${s}Leg`, v(leg.hip), v(leg.knee)]);
    out.push([`${s}Leg`, `${s}Foot`, v(leg.knee), v(leg.ankle)]);
    out.push([`${s}Foot`, `${s}ToeBase`, v(leg.ankle), v(leg.toe)]);
  }
  for (const arm of p.arms) {
    const s = arm.l < 0 ? 'Left' : 'Right';
    out.push([`${s}Arm`, `${s}ForeArm`, v(arm.sh), v(arm.elb)]);
    out.push([`${s}ForeArm`, `${s}Hand`, v(arm.elb), v(arm.hand)]);
  }
  out.push(['Neck', 'Head', v(p.neck), v(p.head)]);
  return out;
}

describe('applyPose', () => {
  it('chaque segment du rig suit le segment du pantin à moins de 3°', () => {
    const { mesh, map, at } = rig();
    let worst = 0;
    let where = '';
    for (const g of GAITS)
      for (const a of ARMS)
        for (const y of [0, 4, 8, 12])
          for (const ph of [0, 3, 6, 9]) {
            const p = poseOf(yawOf(y), phaseOf(ph), g, { arms: a });
            applyPose(mesh, map, p, U, g);
            mesh.updateMatrixWorld(true);
            for (const [b0, b1, p0, p1] of segments(p)) {
              const d = deg(at(b1).sub(at(b0)), p1.clone().sub(p0));
              if (d > worst) { worst = d; where = `${g} ${a} yaw ${y} phase ${ph} ${b0}`; }
            }
          }
    expect(worst, where).toBeLessThan(3);
  });

  it('la tête suit le repère de tête du pantin (tourne avec headYaw)', () => {
    const { mesh, map } = rig();
    const head = mesh.skeleton.bones.find((x) => x.name === 'mixamorigHead')!;
    for (const y of [0, 4, 8, 12]) {
      const p = poseOf(yawOf(y), 0, 'stand', { headYaw: 0.6 });
      applyPose(mesh, map, p, U);
      mesh.updateMatrixWorld(true);
      // Devant de la tête au repos = +z.
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
      expect(deg(f, v(p.headFrame.F))).toBeLessThan(1);
      const u = new THREE.Vector3(0, 1, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
      expect(deg(u, v(p.headFrame.U))).toBeLessThan(1);
    }
  });

  it('genoux et coudes plient du même côté que ceux du pantin (vrille des os comprise)', () => {
    const { mesh, map, at } = rig();
    const bone = (n: string): THREE.Bone => mesh.skeleton.bones.find((x) => x.name === `mixamorig${n}`)!;
    // Rotations du monde au repos : on y lit le devant du genou (+z) et l'arrière du coude (−z) de la pose de liaison.
    mesh.updateMatrixWorld(true);
    const rest = new Map(mesh.skeleton.bones.map((b) => [b.name, b.getWorldQuaternion(new THREE.Quaternion()).invert()]));
    const axis = (n: string, a: THREE.Vector3): THREE.Vector3 =>
      a.clone().applyQuaternion(rest.get(`mixamorig${n}`)!).applyQuaternion(bone(n).getWorldQuaternion(new THREE.Quaternion()));
    // Écart de l'articulation du milieu à la droite début–fin.
    const off = (h: THREE.Vector3, k: THREE.Vector3, a: THREE.Vector3): THREE.Vector3 => {
      const d = a.clone().sub(h).normalize();
      const hk = k.clone().sub(h);
      return hk.sub(d.multiplyScalar(hk.dot(d)));
    };
    // L'axe de flexion de l'os est dans le plan début–milieu–fin du pantin, du côté où part l'articulation du milieu.
    const inPlane = (ax: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, pp: THREE.Vector3, msg: string): void => {
      const n = b.clone().sub(a).cross(c.clone().sub(b)).normalize();
      expect(Math.abs(ax.dot(n)), msg).toBeLessThan(0.05);
      expect(ax.dot(pp), msg).toBeGreaterThan(0);
    };
    let checked = 0;
    for (const g of ['walk', 'crouch', 'pedal', 'seated', 'climb'] as Gait[])
      for (const a of ['swing', 'pay-card', 'pour', 'overhead'] as ArmPose[])
        for (const y of [0, 2, 4, 6, 8, 12])
          for (let ph = 0; ph < 12; ph++) {
            const p = poseOf(yawOf(y), phaseOf(ph), g, { arms: a });
            applyPose(mesh, map, p, U);
            mesh.updateMatrixWorld(true);
            for (const leg of p.legs) {
              const s = leg.l < 0 ? 'Left' : 'Right';
              const pp = off(v(leg.hip), v(leg.knee), v(leg.ankle));
              if (pp.length() < 0.3) continue; // jambe presque tendue : pas de côté lisible
              // Position du genou (suit déjà la cuisse) puis vrille : le devant du genou de l'os vise le genou du pantin.
              const rr = off(at(`${s}UpLeg`), at(`${s}Leg`), at(`${s}Foot`));
              expect(rr.dot(pp), `${g} yaw ${y} phase ${ph} ${s}`).toBeGreaterThan(0);
              for (const n of [`${s}UpLeg`, `${s}Leg`]) inPlane(axis(n, new THREE.Vector3(0, 0, 1)), v(leg.hip), v(leg.knee), v(leg.ankle), pp, `${g} yaw ${y} phase ${ph} ${n}`);
              checked++;
            }
            for (const arm of p.arms) {
              const s = arm.l < 0 ? 'Left' : 'Right';
              const pp = off(v(arm.sh), v(arm.elb), v(arm.hand));
              if (pp.length() < 0.3) continue;
              for (const n of [`${s}Arm`, `${s}ForeArm`]) inPlane(axis(n, new THREE.Vector3(0, 0, -1)), v(arm.sh), v(arm.elb), v(arm.hand), pp, `${g} ${a} yaw ${y} phase ${ph} ${n}`);
              checked++;
            }
          }
    expect(checked).toBeGreaterThan(1000);
  });

  it('le bras gauche du rig suit le bras gauche du pantin (pas de miroir)', () => {
    const { mesh, map, at } = rig();
    // Face au spectateur (yaw π/2) : la gauche du corps est à droite de l'écran (+x) ; « montrer » lève le bras droit devant.
    const p = poseOf(Math.PI / 2, 0, 'stand', { arms: 'point' });
    applyPose(mesh, map, p, U);
    mesh.updateMatrixWorld(true);
    const left = p.arms.find((a) => a.l < 0)!, right = p.arms.find((a) => a.l > 0)!;
    expect(left.hand[0]).toBeGreaterThan(0);
    expect(at('LeftHand').x).toBeGreaterThan(0);
    expect(at('RightHand').x).toBeLessThan(0);
    // Bras droit tendu vers le spectateur, chez le pantin comme chez le rig.
    expect(right.hand[2]).toBeGreaterThan(left.hand[2] + 5);
    expect(at('RightHand').z).toBeGreaterThan(at('LeftHand').z + 0.2);
    // Même chose pour les jambes : la jambe gauche du pantin (l < 0) est côté +x de face.
    expect(p.legs.find((l) => l.l < 0)!.hip[0]).toBeGreaterThan(0);
    expect(at('LeftUpLeg').x).toBeGreaterThan(0);
  });

  it('pieds au sol selon l allure : cheville d appui du rig à sa hauteur de repos', () => {
    const { mesh, map, at } = rig();
    for (const g of ['stand', 'step', 'walk', 'crouch'] as Gait[])
      for (let ph = 0; ph < 12; ph++) {
        applyPose(mesh, map, poseOf(yawOf(4), phaseOf(ph), g), U, g);
        mesh.updateMatrixWorld(true);
        const low = Math.min(at('LeftFoot').y, at('RightFoot').y);
        expect(Math.abs(low - ANKLE), `${g} ${ph}`).toBeLessThan(1e-6);
      }
    // Vélo arrêté : le pied posé (cheville la plus basse) sur le sol sous les roues.
    for (const y of [0, 4, 8, 12]) {
      applyPose(mesh, map, poseOf(yawOf(y), 0, 'perch', { arms: 'handlebar' }), U, 'perch');
      mesh.updateMatrixWorld(true);
      const low = Math.min(at('LeftFoot').y, at('RightFoot').y);
      expect(Math.abs(low - (PERCH.groundY * U + ANKLE)), `perch ${y}`).toBeLessThan(1e-6);
    }
  });

  it('assis, en selle, sur l échelle ou sans allure : le bassin fait foi', () => {
    const { mesh, map, at } = rig();
    for (const g of ['seated', 'climb', 'pedal', 'mount', 'walk'] as Gait[]) {
      const p = poseOf(yawOf(4), phaseOf(3), g);
      applyPose(mesh, map, p, U, g === 'walk' ? undefined : g);
      mesh.updateMatrixWorld(true);
      const mid = at('LeftUpLeg').add(at('RightUpLeg')).multiplyScalar(0.5);
      expect(mid.distanceTo(v(p.pelvis).multiplyScalar(U)), g).toBeLessThan(1e-6);
    }
  });

  it('sur l échelle, la hauteur du bassin suit le pantin sans à-coup', () => {
    const { mesh, map, at } = rig();
    const gaps: number[] = [];
    for (let ph = 0; ph < 12; ph++) {
      const p = poseOf(yawOf(12), phaseOf(ph), 'climb');
      applyPose(mesh, map, p, U, 'climb');
      mesh.updateMatrixWorld(true);
      gaps.push(at('Hips').y - p.pelvis[1] * U);
    }
    for (const g of gaps) expect(Math.abs(g - gaps[0]!)).toBeLessThan(1e-6);
  });

  it('boneMap lit la pose de liaison : même résultat après un applyPose', () => {
    const { mesh, map, at } = rig();
    const names = ['Hips', 'Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightToeBase'];
    const p = poseOf(yawOf(5), phaseOf(7), 'walk', { arms: 'pour', headYaw: 0.4 });
    applyPose(mesh, map, p, U, 'walk');
    mesh.updateMatrixWorld(true);
    const before = names.map((n) => at(n));
    applyPose(mesh, map, poseOf(yawOf(9), phaseOf(2), 'crouch', { arms: 'overhead' }), U, 'crouch');
    const later = boneMap(mesh.skeleton);
    applyPose(mesh, later, p, U, 'walk');
    mesh.updateMatrixWorld(true);
    names.forEach((n, i) => expect(at(n).distanceTo(before[i]!), n).toBeLessThan(1e-9));
  });

  it('marche aussi sous un nœud « Armature » tourné et mis à l échelle', () => {
    const { mesh, map, at } = rig();
    const hips = mesh.skeleton.bones[0]!;
    // Armature : rotation de 90° autour de x, échelle 0,01 ; l'os Hips compense (centimètres).
    const arm = new THREE.Group();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    arm.quaternion.copy(q);
    arm.scale.setScalar(0.01);
    mesh.add(arm);
    arm.add(hips);
    const qi = q.clone().invert();
    hips.position.applyQuaternion(qi).multiplyScalar(100);
    hips.quaternion.premultiply(qi);
    hips.scale.setScalar(100);
    const map2 = boneMap(mesh.skeleton);
    expect(map2).not.toBe(map);
    const p = poseOf(yawOf(3), phaseOf(2), 'walk', { arms: 'pour' });
    applyPose(mesh, map2, p, U, 'walk');
    mesh.updateMatrixWorld(true);
    for (const [b0, b1, p0, p1] of segments(p)) expect(deg(at(b1).sub(at(b0)), p1.clone().sub(p0)), b0).toBeLessThan(3);
    const low = Math.min(at('LeftFoot').y, at('RightFoot').y);
    expect(low).toBeCloseTo(ANKLE, 6);
  });

  it('accepte les noms « mixamorig:Hips » et sans préfixe', () => {
    for (const prefix of ['mixamorig:', '']) {
      const mesh = makeHumanoid({ prefix });
      const map = boneMap(mesh.skeleton);
      applyPose(mesh, map, poseOf(1, 1, 'walk'), U);
    }
    const bad = makeHumanoid();
    bad.skeleton.bones.find((b) => b.name === 'mixamorigLeftForeArm')!.name = 'x';
    expect(() => boneMap(bad.skeleton)).toThrow(/LeftForeArm/);
  });

  // Les vrais modèles ne sont pas droits au repos (cou ≈ 6° en arrière du bassin) : le buste penchait en arrière.
  it('vrais modèles : la ligne Hips → Neck suit pelvis → neck du pantin à moins de 3°', async () => {
    for (const name of ['homme-fort', 'femme-frele', 'enfant']) {
      const buf = readFileSync(resolve(__dirname, `../../../relay/public/persos/${name}.glb`));
      const gltf = await new Promise<{ scene: THREE.Group }>((ok, ko) =>
        new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', ok, ko));
      let body: THREE.SkinnedMesh | null = null;
      gltf.scene.traverse((o) => { if (!body && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh; });
      const mesh = body as unknown as THREE.SkinnedMesh;
      const rigObj = mesh.parent!;
      const map = boneMap(mesh.skeleton);
      const w = (b: THREE.Object3D): THREE.Vector3 => b.getWorldPosition(new THREE.Vector3());
      let worst = 0;
      let where = '';
      for (const g of ['walk', 'stand'] as const)
        for (let y = 0; y < 16; y += 2)
          for (let ph = 0; ph < 12; ph++)
            for (const lean of [0, 2]) {
              const p = poseOf(yawOf(y), phaseOf(ph), g, { lean });
              applyPose(rigObj, map, p, 0.02, g);
              gltf.scene.updateMatrixWorld(true);
              const d = deg(w(map.bones.Neck).sub(w(map.bones.Hips)), v(p.neck).sub(v(p.pelvis)));
              if (d > worst) { worst = d; where = `${name} ${g} yaw ${y} phase ${ph} lean ${lean}`; }
            }
      expect(worst, where).toBeLessThan(3);
    }
  });
});
