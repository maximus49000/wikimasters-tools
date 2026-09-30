import { createGameApi } from '../core/api/game-api';
import { createChromeLocalStore } from '../core/cache/store';
import { createTtlCache } from '../core/cache/ttl-cache';
import { createDataSource } from '../core/data-source';
import { createMarketRepo } from '../core/market/market-repo';
import { parseMarketAuctions } from '../core/market/schemas';
import type { PriceBook } from '../core/pricing/price-book';
import { decorate } from '../content/decorate';
import { decorateMarketLinks } from '../content/market-link';
import { HELLO_MESSAGE, MARKET_MESSAGE } from '../content/market-messages';
import { createMarketLinkMounter, mountBadge, mountPurchaseBadge } from '../content/mount';

const LOG = '[wikimasters-tools]';
const DEBOUNCE_MS = 300;

export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  async main() {
    const store = createChromeLocalStore();
    const api = createGameApi({
      fetch: (input, init) => fetch(input, { credentials: 'same-origin', ...init }),
    });
    const dataSource = createDataSource({ api, cache: createTtlCache(store) });
    const marketRepo = createMarketRepo(store);

    console.info(LOG, 'démarré');

    // Observation passive du marché : on n'écoute qu'après l'écouteur, avant tout `await`.
    window.addEventListener('message', (event) => {
      const data = event.data as { type?: unknown; auctions?: unknown } | null;
      if (event.source !== window || data?.type !== MARKET_MESSAGE) return;
      const { auctions, skipped } = parseMarketAuctions({ auctions: data.auctions });
      if (skipped > 0) console.warn(LOG, `marché : ${skipped} enchère(s) au format inattendu ignorée(s)`);
      marketRepo.observe(auctions).catch((error) => console.warn(LOG, 'marché non enregistré :', error));
    });
    window.postMessage({ type: HELLO_MESSAGE }, window.location.origin);

    // Le lien du marché ne dépend pas de vos prix : on ne l'abandonne pas si ceux-ci échouent.
    let book: PriceBook | null = null;
    try {
      book = await dataSource.getMyPriceBook();
    } catch (error) {
      // Déconnecté, 429, format modifié… : pas de badge de prix plutôt que casser la page.
      console.warn(LOG, 'prix indisponibles :', error);
    }

    const mountMarketLink = createMarketLinkMounter(marketRepo);

    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, DEBOUNCE_MS);
    });

    function run() {
      // On se déconnecte pendant nos propres insertions pour éviter une boucle.
      observer.disconnect();
      try {
        const links = decorateMarketLinks(document, mountMarketLink);
        if (book) {
          const mounted = decorate(document, book, mountBadge, mountPurchaseBadge);
          const titles = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(
            (heading) => heading.textContent?.trim() ?? '',
          );
          const known = titles.filter((title) => book?.byTitle(title) !== null).length;
          console.info(
            LOG,
            `titres : ${titles.length}, connus : ${known}, badges posés : ${mounted}, liens marché : ${links}`,
            titles.slice(0, 5),
          );
        }
      } finally {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }

    run();
  },
});
