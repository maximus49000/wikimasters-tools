import leafletCss from 'leaflet/dist/leaflet.css?inline';
import { createRoot, type Root } from 'react-dom/client';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { CollectionScanner } from '../core/collection/collection-scan';
import type { GeoRepo } from '../core/geo/geo-repo';
import type { PriceBook } from '../core/pricing/price-book';
import {
  findCardGrid,
  findCollectionRoot,
  findSelectButton,
  restoreHiddenGrids,
  scanCollectionCards,
  setGridHidden,
} from './collection-dom';
import type { CollectionFilterSource } from './collection-filter';
import { readView, writeView } from './collection-view';
import { PANEL_CSS, WorldPanel } from './WorldPanel';
import { ensureWorldToggle } from './world-toggle';

const LOG = '[wikimasters-tools]';
const PANEL_ATTRIBUTE = 'data-wmt-world-panel';

export type CollectionUiDeps = {
  collection: CollectionRepo;
  geo: GeoRepo;
  scanner: CollectionScanner;
  // Prix connus (null si indisponibles) : l'aperçu d'une carte s'en passe.
  book: PriceBook | null;
  // Filtres (étiquette, rareté…) appliqués sur la page, et lecture des cartes qu'ils laissent.
  filterSource: CollectionFilterSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
  openCard: (slug: string) => void;
};

type Panel = { host: HTMLElement; root: Root; grid: HTMLElement };

export function createCollectionUi({ collection, geo, scanner, book, filterSource, loadFiltered, openCard }: CollectionUiDeps) {
  let panel: Panel | null = null;
  let scanStarted = false;

  function unmountPanel(): void {
    if (!panel) return;
    panel.root.unmount();
    panel.host.remove();
    panel = null;
  }

  function mountPanel(grid: HTMLElement): void {
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
    root.render(
      <WorldPanel
        collection={collection}
        geo={geo}
        scanner={scanner}
        book={book}
        filterSource={filterSource}
        loadFiltered={loadFiltered}
        onOpen={openCard}
      />,
    );
    panel = { host, root, grid };
  }

  function showList(): void {
    unmountPanel();
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
        collection.observe(cards).catch((error) => console.warn(LOG, 'collection non enregistrée :', error));
      }
    }

    const view = readView(window.localStorage);
    ensureWorldToggle(button, view, () => {
      const current = readView(window.localStorage);
      writeView(window.localStorage, current === 'world' ? 'list' : 'world');
      sync();
    });

    if (view !== 'world') {
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
    setGridHidden(grid, true);
    if (!panel || panel.grid !== grid || !panel.host.isConnected) {
      unmountPanel();
      mountPanel(grid);
    }
  }

  return { sync };
}
