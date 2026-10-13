import type { ReactElement } from 'react';
import { isSmallKind, sizeOf, SMALL_ITEM_OF, WINDOW_DEFAULT } from '../core/library/furniture-catalog';
import type { FurnitureKind, StyleId } from '../core/library/library-types';
import { CELL_H, CELL_W, type PxRect } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { ComputerArt, DeskArt, ShelfArt } from './furniture-art';
import { HomeArt, SmallArt } from './furniture-art-home';
import { AnalyticalEngineArt, SteampunkArt } from './furniture-art-steampunk';
import { WindowArt } from './window-art';

const PAD = 6;
// Taille de dessin des objets sans emprise au sol : l'ordinateur (posé sur un bureau) et les petits objets (sur une surface).
const COMPUTER = { w: 3, h: 2 } as const;
const SMALL = { w: 1, h: 2 } as const;
// Ciel derrière le cadre de la fenêtre : dans la pièce, le décor est rendu à part ; en vignette, un aplat suffit.
const WINDOW_SKY = '#9CC8E8';

function cellsOf(kind: FurnitureKind): { w: number; h: number } {
  if (kind === 'window') return WINDOW_DEFAULT;
  if (kind === 'computer') return COMPUTER;
  if (isSmallKind(kind)) return SMALL;
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
  if (kind === 'computer') return steampunk ? <AnalyticalEngineArt rect={rect} /> : <ComputerArt rect={rect} />;
  if (isSmallKind(kind)) return <SmallArt item={SMALL_ITEM_OF[kind]} rect={rect} palette={palette} />;
  if (kind === 'shelf') return <ShelfArt rect={rect} palette={palette} showSlots={false} />;
  if (kind === 'globe' || kind === 'telescope' || kind === 'automaton') return <SteampunkArt kind={kind} rect={rect} palette={palette} />;
  if (steampunk && (kind === 'desk' || kind === 'armchair' || kind === 'lamp')) return <SteampunkArt kind={kind} rect={rect} palette={palette} lit />;
  if (kind === 'desk') return <DeskArt rect={rect} palette={palette} />;
  return <HomeArt kind={kind} rect={rect} palette={palette} lit />;
}

// Vignette du tiroir de construction : le vrai dessin du meuble, à la palette du style de la pièce, cadré sur son emprise.
export function FurnitureThumb({ kind, style }: { kind: FurnitureKind; style: StyleId }): ReactElement {
  const { w, h } = cellsOf(kind);
  const rect: PxRect = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
  return (
    <svg data-thumb={kind} viewBox={`${-PAD} ${-PAD} ${rect.w + PAD * 2} ${rect.h + PAD * 2}`} width="44" height="44" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {artOf(kind, rect, style)}
    </svg>
  );
}
