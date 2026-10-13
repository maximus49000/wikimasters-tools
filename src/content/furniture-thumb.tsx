import type { ReactElement } from 'react';
import { isSmallKind, sizeOf, WINDOW_DEFAULT } from '../core/library/furniture-catalog';
import type { FurnitureKind, StyleId } from '../core/library/library-types';
import { CELL_H, CELL_W, type PxRect } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import type { ItemShape } from '../core/library/item-models';
import { Item3DArt, Model3DArt, itemCells } from './model3d-art';
import { WindowArt } from './window-art';

const PAD = 6;
// Objets sans emprise au sol (posés sur un bureau ou une étagère) : leur modèle 3D, cadré sur sa taille dessinée.
const ITEM_SHAPE: Partial<Record<FurnitureKind, ItemShape>> = { computer: 'monitor', 'small-plant': 'small-plant', 'small-lamp': 'small-lamp' };
// Ciel derrière le cadre de la fenêtre : dans la pièce, le décor est rendu à part ; en vignette, un aplat suffit.
const WINDOW_SKY = '#9CC8E8';

function cellsOf(kind: FurnitureKind, steampunk: boolean): { w: number; h: number } {
  if (kind === 'window') return WINDOW_DEFAULT;
  if (kind === 'computer' || isSmallKind(kind)) return itemCells(ITEM_SHAPE[kind]!, steampunk);
  return sizeOf(kind);
}

function artOf(kind: FurnitureKind, rect: PxRect, style: StyleId): ReactElement {
  const palette = paletteOf(style);
  const steampunk = style === 'steampunk';
  if (kind === 'window') {
    return (
      <>
        <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={WINDOW_SKY} />
        <WindowArt rect={rect} palette={palette} steampunk={steampunk} />
      </>
    );
  }
  if (kind === 'computer' || isSmallKind(kind)) return <Item3DArt shape={ITEM_SHAPE[kind]!} angle={0} rect={rect} palette={palette} steampunk={steampunk} content={{ lit: true }} />;
  // Meuble debout : son modèle 3D de face, à sa taille dessinée (garnitures dans une pièce Steampunk).
  return <Model3DArt kind={kind} angle={0} rect={rect} palette={palette} lit steampunk={steampunk} />;
}

// Vignette du tiroir de construction : le vrai dessin du meuble, à la palette du style de la pièce, cadré sur son emprise.
export function FurnitureThumb({ kind, style }: { kind: FurnitureKind; style: StyleId }): ReactElement {
  const { w, h } = cellsOf(kind, style === 'steampunk');
  const rect: PxRect = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
  return (
    <svg data-thumb={kind} viewBox={`${-PAD} ${-PAD} ${rect.w + PAD * 2} ${rect.h + PAD * 2}`} width="44" height="44" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {artOf(kind, rect, style)}
    </svg>
  );
}
