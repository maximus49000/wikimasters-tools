import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { CollectionScanner } from '../core/collection/collection-scan';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { EMPTY_LINKS, needsLinksLookup, type LinksState } from '../core/links/links-book';
import type { LinksRepo } from '../core/links/links-repo';
import { CARD_SIZE, buildWeb, cardId, hubId, hubRadius, neighborhood, webEdges, webNodes, type Focus, type WebGraph } from '../core/links/web-graph';
import { chooseLabels, shortTitle } from '../core/links/web-labels';
import { withPath } from '../core/links/web-path-graph';
import { createLayout, samePositions, type Point } from '../core/links/web-layout';
import { ZOOM_STEP, boundsOf, fitTransform, pinch, placeActions, zoomAt, type Transform } from '../core/links/web-view';
import type { CollectionFilterSource } from './collection-filter';
import { getImageService } from './image-registry';
import type { KindFilterSource } from './kind-filter';
import { createThrottledLoader } from './throttle';
import { useFilteredCards } from './useFilteredCards';
import { WebPathBar } from './WebPathBar';

type Props = {
  collection: CollectionRepo;
  links: LinksRepo;
  kinds: KindsRepo;
  kindFilterSource: KindFilterSource;
  scanner: CollectionScanner;
  filterSource: CollectionFilterSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
  // Fiche de marché de la carte.
  onOpen: (slug: string) => void;
  // La carte elle-même, dans la Collection du jeu.
  onOpenCard: (slug: string) => void;
};

const RETRY_MS = 30_000;
// Le placement avance par tranches de cette durée (ms), entre deux rendus de la page : elle ne se fige jamais.
const SLICE_MS = 12;
// Pendant le calcul, la toile est redessinée au plus toutes les 300 ms.
const PUBLISH_MS = 300;
// Les articles que la recherche d'une liaison a ajoutés à la toile.
const ADDED_COLOR = '#f59e0b';
// Au-delà de cette distance (px), un doigt ou une souris qui bouge déplace la toile au lieu de toucher un nœud.
const DRAG_SLOP = 5;
const FADED = 0.2;
// Les images des cartes n'apparaissent qu'à partir de ce zoom : plus petites, une pastille de la couleur de leur rareté suffit.
const IMAGE_ZOOM = 0.45;
// Les noms se choisissent par paliers de zoom (6 par octave) : zoomer en continu ne les recalcule pas à chaque pas.
const LABEL_STEPS_PER_OCTAVE = 6;

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
// Boutons de la barre posée au-dessus d'une carte : glyphes seuls, zone tactile de 44 px (la barre mesure ACTIONS_BAR).
const actionButton = { ...glyphButton, width: 44, height: 44, fontSize: 20 } as const;

// Zoomer écarte les nœuds sans les grossir : une carte ne dépasse jamais sa taille de départ à l'écran (comme un repère de la vue Monde).
// Dézoomé, les nœuds rétrécissent avec les distances pour ne pas se chevaucher. `--k` est le zoom, posé sur le groupe qui porte le dessin.
const nodeScale = { transform: 'scale(min(1, calc(1 / var(--k, 1))))' } as const;
// Un nom garde la même taille à l'écran quel que soit le zoom ; `half` est la demi-hauteur du nœud en unités du dessin
// (négative : le nom passe au-dessus). Le groupe est ramené à l'échelle de l'écran, puis décalé d'autant que le nœud mesure à l'écran.
const labelAt = (half: number) =>
  ({ transform: `scale(calc(1 / var(--k, 1))) translateY(calc(${half}px * min(var(--k, 1), 1) ${half < 0 ? '-' : '+'} 3px))` }) as const;
const labelStyle = {
  paintOrder: 'stroke',
  stroke: 'var(--color-surface, #0d1117)',
  strokeWidth: 3,
  strokeLinejoin: 'round',
  fontSize: 11,
} as const;
// Les traits gardent aussi la même épaisseur à l'écran.
const hairline = { vectorEffect: 'non-scaling-stroke' } as const;
// Zone tactile d'une carte : un peu plus large que la carte (sans toucher les voisines, espacées d'au moins 52).
const CARD_HIT = CARD_SIZE + 10;

const rarityColor = (card: KnownCard) => (card.rarity ? `var(--color-rarity-${card.rarity.toLowerCase()}, #34d399)` : '#34d399');
const initials = (title: string) => title.slice(0, 2);

type GraphProps = {
  graph: WebGraph;
  positions: Record<string, Point>;
  focusId: string | null;
  lit: ReadonlySet<string> | null;
  // Zoom assez fort pour montrer l'image des cartes (sinon, une pastille de la couleur de leur rareté).
  images: boolean;
  // Les nœuds (cartes et points) dont le nom s'affiche à ce zoom.
  labelled: ReadonlySet<string>;
  // L'image d'une carte : celle du jeu, sinon l'image de remplacement déjà trouvée (jamais de nouvelle recherche ici).
  imageOf: (card: KnownCard) => string | undefined;
  onCard: (slug: string) => void;
  onHub: (slug: string) => void;
};

// Les nœuds ne se redessinent que si le graphe, le placement, la mise en avant ou le niveau de détail changent : glisser ne les touche pas.
const WebGraphView = memo(function WebGraphView({ graph, positions, focusId, lit, images, labelled, imageOf, onCard, onHub }: GraphProps) {
  const opacityOf = (id: string) => (lit && !lit.has(id) ? FADED : 1);
  const edge = (key: string, a: string, b: string, dashed: boolean) => {
    const route = graph.path?.edges.has(`${a}\u0000${b}`) ?? false;
    const from = positions[a];
    const to = positions[b];
    if (!from || !to) return null;
    const on = route || focusId === a || focusId === b;
    return (
      <line
        key={key}
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        strokeDasharray={dashed ? '4 3' : undefined}
        stroke={on ? 'var(--color-accent, #34d399)' : 'rgba(148,163,184,0.45)'}
        strokeWidth={route ? 3 : 1}
        style={{ ...hairline, opacity: lit ? (on ? 1 : 0.06) : 1 }}
      />
    );
  };
  return (
    <>
      {graph.hubs.flatMap((hub) => hub.cards.map((slug) => edge(`${hub.slug}\u0000${slug}`, hubId(hub.slug), cardId(slug), false)))}
      {graph.cardLinks.map(([first, second]) => edge(`${first}\u0000${second}`, cardId(first), cardId(second), true))}
      {(graph.hubLinks ?? []).map(([first, second]) => edge(`h${first}\u0000${second}`, hubId(first), hubId(second), true))}
      {graph.hubs.map((hub) => {
        const point = positions[hubId(hub.slug)];
        if (!point) return null;
        const radius = hubRadius(hub.cards.length);
        const named = labelled.has(hubId(hub.slug));
        return (
          <g
            key={hub.slug}
            data-hub={hub.slug}
            transform={`translate(${point.x} ${point.y})`}
            style={{ cursor: 'pointer', opacity: opacityOf(hubId(hub.slug)) }}
            onClick={(event) => {
              event.stopPropagation();
              onHub(hub.slug);
            }}
          >
            <title>{`${hub.title} · ${hub.cards.length} cartes`}</title>
            <g style={nodeScale}>
              <circle r={Math.max(radius + 6, 12)} fill="transparent" />
              <circle r={radius} fill={graph.path?.added.has(hubId(hub.slug)) ? ADDED_COLOR : 'var(--color-hub, #8b949e)'} stroke="var(--color-surface, #0d1117)" strokeWidth={1.5} style={hairline} />
            </g>
            {named && (
              <g style={labelAt(-radius)}>
                <text textAnchor="middle" fill="currentColor" style={labelStyle}>
                  {shortTitle(hub.title)}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {graph.cards.map((card) => {
        const point = positions[cardId(card.slug)];
        if (!point) return null;
        const half = CARD_SIZE / 2;
        const art = images ? imageOf(card) : undefined;
        const named = labelled.has(cardId(card.slug));
        return (
          <g
            key={card.slug}
            data-card={card.slug}
            transform={`translate(${point.x} ${point.y})`}
            style={{ cursor: 'pointer', opacity: opacityOf(cardId(card.slug)) }}
            onClick={(event) => {
              event.stopPropagation();
              onCard(card.slug);
            }}
          >
            <title>{card.title}</title>
            <g style={nodeScale}>
              <rect x={-CARD_HIT / 2} y={-CARD_HIT / 2} width={CARD_HIT} height={CARD_HIT} fill="transparent" />
              <rect x={-half} y={-half} width={CARD_SIZE} height={CARD_SIZE} fill={images ? 'rgba(148,163,184,0.25)' : rarityColor(card)} />
              {images &&
                (art ? (
                  <image href={art} x={-half} y={-half} width={CARD_SIZE} height={CARD_SIZE} preserveAspectRatio="xMidYMid slice" />
                ) : (
                  <text textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill="currentColor">
                    {initials(card.title)}
                  </text>
                ))}
              <rect x={-half} y={-half} width={CARD_SIZE} height={CARD_SIZE} fill="none" stroke={rarityColor(card)} strokeWidth={2} style={hairline} />
            </g>
            {named && (
              <g style={labelAt(half)}>
                <text dy="1em" textAnchor="middle" fill="currentColor" style={labelStyle}>
                  {shortTitle(card.title)}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
});

export function WebPanel({ collection, links, kinds, kindFilterSource, scanner, filterSource, loadFiltered, onOpen, onOpenCard }: Props) {
  const { cards, visible, filtering, filterError } = useFilteredCards({ collection, scanner, kinds, kindFilterSource, filterSource, loadFiltered });
  const [linksState, setLinksState] = useState<LinksState>(EMPTY_LINKS);
  const [focus, setFocus] = useState<Focus | null>(null);
  // La carte touchée : ses boutons d'ouverture sont posés au-dessus d'elle, la toile reste entièrement visible.
  const [picked, setPicked] = useState<string | null>(null);
  // La liaison cherchée entre deux cartes (slugs, de A à B) : ses articles s'ajoutent à la toile.
  const [path, setPath] = useState<string[] | null>(null);
  // null : la toile est cadrée toute seule (elle grandit pendant la lecture) ; sinon, le zoom et le glissement de l'utilisateur.
  const [view, setView] = useState<Transform | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const svgRef = useRef<SVGSVGElement>(null);

  // Les images de remplacement (option « Images de remplacement ») qui arrivent pendant qu'on regarde la toile.
  const imageService = getImageService();
  const [imagesVersion, setImagesVersion] = useState(0);
  useEffect(() => imageService?.subscribe(() => setImagesVersion((version) => version + 1)), [imageService]);
  const imageOf = useCallback(
    (card: KnownCard): string | undefined => card.imageUrl ?? (imageService?.enabled() ? (imageService.peek(card.slug) ?? undefined) : undefined),
    // `imagesVersion` change quand une image est trouvée : la fonction change, les cartes se redessinent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imageService, imagesVersion],
  );

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

  const graph = useMemo(() => {
    const web = buildWeb(cards, linksState, visible);
    return path ? withPath(web, cards, linksState, path) : web;
  }, [cards, linksState, visible, path]);
  // Une liaison trouvée : la toile est recadrée pour la montrer en entier.
  useEffect(() => {
    if (path) setView(null);
  }, [path]);

  // Le placement se calcule par petites tranches (la page reste fluide) et repart du précédent : la toile se complète sans tout rebattre.
  const previous = useRef<Record<string, Point>>({});
  useEffect(() => {
    const layout = createLayout(webNodes(graph), webEdges(graph), previous.current);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let published = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const done = layout.run(SLICE_MS);
      const now = Date.now();
      if (done || now - published >= PUBLISH_MS) {
        published = now;
        const next = layout.positions();
        previous.current = next;
        // Rien n'a bougé (la toile n'a pas changé, ou ne fait que grandir ailleurs) : pas de nouveau dessin.
        setPositions((current) => (samePositions(current, next) ? current : next));
      }
      if (!done) timer = setTimeout(tick, 0);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [graph]);

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
  // Toucher un nœud fige le cadrage : la lecture des liens continue, la toile ne doit pas glisser sous le doigt.
  const onCard = useCallback((slug: string) => {
    if (dragged.current) return;
    setView((current) => current ?? transformRef.current);
    setFocus(null);
    setPicked((current) => (current === slug ? null : slug));
  }, []);
  const onHub = useCallback((slug: string) => {
    if (dragged.current) return;
    setView((current) => current ?? transformRef.current);
    setPicked(null);
    setFocus((current) => (current?.kind === 'hub' && current.slug === slug ? null : { kind: 'hub', slug }));
  }, []);

  const lighting = useMemo(() => {
    const active: Focus | null = picked ? { kind: 'card', slug: picked } : focus;
    if (active) return neighborhood(graph, active);
    return graph.path ? { focusId: null, lit: graph.path.ids } : null;
  }, [graph, focus, picked]);

  // Échap referme la barre d'actions.
  useEffect(() => {
    if (picked === null) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setPicked(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [picked]);

  // La barre suit la carte au zoom et au glissement : sa place se déduit de celle de la carte à l'écran.
  const pickedCard = picked ? cards.find((card) => card.slug === picked) : undefined;
  const pickedPoint = picked ? positions[cardId(picked)] : undefined;
  const actionsAt =
    pickedCard && pickedPoint
      ? placeActions(
          { x: transform.x + pickedPoint.x * transform.k, y: transform.y + pickedPoint.y * transform.k },
          (CARD_SIZE / 2) * Math.min(transform.k, 1),
          size,
        )
      : null;

  const focusedHub = focus?.kind === 'hub' ? graph.hubs.find((hub) => hub.slug === focus.slug) : undefined;
  const titleOf = (slug: string) => cards.find((card) => card.slug === slug)?.title ?? slug;
  const read = cards.length - cards.filter((card) => needsLinksLookup(linksState, card.slug, Date.now())).length;
  const zoomStep = Math.round(Math.log2(transform.k) * LABEL_STEPS_PER_OCTAVE);
  const labelled = useMemo(
    () => chooseLabels(graph, positions, lighting?.lit ?? null, 2 ** (zoomStep / LABEL_STEPS_PER_OCTAVE)),
    [graph, positions, lighting, zoomStep],
  );

  return (
    <div data-wmt-web="" style={{ ...box, padding: 12, margin: '12px 0' }}>
      <WebPathBar cards={cards} links={links} onPath={setPath} />
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
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`} style={{ '--k': transform.k } as CSSProperties}>
            <WebGraphView
              graph={graph}
              positions={positions}
              focusId={lighting?.focusId ?? null}
              lit={lighting?.lit ?? null}
              images={transform.k >= IMAGE_ZOOM}
              labelled={labelled}
              imageOf={imageOf}
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
        {pickedCard && actionsAt && (
          <div
            role="toolbar"
            aria-label={`Ouvrir ${pickedCard.title}`}
            data-wmt-web-actions=""
            style={{
              position: 'absolute',
              left: actionsAt.x,
              top: actionsAt.y,
              display: 'flex',
              gap: 6,
              padding: 6,
              borderRadius: 12,
              border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
              background: 'var(--color-surface, #0d1117)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
            }}
          >
            <button
              type="button"
              aria-label="Voir le marché"
              title="Voir le marché"
              onClick={() => {
                setPicked(null);
                onOpen(pickedCard.slug);
              }}
              style={{ ...actionButton, background: 'var(--color-accent, #34d399)', color: '#0d1117', borderColor: 'transparent' }}
            >
              📈
            </button>
            <button
              type="button"
              aria-label="Ouvrir la carte"
              title="Ouvrir la carte"
              onClick={() => {
                setPicked(null);
                onOpenCard(pickedCard.slug);
              }}
              style={actionButton}
            >
              🃏
            </button>
          </div>
        )}
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
    </div>
  );
}
