// Dessin provisoire Opus : Fable n'est pas passé (gel jusqu'au 2026-10-17), reprise Fable prévue.
import { useRef, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import type { Matrix } from '../core/library/footprint';
import { FURNITURE_MODELS } from '../core/library/furniture-models';
import type { Layout, ShelfLevel, StyleId } from '../core/library/library-types';
import { SHELF_INNER_CM, SHELF_LEVELS, displayOf, isLit, isShelfLevel, shelfBoardsIn, shelfLayoutIn, type BoardItem, type PxRect, type ShelfItemBox } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { reducedMotion } from './ghibli-sky';
import { gameBoxContent } from './game-box-content';
import { GameSpine } from './game-spine';
import { Icon, ICONS } from './library-ui';
import { Item3DArt } from './model3d-art';

// Place d'insertion de la vue Modifier (cm de la face de `shelfId`) : verte si l'objet tenu y tient, rouge sinon.
export type BoardMarker = { shelfId: string; xCm: number; wCm: number; hCm: number; ok: boolean };
// Branchement de la vue Modifier : un doigt sur un objet passe à `onGrab` (toucher : la bulle de l'objet ; objet armé par ✥ Déplacer,
// `armed`, cerclé de bleu : le glissé), l'objet tenu est dessiné en transparence, la place d'insertion s'affiche.
// `pending` : id de la carte en attente de la vue ＋ (cerclée d'or ; de rouge si `pendingBlocked` : sa place ne tient plus).
export type BoardArrange = { held: string | null; marker: BoardMarker | null; onGrab: (id: string, e: ReactPointerEvent) => void; pending?: string | null; pendingBlocked?: boolean; armed?: string | null };

export type ShelfBoardProps = {
  shelfIds: string[];
  level: ShelfLevel;
  room: { style: StyleId; layout: Layout };
  cards: Record<string, { title: string; imageUrl?: string }>;
  imageOf: (slug: string) => string | undefined;
  onCard: (slug: string) => void;
  onLevel: (level: ShelfLevel) => void;
  // Portrait et deux bibliothèques liées : les deux tablettes l'une au-dessus de l'autre (celle de gauche en haut) au lieu de côte à côte.
  stacked?: boolean;
  // Calque tourné de 90° (vue Modifier en portrait) : le balayage se lit sur la verticale du calque, soit l'axe X de l'écran.
  rotated?: boolean;
  // ▲ depuis la tablette 0 (ou balayer vers le bas) : le niveau au-dessus (le dessus de l'étagère, vue Modifier) ; absent : ▲ grisé.
  onAbove?: () => void;
  // Vue Modifier : cadre exact (px du calque) au lieu de la mise en page du zoom, disposition qui donne le recadrage (celle sans le
  // glissé en cours : la tablette ne bouge pas pendant qu'on tient un objet), et gestes de glissé.
  frame?: PxRect;
  measure?: Layout;
  arrange?: BoardArrange;
};

// Face de l'étagère en cm (repère identité) : tablettes et objets rangés y gardent leurs mesures réelles (mêmes calculs que la pièce).
export const BOARD_FACE = { w: SHELF_INNER_CM, h: FURNITURE_MODELS.shelf.face!.h, m: [1, 0, 0, 1, 0, 0] as Matrix };
const FACE = BOARD_FACE;
export const POST_CM = 3; // montants (bords et entre deux bibliothèques)
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
// referrerPolicy n'est pas typé sur <image> SVG : passé par déploiement d'objet.
const NO_REFERRER = { referrerPolicy: 'no-referrer' } as object;

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

// Mise en page (cm) du second zoom d'une tablette : objets de chaque bibliothèque, recadrage, taille du dessin et origine de chaque
// bibliothèque. Partagée avec la vue Modifier (qui s'en sert pour viser une tablette au doigt).
export type BoardGeometry = { boxesOf: ShelfItemBox[][]; cropH: number; cut: number; rowH: number; width: number; height: number; originOf: (i: number) => [number, number] };
export function boardGeometry(layout: Layout, shelfIds: string[], level: ShelfLevel, stacked = false, measure: Layout = layout): BoardGeometry {
  const board = shelfBoardsIn(FACE)[level]!;
  const n = shelfIds.length;
  const boxesOf = shelfIds.map((id) => shelfLayoutIn(FACE, layout, id).filter((b) => b.level === level));
  // Recadrage : seul le bas utile du compartiment est montré (les objets sont posés sur la planche), à leurs mesures réelles en cm.
  const measured = measure === layout ? boxesOf : shelfIds.map((id) => shelfLayoutIn(FACE, measure, id).filter((b) => b.level === level));
  const tallest = Math.max(0, ...measured.flat().map((b) => b.local.h));
  const cropH = Math.min(board.local.h, Math.max(MIN_CROP_CM, tallest + CROP_MARGIN_CM));
  const cut = board.local.y + board.local.h - cropH; // haut de la partie montrée (repère de la face)
  const rowH = cropH + PLANK_CM + TITLE_CM;
  const width = stacked ? SHELF_INNER_CM + 2 * POST_CM : n * SHELF_INNER_CM + (n + 1) * POST_CM;
  const height = stacked ? n * rowH + (n - 1) * GAP_CM : rowH;
  // Coin haut gauche de l'intérieur de chaque bibliothèque : à la suite, ou l'une sous l'autre.
  const originOf = (i: number): [number, number] => (stacked ? [POST_CM, i * (rowH + GAP_CM)] : [POST_CM + i * (SHELF_INNER_CM + POST_CM), 0]);
  return { boxesOf, cropH, cut, rowH, width, height, originOf };
}

// Second zoom : une tablette (de une ou deux bibliothèques liées, à la suite ou empilées), cartes au plus grand avec leur titre, petits
// objets de tablette à leur place ; ↑ ↓ ou glisser verticalement pour changer de tablette.
export function ShelfBoardZoom({ shelfIds, level, room, cards, imageOf, onCard, onLevel, stacked = false, onAbove, frame, measure, arrange, rotated = false }: ShelfBoardProps): ReactElement {
  const palette = paletteOf(room.style);
  const n = shelfIds.length;
  const { boxesOf, cropH, cut, rowH, width, height, originOf } = boardGeometry(room.layout, shelfIds, level, stacked, measure);
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
    else if (next < 0) onAbove?.();
  };
  // Calque tourné de 90° (écran en hauteur) : sa verticale est l'axe X de l'écran, inversé (ly = innerWidth − clientX).
  const vy = (e: ReactPointerEvent): number => (rotated ? -e.clientX : e.clientY);
  const captured = useRef(false);
  const onPointerDown = (e: ReactPointerEvent): void => { startY.current = vy(e); swiped.current = false; captured.current = false; };
  // Un glissement qui finit hors de la tablette compte quand même : le doigt est capturé dès qu'il bouge (pas au simple toucher,
  // sinon le clic serait adressé à la tablette entière et non à la carte touchée).
  const onPointerMove = (e: ReactPointerEvent): void => {
    const s = startY.current;
    if (s === null || captured.current || Math.abs(vy(e) - s) < 8) return;
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
    const dy = vy(e) - s;
    if (Math.abs(dy) < SWIPE_PX) return;
    swiped.current = true;
    go(dy < 0 ? 1 : -1);
  };
  const items = new Map(room.layout.filter((p): p is BoardItem => p.kind === 'stored' || (p.kind === 'small' && 'level' in p)).map((p) => [p.id, p]));
  const last = SHELF_LEVELS[SHELF_LEVELS.length - 1]!;
  const reduced = reducedMotion();
  // Vue Modifier : un doigt sur un objet passe à la saisie (toucher : sa bulle ; objet armé par ✥ : le glissé), et ne remonte pas au
  // conteneur (pas de balayage de tablette).
  const grab = arrange ? (id: string) => (e: ReactPointerEvent) => { e.stopPropagation(); arrange.onGrab(id, e); } : () => undefined;
  const heldStyle = (id: string) => (arrange?.held === id ? { opacity: 0.35 } : {});
  // Objet armé par ✥ Déplacer (vue Modifier) : cerclé de bleu, prêt à glisser ; les autres se touchent (bulle), ils ne se saisissent pas.
  const armedRing = (id: string, x: number, y: number, w: number, h: number) => (arrange?.armed === id && arrange.held !== id
    ? <rect data-armed="" x={x - 0.8} y={y - 0.8} width={w + 1.6} height={h + 1.6} rx={0.8} fill="none" stroke="#2f7fd6" strokeWidth={0.9} strokeDasharray="2 1.2" pointerEvents="none" />
    : null);
  const cursorOf = (id: string, fallback: string) => (!arrange ? fallback : arrange.armed === id || arrange.pending === id ? 'grab' : 'pointer');
  const steampunk = room.style === 'steampunk';

  return (
    <div className="wmt-lib-board" data-shelf-board={level} data-board-stacked={stacked ? '' : undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { startY.current = null; }}
      style={frame ? { left: frame.x, top: frame.y, width: frame.w, height: frame.h } : undefined}>
      <svg key={level} data-board-enter={enter} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={reduced ? undefined : { animation: `wmt-board-${enter} ${enter === 'in' ? 400 : 250}ms ease-out` }}>
        {shelfIds.map((id, i) => {
          const [x0, y0] = originOf(i);
          const boxes = boxesOf[i]!;
          // Montant droit : la dernière à la suite, ou chaque bibliothèque empilée.
          const rightPost = stacked || i === n - 1;
          const titleY = y0 + cropH + PLANK_CM;
          const marker = arrange?.marker?.shelfId === id ? arrange.marker : null;
          return (
            <g key={id} data-board-shelf={id} data-board-y={y0}>
              <rect x={x0} y={y0} width={SHELF_INNER_CM} height={cropH} fill={palette.woodDark} />
              <rect x={x0 - POST_CM} y={y0} width={POST_CM} height={cropH + PLANK_CM} fill={palette.wood} />
              {rightPost && <rect x={x0 + SHELF_INNER_CM} y={y0} width={POST_CM} height={cropH + PLANK_CM} fill={palette.wood} />}
              <rect x={x0 - POST_CM} y={y0 + cropH} width={SHELF_INNER_CM + 2 * POST_CM} height={PLANK_CM} fill={palette.wood} />
              <rect data-board-band="" x={x0 - POST_CM} y={titleY} width={SHELF_INNER_CM + 2 * POST_CM} height={TITLE_CM} fill={TITLE_BAND} />
              {boxes.map((b) => {
                const p = items.get(b.id);
                if (!p) return null;
                const x = x0 + b.local.x;
                const y = y0 + b.local.y - cut;
                const w = b.local.w;
                const h = b.local.h;
                if (p.kind === 'small') {
                  // Petit objet de tablette : son modèle 3D de face, à ses mesures (lampe allumée ou éteinte comme dans la pièce).
                  return (
                    <g key={p.id} data-board-small={p.id} onPointerDown={grab(p.id)} style={{ cursor: cursorOf(p.id, 'default'), ...heldStyle(p.id) }}>
                      <Item3DArt shape={`small-${p.item}`} angle={0} rect={{ x, y, w, h }} palette={palette} steampunk={steampunk} content={p.item === 'lamp' ? { lit: isLit(p) } : undefined} />
                      {armedRing(p.id, x, y, w, h)}
                    </g>
                  );
                }
                const info = cards[p.slug];
                const title = info?.title ?? p.slug.replace(/_/g, ' ');
                const url = info ? imageOf(p.slug) : undefined;
                const display = displayOf(p);
                const spine = display === 'spine';
                // Jeu de dos : l'image du dos de sa boîte, sinon le dos fabriqué ; boîte inconnue : l'aplat de la couleur du boîtier.
                const back = display === 'back';
                const box = back || spine ? gameBoxContent(p.shape, p.slug) : {};
                const backUrl = back ? box.backUrl : undefined;
                // Jeu sur la tranche à boîte connue : la tranche dessinée comme la vraie.
                const gameSpine = spine ? box.spine : undefined;
                const spineFont = Math.min(w * 0.6, TITLE_FONT_CM);
                const waiting = arrange?.pending === p.id;
                return (
                  <g
                    key={p.id}
                    data-board-card={p.slug}
                    data-board-display={display}
                    {...(waiting ? { 'data-pending': p.slug } : {})}
                    onPointerDown={grab(p.id)}
                    onClick={() => {
                      if (swiped.current) { swiped.current = false; return; }
                      // Vue Modifier : le toucher passe par la saisie (onGrab), qui ouvre la bulle de la carte.
                      if (info && !arrange) onCard(p.slug);
                    }}
                    style={{ cursor: cursorOf(p.id, info ? 'pointer' : 'default'), ...heldStyle(p.id) }}
                  >
                    {gameSpine
                      ? <g transform={`translate(${x} ${y})`}><GameSpine w={w} h={h} {...gameSpine} /></g>
                      : <rect x={x} y={y} width={w} height={h} fill={back || p.shape === 'game' ? (p.caseColor ?? GAME_CASE) : '#e8e2d6'} stroke={TITLE_INK} strokeWidth={0.3} />}
                    {back ? (backUrl
                      ? <image href={backUrl} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" {...NO_REFERRER} />
                      : box.back && <g transform={`translate(${x} ${y})`}>{box.back.draw(w, h)}</g>)
                      // Jeu : jaquette entière sur le plastique du boîtier, comme sur la boîte ouverte.
                      : !spine && url && <image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio={p.shape === 'game' ? 'xMidYMid meet' : 'xMidYMid slice'} {...NO_REFERRER} />}
                    {gameSpine ? null : spine
                      ? <text data-board-title="" transform={`translate(${x + w / 2} ${y + h - 1}) rotate(-90)`} fontSize={spineFont} dominantBaseline="middle" fill={TITLE_INK}>{titleLines(title, (h - 2) / (spineFont * CHAR_W), 1)[0]}</text>
                      : titleLines(title, w / (TITLE_FONT_CM * CHAR_W)).map((line, k) => (
                        <text key={k} data-board-title="" x={x + w / 2} y={titleY + TITLE_FONT_CM * (k + 1)} fontSize={TITLE_FONT_CM} textAnchor="middle" fill={TITLE_INK}>{line}</text>
                      ))}
                    {armedRing(p.id, x, y, w, h)}
                    {/* Carte en attente (vue ＋) : halo doré autour du boîtier. */}
                    {waiting && <rect data-pending-halo="" x={x - 0.6} y={y - 0.6} width={w + 1.2} height={h + 1.2} rx={0.6} fill="none" stroke={arrange?.pendingBlocked ? '#C8443A' : '#F5C542'} strokeWidth={1} pointerEvents="none" style={{ filter: `drop-shadow(0 0 1.5px ${arrange?.pendingBlocked ? '#C8443A' : '#F5C542'})` }} />}
                  </g>
                );
              })}
              {marker && (() => {
                const mh = Math.min(marker.hCm, cropH);
                return <rect data-insert="" data-ok={marker.ok ? 'true' : 'false'} x={x0 + marker.xCm} y={y0 + cropH - mh} width={marker.wCm} height={mh} rx={0.6}
                  fill={marker.ok ? 'rgba(62,155,90,.28)' : 'rgba(200,68,58,.3)'} stroke={marker.ok ? '#3E9B5A' : '#C8443A'} strokeWidth={0.8} strokeDasharray="2 1.5" pointerEvents="none" />;
              })()}
            </g>
          );
        })}
      </svg>
      <div className="wmt-lib-board-nav">
        <button type="button" className="wmt-lib-fab" data-action="board-up" aria-label="Tablette du dessus" title="Tablette du dessus" disabled={level === 0 && !onAbove} onClick={() => go(-1)} style={{ position: 'static' }}>
          <Icon paths={ICONS.up} />
        </button>
        <button type="button" className="wmt-lib-fab" data-action="board-down" aria-label="Tablette du dessous" title="Tablette du dessous" disabled={level === last} onClick={() => go(1)} style={{ position: 'static' }}>
          <Icon paths={ICONS.down} />
        </button>
      </div>
    </div>
  );
}
