import type { ReactElement, ReactNode } from 'react';
import { SHOP_DEFS, type ShopTypeId } from '../core/library/city/shops/catalog';
import type { Rect, ShopFrame } from '../core/library/city/shops/slots';
import type { ShopView } from '../core/library/city/shops/view';
import type { Sky } from '../core/library/sky';
import { tone } from './city-sprites';

// Devantures de la scène Ville. Repère : celui du MONDE (les rectangles de shopFrame), non mis à l'échelle ; le rez-de-chaussée
// fait 30 px de haut, le bandeau d'enseigne 5. Les objets portés (CarriedSign, CarriedPlacard) et l'échelle sont dessinés dans un
// repère local : base à y = 0, centrés sur x = 0. Aucun `id` : la scène est copiée dans chaque fenêtre par <use>, et le clip de
// l'intérieur passe par un <svg> imbriqué (overflow hidden), pas par un clipPath. Aucune animation.
export type WorkerPose = 'walk' | 'stand' | 'climb' | 'reach' | 'carry';

const ORANGE = '#E8601C';
const FRAME = '#3A3F4A';
const GLASS = '#BFE3F0';
const ALU = '#B9C0C8';
const SHUTTER = '#8C939C';
const BARE = '#D8D2C4';

// Nom sur un bandeau de largeur w : estimation 2,2 px par caractère, sinon le texte est comprimé.
function SignText({ name, cx, y, w, ink }: { name: string; cx: number; y: number; w: number; ink: string }): ReactElement {
  const tight = name.length * 2.2 > w - 2;
  return (
    <text x={cx} y={y} fontSize={4} fontFamily="sans-serif" textAnchor="middle" fill={ink} {...(tight ? { textLength: w - 2, lengthAdjust: 'spacingAndGlyphs' } : {})}>
      {name}
    </text>
  );
}

export function ForSalePlacard({ x, y, w }: { x: number; y: number; w: number }): ReactElement {
  const pw = Math.min(w - 2, 14);
  const px = x + (w - pw) / 2;
  return (
    <g data-placard="1">
      <rect x={px} y={y} width={pw} height={9} fill="#FFFFFF" stroke={ORANGE} strokeWidth={0.5} />
      <rect x={px} y={y} width={pw} height={3.6} fill={ORANGE} />
      <text x={px + pw / 2} y={y + 2.7} fontSize={2.6} fontFamily="sans-serif" fontWeight="bold" textAnchor="middle" fill="#FFFFFF">
        À VENDRE
      </text>
      <rect x={px + 1.5} y={y + 5} width={pw - 3} height={0.7} fill="#9A9A9A" />
      <rect x={px + 1.5} y={y + 6.6} width={pw - 5} height={0.7} fill="#9A9A9A" />
    </g>
  );
}

// Échelle d'aluminium : montants + barreaux tous les 3 px.
export function LadderSprite({ height }: { height: number }): ReactElement {
  const rungs: number[] = [];
  for (let y = -3; y > -height; y -= 3) rungs.push(y);
  return (
    <g stroke={ALU} strokeLinecap="round">
      <line x1={-2} y1={0} x2={-2} y2={-height} strokeWidth={0.8} />
      <line x1={2} y1={0} x2={2} y2={-height} strokeWidth={0.8} />
      {rungs.map((y) => (
        <line key={y} x1={-2} y1={y} x2={2} y2={y} strokeWidth={0.5} />
      ))}
    </g>
  );
}

// Enseigne portée par un ouvrier : bandeau de la couleur du type, nom dessus.
export function CarriedSign({ type, name, w }: { type: ShopTypeId; name: string; w: number }): ReactElement {
  const def = SHOP_DEFS[type];
  return (
    <g data-carried="sign">
      <rect x={-w / 2} y={-5} width={w} height={5} fill={def.sign} stroke={FRAME} strokeWidth={0.4} />
      <SignText name={name} cx={0} y={-1.6} w={w} ink={def.ink} />
    </g>
  );
}

export function CarriedPlacard({ w }: { w: number }): ReactElement {
  return <ForSalePlacard x={-w / 2} y={-9} w={w + 2} />;
}

function Shutter({ frame }: { frame: ShopFrame }): ReactElement {
  const { window: win, door } = frame;
  const x = Math.min(win.x, door.x);
  const right = Math.max(win.x + win.w, door.x + door.w);
  const y = Math.min(win.y, door.y);
  const bottom = Math.max(win.y + win.h, door.y + door.h);
  const slats: number[] = [];
  for (let s = y + 1.5; s < bottom; s += 1.5) slats.push(s);
  return (
    <g data-shutter="1">
      <rect x={x} y={y} width={right - x} height={bottom - y} fill={SHUTTER} />
      {slats.map((s) => (
        <line key={s} x1={x} y1={s} x2={right} y2={s} stroke="#6E747C" strokeWidth={0.3} />
      ))}
    </g>
  );
}

function Awning({ win, color, sky }: { win: Rect; color: string; sky: Sky }): ReactElement {
  const n = Math.max(2, Math.round(win.w / 3));
  const sw = win.w / n;
  return (
    <g data-awning="1">
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={win.x + i * sw} y={win.y} width={sw} height={3} fill={i % 2 ? tone('#FFFFFF', sky) : color} />
      ))}
    </g>
  );
}

export function ShopFront({ frame, view, sky, lit, children }: { frame: ShopFrame; view: ShopView; sky: Sky; lit: boolean; children?: ReactNode }): ReactElement {
  const { sign, window: win, door } = frame;
  const t = (c: string): string => tone(c, sky);
  const type = view.sign?.type ?? null;
  const def = type ? SHOP_DEFS[type] : null;
  const glow = lit && view.phase === 'open';
  const signFill = def ? (glow ? def.sign : t(def.sign)) : t(BARE);
  const ink = def ? (glow ? def.ink : t(def.ink)) : t('#6A6A6A');
  return (
    <g data-shop={view.slot.id} data-shop-phase={view.phase}>
      <g data-shop-sign={type ?? 'bare'}>
        <rect x={sign.x} y={sign.y} width={sign.w} height={sign.h} fill={signFill} stroke={t(FRAME)} strokeWidth={0.4} />
        {view.sign ? (
          <SignText name={view.sign.name} cx={sign.x + sign.w / 2} y={sign.y + 3.6} w={sign.w} ink={ink} />
        ) : (
          <>
            <circle cx={sign.x + 2} cy={sign.y + sign.h / 2} r={0.6} fill={t('#6A6A6A')} />
            <circle cx={sign.x + sign.w - 2} cy={sign.y + sign.h / 2} r={0.6} fill={t('#6A6A6A')} />
          </>
        )}
      </g>
      <rect x={win.x - 0.5} y={win.y - 0.5} width={win.w + 1} height={win.h + 1} fill={t(FRAME)} />
      <rect x={win.x} y={win.y} width={win.w} height={win.h} fill={glow ? '#FFE7B0' : t('#2A2D36')} opacity={glow ? 0.85 : 1} />
      <svg x={win.x} y={win.y} width={win.w} height={win.h} overflow="hidden">
        {children}
      </svg>
      <polygon points={`${win.x + 2},${win.y + win.h} ${win.x + 7},${win.y} ${win.x + 10},${win.y} ${win.x + 5},${win.y + win.h}`} fill="#FFFFFF" opacity={0.18} />
      {def?.awning && <Awning win={win} color={t(def.sign)} sky={sky} />}
      <rect x={door.x - 0.5} y={door.y - 0.5} width={door.w + 1} height={door.h + 1} fill={t(FRAME)} />
      <rect x={door.x} y={door.y} width={door.w} height={door.h} fill={glow ? '#FFE7B0' : t(GLASS)} opacity={glow ? 0.85 : 0.9} />
      <rect x={door.x + (view.slot.doorSide === 'left' ? 0.8 : door.w - 1.4)} y={door.y + door.h / 2} width={0.6} height={2} fill={t(ALU)} />
      {view.phase === 'closed' && <Shutter frame={frame} />}
      {view.placard && <ForSalePlacard x={win.x} y={win.y + 4} w={win.w} />}
    </g>
  );
}
