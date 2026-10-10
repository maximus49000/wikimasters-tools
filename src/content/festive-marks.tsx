import type { ReactElement } from 'react';
import type { FestiveMark } from '../core/library/city/people';

// Signes de fête portés par les passants (repère du PersonSprite : pieds à l'origine, tête centrée à y = -33).
// `t` assombrit les couleurs la nuit.
export function MarkArt({ mark, t }: { mark: FestiveMark; t: (c: string) => string }): ReactElement {
  switch (mark) {
    case 'crown':
      return <path data-mark-art="crown" d="M-3.6 -37.2 L-3.6 -41 L-1.8 -39 L0 -42 L1.8 -39 L3.6 -41 L3.6 -37.2Z" fill={t('#E8B923')} />;
    case 'heart-balloon':
      return (
        <g data-mark-art="heart-balloon">
          <path d="M6 -14 Q9 -30 8 -44" stroke="#6B5B4A" strokeWidth={0.6} fill="none" />
          <path d="M8 -44 C3 -48 4 -55 8 -52 C12 -55 13 -48 8 -44Z" fill={t('#E0305A')} />
        </g>
      );
    case 'basket':
      return (
        <g data-mark-art="basket">
          <path d="M5 -11 H13 L12 -5 H6Z" fill={t('#B07A3A')} />
          <circle cx={7.5} cy={-12} r={1.4} fill={t('#F7C6D9')} />
          <circle cx={10.5} cy={-12.2} r={1.4} fill={t('#FFF2A8')} />
        </g>
      );
    case 'lily':
      return (
        <g data-mark-art="lily">
          <path d="M7 -19 Q9 -27 7.5 -34" stroke={t('#1F9E4A')} strokeWidth={1.4} fill="none" />
          <path d="M7.2 -22 Q2.5 -25 2 -31 Q6 -28 7.2 -22Z" fill={t('#1F9E4A')} />
          <path d="M7.4 -24 Q12 -26 12.5 -31 Q8.5 -29 7.4 -24Z" fill={t('#1F9E4A')} />
          {[-34, -31.5, -29].map((y, k) => (
            <circle key={k} cx={8.2 + (k % 2 === 0 ? 1.6 : -0.2)} cy={y} r={2.1} fill={t('#FFFFFF')} stroke={t('#9CC9AE')} strokeWidth={0.5} />
          ))}
        </g>
      );
    case 'flag':
      return (
        <g data-mark-art="flag">
          <line x1={8} y1={-14} x2={8} y2={-42} stroke="#6B5B4A" strokeWidth={0.8} />
          <rect x={8} y={-42} width={3} height={6} fill={t('#2B4FA0')} />
          <rect x={11} y={-42} width={3} height={6} fill={t('#F2F2F2')} />
          <rect x={14} y={-42} width={3} height={6} fill={t('#C0302B')} />
        </g>
      );
    case 'poppy':
      return (
        <g data-mark-art="poppy">
          <circle cx={3} cy={-24} r={1.8} fill={t('#C0302B')} />
          <circle cx={3} cy={-24} r={0.6} fill="#222" />
        </g>
      );
    case 'streamer':
      return (
        <g data-mark-art="streamer">
          <path d="M-3 -37.4 L0 -45 L3 -37.4Z" fill={t('#F2C94C')} />
          <path d="M-5 -27 Q0 -23 5 -28" stroke={t('#E07A8C')} strokeWidth={1.2} fill="none" />
        </g>
      );
    case 'note':
      return (
        <g data-mark-art="note">
          <ellipse cx={6} cy={-41} rx={2.6} ry={2} fill="#FFE27A" stroke="#7A4FD0" strokeWidth={0.6} />
          <path d="M8.4 -41 V-52 Q12.5 -50.5 12 -46" stroke="#FFE27A" strokeWidth={1.4} fill="none" />
          <ellipse cx={14} cy={-45} rx={2.6} ry={2} fill="#FFE27A" stroke="#7A4FD0" strokeWidth={0.6} />
        </g>
      );
  }
}
