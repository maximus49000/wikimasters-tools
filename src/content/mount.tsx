import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PurchaseModel } from '../core/pricing/badge';
import type { MarketRepo } from '../core/market/market-repo';
import { PURCHASE_HOST_ATTRIBUTE } from './decorate';
import { AuctionLink } from './AuctionLink';
import { AUCTION_HOST_ATTRIBUTE, type MountAuctionLink } from './auction-link';
import { setPendingAuctionSearch } from './auction-search';
import { MarketLink } from './MarketLink';
import { MARKET_HOST_ATTRIBUTE, type MountMarketLink } from './market-link';
import { MarketPopup } from './MarketPopup';
import { reopenCard } from './collection-reopen';
import { createSearchStarter, type SearchStarter } from './market-search-flow';
import {
  clearReturnTarget,
  getReturnTarget,
  setPendingReopen,
} from './return-target';
import { PurchaseBadge } from './PurchaseBadge';
import { HistoryBadge } from './HistoryBadge';
import { ListenSection } from './ListenSection';
import { IMAGE_HOST_ATTRIBUTE, LISTEN_HOST_ATTRIBUTE, SCREEN_HOST_ATTRIBUTE, type MountListen } from './decorate-listen';
import { ScreenSection } from './ScreenSection';
import { ImageSection } from './ImageSection';
import { LINKED_HOST_ATTRIBUTE, type MountLinked } from './decorate-linked';
import { LinkedCards, LinkedCardsWindow } from './LinkedCards';
import { getLinkedService } from './linked-registry';
import { ImageSettings } from './ImageSettings';
import { PlayerSettings } from './PlayerSettings';
import type { PlayerSource } from './player-source';
import type { ImageService } from '../core/images/image-service';
import { LoadingGlyph } from './LoadingGlyph';
import { RefreshButton, type CollectionView } from './RefreshButton';
import { findCollectionRoot, findSelectButton, scanCollectionCards } from './collection-dom';
import {
  ensureRefreshButton,
  readCollectionPage,
  REFRESH_HOST_ATTRIBUTE,
  removeRefreshButton,
  type MountRefresh,
} from './refresh-button';
import type { MarketCollector } from '../core/market/market-poll';
import { LOADING_HOST_ATTRIBUTE, type MountLoading } from './decorate-loading';
import { HISTORY_HOST_ATTRIBUTE, type MountHistory } from './decorate-history';
import type { HistoryRepo } from '../core/market/history-repo';

export function mountPurchaseBadge(frame: HTMLElement, model: PurchaseModel): void {
  const host = document.createElement('div');
  host.setAttribute(PURCHASE_HOST_ATTRIBUTE, '');
  host.style.cssText = 'position:absolute; top:8px; right:8px; z-index:30';

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  frame.appendChild(host);
  createRoot(mountPoint).render(<PurchaseBadge model={model} />);
}

// Sous la pastille de rareté, alignée à gauche, dans le cadre de la carte.
export const mountHistoryBadge: MountHistory = (frame, chip, model) => {
  const host = document.createElement('div');
  host.setAttribute(HISTORY_HOST_ATTRIBUTE, '');
  host.style.cssText =
    `position:absolute; left:${chip.offsetLeft}px; top:${chip.offsetTop + chip.offsetHeight + 4}px; z-index:30`;

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  frame.appendChild(host);
  const root = createRoot(mountPoint);
  root.render(<HistoryBadge model={model} />);
  return { update: (next) => root.render(<HistoryBadge model={next} />) };
};

// En bas à droite de la carte, juste au-dessus de la ligne ATK / DEF (qui occupe le coin).
export const mountLoadingGlyph: MountLoading = (frame) => {
  const host = document.createElement('div');
  host.setAttribute(LOADING_HOST_ATTRIBUTE, '');
  host.style.cssText = 'position:absolute; right:8px; bottom:34px; z-index:30; pointer-events:none';

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  frame.appendChild(host);
  const root = createRoot(mountPoint);
  root.render(<LoadingGlyph />);
  return { unmount: () => window.setTimeout(() => root.unmount(), 0) };
};

// La page de Collection affichée : son numéro, le filtre actif et les cartes à l'écran.
function currentCollectionView(getFilter: () => string): CollectionView {
  const select = findSelectButton(document);
  const scope = select ? findCollectionRoot(select) : null;
  const targets = scope ? scanCollectionCards(scope).map(({ slug, title }) => ({ slug, title })) : [];
  return { filter: getFilter(), page: readCollectionPage(document), targets };
}

// Bouton « Recharger les prix de cette page » : uniquement sur la Collection, sous la grille des cartes.
export function syncRefreshButton(
  collector: MarketCollector,
  deps: { getFilter: () => string; onUpdate: () => void },
): void {
  if (!window.location.pathname.startsWith('/collection')) {
    removeRefreshButton(document);
    return;
  }
  const mount: MountRefresh = (grid) => {
    const host = document.createElement('div');
    host.setAttribute(REFRESH_HOST_ATTRIBUTE, '');
    host.style.display = 'block';
    const shadow = host.attachShadow({ mode: 'open' });
    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);
    grid.insertAdjacentElement('afterend', host);
    const root = createRoot(mountPoint);
    root.render(
      <RefreshButton
        collector={collector}
        getView={() => currentCollectionView(deps.getFilter)}
        onUpdate={deps.onUpdate}
      />,
    );
    return { unmount: () => window.setTimeout(() => root.unmount(), 0) };
  };
  ensureRefreshButton(document, mount);
}

// Sections posées dans les fiches natives (« Écouter », film / série) : démontées dès que le jeu referme la fiche.
function createNativeSections(attribute: string, marginTop: string, render: (slug: string, title: string, host: HTMLElement) => ReactElement, position: InsertPosition = 'afterend') {
  const roots = new Map<HTMLElement, Root>();
  const mount: MountListen = (anchor, slug, title) => {
    const host = document.createElement('div');
    host.setAttribute(attribute, '');
    host.style.display = 'block';
    host.style.marginTop = marginTop;
    const shadow = host.attachShadow({ mode: 'open' });
    const mountPoint = document.createElement('div');
    mountPoint.style.cssText = 'color:inherit; font:inherit';
    shadow.appendChild(mountPoint);
    anchor.insertAdjacentElement(position, host);
    const root = createRoot(mountPoint);
    roots.set(host, root);
    root.render(render(slug, title, host));
  };
  const prune = (): void => {
    for (const [host, root] of roots) {
      if (host.isConnected) continue;
      roots.delete(host);
      window.setTimeout(() => root.unmount(), 0);
    }
  };
  return { mount, prune };
}

const listenSections = createNativeSections(LISTEN_HOST_ATTRIBUTE, '8px', (slug, title) => <ListenSection slug={slug} title={title} />);
export const mountListenSection: MountListen = listenSections.mount;
export const pruneListenSections = listenSections.prune;

const screenSections = createNativeSections(SCREEN_HOST_ATTRIBUTE, '0', (slug, title) => <ScreenSection slug={slug} title={title} />);
export const mountScreenSection: MountListen = screenSections.mount;
export const pruneScreenSections = screenSections.prune;

const imageSections = createNativeSections(IMAGE_HOST_ATTRIBUTE, '0', (slug, title) => <ImageSection slug={slug} title={title} />);
export const mountImageSection: MountListen = imageSections.mount;
export const pruneImageSections = imageSections.prune;

// Bloc « Cartes liées » : devant les tuiles ATK / DEF ; « Voir plus » ouvre toutes les cartes liées dans une fenêtre.
const LINKED_WINDOW_HOST_ATTRIBUTE = 'data-wmt-linked-window';
const linkedSections = createNativeSections(
  LINKED_HOST_ATTRIBUTE,
  '0',
  (slug, title, host) => (
    <LinkedCards
      slug={slug}
      onOpenCard={(target) => getLinkedService()?.open(host, target)}
      onSeeAll={() =>
        openSettingsWindow(LINKED_WINDOW_HOST_ATTRIBUTE, (close) => (
          <LinkedCardsWindow
            slug={slug}
            title={title}
            onClose={close}
            onPick={(target) => {
              close();
              getLinkedService()?.open(host, target);
            }}
          />
        ))
      }
    />
  ),
  'beforebegin',
);
export const mountLinkedCards: MountLinked = linkedSections.mount;
export const pruneLinkedCards = linkedSections.prune;

const IMAGE_SETTINGS_HOST_ATTRIBUTE = 'data-wmt-image-settings';
const PLAYER_SETTINGS_HOST_ATTRIBUTE = 'data-wmt-player-settings';

// Fenêtre de réglage ouverte depuis le menu « Plus » : hors du DOM du jeu (shadow DOM).
function openSettingsWindow(hostAttribute: string, render: (close: () => void) => ReactElement): void {
  if (document.querySelector(`[${hostAttribute}]`)) return;
  const host = document.createElement('div');
  host.setAttribute(hostAttribute, '');
  host.style.cssText = 'position:fixed; inset:0; z-index:2147483000';
  // Le menu du jeu se ferme sur un appui « à l'extérieur » : on garde ces événements chez nous.
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }
  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);
  document.body.appendChild(host);
  const root = createRoot(mountPoint);
  function close() {
    document.removeEventListener('keydown', onKey, true);
    root.unmount();
    host.remove();
  }
  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
  }
  document.addEventListener('keydown', onKey, true);
  root.render(render(close));
}

export const openImageSettings = (images: ImageService): void =>
  openSettingsWindow(IMAGE_SETTINGS_HOST_ATTRIBUTE, (close) => <ImageSettings images={images} onClose={close} />);

export const openPlayerSettings = (source: PlayerSource): void =>
  openSettingsWindow(PLAYER_SETTINGS_HOST_ATTRIBUTE, (close) => <PlayerSettings source={source} onClose={close} />);

const POPUP_HOST_ATTRIBUTE = 'data-wmt-market-popup';

const TOAST_HOST_ATTRIBUTE = 'data-wmt-toast';
const TOAST_MS = 6_000;

// Message discret et éphémère, hors du DOM du jeu (shadow DOM), sans dépendance à React.
function showToast(text: string): void {
  document.querySelector(`[${TOAST_HOST_ATTRIBUTE}]`)?.remove();
  const host = document.createElement('div');
  host.setAttribute(TOAST_HOST_ATTRIBUTE, '');
  host.style.cssText = 'position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:2147483000';
  const shadow = host.attachShadow({ mode: 'open' });
  const box = document.createElement('div');
  box.textContent = text;
  box.style.cssText =
    'padding:8px 14px; border-radius:8px; background:#0d1117; color:#e6edf3; ' +
    'border:1px solid rgba(148,163,184,0.35); font:500 13px/18px system-ui,sans-serif';
  shadow.appendChild(box);
  document.body.appendChild(host);
  window.setTimeout(() => host.remove(), TOAST_MS);
}

function openMarketPopup(
  repo: MarketRepo,
  history: HistoryRepo,
  search: SearchStarter,
  slug: string,
  autoStart: boolean,
  goBack: (slug: string) => void,
  canReturn: boolean,
): void {
  if (document.querySelector(`[${POPUP_HOST_ATTRIBUTE}]`)) return;

  const host = document.createElement('div');
  host.setAttribute(POPUP_HOST_ATTRIBUTE, '');
  host.style.cssText = 'position:fixed; inset:0; z-index:2147483000';
  // La fiche du jeu se ferme souvent sur un appui « à l'extérieur » : on garde ces événements chez nous.
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);
  document.body.appendChild(host);

  const root = createRoot(mountPoint);
  function close() {
    document.removeEventListener('keydown', onKey, true);
    root.unmount();
    host.remove();
  }
  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
  }
  document.addEventListener('keydown', onKey, true);
  root.render(
    <MarketPopup
      slug={slug}
      repo={repo}
      history={history}
      search={search}
      autoStart={autoStart}
      canReturn={canReturn}
      onReturn={() => goBack(slug)}
      onClose={close}
    />,
  );
}

export function createMarketUi(repo: MarketRepo, history: HistoryRepo) {
  const search = createSearchStarter({
    root: document,
    pathname: () => window.location.pathname,
    fullPath: () => window.location.pathname + window.location.search,
    navigate: (url) => window.location.assign(url),
    storage: window.sessionStorage,
    now: () => Date.now(),
  });

  const openPopup = (slug: string, autoStart: boolean) => {
    const target = getReturnTarget(window.sessionStorage, Date.now());
    openMarketPopup(repo, history, search, slug, autoStart, goBack, target?.slug === slug);
  };

  // Retour à la page d'origine ; la fiche sera rouverte au chargement de cette page.
  function goBack(slug: string): void {
    const target = getReturnTarget(window.sessionStorage, Date.now());
    if (!target || target.slug !== slug) return;
    clearReturnTarget(window.sessionStorage);
    setPendingReopen(window.sessionStorage, slug, Date.now());
    window.location.assign(target.path);
  }

  const mountLink: MountMarketLink = (anchor, slug) => {
    const host = document.createElement('div');
    host.setAttribute(MARKET_HOST_ATTRIBUTE, '');
    host.style.display = 'block';

    const shadow = host.attachShadow({ mode: 'open' });
    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    anchor.insertAdjacentElement('afterend', host);
    createRoot(mountPoint).render(
      <MarketLink onOpen={() => openPopup(slug, false)} history={history} slug={slug} />,
    );
  };

  // Fiche d'une enchère : le lien liste toutes les enchères de la carte, par fin imminente (la recherche reprend sur la page Marché).
  const mountAuctionLink: MountAuctionLink = (box, title) => {
    const host = document.createElement('div');
    host.setAttribute(AUCTION_HOST_ATTRIBUTE, '');
    host.style.display = 'block';

    const shadow = host.attachShadow({ mode: 'open' });
    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    box.insertAdjacentElement('afterend', host);
    createRoot(mountPoint).render(
      <AuctionLink
        onOpen={() => {
          setPendingAuctionSearch(window.sessionStorage, title, Date.now());
          window.location.assign('/marketplace');
        }}
      />,
    );
  };

  return {
    mountLink,
    mountAuctionLink,
    // Fiche de marché d'une carte (Map, Chronologique) : la même popup que le lien de la liste.
    openMarket: (slug: string) => openPopup(slug, false),
    // Reprise après la navigation vers la page Marché : le popup lance lui-même la recherche.
    resumeSearch: (slug: string) => openPopup(slug, true),
    // Chargement de la page d'origine : on rouvre la fiche, ou on dit pourquoi on n'y arrive pas.
    reopenCard: async (slug: string) => {
      if ((await reopenCard(document, slug)) === 'not-found') {
        showToast('Carte introuvable dans la Collection.');
      }
    },
  };
}
