// Dessin provisoire Opus — Fable n'est pas passé, reprise prévue.
import type { ReactElement } from 'react';
import type { Room, ShelfLevel } from '../core/library/library-types';

export type ShelfBoardProps = {
  shelfIds: string[];
  level: ShelfLevel;
  room: Room;
  cards: Record<string, { title: string; imageUrl?: string }>;
  imageOf: (slug: string) => string | undefined;
  onCard: (slug: string) => void;
  onLevel: (level: ShelfLevel) => void;
};

export function ShelfBoardZoom({ level }: ShelfBoardProps): ReactElement {
  return <div className="wmt-lib-board" data-shelf-board={level} />;
}
