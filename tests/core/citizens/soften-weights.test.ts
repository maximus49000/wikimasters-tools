// Poids de peau adoucis (softenWeights) : le calcul dense (tableaux typés, retour de revue du 2026-10-18) donne les mêmes
// poids que l'ancien calcul par Map (gardé ici comme référence), sur le pantin d'essai et sur un vrai modèle ; une même coupe
// sur une même base n'est lissée qu'une fois (cache par géométrie de base).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { analyse, type BodyInfo } from '../../../src/core/citizens/wardrobe';
import { aT, garments, shell, softenWeights, SOFT } from '../../../src/core/citizens/wardrobe/shell';
import { makeHumanoid } from './fixtures/humanoid';

// Ancien calcul (avant la revue), tel quel.
function softenOld(pos: number[], si: number[], sw: number[], ind: number[], iters: number): void {
  const n = pos.length / 3, key = new Map<string, number>(), grp = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3]! * 1e4)},${Math.round(pos[i * 3 + 1]! * 1e4)},${Math.round(pos[i * 3 + 2]! * 1e4)}`;
    let g = key.get(k);
    if (g === undefined) { g = key.size; key.set(k, g); }
    grp[i] = g;
  }
  const G = key.size, nb = Array.from({ length: G }, () => new Set<number>()), rep = new Int32Array(G).fill(-1);
  for (let i = 0; i < n; i++) if (rep[grp[i]!]! < 0) rep[grp[i]!] = i;
  for (let k = 0; k < ind.length; k += 3) {
    const a = grp[ind[k]!]!, b = grp[ind[k + 1]!]!, c = grp[ind[k + 2]!]!;
    nb[a]!.add(b).add(c); nb[b]!.add(a).add(c); nb[c]!.add(a).add(b);
  }
  let W: Map<number, number>[] = Array.from({ length: G }, (_, g) => {
    const m = new Map<number, number>(), i = rep[g]!;
    for (let k = 0; k < 4; k++) { const w = sw[i * 4 + k]!; if (w > 0) m.set(si[i * 4 + k]!, (m.get(si[i * 4 + k]!) ?? 0) + w); }
    return m;
  });
  for (let it = 0; it < iters; it++) {
    W = W.map((m, g) => {
      const L = nb[g]!;
      if (!L.size) return m;
      const o = new Map<number, number>();
      for (const [b, w] of m) o.set(b, w * 0.5);
      for (const j of L) for (const [b, w] of W[j]!) o.set(b, (o.get(b) ?? 0) + (w * 0.5) / L.size);
      return o;
    });
  }
  for (let i = 0; i < n; i++) {
    const best = [...W[grp[i]!]!].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = best.reduce((t, [, w]) => t + w, 0) || 1;
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = best[k]?.[0] ?? 0; sw[i * 4 + k] = (best[k]?.[1] ?? 0) / sum; }
  }
}

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

// Entrées d'un haut à manches (coque drapée sans lissage ni doublure) : positions, os, poids, triangles.
function topInputs(A: BodyInfo): { pos: number[]; si: number[]; sw: number[]; ind: number[] } {
  const hemY = A.waistY - 0.065 * A.H;
  const m = shell(A, (v) => Math.min(v.y - hemY, (0.45 - aT(v)) * 0.2, v.part === 'head' ? -1 : 1), 0.008, '#C0463A', { drape: true });
  const g = m.geometry;
  return { pos: [...(g.attributes.position!.array as Float32Array)], si: [...(g.attributes.skinIndex!.array as Uint16Array)], sw: [...(g.attributes.skinWeight!.array as Float32Array)], ind: [...g.index!.array] };
}
// Poids par os de chaque sommet (même résultat quel que soit l'ordre des 4 places).
const perBone = (si: number[], sw: number[], i: number): Map<number, number> => {
  const m = new Map<number, number>();
  for (let k = 0; k < 4; k++) if (sw[i * 4 + k]! > 0) m.set(si[i * 4 + k]!, (m.get(si[i * 4 + k]!) ?? 0) + sw[i * 4 + k]!);
  return m;
};
function compare(A: BodyInfo, label: string): void {
  const x = topInputs(A);
  const a = { si: [...x.si], sw: [...x.sw] }, b = { si: [...x.si], sw: [...x.sw] };
  let t = performance.now();
  softenOld(x.pos, a.si, a.sw, x.ind, SOFT);
  const tOld = performance.now() - t;
  t = performance.now();
  softenWeights(x.pos, b.si, b.sw, x.ind, SOFT);
  const tNew = performance.now() - t;
  console.log(`[softenWeights] ${label} : ${x.pos.length / 3} sommets, avant ${tOld.toFixed(1)} ms, après ${tNew.toFixed(1)} ms`);
  let worst = 0;
  for (let i = 0; i < x.pos.length / 3; i++) {
    const ma = perBone(a.si, a.sw, i), mb = perBone(b.si, b.sw, i);
    for (const k of new Set([...ma.keys(), ...mb.keys()])) worst = Math.max(worst, Math.abs((ma.get(k) ?? 0) - (mb.get(k) ?? 0)));
  }
  expect(worst).toBeLessThan(1e-5);
}

describe('softenWeights (calcul dense)', () => {
  it('pantin d’essai : mêmes poids que l’ancien calcul (1e-5 près)', () => {
    compare(analyse(makeHumanoid()), 'pantin');
  });
  it('vrai modèle (homme-maigre, mamie) : mêmes poids que l’ancien calcul (1e-5 près)', async () => {
    compare(await base('homme-maigre'), 'homme-maigre');
    compare(await base('mamie'), 'mamie');
  });
  it('même coupe sur la même base : lissée une fois (cache), quelle que soit la couleur ; mêmes poids', async () => {
    const A = await base('homme-maigre');
    let t = performance.now();
    const m1 = garments.top(A, { color: '#C0463A' });
    const first = performance.now() - t;
    t = performance.now();
    const m2 = garments.top(A, { color: '#2E8B6A', pattern: null });
    const second = performance.now() - t;
    console.log(`[softenWeights] haut homme-maigre : 1er habillage ${first.toFixed(1)} ms, 2e (autre couleur) ${second.toFixed(1)} ms`);
    expect([...m2.geometry.attributes.skinWeight!.array]).toEqual([...m1.geometry.attributes.skinWeight!.array]);
    expect([...m2.geometry.attributes.skinIndex!.array]).toEqual([...m1.geometry.attributes.skinIndex!.array]);
    // Autre coupe (manches courtes) : pas le résultat de la première.
    const m3 = garments.top(A, { color: '#C0463A', sleeve: 0.15 });
    expect(m3.geometry.attributes.skinWeight!.count).not.toBe(m1.geometry.attributes.skinWeight!.count);
  });
});
