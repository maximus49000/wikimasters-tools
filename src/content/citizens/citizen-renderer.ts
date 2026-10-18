// Rendu hors écran des habitants 3D en images de sprite : même cadre (SPRITE_BOX, pieds à l'origine), même caméra
// (orthographique, plongée de 12°, geometry.ts) et mêmes accroches que le pantin 2D cuit par figure-host, pour que les
// scènes affichent indifféremment l'un ou l'autre. Un habitant = un « rig » : clone de sa base (SkeletonUtils), corps
// recoloré à sa teinte de peau, garde-robe et calque du visage liés au squelette du clone ; la pose du pantin pilote les
// os (retarget.ts), puis un seul WebGLRenderer partagé peint l'image (toon deux tons + contour, réglages du banc
// dress.html validés par l'utilisateur) et la rend en data URL (la CSP de l'hôte refuse blob:).
// Jamais d'exception vers l'appelant : modèle pas encore chargé, WebGL absent ou contexte perdu → null (repli 2D).
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadBase as loadBaseParDefaut, type BaseModel } from './model-cache';
import { SPRITE_BOX } from '../figure/figure-host';
import { NIGHT_LIGHT } from '../figure/citizen-config';
import { mixHex } from '../../core/library/sky';
import { BASES } from '../../core/citizens/catalogue-data';
import { citizenKey, expand, type CitizenDesc, type Piece } from '../../core/citizens/catalogue';
import { accessory, analyse, disposeRig, dressRig, PARAPLUIE_DEFAUT, parapluieOuvert, skull, TOON_RAMP, type BodyInfo } from '../../core/citizens/wardrobe';
import { faceLayer, parseFaceState } from '../../core/citizens/face';
import { applyPose, boneMap, type BoneMap } from '../../core/citizens/retarget';
import { poseOf } from '../../core/library/figure/skeleton';
import { CAM_CA, CAM_SA } from '../../core/library/figure/geometry';
import type { Anchor, FigureKey } from '../../core/library/figure/bake';
import { shapeFromSignature } from '../../core/library/figure/dress';

/** Ce dont le rendu a besoin d'un moteur (un faux en test : pas de WebGL sous node). */
export type RendererLike = {
  setSize(w: number, h: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  domElement: { toDataURL(type?: string): string };
  dispose(): void;
  /** Contexte WebGL perdu (rendu impossible jusqu'à sa restauration). */
  lost?(): boolean;
};

export type SpriteAnchors = Record<Anchor | 'hands', readonly [number, number]>;
export type CitizenSprite = { url: string; anchors: SpriteAnchors };
export type RenderFailure = 'engine' | 'citizen' | 'notReady';

// Contour encré, plus fin sur le corps que sur les vêtements. L'épaisseur d'OutlineEffect est en espace de découpe : un
// décalage t y fait t·W/2 px en largeur et t·H/2 px en hauteur. On la tire d'une épaisseur visée en pixels sur le côté
// le plus étroit (la largeur : les bords gauche/droite de la silhouette), pour qu'elle ne dépende pas de la résolution
// du sprite (les valeurs du banc, 0,0035 et 0,0016, ne faisaient que 0,2 à 0,4 px à 3 px/unité).
// Couleur : l'encre du pantin 2D (#33241f). OutlineEffect la prend en linéaire (puis la convertit en sRGB) : le banc
// passait ses composantes sRGB telles quelles, d'où un contour gris clair.
const OUTLINE_COLOR = new THREE.Color('#33241f').toArray();
const OUTLINE_PX = 1.2;
const BODY_OUTLINE_PX = 0.7;
/** Épaisseur OutlineEffect pour `targetPx` pixels sur les bords latéraux d'un canvas de SPRITE_BOX.w·px de large. */
export const outlineThickness = (targetPx: number, px: number): number => targetPx / ((Math.min(SPRITE_BOX.w, SPRITE_BOX.h) * px) / 2);
const AMBIENT = 1.6;
const SUN = 1.6;
// Teinte de nuit des lumières, comme `tone()` du pantin (city-sprites.tsx) : la couleur se mêle à 55 % de bleu nuit, puis
// revient vers elle-même avec la clarté du jour. La clarté se relit dans `light` (citizenLight : NIGHT_LIGHT la nuit, 1 le jour).
const NIGHT_BLUE = '#0B1030';
/** Couleur (hex sRGB) des lumières pour une lumière `light` : blanc le jour, blanc mêlé de bleu nuit la nuit. */
export function lightColor(light: number): string {
  const day = Math.min(1, Math.max(0, (light - NIGHT_LIGHT) / (1 - NIGHT_LIGHT)));
  return mixHex(mixHex('#ffffff', NIGHT_BLUE, 0.55), '#ffffff', day);
}
// Taille à l'écran : adulte de 1,70 m = 37,5 unités du pantin ; enfant toujours 37,5 (les scènes le réduisent à 0,6).
const ADULT_UNITS = 37.5;
const REF_METRES = 1.7;
const RETRY_MS = 30_000;
// Peau de repli quand ni la teinte demandée ni celle de la base ne se lisent (« beige » du catalogue).
const SKIN_DEFAUT = '#E0AE88';
/** Rigs habillés gardés (les moins récemment utilisés partent), au-delà de ceux des habitants en vue. */
export const RIGS_MAX = 96;
/** Plafond absolu : au-delà, même un rig utilisé récemment part (mémoire Android). */
export const RIGS_HARD_MAX = 160;
/** Un rig rendu ou demandé depuis moins de ce nombre d'images (tick) n'est jamais retiré sous RIGS_HARD_MAX. */
export const RIG_KEEP_FRAMES = 120;

/** Mesures légères du rendu (lisibles au téléphone par CDP : `__wmt3d.stats()`). */
export type RendererStats = {
  builds: number;
  avgBuildMs: number;
  maxBuildMs: number;
  renders: number;
  avgRenderMs: number;
  maxRenderMs: number;
  evictions: number;
  rigs: number;
};

/** Hauteur du rig en unités du pantin. */
export const rigHeight = (metres: number, child: boolean): number => (child ? ADULT_UNITS : (ADULT_UNITS * metres) / REF_METRES);

/** Moteur par défaut : WebGL + contour, fond transparent, tampon conservé (toDataURL après le rendu). */
function webglRenderer(px: number): RendererLike {
  const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.setPixelRatio(1);
  R.setClearColor(0x000000, 0);
  const outline = new OutlineEffect(R, { defaultThickness: outlineThickness(OUTLINE_PX, px), defaultColor: OUTLINE_COLOR });
  // Laisse au navigateur la possibilité de restaurer le contexte ; l'état se lit directement (isContextLost).
  R.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
  const gl = R.getContext();
  return {
    setSize: (w, h) => R.setSize(w, h, false),
    render: (s, c) => outline.render(s, c),
    domElement: R.domElement,
    dispose: () => R.dispose(),
    lost: () => gl.isContextLost(),
  };
}

/** Caméra du sprite, en unités du pantin : cadre SPRITE_BOX (y vers le bas à l'écran), pieds à l'origine, plongée de 12°. */
export function spriteCamera(): THREE.OrthographicCamera {
  const B = SPRITE_BOX;
  const cam = new THREE.OrthographicCamera(B.x0, B.x0 + B.w, -B.y0, -(B.y0 + B.h), 1, 400);
  // Placée en avant et au-dessus, visant l'origine : vue y = y·cos − z·sin, exactement `project` de geometry.ts.
  cam.position.set(0, 200 * CAM_SA, 200 * CAM_CA);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

const vP = new THREE.Vector3();
/** Point de la scène → repère du sprite (unités du pantin, pieds à l'origine, y vers le bas), comme `anchorsOf`. */
function toSprite(cam: THREE.Camera, v: THREE.Vector3): [number, number] {
  vP.copy(v).project(cam);
  return [SPRITE_BOX.x0 + ((vP.x + 1) / 2) * SPRITE_BOX.w, SPRITE_BOX.y0 + ((1 - vP.y) / 2) * SPRITE_BOX.h];
}
/** Point de la scène → pixel du canvas. */
export function spritePixel(cam: THREE.Camera, v: THREE.Vector3, px: number): [number, number] {
  const [x, y] = toSprite(cam, v);
  return [(x - SPRITE_BOX.x0) * px, (y - SPRITE_BOX.y0) * px];
}

// ── Recoloration de la peau ──────────────────────────────────────────────────────────────────────────────────────
type Surface = { cv: HTMLCanvasElement | OffscreenCanvas; cx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D };
// Canvas 2D hors écran (OffscreenCanvas si possible) ; null sans canvas (node, jsdom).
function surface(w: number, h: number): Surface | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const cv = new OffscreenCanvas(w, h);
      const cx = cv.getContext('2d', { willReadFrequently: true });
      if (cx) return { cv, cx };
    }
    if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return null;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    return cx ? { cv, cx } : null;
  } catch {
    return null;
  }
}
type Img = { width: number; height: number };
const sizeOf = (t: THREE.Texture): Img | null => {
  const im = t.image as Partial<Img> | null | undefined;
  return im && typeof im.width === 'number' && typeof im.height === 'number' && im.width > 0 ? (im as Img) : null;
};
// Pixels de la texture d'origine (une fois par base) ; null sans canvas ou image illisible.
function pixelsOf(t: THREE.Texture): ImageData | null {
  const im = sizeOf(t);
  const s = im && surface(im.width, im.height);
  if (!im || !s) return null;
  try {
    s.cx.drawImage(t.image as CanvasImageSource, 0, 0);
    return s.cx.getImageData(0, 0, im.width, im.height);
  } catch {
    return null;
  }
}
const hexOf = (rgb: number[]): string => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
/** « #rrggbb » ou « #rgb » → [r, g, b] (0–255) ; null si illisible (jamais de NaN). */
export function rgbOf(h: string): number[] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const x = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
}

// Peau d'origine : moyenne de la texture sur les avant-bras (nus sur toutes les bases), un sommet sur cinq.
function measureSkin(A: BodyInfo, tex: THREE.Texture, D: ImageData): string | null {
  const uv = A.body.geometry.attributes.uv;
  if (!uv) return null;
  let r = 0, g = 0, b = 0, n = 0;
  A.info.forEach((v, i) => {
    if (v.part !== 'arm' || v.armT < 0.6 || v.armT > 0.9 || i % 5) return;
    const x = Math.min(D.width - 1, Math.max(0, Math.floor(uv.getX(i) * D.width)));
    const y = Math.min(D.height - 1, Math.max(0, Math.floor((tex.flipY ? 1 - uv.getY(i) : uv.getY(i)) * D.height)));
    const k = (y * D.width + x) * 4;
    r += D.data[k]!; g += D.data[k + 1]!; b += D.data[k + 2]!; n++;
  });
  return n ? hexOf([r / n, g / n, b / n]) : null;
}

// Texture recolorée (banc `toneMaterial`) : les pixels de chair (ni gris, ni noirs, ni blancs ; teinte entre rouge et
// jaune) passent de la peau d'origine à la peau voulue, en fondu sur les bords (anticrénelage avec le tee-shirt).
function toneTexture(src: THREE.Texture, D: ImageData, baseHex: string, targetHex: string): THREE.Texture | null {
  // Teinte illisible : pas de recoloration (l'appelant garde la peau d'origine).
  const b = rgbOf(baseHex), t = rgbOf(targetHex);
  if (!b || !t) return null;
  const s = surface(D.width, D.height);
  if (!s) return null;
  const im = new ImageData(new Uint8ClampedArray(D.data), D.width, D.height), P = im.data;
  for (let i = 0; i < P.length; i += 4) {
    const r = P[i]!, g = P[i + 1]!, bl = P[i + 2]!;
    const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
    if (mx < 70 || mx - mn < 22 || !(r >= g && g >= bl - 8)) continue;
    const hue = (g - bl) / (mx - mn + 1e-6);
    if (hue < -0.1 || hue > 1.1) continue;
    const w = Math.min(1, (mx - mn - 22) / 25);
    for (let c = 0; c < 3; c++) {
      const v = Math.min(255, (P[i + c]! / Math.max(1, b[c]!)) * t[c]!);
      P[i + c] = P[i + c]! * (1 - w) + v * w;
    }
  }
  s.cx.putImageData(im, 0, 0);
  const tex = new THREE.CanvasTexture(s.cv);
  tex.flipY = src.flipY;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Rigs ─────────────────────────────────────────────────────────────────────────────────────────────────────────
type Base = { model: BaseModel; info: BodyInfo; pixels: ImageData | null | undefined; skin: string | null };
type Rig = {
  wrap: THREE.Group; // échelle unités du pantin / unités du modèle
  root: THREE.Object3D; // espace de liaison (parent du corps)
  body: THREE.SkinnedMesh;
  map: BoneMap;
  worn: THREE.Object3D[]; // garde-robe + visage (+ parapluies une fois construits)
  face: THREE.SkinnedMesh;
  // Parapluie : fermé (tenu pointe en bas, si l'habitant en a un) ou ouvert (pluie), construits à la première demande.
  umbrellaColor: string | null;
  closed: THREE.Object3D[] | null;
  open: THREE.Group | null;
  bodyMat: THREE.Material;
  unitsToRig: number;
  base: Base;
  // Dernière image (tick) où l'habitant a été rendu ou demandé.
  used: number;
};

// Point de repos du corps → scène, porté par un os (même transformation que le skinning).
const mP = new THREE.Matrix4();
function carried(rig: Rig, bone: number, rest: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const sk = rig.body.skeleton;
  mP.multiplyMatrices(sk.bones[bone]!.matrixWorld, sk.boneInverses[bone]!);
  return out.copy(rest).applyMatrix4(rig.body.bindMatrix).applyMatrix4(mP);
}

const r2 = (v: number): number => Math.round(v * 100) / 100 || 0;
const vA = new THREE.Vector3();
const isUmbrella = (p: Piece): boolean => p.k === 'accessory' && p.what === 'parapluie';
// Clé du rig : l'humeur ne change pas l'habillage (le visage est posé à chaque rendu).
// Mémorisée par description : le registre la demande à chaque image pour chaque habitant en vue (touch).
const rigKeys = new WeakMap<CitizenDesc, string>();
const rigKey = (d: CitizenDesc): string => {
  let k = rigKeys.get(d);
  if (k === undefined) rigKeys.set(d, (k = citizenKey({ ...d, mood: 'neutre' })));
  return k;
};

export type CitizenRendererOptions = {
  pxPerUnit: number;
  makeRenderer?: () => RendererLike;
  /** Chargement d'une base (par défaut : model-cache) ; injectable pour les tests et le banc. */
  loadBase?: (name: string) => Promise<BaseModel | null>;
  /** Horloge des mesures (ms) ; par défaut performance.now. */
  now?: () => number;
  /** Réserve de rigs (tests) : défauts RIGS_MAX, RIGS_HARD_MAX, RIG_KEEP_FRAMES. */
  rigsMax?: number;
  rigsHardMax?: number;
  keepFrames?: number;
};

export class CitizenRenderer {
  private readonly px: number;
  private readonly make: () => RendererLike;
  private readonly load: (name: string) => Promise<BaseModel | null>;
  private renderer: RendererLike | null | undefined; // undefined : pas encore créé ; null : WebGL indisponible
  private readonly scene = new THREE.Scene();
  private readonly camera = spriteCamera();
  private readonly ambient = new THREE.AmbientLight(0xffffff, AMBIENT);
  private readonly sun = new THREE.DirectionalLight(0xffffff, SUN);
  private readonly bases = new Map<string, Base>();
  private readonly loading = new Set<string>();
  // Habillages en échec (clé du rig → instant) : pas de nouvel essai avant RETRY_MS.
  private readonly rigFailed = new Map<string, number>();
  // Échecs de chargement : pas de nouvelle tentative avant RETRY_MS (render appelle prepare à chaque image).
  private readonly failed = new Map<string, number>();
  // Rigs par clé d'habitant, dans l'ordre d'usage (le début de la Map part en premier).
  private readonly rigs = new Map<string, Rig>();
  // Textures recolorées par (base, peau) : 6 bases × 8 peaux au plus.
  private readonly tones = new Map<string, THREE.Texture>();
  private disposed = false;
  private failure: RenderFailure | null = null;
  private readonly clock: () => number;
  private readonly rigsMax: number;
  private readonly rigsHard: number;
  private readonly keep: number;
  // Numéro d'image (tick, avancé par les registres) : protège les rigs des habitants en vue.
  private tickNo = 0;
  private readonly st = { builds: 0, buildMs: 0, maxBuildMs: 0, renders: 0, renderMs: 0, maxRenderMs: 0, evictions: 0 };

  /** Cause du dernier `null` de render (null après un rendu réussi) : moteur (pas de WebGL, contexte perdu, rendu détruit),
   * habitant (habillage ou pose en échec : lui seul retombe en pantin) ou base pas encore chargée. */
  lastFailure(): RenderFailure | null {
    return this.failure;
  }

  constructor(opts: CitizenRendererOptions) {
    this.px = opts.pxPerUnit;
    this.make = opts.makeRenderer ?? (() => webglRenderer(this.px));
    this.load = opts.loadBase ?? ((n) => loadBaseParDefaut(n));
    this.clock = opts.now ?? (() => performance.now());
    this.rigsMax = opts.rigsMax ?? RIGS_MAX;
    this.rigsHard = Math.max(this.rigsMax, opts.rigsHardMax ?? RIGS_HARD_MAX);
    this.keep = opts.keepFrames ?? RIG_KEEP_FRAMES;
    this.sun.position.set(-2, 4, 3);
    this.scene.add(this.ambient, this.sun);
  }

  ready(desc: CitizenDesc): boolean {
    return !this.disposed && this.bases.has(desc.base);
  }

  // Lance le chargement (et l'analyse, une fois) de la base de l'habitant ; sans attente, sans effet si déjà fait.
  prepare(desc: CitizenDesc): void {
    const name = desc.base;
    if (this.disposed || this.bases.has(name) || this.loading.has(name)) return;
    const t = this.failed.get(name);
    if (t !== undefined && Date.now() - t < RETRY_MS) return;
    this.loading.add(name);
    void this.load(name)
      .then((model) => {
        if (!model) throw new Error('base absente');
        if (!this.disposed) this.bases.set(name, { model, info: Object.assign(analyse(model.body), BASES[name]?.ease ? { ease: BASES[name]!.ease } : {}), pixels: undefined, skin: null });
      })
      .catch(() => { this.failed.set(name, Date.now()); })
      .finally(() => this.loading.delete(name));
  }

  /** Image suivante (une fois par flush d'un registre) : les rigs rendus ou demandés récemment restent gardés. */
  tick(): void {
    this.tickNo++;
  }

  /** L'habitant est en vue (demandé par une figure) : son rig, s'il existe, n'est pas retiré. */
  touch(desc: CitizenDesc): void {
    const k = rigKey(desc);
    const rig = this.rigs.get(k);
    if (!rig || rig.used === this.tickNo) return;
    rig.used = this.tickNo;
    this.rigs.delete(k);
    this.rigs.set(k, rig);
  }

  /** Rig de l'habitant déjà habillé : son rendu ne coûtera que la pose et l'image. */
  hasRig(desc: CitizenDesc): boolean {
    return this.rigs.has(rigKey(desc));
  }

  /** Habille le rig de l'habitant sans le rendre (clone, garde-robe, visage, peau : le plus gros du premier rendu), pour que
   * le registre le compte comme un travail à part et rende à une image suivante ; false en échec (lastFailure dit pourquoi). */
  buildRig(desc: CitizenDesc): boolean {
    if (this.disposed) {
      this.fail('engine');
      return false;
    }
    this.prepare(desc);
    const base = this.bases.get(desc.base);
    if (!base) {
      this.fail('notReady');
      return false;
    }
    if (!this.rigOf(desc, base)) {
      this.fail('citizen');
      return false;
    }
    this.failure = null;
    return true;
  }

  /** Mesures depuis la création (aucun journal : lues à la demande). */
  stats(): RendererStats {
    const s = this.st;
    const r1 = (v: number): number => Math.round(v * 10) / 10;
    return {
      builds: s.builds,
      avgBuildMs: s.builds ? r1(s.buildMs / s.builds) : 0,
      maxBuildMs: r1(s.maxBuildMs),
      renders: s.renders,
      avgRenderMs: s.renders ? r1(s.renderMs / s.renders) : 0,
      maxRenderMs: r1(s.maxRenderMs),
      evictions: s.evictions,
      rigs: this.rigs.size,
    };
  }

  render(desc: CitizenDesc, key: FigureKey, light: number, face: string): CitizenSprite | null {
    const out = this.draw(desc, key, light, face);
    if (out) this.failure = null;
    return out;
  }

  private fail(why: RenderFailure): null {
    this.failure = why;
    return null;
  }

  private draw(desc: CitizenDesc, key: FigureKey, light: number, face: string): CitizenSprite | null {
    if (this.disposed) return this.fail('engine');
    this.prepare(desc);
    const base = this.bases.get(desc.base);
    if (!base) return this.fail('notReady');
    const R = this.engine();
    if (!R || R.lost?.()) return this.fail('engine');
    try {
      const rig = this.rigOf(desc, base);
      if (!rig) return this.fail('citizen');
      // Temps du rendu seul (pose, image, data URL) : l'habillage est compté à part.
      const t0 = this.clock();
      // Parapluie ouvert selon la clé (la pluie l'ouvre, comme pour le pantin 2D) ; sinon, celui de l'habitant reste fermé.
      const umbrella = shapeFromSignature(key.sig).umbrella;
      // Même pose que la cuisson 2D (bake.ts `poseOfKey`) : le 3D regarde du même côté que le pantin pour la même clé.
      const pose = poseOf((key.yaw * Math.PI) / 8, (key.phase * 2 * Math.PI) / 12, key.gait, { headYaw: (key.head * Math.PI) / 8, umbrella, arms: key.arms, lean: key.lean });
      applyPose(rig.root, rig.map, pose, rig.unitsToRig, key.gait);
      const f = parseFaceState(face);
      (rig.face.userData.set as (e: string, b: number) => void)(f.emotion, f.blink);
      const tint = lightColor(light);
      this.ambient.color.set(tint);
      this.sun.color.set(tint);
      this.scene.add(rig.wrap);
      rig.wrap.updateMatrixWorld(true);
      this.umbrella(rig, umbrella);
      try {
        R.render(this.scene, this.camera);
      } catch {
        return this.fail('engine');
      } finally {
        this.scene.remove(rig.wrap);
      }
      // Contexte perdu pendant le rendu : l'image serait vide.
      if (R.lost?.()) return this.fail('engine');
      const out = { url: R.domElement.toDataURL('image/png'), anchors: this.anchors(rig) };
      const d = this.clock() - t0;
      this.st.renders++;
      this.st.renderMs += d;
      this.st.maxRenderMs = Math.max(this.st.maxRenderMs, d);
      return out;
    } catch {
      return this.fail('citizen');
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const rig of this.rigs.values()) this.free(rig);
    this.rigs.clear();
    for (const t of this.tones.values()) t.dispose();
    this.tones.clear();
    this.bases.clear();
    try {
      this.renderer?.dispose();
    } catch {
      /* contexte déjà perdu */
    }
    this.renderer = null;
  }

  // Moteur partagé, créé au premier rendu ; un échec (pas de WebGL) est définitif pour cette instance.
  private engine(): RendererLike | null {
    if (this.renderer !== undefined) return this.renderer;
    try {
      this.renderer = this.make();
      this.renderer.setSize(SPRITE_BOX.w * this.px, SPRITE_BOX.h * this.px);
    } catch {
      this.renderer = null;
    }
    return this.renderer;
  }

  private rigOf(desc: CitizenDesc, base: Base): Rig | null {
    const k = rigKey(desc);
    const hit = this.rigs.get(k);
    if (hit) {
      hit.used = this.tickNo;
      this.rigs.delete(k);
      this.rigs.set(k, hit);
      return hit;
    }
    const t = this.rigFailed.get(k);
    if (t !== undefined && Date.now() - t < RETRY_MS) return null;
    let rig: Rig;
    const t0 = this.clock();
    try {
      rig = this.build(desc, base);
    } catch {
      this.rigFailed.set(k, Date.now());
      return null;
    }
    const d = this.clock() - t0;
    this.st.builds++;
    this.st.buildMs += d;
    this.st.maxBuildMs = Math.max(this.st.maxBuildMs, d);
    this.rigFailed.delete(k);
    this.rigs.set(k, rig);
    this.evict(k);
    return rig;
  }

  // Réserve : au-delà de rigsMax part le moins récemment utilisé des rigs qui ne sont plus en vue (ni rendus ni demandés depuis
  // `keep` images). Tous en vue : ils restent jusqu'au plafond absolu (sinon des habitants à l'écran seraient rhabillés en
  // boucle), au-delà duquel le moins récent part quand même. `fresh` : le rig qu'on vient d'habiller, jamais retiré.
  private evict(fresh: string): void {
    while (this.rigs.size > this.rigsMax) {
      let victim: string | null = null;
      for (const [k, r] of this.rigs) {
        if (k !== fresh && this.tickNo - r.used >= this.keep) {
          victim = k;
          break;
        }
      }
      if (victim === null && this.rigs.size > this.rigsHard) {
        for (const k of this.rigs.keys()) {
          if (k !== fresh) {
            victim = k;
            break;
          }
        }
      }
      if (victim === null) return;
      const r = this.rigs.get(victim)!;
      this.rigs.delete(victim);
      this.free(r);
      this.st.evictions++;
    }
  }

  // Habille un clone de la base : corps recoloré (matériau propre au rig, texture partagée par base et peau),
  // garde-robe et visage liés au squelette du clone, mis à l'échelle du pantin.
  private build(desc: CitizenDesc, base: Base): Rig {
    const { model, info } = base;
    const clone = cloneSkinned(model.scene);
    let body: THREE.SkinnedMesh | null = null;
    clone.traverse((o) => { if (!body && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh; });
    if (!body) throw new Error('clone sans corps');
    const B: THREE.SkinnedMesh = body;
    const root = B.parent ?? clone;
    const baseSkin = this.baseSkin(base);
    // Teinte illisible : celle de la base (jamais de NaN dans les couleurs).
    const skin = rgbOf(desc.skin) ? desc.skin : (baseSkin ?? SKIN_DEFAUT);
    const bodyMat = new THREE.MeshToonMaterial({ map: this.tone(base, baseSkin, skin), gradientMap: TOON_RAMP });
    bodyMat.userData.outlineParameters = { thickness: outlineThickness(BODY_OUTLINE_PX, this.px) };
    B.material = bodyMat;
    let worn: THREE.Object3D[] = [];
    let face: THREE.SkinnedMesh;
    try {
      // Le parapluie de l'habitant est à part : fermé ou ouvert selon la clé de chaque rendu.
      worn = dressRig(info, expand(desc).filter((p) => !isUmbrella(p)), skin, B);
      face = faceLayer(info, model.face, skin, baseSkin ?? skin, B);
    } catch (e) {
      // Habillage impossible : rien ne doit rester alloué.
      disposeRig(worn);
      bodyMat.dispose();
      B.skeleton.dispose();
      throw e;
    }
    for (const o of [...worn, face]) root.add(o);
    const wrap = new THREE.Group();
    wrap.add(clone);
    const scale = rigHeight(desc.height, model.child) / info.H;
    wrap.scale.setScalar(scale);
    const own = desc.items.find((i) => i.what === 'parapluie');
    return {
      wrap, root, body: B, map: boneMap(B.skeleton), worn: [...worn, face], face, bodyMat, unitsToRig: 1 / scale, base,
      umbrellaColor: own ? own.color : null, closed: null, open: null, used: this.tickNo,
    };
  }

  // Parapluie du rendu : ouvert (vertical, manche dans la main droite) si `up`, sinon celui de l'habitant fermé, pointe en
  // bas (bras le long du corps, jamais levé). Chaque forme est construite une fois par rig, puis montrée ou cachée.
  private umbrella(rig: Rig, up: boolean): void {
    if (up && !rig.open) {
      rig.open = parapluieOuvert(rig.base.info, rig.umbrellaColor ?? PARAPLUIE_DEFAUT);
      rig.root.add(rig.open);
      rig.worn.push(rig.open);
    }
    if (!up && rig.umbrellaColor && !rig.closed) {
      rig.closed = accessory({ ...rig.base.info, body: rig.body }, 'parapluie', rig.umbrellaColor);
      for (const o of rig.closed) { o.name = 'parapluie-ferme'; rig.root.add(o); }
      rig.worn.push(...rig.closed);
    }
    for (const o of rig.closed ?? []) o.visible = !up;
    if (rig.open) {
      rig.open.visible = up;
      if (up) {
        // Au poing droit, droit dans le repère du rig (la scène n'y ajoute qu'une échelle).
        rig.open.position.copy(rig.root.worldToLocal(rig.map.bones.RightHand.getWorldPosition(vA)));
        rig.open.updateMatrixWorld(true);
      }
    }
  }

  private free(rig: Rig): void {
    rig.wrap.removeFromParent();
    disposeRig(rig.worn);
    rig.bodyMat.dispose();
    rig.body.skeleton.dispose();
  }

  // Peau d'origine de la base, mesurée une fois (null sans canvas : pas de recoloration).
  private baseSkin(base: Base): string | null {
    if (base.pixels === undefined) {
      base.pixels = pixelsOf(base.model.texture);
      base.skin = base.pixels ? measureSkin(base.info, base.model.texture, base.pixels) : null;
    }
    return base.skin;
  }

  private tone(base: Base, baseSkin: string | null, skin: string): THREE.Texture {
    if (!baseSkin || !base.pixels) return base.model.texture;
    const k = `${base.model.name}|${skin}`;
    let t = this.tones.get(k);
    if (!t) {
      const made = toneTexture(base.model.texture, base.pixels, baseSkin, skin);
      if (!made) return base.model.texture;
      t = made;
      this.tones.set(k, t);
    }
    return t;
  }

  // Accroches dans le repère du sprite (unités du pantin, pieds à l'origine, y vers le bas), comme `anchorsOf` :
  // poignets, centre et haut du crâne, nuque, bassin ; `hands` = milieu des deux mains.
  private anchors(rig: Rig): SpriteAnchors {
    const { info } = rig.base;
    const bones = rig.map.bones;
    const at = (o: THREE.Object3D): readonly [number, number] => {
      const [x, y] = toSprite(this.camera, o.getWorldPosition(vA));
      return [r2(x), r2(y)];
    };
    const S = (info.skull ??= skull(info));
    const head = info.idx.Head;
    const pt = (rest: THREE.Vector3): readonly [number, number] => {
      const [x, y] = toSprite(this.camera, carried(rig, head, rest, vA));
      return [r2(x), r2(y)];
    };
    const handR = at(bones.RightHand), handL = at(bones.LeftHand);
    return {
      handR,
      handL,
      hands: [r2((handR[0] + handL[0]) / 2), r2((handR[1] + handL[1]) / 2)],
      head: pt(S.c),
      headTop: pt(new THREE.Vector3(S.c.x, S.top, S.c.z)),
      nape: at(bones.Neck),
      seat: at(bones.Hips),
    };
  }
}
