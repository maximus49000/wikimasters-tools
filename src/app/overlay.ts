import { createGameApi } from '../core/api/game-api';
import type { KeyValueStore } from '../core/cache/store';
import { createTtlCache } from '../core/cache/ttl-cache';
import { createDataSource } from '../core/data-source';
import { createCollectionRepo } from '../core/collection/collection-repo';
import { createCollectionScanner } from '../core/collection/collection-scan';
import { fetchWikiCoords } from '../core/geo/wiki-coords';
import { fetchWikidataDates } from '../core/birth/wikidata-birth';
import { createBirthRepo } from '../core/birth/birth-repo';
import { createGeoRepo } from '../core/geo/geo-repo';
import { fetchWikidataKinds } from '../core/kinds/wikidata-kinds';
import { createKindsRepo } from '../core/kinds/kinds-repo';
import { createKindFilterSource } from '../content/kind-filter';
import { createCollectionFilterSource } from '../content/collection-filter';
import { createCollectionUi } from '../content/collection-ui';
import { createMarketSource } from '../content/market-source';
import { loadFilteredSlugs } from '../core/collection/filtered-slugs';
import { createMarketRepo } from '../core/market/market-repo';
import { createHistoryRepo } from '../core/market/history-repo';
import { createMarketCollector } from '../core/market/market-poll';
import { cardsForSlug, emptyHistory, type HistoryState } from '../core/market/price-history';
import { decorateHistory } from '../content/decorate-history';
import { decorateLoading } from '../content/decorate-loading';
import { parseMarketAuctions } from '../core/market/schemas';
import type { PriceBook } from '../core/pricing/price-book';
import { decorate } from '../content/decorate';
import { decorateMarketLinks } from '../content/market-link';
import { CARDS_MESSAGE, HELLO_MESSAGE, MARKET_MESSAGE } from '../content/market-messages';
import { extractCards } from '../core/api/collection-schemas';
import { createMarketUi, mountHistoryBadge, mountImageSection, mountListenSection, openImageSettings, pruneImageSections, mountLoadingGlyph, mountPurchaseBadge, mountScreenSection, pruneListenSections, pruneScreenSections, syncRefreshButton } from '../content/mount';
import { decorateImage, decorateListen, decorateScreen } from '../content/decorate-listen';
import { takePendingSearch } from '../content/pending-search';
import { takePendingReopen } from '../content/return-target';
import { createMusicRepo } from '../core/music/music-repo';
import { fetchWikidataMusic } from '../core/music/wikidata-music';
import { createSpotifyApi } from '../core/spotify/spotify-api';
import { createSpotifySession } from '../core/spotify/spotify-session';
import type { SpotifyEnv } from '../core/spotify/transport';
import { createMusicService } from '../content/music-service';
import { getMusicService, setMusicService, setPlayerSource } from '../content/music-registry';
import { createPlayerSource } from '../content/player-source';
import { mountSpotifyPlayer } from '../content/mount-player';
import { TMDB_API_KEY } from '../core/screen/config';
import { createScreenRepo } from '../core/screen/screen-repo';
import { createTmdbApi } from '../core/screen/tmdb-api';
import { fetchWikidataScreen } from '../core/screen/wikidata-screen';
import { createScreenService } from '../content/screen-service';
import { getScreenService, setScreenService } from '../content/screen-registry';
import { createMediaArt, type MediaArt, type MediaArtSources } from '../content/media-art';
import { createImageService } from '../core/images/image-service';
import { MAX_CANDIDATES, searchCardImages } from '../core/images/card-image-search';
import { setImageService } from '../content/image-registry';
import { syncCardArt } from '../content/card-art';
import { decorateImageSetting } from '../content/image-setting-menu';

const LOG = '[wikimasters-tools]';
const DEBOUNCE_MS = 300;

// Surcouche Wikimasters : partagée par l'extension (content script) et l'application Android (WebView).
export async function startOverlay(store: KeyValueStore, spotify?: SpotifyEnv): Promise<void> {
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
  const collectionRepo = createCollectionRepo(store);
  const historyRepo = createHistoryRepo(store);
  const collector = createMarketCollector({
    api,
    history: historyRepo,
    store,
    now: () => Date.now(),
    isVisible: () => document.visibilityState === 'visible',
    id: crypto.randomUUID(),
  });

  console.info(LOG, 'démarré');

  // Observation passive du marché : on n'écoute qu'après l'écouteur, avant tout `await`.
  window.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown; auctions?: unknown } | null;
    if (event.source !== window || data?.type !== MARKET_MESSAGE) return;
    const { auctions, skipped } = parseMarketAuctions({ auctions: data.auctions });
    if (skipped > 0) console.warn(LOG, `marché : ${skipped} enchère(s) au format inattendu ignorée(s)`);
    marketRepo.observe(auctions).catch((error) => console.warn(LOG, 'marché non enregistré :', error));
  });
  // Cartes obtenues (pack, achat) : la réponse du jeu les décrit déjà, on les enregistre sans relecture.
  window.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown; payload?: unknown } | null;
    if (event.source !== window || data?.type !== CARDS_MESSAGE) return;
    const cards = extractCards(data.payload);
    if (cards.length === 0) return;
    console.info(LOG, `${cards.length} carte(s) obtenue(s) enregistrée(s)`);
    collectionRepo.observe(cards).catch((error) => console.warn(LOG, 'cartes obtenues non enregistrées :', error));
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
  // Prix du marché partagés avec la Map et la Chronologique (mis à jour avec la liste).
  const market = createMarketSource();
  // Requête Wikipédia sans identifiants : rien du compte ni du jeu n'y est joint.
  const kindsRepo = createKindsRepo(store, (slugs) => fetchWikidataKinds((url) => fetch(url), slugs));
  // Images de remplacement des cartes sans image (Wikipédia, puis Wikimedia Commons) : requêtes sans identifiants.
  // Sources de pochettes / affiches : renseignées plus bas, quand Spotify et TMDB sont prêts.
  const artSources: MediaArtSources = {};
  const mediaArt: MediaArt = createMediaArt({ kinds: kindsRepo, sources: artSources });
  const images = createImageService({
    store,
    // Pochette Spotify / affiche TMDB d'abord (première recherche seulement), puis Wikipédia et Commons, puis l'artiste / l'affiche la plus proche.
    search: async (title, skip, slug) => {
      const art = skip === 0 ? await mediaArt.primary(slug, title).catch(() => []) : [];
      const wiki = await searchCardImages((url) => fetch(url), title, skip);
      const found = [...art, ...wiki.filter((url) => !art.includes(url))].slice(0, MAX_CANDIDATES);
      // Toujours rien : photo de l'artiste (album) ou affiche la plus proche du nom (film, série).
      return found.length === 0 && skip === 0 ? await mediaArt.fallback(slug, title).catch(() => []) : found;
    },
    settings: window.localStorage,
  });
  setImageService(images);
  const collectionUi = createCollectionUi({
    collection: collectionRepo,
    geo: createGeoRepo(store, (slug) => fetchWikiCoords((url) => fetch(url), slug)),
    birth: createBirthRepo(store, (slugs) => fetchWikidataDates((url) => fetch(url), slugs)),
    kinds: kindsRepo,
    kindFilterSource: createKindFilterSource(window.localStorage),
    scanner: createCollectionScanner({ api, collection: collectionRepo, store }),
    book,
    filterSource,
    loadFiltered: (filter, isCancelled) => loadFilteredSlugs(filterApi, filter, isCancelled),
    openCard: (slug) => marketUi.openMarket(slug),
    openGameCard: (slug) => void marketUi.reopenCard(slug),
    market: market.source,
    onVisibleCards: (cards) =>
      void collector
        .want(cards.map(({ slug, title }) => ({ slug, title })))
        .then((added) => (added ? collector.tick() : undefined))
        .catch((error) => console.warn(LOG, 'relevé du marché :', error)),
  });

  // Historique du marché chargé en mémoire : la décoration de la page est synchrone.
  let history: HistoryState = emptyHistory();
  // Cartes en attente de relevé : elles affichent le glyphe de chargement.
  let pending: ReadonlySet<string> = new Set();
  // Cartes de la Collection : elles affichent leur case de prix (« ??? » tant que rien n'est observé).
  let owned: ReadonlySet<string> = new Set();
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
        syncRefreshButton(collector, {
          getFilter: () => filterSource.current(),
          onUpdate: () => void refreshHistory(),
        });
      } catch (error) {
        console.warn(LOG, 'bouton de rechargement indisponible :', error);
      }
      try {
        pruneListenSections();
        // La section « Écouter » ne se pose que si Spotify est disponible sur cette plateforme.
        if (getMusicService()) decorateListen(document, mountListenSection);
      } catch (error) {
        console.warn(LOG, 'section « Écouter » indisponible :', error);
      }
      try {
        pruneScreenSections();
        // La section film / série ne se pose que si TMDB est configuré (clé à la compilation).
        if (getScreenService()) decorateScreen(document, mountScreenSection);
      } catch (error) {
        console.warn(LOG, 'section film / série indisponible :', error);
      }
      try {
        syncCardArt(document, images);
      } catch (error) {
        console.warn(LOG, 'images de remplacement indisponibles :', error);
      }
      try {
        pruneImageSections();
        decorateImage(document, mountImageSection);
        decorateImageSetting(document, () => openImageSettings(images));
      } catch (error) {
        console.warn(LOG, 'réglage des images indisponible :', error);
      }
      try {
        decorateLoading(document, pending, mountLoadingGlyph);
      } catch (error) {
        console.warn(LOG, 'glyphe de chargement indisponible :', error);
      }
      try {
        decorateHistory(
          document,
          (slug) => cardsForSlug(history, slug),
          Date.now(),
          mountHistoryBadge,
          (slug) => owned.has(slug),
        );
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
        market.update({ history: state });
        run();
      },
      (error) => console.warn(LOG, 'historique du marché illisible :', error),
    );
  void refreshHistory();
  const refreshOwned = () =>
    collectionRepo.list().then(
      (cards) => {
        owned = new Set(cards.map((card) => card.slug));
        run();
      },
      (error) => console.warn(LOG, 'collection illisible :', error),
    );
  void refreshOwned();
  collectionRepo.subscribe(() => void refreshOwned());
  // Image trouvée, écartée ou option changée : la page se redécore.
  images.subscribe(run);
  const refreshPending = () =>
    collector.pendingSlugs().then(
      (slugs) => {
        pending = slugs;
        market.update({ pending: slugs });
        run();
      },
      (error) => console.warn(LOG, 'cartes en attente illisibles :', error),
    );
  collector.subscribe(() => void refreshPending());
  historyRepo.subscribe(() => void refreshHistory());

  run();

  // Spotify : télécommande de l'appli Spotify (voir la spec). Absent si la plateforme ne le fournit pas.
  // Après le démarrage de la surcouche : une panne ici ne doit jamais l'empêcher.
  if (spotify) {
    try {
      const session = createSpotifySession({ store, ...spotify });
      const spotifyApi = createSpotifyApi({ session, fetch: spotify.fetch });
      const musicRepo = createMusicRepo(store, (slugs) => fetchWikidataMusic((url) => fetch(url), slugs));
      artSources.spotify = { api: spotifyApi, session, music: musicRepo };
      const player = createPlayerSource({ api: spotifyApi, session, storage: window.localStorage });
      setMusicService(
        createMusicService({
          collection: collectionRepo,
          kinds: kindsRepo,
          music: musicRepo,
          session,
          api: spotifyApi,
          onPlayed: () => void player.refresh(),
          ...(spotify.launchApp ? { launchApp: spotify.launchApp } : {}),
        }),
      );
      setPlayerSource(player);
      mountSpotifyPlayer(player);
      player.start();
    } catch (error) {
      console.warn(LOG, 'Spotify indisponible :', error);
    }
  }

  // Films, séries, acteurs et réalisateurs (TMDB) : absent sans clé. TMDB passe par le même `fetch` que Spotify
  // (service worker dans l'extension, `window.fetch` dans l'APK). Une panne ici ne doit jamais empêcher la surcouche.
  if (TMDB_API_KEY) {
    try {
      const tmdbApi = createTmdbApi({ fetch: (url) => (spotify ? spotify.fetch(url) : fetch(url)), apiKey: TMDB_API_KEY });
      artSources.tmdb = tmdbApi;
      setScreenService(
        createScreenService({
          hasKey: true,
          collection: collectionRepo,
          kinds: kindsRepo,
          screen: createScreenRepo(store, (slugs) => fetchWikidataScreen((url) => fetch(url), slugs)),
          api: tmdbApi,
          cache: createTtlCache(store, { ttlMs: 24 * 3_600_000 }),
        }),
      );
    } catch (error) {
      console.warn(LOG, 'films et séries indisponibles :', error);
    }
  }

  // Relevé du marché : seulement les cartes de la Collection affichées à l'écran (une recherche par titre,
  // une fois par carte et par 30 min). Il se poursuit d'une page à l'autre quand l'utilisateur navigue.
  const tick = () => void collector.tick().catch((error) => console.warn(LOG, 'relevé du marché :', error));
  tick();
  window.setInterval(tick, 60_000);
  document.addEventListener('visibilitychange', tick);
  // La page se décharge : on libère le relevé en cours pour que la page suivante le reprenne aussitôt.
  window.addEventListener('pagehide', () => void collector.release());
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    collector.activate();
    tick();
  });

  // Une recherche demandée depuis une fiche reprend ici, sur la page Marché.
  if (window.location.pathname.startsWith('/marketplace')) {
    const pending = takePendingSearch(window.sessionStorage, Date.now());
    if (pending) marketUi.resumeSearch(pending);
  } else {
    // Retour depuis le marché : la fiche de la carte se rouvre ici.
    const reopen = takePendingReopen(window.sessionStorage, Date.now());
    if (reopen) void marketUi.reopenCard(reopen);
  }
}
