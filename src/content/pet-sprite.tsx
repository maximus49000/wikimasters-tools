import type { ReactElement } from 'react';
import type { Coat } from '../core/library/library-types';
import type { Pose } from '../core/library/pets/runner';

type Colors = { body: string; belly: string; dark: string; stripes?: boolean };

export const COAT_COLORS: Record<Coat, Colors> = {
  orange: { body: '#E8913A', belly: '#F6C98B', dark: '#B96A1E' },
  black: { body: '#2B2B31', belly: '#3A3A42', dark: '#15151A' },
  gray: { body: '#8A8F99', belly: '#B5B9C1', dark: '#5F636C' },
  white: { body: '#F2F2F0', belly: '#FFFFFF', dark: '#CFCFCB' },
  tabby: { body: '#B58A5B', belly: '#D9BC93', dark: '#6F4E2E', stripes: true },
  bicolor: { body: '#2B2B31', belly: '#FFFFFF', dark: '#15151A' },
};
export const COAT_LABELS: Record<Coat, string> = { orange: 'Roux', black: 'Noir', gray: 'Gris', white: 'Blanc', tabby: 'Tigré', bicolor: 'Bicolore' };

type Props = { coat: Coat; pose: Pose; facing: 'l' | 'r'; name: string; still?: boolean };

function Head({ x, y, c, tilt = 0, mouth = false, closed = false }: { x: number; y: number; c: Colors; tilt?: number; mouth?: boolean; closed?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <polygon points="-6,-5 -5,-14 0,-7" fill={c.body} />
      <polygon points="1,-7 6,-14 7,-4" fill={c.body} />
      <circle r="8" fill={c.body} />
      <ellipse cx="2" cy="3" rx="4.5" ry="3.2" fill={c.belly} />
      {closed ? (
        <path d="M-5 -1h3 M1 -1h3" stroke="#222" strokeWidth="1.2" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="-2.5" cy="-1" r="1.3" fill="#222" />
          <circle cx="3.5" cy="-1" r="1.3" fill="#222" />
        </>
      )}
      <path d="M-0.5 2 l1.5 1.5 l1.5 -1.5z" fill="#E88" />
      {mouth && <ellipse cx="1" cy="5.8" rx="2.4" ry="2.8" fill="#7A2A2A" />}
      {c.stripes && <path d="M-3 -7v3 M1 -8v3 M5 -7v3" stroke={c.dark} strokeWidth="1.2" />}
    </g>
  );
}

// Une patte qui se balance autour de son attache ; `late` décale la phase de la moitié du pas.
function Leg({ x, c, swing = false, late = false, y = -10, h = 10 }: { x: number; c: Colors; swing?: boolean; late?: boolean; y?: number; h?: number }) {
  return (
    <rect x={x} y={y} width="4.4" height={h} rx="2.2" fill={c.dark}>
      {swing && <animateTransform attributeName="transform" type="rotate" values={`-22 ${x + 2} ${y};22 ${x + 2} ${y};-22 ${x + 2} ${y}`} dur="0.55s" begin={late ? '-0.27s' : '0s'} repeatCount="indefinite" />}
    </rect>
  );
}

const Tail = ({ d, c }: { d: string; c: Colors }) => <path d={d} fill="none" stroke={c.body} strokeWidth="4.6" strokeLinecap="round" />;

function standing(c: Colors, swing: boolean, headY = -25, headX = 18, tilt = 0): ReactElement {
  return (
    <>
      <Tail d="M-15 -19 C-27 -22 -27 -36 -20 -38" c={c} />
      <Leg x={-13} c={c} swing={swing} />
      <Leg x={-7} c={c} swing={swing} late />
      <ellipse cx="0" cy="-17" rx="17" ry="8.5" fill={c.body} />
      <ellipse cx="2" cy="-14" rx="12" ry="4.5" fill={c.belly} opacity="0.7" />
      {c.stripes && <path d="M-8 -24v5 M-2 -25v6 M4 -25v6" stroke={c.dark} strokeWidth="1.4" />}
      <Leg x={6} c={c} swing={swing} late />
      <Leg x={12} c={c} swing={swing} />
      <Head x={headX} y={headY} c={c} tilt={tilt} />
    </>
  );
}

function sitting(c: Colors, head: ReactElement, extras?: ReactElement): ReactElement {
  return (
    <>
      <Tail d="M-9 -3 C-24 -2 -24 -16 -16 -17" c={c} />
      <ellipse cx="-3" cy="-13" rx="10.5" ry="13" fill={c.body} />
      <ellipse cx="2" cy="-11" rx="5" ry="9" fill={c.belly} />
      {c.stripes && <path d="M-9 -20h5 M-9 -14h5 M-9 -8h5" stroke={c.dark} strokeWidth="1.4" />}
      <rect x="3" y="-12" width="4.6" height="12" rx="2.3" fill={c.body} />
      {extras}
      {head}
    </>
  );
}

function body(pose: Pose, c: Colors, still: boolean): ReactElement {
  switch (pose) {
    case 'walk':
      return standing(c, !still);
    case 'eat':
      return standing(c, false, -9, 23, 38);
    case 'jump':
      return (
        <g transform="rotate(-14 0 -16)">
          <Tail d="M-17 -18 C-30 -16 -32 -10 -34 -6" c={c} />
          <ellipse cx="0" cy="-17" rx="18" ry="7" fill={c.body} />
          <rect x="-26" y="-15" width="13" height="4.4" rx="2.2" fill={c.dark} />
          <rect x="14" y="-23" width="13" height="4.4" rx="2.2" fill={c.dark} />
          <Head x={21} y={-27} c={c} />
        </g>
      );
    case 'sit':
    case 'purr':
      return sitting(c, <Head x={4} y={-33} c={c} />);
    case 'yawn':
      return sitting(c, <Head x={4} y={-33} c={c} mouth />);
    case 'groom':
      return sitting(
        c,
        <Head x={4} y={-33} c={c} tilt={12} />,
        <rect x="7" y="-32" width="4.2" height="12" rx="2.1" fill={c.body} transform="rotate(-25 9 -20)">
          {!still && <animateTransform attributeName="transform" type="rotate" values="-25 9 -20;-5 9 -20;-25 9 -20" dur="0.7s" repeatCount="indefinite" />}
        </rect>,
      );
    case 'scratch':
      return sitting(
        c,
        <Head x={5} y={-34} c={c} tilt={-8} />,
        <rect x="8" y="-36" width="4.4" height="16" rx="2.2" fill={c.body}>
          {!still && <animateTransform attributeName="transform" type="translate" values="0 0;0 5;0 0" dur="0.5s" repeatCount="indefinite" />}
        </rect>,
      );
    case 'stretch':
      return (
        <>
          <Tail d="M-16 -16 C-26 -18 -26 -28 -22 -34" c={c} />
          <rect x="-15" y="-12" width="4.4" height="12" rx="2.2" fill={c.dark} />
          <ellipse cx="2" cy="-14" rx="18" ry="7" fill={c.body} transform="rotate(14 2 -14)" />
          <rect x="8" y="-5" width="17" height="4.4" rx="2.2" fill={c.dark} />
          <Head x={25} y={-10} c={c} tilt={20} />
        </>
      );
    case 'sleep':
      return (
        <>
          <ellipse cx="0" cy="-9" rx="20" ry="9.5" fill={c.body} />
          {c.stripes && <path d="M-10 -17v5 M-3 -18v6 M4 -18v6" stroke={c.dark} strokeWidth="1.4" />}
          <Tail d="M-18 -6 C-24 3 6 5 14 0" c={c} />
          <Head x={14} y={-8} c={c} tilt={70} closed />
        </>
      );
    case 'hide':
      return (
        <>
          <polygon points="-9,-10 -7,-17 -3,-11" fill={c.dark} />
          <polygon points="3,-11 7,-17 9,-10" fill={c.dark} />
          <ellipse cx="-5" cy="-6" rx="2.3" ry="3" fill="#F5D44A" />
          <ellipse cx="5" cy="-6" rx="2.3" ry="3" fill="#F5D44A" />
        </>
      );
  }
}

// Le nom et les cœurs, au-dessus du chat quand on le caresse : dessinés dans une couche à part, tout au-dessus de la pièce, et jamais dans le groupe retourné.
export function PetBubble({ name, still = false }: { name: string; still?: boolean }) {
  const w = Math.max(44, name.length * 6.6 + 18);
  return (
    <g style={{ pointerEvents: 'none' }}>
      <text x="0" y="-62" textAnchor="middle" fontSize="12" fill="#E24B6A">
        ♥ ♥
        {!still && <animate attributeName="opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite" />}
      </text>
      <rect x={-w / 2} y="-86" width={w} height="18" rx="9" fill="#FFFFFF" stroke="#9AA0A6" />
      <text data-pet-name="" x="0" y="-73" textAnchor="middle" fontSize="11" fill="#222" fontFamily="system-ui, sans-serif">
        {name}
      </text>
    </g>
  );
}

export function PetSprite({ coat, pose, facing, still = false }: Props) {
  const c = COAT_COLORS[coat];
  return (
    <g data-pet-pose={pose} data-coat={coat}>
      {pose !== 'hide' && pose !== 'jump' && <ellipse cx="0" cy="0" rx="19" ry="3" fill="#000" opacity="0.18" />}
      <g data-cat-body="" transform={facing === 'l' ? 'scale(-1 1)' : undefined}>
        {body(pose, c, still)}
      </g>
    </g>
  );
}
