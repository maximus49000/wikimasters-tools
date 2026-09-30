import { createGameApi } from '../core/api/game-api';
import { createChromeLocalStore } from '../core/cache/store';
import { createTtlCache } from '../core/cache/ttl-cache';
import { createDataSource } from '../core/data-source';
import type { PriceBook } from '../core/pricing/price-book';
import { decorate } from '../content/decorate';
import { mountBadge } from '../content/mount';

const LOG = '[wikimasters-tools]';
const DEBOUNCE_MS = 300;

export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  async main() {
    const api = createGameApi({
      fetch: (input, init) => fetch(input, { credentials: 'same-origin', ...init }),
    });
    const dataSource = createDataSource({
      api,
      cache: createTtlCache(createChromeLocalStore()),
    });

    console.info(LOG, 'démarré');
    let book: PriceBook;
    try {
      book = await dataSource.getMyPriceBook();
    } catch (error) {
      // Déconnecté, 429, format modifié… : on ne rend rien plutôt que casser la page.
      console.warn(LOG, 'prix indisponibles :', error);
      return;
    }

    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, DEBOUNCE_MS);
    });

    function run() {
      // On se déconnecte pendant nos propres insertions pour éviter une boucle.
      observer.disconnect();
      try {
        const mounted = decorate(document, book, mountBadge);
        const titles = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(
          (heading) => heading.textContent?.trim() ?? '',
        );
        const known = titles.filter((title) => book.byTitle(title) !== null).length;
        console.info(LOG, `titres : ${titles.length}, connus : ${known}, badges posés : ${mounted}`, titles.slice(0, 5));
      } finally {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }

    run();
  },
});
