import type { PointerEvent, ReactElement } from 'react';
import type { FurnitureKind, Placed, Room } from '../core/library/library-types';
import { CELL_H, CELL_W, HEIGHT, ROWS, VISIBLE_COLS, WALL_ROWS, computerRect, pxRect, rectOf, type Cell, type PxRect, type Rect } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { ComputerArt, DeskArt, ShelfArt } from './furniture-art';

export type Tool = { type: 'new'; kind: FurnitureKind } | { type: 'move'; id: string } | null;

type Props = {
  room: Room;
  editing: boolean;
  // Les cases captent les touchers (une pose ou un déplacement est en cours) ; sinon ce sont les meubles.
  cellsActive: boolean;
  selectedId: string | null;
  blink: Cell[];
  onCell: (col: number, row: number) => void;
  onPick: (id: string) => void;
  // Appui long (puis glissé) sur un meuble : le panneau décide de ce que ça déclenche.
  onFurnitureDown?: (id: string, event: PointerEvent<SVGGElement>) => void;
  onFurnitureMove?: (event: PointerEvent<SVGGElement>) => void;
  onFurnitureUp?: () => void;
  // Meuble soulevé : position du doigt dans le repère du dessin, et contour d'arrivée (vert si valide, rouge sinon).
  drag?: DragView | null;
};

export type DragView = { id: string; x: number; y: number; ok: boolean; ghost: Rect | null };

function ghostBox(rect: Rect): { x: number; y: number; width: number; height: number } {
  const px = pxRect(rect);
  return { x: px.x, y: px.y, width: px.w, height: px.h };
}

export function RoomView({ room, editing, cellsActive, selectedId, blink, onCell, onPick, onFurnitureDown, onFurnitureMove, onFurnitureUp, drag = null }: Props) {
  const palette = paletteOf(room.style);
  const width = room.cols * CELL_W;
  const wallH = WALL_ROWS * CELL_H;
  const blinking = new Set(blink.map((c) => `${c.col}-${c.row}`));

  const deskRects = new Map<string, PxRect>();
  for (const placed of room.layout) {
    const rect = rectOf(placed);
    if (rect && placed.kind === 'desk') deskRects.set(placed.id, pxRect(rect));
  }
  const outline = (rect: PxRect) => (
    <rect x={rect.x - 3} y={rect.y - 3} width={rect.w + 6} height={rect.h + 6} rx={6} fill="none" stroke="#378ADD" strokeWidth={2.5} strokeDasharray="6 4" />
  );

  function renderPlaced(placed: Placed): ReactElement | null {
    let rect: PxRect;
    let art: ReactElement;
    if (placed.kind === 'computer') {
      const desk = deskRects.get(placed.deskId);
      if (!desk) return null;
      rect = computerRect(desk);
      art = <ComputerArt rect={rect} />;
    } else {
      const cells = rectOf(placed);
      if (!cells) return null;
      rect = pxRect(cells);
      art = placed.kind === 'shelf' ? <ShelfArt rect={rect} palette={palette} showSlots={editing} /> : <DeskArt rect={rect} palette={palette} />;
    }
    // Le meuble soulevé reste en filigrane à sa place ; sa copie, un peu plus grande, suit le doigt.
    // Un ordinateur suit aussi son bureau soulevé.
    const lifted = drag !== null && (drag.id === placed.id || (placed.kind === 'computer' && drag.id === placed.deskId));
    let liftedCopy: ReactElement | null = null;
    if (lifted && drag) {
      const anchor = drag.id === placed.id ? rect : (deskRects.get(drag.id) ?? rect);
      const dx = drag.x - (anchor.x + anchor.w / 2);
      const dy = drag.y - (anchor.y + anchor.h / 2);
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      liftedCopy = (
        <g transform={`translate(${cx + dx} ${cy + dy}) scale(1.08) translate(${-cx} ${-cy})`} opacity={0.65} style={{ pointerEvents: 'none' }}>
          {art}
        </g>
      );
    }
    return (
      <g key={placed.id}>
        <g
          data-furniture={placed.kind}
          data-id={placed.id}
          onClick={() => onPick(placed.id)}
          onPointerDown={onFurnitureDown ? (event) => onFurnitureDown(placed.id, event) : undefined}
          onPointerMove={onFurnitureMove}
          onPointerUp={onFurnitureUp}
          onPointerLeave={onFurnitureUp}
          onPointerCancel={onFurnitureUp}
          onContextMenu={(event) => event.preventDefault()}
          opacity={lifted ? 0.3 : 1}
          style={{ cursor: editing ? 'pointer' : 'default', userSelect: 'none', WebkitTouchCallout: 'none' }}
        >
          {art}
          {editing && selectedId === placed.id && outline(rect)}
          <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" />
        </g>
        {liftedCopy}
      </g>
    );
  }

  // Les ordinateurs se dessinent après les bureaux, pour rester dessus.
  const ordered = [...room.layout.filter((p) => p.kind !== 'computer'), ...room.layout.filter((p) => p.kind === 'computer')];

  const cells: ReactElement[] = [];
  if (editing) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < room.cols; col++) {
        const key = `${col}-${row}`;
        cells.push(
          <rect
            key={key}
            data-cell={key}
            x={col * CELL_W}
            y={row * CELL_H}
            width={CELL_W}
            height={CELL_H}
            fill={blinking.has(key) ? '#E24B4A' : 'transparent'}
            fillOpacity={blinking.has(key) ? 0.45 : 1}
            stroke={palette.text}
            strokeOpacity={0.25}
            strokeWidth={0.5}
            style={{ pointerEvents: cellsActive ? 'all' : 'none' }}
            onClick={cellsActive ? () => onCell(col, row) : undefined}
          />,
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label={room.name}
      style={{ aspectRatio: `${width} / ${HEIGHT}`, width: `${(room.cols / VISIBLE_COLS[room.orientation]) * 100}%`, flexShrink: 0, display: 'block' }}
    >
      <rect width={width} height={HEIGHT} fill={palette.wall} />
      <rect y={wallH} width={width} height={HEIGHT - wallH} fill={palette.floor} />
      <rect y={wallH - 4} width={width} height={5} fill={palette.skirt} opacity={0.6} />
      {ordered.map(renderPlaced)}
      {cells}
      {drag?.ghost && (
        <rect
          data-drag-ghost={drag.ok ? 'ok' : 'refused'}
          {...ghostBox(drag.ghost)}
          rx={6}
          fill={drag.ok ? '#3BB273' : '#E24B4A'}
          fillOpacity={0.25}
          stroke={drag.ok ? '#3BB273' : '#E24B4A'}
          strokeWidth={2.5}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </svg>
  );
}
