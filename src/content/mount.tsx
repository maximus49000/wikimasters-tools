import { createRoot } from 'react-dom/client';
import type { BadgeModel, PurchaseModel } from '../core/pricing/badge';
import type { MarketRepo } from '../core/market/market-repo';
import { HOST_ATTRIBUTE, PURCHASE_HOST_ATTRIBUTE } from './decorate';
import { MarketLink } from './MarketLink';
import { MARKET_HOST_ATTRIBUTE, type MountMarketLink } from './market-link';
import { MarketPopup } from './MarketPopup';
import { createSearchStarter, type SearchStarter } from './market-search-flow';
import { PriceBadge } from './PriceBadge';
import { PurchaseBadge } from './PurchaseBadge';

export function mountBadge(container: HTMLElement, model: BadgeModel): void {
  const host = document.createElement('div');
  host.setAttribute(HOST_ATTRIBUTE, '');
  host.style.display = 'block';

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  container.appendChild(host);
  createRoot(mountPoint).render(<PriceBadge model={model} />);
}

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

function openMarketPopup(
  repo: MarketRepo,
  search: SearchStarter,
  slug: string,
  autoStart: boolean,
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
    <MarketPopup slug={slug} repo={repo} search={search} autoStart={autoStart} onClose={close} />,
  );
}

export function createMarketUi(repo: MarketRepo) {
  const search = createSearchStarter({
    root: document,
    pathname: () => window.location.pathname,
    navigate: (url) => window.location.assign(url),
    storage: window.sessionStorage,
    now: () => Date.now(),
  });

  const mountLink: MountMarketLink = (anchor, slug) => {
    const host = document.createElement('div');
    host.setAttribute(MARKET_HOST_ATTRIBUTE, '');
    host.style.display = 'block';

    const shadow = host.attachShadow({ mode: 'open' });
    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    anchor.insertAdjacentElement('afterend', host);
    createRoot(mountPoint).render(
      <MarketLink onOpen={() => openMarketPopup(repo, search, slug, false)} />,
    );
  };

  return {
    mountLink,
    // Reprise après la navigation vers la page Marché : le popup lance lui-même la recherche.
    resumeSearch: (slug: string) => openMarketPopup(repo, search, slug, true),
  };
}
