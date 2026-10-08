import { useCallback, useRef, useSyncExternalStore, type PointerEvent, type ReactElement } from 'react';
import type { FurnitureKind, Placed, Room } from '../core/library/library-types';
import { CELL_H, CELL_W, HEIGHT, ROWS, VISIBLE_COLS, WALL_ROWS, SURFACE_SLOTS, computerRect, isStanding, pxRect, rectOf, shelfSlots, surfaceSlotRect, type Cell, type PxRect, type Rect } from '../core/library/room-grid';
import { sizeOf } from '../core/library/furniture-catalog';
import { decorOf, paletteOf } from '../core/library/styles';
import { NeonDefs, RoomBackdrop, neonOutline } from './room-backdrop';
import { ShelfItemArt, WallArt } from './library-card-art';
import { ComputerArt, DeskArt, ShelfArt } from './furniture-art';
import { HomeArt, SmallArt } from './furniture-art-home';
import { getImageService } from './image-registry';

export type Tool = { type: 'new'; kind: FurnitureKind } | { type: 'move'; id: string } | { type: 'card' } | null;

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
  // Titre et image des cartes posées dans la pièce, par slug ; un slug absent = carte inconnue (objet grisé).
  cards?: Record<string, { title: string; imageUrl?: string }>;
  // Toucher sur un objet accroché, rangé ou sur l'écran de l'ordinateur.
  onCardTap?: (id: string) => void;
};

export type DragView = { id: string; x: number; y: number; ok: boolean; ghost: Rect | null; ghostPx?: PxRect };

function ghostBox(rect: Rect): { x: number; y: number; width: number; height: number } {
  const px = pxRect(rect);
  return { x: px.x, y: px.y, width: px.w, height: px.h };
}

export function RoomView({ room, editing, cellsActive, selectedId, blink, onCell, onPick, onFurnitureDown, onFurnitureMove, onFurnitureUp, drag = null, cards = {}, onCardTap }: Props) {
  const palette = paletteOf(room.style);
  const decor = decorOf(room.style);
  // Se réabonne aux images qui arrivent après le premier dessin : un compteur change à chaque notification du service.
  const images = getImageService();
  const imageVersion = useRef(0);
  const subscribeImages = useCallback(
    (notify: () => void) => images?.subscribe(() => { imageVersion.current++; notify(); }) ?? (() => undefined),
    [images],
  );
  useSyncExternalStore(subscribeImages, () => imageVersion.current);
  const width = room.cols * CELL_W;
  const wallH = WALL_ROWS * CELL_H;
  const blinking = new Set(blink.map((c) => `${c.col}-${c.row}`));

  const deskRects = new Map<string, PxRect>();
  // Bureaux et étagères : ils portent les petits objets.
  const hostRects = new Map<string, PxRect>();
  for (const placed of room.layout) {
    const rect = rectOf(placed);
    if (!rect) continue;
    if (placed.kind === 'desk') deskRects.set(placed.id, pxRect(rect));
    if (placed.kind === 'desk' || placed.kind === 'shelf') hostRects.set(placed.id, pxRect(rect));
  }
  const imageOf = (slug: string): string | undefined => {
    const url = cards[slug]?.imageUrl;
    return images?.displayUrl(slug, url) ?? url;
  };
  // Emplacements d'étagère déjà pris : leurs pointillés ne se dessinent pas.
  const occupiedSlots = new Map<string, Set<number>>();
  for (const placed of room.layout) {
    if (placed.kind !== 'stored') continue;
    const set = occupiedSlots.get(placed.shelfId) ?? new Set<number>();
    set.add(placed.slot);
    occupiedSlots.set(placed.shelfId, set);
  }
  const outline = (rect: PxRect) => (
    <rect x={rect.x - 3} y={rect.y - 3} width={rect.w + 6} height={rect.h + 6} rx={6} fill="none" stroke="#378ADD" strokeWidth={2.5} strokeDasharray="6 4" />
  );

  // Copie soulevée d'un dessin (un peu plus grande, en transparence) qui suit le doigt ; `anchor` : le rectangle que le doigt tient.
  function liftedCopyOf(rect: PxRect, art: ReactElement, anchor: PxRect): ReactElement | null {
    if (!drag) return null;
    const dx = drag.x - (anchor.x + anchor.w / 2);
    const dy = drag.y - (anchor.y + anchor.h / 2);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return (
      <g transform={`translate(${cx + dx} ${cy + dy}) scale(1.08) translate(${-cx} ${-cy})`} opacity={0.65} style={{ pointerEvents: 'none' }}>
        {art}
      </g>
    );
  }

  function renderPlaced(placed: Placed): ReactElement | null {
    let rect: PxRect;
    let art: ReactElement;
    if (placed.kind === 'computer') {
      const desk = deskRects.get(placed.deskId);
      if (!desk) return null;
      rect = computerRect(desk);
      art = <ComputerArt rect={rect} imageUrl={placed.slug && cards[placed.slug] ? imageOf(placed.slug) : undefined} />;
    } else if (placed.kind === 'small') {
      const hostRect = hostRects.get(placed.hostId);
      const host = room.layout.find((p) => p.id === placed.hostId);
      if (!hostRect || (host?.kind !== 'desk' && host?.kind !== 'shelf')) return null;
      rect = surfaceSlotRect(hostRect, SURFACE_SLOTS[host.kind], placed.slot);
      art = <SmallArt item={placed.item} rect={rect} palette={palette} />;
    } else {
      const cells = rectOf(placed);
      if (!cells || !isStanding(placed)) return null;
      rect = pxRect(cells);
      art =
        placed.kind === 'shelf' ? (
          <ShelfArt rect={rect} palette={palette} showSlots={editing} occupied={occupiedSlots.get(placed.id)} />
        ) : placed.kind === 'desk' ? (
          <DeskArt rect={rect} palette={palette} />
        ) : placed.kind === 'globe' || placed.kind === 'telescope' || placed.kind === 'automaton' ? <g /> : ( // dessin des meubles Steampunk : tâche 6
          <HomeArt kind={placed.kind} rect={rect} palette={palette} />
        );
    }
    // Le meuble soulevé reste en filigrane à sa place ; sa copie, un peu plus grande, suit le doigt.
    // Un ordinateur suit aussi son bureau soulevé.
    const lifted = drag !== null && (drag.id === placed.id || (placed.kind === 'computer' && drag.id === placed.deskId) || (placed.kind === 'small' && drag.id === placed.hostId));
    const liftedCopy = lifted ? liftedCopyOf(rect, art, drag.id === placed.id ? rect : (hostRects.get(drag.id) ?? rect)) : null;
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
          {decor.glow && placed.kind !== 'rug' && neonOutline(rect, decor.glow)}
          {editing && selectedId === placed.id && outline(rect)}
          <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" />
        </g>
        {liftedCopy}
      </g>
    );
  }

  // Ordre de dessin : les tapis en dessous, puis les meubles du plus loin au plus proche (bas le plus haut d'abord),
  // puis les ordinateurs sur les bureaux ; les objets accrochés viennent ensuite, puis les petits objets par-dessus.
  const standing = room.layout.filter(isStanding);
  const bottomRow = (p: (typeof standing)[number]): number => p.row + sizeOf(p.kind).h;
  const ordered = [
    ...standing.filter((p) => p.kind === 'rug'),
    ...standing.filter((p) => p.kind !== 'rug').sort((a, b) => bottomRow(a) - bottomRow(b)),
    ...room.layout.filter((p) => p.kind === 'computer'),
  ];
  // Les petits objets (bande de 44 px au-dessus de leur porteur) passent devant les objets accrochés au mur.
  const smalls = room.layout.filter((p) => p.kind === 'small');

  // Objet touchable (accroché, rangé ou écran) : mêmes gestes que les meubles, pour pouvoir le déplacer.
  function cardGroup(placed: Placed, slug: string, rect: PxRect, art: ReactElement, extra: Record<string, string> = {}): ReactElement {
    const missing = !cards[slug];
    // L'objet soulevé reste en filigrane à sa place ; sa copie suit le doigt. (L'écran d'un ordinateur suit l'ordinateur, déjà soulevé.)
    // Un objet rangé suit son étagère soulevée.
    const withShelf = drag !== null && placed.kind === 'stored' && drag.id === placed.shelfId;
    const lifted = drag !== null && ((drag.id === placed.id && placed.kind !== 'computer') || withShelf);
    const anchor = withShelf ? (shelfRects.get(drag.id) ?? rect) : rect;
    return (
      <g key={`card-${placed.id}`}>
      <g
        data-card={slug}
        data-id={placed.id}
        data-missing={missing ? 'true' : undefined}
        {...extra}
        onClick={() => onCardTap?.(placed.id)}
        onPointerDown={onFurnitureDown ? (event) => onFurnitureDown(placed.id, event) : undefined}
        onPointerMove={onFurnitureMove}
        onPointerUp={onFurnitureUp}
        onPointerLeave={onFurnitureUp}
        onPointerCancel={onFurnitureUp}
        onContextMenu={(event) => event.preventDefault()}
        opacity={lifted ? 0.3 : missing ? 0.35 : 1}
        style={{ cursor: 'pointer', userSelect: 'none', WebkitTouchCallout: 'none' }}
      >
        {art}
        {editing && selectedId === placed.id && outline(rect)}
        <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" />
      </g>
      {lifted && liftedCopyOf(rect, art, anchor)}
      </g>
    );
  }

  const shelfRects = new Map<string, PxRect>();
  for (const placed of room.layout) {
    const rect = rectOf(placed);
    if (rect && placed.kind === 'shelf') shelfRects.set(placed.id, pxRect(rect));
  }
  const wallLayer: ReactElement[] = [];
  const cardLayer: ReactElement[] = [];
  for (const placed of room.layout) {
    if (placed.kind !== 'wall') continue;
    const cells = rectOf(placed);
    if (!cells) continue;
    const rect = pxRect(cells);
    const info = cards[placed.slug];
    wallLayer.push(
      cardGroup(placed, placed.slug, rect, <WallArt rect={rect} shape={placed.shape} color={placed.color} title={info?.title ?? ''} imageUrl={imageOf(placed.slug)} missing={!info} id={placed.id} />),
    );
  }
  for (const placed of room.layout) {
    if (placed.kind !== 'stored') continue;
    const shelf = shelfRects.get(placed.shelfId);
    const rect = shelf ? shelfSlots(shelf)[placed.slot] : undefined;
    if (!rect) continue;
    const info = cards[placed.slug];
    cardLayer.push(
      cardGroup(placed, placed.slug, rect, <ShelfItemArt rect={rect} shape={placed.shape} slug={placed.slug} title={info?.title ?? ''} imageUrl={imageOf(placed.slug)} missing={!info} />),
    );
  }
  // Écran d'ordinateur : touchable seulement quand une carte y est affichée.
  for (const placed of room.layout) {
    if (placed.kind !== 'computer' || !placed.slug) continue;
    const desk = deskRects.get(placed.deskId);
    if (!desk) continue;
    const full = computerRect(desk);
    const rect = { x: full.x + 5, y: full.y + 5, w: full.w - 10, h: full.h - 12 - 10 };
    const missing = !cards[placed.slug];
    cardLayer.push(
      cardGroup(placed, placed.slug, rect, missing ? <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="#1D1D22" /> : <g />, { 'data-screen': placed.id }),
    );
  }

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
      data-style={room.style}
      style={{ aspectRatio: `${width} / ${HEIGHT}`, width: `${(room.cols / VISIBLE_COLS[room.orientation]) * 100}%`, flexShrink: 0, display: 'block' }}
    >
      {decor.glow && <NeonDefs />}
      <RoomBackdrop style={room.style} width={width} height={HEIGHT} wallH={wallH} />
      {ordered.map(renderPlaced)}
      {wallLayer}
      {smalls.map(renderPlaced)}
      {cardLayer}
      {cells}
      {drag?.ghostPx && (
        <rect
          data-drag-ghost={drag.ok ? 'ok' : 'refused'}
          x={drag.ghostPx.x}
          y={drag.ghostPx.y}
          width={drag.ghostPx.w}
          height={drag.ghostPx.h}
          rx={4}
          fill={drag.ok ? '#3BB273' : '#E24B4A'}
          fillOpacity={0.25}
          stroke={drag.ok ? '#3BB273' : '#E24B4A'}
          strokeWidth={2.5}
          style={{ pointerEvents: 'none' }}
        />
      )}
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
