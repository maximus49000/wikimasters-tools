import type { ReactElement } from 'react';
import { lampLit } from '../core/library/activity';
import { FAR_WINDOW, type Facade } from '../core/library/city/facades';

// Fenêtres allumées de la ville peinte (vague Ghibli), hors filtre d'étalonnage : lueur chaude débordante, croisillon,
// rideau en contre-jour. Mêmes positions et même logique d'allumage que la ville classique.
export function GhibliWindows({ buildings, minutes, gloom, dim, farLight }: { buildings: Facade[]; minutes: number; gloom: boolean; dim: number; farLight: number }): ReactElement {
  return (
    <g data-ghibli-windows="">
      {buildings.map((b, i) =>
        b.far
          ? b.farWindows.map((win, j) => {
              const lit = lampLit(win.u, minutes) || (gloom && win.u < 0.55);
              return (
                <rect key={`f${i}-${j}`} data-far-lamp="" data-lit={lit ? 'true' : 'false'} x={win.x} y={win.y} width={FAR_WINDOW.w} height={FAR_WINDOW.h} fill={win.blue ? '#C4D8FF' : '#FFDFA0'} opacity={lit ? dim * farLight : 0} style={{ transition: 'opacity 4s ease' }} />
              );
            })
          : b.lamps.map((lamp, j) => {
              const lit = lampLit(lamp.u, minutes) || (gloom && lamp.u < 0.55);
              return (
                <g key={`n${i}-${j}`} data-lamp="" data-lit={lit ? 'true' : 'false'} opacity={lit ? dim : 0} style={{ transition: 'opacity 4s ease' }}>
                  <rect x={lamp.x - 1.2} y={lamp.y - 1.2} width={7.4} height={9.4} rx={1.5} fill={lamp.blue ? '#9FC4FF' : '#FFC860'} opacity={0.3} />
                  <rect x={lamp.x} y={lamp.y} width={5} height={7} fill={lamp.blue ? '#B9D4FF' : '#FFD98A'} />
                  <path d={`M${lamp.x} ${lamp.y}h1.5q-0.5 3.5 0 7h-1.5z`} fill="#D8984A" opacity={0.75} />
                  <rect x={lamp.x + 2.2} y={lamp.y} width={0.6} height={7} fill="#5A3A22" opacity={0.6} />
                  <rect x={lamp.x} y={lamp.y + 3.1} width={5} height={0.6} fill="#5A3A22" opacity={0.6} />
                </g>
              );
            }),
      )}
    </g>
  );
}
