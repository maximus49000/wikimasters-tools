// Dessin provisoire Opus — Fable n'est pas passé, reprise prévue.
import { useRef, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import type { Matrix } from '../core/library/footprint';
import { FURNITURE_MODELS } from '../core/library/furniture-models';
import type { Room, ShelfLevel } from '../core/library/library-types';
import { SHELF_INNER_CM, SHELF_LEVELS, displayOf, isShelfLevel, shelfBoardsIn, shelfLayoutIn, type Stored } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { reducedMotion } from './ghibli-sky';
import { Icon, ICONS } from './library-ui';

export type ShelfBoardProps = {
  shelfIds: string[];
  level: ShelfLevel;
  room: Room;
  cards: Record<string, { title: string; imageUrl?: string }>;
  imageOf: (slug: string) => string | undefined;
  onCard: (slug: string) => void;
  onLevel: (level: ShelfLevel) => void;
};

// Face de l'étagère en cm (repère identité) : tablettes et objets rangés y gardent leurs mesures réelles (mêmes calculs que la pièce).
const FACE = { w: SHELF_INNER_CM, h: FURNITURE_MODELS.shelf.face!.h, m: [1, 0, 0, 1, 0, 0] as Matrix };
const POST_CM = 3; // montants (bords et entre deux bibliothèques)
const PLANK_CM = 2;
const TITLE_CM = 8; // place des titres sous la tablette (2 lignes)
const TITLE_FONT_CM = 2.4;
// Largeur moyenne d'un caractère, en fraction de la taille de police.
const CHAR_W = 0.55;
export const SWIPE_PX = 40;

// Titre en `lines` lignes d'au plus `max` caractères (mots entiers ; un mot trop long est coupé), « … » si ça ne tient pas.
export function titleLines(title: string, max: number, lines = 2): string[] {
  const cap = Math.max(1, Math.floor(max));
  let rest = title.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  while (rest.length > 0 && out.length < lines) {
    let line = rest[0]!;
    let k = 1;
    while (k < rest.length && `${line} ${rest[k]}`.length <= cap) line = `${line} ${rest[k++]}`;
    out.push(line);
    rest = rest.slice(k);
  }
  const cut = (s: string) => (s.length <= cap ? s : `${s.slice(0, Math.max(0, cap - 1))}…`);
  const res = out.map(cut);
  if (rest.length > 0 && res.length > 0) {
    const last = res[res.length - 1]!;
    if (!last.endsWith('…')) res[res.length - 1] = last.length + 1 <= cap ? `${last}…` : `${last.slice(0, Math.max(0, cap - 1))}…`;
  }
  return res;
}

// Second zoom : une tablette (de une ou deux bibliothèques liées, à la suite), cartes au plus grand avec leur titre ;
// ↑ ↓ ou glisser verticalement pour changer de tablette.
export function ShelfBoardZoom({ shelfIds, level, room, cards, imageOf, onCard, onLevel }: ShelfBoardProps): ReactElement {
  const palette = paletteOf(room.style);
  const board = shelfBoardsIn(FACE)[level]!;
  const top = board.local.y;
  const boardH = board.local.h;
  const width = shelfIds.length * SHELF_INNER_CM + (shelfIds.length + 1) * POST_CM;
  const height = boardH + PLANK_CM + TITLE_CM;
  // Entrée : la tablette du dessous monte, celle du dessus descend ; la première s'agrandit.
  // Direction figée par niveau : un nouveau rendu au même niveau ne rejoue pas l'animation.
  const entry = useRef<{ level: ShelfLevel; enter: 'in' | 'below' | 'above' }>({ level, enter: 'in' });
  if (entry.current.level !== level) entry.current = { level, enter: level > entry.current.level ? 'below' : 'above' };
  const enter = entry.current.enter;
  const startY = useRef<number | null>(null);
  // Le clic qui suit un glissement n'ouvre pas de fiche.
  const swiped = useRef(false);
  const go = (d: 1 | -1): void => {
    const next = level + d;
    if (isShelfLevel(next)) onLevel(next);
  };
  const onPointerDown = (e: ReactPointerEvent): void => { startY.current = e.clientY; swiped.current = false; };
  const onPointerUp = (e: ReactPointerEvent): void => {
    const s = startY.current;
    startY.current = null;
    if (s === null) return;
    const dy = e.clientY - s;
    if (Math.abs(dy) < SWIPE_PX) return;
    swiped.current = true;
    go(dy < 0 ? 1 : -1);
  };
  const stored = new Map(room.layout.filter((p): p is Stored => p.kind === 'stored').map((p) => [p.id, p]));
  const last = SHELF_LEVELS[SHELF_LEVELS.length - 1]!;
  const reduced = reducedMotion();

  return (
    <div className="wmt-lib-board" data-shelf-board={level} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { startY.current = null; }}>
      <svg key={level} data-board-enter={enter} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={reduced ? undefined : { animation: `wmt-board-${enter} ${enter === 'in' ? 400 : 250}ms ease-out` }}>
        <rect x={0} y={boardH} width={width} height={PLANK_CM} fill={palette.wood} />
        {shelfIds.map((id, i) => {
          const x0 = POST_CM + i * (SHELF_INNER_CM + POST_CM);
          const boxes = shelfLayoutIn(FACE, room.layout, id).filter((b) => b.level === level);
          return (
            <g key={id} data-board-shelf={id}>
              <rect x={x0} y={0} width={SHELF_INNER_CM} height={boardH} fill={palette.woodDark} />
              <rect x={x0 - POST_CM} y={0} width={POST_CM} height={boardH + PLANK_CM} fill={palette.wood} />
              {i === shelfIds.length - 1 && <rect x={x0 + SHELF_INNER_CM} y={0} width={POST_CM} height={boardH + PLANK_CM} fill={palette.wood} />}
              {boxes.map((b) => {
                const p = stored.get(b.id);
                if (!p) return null;
                const info = cards[p.slug];
                const title = info?.title ?? p.slug.replace(/_/g, ' ');
                const url = info ? imageOf(p.slug) : undefined;
                const x = x0 + b.local.x;
                const y = b.local.y - top;
                const w = b.local.w;
                const h = b.local.h;
                const spine = displayOf(p) === 'spine';
                const spineFont = Math.min(w * 0.6, TITLE_FONT_CM);
                return (
                  <g
                    key={p.id}
                    data-board-card={p.slug}
                    data-board-display={spine ? 'spine' : 'cover'}
                    onClick={() => {
                      if (swiped.current) { swiped.current = false; return; }
                      if (info) onCard(p.slug);
                    }}
                    style={{ cursor: info ? 'pointer' : 'default' }}
                  >
                    <rect x={x} y={y} width={w} height={h} fill="#e8e2d6" stroke={palette.text} strokeWidth={0.3} />
                    {!spine && url && <image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" />}
                    {spine
                      ? <text data-board-title="" transform={`translate(${x + w / 2} ${y + h - 1}) rotate(-90)`} fontSize={spineFont} dominantBaseline="middle" fill={palette.text}>{titleLines(title, (h - 2) / (spineFont * CHAR_W), 1)[0]}</text>
                      : titleLines(title, w / (TITLE_FONT_CM * CHAR_W)).map((line, k) => (
                        <text key={k} data-board-title="" x={x + w / 2} y={boardH + PLANK_CM + TITLE_FONT_CM * (k + 1)} fontSize={TITLE_FONT_CM} textAnchor="middle" fill={palette.text}>{line}</text>
                      ))}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="wmt-lib-board-nav">
        <button type="button" className="wmt-lib-fab" data-action="board-up" aria-label="Tablette du dessus" title="Tablette du dessus" disabled={level === 0} onClick={() => go(-1)} style={{ position: 'static' }}>
          <Icon paths={ICONS.up} />
        </button>
        <button type="button" className="wmt-lib-fab" data-action="board-down" aria-label="Tablette du dessous" title="Tablette du dessous" disabled={level === last} onClick={() => go(1)} style={{ position: 'static' }}>
          <Icon paths={ICONS.down} />
        </button>
      </div>
    </div>
  );
}
