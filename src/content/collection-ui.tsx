import type { KnownCard } from '../core/collection/collection-book';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import { createRoot, type Root } from 'react-dom/client';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { CollectionScanner } from '../core/collection/collection-scan';
import type { BirthRepo } from '../core/birth/birth-repo';
import type { GeoRepo } from '../core/geo/geo-repo';
import type { KindsRepo } from '../core/kinds/kinds-repo';
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
import { readView, writeView, type CollectionView } from './collection-view';
import { HomemadePanel } from './HomemadePanel';
import type { KindFilterSource } from './kind-filter';
import { createKindRowController } from './kind-row-controller';
import type { MarketSource } from './market-source';
import { TimelinePanel } from './TimelinePanel';
import { PANEL_CSS, WorldPanel } from './WorldPanel';
import { ensureViewSwitch } from './world-toggle';

const LOG = '[wikimasters-tools]';
const PANEL_ATTRIBUTE = 'data-wmt-world-panel';

export type CollectionUiDeps = {
  collection: CollectionRepo;
  geo: GeoRepo;
  birth: BirthRepo;
  kinds: KindsRepo;
  // Filtre nature / occupation choisi dans la rangée de listes (Homemade, Monde, Chronologique).
  kindFilterSource: KindFilterSource;
  scanner: CollectionScanner;
  // Prix connus (null si indisponibles) : l'aperçu d'une carte s'en passe.
  book: PriceBook | null;
  // Filtres (étiquette, rareté…) appliqués sur la page, et lecture des cartes qu'ils laissent.
  filterSource: CollectionFilterSource;
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

export function createCollectionUi({ collection, geo, birth, kinds, kindFilterSource, scanner, book, filterSource, loadFiltered, openCard, openGameCard, market, onVisibleCards }: CollectionUiDeps) {
  let panel: Panel | null = null;
  let scanStarted = false;
  const kindRow = createKindRowController({ collection, kinds, filterSource, kindFilterSource });
  // Plus grand nombre de cartes vues dans la grille native : la taille de page du site, avant que le scan la connaisse.
  let nativeCount = 0;

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
      view === 'timeline' ? (
        <TimelinePanel {...common} birth={birth} kinds={kinds} kindFilterSource={kindFilterSource} />
      ) : view === 'world' ? (
        <WorldPanel {...common} geo={geo} kinds={kinds} kindFilterSource={kindFilterSource} />
      ) : (
        <HomemadePanel {...common} kinds={kinds} kindFilterSource={kindFilterSource} nativePageSize={() => nativeCount} />
      ),
    );
    panel = { host, root, grid, view };
  }

  function showList(): void {
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
    if (scope) {
      const cards = scanCollectionCards(scope);
      if (cards.length > 0) {
        nativeCount = Math.max(nativeCount, cards.length);
        collection.observe(cards).catch((error) => console.warn(LOG, 'collection non enregistrée :', error));
        onVisibleCards?.(cards);
      }
    }

    const view = readView(window.localStorage);
    // Le sélecteur se place à côté des pastilles de rareté ; à défaut, à côté de « Sélectionner ».
    const rarityAnchor = findRarityFilterAnchor(document);
    ensureViewSwitch(rarityAnchor ?? button, button, view, (next) => {
      writeView(window.localStorage, next);
      sync();
    });

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

  return { sync };
}
