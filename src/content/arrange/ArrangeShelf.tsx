// Vue Modifier d'une étagère entière (✋) : le meuble de face avec ses tablettes (deux bibliothèques liées côte à côte), zoom par
// tablette comme le zoom connu (ShelfBoardZoom), le dessus en plongée (ArrangeView). On y glisse cartes et petits objets d'une
// tablette à l'autre et entre les tablettes et les dessus : place d'insertion verte / rouge, bord d'écran en zoom pour passer au niveau
// voisin (use-board-drag). En mode ＋, la réglette 🃏 met une carte en attente (halo doré) sur la première tablette libre, qu'on glisse
// à sa place (tablette + rang, ou un dessus) avant ✓ (use-pending-card).
// Couche plein écran paysage (tournée de 90° en CSS si l'écran reste en hauteur), mur et sol de la pièce en fond.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { cardQuad, boxOfQuad, placementRectPx } from '../../core/library/carried-items';
import type { Layout, Placed, ShelfLevel, StyleId } from '../../core/library/library-types';
import { layerFrame } from '../../core/library/opened-item';
import { SHELF_GAP_CM, SHELF_INNER_CM, boardHeightCm, boardItems, boardUsedCm, boardWidthCm, displayOf, isLit, shelfLayoutIn, type BoardLike, type PxRect } from '../../core/library/room-grid';
import { gameBoxContent } from '../game-box-content';
import { paletteOf } from '../../core/library/styles';
import { topSize, topThingOf, type TopThing } from '../../core/library/surface';
import { useDecoScene } from '../deco-live';
import { GarnishedPiece, garnishOf, onShelfBoard, type ZoomCards } from '../furniture-zoom';
import { Item3DArt } from '../model3d-art';
import type { SceneView } from '../RoomView';
import { ShelfBoardZoom, type BoardMarker } from '../shelf-board-zoom';
import { ArrangeView, NAV_PX, arrangeFrameFor, frameAt } from './ArrangeView';
import { FURNITURE_MODELS } from '../../core/library/furniture-models';
import { boardAim, boardBoxPx, boardFrameFor, boardRect, isBoardLevel, topAim, wholeAim, wholeBoxPx, wholeFrameFor } from './arrange-shelf-frames';
import { axesOf, topPx } from './use-top-drag';
import { useBoardDrag, type ArrangeLevel, type BoardAim } from './use-board-drag';
import { BUTTON, HALO, KO_HALO, PendingChrome } from './arrange-chrome';
import { PENDING_ID, pendingAtOf, usePendingCard, type AddProps } from './use-pending-card';
import { CardBubble } from './CardBubble';
import { useCardBubble, type CardBubbleProps, type CardBubbleState } from './use-card-bubble';

export type { ArrangeLevel } from './use-board-drag';
export { boardFrameFor, boardPointPx, wholeBoardPx, wholeFrameFor } from './arrange-shelf-frames';

type Props = CardBubbleProps & {
  layout: Layout;
  room: { style: StyleId };
  // L'étagère (et sa partenaire liée), de gauche à droite.
  shelfIds: string[];
  level: ArrangeLevel;
  // 'add' : réglette 🃏 et carte en attente (`add`) ; absent : 'move'.
  mode?: 'move' | 'add';
  add?: AddProps;
  cards?: ZoomCards;
  imageOf?(slug: string): string | undefined;
  sceneView?: SceneView;
  onLevel(level: ArrangeLevel): void;
  // Intentions de déplacement (appliquées par l'appelant à la disposition du moment, jamais à un instantané) ; rendent la promesse de l'écriture.
  // `onTop` sert aussi aux objets d'un dessus déplacés sur le même dessus.
  onBoard(id: string, shelfId: string, level: ShelfLevel, order: number): Promise<unknown> | void;
  onTop(id: string, hostId: string, x: number, z: number): Promise<unknown> | void;
  onClose(): void;
};

// Ce qu'un objet tenu occuperait sur un dessus : petit objet, carte rangée (trépied), carte posée (sa pose).
const topThingFor = (p: Placed | undefined): TopThing | null =>
  p?.kind === 'small' ? { item: p.item } : p?.kind === 'stored' ? { shape: p.shape, box: p.box } : p?.kind === 'posed' ? topThingOf(p) : null;
const NO_IMAGE = () => undefined;
const screenSize = () => ({ w: window.innerWidth, h: window.innerHeight });
const r1 = (v: number): number => Math.round(v * 10) / 10;
const OK = { fill: 'rgba(62,155,90,.28)', stroke: '#3E9B5A' };
const KO = { fill: 'rgba(200,68,58,.3)', stroke: '#C8443A' };

export function ArrangeShelf({ layout, room, shelfIds, level, mode = 'move', add, cards = {}, imageOf = NO_IMAGE, sceneView, onLevel, onBoard, onTop, onClose, ...bubbleProps }: Props): ReactElement | null {
  const [screen, setScreen] = useState(screenSize);
  useEffect(() => {
    const onResize = () => setScreen(screenSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const escape = useCallback(() => (level === 'whole' ? onClose() : onLevel('whole')), [level, onClose, onLevel]);
  const layer = layerFrame(screen);
  const ids = shelfIds;
  const palette = paletteOf(room.style);
  const steampunk = room.style === 'steampunk';
  const clipId = `wm-arrange-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const decoScene = useDecoScene(sceneView, false, layout.some((p) => p.kind === 'small' && (p.item === 'alarm' || p.item === 'clock' || p.item === 'station')));

  // Mode ＋ : la carte en attente fait partie de la disposition dessinée et glissée ; ses glissés la déplacent sans rien écrire.
  const pend = usePendingCard({ layout, ids, add, enabled: mode === 'add' });
  const moves = pend.wrap({ onBoard, onTop });
  const pendingId = pend.shown ? PENDING_ID : null;
  // Disposition avec les attentes appliquées (`applied`) : visée et cadres stables pendant un glissé ; `preview` : ce qu'on dessine.
  const bubbleRef = useRef<CardBubbleState | null>(null);
  const { drag, applied, preview, grab, wasDrag } = useBoardDrag({
    layout: pend.view, level, layerH: layer.h, rotated: layer.rotated, onBoard: moves.onBoard, onTop: moves.onTop, onLevel,
    // Bulle d'un objet (relue ici : elle vient après le glissé) : un toucher l'ouvre (au meuble entier, il zoome), seul l'objet armé
    // par ✥ (ou la carte en attente) se glisse, le lâcher le désarme.
    onTap: (id) => { if (level !== 'whole') bubbleRef.current?.open(id); },
    canDrag: (id) => id === PENDING_ID || bubbleRef.current?.armed === id,
    onRelease: () => bubbleRef.current?.disarm(),
    aimAt: (lx, ly, id, a) => {
      if (level === 'whole') return wholeAim(wholeFrameFor(ids, a, layer), lx, ly);
      if (isBoardLevel(level)) return boardAim(boardFrameFor(a, ids, level, layer), lx);
      const thing = topThingFor(a.find((q) => q.id === id));
      return thing ? topAim(ids, layer, lx, ly, topSize(thing)) : null;
    },
    boxOf: (id, a) => {
      if (level === 'whole') {
        const f = wholeFrameFor(ids, a, layer);
        for (let i = 0; i < ids.length; i++) {
          const b = shelfLayoutIn(f.face, a, ids[i]!).find((q) => q.id === id);
          if (b) return wholeBoxPx(f, i, b.local);
        }
        return null;
      }
      if (!isBoardLevel(level)) return null;
      const f = boardFrameFor(a, ids, level, layer);
      for (let i = 0; i < ids.length; i++) {
        const b = boardBoxPx(f, i, id);
        if (b) return b;
      }
      return null;
    },
  });
  // Bulle (fermée à chaque changement de niveau ; l'objet armé reste, un glissé peut passer d'un niveau à l'autre) ; les refus se jugent sur
  // ce que l'on voit (`applied` : déplacements en attente et carte en attente).
  const bubble = useCardBubble(applied, bubbleProps, level);
  bubbleRef.current = bubble;
  // Échap fait comme le Retour : une fiche ouverte se ferme seule ; puis la bulle (et l'objet armé) ; en zoom, le meuble entier ; au meuble
  // entier, la fermeture (au niveau du dessus, ArrangeView la relaie).
  const busy = bubble.item !== null || bubble.armed !== null;
  const { close: closeBubble, disarm, sheetOpen } = bubble;
  useEffect(() => {
    if (level === 'top') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || sheetOpen) return;
      if (busy) { closeBubble(); disarm(); } else escape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [escape, level, busy, closeBubble, disarm, sheetOpen]);
  const whole = useMemo(() => wholeFrameFor(ids, applied, layer), [ids, applied, layer.w, layer.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const board = useMemo(() => (isBoardLevel(level) ? boardFrameFor(preview, ids, level, layer, applied) : null), [level, preview, ids, applied, layer.w, layer.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const heldItem = drag ? applied.find((p) => p.id === drag.id) : undefined;
  const heldLike: BoardLike | null = heldItem?.kind === 'stored' ? heldItem : heldItem?.kind === 'small' ? { id: heldItem.id, item: heldItem.item }
    : heldItem?.kind === 'posed' ? { id: heldItem.id, shape: heldItem.shape, box: heldItem.box } : null;

  // Place d'insertion sur une tablette (cm de la face) : la place de l'objet tenu dans l'aperçu (vert), sinon au bout de la tablette
  // telle qu'elle est (rouge : rien ne bouge, l'objet tenu y compris s'il y est).
  const marker = useMemo((): BoardMarker | null => {
    if (!drag || !heldLike || drag.aim?.kind !== 'board') return null;
    const { shelfId, level: lv } = drag.aim;
    const wCm = boardWidthCm(heldLike);
    const hCm = boardHeightCm(heldLike);
    if (drag.ok) {
      const b = shelfLayoutIn(whole.face, preview, shelfId).find((q) => q.id === drag.id);
      return b ? { shelfId, xCm: b.x0Cm, wCm, hCm, ok: true } : null;
    }
    const items = boardItems(applied, shelfId, lv);
    return { shelfId, xCm: boardUsedCm(items) + (items.length > 0 ? SHELF_GAP_CM : 0), wCm, hCm, ok: false };
  }, [drag, heldLike, preview, applied, whole.face]);
  // Garnitures du meuble entier (mêmes dessins que le zoom), refaites seulement quand l'aperçu change (pas à chaque mouvement du doigt).
  const garnishes = useMemo(() => ids.map((id) => {
    const shelf = preview.find((p) => p.id === id);
    return shelf ? garnishOf(preview, shelf, cards, imageOf, room.style, decoScene) : [];
  }), [ids, preview, cards, imageOf, room.style, decoScene]);

  const geometry: CSSProperties = layer.rotated
    ? { top: 0, left: screen.w, width: layer.w, height: layer.h, transformOrigin: '0 0', transform: 'rotate(90deg)' }
    : { inset: 0 };
  const layerStyle: CSSProperties = { position: 'absolute', zIndex: 40, overflow: 'hidden', background: palette.wall, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', ...geometry };
  // Objet tenu : copie sous le doigt (même prise), à l'échelle du niveau ; verte ou rouge selon la visée.
  const pxPerCm = board ? board.scale : (whole.scale * whole.face.w) / SHELF_INNER_CM;
  // Sur le dessus, en vert, l'objet est déjà dessiné à la place visée (aperçu en plongée) : pas de copie sous le doigt.
  const held = drag && heldLike && heldItem && !(level === 'top' && drag.ok) ? (() => {
    const w = boardWidthCm(heldLike) * pxPerCm;
    const h = boardHeightCm(heldLike) * pxPerCm;
    const x = drag.lx - drag.fx * w;
    const y = drag.ly - drag.fy * h;
    const tone = drag.ok ? OK : KO;
    const card = heldItem.kind === 'stored' || heldItem.kind === 'posed' ? heldItem : null;
    const slug = card?.slug;
    const title = slug ? (cards[slug]?.title ?? slug.replace(/_/g, ' ')) : '';
    // Carte : sa présentation (de face : la pochette ; sur la tranche : le titre debout ; de dos : le dos de la boîte ou le plastique) ;
    // une carte posée se montre de face.
    const display = heldItem.kind === 'stored' ? displayOf(heldItem) : 'cover';
    const box = card && display === 'back' ? gameBoxContent(card.shape, card.slug) : null;
    const url = slug && display === 'cover' ? imageOf(slug) : display === 'back' ? box?.backUrl : undefined;
    const dark = card !== null && (card.shape === 'game' || display === 'back');
    return (
      <svg data-arrange-held={drag.id} data-ok={drag.ok ? 'true' : 'false'} data-display={display} width={layer.w} height={layer.h} viewBox={`0 0 ${layer.w} ${layer.h}`} aria-hidden="true"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.4))' }}>
        <g transform={`translate(${r1(x)} ${r1(y)})`}>
          {!card
            ? heldItem.kind === 'small' && <Item3DArt shape={`small-${heldItem.item}`} angle={0} rect={{ x: 0, y: 0, w, h }} palette={palette} steampunk={steampunk} content={heldItem.item === 'lamp' ? { lit: isLit(heldItem) } : undefined} />
            : (
              <>
                <rect width={w} height={h} fill={dark ? (card.caseColor ?? '#1B1B1F') : '#e8e2d6'} />
                {url && <image href={url} width={w} height={h} preserveAspectRatio="xMidYMid slice" {...({ referrerPolicy: 'no-referrer' } as object)} />}
                {!url && display === 'spine' && <text transform={`translate(${w / 2} ${h - 4}) rotate(-90)`} fontSize={Math.min(w * 0.6, 12)} dominantBaseline="middle" fill={dark ? '#FBF6EA' : '#2a2420'} fontFamily="system-ui, sans-serif">{title}</text>}
                {!url && display !== 'spine' && <text x={w / 2} y={h / 2} fontSize={Math.max(8, w / 6)} textAnchor="middle" dominantBaseline="middle" fill={dark ? '#FBF6EA' : '#2a2420'} fontFamily="system-ui, sans-serif">{title}</text>}
              </>
            )}
          <rect x={-2} y={-2} width={w + 4} height={h + 4} fill="none" stroke={tone.stroke} strokeWidth={2.5} strokeDasharray="7 5" />
        </g>
      </svg>
    );
  })() : null;
  const message = drag && !drag.ok && drag.message ? (
    <div data-arrange-message="" style={{ position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)', padding: '6px 12px', borderRadius: 8, background: 'rgba(43,29,22,.82)', color: '#FBF6EA', font: '600 14px system-ui, sans-serif', pointerEvents: 'none', whiteSpace: 'nowrap' }}>{drag.message}</div>
  ) : null;
  const chrome = <PendingChrome mode={mode} add={add} layout={layout} pend={pend} onClose={onClose} />;

  // Le dessus : ArrangeView (plongée, les deux dessus liés côte à côte) qui ne fait que dessiner — un doigt sur un objet du dessus le
  // saisit par le glissé de l'étagère, qui peut le faire descendre sur une tablette (bord bas) ou passer sur l'autre dessus — et, par-dessus,
  // ▼, l'empreinte rouge/verte de l'objet tenu sur le dessus visé, sa copie tenue (en rouge seulement : en vert, l'aperçu le montre en place).
  if (level === 'top') {
    const thing = topThingFor(heldItem);
    const footprint = drag?.aim?.kind === 'top' && thing ? (() => {
      const aim = drag.aim as Extract<BoardAim, { kind: 'top' }>;
      const a = axesOf(frameAt(arrangeFrameFor('shelf', layer, ids.length), Math.max(0, ids.indexOf(aim.hostId))));
      const r = { x: aim.x, z: aim.z, ...topSize(thing) };
      const pts = [[r.x, r.z], [r.x + r.w, r.z], [r.x + r.w, r.z + r.d], [r.x, r.z + r.d]].map(([x, z]) => topPx(a, x!, z!)).map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
      const tone = drag.ok ? OK : KO;
      return <polygon data-insert="" data-ok={drag.ok ? 'true' : 'false'} data-top={aim.hostId} points={pts} fill={tone.fill} stroke={tone.stroke} strokeWidth={2.5} strokeDasharray="7 5" />;
    })() : null;
    return (
      <>
        <ArrangeView layout={drag?.ok && drag.aim?.kind === 'top' ? preview : applied} room={room} hostId={ids[0]!} hostIds={ids} mode={mode}
          external={{ grab, held: drag?.id ?? null, pending: pendingId, blocked: pend.blocked }} onClose={onClose} onEscape={escape} sceneView={sceneView} imageOf={imageOf}
          cardBubble={bubble} />
        <div data-arrange-shelf={ids.join('+')} data-arrange-level="top" data-arrange-mode={mode} style={{ ...layerStyle, zIndex: 41, background: 'none', pointerEvents: 'none' }}>
          {footprint && <svg width={layer.w} height={layer.h} viewBox={`0 0 ${layer.w} ${layer.h}`} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>{footprint}</svg>}
          {held}
          {message}
          <button type="button" data-action="board-down" aria-label="Tablette du dessous" title="Tablette du dessous" onClick={() => onLevel(0)}
            style={{ ...BUTTON, position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'auto' }}>▼</button>
          {chrome}
        </div>
      </>
    );
  }

  const floorY = Math.min(layer.h, Math.max(0, whole.oy + (whole.pad + whole.art.h) * whole.scale));
  // Bulle d'un objet de la tablette zoomée : sous toute la bande de la tablette (titres compris), dans l'axe de l'objet ; jamais dessus.
  const bubbleAnchor = board && bubble.item ? (() => {
    const box = ids.map((_, i) => boardBoxPx(board, i, bubble.item!.id)).find((b) => b !== null);
    if (!box) return null;
    const strip = boardRect(board);
    return { x: box.x, w: box.w, y: strip.y, h: strip.h };
  })() : null;
  return (
    <div data-arrange-shelf={ids.join('+')} data-arrange-level={String(level)} data-arrange-mode={mode} onPointerDown={bubble.item ? closeBubble : undefined} style={layerStyle}>
      <svg width={layer.w} height={layer.h} viewBox={`0 0 ${layer.w} ${layer.h}`} style={{ display: 'block', touchAction: 'none' }} aria-hidden="true">
        {/* Mur, plinthe et sol de la pièce, en aplats (meuble entier seulement : en zoom, le mur nu derrière la tablette). */}
        {level === 'whole' && (
          <>
            <rect data-backdrop="wall" width={layer.w} height={floorY} fill={palette.wall} />
            <rect data-backdrop="floor" y={floorY} width={layer.w} height={Math.max(0, layer.h - floorY)} fill={palette.floor} />
            <rect data-backdrop="skirt" y={floorY - 4} width={layer.w} height={5} fill={palette.skirt} opacity={0.6} />
          </>
        )}
        {level === 'whole' && (
          <g transform={`translate(${r1(whole.ox)} ${r1(whole.oy)}) scale(${whole.scale}) translate(0 ${whole.pad})`}>
            {ids.map((id, i) => {
              const garnish = garnishes[i] ?? [];
              // Place d'insertion : cm de la face → px natifs de la face (mêmes échelles que shelfLayoutIn).
              const m = marker?.shelfId === id && drag?.aim?.kind === 'board' ? marker : null;
              const sx = whole.face.w / SHELF_INNER_CM;
              const sy = whole.face.h / FURNITURE_MODELS.shelf.face!.h;
              const mb = m && drag?.aim?.kind === 'board' ? whole.boards[drag.aim.level]! : null;
              return (
                <g key={id} data-arrange-piece={id} transform={i > 0 ? `translate(${i * whole.art.w} 0)` : undefined}>
                  <GarnishedPiece host="shelf" angle={0} rect={whole.art} garnish={garnish} palette={palette} steampunk={steampunk} clipId={`${clipId}-${id}`} faded={drag?.id} />
                  {/* Toute la tablette est touchable : elle mène au zoom (sous les objets, qui y mènent aussi). */}
                  {whole.boards.map((b) => (
                    <g key={`board-${b.level}`} data-zoom-board={b.level} transform={`matrix(${whole.face.m.join(' ')})`} onClick={() => onLevel(b.level)} style={{ cursor: 'pointer' }}>
                      <rect x={b.local.x} y={b.local.y} width={b.local.w} height={b.local.h} fill="transparent" />
                    </g>
                  ))}
                  {garnish.filter((g) => onShelfBoard(g.p)).map(({ p, pl }) => {
                    // Carte rangée ou petit objet : un doigt le saisit, un toucher (sans glissé) zoome sur sa tablette, comme la tablette.
                    const quad = cardQuad(p, 0, whole.art, pl, steampunk);
                    const hit = quad && quad.length > 0 ? boxOfQuad(quad) : placementRectPx('shelf', 0, whole.art, pl, steampunk);
                    const lv = (p as { level: ShelfLevel }).level;
                    // Carte en attente : cerclée d'or.
                    const waiting = p.id === pendingId && p.kind === 'stored';
                    return (
                      <g key={p.id} {...(p.kind === 'stored' ? { 'data-zoom-card': p.slug } : { 'data-zoom-small': p.id })} onPointerDown={(e) => grab(p.id, e)}
                        {...(waiting ? { 'data-pending': p.slug, 'data-at': pendingAtOf(applied) ?? '', 'data-ok': pend.blocked ? 'false' : 'true' } : {})}
                        onClick={() => { if (!wasDrag()) onLevel(lv); }} style={{ cursor: 'grab' }}>
                        <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill={waiting ? (pend.blocked ? 'rgba(200,68,58,.3)' : 'rgba(245,197,66,.18)') : 'transparent'}
                          {...(waiting ? { 'data-pending-halo': '', stroke: pend.blocked ? KO_HALO : HALO, strokeWidth: 3, vectorEffect: 'non-scaling-stroke' } : {})} />
                      </g>
                    );
                  })}
                  {m && mb && (() => {
                    const h = Math.min(m.hCm * sy, mb.local.h);
                    return (
                      <g transform={`matrix(${whole.face.m.join(' ')})`}>
                        <rect data-insert="" data-ok={m.ok ? 'true' : 'false'} x={m.xCm * sx} y={mb.local.y + mb.local.h - h} width={m.wCm * sx} height={h}
                          fill={m.ok ? OK.fill : KO.fill} stroke={m.ok ? OK.stroke : KO.stroke} strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                      </g>
                    );
                  })()}
                </g>
              );
            })}
          </g>
        )}
      </svg>
      {board && (
        <ShelfBoardZoom shelfIds={ids} level={board.level} room={{ style: room.style, layout: preview }} measure={applied} cards={cards} imageOf={imageOf}
          onCard={NO_IMAGE} onLevel={onLevel} onAbove={() => onLevel('top')} frame={boardRect(board)} rotated={layer.rotated}
          arrange={{ held: drag?.id ?? null, marker, onGrab: grab, pending: pendingId, pendingBlocked: pend.blocked, armed: bubble.armed }} />
      )}
      {held}
      {message}
      {bubble.item && bubbleAnchor && (
        <CardBubble item={bubble.item} anchor={bubbleAnchor} layer={layer} reserveRight={NAV_PX} message={bubble.message} canEdit={bubble.canEdit}
          onMove={bubble.arm} onChange={bubble.change} onInfo={bubble.canInfo ? bubble.info : undefined} onCity={bubble.canCity ? bubble.city : undefined} onClose={bubble.close} />
      )}
      {chrome}
    </div>
  );
}
