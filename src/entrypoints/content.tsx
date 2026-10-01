import { createGameApi } from '../core/api/game-api';
import { createChromeLocalStore } from '../core/cache/store';
import { createTtlCache } from '../core/cache/ttl-cache';
import { createDataSource } from '../core/data-source';
import { createCollectionRepo } from '../core/collection/collection-repo';
import { createCollectionScanner } from '../core/collection/collection-scan';
import { fetchWikiCoords } from '../core/geo/wiki-coords';
import { fetchWikidataDates } from '../core/birth/wikidata-birth';
import { createBirthRepo } from '../core/birth/birth-repo';
import { createGeoRepo } from '../core/geo/geo-repo';
import { createCollectionFilterSource } from '../content/collection-filter';
import { createCollectionUi } from '../content/collection-ui';
import { loadFilteredSlugs } from '../core/collection/filtered-slugs';
import { createMarketRepo } from '../core/market/market-repo';
import { createHistoryRepo } from '../core/market/history-repo';
import { createMarketWatcher, fetchFullMarket } from '../core/market/market-poll';
import { cardsForSlug, emptyHistory, type HistoryState } from '../core/market/price-history';
import { decorateHistory } from '../content/decorate-history';
import { parseMarketAuctions } from '../core/market/schemas';
import type { PriceBook } from '../core/pricing/price-book';
import { decorate } from '../content/decorate';
import { decorateMarketLinks } from '../content/market-link';
import { HELLO_MESSAGE, MARKET_MESSAGE } from '../content/market-messages';
import { createMarketUi, mountHistoryBadge, mountPurchaseBadge } from '../content/mount';
import { takePendingSearch } from '../content/pending-search';
import { takePendingReopen } from '../content/return-target';

const LOG = '[wikimasters-tools]';
const DEBOUNCE_MS = 300;

export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  async main() {
    const store = createChromeLocalStore();
    const api = createGameApi({
      fetch: (input, init) => fetch(input, { credentials: 'same-origin', ...init }),
      minIntervalMs: 1500,
    });
    // Lecture des cartes filtrées : action de l'utilisateur, on peut espacer moins les pages (le 429 est géré).
    const filterApi = createGameApi({
      fetch: (input, init) => fetch(input, { credentials: 'same-origin', ...init }),
      minIntervalMs: 400,
    });
    const dataSource = createDataSource({ api, cache: createTtlCache(store) });
    const marketRepo = createMarketRepo(store);
    const historyRepo = createHistoryRepo(store);

    console.info(LOG, 'démarré');

    // Observation passive du marché : on n'écoute qu'après l'écouteur, avant tout `await`.
    window.addEventListener('message', (event) => {
      const data = event.data as { type?: unknown; auctions?: unknown } | null;
      if (event.source !== window || data?.type !== MARKET_MESSAGE) return;
      const { auctions, skipped } = parseMarketAuctions({ auctions: data.auctions });
      if (skipped > 0) console.warn(LOG, `marché : ${skipped} enchère(s) au format inattendu ignorée(s)`);
      marketRepo.observe(auctions).catch((error) => console.warn(LOG, 'marché non enregistré :', error));
    });
    const filterSource = createCollectionFilterSource(window);
    window.postMessage({ type: HELLO_MESSAGE }, window.location.origin);

    // Le lien du marché ne dépend pas de vos prix : on ne l'abandonne pas si ceux-ci échouent.
    let book: PriceBook | null = null;
    try {
      book = await dataSource.getMyPriceBook();
    } catch (error) {
      // Déconnecté, 429, format modifié… : pas de badge de prix plutôt que casser la page.
      console.warn(LOG, 'prix indisponibles :', error);
    }

    const marketUi = createMarketUi(marketRepo, historyRepo);
    // Requête Wikipédia sans identifiants : rien du compte ni du jeu n'y est joint.
    const collectionRepo = createCollectionRepo(store);
    const collectionUi = createCollectionUi({
      collection: collectionRepo,
      geo: createGeoRepo(store, (slug) => fetchWikiCoords((url) => fetch(url), slug)),
      birth: createBirthRepo(store, (slugs) => fetchWikidataDates((url) => fetch(url), slugs)),
      scanner: createCollectionScanner({ api, collection: collectionRepo, store }),
      book,
      filterSource,
      loadFiltered: (filter, isCancelled) => loadFilteredSlugs(filterApi, filter, isCancelled),
      openCard: (slug) => void marketUi.reopenCard(slug),
    });

    // Historique du marché chargé en mémoire : la décoration de la page est synchrone.
    let history: HistoryState = emptyHistory();
    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, DEBOUNCE_MS);
    });

    function run() {
      // On se déconnecte pendant nos propres insertions pour éviter une boucle.
      observer.disconnect();
      try {
        const links = decorateMarketLinks(document, marketUi.mountLink);
        try {
          collectionUi.sync();
        } catch (error) {
          console.warn(LOG, 'vues de la Collection indisponibles :', error);
        }
        try {
          decorateHistory(document, (slug) => cardsForSlug(history, slug), Date.now(), mountHistoryBadge);
        } catch (error) {
          console.warn(LOG, 'moyennes du marché indisponibles :', error);
        }
        if (book) {
          const mounted = decorate(document, book, mountPurchaseBadge);
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

    const refreshHistory = () =>
      historyRepo.all().then(
        (state) => {
          history = state;
          run();
        },
        (error) => console.warn(LOG, 'historique du marché illisible :', error),
      );
    void refreshHistory();
    historyRepo.subscribe(() => void refreshHistory());

    run();

    // Relevé du marché en arrière-plan, uniquement sur la Collection et onglet visible.
    const watcher = createMarketWatcher({
      poll: async () => {
        // La tentative est datée d'abord : un échec n'entraîne pas de relance en boucle.
        await historyRepo.markAttempt();
        try {
          await historyRepo.record(await fetchFullMarket(api));
        } catch (error) {
          console.warn(LOG, 'relevé du marché abandonné :', error);
        }
      },
      lastPollAt: () => historyRepo.lastPollAt(),
      now: () => Date.now(),
      isVisible: () =>
        document.visibilityState === 'visible' && window.location.pathname.startsWith('/collection'),
    });
    const tick = () => void watcher.tick().catch((error) => console.warn(LOG, 'relevé du marché :', error));
    tick();
    window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);

    // Une recherche demandée depuis une fiche reprend ici, sur la page Marché.
    if (window.location.pathname.startsWith('/marketplace')) {
      const pending = takePendingSearch(window.sessionStorage, Date.now());
      if (pending) marketUi.resumeSearch(pending);
    } else {
      // Retour depuis le marché : la fiche de la carte se rouvre ici.
      const reopen = takePendingReopen(window.sessionStorage, Date.now());
      if (reopen) void marketUi.reopenCard(reopen);
    }
  },
});
