import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Rect } from './card-popup-position';
import type { KnownCard } from '../core/collection/collection-book';
import { cardMarket, toCardPreview } from '../core/collection/card-preview';
import type { MarketSource } from './market-source';
import { filterLocally } from '../core/collection/local-filter';
import { IDLE_SCAN, type CollectionScanner, type ScanState } from '../core/collection/collection-scan';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { EMPTY_BIRTH, partitionByDates, type BirthState, type TimelineMode } from '../core/birth/birth-book';
import type { BirthRepo } from '../core/birth/birth-repo';
import {
  MAX_PX_PER_YEAR,
  PADDING,
  ZOOM_STEP,
  clampScale,
  fitScale,
  formatYear,
  layoutTimeline,
  tickStep,
} from '../core/birth/timeline-layout';
import type { PriceBook } from '../core/pricing/price-book';
import type { CollectionFilterSource } from './collection-filter';
import { CardPopup } from './CardPopup';
import { createThrottledLoader } from './throttle';

type Props = {
  collection: CollectionRepo;
  birth: BirthRepo;
  scanner: CollectionScanner;
  book: PriceBook | null;
  market: MarketSource;
  filterSource: CollectionFilterSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
  // Fiche de marché de la carte.
  onOpen: (slug: string) => void;
  onShowCard: (card: KnownCard) => void;
};

const LANE_HEIGHT = 30;
const AXIS_HEIGHT = 34;
const MODES: { value: TimelineMode; label: string }[] = [
  { value: 'person', label: 'Personne' },
  { value: 'event', label: 'Évènement' },
];
const MODE_KEY = 'wmt:timelineMode';

// Toute erreur de stockage est absorbée : on reste en mode Personne.
function readMode(): TimelineMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'event' ? 'event' : 'person';
  } catch {
    return 'person';
  }
}

function writeMode(mode: TimelineMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // stockage indisponible
  }
}

const zoomButton = {
  width: 28,
  height: 28,
  cursor: 'pointer',
  font: '600 16px/1 system-ui, sans-serif',
  color: 'inherit',
  background: 'none',
  border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
  borderRadius: 6,
} as const;

const box = {
  border: '1px solid var(--color-border, rgba(148,163,184,0.35))',
  borderRadius: 12,
  background: 'var(--color-surface, #0d1117)',
  color: 'var(--color-foreground, #e6edf3)',
  font: '14px/20px system-ui, sans-serif',
} as const;

export function TimelinePanel({ collection, birth, scanner, book, market, filterSource, loadFiltered, onOpen, onShowCard }: Props) {
  const [cards, setCards] = useState<KnownCard[]>([]);
  const [scan, setScan] = useState<ScanState>(IDLE_SCAN);
  const [birthState, setBirthState] = useState<BirthState>(EMPTY_BIRTH);
  const [filter, setFilter] = useState(() => filterSource.current());
  const [allowed, setAllowed] = useState<{ filter: string; slugs: Set<string> } | null>(null);
  const [filterError, setFilterError] = useState(false);
  const [tip, setTip] = useState<{ slug: string; chip: Rect } | null>(null);
  // Zoom en pixels par année ; null = toute la frise visible.
  const [mode, setModeState] = useState<TimelineMode>(readMode);
  const setMode = (next: TimelineMode) => {
    setModeState(next);
    writeMode(next);
  };
  const [zoom, setZoom] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ year: number; anchorX: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const loadCards = () => void collection.list().then((list) => alive && setCards(list));
    const loadBirth = () => void birth.load().then((state) => alive && setBirthState(state));
    const loadScan = () => void scanner.state().then((state) => alive && setScan(state));
    const cardsReload = createThrottledLoader(loadCards, 1000);
    const birthReload = createThrottledLoader(loadBirth, 1000);
    loadCards();
    loadBirth();
    loadScan();
    const offCollection = collection.subscribe(cardsReload.call);
    const offBirth = birth.subscribe(birthReload.call);
    const offScan = scanner.subscribe(loadScan);
    return () => {
      alive = false;
      cardsReload.cancel();
      birthReload.cancel();
      offCollection();
      offBirth();
      offScan();
    };
  }, [collection, birth, scanner]);

  useEffect(() => filterSource.subscribe(() => setFilter(filterSource.current())), [filterSource]);

  const localSlugs = useMemo(
    () => (filter && scan.status === 'done' ? filterLocally(cards, filter) : null),
    [filter, scan.status, cards],
  );
  const filterCache = useRef(new Map<string, Set<string>>());

  useEffect(() => {
    setFilterError(false);
    if (!filter || localSlugs) return;
    const cached = filterCache.current.get(filter);
    if (cached) {
      setAllowed({ filter, slugs: cached });
      return;
    }
    let cancelled = false;
    loadFiltered(filter, () => cancelled)
      .then((slugs) => {
        if (cancelled) return;
        filterCache.current.set(filter, slugs);
        setAllowed({ filter, slugs });
      })
      .catch(() => !cancelled && setFilterError(true));
    return () => {
      cancelled = true;
    };
  }, [filter, loadFiltered, localSlugs]);

  const visible = localSlugs ?? (filter && allowed?.filter === filter ? allowed.slugs : null);
  const filtering = Boolean(filter) && visible === null && !filterError;

  useEffect(() => {
    if (cards.length > 0) void birth.resolveMissing(cards.map((card) => card.slug));
  }, [cards, birth]);

  const { dated, undated } = useMemo(() => {
    const all = partitionByDates(cards, birthState, mode);
    return visible
      ? {
          dated: all.dated.filter(({ card }) => visible.has(card.slug)),
          undated: all.undated.filter((card) => visible.has(card.slug)),
        }
      : all;
  }, [cards, birthState, mode, visible]);
  const fit = fitScale(dated, viewportWidth);
  const scale = clampScale(zoom ?? fit, dated, viewportWidth);
  const timeline = useMemo(() => layoutTimeline(dated, scale), [dated, scale]);
  // Zoom, changement de frise ou de filtre : la case visée a bougé, l'aperçu se ferme.
  useEffect(() => setTip(null), [scale, mode, visible]);
  const tipCard = tip ? cards.find((card) => card.slug === tip.slug) : undefined;
  const marketNow = useSyncExternalStore(market.subscribe, market.snapshot);
  const tipPreview = useMemo(
    () =>
      tipCard
        ? toCardPreview(
            tipCard,
            book?.byTitle(tipCard.title) ?? null,
            cardMarket(marketNow.history, marketNow.pending, tipCard.slug, Date.now()),
          )
        : null,
    [tipCard, book, marketNow],
  );
  // L'aperçu s'ouvre : les prix de cette carte sont relevés (une fois par 30 min), comme sur la liste.
  useEffect(() => {
    if (tipCard) onShowCard(tipCard);
  }, [tipCard?.slug]);

  // Largeur visible de la frise : elle borne le dézoom (toute la frise tient à l'écran).
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const measure = () => setViewportWidth(scroller.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // Le zoom garde sous le curseur (ou au centre) l'année qui s'y trouvait.
  const zoomBy = (factor: number, clientX?: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const anchorX = clientX === undefined ? scroller.clientWidth / 2 : clientX - scroller.getBoundingClientRect().left;
    const year = timeline.first + (scroller.scrollLeft + anchorX - PADDING) / scale;
    const next = clampScale(scale * factor, dated, viewportWidth);
    if (next === scale) return;
    anchor.current = { year, anchorX };
    setZoom(next);
  };
  const latestZoom = useRef(zoomBy);
  latestZoom.current = zoomBy;

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const pending = anchor.current;
    anchor.current = null;
    if (scroller && pending) scroller.scrollLeft = PADDING + (pending.year - timeline.first) * timeline.scale - pending.anchorX;
  }, [timeline.first, timeline.scale]);

  // Ctrl + molette : zoom (la molette seule fait défiler la page). Écouteur natif : il doit pouvoir annuler le défilement.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      latestZoom.current(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.clientX);
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, []);

  const showTip = (slug: string, target: HTMLElement) => {
    const { left, right, top, bottom } = target.getBoundingClientRect();
    setTip({ slug, chip: { left, right, top, bottom } });
  };

  return (
    <div style={{ ...box, padding: 12, margin: '12px 0' }}>
      <div role="group" aria-label="Type de frise" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {MODES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            style={{
              ...zoomButton,
              width: 'auto',
              padding: '0 12px',
              font: '13px/1 system-ui, sans-serif',
              borderColor: mode === value ? 'var(--color-accent, #34d399)' : undefined,
              color: mode === value ? 'var(--color-accent, #34d399)' : 'inherit',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button type="button" aria-label="Dézoomer" title="Dézoomer (Ctrl + molette)" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={scale <= fit} style={{ ...zoomButton, opacity: scale <= fit ? 0.4 : 1 }}>
          −
        </button>
        <button type="button" aria-label="Zoomer" title="Zoomer (Ctrl + molette)" onClick={() => zoomBy(ZOOM_STEP)} disabled={scale >= MAX_PX_PER_YEAR} style={{ ...zoomButton, opacity: scale >= MAX_PX_PER_YEAR ? 0.4 : 1 }}>
          +
        </button>
        <button type="button" onClick={() => setZoom(null)} style={{ ...zoomButton, width: 'auto', padding: '0 10px', font: '12px/1 system-ui, sans-serif' }}>
          Tout voir
        </button>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Repères tous les {tickStep(scale)} an{tickStep(scale) > 1 ? 's' : ''}</span>
      </div>
      <div ref={scrollRef} style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div
          style={{
            position: 'relative',
            width: timeline.width,
            height: AXIS_HEIGHT + timeline.lanes * LANE_HEIGHT + 8,
            minHeight: 120,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: AXIS_HEIGHT - 6,
              height: 2,
              background: 'var(--color-border, rgba(148,163,184,0.5))',
            }}
          />
          {timeline.ticks.map((tick) => (
            <div
              key={tick.year}
              style={{
                position: 'absolute',
                left: tick.x,
                top: 0,
                fontSize: 11,
                opacity: 0.7,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              {formatYear(tick.year)}
              <div style={{ width: 1, height: 8, margin: '2px auto 0', background: 'currentColor', opacity: 0.6 }} />
            </div>
          ))}
          {timeline.items.map(({ card, year, end, x, lane, width, span }) => (
            <button
              key={card.slug}
              type="button"
              onClick={(event) => showTip(card.slug, event.currentTarget)}
              aria-haspopup="dialog"
              title={`${card.title} · ${formatYear(year)}${end === undefined ? '' : ` – ${formatYear(end)}`}`}
              style={{
                position: 'absolute',
                left: x,
                top: AXIS_HEIGHT + lane * LANE_HEIGHT,
                width,
                height: LANE_HEIGHT - 4,
                padding: '0 8px 0 10px',
                textAlign: 'left',
                cursor: 'pointer',
                font: '12px/1 system-ui, sans-serif',
                color: 'inherit',
                background: span ? 'rgba(52,211,153,0.28)' : 'rgba(52,211,153,0.12)',
                border: 0,
                borderLeft: `3px solid ${card.rarity ? `var(--color-rarity-${card.rarity.toLowerCase()}, #34d399)` : '#34d399'}`,
                borderRadius: 4,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {card.title}
            </button>
          ))}
        </div>
      </div>
      <p style={{ margin: '8px 0 0', opacity: 0.7, fontSize: 12 }}>
        {filtering && 'Filtre en cours de lecture… '}
        {filterError && 'Filtre illisible : toutes les cartes sont affichées. '}
        {visible && `Filtre actif : ${visible.size} cartes. `}
        {cards.length === 0
          ? 'Aucune carte connue : parcourez la Collection pour que l’extension les découvre.'
          : `${cards.length} cartes connues · ${dated.length} datées (${mode === 'person' ? 'de la naissance à la mort, ou jusqu’à aujourd’hui' : 'début, fin ou construction quand elles sont connues'}, d’après Wikidata).`}
      </p>
      {undated.length > 0 && (
        <details style={{ marginTop: 8, fontSize: 12 }}>
          <summary style={{ cursor: 'pointer' }}>{mode === 'person' ? 'Sans date de naissance' : 'Sans date d’évènement'} ({undated.length})</summary>
          <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', columns: 3 }}>
            {undated.map((card) => (
              <li key={card.slug}>{card.title}</li>
            ))}
          </ul>
        </details>
      )}
      {tip && tipCard && tipPreview && (
        <CardPopup
          preview={tipPreview}
          anchor={tip.chip}
          onOpen={() => {
            setTip(null);
            onOpen(tipCard.slug);
          }}
          onClose={() => setTip(null)}
        />
      )}
    </div>
  );
}
