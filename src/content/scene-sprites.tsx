import type { ReactElement } from 'react';
import type { ActorKind } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { mixHex } from '../core/library/sky';

// `rainy` : les passants ouvrent un parapluie.
type Props = { kind: ActorKind; sky: Sky; rainy?: boolean };

// Silhouettes simples : plus sombres la nuit, pour rester lisibles sur le ciel.
export function ActorSprite({ kind, sky, rainy = false }: Props): ReactElement {
  const dark = (day: string, night: string): string => mixHex(night, day, sky.daylight);
  switch (kind) {
    case 'cloud':
      return (
        <g fill={dark('#FFFFFF', '#3A4170')} opacity={0.9}>
          <ellipse cx={0} cy={0} rx={30} ry={11} />
          <ellipse cx={-16} cy={-6} rx={16} ry={10} />
          <ellipse cx={10} cy={-9} rx={18} ry={12} />
        </g>
      );
    case 'walker':
      return (
        <g>
          <circle cx={0} cy={-26} r={4.5} fill="#E8B88A" />
          <rect x={-4.5} y={-21} width={9} height={14} rx={2} fill={dark('#C0463A', '#6C7AB8')} />
          <rect x={-4} y={-7} width={3} height={8} fill={dark('#2F3340', '#1A1D33')} />
          <rect x={1} y={-7} width={3} height={8} fill={dark('#2F3340', '#1A1D33')} />
          {rainy && (
            <g data-umbrella="">
              {/* Au-dessus de la tête (sommet à -30,5) ; le manche descend jusqu'à la main. */}
              <path d="M-11 -34 Q0 -47 11 -34 Z" fill={dark('#C0392B', '#5A2A3A')} />
              <line x1={0} y1={-34} x2={0} y2={-16} stroke="#4A3B2A" strokeWidth={1} />
            </g>
          )}
        </g>
      );
    case 'car':
      return (
        <g>
          <rect x={-18} y={-12} width={36} height={9} rx={3} fill={dark('#3B6FD6', '#2A3566')} />
          <rect x={-10} y={-19} width={20} height={9} rx={3} fill={dark('#3B6FD6', '#2A3566')} />
          <circle cx={-10} cy={-3} r={4} fill="#222" />
          <circle cx={10} cy={-3} r={4} fill="#222" />
          <circle cx={18} cy={-8} r={2.5} fill={sky.daylight < 0.5 ? '#FFE9A0' : '#EEE'} />
        </g>
      );
    case 'sheep':
      return (
        <g>
          <ellipse cx={0} cy={-8} rx={9} ry={6} fill={dark('#F4F1EA', '#8E94B8')} />
          <circle cx={9} cy={-9} r={3.5} fill={dark('#3B3733', '#1A1D33')} />
          <rect x={-5} y={-3} width={2} height={5} fill="#3B3733" />
          <rect x={3} y={-3} width={2} height={5} fill="#3B3733" />
        </g>
      );
    case 'tractor':
      return (
        <g>
          <rect x={-16} y={-16} width={22} height={10} rx={2} fill={dark('#3C8F3C', '#25502A')} />
          <rect x={-2} y={-24} width={10} height={9} fill={dark('#3C8F3C', '#25502A')} />
          <circle cx={-10} cy={-5} r={7} fill="#2A2A2A" />
          <circle cx={9} cy={-3} r={4.5} fill="#2A2A2A" />
        </g>
      );
    case 'hiker':
      return (
        <g>
          <circle cx={0} cy={-22} r={3.5} fill="#E8B88A" />
          <rect x={-4} y={-18} width={8} height={11} rx={2} fill={dark('#D95F2B', '#6C5A8A')} />
          <rect x={-3} y={-7} width={2.5} height={7} fill="#2F3340" />
          <rect x={1} y={-7} width={2.5} height={7} fill="#2F3340" />
          <rect x={5} y={-22} width={1.5} height={22} fill="#7A5A3A" />
        </g>
      );
    case 'eagle':
    case 'gull':
      return <path d="M-14 2 Q-7 -8 0 0 Q7 -8 14 2 Q7 -3 0 3 Q-7 -3 -14 2z" fill={dark(kind === 'gull' ? '#FFFFFF' : '#3B2F26', '#1A1D33')} />;
    case 'boat':
      return (
        <g>
          <path d="M-26 0h52l-8 10h-36z" fill={dark('#7A3B2A', '#2A2A3A')} />
          <rect x={-1.5} y={-32} width={3} height={32} fill="#CCC" />
          <path d="M3 -32l20 26h-20z" fill={dark('#FFFFFF', '#9AA3C8')} />
        </g>
      );
    case 'satellite':
      return (
        <g>
          <rect x={-5} y={-3} width={10} height={6} fill="#D8D8D8" />
          <rect x={-22} y={-4} width={14} height={8} fill="#3B6FD6" />
          <rect x={8} y={-4} width={14} height={8} fill="#3B6FD6" />
        </g>
      );
    case 'probe':
      return (
        <g>
          <circle cx={0} cy={0} r={5} fill="#E0E0E0" />
          <path d="M-8 0 L-26 -10 L-26 10z" fill="#9AA3C8" />
          <rect x={5} y={-1} width={16} height={2} fill="#BBB" />
        </g>
      );
    case 'station':
      return (
        <g>
          <rect x={-30} y={-1.5} width={60} height={3} fill="#BBB" />
          <rect x={-8} y={-6} width={16} height={12} rx={2} fill="#E0E0E0" />
          <rect x={-28} y={-8} width={10} height={16} fill="#3B6FD6" />
          <rect x={18} y={-8} width={10} height={16} fill="#3B6FD6" />
        </g>
      );
  }
}
