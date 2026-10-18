// Rendu hors écran des habitants 3D : sans WebGL (node), un rendu simulé reçoit la scène ; on vérifie l'attente du
// modèle, le cadrage (pieds à l'origine du sprite, élévation 12°), l'échelle, les accroches et la réserve de rigs.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BaseModel } from '../../../src/content/citizens/model-cache';
import { CitizenRenderer, RIG_KEEP_FRAMES, RIGS_HARD_MAX, RIGS_MAX, lightColor, outlineThickness, rgbOf, rigHeight, spriteCamera, spritePixel, type CitizenRendererOptions, type RendererLike } from '../../../src/content/citizens/citizen-renderer';
import { NIGHT_LIGHT } from '../../../src/content/figure/citizen-config';
import { tone } from '../../../src/content/city-sprites';
import type { Sky } from '../../../src/core/library/sky';
import { SPRITE_BOX } from '../../../src/content/figure/figure-host';
import { citizen, type CitizenDesc } from '../../../src/core/citizens/catalogue';
import { dressRig, disposeRig, PARAPLUIE_DEFAUT } from '../../../src/core/citizens/wardrobe';
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

async function readyRenderer(d: CitizenDesc, opts: { px?: number; fake?: Fake; more?: Partial<CitizenRendererOptions> } = {}): Promise<{ r: CitizenRenderer; fake: Fake }> {
  const fake = opts.fake ?? fakeRenderer();
  const r = new CitizenRenderer({ pxPerUnit: opts.px ?? 3, makeRenderer: () => fake, loadBase: async (n) => fakeBase(n), ...opts.more });
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
    expect(r.lastFailure()).toBe('notReady');
    r.prepare(d);
    r.prepare(d); // idempotent
    expect(r.render(d, KEY, 1, '')).toBeNull();
    release(fakeBase('homme-fort'));
    await vi.waitFor(() => expect(r.ready(d)).toBe(true));
    const out = r.render(d, KEY, 1, '');
    expect(out?.url).toBe('data:image/png;base64,FAUX');
    expect(r.lastFailure()).toBeNull();
  });

  it('sans WebGL (création du rendu en échec) : null, sans exception', async () => {
    const d = desc();
    const r = new CitizenRenderer({ pxPerUnit: 3, makeRenderer: () => { throw new Error('pas de WebGL'); }, loadBase: async (n) => fakeBase(n) });
    r.prepare(d);
    await vi.waitFor(() => expect(r.ready(d)).toBe(true));
    expect(r.render(d, KEY, 1, '')).toBeNull();
    // Panne du moteur (compte pour la mise hors service de la 3D).
    expect(r.lastFailure()).toBe('engine');
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

  it('réserve : 96 rigs, plafond absolu 160, rigs en vue gardés 120 images', () => {
    expect([RIGS_MAX, RIGS_HARD_MAX, RIG_KEEP_FRAMES]).toEqual([96, 160, 120]);
  });

  it('réserve pleine, aucun rig en vue : le suivant libère le moins récent', async () => {
    const descs = Array.from({ length: 5 }, (_, i) => desc({ height: 1.5 + i * 0.01 }));
    const { r } = await readyRenderer(descs[0]!, { more: { rigsMax: 4, keepFrames: 0 } });
    for (const d of descs.slice(0, 4)) expect(r.render(d, KEY, 1, '')).not.toBeNull();
    expect(disposeRig).not.toHaveBeenCalled();
    const first = vi.mocked(dressRig).mock.results[0]!.value as THREE.Object3D[];
    r.render(descs[4]!, KEY, 1, '');
    expect(disposeRig).toHaveBeenCalledTimes(1);
    const freed = vi.mocked(disposeRig).mock.calls[0]![0];
    for (const o of first) expect(freed).toContain(o);
    // Le 1er revient : rhabillé.
    const n = vi.mocked(dressRig).mock.calls.length;
    r.render(descs[0]!, KEY, 1, '');
    expect(vi.mocked(dressRig).mock.calls.length).toBe(n + 1);
    expect(r.stats().evictions).toBe(2);
  }, 60_000);

  it('réserve : les habitants en vue ne sont jamais rhabillés en boucle ; un rig sorti de la vue part en premier', async () => {
    const descs = Array.from({ length: 8 }, (_, i) => desc({ height: 1.5 + i * 0.01 }));
    const { r } = await readyRenderer(descs[0]!, { more: { rigsMax: 4, rigsHardMax: 6, keepFrames: 3 } });
    // 6 habitants à l'écran (au-delà de rigsMax, sous le plafond absolu), rendus ou demandés à chaque image.
    const onScreen = descs.slice(0, 6);
    for (let f = 0; f < 10; f++) {
      r.tick();
      // Première image : tous rendus ; ensuite, un sur deux seulement demandé (cycle déjà rendu).
      onScreen.forEach((d, i) => (f > 0 && i % 2 ? r.touch(d) : r.render(d, KEY, 1, '')));
    }
    expect(r.stats().builds).toBe(6);
    expect(r.stats().evictions).toBe(0);
    // Le 6e sort de la vue ; 3 images plus tard, un nouvel habitant prend sa place sans toucher aux autres.
    for (let f = 0; f < 3; f++) {
      r.tick();
      onScreen.slice(0, 5).forEach((d) => r.touch(d));
    }
    const fifthOut = vi.mocked(dressRig).mock.results[5]!.value as THREE.Object3D[];
    r.render(descs[6]!, KEY, 1, '');
    expect(r.stats().evictions).toBe(1);
    expect(vi.mocked(disposeRig).mock.calls[0]![0]).toContain(fifthOut[0]);
    for (const d of onScreen.slice(0, 5)) expect(r.hasRig(d)).toBe(true);
    // Au-delà du plafond absolu (7 en vue pour 6) : le moins récent part quand même.
    r.tick();
    for (const d of [...onScreen.slice(0, 5), descs[6]!]) r.touch(d);
    r.render(descs[7]!, KEY, 1, '');
    expect(r.stats().rigs).toBeLessThanOrEqual(6);
  }, 60_000);

  it('habillage à part (buildRig) puis rendu ; mesures de temps de chaque étape', async () => {
    const d = desc();
    const clock = { t: 0 };
    const { r, fake } = await readyRenderer(d, { more: { now: () => (clock.t += 5) } });
    expect(r.hasRig(d)).toBe(false);
    expect(r.buildRig(d)).toBe(true);
    expect(r.hasRig(d)).toBe(true);
    // Enveloppe du tronc habillé mesurée à l'habillage, pas au premier rendu.
    const rig = [...(r as unknown as { rigs: Map<string, { map: { hull?: unknown } }> }).rigs.values()][0]!;
    expect(rig.map.hull).not.toBeUndefined();
    expect(fake.calls).toHaveLength(0);
    expect(r.stats()).toMatchObject({ builds: 1, renders: 0, avgBuildMs: 5, maxBuildMs: 5 });
    expect(r.render(d, KEY, 1, '')).not.toBeNull();
    expect(dressRig).toHaveBeenCalledTimes(1);
    expect(r.stats()).toMatchObject({ builds: 1, renders: 1, avgRenderMs: 5, maxRenderMs: 5, evictions: 0, rigs: 1 });
  });

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

  it('teinte de nuit tirée de `light` comme le pantin (bleutée la nuit, blanche le jour), scène vidée après le rendu', async () => {
    const d = desc();
    const { r, fake } = await readyRenderer(d);
    const lights = (): THREE.Light[] => { const l: THREE.Light[] = []; fake.calls[0]!.traverse((o) => { if ((o as THREE.Light).isLight) l.push(o as THREE.Light); }); return l; };
    r.render(d, KEY, 1, '');
    const day = lights().map((l) => [l.intensity, l.color.getHexString()]);
    expect(day.every(([, c]) => c === 'ffffff')).toBe(true);
    r.render(d, KEY, NIGHT_LIGHT, '');
    for (const l of lights()) {
      // Même intensité, couleur assombrie et bleutée (bleu > rouge), comme tone('#ffffff', nuit).
      expect(l.color.b).toBeGreaterThan(l.color.r);
      expect(l.color.r).toBeLessThan(0.5);
    }
    expect(lights().map((l) => l.intensity)).toEqual(day.map(([i]) => i));
    expect(lightColor(NIGHT_LIGHT)).toBe(tone('#ffffff', { daylight: 0 } as Sky));
    expect(lightColor(1)).toBe(tone('#ffffff', { daylight: 1 } as Sky));
    expect(lightColor(NIGHT_LIGHT + (1 - NIGHT_LIGHT) / 2)).toBe(tone('#ffffff', { daylight: 0.5 } as Sky));
    expect(fake.calls[0]!.children.every((o) => (o as THREE.Light).isLight)).toBe(true);
    r.dispose();
    expect(fake.dispose).toHaveBeenCalled();
    expect(r.render(d, KEY, 1, '')).toBeNull();
  });

  it('contour : épaisseur tirée des pixels (1,2 px vêtements, 0,7 px corps, sur les bords latéraux), quelle que soit la résolution', () => {
    for (const px of [3, 6]) {
      expect(outlineThickness(1.2, px) * ((SPRITE_BOX.w * px) / 2)).toBeCloseTo(1.2);
      expect(outlineThickness(0.7, px) * ((SPRITE_BOX.w * px) / 2)).toBeCloseTo(0.7);
    }
  });

  it('contour du corps à 0,7 px pour la résolution du rendu', async () => {
    const d = desc();
    let t: number | undefined;
    const fake = fakeRenderer();
    fake.render = (scene) => {
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if ((o as THREE.SkinnedMesh).isSkinnedMesh && m?.userData.outlineParameters?.thickness) t = m.userData.outlineParameters.thickness as number;
      });
    };
    const { r } = await readyRenderer(d, { px: 6, fake });
    r.render(d, KEY, 1, '');
    expect(t).toBeCloseTo(outlineThickness(0.7, 6));
  });

  it('contexte perdu pendant le rendu : null, pas de toDataURL', async () => {
    const d = desc();
    const fake = fakeRenderer();
    let lost = false;
    const toDataURL = vi.fn(() => 'data:x');
    fake.domElement = { toDataURL };
    fake.lost = () => lost;
    fake.render = () => { lost = true; };
    const { r } = await readyRenderer(d, { fake });
    expect(r.render(d, KEY, 1, '')).toBeNull();
    expect(toDataURL).not.toHaveBeenCalled();
    lost = false;
    fake.render = () => {};
    expect(r.render(d, KEY, 1, '')?.url).toBe('data:x');
  });

  it('habillage en échec : null, pas de nouvel essai avant 30 s', async () => {
    const d = desc({ height: 1.66 });
    const { r } = await readyRenderer(d);
    vi.mocked(dressRig).mockImplementationOnce(() => { throw new Error('pièce cassée'); });
    const t0 = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0);
    try {
      expect(r.render(d, KEY, 1, '')).toBeNull();
      // Échec propre à l'habitant (lui seul retombe en pantin).
      expect(r.lastFailure()).toBe('citizen');
      expect(r.render(d, KEY, 1, '')).toBeNull();
      expect(r.lastFailure()).toBe('citizen');
      expect(dressRig).toHaveBeenCalledTimes(1);
      now.mockReturnValue(t0 + 31_000);
      expect(r.render(d, KEY, 1, '')).not.toBeNull();
      expect(dressRig).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('l’humeur ne change pas le rig', async () => {
    const d = desc({ mood: 'neutre' });
    const { r } = await readyRenderer(d);
    r.render(d, KEY, 1, '');
    r.render({ ...d, mood: 'triste' }, KEY, 1, 't');
    expect(dressRig).toHaveBeenCalledTimes(1);
  });

  it('teinte : #rgb accepté, illisible → peau de la base (aucun NaN)', async () => {
    expect(rgbOf('#abc')).toEqual([0xaa, 0xbb, 0xcc]);
    expect(rgbOf('#A0B1C2')).toEqual([0xa0, 0xb1, 0xc2]);
    expect(rgbOf('pas une couleur')).toBeNull();
    expect(rgbOf('#12345')).toBeNull();
    const d = desc({ skin: 'pas une couleur' });
    let U: Record<string, { value: THREE.Color | number }> | undefined;
    const fake = fakeRenderer();
    fake.render = (scene) => { scene.traverse((o) => { if (o.userData.face) U = o.userData.face as typeof U; }); };
    const { r } = await readyRenderer(d, { fake });
    expect(r.render(d, KEY, 1, '')).not.toBeNull();
    const c = U!.uLidL!.value as THREE.Color;
    expect([c.r, c.g, c.b].every(Number.isFinite)).toBe(true);
  });

  describe('parapluie', () => {
    const RAIN: FigureKey = { ...KEY, sig: 'short.tee.pants.none.u.n' };
    type Seen = { open?: boolean; closed?: boolean; color?: string; dist?: number };
    // Relève, pendant le rendu, l'état des deux parapluies et l'écart du manche ouvert à la main droite.
    function watch(fake: Fake, out: Seen): void {
      fake.render = (scene) => {
        out.open = undefined; out.closed = undefined; out.dist = undefined;
        let hand: THREE.Vector3 | null = null;
        scene.traverse((o) => { if (o.name === 'mixamorigRightHand') hand = o.getWorldPosition(new THREE.Vector3()); });
        scene.traverse((o) => {
          if (o.name === 'parapluie-ouvert') {
            out.open = o.visible;
            const canopy = (o.children[1] as THREE.Mesh).material as THREE.MeshToonMaterial;
            out.color = '#' + canopy.color.getHexString();
            out.dist = o.getWorldPosition(new THREE.Vector3()).distanceTo(hand!);
          }
          if (o.name === 'parapluie-ferme') out.closed = (out.closed ?? false) || o.visible;
        });
      };
    }
    const withUmbrella = (color: string): CitizenDesc => {
      const d = desc({ height: 1.71 });
      return { ...d, items: [...d.items, { k: 'accessory', what: 'parapluie', color }] };
    };

    it('pluie (u dans la signature), sans parapluie à soi : ouvert, couleur par défaut, au poing, bras levé', async () => {
      const d = desc();
      const seen: Seen = {};
      const fake = fakeRenderer();
      watch(fake, seen);
      const { r } = await readyRenderer(d, { fake });
      const a = r.render(d, RAIN, 1, '')!.anchors;
      expect(seen.open).toBe(true);
      expect(seen.closed).toBeUndefined();
      expect(seen.color).toBe(PARAPLUIE_DEFAUT.toLowerCase());
      expect(seen.dist).toBeLessThan(1e-6);
      expect(a.handR[1]).toBeLessThan(a.nape[1]); // main droite au-dessus du cou
    });

    it('pluie avec son parapluie : ouvert à sa couleur, le fermé caché', async () => {
      const d = withUmbrella('#123456');
      const seen: Seen = {};
      const fake = fakeRenderer();
      watch(fake, seen);
      const { r } = await readyRenderer(d, { fake });
      r.render(d, RAIN, 1, '');
      expect(seen.open).toBe(true);
      expect(seen.color).toBe('#123456');
      expect(seen.closed).toBeUndefined(); // jamais construit
      // Plus de pluie : le même rig montre le parapluie fermé, l'ouvert est caché, bras baissé.
      const a = r.render(d, KEY, 1, '')!.anchors;
      expect(seen.open).toBe(false);
      expect(seen.closed).toBe(true);
      expect(a.handR[1]).toBeGreaterThan(a.seat[1] - 4); // main vers le bassin
      expect(dressRig).toHaveBeenCalledTimes(1);
      // dressRig n'a pas reçu le parapluie (il est géré à part).
      const pieces = vi.mocked(dressRig).mock.calls[0]![1];
      expect(pieces.some((p) => p.k === 'accessory' && p.what === 'parapluie')).toBe(false);
    });

    it('sans pluie ni parapluie : aucun parapluie', async () => {
      const d = desc();
      const seen: Seen = {};
      const fake = fakeRenderer();
      watch(fake, seen);
      const { r } = await readyRenderer(d, { fake });
      r.render(d, KEY, 1, '');
      expect(seen.open).toBeUndefined();
      expect(seen.closed).toBeUndefined();
    });
  });
});
