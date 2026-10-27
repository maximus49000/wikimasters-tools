import { memo, useId, type ReactElement } from 'react';
import type { FacadeWindow } from '../core/library/city/facade-layout';
import { HALL_OFF_S, HALL_ON_S } from '../core/library/city/hall-lights';
import type { Outfit } from '../core/library/city/people';
import { anchorsOf } from '../core/library/figure/bake';
import { shapeOf, signatureOf } from '../core/library/figure/dress';
import { facingYaw } from '../core/library/figure/gait';
import type { Sky } from '../core/library/sky';
import { GhibliFigure } from './figure/ghibli-figure';
import { StairWindow } from './ghibli-window-art';
import { setOpacity } from './svg-write';

// Délai d'allumage d'un étage à l'autre : la minuterie éclaire la cage du rez-de-chaussée vers l'étage atteint.
export const STAIR_STEP_S = 0.5;

// Allumage étage par étage (franc, décalé de STAIR_STEP_S par étage), extinction douce de toute la cage ; mouvement réduit : rien.
export const stairTransition = (on: boolean, floor: number, still: boolean): string =>
  still ? 'none' : on ? `opacity ${HALL_ON_S}s ease ${floor * STAIR_STEP_S}s` : `opacity ${HALL_OFF_S}s ease`;

// Silhouette de l'habitant dans la cage (maquette 08-scenes.js `paintStairFigure`) : pantin 2D uni (#1A1422), haut d'une
// demi-hauteur d'étage (la fenêtre de cage fait 0,4 étage : 1,25 × la vitre), vue de la taille à la tête par la vitre du
// palier, tournée d'un côté puis de l'autre d'une volée à la suivante. Tenue sans importance : seule la silhouette se voit.
const FIG_OUTFIT: Outfit = { skin: '#F2C9A0', hair: 'short', hairColor: '#3B2A1E', hatColor: '#000000', top: 'tee', topColor: '#C85A3A', bottom: 'pants', bottomColor: '#2E3A4A', accessory: 'none', accessoryColor: '#000000' };
const FIG_H = 1.25;
// Pieds sous la vitre (fraction de sa hauteur) : la tête affleure le haut de la vitre.
const FEET = 1.15;
let standH = 0;
// Hauteur d'un pantin debout (sommet du crâne), en unités du sprite.
function standHeight(): number {
  if (!standH) standH = -anchorsOf({ sig: signatureOf(shapeOf(FIG_OUTFIT, false)), yaw: 4, gait: 'stand', phase: 0, head: 0, arms: 'down', lean: 0 }).headTop[1];
  return standH;
}

const StairFigure = memo(function StairFigure({ x, k, win, clip, sky }: { x: number; k: number; win: FacadeWindow; clip: string; sky: Sky }): ReactElement {
  const s = (FIG_H * win.h) / standHeight();
  const tr = `translate(${win.x + win.w / 2} ${win.y + FEET * win.h}) scale(${s.toFixed(4)})`;
  return (
    <g data-stair-figure={x} data-floor={k} opacity={0} display="none" clipPath={`url(#${clip})`}>
      <g transform={tr}>
        <GhibliFigure outfit={FIG_OUTFIT} sky={sky} rainy={false} umbrella={false} initial={{ yaw: facingYaw(k % 2 ? -1 : 1), gait: 'walk', phase: 2, head: 0 }} flat silhouette />
      </g>
    </g>
  );
});

// Silhouette montrée à la fenêtre `next` (-1 : aucune), `shown` étant celle montrée jusque-là : n'écrit que les deux nœuds
// qui basculent. `shown` inconnu (table refaite par une nouvelle boucle, alors que le DOM garde les opacités de la
// précédente) : écrit tous les nœuds. Renvoie la nouvelle fenêtre montrée.
// Sans transition CSS : la silhouette éteinte est cachée (display none) dans la même écriture que son opacité 0, montrée dans
// celle qui la remet à 1 (un nœud à opacité 0 reste peint et passe par la mise en calques, svg-write.ts hideAtZero).
export function placeStairFigures(nodes: readonly (Element | undefined)[], shown: number | undefined, next: number): number {
  const write = (n: Element | undefined, on: boolean): void => setOpacity(n ?? null, on ? '1' : '0');
  if (shown === undefined) {
    nodes.forEach((n, k) => write(n, k === next));
    return next;
  }
  if (next === shown) return shown;
  if (shown >= 0) write(nodes[shown], false);
  if (next >= 0) write(nodes[next], true);
  return next;
}

// Cages d'escalier, dans le calque animé de la ville : une fenêtre par étage au-dessus de chaque porte (stairsFor, de bas en
// haut), montée en permanence ; la boucle de city-life.tsx bascule l'opacité de chaque `[data-stair-light]` (centre x de la
// porte) / `[data-floor]` (0 = la plus basse) avec la minuterie de la cage. `lit` donne l'état du premier dessin ; éteinte, la
// fenêtre est cachée par la boucle dès son premier placement (fade-light.ts writeFade), pas au rendu : le rendu React ne
// touche pas `display`, la boucle seule le gère avec ses fondus.
// Ghibli, hors mouvement réduit : une silhouette par fenêtre (`[data-stair-figure]`, cachée), que la boucle montre un étage à
// la fois pendant la montée d'un retour (ou la descente d'un départ) accroché à un passage.
export function StairLights({ stairs, ghibli, still, lit, sky }: { stairs: ReadonlyMap<number, readonly FacadeWindow[]>; ghibli: boolean; still: boolean; lit: (doorX: number, floor: number) => boolean; sky?: Sky }): ReactElement {
  const uid = `sf${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const figures = ghibli && !still && sky !== undefined;
  return (
    <g data-stair-lights="" style={{ pointerEvents: 'none' }}>
      {[...stairs].flatMap(([x, wins]) =>
        wins.map((win, k) => {
          const on = lit(x, k);
          const clip = `${uid}-${Math.round(x * 10)}-${k}`;
          return (
            <g key={`${x}-${k}`}>
              <g data-stair-light={x} data-floor={k} opacity={on ? 1 : 0} style={{ transition: stairTransition(on, k, still) }}>
                {ghibli ? <StairWindow win={win} /> : <rect x={win.x} y={win.y} width={win.w} height={win.h} fill="#F4F0D8" />}
              </g>
              {figures && (
                <>
                  <clipPath id={clip}>
                    <rect x={win.x} y={win.y} width={win.w} height={win.h} />
                  </clipPath>
                  <StairFigure x={x} k={k} win={win} clip={clip} sky={sky} />
                </>
              )}
            </g>
          );
        }),
      )}
    </g>
  );
}
