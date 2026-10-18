// Audit des tenues (2026-10-18) : visière de casquette devant, bretelles de sac à dos qui passent sous l'aisselle, pas
// de cheveux au-dessus de la lisière d'un couvre-chef, couches dans l'ordre, doublure aux ouvertures. Vrai modèle.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Piece } from '../../../src/core/citizens/catalogue';
import { analyse, dressRig, skull, type BodyInfo } from '../../../src/core/citizens/wardrobe';
import { BONNET_BAND } from '../../../src/core/citizens/wardrobe/hair';

const persos = resolve(__dirname, '../../../relay/public/persos');
const manifest = JSON.parse(readFileSync(resolve(persos, 'manifest.json'), 'utf8')) as { bases: Record<string, { glb: string }> };

async function base(name: string): Promise<BodyInfo> {
  const buf = readFileSync(resolve(persos, manifest.bases[name]!.glb));
  const gltf = await new Promise<{ scene: THREE.Group }>((ok, ko) =>
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', ok, ko));
  let body: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((o) => { if (!body && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh; });
  return analyse(body as unknown as THREE.SkinnedMesh);
}
const pts = (m: THREE.Object3D): THREE.Vector3[] => {
  const P = (m as THREE.Mesh).geometry.attributes.position!;
  return Array.from({ length: P.count }, (_, i) => new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)));
};

describe('audit des tenues', () => {
  it('casquette : la visière part devant le front, pas dans la tête', async () => {
    const A = await base('homme-maigre');
    const [, visor] = dressRig(A, [{ k: 'cap', color: '#C03030', visor: '#FFFFFF' }], '#C68642');
    const S = A.skull ?? skull(A);
    const z = pts(visor!).map((p) => p.z - S.c.z);
    expect(Math.min(...z)).toBeGreaterThan(0.3 * S.size);
    expect(Math.max(...z)).toBeGreaterThan(0.9 * S.size);
  });

  it('sac à dos : chaque bretelle passe sous l’aisselle et revient au bas du sac', async () => {
    const A = await base('femme-forte');
    const ms = dressRig(A, [{ k: 'accessory', what: 'sac-a-dos', color: '#4A7' }], '#C68642');
    const straps = ms.slice(-2);
    for (const [i, st] of straps.entries()) {
      const s = i === 0 ? 1 : -1, P = pts(st);
      // Sous l'aisselle : des points du côté du flanc, plus loin de l'axe que la bretelle au-dessus de l'épaule.
      const armY = A.J.LeftArm.y - 0.075 * A.H;
      const flank = P.filter((p) => Math.abs(p.y - armY) < 0.03 * A.H).map((p) => (p.x - A.J.Spine2.x) * s);
      expect(Math.max(...flank)).toBeGreaterThan(Math.abs(A.J.LeftArm.x - A.J.Spine2.x) * 0.8);
      // Plus de bout de bretelle libre au milieu de la poitrine : le point le plus bas est dans le dos.
      const low = P.reduce((a, b) => (b.y < a.y ? b : a));
      expect(low.z).toBeLessThan(A.J.Spine2.z);
    }
  });

  it('bonnet : pas de cheveux au-dessus de la lisière (frisé, afro, chignon sans boule)', async () => {
    const A = await base('homme-maigre');
    const S = A.skull ?? skull(A);
    for (const style of ['frise', 'afro', 'chignon', 'raie']) {
      const ms = dressRig(A, [{ k: 'hair', style, color: '#111' }, { k: 'bonnet', color: '#C03030' }], '#C68642');
      const hairMs = ms.slice(0, -2);
      if (style === 'chignon') expect(hairMs).toHaveLength(1);
      for (const m of hairMs)
        for (const p of pts(m)) {
          const d = p.clone().sub(S.c), el = Math.asin(d.y / d.length()), az = Math.atan2(d.x, d.z);
          // Tolérance : la surface déformée s'écarte un peu de son paramètre ; 0,12 rad au-dessus de la lisière au plus.
          expect(el, style).toBeLessThan(BONNET_BAND(az) + 0.12);
        }
    }
  });

  it('couches : le décalage de profondeur croît du corps vers l’extérieur (haut < jupe < pan de manteau < gilet)', async () => {
    const A = await base('femme-forte');
    const pieces: Piece[] = [
      { k: 'top', sleeve: 0.45, color: '#111111' }, { k: 'skirt', len: 0.9, flare: 0.3, color: '#222222' },
      { k: 'skirt', len: 0.85, flare: 0.15, off: 0.024, color: '#333333' }, { k: 'gilet', color: '#444444' },
    ];
    const ms = dressRig(A, pieces, '#C68642') as THREE.Mesh[];
    const f = ms.map((m) => (m.material as THREE.Material).polygonOffsetFactor);
    for (let i = 1; i < f.length; i++) expect(f[i]!).toBeLessThan(f[i - 1]!);
    // Le pan de manteau (construit après la jupe longue) passe par-dessus elle à toute hauteur.
    const r = (m: THREE.Mesh, y0: number, y1: number): number =>
      Math.max(...pts(m).filter((p) => p.y > y0 && p.y < y1).map((p) => Math.hypot(p.x - A.J.Hips.x, p.z - A.J.Hips.z)));
    for (let y = A.J.LeftUpLeg.y; y > A.J.LeftLeg.y; y -= 0.03 * A.H) expect(r(ms[2]!, y - 0.01, y + 0.01)).toBeGreaterThan(r(ms[1]!, y - 0.01, y + 0.01));
  });

  it('haut : doublure aux ouvertures (triangles retournés près des bords seulement)', async () => {
    const A = await base('homme-fort');
    const [top] = dressRig(A, [{ k: 'top', sleeve: 0.45, color: '#111111' }], '#C68642') as THREE.Mesh[];
    const g = top!.geometry, N = g.attributes.normal!, P = g.attributes.position!;
    // Normales tournées vers l'axe du corps (doublure) : présentes, mais minoritaires.
    let inward = 0;
    for (let i = 0; i < P.count; i++) {
      const out = new THREE.Vector3(P.getX(i) - A.J.Spine2.x, 0, P.getZ(i) - A.J.Spine2.z);
      if (Math.abs(P.getX(i)) < Math.abs(A.J.LeftArm.x) && out.dot(new THREE.Vector3(N.getX(i), 0, N.getZ(i))) < 0) inward++;
    }
    expect(inward).toBeGreaterThan(30);
    expect(inward / P.count).toBeLessThan(0.4);
  });
});
