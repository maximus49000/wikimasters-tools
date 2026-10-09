import type { ReactElement } from 'react';
import type { DogCoat } from '../core/library/library-types';
import type { Pose } from '../core/library/pets/runner';

export type DogColors = { body: string; belly: string; dark: string; ear: string; spots?: boolean };

export const DOG_COAT_COLORS: Record<DogCoat, DogColors> = {
  brown: { body: '#9C6B3F', belly: '#C79A68', dark: '#6B4423', ear: '#6B4423' },
  black: { body: '#2E2E35', belly: '#4A4A54', dark: '#17171C', ear: '#17171C' },
  cream: { body: '#E8D2A6', belly: '#F6EBD0', dark: '#BFA56F', ear: '#C9AE78' },
  spotted: { body: '#F3F1EA', belly: '#FFFFFF', dark: '#C9C5B8', ear: '#2E2E35', spots: true },
  gray: { body: '#8E949E', belly: '#BCC1C9', dark: '#5B606A', ear: '#5B606A' },
  red: { body: '#C0612B', belly: '#E3A06E', dark: '#8A3F17', ear: '#8A3F17' },
};
export const DOG_COAT_LABELS: Record<DogCoat, string> = { brown: 'Brun', black: 'Noir', cream: 'Crème', spotted: 'Tacheté', gray: 'Gris', red: 'Roux' };

const Wag = ({ c, fast = false, still }: { c: DogColors; fast?: boolean; still: boolean }) => (
  <path d="M-17 -20 C-26 -22 -28 -32 -24 -36" fill="none" stroke={c.body} strokeWidth="5" strokeLinecap="round">
    {!still && <animateTransform attributeName="transform" type="rotate" values="-14 -17 -20;16 -17 -20;-14 -17 -20" dur={fast ? '0.28s' : '0.7s'} repeatCount="indefinite" />}
  </path>
);

function DogHead({ x, y, c, tilt = 0, mouth = false, closed = false, sniff = false }: { x: number; y: number; c: DogColors; tilt?: number; mouth?: boolean; closed?: boolean; sniff?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <ellipse cx="-4" cy="2" rx="3.6" ry="7" fill={c.ear} transform="rotate(14 -4 2)" />
      <circle r="8.5" fill={c.body} />
      <ellipse cx="8" cy="3" rx="7" ry="4.6" fill={c.belly} />
      <ellipse cx="14" cy="1.6" rx="2.2" ry="1.8" fill="#222" />
      {closed ? <path d="M0 -2h4" stroke="#222" strokeWidth="1.2" strokeLinecap="round" /> : <circle cx="3" cy="-2" r="1.4" fill="#222" />}
      {mouth && <path d="M6 6 q5 5 10 1" fill="#C0475A" stroke="#7A2A2A" strokeWidth="0.8" />}
      {sniff && <path d="M16 4h4 M16 6h3" stroke="#222" strokeWidth="0.6" opacity="0.5" />}
    </g>
  );
}

const Leg = ({ x, c, swing = false, late = false, y = -10, h = 10 }: { x: number; c: DogColors; swing?: boolean; late?: boolean; y?: number; h?: number }) => (
  <rect x={x} y={y} width="4.6" height={h} rx="2.3" fill={c.dark}>
    {swing && <animateTransform attributeName="transform" type="rotate" values={`-24 ${x + 2} ${y};24 ${x + 2} ${y};-24 ${x + 2} ${y}`} dur="0.4s" begin={late ? '-0.2s' : '0s'} repeatCount="indefinite" />}
  </rect>
);

const spots = (c: DogColors): ReactElement | null =>
  c.spots ? (
    <g data-dog-spots="">
      <circle cx="-6" cy="-20" r="3.2" fill="#2E2E35" />
      <circle cx="5" cy="-16" r="2.6" fill="#2E2E35" />
      <circle cx="-12" cy="-14" r="2" fill="#2E2E35" />
    </g>
  ) : null;

function standing(c: DogColors, still: boolean, swing: boolean, head: ReactElement): ReactElement {
  return (
    <>
      <Wag c={c} still={still} />
      <Leg x={-15} c={c} swing={swing} />
      <Leg x={-9} c={c} swing={swing} late />
      <ellipse cx="0" cy="-17" rx="19" ry="8.5" fill={c.body} />
      <ellipse cx="2" cy="-14" rx="13" ry="4.5" fill={c.belly} opacity="0.7" />
      {spots(c)}
      <Leg x={8} c={c} swing={swing} late />
      <Leg x={14} c={c} swing={swing} />
      {head}
    </>
  );
}

function sitting(c: DogColors, still: boolean, head: ReactElement, extras?: ReactElement, fast = false): ReactElement {
  return (
    <>
      <Wag c={c} still={still} fast={fast} />
      <ellipse cx="-4" cy="-12" rx="11" ry="12" fill={c.body} />
      <ellipse cx="2" cy="-10" rx="5" ry="8" fill={c.belly} />
      {spots(c)}
      <rect x="3" y="-12" width="5" height="12" rx="2.5" fill={c.body} />
      {extras}
      {head}
    </>
  );
}

export function dogBody(pose: Pose, c: DogColors, still: boolean): ReactElement {
  switch (pose) {
    case 'walk':
      return standing(c, still, !still, <DogHead x={21} y={-26} c={c} />);
    case 'eat':
      return standing(c, still, false, <DogHead x={25} y={-8} c={c} tilt={40} />);
    case 'sniff':
      return standing(c, still, false, <DogHead x={25} y={-9} c={c} tilt={46} sniff />);
    case 'jump':
      return (
        <g transform="rotate(-16 0 -16)">
          <Wag c={c} still />
          <ellipse cx="0" cy="-17" rx="20" ry="7.4" fill={c.body} />
          <rect x="-28" y="-15" width="14" height="4.6" rx="2.3" fill={c.dark} />
          <rect x="15" y="-24" width="14" height="4.6" rx="2.3" fill={c.dark} />
          <DogHead x={24} y={-28} c={c} mouth />
        </g>
      );
    case 'sit':
    case 'hide':
    case 'hiss':
      return sitting(c, still, <DogHead x={5} y={-31} c={c} />);
    case 'purr':
      return sitting(c, still, <DogHead x={5} y={-31} c={c} mouth />, undefined, true);
    case 'pant':
      return sitting(c, still, <DogHead x={5} y={-31} c={c} mouth />);
    case 'yawn':
      return sitting(c, still, <DogHead x={5} y={-31} c={c} mouth tilt={-10} />);
    case 'greet':
      return sitting(c, still, <DogHead x={9} y={-29} c={c} tilt={10} sniff />, undefined, true);
    case 'cower':
      return sitting(c, still, <DogHead x={6} y={-22} c={c} tilt={28} />);
    case 'groom':
      return sitting(
        c,
        still,
        <DogHead x={5} y={-31} c={c} tilt={12} />,
        <rect x="7" y="-30" width="4.4" height="12" rx="2.2" fill={c.body} transform="rotate(-25 9 -20)">
          {!still && <animateTransform attributeName="transform" type="rotate" values="-25 9 -20;-5 9 -20;-25 9 -20" dur="0.6s" repeatCount="indefinite" />}
        </rect>,
      );
    case 'scratch':
      return sitting(
        c,
        still,
        <DogHead x={5} y={-30} c={c} tilt={-12} />,
        <rect x="-14" y="-12" width="5" height="14" rx="2.5" fill={c.dark}>
          {!still && <animateTransform attributeName="transform" type="rotate" values="0 -12 -10;-30 -12 -10;0 -12 -10" dur="0.3s" repeatCount="indefinite" />}
        </rect>,
      );
    case 'stretch':
      return (
        <>
          <Wag c={c} still={still} />
          <rect x="-16" y="-12" width="4.6" height="12" rx="2.3" fill={c.dark} />
          <ellipse cx="2" cy="-14" rx="19" ry="7.4" fill={c.body} transform="rotate(14 2 -14)" />
          <rect x="9" y="-5" width="18" height="4.6" rx="2.3" fill={c.dark} />
          <DogHead x={27} y={-9} c={c} tilt={24} />
        </>
      );
    case 'play':
      return (
        <g>
          {!still && <animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="0.45s" repeatCount="indefinite" />}
          <Wag c={c} still={still} fast />
          <rect x="-16" y="-12" width="4.6" height="12" rx="2.3" fill={c.dark} />
          <ellipse cx="2" cy="-15" rx="19" ry="7.4" fill={c.body} transform="rotate(10 2 -15)" />
          <rect x="9" y="-6" width="18" height="4.6" rx="2.3" fill={c.dark} />
          <DogHead x={26} y={-10} c={c} tilt={20} mouth />
        </g>
      );
    case 'sleep':
      return (
        <>
          <ellipse cx="0" cy="-9" rx="22" ry="9.5" fill={c.body} />
          {spots(c)}
          <path d="M-20 -6 C-27 3 5 6 14 1" fill="none" stroke={c.body} strokeWidth="5" strokeLinecap="round" />
          <DogHead x={15} y={-8} c={c} tilt={66} closed />
        </>
      );
    default:
      return sitting(c, still, <DogHead x={5} y={-31} c={c} />);
  }
}
