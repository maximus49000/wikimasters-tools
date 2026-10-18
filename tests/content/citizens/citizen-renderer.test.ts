// Rendu hors écran des habitants 3D : sans WebGL (node), un rendu simulé reçoit la scène ; on vérifie l'attente du
// modèle, le cadrage (pieds à l'origine du sprite, élévation 12°), l'échelle, les accroches et la réserve de 48 rigs.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BaseModel } from '../../../src/content/citizens/model-cache';
import { CitizenRenderer, rigHeight, spriteCamera, spritePixel, type RendererLike } from '../../../src/content/citizens/citizen-renderer';
import { SPRITE_BOX } from '../../../src/content/figure/figure-host';
import { citizen, type CitizenDesc } from '../../../src/core/citizens/catalogue';
import { dressRig, disposeRig } from '../../../src/core/citizens/wardrobe';
import { anchorsOf, type FigureKey } from '../../../src/core/library/figure/bake';
import { CAM_CA, CAM_SA } from '../../../src/core/library/figure/geometry';
import { ManifestSchema } from '../../../src/core/citizens/manifest';
import { makeHumanoid } from '../../core/citizens/fixtures/humanoid';

// Espions sur l'habillage et sa libération (le reste du module est d'origine).
vi.mock('../../../src/core/citizens/wardrobe', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../../src/core/citizens/wardrobe')>();
  return { ...m, dressRig: vi.fn(m.dressRig), disposeRig: vi.fn(m.disposeRig) };
});

const MANIFEST = ManifestSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../relay/public/persos/manifest.json'), 'utf-8')));

// Base simulée : le corps synthétique dans un groupe (comme la scène d'un GLB), petite texture, repères du vrai manifeste.
function fakeBase(name: string): BaseModel {
  const body = makeHumanoid();
  const scene = new THREE.Group();
  scene.add(body);
  const texture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(200), 4, 4);
  const child = name === 'enfant';
  return { name, scene, body, texture, metres: child ? 1.25 : 1.7, child, aged: false, face: MANIFEST.bases[child ? 'enfant' : 'homme-fort']!.face };
}

type Fake = RendererLike & { calls: THREE.Scene[] };
function fakeRenderer(): Fake {
  const calls: THREE.Scene[] = [];
  return {
    calls,
    setSize: vi.fn(),
    render: (scene: THREE.Scene) => { calls.push(scene); },
    domElement: { toDataURL: () => 'data:image/png;base64,FAUX' },
    dispose: vi.fn(),
  };
}

const KEY: FigureKey = { sig: 'short.tee.pants.none.n.n', yaw: 4, gait: 'stand', phase: 0, head: 0, arms: 'swing', lean: 0 };
const desc = (over: Partial<CitizenDesc> = {}): CitizenDesc => ({ ...citizen(7), base: 'homme-fort', height: 1.7, ...over });

async function readyRenderer(d: CitizenDesc, opts: { px?: number; fake?: Fake } = {}): Promise<{ r: CitizenRenderer; fake: Fake }> {
  const fake = opts.fake ?? fakeRenderer();
  const r = new CitizenRenderer({ pxPerUnit: opts.px ?? 3, makeRenderer: () => fake, loadBase: async (n) => fakeBase(n) });
  r.prepare(d);
  await vi.waitFor(() => expect(r.ready(d)).toBe(true));
  return { r, fake };
}

beforeEach(() => {
  vi.mocked(dressRig).mockClear();
  vi.mocked(disposeRig).mockClear();
});

describe('CitizenRenderer', () => {
  it('rend null tant que le modèle n’est pas prêt', async () => {
    let release: (b: BaseModel) => void = () => {};
    const r = new CitizenRenderer({ pxPerUnit: 3, makeRenderer: fakeRenderer, loadBase: () => new Promise((ok) => { release = ok; }) });
    const d = desc();
    expect(r.ready(d)).toBe(false);
    expect(r.render(d, KEY, 1, '')).toBeNull();
    r.prepare(d);
    r.prepare(d); // idempotent
    expect(r.render(d, KEY, 1, '')).toBeNull();
    release(fakeBase('homme-fort'));
    await vi.waitFor(() => expect(r.ready(d)).toBe(true));
    const out = r.render(d, KEY, 1, '');
    expect(out?.url).toBe('data:image/png;base64,FAUX');
  });

  it('sans WebGL (création du rendu en échec) : null, sans exception', async () => {
    const d = desc();
    const r = new CitizenRenderer({ pxPerUnit: 3, makeRenderer: () => { throw new Error('pas de WebGL'); }, loadBase: async (n) => fakeBase(n) });
    r.prepare(d);
    await vi.waitFor(() => expect(r.ready(d)).toBe(true));
    expect(r.render(d, KEY, 1, '')).toBeNull();
  });

  it('base introuvable : pas prête, pas de nouvelle tentative à chaque image', async () => {
    const load = vi.fn(async () => null);
    const r = new CitizenRenderer({ pxPerUnit: 3, makeRenderer: fakeRenderer, loadBase: load });
    const d = desc();
    r.prepare(d);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await new Promise((ok) => setTimeout(ok, 0));
    for (let i = 0; i < 5; i++) expect(r.render(d, KEY, 1, '')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(r.ready(d)).toBe(false);
  });

  it('caméra : (0, 0, 0) tombe à (−x0·px, −y0·px) du canvas, élévation 12°', () => {
    const cam = spriteCamera();
    const px = 3;
    const [x, y] = spritePixel(cam, new THREE.Vector3(0, 0, 0), px);
    expect(x).toBeCloseTo(-SPRITE_BOX.x0 * px, 6);
    expect(y).toBeCloseTo(-SPRITE_BOX.y0 * px, 6);
    // Même projection que le pantin 2D : écran y = −(y·cos − z·sin).
    const p = new THREE.Vector3(3, 10, 5);
    const [x2, y2] = spritePixel(cam, p, px);
    expect(x2).toBeCloseTo((3 - SPRITE_BOX.x0) * px, 6);
    expect(y2).toBeCloseTo((-(10 * CAM_CA - 5 * CAM_SA) - SPRITE_BOX.y0) * px, 6);
  });

  it('canvas de SPRITE_BOX.w·px × SPRITE_BOX.h·px', async () => {
    const d = desc();
    const { r, fake } = await readyRenderer(d, { px: 2 });
    r.render(d, KEY, 1, '');
    expect(fake.setSize).toHaveBeenCalledWith(SPRITE_BOX.w * 2, SPRITE_BOX.h * 2);
  });

  it('échelle : adulte 37,5 × mètres / 1,70, enfant 37,5', async () => {
    expect(rigHeight(1.7, false)).toBeCloseTo(37.5);
    expect(rigHeight(1.87, false)).toBeCloseTo(41.25);
    expect(rigHeight(1.25, true)).toBeCloseTo(37.5);
    // Debout de face : le haut de la tête à ≈ la hauteur voulue au-dessus des pieds (à 4 % près : la pose du pantin
    // penche un peu le cou, et le pied posé n'est pas exactement au repos).
    const kid = desc({ base: 'enfant', height: 1.2 });
    const { r } = await readyRenderer(kid);
    const near = (v: number, want: number): void => expect(Math.abs(v / want - 1)).toBeLessThan(0.04);
    near(-r.render(kid, KEY, 1, '')!.anchors.headTop[1], 37.5);
    const tall = desc({ height: 1.87 });
    r.prepare(tall);
    await vi.waitFor(() => expect(r.ready(tall)).toBe(true));
    near(-r.render(tall, KEY, 1, '')!.anchors.headTop[1], 41.25);
  });

  it('accroches : main droite du bon côté et près de celle du pantin 2D ; mains = milieu', async () => {
    const d = desc();
    const { r } = await readyRenderer(d);
    for (const yaw of [0, 4, 8]) {
      const key = { ...KEY, yaw, gait: 'walk' as const, phase: 3 };
      const a = r.render(d, key, 1, '')!.anchors;
      const b = anchorsOf(key);
      expect(Math.hypot(a.handR[0] - b.handR[0], a.handR[1] - b.handR[1]), `yaw ${yaw}`).toBeLessThan(4);
      expect(Math.hypot(a.handL[0] - b.handL[0], a.handL[1] - b.handL[1]), `yaw ${yaw}`).toBeLessThan(4);
      expect(a.hands[0]).toBeCloseTo((a.handR[0] + a.handL[0]) / 2, 1);
      expect(a.hands[1]).toBeCloseTo((a.handR[1] + a.handL[1]) / 2, 1);
      // Le corps synthétique a les jambes plus longues que le pantin (bassin ≈ 4 unités plus haut).
      expect(Math.abs(a.seat[1] - b.seat[1])).toBeLessThan(5);
      expect(a.headTop[1]).toBeLessThan(a.head[1]);
      expect(a.head[1]).toBeLessThan(a.nape[1]);
    }
    // De face (yaw 4) : la main droite est à gauche de l'écran (−x).
    const f = r.render(d, KEY, 1, '')!.anchors;
    expect(f.handR[0]).toBeLessThan(f.handL[0]);
  });

  it('même habitant deux fois : rig réutilisé (un seul habillage)', async () => {
    const d = desc();
    const { r, fake } = await readyRenderer(d);
    r.render(d, KEY, 1, '');
    r.render(d, { ...KEY, phase: 5, gait: 'walk' }, 0.5, 'h');
    expect(dressRig).toHaveBeenCalledTimes(1);
    expect(fake.calls).toHaveLength(2);
  });

  it('réserve de 48 rigs : le 49e libère le 1er', async () => {
    const descs = Array.from({ length: 49 }, (_, i) => desc({ height: 1.5 + i * 0.01 }));
    const { r } = await readyRenderer(descs[0]!);
    for (const d of descs.slice(0, 48)) expect(r.render(d, KEY, 1, '')).not.toBeNull();
    expect(disposeRig).not.toHaveBeenCalled();
    const first = vi.mocked(dressRig).mock.results[0]!.value as THREE.Object3D[];
    r.render(descs[48]!, KEY, 1, '');
    expect(disposeRig).toHaveBeenCalledTimes(1);
    const freed = vi.mocked(disposeRig).mock.calls[0]![0];
    for (const o of first) expect(freed).toContain(o);
    // Le 1er revient : rhabillé.
    const n = vi.mocked(dressRig).mock.calls.length;
    r.render(descs[0]!, KEY, 1, '');
    expect(vi.mocked(dressRig).mock.calls.length).toBe(n + 1);
  }, 120_000);

  it('visage : la clé d’état pose l’émotion et le clignement', async () => {
    const d = desc();
    // Uniformes du visage relevés pendant le rendu (le rig est retiré de la scène ensuite).
    let U: Record<string, { value: number }> | undefined;
    const fake = fakeRenderer();
    fake.render = (scene) => { scene.traverse((o) => { if (o.userData.face) U = o.userData.face as typeof U; }); };
    const { r } = await readyRenderer(d, { fake });
    r.render(d, KEY, 1, 'sb1');
    expect(U!.uLid!.value).toBe(1);
    expect(U!.uMT!.value).toBeGreaterThan(0.03); // surpris : bouche ouverte
    r.render(d, KEY, 1, '');
    expect(U!.uLid!.value).toBe(0);
  });

  it('lumière multipliée par `light`, scène vidée après le rendu', async () => {
    const d = desc();
    const { r, fake } = await readyRenderer(d);
    r.render(d, KEY, 1, '');
    const sum = (): number => { let s = 0; fake.calls[0]!.traverse((o) => { if ((o as THREE.Light).isLight) s += (o as THREE.Light).intensity; }); return s; };
    const full = sum();
    r.render(d, KEY, 0.5, '');
    expect(sum()).toBeCloseTo(full / 2);
    expect(fake.calls[0]!.children.every((o) => (o as THREE.Light).isLight)).toBe(true);
    r.dispose();
    expect(fake.dispose).toHaveBeenCalled();
    expect(r.render(d, KEY, 1, '')).toBeNull();
  });
});
