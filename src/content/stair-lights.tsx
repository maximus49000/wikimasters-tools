import type { ReactElement } from 'react';
import type { FacadeWindow } from '../core/library/city/facade-layout';
import { HALL_OFF_S, HALL_ON_S } from '../core/library/city/hall-lights';
import { StairWindow } from './ghibli-window-art';

// Délai d'allumage d'un étage à l'autre : la minuterie éclaire la cage du rez-de-chaussée vers l'étage atteint.
export const STAIR_STEP_S = 0.5;

// Allumage étage par étage (franc, décalé de STAIR_STEP_S par étage), extinction douce de toute la cage ; mouvement réduit : rien.
export const stairTransition = (on: boolean, floor: number, still: boolean): string =>
  still ? 'none' : on ? `opacity ${HALL_ON_S}s ease ${floor * STAIR_STEP_S}s` : `opacity ${HALL_OFF_S}s ease`;

// Cages d'escalier, dans le calque animé de la ville : une fenêtre par étage au-dessus de chaque porte (stairsFor, de bas en
// haut), montée en permanence ; la boucle de city-life.tsx bascule l'opacité de chaque `[data-stair-light]` (centre x de la
// porte) / `[data-floor]` (0 = la plus basse) avec la minuterie du hall. `lit` donne l'état du premier dessin.
export function StairLights({ stairs, ghibli, still, lit }: { stairs: ReadonlyMap<number, readonly FacadeWindow[]>; ghibli: boolean; still: boolean; lit: (doorX: number, floor: number) => boolean }): ReactElement {
  return (
    <g data-stair-lights="" style={{ pointerEvents: 'none' }}>
      {[...stairs].flatMap(([x, wins]) =>
        wins.map((win, k) => {
          const on = lit(x, k);
          return (
            <g key={`${x}-${k}`} data-stair-light={x} data-floor={k} opacity={on ? 1 : 0} style={{ transition: stairTransition(on, k, still) }}>
              {ghibli ? <StairWindow win={win} /> : <rect x={win.x} y={win.y} width={win.w} height={win.h} fill="#F4F0D8" />}
            </g>
          );
        }),
      )}
    </g>
  );
}
