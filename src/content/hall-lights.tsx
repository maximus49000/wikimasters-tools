import type { ReactElement } from 'react';
import type { Door } from '../core/library/city/doors';
import { HALL_OFF_S, HALL_ON_S } from '../core/library/city/hall-lights';
import { DOOR_WIDTH, STREET_SCALE } from '../core/library/city/metrics';
import { EntranceGlow, entranceLeft } from './city-sprites';
import { GhibliEntranceLight } from './shop/ghibli-entrance-lights';

// Lumières des halls d'immeuble, dans le calque animé de la ville (devant le décor, derrière les habitants au seuil) :
// une par entrée, allumée par la minuterie (city/hall-lights.ts). La boucle de city-life.tsx bascule l'opacité de chaque
// `[data-hall-light]` (centre x de la porte) ; `lit` donne l'état du premier dessin.
export const hallTransition = (on: boolean, still: boolean): string => (still ? 'none' : `opacity ${on ? HALL_ON_S : HALL_OFF_S}s ease`);

export function HallLights({ doors, unit, doorY, ghibli, still, lit }: { doors: readonly Door[]; unit: number; doorY: number; ghibli: boolean; still: boolean; lit: (doorX: number) => boolean }): ReactElement {
  return (
    <g data-hall-lights="" style={{ pointerEvents: 'none' }}>
      {doors.map((door) => {
        const x = door.x + DOOR_WIDTH / 2;
        const on = lit(x);
        return (
          <g key={door.id} data-hall-light={x} data-lit={on ? 'true' : 'false'} opacity={on ? 1 : 0} style={{ transition: hallTransition(on, still) }}>
            {ghibli ? (
              <GhibliEntranceLight door={door} unit={unit} doorY={doorY} />
            ) : (
              <g transform={`translate(${entranceLeft(door.x, unit).toFixed(1)} ${doorY.toFixed(1)}) scale(${(unit * STREET_SCALE.entranceX).toFixed(3)} ${(unit * STREET_SCALE.entranceY).toFixed(3)})`}>
                <EntranceGlow variant={door.variant} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
