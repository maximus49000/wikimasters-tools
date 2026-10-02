import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { cardMarket, toCardPreview, type CardPreview } from '../core/collection/card-preview';
import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { IDLE_SCAN, type CollectionScanner, type ScanState } from '../core/collection/collection-scan';
import { pageSizeOf, pageSlice, sortCards } from '../core/collection/homemade-page';
import { applyKindFilter } from '../core/kinds/kinds-filter';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { lastPriceOf } from '../core/market/price-history';
import type { PriceBook } from '../core/pricing/price-book';
import { buildCardPreview } from './card-preview-dom';
import type { CollectionFilterSource } from './collection-filter';
import type { KindFilterSource } from './kind-filter';
import type { MarketSource } from './market-source';
import type { PageMemory } from './page-memory';
import type { SortSource } from './sort-source';
import { createThrottledLoader } from './throttle';
import { useKindState } from './useKindState';
import { useMusicSlugs } from './useMusicSlugs';
import { useScreenSlugs } from './useScreenSlugs';
import { useNowPlayingSlugs } from './useNowPlayingSlugs';
import { useNativeFilter } from './useNativeFilter';
import { useWantPrices } from './useWantPrices';

type Props = {
  collection: CollectionRepo;
  scanner: CollectionScanner;
  kinds: KindsRepo;
  kindFilterSource: KindFilterSource;
  book: PriceBook | null;
  market: MarketSource;
  filterSource: CollectionFilterSource;
  // Tri choisi dans la liste « Trier la collection » du site.
  sortSource: SortSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
  // Nombre de cartes comptées dans la grille native de la page (0 si aucune).
  nativePageSize: () => number;
  // Fiche native de la carte (celle du jeu : musique, film, etc.).
  onOpenCard: (slug: string) => void;
  // Cartes affichées dont les prix du marché sont à relever.
  onWantCards: (cards: KnownCard[]) => void;
  // Page affichée pour chaque sélection de filtres, gardée d'une montée de la vue à la suivante.
  pages: PageMemory;
};

// Taille de la carte construite par `buildCardPreview` (voir `.wmt-card` dans PANEL_CSS).
const CARD_WIDTH = 288;
const CARD_HEIGHT = 420;

const pagerButton = (disabled: boolean) =>
  ({
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    font: '500 14px/1 system-ui, sans-serif',
    color: 'inherit',
    background: 'var(--color-surface, #0d1117)',
    border: '1px solid var(--color-border, rgba(148,163,184,0.35))',
    borderRadius: 12,
    padding: '12px 16px',
  }) as const;

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, margin: '12px 0' }}>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} style={pagerButton(page <= 1)}>
        ← Précédent
      </button>
      <span style={{ opacity: 0.7, fontSize: 14 }}>
        Page {page} / {pages}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} style={pagerButton(page >= pages)}>
        Suivant →
      </button>
    </div>
  );
}

// La carte du jeu, réduite pour remplir sa colonne (la largeur est mesurée : 2 colonnes sur écran étroit).
function CardTile({ preview, onPick }: { preview: CardPreview; onPick: () => void }) {
  const wrapRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    cardRef.current?.replaceChildren(buildCardPreview(preview));
  }, [preview]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => setScale(wrap.clientWidth / CARD_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={wrapRef}
      type="button"
      aria-label={preview.title}
      onClick={onPick}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}`,
        padding: 0,
        border: 0,
        background: 'none',
        cursor: 'pointer',
        overflow: 'hidden',
        borderRadius: 16,
      }}
    >
      <div
        ref={cardRef}
        style={{ position: 'absolute', left: 0, top: 0, width: CARD_WIDTH, height: CARD_HEIGHT, transformOrigin: '0 0', transform: `scale(${scale})`, pointerEvents: 'none' }}
      />
    </button>
  );
}

export function HomemadePanel({
  collection,
  scanner,
  kinds,
  kindFilterSource,
  book,
  market,
  filterSource,
  sortSource,
  loadFiltered,
  nativePageSize,
  onOpenCard,
  onWantCards,
  pages,
}: Props) {
  // Remontée de la vue (le jeu remplace sa grille à la fermeture d'une fiche) : cartes et scan sont repris tels quels.
  const [cards, setCards] = useState<KnownCard[]>(() => collection.snapshot() ?? []);
  const [scan, setScan] = useState<ScanState>(() => scanner.snapshot() ?? IDLE_SCAN);
  const [, repaint] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    let alive = true;
    const loadCards = () => void collection.list().then((list) => alive && setCards(list));
    const loadScan = () => void scanner.state().then((state) => alive && setScan(state));
    const cardsReload = createThrottledLoader(loadCards, 1000);
    loadCards();
    loadScan();
    const offCollection = collection.subscribe(cardsReload.call);
    const offScan = scanner.subscribe(loadScan);
    return () => {
      alive = false;
      cardsReload.cancel();
      offCollection();
      offScan();
    };
  }, [collection, scanner]);

  const { filter, visible, filtering, error } = useNativeFilter({ filterSource, loadFiltered, cards, scan });
  const { kindsState, kindFilter } = useKindState(kinds, kindFilterSource);

  const sort = useSyncExternalStore(sortSource.subscribe, sortSource.current);
  // Tri choisi dans la liste du site, hors rareté (Nom, Favoris, Date d'ajout).
  const siteSort = useSyncExternalStore(filterSource.subscribe, filterSource.sort);
  const marketNow = useSyncExternalStore(market.subscribe, market.snapshot);
  const list = useMemo(
    () =>
      sortCards(
        applyKindFilter(visible ? cards.filter((card) => visible.has(card.slug)) : cards, kindsState, kindFilter),
        sort === 'price' ? (slug) => lastPriceOf(marketNow.history, slug, Date.now()) : undefined,
        sort === 'price' ? '' : siteSort,
      ),
    [cards, visible, kindsState, kindFilter, sort, marketNow.history, siteSort],
  );
  const size = pageSizeOf(scan.pageSize, nativePageSize());
  // Un autre filtre : première page. Ouvrir une carte pose une recherche sur le site, retirée à la fermeture de la
  // fiche : la sélection d'avant retrouve alors sa page.
  const filterKey = `${filter}|${kindFilter.category ?? ''}|${kindFilter.nature}|${kindFilter.facet}|${kindFilter.duplicates ?? false}|${sort}|${siteSort}`;
  const page = pages.get(filterKey);
  const current = useMemo(() => pageSlice(list, page, size), [list, page, size]);

  const nowPlaying = useNowPlayingSlugs(current.items);
  const musicSlugs = useMusicSlugs(current.items);
  const screenSlugs = useScreenSlugs(current.items);
  const previews = useMemo(
    () =>
      current.items.map((card) =>
        toCardPreview(card, book?.byTitle(card.title) ?? null, cardMarket(marketNow.history, marketNow.pending, card.slug, Date.now()), nowPlaying.has(card.slug), musicSlugs.has(card.slug), screenSlugs.has(card.slug)),
      ),
    [current.items, book, marketNow, nowPlaying, musicSlugs, screenSlugs],
  );
  // Seules les cartes de la page affichée ont leurs prix relevés, comme sur la liste du site.
  useWantPrices(current.items, onWantCards);

  const goTo = (next: number) => {
    pages.set(filterKey, next);
    repaint();
  };

  return (
    <div style={{ color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}>
      <Pager page={current.page} pages={current.pages} onPage={goTo} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {current.items.map((card, index) => {
          const preview = previews[index];
          return preview ? <CardTile key={card.slug} preview={preview} onPick={() => onOpenCard(card.slug)} /> : null;
        })}
      </div>
      {current.items.length === 0 && (
        <p style={{ opacity: 0.7, textAlign: 'center', margin: '24px 0' }}>
          {cards.length === 0
            ? 'Aucune carte connue : parcourez la Collection pour que l’extension les découvre.'
            : 'Aucune carte ne correspond aux filtres.'}
        </p>
      )}
      <Pager page={current.page} pages={current.pages} onPage={goTo} />
      <p style={{ margin: '0 0 8px', opacity: 0.7, fontSize: 12, textAlign: 'center' }}>
        {filtering && 'Filtre en cours de lecture… '}
        {error && 'Filtre illisible : toutes les cartes sont affichées. '}
        {list.length} carte{list.length > 1 ? 's' : ''} · {size} par page
      </p>
    </div>
  );
}
