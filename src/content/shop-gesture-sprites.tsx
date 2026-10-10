import type { ReactElement } from 'react';
import type { Outfit } from '../core/library/city/people';
import type { Pose } from '../core/library/city/shops/gestures';
import type { Sky } from '../core/library/sky';
import { PersonSprite, SEAT_DROP, tone } from './city-sprites';

// Gestes de travail (vague 1b-iv-b) : un passant (PersonSprite) avec un bras, une main et l'accessoire du commerce, que la
// boucle d'animation met en pose (applyPose) sans re-rendu React. Repère du passant : pieds à l'origine, il regarde vers +x,
// épaule avant vers (1, -26). Les accessoires sont dessinés autour de (0, 0) (la main), ≈ 6 à 9 unités du passant, soit
// 3 à 5 px à l'écran derrière une vitrine (limite assumée : lisibles surtout en grande fenêtre). Aucun id, aucune animation CSS.

// Bras selon la pose : trait de l'épaule à la main, et position de la main (où l'objet est tenu).
const ARM: Readonly<Record<Pose['arms'], { d: string; hand: readonly [number, number] }>> = {
  down: { d: 'M1 -26 L2.5 -16', hand: [2.5, -16] },
  reach: { d: 'M1 -26 L9 -22', hand: [9, -22] },
  hold: { d: 'M1 -26 L5 -19 L9 -21', hand: [9, -21] },
  up: { d: 'M1 -26 L5 -36', hand: [5, -36] },
  work: { d: 'M1 -26 L6 -20 L10 -18', hand: [10, -18] },
};
// Objet posé : sur le comptoir (devant, à hauteur de plateau) ou sur la table (plus bas).
const PLACED: Readonly<Record<'counter' | 'table', readonly [number, number]>> = { counter: [11, -17], table: [10, -13] };

// Chaînes précalculées : la boucle n'écrit que des chaînes déjà construites (aucune allocation par image).
const ITEM_AT: Readonly<Record<Pose['arms'] | 'counter' | 'table', string>> = {
  ...(Object.fromEntries(Object.entries(ARM).map(([k, a]) => [k, `translate(${a.hand[0]} ${a.hand[1]})`])) as Record<Pose['arms'], string>),
  counter: `translate(${PLACED.counter[0]} ${PLACED.counter[1]})`,
  table: `translate(${PLACED.table[0]} ${PLACED.table[1]})`,
};
const HEAD: Readonly<Record<Pose['head'], string>> = { front: 'translate(0 0)', down: 'translate(0.8 1.2)', turn: 'scale(-1 1)' };
// Corps : penché (degrés entiers, `lean` × 12) et balancé (px par demi-unité, `sway` × 2), quantifiés pour n'écrire qu'au changement.
const LEAN_DEG = 12;
const SWAY_PX = 2;
const bodyCache = new Map<number, string>();
function bodyTransform(lean: number, sway: number): string {
  const deg = Math.round(lean * LEAN_DEG);
  const half = Math.round(sway * SWAY_PX * 2);
  const key = deg * 1000 + half;
  let s = bodyCache.get(key);
  if (s === undefined) {
    s = `translate(${half / 2} 0) rotate(${deg})`;
    bodyCache.set(key, s);
  }
  return s;
}

// ---------- Accessoires (un dessin par id de ACCESSORY) ----------
export function AccessorySprite({ id, sky }: { id: string; sky: Sky }): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const shape = ((): ReactElement => {
    switch (id) {
      case 'baguette': return <rect x={-5} y={-1} width={10} height={2} rx={1} fill={t('#D9A04A')} transform="rotate(-20)" />;
      case 'box': return <><rect x={-3} y={-2.5} width={6} height={4.5} fill={t('#F6D2E0')} /><rect x={-3} y={-1} width={6} height={0.8} fill={t('#C0306A')} /></>;
      case 'chocolate': return <><rect x={-3} y={-2} width={6} height={4} fill={t('#5A2E1A')} /><rect x={-3} y={-0.4} width={6} height={0.8} fill={t('#E8C04A')} /></>;
      case 'parcel': return <><rect x={-3} y={-2.5} width={6} height={5} fill={t('#F2EEE6')} /><line x1={-3} y1={0} x2={3} y2={0} stroke={t('#B04040')} strokeWidth={0.6} /></>;
      case 'fish': return <path d="M-4 0 Q-1 -2.5 2.5 0 Q-1 2.5 -4 0Z M2.5 0 L4.5 -1.8 L4.5 1.8Z" fill={t('#8FA8B8')} />;
      case 'wedge': return <path d="M-3.5 2 L3.5 2 L-3.5 -2.5Z" fill={t('#F2C94A')} />;
      case 'pill': return <><rect x={-2.5} y={-3} width={5} height={6} fill={t('#FFFFFF')} /><rect x={-0.5} y={-2} width={1} height={3} fill={t('#1E8A4C')} /><rect x={-1.5} y={-1} width={3} height={1} fill={t('#1E8A4C')} /></>;
      case 'bouquet': return <><path d="M0 4 L-1.5 -1 L1.5 -1Z" fill={t('#3A8A3A')} /><circle cx={-1.5} cy={-2} r={1.4} fill={t('#E8486A')} /><circle cx={1.5} cy={-2} r={1.4} fill={t('#F2C94A')} /><circle cx={0} cy={-3.4} r={1.4} fill={t('#B05ACF')} /></>;
      case 'basket': return <><path d="M-3.5 -1 H3.5 L2.5 3 H-2.5Z" fill={t('#A8743A')} /><circle cx={-1} cy={-1.6} r={1.1} fill={t('#D63A2A')} /><circle cx={1.2} cy={-1.6} r={1.1} fill={t('#6AAA2A')} /></>;
      case 'bottle': return <><rect x={-1.2} y={-2} width={2.4} height={6} rx={0.6} fill={t('#2F6A2A')} /><rect x={-0.5} y={-4} width={1} height={2} fill={t('#2F6A2A')} /></>;
      case 'bag': return <><rect x={-2.8} y={-2} width={5.6} height={5} fill={t('#E8DCC0')} /><path d="M-1.4 -2 Q0 -4 1.4 -2" stroke={t('#8A7A5A')} strokeWidth={0.5} fill="none" /></>;
      case 'can': return <><rect x={-1.5} y={-2.5} width={3} height={5} rx={0.4} fill={t('#C0392B')} /><rect x={-1.5} y={-0.5} width={3} height={1} fill={t('#F2F2F2')} /></>;
      case 'bone': return <><rect x={-3} y={-0.6} width={6} height={1.2} fill={t('#F2EEE0')} /><circle cx={-3} cy={-0.8} r={0.9} fill={t('#F2EEE0')} /><circle cx={-3} cy={0.8} r={0.9} fill={t('#F2EEE0')} /><circle cx={3} cy={-0.8} r={0.9} fill={t('#F2EEE0')} /><circle cx={3} cy={0.8} r={0.9} fill={t('#F2EEE0')} /></>;
      case 'scissors': return <><line x1={-1} y1={1} x2={4} y2={-2} stroke={t('#B9C0C8')} strokeWidth={0.7} /><line x1={-1} y1={-1} x2={4} y2={2} stroke={t('#B9C0C8')} strokeWidth={0.7} /><circle cx={-2} cy={1.4} r={0.9} fill="none" stroke={t('#2A2A2A')} strokeWidth={0.5} /><circle cx={-2} cy={-1.4} r={0.9} fill="none" stroke={t('#2A2A2A')} strokeWidth={0.5} /></>;
      case 'needle': return <><rect x={-2.5} y={-1} width={4} height={2} rx={0.6} fill={t('#2A2A2A')} /><line x1={1.5} y1={0} x2={4.5} y2={0} stroke={t('#B9C0C8')} strokeWidth={0.5} /></>;
      case 'book': return <><rect x={-3} y={-2.5} width={6} height={5} fill={t('#2E6FA0')} /><rect x={2.2} y={-2.5} width={0.8} height={5} fill={t('#F2EEE0')} /></>;
      case 'record': return <><circle cx={0} cy={0} r={3} fill={t('#1A1A1A')} /><circle cx={0} cy={0} r={1} fill={t('#E8486A')} /></>;
      case 'dice': return <><rect x={-2.2} y={-2.2} width={4.4} height={4.4} rx={0.6} fill={t('#F2F2F2')} stroke={t('#2A2A2A')} strokeWidth={0.3} /><circle cx={-0.9} cy={-0.9} r={0.45} fill={t('#2A2A2A')} /><circle cx={0.9} cy={0.9} r={0.45} fill={t('#2A2A2A')} /></>;
      case 'glasses': return <><circle cx={-1.8} cy={0} r={1.4} fill="none" stroke={t('#2A2A2A')} strokeWidth={0.6} /><circle cx={1.8} cy={0} r={1.4} fill="none" stroke={t('#2A2A2A')} strokeWidth={0.6} /><line x1={-0.4} y1={0} x2={0.4} y2={0} stroke={t('#2A2A2A')} strokeWidth={0.5} /></>;
      case 'clothes': return <path d="M-3.5 -2 L-1.5 -3 L1.5 -3 L3.5 -2 L2.5 -0.5 L2 -1 L2 3 L-2 3 L-2 -1 L-2.5 -0.5Z" fill={t('#C0463A')} />;
      case 'vase': return <path d="M-1 -3.5 H1 L1 -2.5 Q3 -1 2 2.5 H-2 Q-3 -1 -1 -2.5Z" fill={t('#2E6FA0')} />;
      case 'glass': return <><path d="M-1.5 -2.5 H1.5 L1.2 2.5 H-1.2Z" fill={t('#E0A21E')} opacity={0.9} /><rect x={-1.5} y={-3} width={3} height={0.8} fill={t('#FFFFFF')} /></>;
      case 'cup': return <><path d="M-2 -1.5 H2 L1.5 2 H-1.5Z" fill={t('#FFFFFF')} /><path d="M2 -0.8 Q3.4 0 1.8 1.2" stroke={t('#FFFFFF')} strokeWidth={0.5} fill="none" /><rect x={-2.8} y={2} width={5.6} height={0.6} fill={t('#D8D8D8')} /></>;
      case 'teapot': return <><circle cx={0} cy={0.5} r={2.4} fill={t('#F2EEE6')} /><path d="M2.2 0 L4 -1.6" stroke={t('#F2EEE6')} strokeWidth={0.8} /><rect x={-0.6} y={-2.6} width={1.2} height={0.8} fill={t('#8AB8A0')} /></>;
      case 'plate': return <><ellipse cx={0} cy={0.5} rx={3.5} ry={1} fill={t('#FFFFFF')} /><ellipse cx={0} cy={0} rx={1.8} ry={0.7} fill={t('#A8743A')} /></>;
      case 'pizza': return <><ellipse cx={0} cy={0} rx={3.6} ry={1.4} fill={t('#E8B04A')} /><ellipse cx={0} cy={-0.2} rx={2.8} ry={1} fill={t('#C0392B')} /></>;
      case 'wrap': return <><path d="M-1.5 -3 L1.5 -3 L1 3 L-1 3Z" fill={t('#E8D2A0')} /><path d="M-1.5 -3 L1.5 -3 L1.2 -1.5 L-1.2 -1.5Z" fill={t('#6AAA2A')} /></>;
      case 'tray': return <><rect x={-3.5} y={0} width={7} height={1} fill={t('#1A1A1A')} /><rect x={-2.5} y={-1.2} width={1.6} height={1.2} fill={t('#F2F2F2')} /><rect x={-0.8} y={-1.2} width={1.6} height={1.2} fill={t('#E8705A')} /><rect x={0.9} y={-1.2} width={1.6} height={1.2} fill={t('#F2F2F2')} /></>;
      case 'cocktail': return <><path d="M-2.2 -2.5 H2.2 L0 0.5Z" fill={t('#FF4FD8')} /><line x1={0} y1={0.5} x2={0} y2={2.5} stroke={t('#D8DCE6')} strokeWidth={0.4} /><line x1={-1} y1={2.5} x2={1} y2={2.5} stroke={t('#D8DCE6')} strokeWidth={0.4} /></>;
      case 'joystick': return <><rect x={-2.5} y={0.5} width={5} height={2} fill={t('#1C1A3A')} /><line x1={0} y1={0.5} x2={0} y2={-2} stroke={t('#2A2A2A')} strokeWidth={0.6} /><circle cx={0} cy={-2.2} r={1} fill={t('#E63B3B')} /></>;
      case 'laundry': return <><rect x={-3} y={-1} width={6} height={3.5} rx={0.6} fill={t('#5AA7D6')} /><path d="M-2 -1 Q0 -3 2 -1" fill={t('#F2F2F2')} /></>;
      case 'tool': return <><rect x={-3.5} y={-0.5} width={6} height={1} fill={t('#8C939C')} /><path d="M2.5 -1.6 L4.2 -1.6 L4.2 1.6 L2.5 1.6 L2.5 0.6 L3.4 0.6 L3.4 -0.6 L2.5 -0.6Z" fill={t('#8C939C')} /></>;
      default: return <circle cx={0} cy={0} r={1.5} fill={t('#8C939C')} />;
    }
  })();
  return <g data-accessory={id}>{shape}</g>;
}

// ---------- Passant en pose ----------
// `posed` : la boucle met ce passant en pose (attribut lu à la collecte des nœuds). L'objet (`data-item`) est caché par
// `visibility` quand la pose n'a rien en main (item 'none').
type PosedProps = { outfit: Outfit; sky: Sky; rainy: boolean; umbrella: boolean; accessory: string | null; pose: Pose; seated?: boolean };

export function PosedPerson({ outfit, sky, rainy, umbrella, accessory, pose, seated = false }: PosedProps): ReactElement {
  const t = (c: string): string => tone(c, sky);
  // Manche : couleur du haut (imperméable sous la pluie, comme PersonSprite).
  const raincoat = rainy && (outfit.top === 'jacket' || outfit.top === 'sweater' || outfit.top === 'tee' || outfit.top === 'shirt');
  const arm = ARM[pose.arms];
  const item = itemTransform(pose);
  return (
    <g data-pose-body="" transform={bodyTransform(pose.lean, pose.sway)}>
      <PersonSprite outfit={outfit} sky={sky} rainy={rainy} umbrella={umbrella} seated={seated} />
      <g transform={seated ? `translate(0 ${SEAT_DROP})` : undefined}>
        <path data-arm="" d={arm.d} stroke={t(raincoat ? '#2E5E8A' : outfit.topColor)} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle data-hand="" cx={arm.hand[0]} cy={arm.hand[1]} r={1.3} fill={t(outfit.skin)} />
        {accessory && (
          <g data-item="" transform={item ?? ITEM_AT.down} visibility={item ? 'visible' : 'hidden'}>
            <AccessorySprite id={accessory} sky={sky} />
          </g>
        )}
      </g>
    </g>
  );
}

// Où est l'objet pour cette pose (null : rien en main ni posé).
function itemTransform(pose: Pose): string | null {
  if (pose.item === 'hand') return ITEM_AT[pose.arms];
  if (pose.item === 'counter' || pose.item === 'table') return ITEM_AT[pose.item];
  return null;
}

// Poignées d'un passant en pose, cherchées une fois par nœud (WeakMap) : la boucle ne parcourt pas le DOM à chaque image.
export type PoseHandles = { body: Element | null; arm: Element | null; hand: Element | null; head: Element | null; item: Element | null };
const handleCache = new WeakMap<Element, PoseHandles>();
export function poseHandles(node: Element): PoseHandles {
  let h = handleCache.get(node);
  if (!h) {
    h = {
      body: node.querySelector('[data-pose-body]'),
      arm: node.querySelector('[data-arm]'),
      hand: node.querySelector('[data-hand]'),
      head: node.querySelector('[data-head]'),
      item: node.querySelector('[data-item]'),
    };
    handleCache.set(node, h);
  }
  return h;
}

const HAND_X: Readonly<Record<Pose['arms'], string>> = Object.fromEntries(Object.entries(ARM).map(([k, a]) => [k, String(a.hand[0])])) as Record<Pose['arms'], string>;
const HAND_Y: Readonly<Record<Pose['arms'], string>> = Object.fromEntries(Object.entries(ARM).map(([k, a]) => [k, String(a.hand[1])])) as Record<Pose['arms'], string>;

const set = (node: Element | null, name: string, value: string): void => {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
};

// Met un passant en pose : n'écrit que ce qui change (chaînes précalculées).
export function applyPose(h: PoseHandles, pose: Pose): void {
  set(h.body, 'transform', bodyTransform(pose.lean, pose.sway));
  set(h.arm, 'd', ARM[pose.arms].d);
  set(h.hand, 'cx', HAND_X[pose.arms]);
  set(h.hand, 'cy', HAND_Y[pose.arms]);
  set(h.head, 'transform', HEAD[pose.head]);
  const item = itemTransform(pose);
  set(h.item, 'visibility', item ? 'visible' : 'hidden');
  if (item) set(h.item, 'transform', item);
}

// Objet emporté par un client qui ressort (sur le trottoir) : visible ou non.
export function showCarry(h: PoseHandles, carry: boolean): void {
  set(h.item, 'visibility', carry ? 'visible' : 'hidden');
}

// Pose fixe des employés à la porte (lever / baisser le rideau) et d'un client qui ressort, objet à la main.
export const LIFTING: Pose = { arms: 'up', lean: 0, head: 'front', item: 'none', sway: 0 };
export const CARRYING: Pose = { arms: 'down', lean: 0, head: 'front', item: 'hand', sway: 0 };
export const STANDING: Pose = { arms: 'down', lean: 0, head: 'front', item: 'none', sway: 0 };
