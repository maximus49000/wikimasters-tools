// Visages des habitants 3D (porté du banc `face-layer.js`) : une coque très fine posée sur l'avant de la tête, dont le
// shader dessine, dans le repère du crâne (s = côté, u = hauteur, en tailles de tête), les paupières, les sourcils et la
// bouche. Les repères viennent du manifeste (mesurés au banc sur le modèle pleine résolution) ; les caches (paupière,
// sourcil, tour de bouche) prennent la couleur de peau locale de chaque côté, ramenée à la teinte de l'habitant.
// Tout est piloté par des réglages continus :
//  • paupière : 0 = ouverte → 1 = fermée ; elle DESCEND depuis le haut de l'œil, le bord porte les cils ;
//  • « yeux rieurs » (0 → 1) : la fente fermée se cambre vers le haut (^^) ;
//  • sourcils : hauteur du bout intérieur et du bout extérieur ;
//  • bouche : courbure, demi-largeur, ouverture haute/basse, dents.
// Les sprites étant figés (images rendues une fois), l'état est posé d'un coup (`userData.set`) ; les transitions entre
// émotions (`blendEmotion`) et le clignement (`blinkAt`) sont des fonctions pures du temps, pour fabriquer les images.
import * as THREE from 'three';
import type { Emotion } from './catalogue';
import type { FaceMarks } from './manifest';
import { skull, shell, type BodyInfo, type VertexInfo } from './wardrobe';
import type { ArmPose } from '../library/figure/skeleton';

export type { Emotion };

// Réglages d'une expression : lid (paupière), happy (yeux rieurs), bIn/bOut (sourcils, en tailles de tête, 0 = position
// d'origine), on (1 = sourcils redessinés), mC (courbure de la bouche, + = coins relevés), mW (demi-largeur), mT/mB
// (ouverture au-dessus/au-dessous), teeth, mOn (1 = bouche redessinée).
export type FaceParams = {
  lid: number; happy: number; bIn: number; bOut: number; on: number;
  mC: number; mW: number; mT: number; mB: number; teeth: number; mOn: number;
};

export const EMOTIONS: Readonly<Record<Emotion, Readonly<FaceParams>>> = {
  neutre: { lid: 0, happy: 0, bIn: 0, bOut: 0, on: 0, mC: 0, mW: 0.06, mT: 0, mB: 0, teeth: 0, mOn: 0 },
  content: { lid: 0.12, happy: 0, bIn: 0.01, bOut: 0.005, on: 1, mC: 6.5, mW: 0.075, mT: 0, mB: 0, teeth: 0, mOn: 1 },
  heureux: { lid: 1, happy: 1, bIn: 0.04, bOut: 0.03, on: 1, mC: 8, mW: 0.085, mT: 0.004, mB: 0.036, teeth: 1, mOn: 1 },
  triste: { lid: 0.3, happy: 0, bIn: 0.04, bOut: -0.022, on: 1, mC: -6, mW: 0.065, mT: 0, mB: 0, teeth: 0, mOn: 1 },
  surpris: { lid: 0, happy: 0, bIn: 0.05, bOut: 0.04, on: 1, mC: 0, mW: 0.03, mT: 0.034, mB: 0.036, teeth: 0, mOn: 1 },
  fache: { lid: 0.25, happy: 0, bIn: -0.035, bOut: 0.025, on: 1, mC: -1.5, mW: 0.058, mT: 0, mB: 0, teeth: 0, mOn: 1 },
  inquiet: { lid: 0.15, happy: 0, bIn: 0.035, bOut: -0.015, on: 1, mC: -2, mW: 0.05, mT: 0, mB: 0, teeth: 0, mOn: 1 },
};
const KEYS = Object.keys(EMOTIONS.neutre) as (keyof FaceParams)[];

/** Durée conseillée d'une transition entre deux émotions (secondes), celle du banc. */
export const EMOTION_TRANSITION_S = 0.35;

const ease = (x: number): number => x * x * (3 - 2 * x);

// Transition d'une émotion à l'autre, k = avancement linéaire 0 → 1 (adouci ici). Les sourcils et la bouche redessinés
// restent affichés pendant la transition et ne s'effacent qu'à l'arrivée sur « neutre » (sinon ils sautent).
export function blendEmotion(from: Emotion, to: Emotion, k: number): FaceParams {
  if (k <= 0) return { ...EMOTIONS[from] };
  if (k >= 1) return { ...EMOTIONS[to] };
  const a = { ...EMOTIONS[from] }, b = { ...EMOTIONS[to] };
  if (a.on || b.on) a.on = b.on = 1;
  if (a.mOn || b.mOn) a.mOn = b.mOn = 1;
  const e = ease(k), out = { ...a };
  for (const key of KEYS) out[key] = a[key] + (b[key] - a[key]) * e;
  return out;
}

const FRAG = `
uniform vec3 uInk; uniform vec3 uLip;
uniform vec3 uLidL; uniform vec3 uLidR; uniform vec3 uBrowSkL; uniform vec3 uBrowSkR; uniform vec3 uMouthSk;
uniform vec4 uEyeL; uniform vec4 uEyeR; uniform vec4 uBrowL; uniform vec4 uBrowR; uniform float uMouthU; uniform float uLine;
uniform float uLid; uniform float uHappy; uniform float uBIn; uniform float uBOut; uniform float uBOn;
uniform float uMC; uniform float uMW; uniform float uMT; uniform float uMB; uniform float uTeeth; uniform float uMOn;
varying vec2 vSU;
float segDist(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// Paupière : bord y = edge + k·x² qui descend du haut (ouverte) à la fente (fermée). Codes : 0 rien, 1 peau, 2 encre.
float eye(vec2 p, vec4 e) {
  float lid = clamp(uLid, 0.0, 1.0);
  if (lid < 0.02) return 0.0;
  vec2 q = p - e.xy;
  vec2 rad = vec2(e.z * 0.62 + 0.02, e.w * 0.5 + 0.02);
  if (length(q / rad) > 1.0) return 0.0;
  float top = rad.y, slit = -e.w * 0.04;
  float k = mix(-1.0, mix(-1.6, 2.4, uHappy), lid);
  float edge = mix(top, slit, lid) + k * q.x * q.x;
  if (abs(q.y - edge) < uLine && abs(q.x) < e.z * 0.55) return 2.0;
  return q.y > edge ? 1.0 : 0.0;
}
// Sourcil : cache de peau assez grand pour masquer le sourcil peint, trait d'encre entre les deux bouts.
float brow(vec2 p, vec4 b, float side) {
  if (uBOn < 0.5) return 0.0;
  vec2 q = p - b.xy;
  if (length(q / vec2(b.z * 0.66 + 0.03, b.w * 1.2 + 0.04)) > 1.0) return 0.0;
  vec2 inner = vec2(-side * b.z * 0.48, uBIn), outer = vec2(side * b.z * 0.48, uBOut);
  return segDist(q, inner, outer) < uLine * 1.2 ? 2.0 : 1.0;
}
// Bouche : courbe médiane y = c·x² ; ouverture en lentille (haut +mT, bas −mB, nulles aux coins). Codes : 3 intérieur, 4 dents.
float mouth(vec2 p) {
  if (uMOn < 0.5) return 0.0;
  vec2 q = p - vec2(0.0, uMouthU);
  if (length(q / vec2(0.12, 0.07)) > 1.0) return 0.0;
  float hw = uMW;
  if (abs(q.x) > hw + uLine) return 1.0;
  float t = clamp(1.0 - (q.x / hw) * (q.x / hw), 0.0, 1.0);
  float mid = uMC * q.x * q.x - uMC * hw * hw * 0.35;
  float topY = mid + uMT * t, botY = mid - uMB * t;
  bool open = uMT + uMB > 0.006;
  if (open && q.y < topY && q.y > botY) {
    if (min(topY - q.y, q.y - botY) < uLine * 0.8) return 2.0;
    return (uTeeth > 0.5 && q.y > topY - 0.016) ? 4.0 : 3.0;
  }
  if (abs(q.y - topY) < uLine || (open && abs(q.y - botY) < uLine)) return 2.0;
  return 1.0;
}
`;

type Rgb = readonly [number, number, number];

// Calque du visage d'un habitant. `skin` = sa teinte de peau (après recoloration), `baseSkin` = la peau d'origine du
// modèle : les couleurs locales mesurées sur la base sont ramenées à la teinte choisie par le rapport skin / baseSkin.
// Lié à 100 % à l'os de la tête du squelette de `body` (le corps analysé, ou un clone SkeletonUtils de la même base),
// comme `dressRig`. `userData.set(e, blink)` fige l'état (émotion ou réglages de `blendEmotion`, clignement 0 → 1).
export function faceLayer(info: BodyInfo, marks: FaceMarks, skin: string, baseSkin: string = skin, body: THREE.SkinnedMesh = info.body): THREE.SkinnedMesh {
  const S = (info.skull ??= skull(info));
  const tgt = new THREE.Color(skin), base = new THREE.Color(baseSkin);
  const local = (rgb: Rgb | undefined): THREE.Color => {
    if (!rgb) return tgt.clone();
    const c = new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
    const r = (x: number, t: number, b: number): number => Math.min(1, (x * t) / Math.max(b, 1e-4));
    return new THREE.Color(r(c.r, tgt.r, base.r), r(c.g, tgt.g, base.g), r(c.b, tgt.b, base.b));
  };
  // Avant de la tête : devant le plan f = 0,15, entre les tempes, du menton (u = −0,6) au front (u = 0,35).
  const near = (v: VertexInfo): number => {
    if (v.part !== 'head') return -1;
    const s = (v.x - S.c.x) / S.size, u = (v.y - S.c.y) / S.size, f = (v.z - S.c.z) / S.size;
    return Math.min(f - 0.15, 0.5 - Math.abs(s), u + 0.6, 0.35 - u);
  };
  const mesh = shell({ ...info, body }, near, 0.0012, '#ffffff');
  // Visage rigide : tout sur l'os de la tête (pas de pli de la coque au cou quand la tête tourne).
  const n = mesh.geometry.attributes.position!.count, head = info.idx.Head;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = head; sw[i * 4] = 1; }
  mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));

  const v4 = (o: { s: number; u: number; w: number; h: number }) => new THREE.Vector4(o.s, o.u, o.w, o.h);
  const U = {
    uInk: { value: new THREE.Color('#2a1a14') }, uLip: { value: new THREE.Color('#7a2e2a') },
    uLidL: { value: local(marks.lidSkin[0]) }, uLidR: { value: local(marks.lidSkin[1]) },
    uBrowSkL: { value: local(marks.browSkin[0]) }, uBrowSkR: { value: local(marks.browSkin[1]) }, uMouthSk: { value: local(marks.mouthSkin) },
    uEyeL: { value: v4(marks.eyes[0]) }, uEyeR: { value: v4(marks.eyes[1]) }, uBrowL: { value: v4(marks.brows[0]) }, uBrowR: { value: v4(marks.brows[1]) },
    uMouthU: { value: marks.mouthU }, uLine: { value: 0.015 },
    uLid: { value: 0 }, uHappy: { value: 0 }, uBIn: { value: 0 }, uBOut: { value: 0 }, uBOn: { value: 0 },
    uMC: { value: 0 }, uMW: { value: 0.06 }, uMT: { value: 0 }, uMB: { value: 0 }, uTeeth: { value: 0 }, uMOn: { value: 0 },
    uC: { value: new THREE.Vector3(S.c.x, S.c.y, S.size) },
  };
  const m = mesh.material as THREE.MeshToonMaterial;
  m.side = THREE.FrontSide;
  m.userData.outlineParameters = { visible: false };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec3 bindPos;\nuniform vec3 uC;\nvarying vec2 vSU;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSU = vec2((bindPos.x - uC.x) / uC.z, (bindPos.y - uC.y) / uC.z);');
    sh.fragmentShader = FRAG + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float eL = eye(vSU, uEyeL), eR = eye(vSU, uEyeR), bL = brow(vSU, uBrowL, 1.0), bR = brow(vSU, uBrowR, -1.0), mo = mouth(vSU);
      float k = max(max(max(eL, eR), max(bL, bR)), mo);
      if (k < 0.5) discard;
      vec3 sk = eL > 0.5 ? uLidL : eR > 0.5 ? uLidR : bL > 0.5 ? uBrowSkL : bR > 0.5 ? uBrowSkR : uMouthSk;
      diffuseColor.rgb = k < 1.5 ? sk : k < 2.5 ? uInk : k < 3.5 ? uLip : vec3(1.0);`);
  };
  m.customProgramCacheKey = () => 'face-layer-2';

  // Pose immédiate : le clignement s'ajoute à la paupière de l'émotion (jusqu'à fermeture complète).
  const set = (e: Emotion | FaceParams, blink = 0): void => {
    const p = typeof e === 'string' ? EMOTIONS[e] : e;
    const lid = Math.max(p.lid, 0), b = Math.max(0, Math.min(1, blink));
    U.uLid.value = Math.min(1, lid + b * (1 - lid));
    U.uHappy.value = p.happy; U.uBIn.value = p.bIn; U.uBOut.value = p.bOut; U.uBOn.value = p.on > 0.01 ? 1 : 0;
    U.uMC.value = p.mC; U.uMW.value = p.mW; U.uMT.value = p.mT; U.uMB.value = p.mB; U.uTeeth.value = p.teeth > 0.5 ? 1 : 0;
    U.uMOn.value = p.mOn > 0.01 ? 1 : 0;
  };
  mesh.userData.face = U;
  mesh.userData.set = set;
  set('neutre', 0);
  return mesh;
}

// ── Clignement naturel ────────────────────────────────────────────────────────────────────────────────────────────
// Courbe d'un clignement (ms depuis son début) : descente rapide (70 ms), tenue (40 ms), remontée plus lente (130 ms).
const DOWN = 70, HOLD = 40, UP = 130, BLINK = DOWN + HOLD + UP;
function curve(x: number): number {
  if (x <= 0 || x >= BLINK) return 0;
  if (x < DOWN) return (x / DOWN) * (x / DOWN);
  if (x <= DOWN + HOLD) return 1;
  const y = (x - DOWN - HOLD) / UP;
  return 1 - y * (2 - y);
}

// Tirage pseudo-aléatoire déterministe dans [0, 1) pour (graine, bloc, rang, usage).
function rnd(seed: number, block: number, i: number, salt: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(block | 0, 0x85ebca6b) ^ Math.imul((i + 1) | 0, 0xc2b2ae35) ^ Math.imul(salt + 7, 0x27d4eb2f);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Le temps est découpé en blocs d'une minute : chaque bloc a son premier clignement (dans sa première seconde) et ses
// intervalles tirés selon son rang, si bien qu'un instant lointain ne coûte que le bloc qui le contient (~15 tirages).
// Le dernier intervalle d'un bloc va jusqu'au premier clignement du bloc suivant, et reste lui aussi dans [2 s, 6 s].
const BLOCK = 60_000, MIN = 2000, MAX = 6000, DOUBLE = 0.15;
const firstOf = (seed: number, b: number): number => b * BLOCK + Math.round(rnd(seed, b, -1, 0) * 1000);

// Abaissement de la paupière (0 → 1 → 0) à l'instant t (ms) pour un habitant (graine) : intervalles de 2 à 6 s entre
// deux débuts, 15 % de clignements doublés (le second suit la fin du premier de 80 à 120 ms).
export function blinkAt(t: number, seed: number): number {
  const b = Math.floor(t / BLOCK), next = firstOf(seed, b + 1);
  let cur = firstOf(seed, b);
  for (let i = 0; cur < next; i++) {
    let v = curve(t - cur);
    if (rnd(seed, b, i, 1) < DOUBLE) v = Math.max(v, curve(t - (cur + BLINK + 80 + Math.round(rnd(seed, b, i, 2) * 40))));
    if (t < cur + 2 * BLINK + 120) return v;
    const R = next - cur;
    cur += R <= MAX ? R : MIN + Math.round(rnd(seed, b, i, 3) * (Math.min(MAX, R - MIN) - MIN));
  }
  return 0;
}

// ── Émotion tirée du geste ────────────────────────────────────────────────────────────────────────────────────────
const GESTURE_EMOTION: Partial<Record<ArmPose, Emotion>> = {
  'pay-card': 'content', 'pay-cash': 'content', take: 'content', give: 'content', wave: 'content',
  'toast-1': 'heureux', 'toast-2': 'heureux', cheer: 'heureux', raise: 'heureux',
  sneeze: 'surpris',
  crossed: 'inquiet', chin: 'inquiet',
};

/** Émotion affichée pendant un geste ; hors des gestes expressifs, l'humeur de l'habitant. */
export function emotionFor(arms: ArmPose, mood: Emotion): Emotion {
  return GESTURE_EMOTION[arms] ?? mood;
}

// ── Clé d'état des sprites ────────────────────────────────────────────────────────────────────────────────────────
const CODE: Record<Emotion, string> = { neutre: '', content: 'c', heureux: 'h', triste: 't', surpris: 's', fache: 'f', inquiet: 'i' };

/** Clignement ramené à trois niveaux (ouvert, mi-clos, fermé) : les images en cache sont rendues à ces valeurs. */
export function blinkLevel(blink: number): 0 | 0.5 | 1 {
  return blink < 0.25 ? 0 : blink < 0.75 ? 0.5 : 1;
}

/** Clé courte d'un état du visage (cache des sprites) : `''` pour neutre yeux ouverts. */
export function faceState(e: Emotion, blink: number): string {
  // Yeux déjà fermés par l'émotion (heureux) : le clignement ne change pas l'image.
  const lvl = EMOTIONS[e].lid >= 1 ? 0 : blinkLevel(blink);
  return CODE[e] + (lvl === 0 ? '' : lvl === 0.5 ? 'b5' : 'b1');
}

const DECODE = Object.fromEntries(Object.entries(CODE).map(([e, c]) => [c, e as Emotion])) as Record<string, Emotion>;

/** Inverse de `faceState` (rendu des sprites) : émotion et niveau de clignement ; clé inconnue → neutre, yeux ouverts. */
export function parseFaceState(s: string): { emotion: Emotion; blink: 0 | 0.5 | 1 } {
  const m = /^([a-z]?)(b5|b1)?$/.exec(s);
  const emotion = m ? DECODE[m[1]!] : undefined;
  if (!m || !emotion) return { emotion: 'neutre', blink: 0 };
  return { emotion, blink: m[2] === 'b5' ? 0.5 : m[2] === 'b1' ? 1 : 0 };
}
