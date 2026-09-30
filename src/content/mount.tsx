import { createRoot } from 'react-dom/client';
import type { PurchaseModel } from '../core/pricing/badge';
import type { MarketRepo } from '../core/market/market-repo';
import { PURCHASE_HOST_ATTRIBUTE } from './decorate';
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
      search={search}
      autoStart={autoStart}
      canReturn={canReturn}
      onReturn={() => goBack(slug)}
      onClose={close}
    />,
  );
}

export function createMarketUi(repo: MarketRepo) {
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
    openMarketPopup(repo, search, slug, autoStart, goBack, target?.slug === slug);
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
      <MarketLink onOpen={() => openPopup(slug, false)} />,
    );
  };

  return {
    mountLink,
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
