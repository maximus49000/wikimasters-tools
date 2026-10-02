import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { cardMarket, toCardPreview } from '../core/collection/card-preview';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { CollectionScanner } from '../core/collection/collection-scan';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { EMPTY_LINKS, needsLinksLookup, type LinksState } from '../core/links/links-book';
import type { LinksRepo } from '../core/links/links-repo';
import { buildWeb, cardId, hubId, neighborhood, type Focus, type WebGraph } from '../core/links/web-graph';
import { layoutWeb, type Point } from '../core/links/web-layout';
import { ZOOM_STEP, boundsOf, fitTransform, pinch, zoomAt, type Transform } from '../core/links/web-view';
import type { PriceBook } from '../core/pricing/price-book';
import type { Rect } from './card-popup-position';
import { CardPopup } from './CardPopup';
import type { CollectionFilterSource } from './collection-filter';
import type { KindFilterSource } from './kind-filter';
import type { MarketSource } from './market-source';
import { createThrottledLoader } from './throttle';
import { useFilteredCards } from './useFilteredCards';
import { useNowPlayingSlugs } from './useNowPlayingSlugs';
import { useWantPrices } from './useWantPrices';

type Props = {
  collection: CollectionRepo;
  links: LinksRepo;
  kinds: KindsRepo;
  kindFilterSource: KindFilterSource;
  scanner: CollectionScanner;
  book: PriceBook | null;
  market: MarketSource;
  filterSource: CollectionFilterSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
  // Fiche de marché de la carte.
  onOpen: (slug: string) => void;
  onOpenCard: (slug: string) => void;
  // Cartes affichées dont les prix du marché sont à relever.
  onWantCards: (cards: KnownCard[]) => void;
};

const CARD = 34;
const RETRY_MS = 30_000;
// Au-delà de cette distance (px), un doigt ou une souris qui bouge déplace la toile au lieu de toucher un nœud.
const DRAG_SLOP = 5;
const FADED = 0.2;
// Les plus partagés gardent leur nom même dézoomés.
const ALWAYS_LABELLED = 12;

const box = {
  border: '1px solid var(--color-border, rgba(148,163,184,0.35))',
  borderRadius: 12,
  background: 'var(--color-surface, #0d1117)',
  color: 'var(--color-foreground, #e6edf3)',
  font: '14px/20px system-ui, sans-serif',
} as const;

const glyphButton = {
  width: 40,
  height: 40,
  cursor: 'pointer',
  font: '600 18px/1 system-ui, sans-serif',
  color: 'inherit',
  background: 'var(--color-surface, #0d1117)',
  border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
  borderRadius: 8,
} as const;

const rarityColor = (card: KnownCard) => (card.rarity ? `var(--color-rarity-${card.rarity.toLowerCase()}, #34d399)` : '#34d399');
const initials = (title: string) => title.slice(0, 2);
const halo = { paintOrder: 'stroke', stroke: 'var(--color-surface, #0d1117)', strokeWidth: 3, strokeLinejoin: 'round' } as const;

type GraphProps = {
  graph: WebGraph;
  positions: Record<string, Point>;
  focusId: string | null;
  lit: ReadonlySet<string> | null;
  // 0 : dézoomé, 1 : zoom moyen, 2 : zoomé (plus il y a de zoom, plus il y a de noms).
  labels: 0 | 1 | 2;
  onCard: (slug: string, target: Element) => void;
  onHub: (slug: string) => void;
};

// Les nœuds ne se redessinent que si le graphe, le placement, la mise en avant ou le niveau de noms changent : glisser ne les touche pas.
const WebGraphView = memo(function WebGraphView({ graph, positions, focusId, lit, labels, onCard, onHub }: GraphProps) {
  const at = (id: string): Point => positions[id] ?? { x: 0, y: 0 };
  const opacityOf = (id: string) => (lit && !lit.has(id) ? FADED : 1);
  return (
    <>
      <g stroke="rgba(148,163,184,0.45)" strokeWidth={1}>
        {graph.hubs.flatMap((hub) =>
          hub.cards.map((slug) => {
            const a = at(hubId(hub.slug));
            const b = at(cardId(slug));
            const on = focusId === hubId(hub.slug) || focusId === cardId(slug);
            return (
              <line
                key={`${hub.slug}\u0000${slug}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                style={{ vectorEffect: 'non-scaling-stroke', opacity: lit ? (on ? 1 : 0.06) : 1 }}
                stroke={on ? 'var(--color-accent, #34d399)' : undefined}
              />
            );
          }),
        )}
        {graph.cardLinks.map(([first, second]) => {
          const a = at(cardId(first));
          const b = at(cardId(second));
          const on = focusId === cardId(first) || focusId === cardId(second);
          return (
            <line
              key={`${first}\u0000${second}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              strokeDasharray="4 3"
              style={{ vectorEffect: 'non-scaling-stroke', opacity: lit ? (on ? 1 : 0.06) : 1 }}
              stroke={on ? 'var(--color-accent, #34d399)' : undefined}
            />
          );
        })}
      </g>
      {graph.hubs.map((hub, index) => {
        const { x, y } = at(hubId(hub.slug));
        const radius = Math.min(14, 4 + 2 * Math.sqrt(hub.cards.length));
        const named = index < ALWAYS_LABELLED || labels >= 2 || (labels >= 1 && hub.cards.length >= 3) || lit?.has(hubId(hub.slug));
        return (
          <g
            key={hub.slug}
            data-hub={hub.slug}
            transform={`translate(${x} ${y})`}
            style={{ cursor: 'pointer', opacity: opacityOf(hubId(hub.slug)) }}
            onClick={(event) => {
              event.stopPropagation();
              onHub(hub.slug);
            }}
          >
            <title>{`${hub.title} · ${hub.cards.length} cartes`}</title>
            <circle r={radius} fill="var(--color-hub, #8b949e)" stroke="var(--color-surface, #0d1117)" strokeWidth={1.5} />
            {named && (
              <text y={-radius - 4} textAnchor="middle" fontSize={11} fill="currentColor" style={halo}>
                {hub.title}
              </text>
            )}
          </g>
        );
      })}
      {graph.cards.map((card) => {
        const { x, y } = at(cardId(card.slug));
        const named = labels >= 2 || lit?.has(cardId(card.slug));
        return (
          <g
            key={card.slug}
            data-card={card.slug}
            transform={`translate(${x} ${y})`}
            style={{ cursor: 'pointer', opacity: opacityOf(cardId(card.slug)) }}
            onClick={(event) => {
              event.stopPropagation();
              onCard(card.slug, event.currentTarget);
            }}
          >
            <title>{card.title}</title>
            <rect x={-CARD / 2} y={-CARD / 2} width={CARD} height={CARD} fill="rgba(148,163,184,0.25)" />
            {card.imageUrl ? (
              <image href={card.imageUrl} x={-CARD / 2} y={-CARD / 2} width={CARD} height={CARD} preserveAspectRatio="xMidYMid slice" />
            ) : (
              <text textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill="currentColor">
                {initials(card.title)}
              </text>
            )}
            <rect x={-CARD / 2} y={-CARD / 2} width={CARD} height={CARD} fill="none" stroke={rarityColor(card)} strokeWidth={2} />
            {named && (
              <text y={CARD / 2 + 13} textAnchor="middle" fontSize={11} fill="currentColor" style={halo}>
                {card.title}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
});

export function WebPanel({ collection, links, kinds, kindFilterSource, scanner, book, market, filterSource, loadFiltered, onOpen, onOpenCard, onWantCards }: Props) {
  const { cards, visible, filtering, filterError } = useFilteredCards({ collection, scanner, kinds, kindFilterSource, filterSource, loadFiltered });
  const [linksState, setLinksState] = useState<LinksState>(EMPTY_LINKS);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [picked, setPicked] = useState<{ slug: string; anchor: Rect } | null>(null);
  // null : la toile est cadrée toute seule (elle grandit pendant la lecture) ; sinon, le zoom et le glissement de l'utilisateur.
  const [view, setView] = useState<Transform | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () => void links.load().then((state) => alive && setLinksState(state));
    const reload = createThrottledLoader(load, 1000);
    load();
    const off = links.subscribe(reload.call);
    return () => {
      alive = false;
      reload.cancel();
      off();
    };
  }, [links]);

  // Lecture des liens : les cartes affichées d'abord, puis le reste de la Collection ; nouvel essai régulier après un échec.
  const missing = useMemo(() => {
    const now = Date.now();
    const ordered = visible ? [...cards.filter((card) => visible.has(card.slug)), ...cards.filter((card) => !visible.has(card.slug))] : cards;
    return ordered.filter((card) => needsLinksLookup(linksState, card.slug, now)).map((card) => card.slug);
  }, [cards, visible, linksState]);
  useEffect(() => {
    if (missing.length === 0) return;
    void links.resolveMissing(missing);
    const timer = window.setInterval(() => void links.resolveMissing(missing), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [missing, links]);

  const graph = useMemo(() => buildWeb(cards, linksState, visible), [cards, linksState, visible]);

  // Le nouveau placement repart du précédent : la toile se complète sans tout rebattre.
  const previous = useRef<Record<string, Point>>({});
  const positions = useMemo(() => {
    const nodes = [...graph.cards.map((card) => ({ id: cardId(card.slug) })), ...graph.hubs.map((hub) => ({ id: hubId(hub.slug) }))];
    const edges = [
      ...graph.hubs.flatMap((hub) => hub.cards.map((slug) => [hubId(hub.slug), cardId(slug)] as const)),
      ...graph.cardLinks.map(([a, b]) => [cardId(a), cardId(b)] as const),
    ];
    return layoutWeb(nodes, edges, previous.current);
  }, [graph]);
  useEffect(() => {
    previous.current = positions;
  }, [positions]);

  const transform = useMemo(
    () => view ?? fitTransform(boundsOf(Object.values(positions)), size.width, size.height),
    [view, positions, size],
  );
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Taille réelle de la zone (pixels écran) : le dessin et les gestes se calculent dans la même unité.
  useLayoutEffect(() => {
    const measure = () => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Ctrl + molette (ou pincer du pavé tactile) : zoom ; la molette seule fait défiler la page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      setView(zoomAt(transformRef.current, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.clientX - rect.left, event.clientY - rect.top));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // Glisser (un doigt ou la souris) et pincer (deux doigts) ; un geste qui a bougé ne compte pas comme un toucher.
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ start: Transform; from: Point[]; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  const restart = () => {
    gesture.current = pointers.current.size > 0 ? { start: transformRef.current, from: [...pointers.current.values()], moved: false } : null;
  };
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pointers.current.size === 0) dragged.current = false;
    pointers.current.set(event.pointerId, local(event));
    restart();
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!current || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, local(event));
    const now = [...pointers.current.values()];
    if (now.length >= 2 && current.from.length >= 2) {
      dragged.current = true;
      setView(pinch(current.start, [current.from[0] as Point, current.from[1] as Point], [now[0] as Point, now[1] as Point]));
    } else if (now.length === 1 && current.from.length === 1) {
      const dx = (now[0] as Point).x - (current.from[0] as Point).x;
      const dy = (now[0] as Point).y - (current.from[0] as Point).y;
      if (!current.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      current.moved = true;
      dragged.current = true;
      setView({ ...current.start, x: current.start.x + dx, y: current.start.y + dy });
    }
  };
  const onPointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointers.current.delete(event.pointerId)) restart();
  };

  const zoomBy = (factor: number) => setView(zoomAt(transform, factor, size.width / 2, size.height / 2));

  // Identité stable : sinon `WebGraphView` (mémoïsée) se redessinerait à chaque glissement.
  const onCard = useCallback((slug: string, target: Element) => {
    if (dragged.current) return;
    const { left, right, top, bottom } = target.getBoundingClientRect();
    setFocus(null);
    setPicked({ slug, anchor: { left, right, top, bottom } });
  }, []);
  const onHub = useCallback((slug: string) => {
    if (dragged.current) return;
    setPicked(null);
    setFocus((current) => (current?.kind === 'hub' && current.slug === slug ? null : { kind: 'hub', slug }));
  }, []);

  const lighting = useMemo(() => {
    const active: Focus | null = picked ? { kind: 'card', slug: picked.slug } : focus;
    return active ? neighborhood(graph, active) : null;
  }, [graph, focus, picked]);

  const pickedCard = picked ? cards.find((card) => card.slug === picked.slug) : undefined;
  const marketNow = useSyncExternalStore(market.subscribe, market.snapshot);
  const pickedCards = useMemo(() => (pickedCard ? [pickedCard] : []), [pickedCard]);
  const nowPlaying = useNowPlayingSlugs(pickedCards);
  const pickedPreview = useMemo(
    () =>
      pickedCard
        ? toCardPreview(
            pickedCard,
            book?.byTitle(pickedCard.title) ?? null,
            cardMarket(marketNow.history, marketNow.pending, pickedCard.slug, Date.now()),
            nowPlaying.has(pickedCard.slug),
          )
        : null,
    [pickedCard, book, marketNow, nowPlaying],
  );
  // Toutes les cartes affichées (filtre compris) ont leurs prix relevés, sans parcourir les pages à la main.
  const shown = useMemo(() => (visible ? cards.filter((card) => visible.has(card.slug)) : cards), [cards, visible]);
  useWantPrices(shown, onWantCards);

  const focusedHub = focus?.kind === 'hub' ? graph.hubs.find((hub) => hub.slug === focus.slug) : undefined;
  const titleOf = (slug: string) => cards.find((card) => card.slug === slug)?.title ?? slug;
  const read = cards.length - cards.filter((card) => needsLinksLookup(linksState, card.slug, Date.now())).length;
  const labels = transform.k >= 1.6 ? 2 : transform.k >= 0.9 ? 1 : 0;

  return (
    <div data-wmt-web="" style={{ ...box, padding: 12, margin: '12px 0' }}>
      <div style={{ position: 'relative', height: '70vh', minHeight: 420, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border, rgba(148,163,184,0.25))' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size.width} ${size.height}`}
          width="100%"
          height="100%"
          role="group"
          aria-label="Toile des cartes de la Collection"
          style={{ display: 'block', touchAction: 'none', userSelect: 'none', cursor: 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
          onClick={() => {
            if (dragged.current) return;
            setFocus(null);
            setPicked(null);
          }}
        >
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
            <WebGraphView
              graph={graph}
              positions={positions}
              focusId={lighting?.focusId ?? null}
              lit={lighting?.lit ?? null}
              labels={labels}
              onCard={onCard}
              onHub={onHub}
            />
          </g>
        </svg>
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" aria-label="Zoomer" title="Zoomer (Ctrl + molette)" onClick={() => zoomBy(ZOOM_STEP)} style={glyphButton}>
            +
          </button>
          <button type="button" aria-label="Dézoomer" title="Dézoomer (Ctrl + molette)" onClick={() => zoomBy(1 / ZOOM_STEP)} style={glyphButton}>
            −
          </button>
          <button type="button" aria-label="Tout voir" title="Tout voir" onClick={() => setView(null)} style={glyphButton}>
            ⤢
          </button>
        </div>
      </div>
      {focusedHub && (
        <p style={{ margin: '8px 0 0', fontSize: 13 }}>
          <strong>{focusedHub.title}</strong> relie {focusedHub.cards.length} cartes : {focusedHub.cards.map(titleOf).join(', ')}.
        </p>
      )}
      <p style={{ margin: '8px 0 0', opacity: 0.7, fontSize: 12 }}>
        {filtering && 'Filtre en cours de lecture… '}
        {filterError && 'Filtre illisible : toutes les cartes sont affichées. '}
        {visible && `Filtre actif : ${visible.size} cartes. `}
        {cards.length === 0
          ? 'Aucune carte connue : parcourez la Collection pour que l’extension les découvre.'
          : `Liens lus : ${read} / ${cards.length} cartes. ${graph.cards.length} cartes reliées par ${graph.hubs.length} articles partagés${graph.cardLinks.length > 0 ? ` et ${graph.cardLinks.length} liens entre cartes` : ''}.`}
        {graph.hiddenHubs > 0 && ` ${graph.hiddenHubs} articles moins partagés ne sont pas affichés.`}
        {cards.length > 0 && read < cards.length && (links.failed() ? ' Wikipédia est indisponible pour l’instant : nouvel essai automatique.' : ' Lecture en cours…')}
        {cards.length > 0 && read === cards.length && graph.cards.length === 0 && ' Aucun article n’est cité par au moins deux de vos cartes pour l’instant.'}
      </p>
      {picked && pickedCard && pickedPreview && (
        <CardPopup
          preview={pickedPreview}
          anchor={picked.anchor}
          onOpen={() => {
            setPicked(null);
            onOpen(pickedCard.slug);
          }}
          onOpenCard={() => {
            setPicked(null);
            onOpenCard(pickedCard.slug);
          }}
          onClose={() => setPicked(null)}
        />
      )}
    </div>
  );
}
