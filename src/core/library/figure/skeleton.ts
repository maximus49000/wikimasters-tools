import { add3, mul3, type V3 } from './geometry';

// Squelette du pantin (maquette validée du 2026-10-11) : 40 unités de haut, pieds à y = 0, tête centrée vers y = 33.
// Orientation `yaw` (radians) : 0 regarde vers la droite de l'écran, π/2 vers le spectateur, π vers la gauche, 3π/2 de dos.
// Allures : debout, petits pas sur place (demi-tour), marche, assis, escalade (face à l'échelle), à vélo (`pedal`, pieds sur
// le pédalier) et en selle (`mount`, cheval ou moto : jambes le long du flanc). La hauteur du bassin est fixée par la jambe
// d'appui : le rebond du buste vient tout seul et le pied d'appui touche toujours le sol. En selle, le bassin est à RIDE_HIP
// et le site pose l'accroche `seat` (bassin) sur la selle de son dessin. Accroupi (`crouch`, G4b : ramasser au sol) : les
// deux jambes pliées pareil, genoux vers l'avant, pieds à plat et écartés, bassin à ≈ 55 % de la hauteur debout, buste penché.
// Vélo arrêté (`perch`, revue du 2026-10-13) : glissé à l'avant de la selle, un pied sur la pédale haute, l'autre posé au sol
// côté spectateur, mains au guidon.
export type Gait = 'stand' | 'step' | 'walk' | 'seated' | 'climb' | 'pedal' | 'mount' | 'crouch' | 'perch';
export const YAWS = 16;
export const PHASES = 12;
// Distance parcourue (unités du pantin) pendant un cycle complet de marche (deux pas) : règle la phase sur le déplacement.
export const STRIDE = 23;
const AMPLITUDE: Record<Gait, number> = { stand: 0, step: 0.35, walk: 1, seated: 0, climb: 1, pedal: 0, mount: 0, crouch: 0, perch: 0 };
// Accroupi : cuisse à 60° vers l'avant, genou plié à 120° (maquette G4b, `crouch` = 1), jambes écartées de 60 %, buste à 25°.
const CROUCH = { thigh: 60, knee: 120, spread: 1.6, lean: 25 } as const;
// Hauteur du bassin en selle ; pédalier (centre devant `f` et sous `d` la hanche, rayon `r`) ; une phase = 1/12 de tour.
export const RIDE_HIP = 13;
const PEDAL_D = 11;
export const PEDAL = { f: 3.2, d: PEDAL_D, r: 2.4 } as const;
const RIDE_LEAN: Readonly<Record<'pedal' | 'mount' | 'perch', number>> = { pedal: 22, mount: 4, perch: 14 };
// Vélo arrêté : bassin descendu (glissé vers le cadre), sol sous les roues dans le repère du pantin (vélo de ghibli-cyclist :
// pédalier 5,6 unités du vélo au-dessus du sol, pantin à l'échelle 0,7), pied au sol un peu en avant de la hanche.
export const PERCH = { drop: 2.5, groundY: RIDE_HIP - PEDAL_D - 5.6 / 0.7, footF: 1.6 } as const;
// En selle (cheval, moto) : cuisse vers l'avant et le bas, tibia qui retombe d'aplomb, genoux écartés de part et d'autre.
const MOUNT_THIGH = 50;
const MOUNT_SPREAD = 1.6;
export const riding = (g: Gait): g is 'pedal' | 'mount' | 'perch' => g === 'pedal' || g === 'mount' || g === 'perch';
export const LIMB = { thigh: 7.6, shin: 7.8, ankle: 1.0, upperArm: 6.3, foreArm: 5.6 } as const;

export type Frame3 = { F: V3; R: V3; U: V3 };
// F : devant, R : côté droit du corps, U : haut.
export const frameOf = (yaw: number): Frame3 => ({ F: [Math.cos(yaw), 0, Math.sin(yaw)], R: [-Math.sin(yaw), 0, Math.cos(yaw)], U: [0, 1, 0] });
export const at = (b: V3, fr: Frame3, f: number, u: number, l: number): V3 => add3(add3(add3(b, mul3(fr.F, f)), mul3(fr.U, u)), mul3(fr.R, l));

export type Leg = { hip: V3; knee: V3; ankle: V3; toe: V3; l: number };
export type Arm = { sh: V3; elb: V3; hand: V3; l: number };
export type Pose = { fr: Frame3; pelvis: V3; legs: [Leg, Leg]; arms: [Arm, Arm]; neck: V3; head: V3; headFrame: Frame3; lean: number; pelvisTurn: number; shoulderTurn: number };
// `headYaw` : rotation de la tête seule (radians) ; `umbrella` : bras droit levé qui tient un manche ;
// `arms` : pose des bras (cinématique inverse, 'swing' = balancement de marche) ; `lean` : penché vers l'avant (0, 1, 2).
export type PoseOpts = { headYaw?: number; umbrella?: boolean; arms?: ArmPose; lean?: number };

// Cortège et cyclistes (G3c) : `handlebar` (guidon, rênes), `horn` (trompette, clairon à la bouche), `rifle` (crosse tenue
// devant la hanche, bras gauche qui balance), `flag` (hampe tenue devant la poitrine, bras gauche qui balance).
// Commerces (G4b, portés de la cinématique inverse de la maquette du 2026-10-12) : gestes d'employés et de clients. Les gestes
// animés ont leurs poses clés en variantes `-1` / `-2` (le metteur en scène alterne) : essuyer, s'étirer, trinquer, emballer,
// ciseaux. `pick` va avec l'allure `crouch` (main droite vers le sol).
export type ArmPose =
  | 'swing' | 'down' | 'reach' | 'hold' | 'up' | 'work' | 'crossed' | 'raise' | 'cheer' | 'cup' | 'carry' | 'overhead' | 'tow' | 'guitar' | 'mic' | 'drum' | 'handlebar' | 'horn' | 'rifle' | 'flag'
  | 'give' | 'take' | 'point' | 'chin' | 'wave' | 'beckon' | 'pay-card' | 'pay-cash' | 'wipe-1' | 'wipe-2' | 'shelve' | 'phone' | 'yawn' | 'stretch-1' | 'stretch-2' | 'read' | 'toast-1' | 'toast-2'
  | 'weigh' | 'wrap-1' | 'wrap-2' | 'scissors-1' | 'scissors-2' | 'shampoo' | 'taste' | 'sniff' | 'pour' | 'notepad' | 'plates' | 'mirror' | 'frames' | 'hold-child' | 'tug' | 'sneeze' | 'pick'
  | 'handlebar-reach';
export const ARM_POSES: readonly ArmPose[] = [
  'swing', 'down', 'reach', 'hold', 'up', 'work', 'crossed', 'raise', 'cheer', 'cup', 'carry', 'overhead', 'tow', 'guitar', 'mic', 'drum', 'handlebar', 'horn', 'rifle', 'flag',
  'give', 'take', 'point', 'chin', 'wave', 'beckon', 'pay-card', 'pay-cash', 'wipe-1', 'wipe-2', 'shelve', 'phone', 'yawn', 'stretch-1', 'stretch-2', 'read', 'toast-1', 'toast-2',
  'weigh', 'wrap-1', 'wrap-2', 'scissors-1', 'scissors-2', 'shampoo', 'taste', 'sniff', 'pour', 'notepad', 'plates', 'mirror', 'frames', 'hold-child', 'tug', 'sneeze', 'pick',
  'handlebar-reach',
];
// Penché vers l'avant par niveau (gestes des commerces).
export const LEAN_DEG = 8;
type T3 = readonly [number, number, number];
const DOWN: T3 = [1, -11, 0.8];
// Cibles de main depuis l'épaule, dans le repère du torse (f devant, u haut, o vers l'extérieur ; o < 0 : vers l'intérieur).
// [bras gauche, bras droit] ; null = balancement de marche (swing). Le bras droit est celui des gestes.
const TARGETS: Readonly<Record<ArmPose, readonly [T3 | null, T3 | null]>> = {
  swing: [null, null],
  down: [DOWN, DOWN],
  reach: [DOWN, [9, -4, 0.5]],
  hold: [DOWN, [6.5, -6, -1]],
  up: [DOWN, [3, 9, 0.8]],
  work: [[7, -8.5, -1.5], [8, -8, -1.5]],
  crossed: [[3.6, -5.6, -6.2], [3.2, -5, -6.6]],
  raise: [DOWN, [1.5, 11.5, 1]],
  cheer: [[1.5, 11.5, 1.8], [1.5, 11.5, 1.8]],
  cup: [DOWN, [4.5, -4.5, -0.8]],
  carry: [[7, -9, -2], [7, -9, -2]],
  overhead: [[2.5, 10.5, -1.2], [2.5, 10.5, -1.2]],
  tow: [DOWN, [-5, -10, 0.8]],
  guitar: [[6, -4, -7], [4, -8, -2]],
  mic: [DOWN, [3, 4.5, -3.2]],
  drum: [[6, -7, -2.5], [6, -7, -2.5]],
  handlebar: [[9, -4, -0.6], [9, -4, -0.6]],
  horn: [[5, 4, -3.2], [6.2, 4.4, -2.6]],
  rifle: [null, [3.5, -7, -1.5]],
  flag: [null, [9, -1, -0.3]],
  // Commerces (G4b). Maquette : cibles depuis le bassin, l latéral ; ici depuis l'épaule (u − 10,6, o = |l| − 4,2).
  give: [DOWN, [9.5, -3.5, -2.2]], // tend un objet, main à hauteur de poitrine
  take: [DOWN, [7.5, -5.5, -2]], // prend un objet posé (plus bas, plus près)
  point: [DOWN, [11.3, -2, -0.3]], // bras tendu qui désigne
  chin: [DOWN, [4.4, 2.2, -3.4]], // main au menton (hésite)
  wave: [DOWN, [2.5, 5.5, 3.5]], // salue, main levée à côté de la tête
  beckon: [DOWN, [3.5, 9.5, 1.5]], // appelle, bras tendu au-dessus de la tête
  'pay-card': [DOWN, [8.5, -5, -2.2]], // carte posée sur le terminal
  'pay-cash': [[0.5, -8.4, 0.6], [7.5, -6, -1.5]], // main gauche à la poche, billets tendus
  'wipe-1': [[7, -6.5, -0.5], [9.2, -6.5, -2.4]], // essuie le comptoir, chiffon loin
  'wipe-2': [[7, -6.5, -0.5], [6.2, -6.2, 1.8]], // … chiffon ramené sur le côté
  shelve: [DOWN, [7, 6.5, -0.5]], // range en rayon, main en hauteur devant
  phone: [DOWN, [2.6, 5.2, 0.4]], // téléphone à l'oreille
  yawn: [[1.5, -9.5, 2.5], [4.5, 2.8, -2.8]], // bâille, main devant la bouche, l'autre bras s'écarte
  'stretch-1': [[2, 7, 5], [2, 7, 5]], // s'étire, bras écartés en V
  'stretch-2': [[0.5, 11.6, 0.8], [0.5, 11.6, 0.8]], // … bras tendus au ciel
  read: [[5.5, -1.1, -1.7], [5.5, -0.6, -2.7]], // livre ou carte tenu à deux mains devant la poitrine
  'toast-1': [DOWN, [5.5, -3.5, -1.5]], // verre à la poitrine
  'toast-2': [DOWN, [7.5, 2.5, -1.5]], // … verre levé en avant
  weigh: [[7.5, -4.6, -1.2], [7.5, -5.6, -1.2]], // pèse, mains au-dessus de la balance
  'wrap-1': [[8.8, -5.8, -1.7], [5.4, -5.2, -1.7]], // emballe, main gauche en avant
  'wrap-2': [[5.4, -5.2, -1.7], [8.8, -5.8, -1.7]], // … main droite en avant
  'scissors-1': [[6, 2.4, -0.4], [8, 2.2, -3]], // coupe la tête du client assis (à hauteur d'épaule), ciseaux ouverts
  'scissors-2': [[6, 2.4, -0.4], [7.6, 1, -2.2]], // … ciseaux fermés
  shampoo: [[8.5, 1.8, 0.6], [6.5, 2, 0.6]], // deux mains sur la tête du client renversée au bac
  taste: [DOWN, [4.4, 2.6, -2.8]], // goûte, main à la bouche
  sniff: [DOWN, [5.6, 1.6, -3]], // sent, objet sous le nez
  pour: [[7, -4.6, -1.7], [6.5, 1.4, -4]], // verse : verre tenu, bouteille levée au-dessus
  notepad: [[6, -2.6, -2], [6.3, -1.8, -3.4]], // écrit sur le carnet
  plates: [[7, -2.5, 1.5], [7, -2.5, 1.5]], // porte des assiettes, deux mains en avant, écartées
  mirror: [DOWN, [5, 3.5, 4]], // tend le miroir, bras écarté à hauteur de visage
  frames: [[4.2, 3.2, 0.2], [4.2, 3.2, 0.2]], // essaie des lunettes, mains aux tempes
  'hold-child': [DOWN, [3.2, -6.5, 3.5]], // tient la main d'un enfant, bras écarté vers le bas
  tug: [DOWN, [6, 3, 1.5]], // enfant qui tire la manche, main levée vers l'adulte
  sneeze: [DOWN, [4.2, 3.4, -2.4]], // éternue, main devant le visage, coude sorti
  pick: [[6, -7, 0.5], [7.5, -18.6, -2.2]], // ramasse au sol (allure `crouch`), bras droit vers le sol
  // Deux-roues motorisés (revue du 2026-10-13) : guidon loin devant la selle, bras presque tendus, mains sur les poignées.
  'handlebar-reach': [[10.4, -3, -0.6], [10.4, -3, -0.6]],
};
// side : -1 bras gauche (l < 0), +1 bras droit.
export const armTarget = (pose: ArmPose, side: -1 | 1): T3 | null => TARGETS[pose][side < 0 ? 0 : 1];

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a: V3): V3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
// Deux segments (épaule → coude → main) vers `target` ; le coude part vers `pole` (bas, extérieur, un peu en arrière).
function ik(sh: V3, target: V3, pole: V3, a: number = LIMB.upperArm, b: number = LIMB.foreArm): { elb: V3; hand: V3 } {
  const v = sub3(target, sh);
  const d = Math.min(a + b - 1e-6, Math.max(Math.abs(a - b) + 1e-6, Math.hypot(v[0], v[1], v[2])));
  const n = norm3(v);
  const pv = sub3(pole, sh);
  const perp = norm3(sub3(pv, mul3(n, dot3(pv, n))));
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const elb = add3(sh, add3(mul3(n, a * cosA), mul3(perp, a * sinA)));
  return { elb, hand: add3(sh, mul3(n, d)) };
}

const D = Math.PI / 180;

export function poseOf(yaw: number, phase: number, gait: Gait, opts: PoseOpts = {}): Pose {
  const fr = frameOf(yaw);
  const w = AMPLITUDE[gait];
  // Part « de face / de dos » de l'orientation (0 de profil, 1 face au spectateur ou de dos).
  const front = Math.abs(Math.sin(yaw));
  const seated = gait === 'seated';
  const climb = gait === 'climb';
  const crouch = gait === 'crouch';
  const ride = riding(gait);
  const armsPose = opts.arms ?? 'swing';
  const leanLevel = Math.max(0, Math.min(2, opts.lean ?? 0));
  const legAngles = (ph: number): [number, number] => {
    // Accroupi : les deux jambes pliées pareil, sans phase ; le bassin descend avec la jambe d'appui (≈ 55 % de debout).
    if (crouch) return [CROUCH.thigh * D, CROUCH.knee * D];
    if (climb) {
      // Montée de barreau en barreau : la cuisse monte et le genou se plie ensemble, en alternance.
      const t = (30 + 30 * Math.sin(ph)) * D;
      return [t, t * 1.6];
    }
    // De face ou de dos (`front` → 1), l'aller-retour avant/arrière des jambes ne se voit presque pas (caméra peu inclinée) :
    // le pied d'appui semblait glisser sous un corps qui avance (« moonwalk »). On réduit ce va-et-vient et on lève franchement
    // la jambe libre (cuisse et genou), qui se lit de face.
    const swing = Math.max(0, Math.cos(ph + 0.35)) ** 2;
    const th = w * (24 * (1 - 0.55 * front) * Math.sin(ph) + 26 * front * swing);
    const k = 4 + w * (55 + 30 * front) * swing;
    return [th * D, k * D];
  };
  const A = seated ? ([90 * D, 90 * D] as [number, number]) : legAngles(phase);
  const B = seated ? ([90 * D, 90 * D] as [number, number]) : legAngles(phase + Math.PI);
  const reach = ([th, k]: [number, number]): number => LIMB.thigh * Math.cos(th) + LIMB.shin * Math.cos(th - k);
  // Escalade : le site place le pantin sur les barreaux, le bassin reste à la hauteur de jambe tendue.
  const hipY = gait === 'perch' ? RIDE_HIP - PERCH.drop : ride ? RIDE_HIP : seated ? LIMB.shin + LIMB.ankle + 0.6 : climb ? LIMB.thigh + LIMB.shin + LIMB.ankle : Math.max(reach(A), reach(B)) + LIMB.ankle;
  const lean = ((ride ? RIDE_LEAN[gait] : seated ? 2 : climb ? 4 : crouch ? CROUCH.lean : 3 * w) + leanLevel * LEAN_DEG) * D;
  const pelvisTurn = seated || climb || ride ? 0 : w * 6 * Math.sin(phase) * D;
  const shoulderTurn = seated || climb || ride ? 0 : -w * 7 * Math.sin(phase) * D;
  // De face ou de dos, le bassin se porte sur la jambe d'appui (léger balancement de côté), comme une vraie démarche vue de face.
  const sway = seated || climb || ride || crouch ? 0 : w * front * 0.9 * Math.sin(phase);
  const pelvis: V3 = add3([0, hipY, 0], mul3(fr.R, sway));
  const off = (rot: number, l: number): V3 => add3(mul3(fr.R, l * Math.cos(rot)), mul3(fr.F, -l * Math.sin(rot)));
  const spread = crouch ? CROUCH.spread : 1;
  const legs = ([[A, -2.1 * spread], [B, 2.1 * spread]] as const).map(([[th, k], l], i) => {
    const hip = add3(pelvis, off(pelvisTurn, l));
    if (gait === 'perch') {
      // Pied du côté spectateur (l > 0) posé au sol ; l'autre sur la pédale haute, à l'avant (prêt à repartir). Le pédalier
      // reste à sa place sur le vélo (calculé depuis le bassin de selle, avant la descente).
      if (l > 0) {
        const target = at(add3(pelvis, [0, PERCH.drop, 0]), fr, PERCH.footF, -(RIDE_HIP - PERCH.groundY) + LIMB.ankle, l * 0.6);
        const { elb: knee, hand: ankle } = ik(hip, target, at(hip, fr, 10, 0, 0), LIMB.thigh, LIMB.shin);
        return { hip, knee, ankle, toe: at(ankle, fr, 3.0, -0.6, 0), l };
      }
      const c = at(add3(pelvis, [0, PERCH.drop, 0]), fr, PEDAL.f, -PEDAL.d, l);
      const target = at(c, fr, PEDAL.r * Math.cos(0.8), PEDAL.r * Math.sin(0.8), 0);
      const { elb: knee, hand: ankle } = ik(hip, target, at(hip, fr, 10, 2, 0), LIMB.thigh, LIMB.shin);
      return { hip, knee, ankle, toe: at(ankle, fr, 3.0, -0.6, 0), l };
    }
    if (gait === 'pedal') {
      // Cheville sur le cercle du pédalier (sens de la marche : le pied passe en haut vers l'avant), pieds en opposition ;
      // genou par cinématique inverse, vers l'avant.
      const c = at(pelvis, fr, PEDAL.f, -PEDAL.d, l);
      const a = -phase + (i === 0 ? 0 : Math.PI);
      const target = at(c, fr, PEDAL.r * Math.cos(a), PEDAL.r * Math.sin(a), 0);
      const { elb: knee, hand: ankle } = ik(hip, target, at(hip, fr, 10, 2, 0), LIMB.thigh, LIMB.shin);
      return { hip, knee, ankle, toe: at(ankle, fr, 3.0, -0.6, 0), l };
    }
    if (gait === 'mount') {
      const t = MOUNT_THIGH * D;
      const knee = at(hip, fr, LIMB.thigh * Math.sin(t), -LIMB.thigh * Math.cos(t), l * (MOUNT_SPREAD - 1));
      const ankle = at(knee, fr, 0, -LIMB.shin, 0);
      return { hip, knee, ankle, toe: at(ankle, fr, 3.0, -0.6, 0), l };
    }
    const knee = at(hip, fr, LIMB.thigh * Math.sin(th), -LIMB.thigh * Math.cos(th), l * 0.05);
    const sa = th - k;
    const ankle = at(knee, fr, LIMB.shin * Math.sin(sa), -LIMB.shin * Math.cos(sa), 0);
    // Pied à plat assis et accroupi (le tibia plié ferait plonger la pointe sous le sol).
    const a = seated || crouch ? 0 : sa * 0.6;
    const toe = at(ankle, fr, 3.0 * Math.cos(a), 3.0 * Math.sin(a) - 0.6, 0);
    return { hip, knee, ankle, toe, l };
  }) as [Leg, Leg];
  const shY = 10.6;
  const arms = ([-4.2, 4.2] as const).map((l) => {
    const sh = at(add3(pelvis, off(shoulderTurn, l)), fr, shY * Math.sin(lean), shY * Math.cos(lean), 0);
    const side = l < 0 ? -1 : 1;
    const perchUp = (t: T3 | null): T3 | null => (t && gait === 'perch' ? [t[0], t[1] + PERCH.drop, t[2]] : t);
    const target: T3 | null = climb && armsPose === 'swing' ? [2, 6 + 2 * Math.sin(phase) * side, 0.5] : opts.umbrella && l > 0 ? null : perchUp(armTarget(armsPose, side));
    if (target) {
      // Repère du torse (penché) : la main vise une cible depuis l'épaule, le coude part vers le bas / l'extérieur / l'arrière.
      const tF = add3(mul3(fr.F, Math.cos(lean)), mul3(fr.U, -Math.sin(lean)));
      const tU = add3(mul3(fr.U, Math.cos(lean)), mul3(fr.F, Math.sin(lean)));
      const goal = add3(sh, add3(add3(mul3(tF, target[0]), mul3(tU, target[1])), mul3(fr.R, side * target[2])));
      const pole = sub3(add3(sh, mul3(fr.R, side * 3)), add3(mul3(tU, 6), mul3(tF, 1.5)));
      return { sh, ...ik(sh, goal, pole), l };
    }
    let al: number;
    let e: number;
    if (opts.umbrella && l > 0) {
      al = 120 * D;
      e = 45 * D;
    } else if (seated) {
      al = 22 * D * (l < 0 ? 1 : 0.7);
      e = 70 * D;
    } else {
      al = (l < 0 ? -1 : 1) * w * 20 * Math.sin(phase) * D;
      e = (10 + w * 12 * Math.max(0, Math.sin((al / D / 20) * (Math.PI / 2)))) * D + w * 6 * D;
      // De face ou de dos : le bras qui part en avant plie le coude, l'avant-bras remonte devant le corps (lisible de face).
      e += w * front * 45 * Math.max(0, (l < 0 ? -1 : 1) * Math.sin(phase)) * D;
    }
    const elb = at(sh, fr, LIMB.upperArm * Math.sin(al), -LIMB.upperArm * Math.cos(al), Math.sign(l) * 0.5);
    const fa = al + e;
    const hand = at(elb, fr, LIMB.foreArm * Math.sin(fa), -LIMB.foreArm * Math.cos(fa), Math.sign(l) * 0.4);
    return { sh, elb, hand, l };
  }) as [Arm, Arm];
  const neck = at(pelvis, fr, 12.2 * Math.sin(lean), 12.2 * Math.cos(lean), 0);
  const head = at(pelvis, fr, 16.5 * Math.sin(lean) + 0.4, 16.5 * Math.cos(lean), 0);
  return { fr, pelvis, legs, arms, neck, head, headFrame: frameOf(yaw + (opts.headYaw ?? 0)), lean, pelvisTurn, shoulderTurn };
}
