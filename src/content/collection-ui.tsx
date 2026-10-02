import type { KnownCard } from '../core/collection/collection-book';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import { createRoot, type Root } from 'react-dom/client';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { CollectionScanner } from '../core/collection/collection-scan';
import type { BirthRepo } from '../core/birth/birth-repo';
import type { GeoRepo } from '../core/geo/geo-repo';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { LinksRepo } from '../core/links/links-repo';
import type { PriceBook } from '../core/pricing/price-book';
import {
  findCardGrid,
  findCollectionRoot,
  findPagination,
  findRarityFilterAnchor,
  findSelectButton,
  restoreHiddenGrids,
  scanCollectionCards,
  setGridHidden,
} from './collection-dom';
import type { CollectionFilterSource } from './collection-filter';
import { recountCopies } from '../core/collection/recount';
import { readView, writeView, type CollectionView } from './collection-view';
import { HomemadePanel } from './HomemadePanel';
import type { KindFilterSource } from './kind-filter';
import { createKindRowController } from './kind-row-controller';
import { createPageMemory } from './page-memory';
import { createPathRequestSource, createSelectionSource, type SelectedCard } from './selection-source';
import { ensureTradeAction, ensureWebAction, isSelecting, quitSelection, readNativeCards, removeWebAction, type NativeCard } from './selection-dom';
import { RecountGate } from './RecountGate';
import { createRecountSource } from './recount-source';
import type { MarketSource } from './market-source';
import { TimelinePanel } from './TimelinePanel';
import { syncPriceSort } from './price-sort-menu';
import type { SortSource } from './sort-source';
import { startTradeFlow } from './trade-flow';
import { WebPanel } from './WebPanel';
import { PANEL_CSS, WorldPanel } from './WorldPanel';
import { ensureViewSwitch } from './world-toggle';

const LOG = '[wikimasters-tools]';
const PANEL_ATTRIBUTE = 'data-wmt-world-panel';

export type CollectionUiDeps = {
  collection: CollectionRepo;
  geo: GeoRepo;
  birth: BirthRepo;
  kinds: KindsRepo;
  // Liens Wikipédia des cartes (vue Toile).
  links: LinksRepo;
  // Filtre nature / occupation choisi dans la rangée de listes (Homemade, Monde, Chronologique, Toile).
  kindFilterSource: KindFilterSource;
  scanner: CollectionScanner;
  // Prix connus (null si indisponibles) : l'aperçu d'une carte s'en passe.
  book: PriceBook | null;
  // Filtres (étiquette, rareté…) appliqués sur la page, et lecture des cartes qu'ils laissent.
  filterSource: CollectionFilterSource;
  // Tri « Prix de vente décroissant » ajouté à la liste de tri du site (vue Homemade).
  sortSource: SortSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
  // Un clic sur une carte d'une vue : sa fiche de marché.
  openCard: (slug: string) => void;
  // Le bouton « carte » : la fiche de la carte dans la Collection du jeu.
  openGameCard: (slug: string) => void;
  // Prix du marché des cartes, comme sur la liste.
  market: MarketSource;
  // Cartes affichées dans la Collection (à relever sur le marché).
  onVisibleCards?: (cards: KnownCard[]) => void;
};

type Panel = { host: HTMLElement; root: Root; grid: HTMLElement; view: CollectionView };

export function createCollectionUi({ collection, geo, birth, kinds, links, kindFilterSource, scanner, book, filterSource, sortSource, loadFiltered, openCard, openGameCard, market, onVisibleCards }: CollectionUiDeps) {
  let panel: Panel | null = null;
  let scanStarted = false;
  const kindRow = createKindRowController({ collection, kinds, filterSource, kindFilterSource });
  // « ×2 » : les exemplaires sont recomptés sur toute la Collection avant d'afficher les cartes en double.
  const recount = createRecountSource(() => recountCopies(scanner));
  // Page de la vue Homemade pour chaque sélection de filtres : la vue est remontée à la fermeture d'une fiche.
  const pages = createPageMemory();
  // Plus grand nombre de cartes vues dans la grille native : la taille de page du site, avant que le scan la connaisse.
  let nativeCount = 0;
  // Cases à cocher de la vue Homemade (le mode « Sélectionner » du site, dont la grille est masquée) et bouton Toile.
  const selection = createSelectionSource();
  const pathRequest = createPathRequestSource();
  let nativeCards = new Map<string, NativeCard>();
  let nativeScope: ParentNode = document;

  const readNative = (): void => {
    nativeCards = readNativeCards(nativeScope);
    selection.syncNative(new Map([...nativeCards].map(([slug, { title, selected }]) => [slug, { title, selected }])));
  };

  // Une carte de la grille du site se coche par le site même ; les autres, ici seulement.
  const toggleCard = (card: SelectedCard): void => {
    const native = nativeCards.get(card.slug);
    if (!native) return selection.toggle(card);
    native.toggle();
    readNative();
  };

  // Appui long sur une carte : le mode « Sélectionner » du site s'ouvre (sa case ne se coche qu'une fois le mode actif) puis la carte est cochée.
  const startSelectionWith = (card: SelectedCard): void => {
    if (selection.snapshot().selecting) return toggleCard(card);
    findSelectButton(document)?.click();
    let tries = 0;
    const wait = (): void => {
      if (isSelecting(document)) {
        selection.setSelecting(true);
        readNative();
        if (!selection.snapshot().cards.has(card.slug)) toggleCard(card);
      } else if (++tries < 20) window.setTimeout(wait, 50);
    };
    wait();
  };

  // Les boutons Toile (exactement deux cartes cochées) et Échanger avec un ami (au moins une) de la barre du site, en vue Homemade seulement.
  function syncWebAction(): void {
    const { selecting, cards } = selection.snapshot();
    if (!selecting || readView(window.localStorage) !== 'homemade') return removeWebAction(document);
    ensureWebAction(document, cards.size === 2, () => {
      const [from, to] = [...selection.snapshot().cards].map(([slug, title]) => ({ slug, title }));
      if (!from || !to || selection.snapshot().cards.size !== 2) return;
      pathRequest.set({ from, to });
      quitSelection(document);
      writeView(window.localStorage, 'web');
      sync();
    });
    ensureTradeAction(document, cards.size >= 1, () => {
      const titles = [...selection.snapshot().cards.values()];
      if (titles.length === 0) return;
      quitSelection(document);
      startTradeFlow(titles);
    });
  }
  selection.subscribe(syncWebAction);

  function unmountPanel(): void {
    if (!panel) return;
    panel.root.unmount();
    panel.host.remove();
    panel = null;
  }

  // Les cartes d'une vue (toutes celles du filtre) : leurs prix sont relevés comme ceux de la page de la liste.
  const wantCards = (cards: KnownCard[]): void => onVisibleCards?.(cards);

  function mountPanel(grid: HTMLElement, view: CollectionView): void {
    const host = document.createElement('div');
    host.setAttribute(PANEL_ATTRIBUTE, '');
    host.style.display = 'block';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = leafletCss + PANEL_CSS;
    const mountPoint = document.createElement('div');
    shadow.append(style, mountPoint);
    grid.insertAdjacentElement('beforebegin', host);

    const root = createRoot(mountPoint);
    const common = { collection, scanner, book, market, filterSource, loadFiltered, onOpen: openCard, onOpenCard: openGameCard, onWantCards: wantCards };
    root.render(
      <RecountGate recount={recount} scanner={scanner} kindFilterSource={kindFilterSource}>
        {view === 'timeline' ? (
          <TimelinePanel {...common} birth={birth} kinds={kinds} kindFilterSource={kindFilterSource} />
        ) : view === 'world' ? (
          <WorldPanel {...common} geo={geo} kinds={kinds} kindFilterSource={kindFilterSource} />
        ) : view === 'web' ? (
          <WebPanel {...common} links={links} kinds={kinds} kindFilterSource={kindFilterSource} request={pathRequest.take()} />
        ) : (
          <HomemadePanel {...common} sortSource={sortSource} kinds={kinds} kindFilterSource={kindFilterSource} nativePageSize={() => nativeCount} pages={pages} selection={selection} onToggleCard={toggleCard} onLongPressCard={startSelectionWith} />
        )}
      </RecountGate>,
    );
    panel = { host, root, grid, view };
  }

  function showList(): void {
    syncPriceSort(document, false, sortSource);
    unmountPanel();
    kindRow.unmount();
    restoreHiddenGrids(document);
  }

  // Idempotent : appelé à chaque changement du DOM, il ne touche à rien quand tout est déjà en place.
  function sync(): void {
    if (!window.location.pathname.startsWith('/collection')) {
      showList();
      return;
    }
    // Premier chargement : le scan tourne en arrière plan (une fois par chargement de page ;
    // il ne refait rien s'il est déjà terminé, et reprend où il s'était arrêté sinon).
    if (!scanStarted) {
      scanStarted = true;
      scanner.run().catch((error) => console.warn(LOG, 'scan de la Collection interrompu :', error));
    }
    const button = findSelectButton(document);
    if (!button) {
      showList();
      return;
    }

    const scope = findCollectionRoot(button);
    nativeScope = scope ?? document;
    selection.setSelecting(isSelecting(document));
    if (selection.snapshot().selecting) readNative();
    if (scope) {
      const cards = scanCollectionCards(scope);
      if (cards.length > 0) {
        nativeCount = Math.max(nativeCount, cards.length);
        collection.observe(cards).catch((error) => console.warn(LOG, 'collection non enregistrée :', error));
        onVisibleCards?.(cards);
      }
    }

    const view = readView(window.localStorage);
    syncPriceSort(document, view === 'homemade', sortSource);
    // Le sélecteur se place à côté des pastilles de rareté ; à défaut, à côté de « Sélectionner ».
    const rarityAnchor = findRarityFilterAnchor(document);
    ensureViewSwitch(rarityAnchor ?? button, button, view, (next) => {
      writeView(window.localStorage, next);
      sync();
    }, view === 'list' ? null : {
      on: kindFilterSource.current().duplicates === true,
      onToggle: () => {
        const current = kindFilterSource.current();
        const next = !current.duplicates;
        // Activer : le recomptage démarre avant le filtre, pour ne jamais montrer une liste aux nombres périmés.
        if (next) recount.start();
        kindFilterSource.set({ ...current, duplicates: next });
        sync();
      },
    });

    syncWebAction();

    if (view === 'list') {
      showList();
      return;
    }

    // On garde la grille déjà masquée tant qu'elle est dans la page : la carte garde son zoom.
    const grid =
      panel?.grid.isConnected && panel.host.isConnected
        ? panel.grid
        : scope
          ? findCardGrid(scope, button)
          : null;
    if (!grid) {
      showList();
      return;
    }
    // Les filtres nature / occupation sont posés avant les pastilles de rareté, sinon avant « Sélectionner » :
    // jamais entre ce bouton et le sélecteur de vues (ensureViewSwitch créerait alors un second sélecteur).
    kindRow.mount(rarityAnchor?.parentElement ?? button);
    setGridHidden(grid, true);
    // Les panneaux montrent toutes les cartes : la navigation entre les pages de la liste n'a plus de sens.
    for (const pagination of findPagination(document, button)) setGridHidden(pagination, true);
    if (!panel || panel.grid !== grid || panel.view !== view || !panel.host.isConnected) {
      unmountPanel();
      mountPanel(grid, view);
    }
  }

  // Sans attendre la mise à jour des vues : « Prix de vente décroissant » doit apparaître dès que la liste de tri s'ouvre.
  function syncSortMenu(): void {
    if (!window.location.pathname.startsWith('/collection')) return;
    syncPriceSort(document, readView(window.localStorage) === 'homemade', sortSource);
  }

  return { sync, syncSortMenu };
}
