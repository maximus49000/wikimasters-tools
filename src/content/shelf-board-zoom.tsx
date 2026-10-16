// Dessin provisoire Opus — Fable n'est pas passé, reprise prévue.
import { useRef, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import type { Matrix } from '../core/library/footprint';
import { FURNITURE_MODELS } from '../core/library/furniture-models';
import type { Room, ShelfLevel } from '../core/library/library-types';
import { SHELF_INNER_CM, SHELF_LEVELS, displayOf, isShelfLevel, shelfBoardsIn, shelfLayoutIn, type Stored } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { reducedMotion } from './ghibli-sky';
import { gameBoxContent } from './game-box-content';
import { GameSpine } from './game-spine';
import { Icon, ICONS } from './library-ui';

export type ShelfBoardProps = {
  shelfIds: string[];
  level: ShelfLevel;
  room: Room;
  cards: Record<string, { title: string; imageUrl?: string }>;
  imageOf: (slug: string) => string | undefined;
  onCard: (slug: string) => void;
  onLevel: (level: ShelfLevel) => void;
  // Portrait et deux bibliothèques liées : les deux tablettes l'une au-dessus de l'autre (celle de gauche en haut) au lieu de côte à côte.
  stacked?: boolean;
};

// Face de l'étagère en cm (repère identité) : tablettes et objets rangés y gardent leurs mesures réelles (mêmes calculs que la pièce).
const FACE = { w: SHELF_INNER_CM, h: FURNITURE_MODELS.shelf.face!.h, m: [1, 0, 0, 1, 0, 0] as Matrix };
const POST_CM = 3; // montants (bords et entre deux bibliothèques)
const PLANK_CM = 2;
const TITLE_CM = 8; // bandeau des titres sous la tablette (2 lignes)
const TITLE_FONT_CM = 2.4;
const GAP_CM = 4; // entre deux tablettes empilées (portrait)
// Hauteur montrée : l'objet le plus haut du niveau + une marge (les cartes au plus grand) ; une tablette vide garde un minimum.
const CROP_MARGIN_CM = 3;
const MIN_CROP_CM = 16;
// Titres lisibles quel que soit le style de la pièce : texte foncé sur un bandeau clair.
const TITLE_BAND = '#f3eee4';
const TITLE_INK = '#2a2420';
// Largeur moyenne d'un caractère, en fraction de la taille de police.
const CHAR_W = 0.55;
// Boîtier d'un jeu dont la console est inconnue (noir, comme dans la pièce).
const GAME_CASE = '#1B1B1F';
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

// Second zoom : une tablette (de une ou deux bibliothèques liées, à la suite ou empilées), cartes au plus grand avec leur titre ;
// ↑ ↓ ou glisser verticalement pour changer de tablette.
export function ShelfBoardZoom({ shelfIds, level, room, cards, imageOf, onCard, onLevel, stacked = false }: ShelfBoardProps): ReactElement {
  const palette = paletteOf(room.style);
  const board = shelfBoardsIn(FACE)[level]!;
  const n = shelfIds.length;
  const boxesOf = shelfIds.map((id) => shelfLayoutIn(FACE, room.layout, id).filter((b) => b.level === level));
  // Recadrage : seul le bas utile du compartiment est montré (les objets sont posés sur la planche), à leurs mesures réelles en cm.
  const tallest = Math.max(0, ...boxesOf.flat().map((b) => b.local.h));
  const cropH = Math.min(board.local.h, Math.max(MIN_CROP_CM, tallest + CROP_MARGIN_CM));
  const cut = board.local.y + board.local.h - cropH; // haut de la partie montrée (repère de la face)
  const rowH = cropH + PLANK_CM + TITLE_CM;
  const width = stacked ? SHELF_INNER_CM + 2 * POST_CM : n * SHELF_INNER_CM + (n + 1) * POST_CM;
  const height = stacked ? n * rowH + (n - 1) * GAP_CM : rowH;
  // Coin haut gauche de l'intérieur de chaque bibliothèque : à la suite, ou l'une sous l'autre.
  const originOf = (i: number): [number, number] => (stacked ? [POST_CM, i * (rowH + GAP_CM)] : [POST_CM + i * (SHELF_INNER_CM + POST_CM), 0]);
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
  const captured = useRef(false);
  const onPointerDown = (e: ReactPointerEvent): void => { startY.current = e.clientY; swiped.current = false; captured.current = false; };
  // Un glissement qui finit hors de la tablette compte quand même : le doigt est capturé dès qu'il bouge (pas au simple toucher,
  // sinon le clic serait adressé à la tablette entière et non à la carte touchée).
  const onPointerMove = (e: ReactPointerEvent): void => {
    const s = startY.current;
    if (s === null || captured.current || Math.abs(e.clientY - s) < 8) return;
    captured.current = true;
    const el = e.currentTarget as Element;
    try {
      if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId);
    } catch { /* pointeur déjà relâché */ }
  };
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
    <div className="wmt-lib-board" data-shelf-board={level} data-board-stacked={stacked ? '' : undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { startY.current = null; }}>
      <svg key={level} data-board-enter={enter} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={reduced ? undefined : { animation: `wmt-board-${enter} ${enter === 'in' ? 400 : 250}ms ease-out` }}>
        {shelfIds.map((id, i) => {
          const [x0, y0] = originOf(i);
          const boxes = boxesOf[i]!;
          // Montant droit : la dernière à la suite, ou chaque bibliothèque empilée.
          const rightPost = stacked || i === n - 1;
          const titleY = y0 + cropH + PLANK_CM;
          return (
            <g key={id} data-board-shelf={id} data-board-y={y0}>
              <rect x={x0} y={y0} width={SHELF_INNER_CM} height={cropH} fill={palette.woodDark} />
              <rect x={x0 - POST_CM} y={y0} width={POST_CM} height={cropH + PLANK_CM} fill={palette.wood} />
              {rightPost && <rect x={x0 + SHELF_INNER_CM} y={y0} width={POST_CM} height={cropH + PLANK_CM} fill={palette.wood} />}
              <rect x={x0 - POST_CM} y={y0 + cropH} width={SHELF_INNER_CM + 2 * POST_CM} height={PLANK_CM} fill={palette.wood} />
              <rect data-board-band="" x={x0 - POST_CM} y={titleY} width={SHELF_INNER_CM + 2 * POST_CM} height={TITLE_CM} fill={TITLE_BAND} />
              {boxes.map((b) => {
                const p = stored.get(b.id);
                if (!p) return null;
                const info = cards[p.slug];
                const title = info?.title ?? p.slug.replace(/_/g, ' ');
                const url = info ? imageOf(p.slug) : undefined;
                const x = x0 + b.local.x;
                const y = y0 + b.local.y - cut;
                const w = b.local.w;
                const h = b.local.h;
                const display = displayOf(p);
                const spine = display === 'spine';
                // Jeu de dos : l'image du dos de sa boîte ; sans image, l'aplat de la couleur du boîtier.
                const back = display === 'back';
                const box = back || spine ? gameBoxContent(p.shape, p.slug) : {};
                const backUrl = back ? box.backUrl : undefined;
                // Jeu sur la tranche à boîte connue : la tranche dessinée comme la vraie.
                const gameSpine = spine ? box.spine : undefined;
                const spineFont = Math.min(w * 0.6, TITLE_FONT_CM);
                return (
                  <g
                    key={p.id}
                    data-board-card={p.slug}
                    data-board-display={display}
                    onClick={() => {
                      if (swiped.current) { swiped.current = false; return; }
                      if (info) onCard(p.slug);
                    }}
                    style={{ cursor: info ? 'pointer' : 'default' }}
                  >
                    {gameSpine
                      ? <g transform={`translate(${x} ${y})`}><GameSpine w={w} h={h} {...gameSpine} /></g>
                      : <rect x={x} y={y} width={w} height={h} fill={back ? (p.caseColor ?? GAME_CASE) : '#e8e2d6'} stroke={TITLE_INK} strokeWidth={0.3} />}
                    {back ? backUrl && <image href={backUrl} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" />
                      : !spine && url && <image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" />}
                    {gameSpine ? null : spine
                      ? <text data-board-title="" transform={`translate(${x + w / 2} ${y + h - 1}) rotate(-90)`} fontSize={spineFont} dominantBaseline="middle" fill={TITLE_INK}>{titleLines(title, (h - 2) / (spineFont * CHAR_W), 1)[0]}</text>
                      : titleLines(title, w / (TITLE_FONT_CM * CHAR_W)).map((line, k) => (
                        <text key={k} data-board-title="" x={x + w / 2} y={titleY + TITLE_FONT_CM * (k + 1)} fontSize={TITLE_FONT_CM} textAnchor="middle" fill={TITLE_INK}>{line}</text>
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
