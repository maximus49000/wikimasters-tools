import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { toCardPreview } from '../core/collection/card-preview';
import { filterLocally } from '../core/collection/local-filter';
import { IDLE_SCAN, type CollectionScanner, type ScanState } from '../core/collection/collection-scan';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { EMPTY_BIRTH, partitionByBirth, type BirthState } from '../core/birth/birth-book';
import type { BirthRepo } from '../core/birth/birth-repo';
import { CHIP_WIDTH, formatYear, layoutTimeline } from '../core/birth/timeline-layout';
import type { PriceBook } from '../core/pricing/price-book';
import type { CollectionFilterSource } from './collection-filter';
import { buildCardPreview } from './card-preview-dom';
import { createThrottledLoader } from './throttle';

type Props = {
  collection: CollectionRepo;
  birth: BirthRepo;
  scanner: CollectionScanner;
  book: PriceBook | null;
  filterSource: CollectionFilterSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
  onOpen: (slug: string) => void;
};

const LANE_HEIGHT = 30;
const AXIS_HEIGHT = 34;
const TIP_WIDTH = 288;
const TIP_HEIGHT = 420;

const box = {
  border: '1px solid var(--color-border, rgba(148,163,184,0.35))',
  borderRadius: 12,
  background: 'var(--color-surface, #0d1117)',
  color: 'var(--color-foreground, #e6edf3)',
  font: '14px/20px system-ui, sans-serif',
} as const;

export function TimelinePanel({ collection, birth, scanner, book, filterSource, loadFiltered, onOpen }: Props) {
  const [cards, setCards] = useState<KnownCard[]>([]);
  const [scan, setScan] = useState<ScanState>(IDLE_SCAN);
  const [birthState, setBirthState] = useState<BirthState>(EMPTY_BIRTH);
  const [filter, setFilter] = useState(() => filterSource.current());
  const [allowed, setAllowed] = useState<{ filter: string; slugs: Set<string> } | null>(null);
  const [filterError, setFilterError] = useState(false);
  const [tip, setTip] = useState<{ slug: string; x: number; y: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

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
    const all = partitionByBirth(cards, birthState);
    return visible
      ? {
          dated: all.dated.filter(({ card }) => visible.has(card.slug)),
          undated: all.undated.filter((card) => visible.has(card.slug)),
        }
      : all;
  }, [cards, birthState, visible]);
  const timeline = useMemo(() => layoutTimeline(dated), [dated]);
  const tipCard = tip ? cards.find((card) => card.slug === tip.slug) : undefined;

  // La carte du survol est construite comme sur la vue Monde, puis gardée entière dans l'écran.
  useEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    el.replaceChildren();
    if (tipCard) el.append(buildCardPreview(toCardPreview(tipCard, book?.byTitle(tipCard.title) ?? null)));
  }, [tipCard, book]);

  const showTip = (slug: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const left = rect.right + TIP_WIDTH + 12 > window.innerWidth ? rect.left - TIP_WIDTH - 12 : rect.right + 12;
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - TIP_HEIGHT - 8));
    setTip({ slug, x: Math.max(8, left), y: top });
  };

  return (
    <div style={{ ...box, padding: 12, margin: '12px 0' }}>
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
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
          {timeline.items.map(({ card, year, x, lane }) => (
            <button
              key={card.slug}
              type="button"
              onClick={() => onOpen(card.slug)}
              onMouseEnter={(event) => showTip(card.slug, event.currentTarget)}
              onMouseLeave={() => setTip(null)}
              title={`${card.title} · ${formatYear(year)}`}
              style={{
                position: 'absolute',
                left: x,
                top: AXIS_HEIGHT + lane * LANE_HEIGHT,
                width: CHIP_WIDTH,
                height: LANE_HEIGHT - 4,
                padding: '0 8px 0 10px',
                textAlign: 'left',
                cursor: 'pointer',
                font: '12px/1 system-ui, sans-serif',
                color: 'inherit',
                background: 'rgba(52,211,153,0.12)',
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
          : `${cards.length} cartes connues · ${dated.length} datées (date de naissance d’après Wikidata).`}
      </p>
      {undated.length > 0 && (
        <details style={{ marginTop: 8, fontSize: 12 }}>
          <summary style={{ cursor: 'pointer' }}>Sans date de naissance ({undated.length})</summary>
          <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', columns: 3 }}>
            {undated.map((card) => (
              <li key={card.slug}>{card.title}</li>
            ))}
          </ul>
        </details>
      )}
      <div
        ref={tipRef}
        style={{
          position: 'fixed',
          left: tip?.x ?? 0,
          top: tip?.y ?? 0,
          zIndex: 2147483647,
          pointerEvents: 'none',
          display: tip ? 'block' : 'none',
        }}
      />
    </div>
  );
}
