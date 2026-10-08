import { createGameApi } from '../core/api/game-api';
import type { KeyValueStore } from '../core/cache/store';
import { createTtlCache } from '../core/cache/ttl-cache';
import { createDataSource } from '../core/data-source';
import { createCollectionRepo } from '../core/collection/collection-repo';
import { sortCards } from '../core/collection/homemade-page';
import { createCollectionScanner } from '../core/collection/collection-scan';
import { fetchWikiCoords } from '../core/geo/wiki-coords';
import { fetchWikidataDates } from '../core/birth/wikidata-birth';
import { createBirthRepo } from '../core/birth/birth-repo';
import { createGeoRepo } from '../core/geo/geo-repo';
import { fetchBacklinks, fetchLeadLinks } from '../core/links/wiki-links';
import { createLinksRepo } from '../core/links/links-repo';
import { fetchWikidataKinds } from '../core/kinds/wikidata-kinds';
import { createKindsRepo } from '../core/kinds/kinds-repo';
import { createSortSource } from '../content/sort-source';
import { asOwnRequest } from '../content/market-tap';
import { createKindFilterSource } from '../content/kind-filter';
import { createCollectionFilterSource } from '../content/collection-filter';
import { createLibraryRepo } from '../core/library/library-repo';
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
import { decorateAuctionLink } from '../content/auction-link';
import { showAuctionsEndingSoon, takePendingAuctionSearch } from '../content/auction-search';
import { decorateMarketLinks } from '../content/market-link';
import { CARDS_MESSAGE, HELLO_MESSAGE, MARKET_MESSAGE, MARKET_WRITE_MESSAGE, MINE_MESSAGE, MOVEMENT_MESSAGE } from '../content/market-messages';
import { extractCards } from '../core/api/collection-schemas';
import { createMineApplier } from '../core/collection/mine-apply';
import { createMarketUi, mountHistoryBadge, mountImageSection, mountLinkedCards, mountListenSection, openAnomalyDialog, closeOpenWindows, openWhatsNew, openWikiHow, openExtensionSettings, pruneImageSections, pruneLinkedCards, mountLoadingGlyph, mountPurchaseBadge, mountGameSection, mountBookSection, pruneBookSections, mountDocumentarySection, pruneDocumentarySections, mountScreenSection, pruneGameSections, pruneListenSections, pruneScreenSections, syncRefreshButton } from '../content/mount';
import { decorateBook, decorateDocumentary, decorateGame, decorateImage, decorateListen, decorateScreen } from '../content/decorate-listen';
import { getBookService, setBookService } from '../content/book-registry';
import { getDocumentaryService, setDocumentaryService } from '../content/documentary-registry';
import { createDocumentaryService } from '../content/documentary-service';
import { createRelayApi } from '../core/documentary/relay-api';
import { searchCommons } from '../core/documentary/commons-api';
import { parseSelection } from '../core/documentary/selection';
import { SELECTION_URL } from '../core/documentary/config';
import { fetchSubject } from '../core/documentary/subject';
import { createDocumentaryRepo } from '../core/documentary/documentary-repo';
import { createBookService } from '../content/book-service';
import { createAmazonPrice } from '../core/book/amazon-price';
import { createBookChoiceRepo, createBookRepo } from '../core/book/book-repo';
import { AMAZON_PRICE_ENABLED } from '../core/book/config';
import { createGoogleBooksApi } from '../core/book/google-books-api';
import type { NativeHttpWindow } from '../android/native-http';
import { createOpenLibraryApi } from '../core/book/openlibrary-api';
import { createArchiveApi } from '../core/book/archive-api';
import { fetchWriterWorks } from '../core/book/writer-works';
import { createWikisourceApi } from '../core/book/wikisource-api';
import { fetchWikidataBook } from '../core/book/wikidata-book';
import { fetchWikipediaIntro } from '../core/book/wikipedia-intro';
import { takePendingSearch } from '../content/pending-search';
import { takePendingReopen } from '../content/return-target';
import { createListenRepo } from '../core/music/listen-repo';
import { createMusicRepo } from '../core/music/music-repo';
import { fetchWikidataMusic } from '../core/music/wikidata-music';
import { createSpotifyApi } from '../core/spotify/spotify-api';
import { migrateClientId } from '../core/spotify/client-id';
import { createSpotifySession } from '../core/spotify/spotify-session';
import type { SpotifyEnv } from '../core/spotify/transport';
import { createMusicService } from '../content/music-service';
import { getMusicService, getPlayerSource, setMusicService, setPlatformChoice, setPlayerSource, setSpotifyKey } from '../content/music-registry';
import { createPlatformSetting } from '../core/music/platform';
import { createPlatformMusicService } from '../content/platform-service';
import { createTidalService } from '../content/tidal-service';
import { countryOf } from '../core/tidal/config';
import { createTidalApi } from '../core/tidal/tidal-api';
import { createTidalSession } from '../core/tidal/tidal-session';
import { createPlayerSource } from '../content/player-source';
import { mountSpotifyPlayer } from '../content/mount-player';
import { openCardInPage } from '../content/open-card';
import { decorateLinked } from '../content/decorate-linked';
import { createLinkedSource } from '../content/linked-source';
import { setLinkedService } from '../content/linked-registry';
import { openLinkedCard } from '../content/open-linked-card';
import { createScreenRepo } from '../core/screen/screen-repo';
import { createTmdbApi } from '../core/screen/tmdb-api';
import { fetchWikidataScreen } from '../core/screen/wikidata-screen';
import { createScreenService } from '../content/screen-service';
import { createGameService } from '../content/game-service';
import { getGameService, setGameService } from '../content/game-registry';
import type { GameFetch } from '../core/game/game-detail';
import { createGameChoiceRepo, createGameRepo } from '../core/game/game-repo';
import { createIgdbApi } from '../core/game/igdb-api';
import { createSteamApi } from '../core/game/steam-api';
import { fetchWikidataGame } from '../core/game/wikidata-game';
import { createCollectionMarks } from '../content/collection-marks';
import { setCollectionMarks } from '../content/collection-marks-registry';
import { getScreenService, setScreenService } from '../content/screen-registry';
import { createMediaArt, type MediaArt, type MediaArtSources } from '../content/media-art';
import { createImageService } from '../core/images/image-service';
import { searchCardImages } from '../core/images/card-image-search';
import { setImageService } from '../content/image-registry';
import { syncCardArt } from '../content/card-art';
import { decorateExtensionSetting } from '../content/extension-setting-menu';
import { syncPurchaseOffers } from '../content/purchase-offers';
import { createPurchaseAds } from '../core/ads/purchase-ads';
import { decorateWikiHowSetting } from '../content/wikihow-menu';
import { decorateUpdateSetting } from '../content/update-setting-menu';
import { decorateAnomalySetting } from '../content/anomaly-setting-menu';
import { createWhatsNewRepo } from '../core/whats-new/seen';
import { ENTRIES, SPOTIFY_KEY_GUIDE } from '../core/whats-new/entries';
import { FIXES } from '../core/whats-new/fixes';
import { showPendingWhatsNew } from '../content/whats-new-flow';
import { pickCard } from '../core/whats-new/pick-card';
import { setTourEnv } from '../content/tour-registry';
import { resumeTour, resumeTourReturn, startTour } from '../content/tour-instance';
import type { TourOrigin } from '../content/tour-session';
import { createAnomalyReporter, postIssue } from '../core/anomalies/anomaly';
import { getProfileName, rememberProfileName } from '../core/anomalies/profile-name';
import { createTelemetry } from '../core/telemetry/telemetry';
import { setTelemetry } from '../core/telemetry/registry';
import { telemetryEnvironment } from '../core/telemetry/environment';
import { observeFetch } from '../core/telemetry/fetch-observer';
import { TELEMETRY_ENDPOINT, USAGE_STATS_DEFAULT } from '../core/telemetry/config';

const LOG = '[wikimasters-tools]';
const DEBOUNCE_MS = 300;

// Surcouche Wikimasters : partagée par l'extension (content script) et l'application Android (WebView).
export async function startOverlay(store: KeyValueStore, spotify?: SpotifyEnv): Promise<void> {
  // Mesure d'usage anonyme (voir docs/superpowers/specs/2026-10-08-monitoring-usage-design.md).
  const rawFetch = window.fetch.bind(window);
  const { platform, channel } = telemetryEnvironment(window as unknown as { WmtSpotify?: { scheme?(): string } });
  const telemetry = createTelemetry({
    storage: window.localStorage,
    send: (body) => void rawFetch(TELEMETRY_ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'text/plain' }, keepalive: true }).catch(() => undefined),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    platform,
    channel,
    version: __WMT_BUILD__,
    defaultEnabled: USAGE_STATS_DEFAULT,
  });
  setTelemetry(telemetry);
  window.fetch = observeFetch(rawFetch, (name, service) => telemetry.reportError(name, service));
  window.addEventListener('error', () => telemetry.reportError('js-erreur'));
  window.addEventListener('unhandledrejection', () => telemetry.reportError('js-erreur'));
  telemetry.start({
    every: (run, ms) => void window.setInterval(run, ms),
    onHide: (run) => {
      window.addEventListener('pagehide', run);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && run());
    },
  });
  const whatsNew = createWhatsNewRepo(store);
  // Fin de visite : on rouvre l'interface qui l'avait lancée (WikiHow, ou la liste « Quoi de neuf » avec les mêmes éléments).
  const reopenStart = async (from: TourOrigin): Promise<void> => {
    if (from.kind === 'wikihow') return openWikiHowFromStore();
    const entries = ENTRIES.filter((entry) => from.entries.includes(entry.id));
    const fixes = FIXES.filter((fix) => from.fixes.includes(fix.id));
    if (entries.length === 0 && fixes.length === 0) return;
    openWhatsNew({ entries, fixes, consulted: [...(await whatsNew.consulted())], onConsult: (id) => void whatsNew.markConsulted(id) });
  };
  const openWikiHowFromStore = async () =>
    openWikiHow({ entries: ENTRIES, consulted: [...(await whatsNew.consulted())], onConsult: (id) => void whatsNew.markConsulted(id) });
  const api = createGameApi({
    fetch: (input, init) => asOwnRequest(() => fetch(input, { credentials: 'same-origin', ...init })),
    minIntervalMs: 1500,
  });
  // Lecture des cartes filtrées : action de l'utilisateur, on peut espacer moins les pages (le 429 est géré).
  const filterApi = createGameApi({
    fetch: (input, init) => asOwnRequest(() => fetch(input, { credentials: 'same-origin', ...init })),
    minIntervalMs: 400,
  });
  const dataSource = createDataSource({ api, cache: createTtlCache(store), store });
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
    // Quand la page affichée est à jour : toute la Collection connue, sans filtre, dans l'ordre par défaut du site.
    background: async () => sortCards(await collectionRepo.list()).map(({ slug, title }) => ({ slug, title })),
  });

  console.info(LOG, 'démarré');

  // Les anomalies passent par le relais Cloudflare, qui détient le jeton GitHub.
  const anomalies = createAnomalyReporter({ fetch: (url, init) => fetch(url, init) });
  const anomalyPlatform = (): string => {
    const bridge = (window as unknown as { WmtSpotify?: { scheme?(): string } }).WmtSpotify;
    if (!bridge) return 'extension du navigateur';
    return bridge.scheme?.()?.includes('preprod') ? 'application Android (pré-production)' : 'application Android';
  };

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
  // Ventes, échanges et gains aux enchères : la Collection suit au fil de l'eau, sans nouveau parcours.
  const scanner = createCollectionScanner({ api, collection: collectionRepo, store });
  const mineApplier = createMineApplier({ store, collection: collectionRepo });
  window.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown; selling?: unknown; history?: unknown; won?: unknown } | null;
    if (event.source !== window || data?.type !== MINE_MESSAGE) return;
    mineApplier
      .apply({ selling: data.selling, history: data.history, won: data.won })
      .catch((error) => console.warn(LOG, 'mouvements de la collection non appliqués :', error));
  });
  // Une vente conclue, ou revenue sans acheteur, hors de la page Marché (autre appareil, application fermée) ne passe par aucune réponse du site :
  // on relit « mes enchères » nous-mêmes à l'ouverture et au retour dans l'application (au plus une fois par minute).
  const MINE_REFRESH_MS = 60_000;
  let mineReadAt = 0;
  const refreshMine = (immediate = false): void => {
    if (!immediate && Date.now() - mineReadAt < MINE_REFRESH_MS) return;
    mineReadAt = Date.now();
    api
      .getMineRaw()
      .then((json) => {
        const mine = json as { selling?: unknown; history?: unknown; won?: unknown } | null;
        // Prix d'achat : un achat de la dernière heure n'est pas dans le cache de 12 h, on l'ajoute puis on redécore.
        dataSource
          .ingestMine(json)
          .then((next) => {
            current = next;
            run();
          })
          .catch((error) => console.warn(LOG, 'prix non mis à jour :', error));
        return mineApplier.apply({ selling: mine?.selling, history: mine?.history, won: mine?.won });
      })
      .catch((error) => console.warn(LOG, 'mes enchères non relues :', error));
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshMine();
  });
  refreshMine();
  // Mise en vente (ou autre écriture sur le marché) : la carte quitte la Collection tout de suite, sans attendre un retour dans l'application.
  window.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown } | null;
    if (event.source !== window || data?.type !== MARKET_WRITE_MESSAGE) return;
    refreshMine(true);
  });
  // Un échange conclu : on ne sait pas encore quelles cartes ont bougé, le parcours complet (en fond) le dira.
  window.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown } | null;
    if (event.source !== window || data?.type !== MOVEMENT_MESSAGE) return;
    void scanner.run({ force: true });
  });
  const filterSource = createCollectionFilterSource(window);
  window.postMessage({ type: HELLO_MESSAGE }, window.location.origin);

  // Le lien du marché ne dépend pas de vos prix : on ne l'abandonne pas si ceux-ci échouent.
  let current: PriceBook | null = null;
  try {
    current = await dataSource.getMyPriceBook();
  } catch (error) {
    // Déconnecté, 429, format modifié… : pas de badge de prix plutôt que casser la page.
    console.warn(LOG, 'prix indisponibles :', error);
  }

  // Le carnet change quand « mes enchères » est relu (un achat tout récent) : les écrans lisent toujours le dernier.
  const book: PriceBook = { byTitle: (title) => current?.byTitle(title) ?? null };

  const marketUi = createMarketUi(marketRepo, historyRepo);
  // Bouton « Carte » du lecteur : la fiche de la carte dont vient la lecture, depuis n'importe quelle page.
  const openPlayerCard = (slug: string) => openCardInPage(slug, (target) => void marketUi.reopenCard(target));
  // Visite guidée : elle cherche une vraie carte de la Collection (jeu, musique, film), l'ouvre, puis la referme à la fin.
  setTourEnv({
    cards: () => collectionRepo.list(),
    pick: (kind, cards) =>
      pickCard(
        kind,
        cards,
        async (nature, candidates) =>
          (nature === 'game'
            ? await getGameService()?.gameSlugs(candidates)
            : nature === 'book'
              ? await getBookService()?.bookSlugs(candidates)
              : nature === 'music'
                ? await getMusicService()?.musicSlugs(candidates)
                : await getScreenService()?.screenSlugs(candidates)) ?? new Set<string>(),
      ),
    openCard: openPlayerCard,
    closeCard: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    closeWindows: closeOpenWindows,
    reopen: (from) => void reopenStart(from),
  });
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
    // Wikipédia et Commons ; la pochette Spotify / l'affiche TMDB passe toujours devant, l'artiste / l'affiche la plus proche en dernier recours.
    search: (title, skip) => searchCardImages((url) => fetch(url), title, skip),
    art: (title, slug) => mediaArt.primary(slug, title),
    fallback: (title, slug) => mediaArt.fallback(slug, title),
    gameArt: (title, slug) => mediaArt.game(slug, title),
    settings: window.localStorage,
  });
  setImageService(images);
  // « Publicité d'achat » : désactivée par défaut, les offres en argent réel du site sont masquées.
  const purchaseAds = createPurchaseAds(window.localStorage);
  // Liens des articles Wikipédia entre cartes (introduction de chaque article, 50 articles par requête) : requêtes sans identifiants,
  // seuls les titres partent. Une réponse qui n'arrive pas ne doit pas arrêter toute la lecture : au bout de 20 s, la requête est abandonnée.
  const linksRepo = createLinksRepo(
    store,
    (slugs) => fetchLeadLinks((url) => fetch(url, { signal: AbortSignal.timeout(20_000) }), slugs),
    undefined,
    undefined,
    undefined,
    (slugs) => fetchBacklinks((url) => fetch(url, { signal: AbortSignal.timeout(20_000) }), slugs),
  );
  // Bloc « Cartes liées » de la fiche d'une carte : les cartes de la Collection à un saut, les plus consultées d'abord.
  setLinkedService({
    source: createLinkedSource({ collection: collectionRepo, links: linksRepo }),
    open: (from, slug) => void openLinkedCard(from, slug, (target) => openCardInPage(target, (reopen) => void marketUi.reopenCard(reopen))),
  });
  const collectionUi = createCollectionUi({
    collection: collectionRepo,
    geo: createGeoRepo(store, (slug) => fetchWikiCoords((url) => fetch(url), slug)),
    birth: createBirthRepo(store, (slugs) => fetchWikidataDates((url) => fetch(url), slugs)),
    library: createLibraryRepo(store),
    kinds: kindsRepo,
    links: linksRepo,
    kindFilterSource: createKindFilterSource(window.localStorage),
    scanner,
    book,
    filterSource,
    sortSource: createSortSource(),
    loadFiltered: (filter, isCancelled) => loadFilteredSlugs(filterApi, filter, isCancelled),
    openCard: (slug) => marketUi.openMarket(slug),
    openGameCard: (slug) => void marketUi.reopenCard(slug),
    openRoomCard: openPlayerCard,
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
  let sortMenuFrame = 0;
  const observer = new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, DEBOUNCE_MS);
    // La liste de tri se complète tout de suite (image suivante), pas après le délai des autres vues.
    if (sortMenuFrame === 0) {
      sortMenuFrame = window.requestAnimationFrame(() => {
        sortMenuFrame = 0;
        try {
          collectionUi.syncSortMenu();
        } catch (error) {
          console.warn(LOG, 'liste de tri indisponible :', error);
        }
      });
    }
  });

  function run() {
    // On se déconnecte pendant nos propres insertions pour éviter une boucle.
    observer.disconnect();
    try {
      const links = decorateMarketLinks(document, marketUi.mountLink);
      try {
        decorateAuctionLink(document, marketUi.mountAuctionLink);
      } catch (error) {
        console.warn(LOG, 'lien des enchères de la carte indisponible :', error);
      }
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
        pruneGameSections();
        // La section jeu vidéo se pose dès que son service est créé (Steam n'a besoin d'aucune clé).
        if (getGameService()) decorateGame(document, mountGameSection);
      } catch (error) {
        console.warn(LOG, 'section jeu vidéo indisponible :', error);
      }
      try {
        pruneBookSections();
        // La section livre se pose dès que son service est créé (Open Library et Wikipédia n'ont besoin d'aucune clé).
        if (getBookService()) decorateBook(document, mountBookSection);
      } catch (error) {
        console.warn(LOG, 'section livre indisponible :', error);
      }
      try {
        pruneDocumentarySections();
        // La section documentaire se pose dès que son service est créé (relais, Commons et Wikidata n'ont besoin d'aucune clé dans l'extension).
        if (getDocumentaryService()) decorateDocumentary(document, mountDocumentarySection);
      } catch (error) {
        console.warn(LOG, 'section documentaire indisponible :', error);
      }
      try {
        pruneLinkedCards();
        decorateLinked(document, mountLinkedCards);
      } catch (error) {
        console.warn(LOG, 'cartes liées indisponibles :', error);
      }
      try {
        syncCardArt(document, images);
      } catch (error) {
        console.warn(LOG, 'images de remplacement indisponibles :', error);
      }
      try {
        pruneImageSections();
        decorateImage(document, mountImageSection);
        // « Paramètre d'extension » regroupe Images et Lecteur (le lecteur n'existe que si Spotify est fourni par la plateforme).
        collectionUi.decorateMenu(document);
        decorateExtensionSetting(document, () => openExtensionSettings(images, getPlayerSource() ?? null, purchaseAds, telemetry));
        syncPurchaseOffers(document, () => !purchaseAds.enabled());
        decorateWikiHowSetting(document, () => void openWikiHowFromStore());
        const player = getPlayerSource();
        if (player) {
          // Le site a pu vider <body> depuis le montage : le lecteur y est remis.
          mountSpotifyPlayer(player, openPlayerCard);
        }
        // Application Android seulement : le pont natif expose la vérification de la mise à jour.
        const updateBridge = (window as unknown as { WmtUpdate?: { check(): void } }).WmtUpdate;
        if (updateBridge) decorateUpdateSetting(document, () => updateBridge.check());
        // « Remonter une anomalie » : absent sans jeton GitHub (compilation sans `.env.local`).
        if (anomalies) decorateAnomalySetting(document, () => openAnomalyDialog({ profileName: getProfileName(window.localStorage), send: (description, name) => anomalies.report({ description, name, platform: anomalyPlatform() }) }));
        rememberProfileName(document, window.localStorage);
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
      if (current) {
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
  purchaseAds.subscribe(run);
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

  // Identifiants TMDB des cartes, partagés par la fiche film/série et par la lecture (BO d'un film en cours).
  const screenRepo = createScreenRepo(store, (slugs) => fetchWikidataScreen((url) => fetch(url), slugs));

  // Spotify : télécommande de l'appli Spotify (voir la spec). Absent si la plateforme ne le fournit pas.
  // Après le démarrage de la surcouche : une panne ici ne doit jamais l'empêcher.
  if (spotify) {
    try {
      await migrateClientId(store);
      const session = createSpotifySession({ store, ...spotify });
      const spotifyApi = createSpotifyApi({ session, fetch: spotify.fetch, store, ...(spotify.deviceTypes ? { deviceTypes: spotify.deviceTypes } : {}) });
      const musicRepo = createMusicRepo(store, (slugs) => fetchWikidataMusic((url) => fetch(url), slugs));
      artSources.spotify = { api: spotifyApi, session, music: musicRepo };
      const player = createPlayerSource({ api: spotifyApi, session, storage: window.localStorage });
      const spotifyService = createMusicService({
          collection: collectionRepo,
          kinds: kindsRepo,
          music: musicRepo,
          listens: createListenRepo(store),
          soundtracks: createListenRepo(store, undefined, 'soundtracks-v1'),
          screen: screenRepo,
          session,
          api: spotifyApi,
          onPlayed: (card) => {
            if (card) player.setCard(card);
            void player.refresh();
          },
          ...(spotify.launchApp ? { launchApp: spotify.launchApp } : {}),
        });
      const platformSetting = createPlatformSetting(window.localStorage);
      setMusicService(spotifyService);
      setPlayerSource(player);
      setPlatformChoice({ available: ['spotify'], setting: platformSetting });
      setSpotifyKey({
        clientId: () => session.clientId(),
        setClientId: (value) => session.setClientId(value),
        clearClientId: () => session.clearClientId(),
        redirectUris: async () => [await spotify.redirectUri()],
        openGuide: () => startTour([SPOTIFY_KEY_GUIDE]),
        subscribe: (listener) => session.subscribe(listener),
      });
      mountSpotifyPlayer(player, openPlayerCard);
      player.start();

      // Tidal : seconde plateforme d'écoute, au choix (jamais mélangée à Spotify). Une panne ici laisse Spotify intact.
      try {
        const tidalSession = createTidalSession({
          store,
          fetch: spotify.fetch,
          authorize: spotify.authorize,
          redirectUri: spotify.redirectUriFor ? () => spotify.redirectUriFor!('tidal') : spotify.redirectUri,
        });
        const tidalApi = createTidalApi({ session: tidalSession, fetch: spotify.fetch, store, countryCode: countryOf(navigator.language) });
        const tidalService = createTidalService({
          collection: collectionRepo,
          kinds: kindsRepo,
          music: musicRepo,
          listens: createListenRepo(store, undefined, 'listens-tidal-v1'),
          soundtracks: createListenRepo(store, undefined, 'soundtracks-tidal-v1'),
          session: tidalSession,
          api: tidalApi,
        });
        setMusicService(createPlatformMusicService(platformSetting, { spotify: spotifyService, tidal: tidalService }, spotifyService));
        setPlatformChoice({ available: ['spotify', 'tidal'], setting: platformSetting });
      } catch (error) {
        console.warn(LOG, 'Tidal indisponible :', error);
      }
    } catch (error) {
      console.warn(LOG, 'Spotify indisponible :', error);
    }
  }

  // Films, séries, acteurs et réalisateurs (TMDB) via le relais (la clé est côté serveur, CORS ouvert : `fetch` de la page).
  // Une panne ici ne doit jamais empêcher la surcouche.
  try {
    const tmdbApi = createTmdbApi({ fetch: (url) => fetch(url) });
    artSources.tmdb = tmdbApi;
    const screenService = createScreenService({
      hasKey: true,
      collection: collectionRepo,
      kinds: kindsRepo,
      screen: screenRepo,
      api: tmdbApi,
      cache: createTtlCache(store, { ttlMs: 24 * 3_600_000 }),
    });
    setScreenService(screenService);
    // Repère, dans les filmographies, les films et séries dont on possède la carte.
    setCollectionMarks(createCollectionMarks({ collection: collectionRepo, screen: screenRepo, screenSlugs: (cards) => screenService.screenSlugs(cards) }));
  } catch (error) {
    console.warn(LOG, 'films et séries indisponibles :', error);
  }

  // Jeux vidéo : Steam sans clé, IGDB via le relais (aucun identifiant dans le client). Même `fetch` que TMDB
  // (service worker dans l'extension, pont natif dans l'APK). Une panne ici ne doit jamais empêcher la surcouche.
  try {
    const gameFetch: GameFetch = (url, init) => (spotify ? spotify.fetch(url, init) : fetch(url, init));
    const gameService = createGameService({
      collection: collectionRepo,
      kinds: kindsRepo,
      games: createGameRepo(store, (slugs) => fetchWikidataGame((url) => fetch(url), slugs)),
      choices: createGameChoiceRepo(store),
      steam: createSteamApi({ fetch: gameFetch }),
      igdb: createIgdbApi({ fetch: (url, init) => fetch(url, init) }),
      steamCache: createTtlCache(store, { ttlMs: 6 * 3_600_000 }),
      igdbCache: createTtlCache(store, { ttlMs: 7 * 24 * 3_600_000 }),
      // Autre jeu choisi pour une carte : son affiche mémorisée n'est plus la bonne.
      onChoice: (slug) => void images.forgetGameArt(slug),
    });
    setGameService(gameService);
    // Affiches des jeux vidéo : même mécanisme que les pochettes d'albums et les affiches de films.
    artSources.game = gameService;
  } catch (error) {
    console.warn(LOG, 'jeux vidéo indisponibles :', error);
  }

  // Livres : Open Library et Wikipédia, sans clé, avec le `fetch` de la page (CORS ouvert). Une panne ici ne doit jamais empêcher la surcouche.
  try {
    // Prix : Amazon.fr (papier) passe par le relais de la plateforme (service worker,
    // hors CSP du site). Amazon : extension seulement, jamais dans l'APK (pas de pont HTTP éprouvé pour une page HTML : liens seulement).
    const platformFetch = (url: string) => (spotify ? spotify.fetch(url) : fetch(url));
    const isApk = Boolean((window as unknown as NativeHttpWindow).WmtHttp);
    const googleBooks = createGoogleBooksApi({ fetch: (url) => fetch(url) });
    const amazon = AMAZON_PRICE_ENABLED && spotify && !isApk ? createAmazonPrice({ fetch: platformFetch }) : null;
    const bookService = createBookService({
      googleBooks,
      amazon,
      collection: collectionRepo,
      kinds: kindsRepo,
      books: createBookRepo(store, (slugs) => fetchWikidataBook((url) => fetch(url), slugs)),
      choices: createBookChoiceRepo(store),
      openLibrary: createOpenLibraryApi({ fetch: (url) => fetch(url) }),
      // Lecture gratuite : Wikisource FR et Internet Archive, avec le `fetch` de la page (CORS ouvert), comme Open Library.
      wikisource: createWikisourceApi({ fetch: (url) => fetch(url) }),
      archive: createArchiveApi({ fetch: (url) => fetch(url) }),
      // Bibliographie des écrivains : Wikidata (requête SPARQL), avec le `fetch` de la page (CORS ouvert).
      writerWorks: (slug) => fetchWriterWorks((url) => fetch(url), slug),
      intro: (slug) => fetchWikipediaIntro((url) => fetch(url), slug),
      cache: createTtlCache(store, { ttlMs: 7 * 24 * 3_600_000 }),
      // Autre livre choisi pour une carte : son image mémorisée (canal d'image « officiel » des jeux) n'est plus la bonne.
      onChoice: (slug) => void images.forgetGameArt(slug),
    });
    setBookService(bookService);
    artSources.book = bookService;
    // Couverture des livres : même canal d'image « officiel » que les affiches de jeux (elle passe devant l'image Wikipédia).
    // Le jeu répond d'abord (liste vide pour une carte qui n'est pas un jeu) ; `null` = pas prêt, on redemandera.
    const gameArt = artSources.game;
    artSources.game = {
      async cover(slug, title) {
        const games = gameArt ? await gameArt.cover(slug, title) : [];
        if (games === null || games.length > 0) return games;
        return bookService.cover(slug, title);
      },
    };
  } catch (error) {
    console.warn(LOG, 'livres indisponibles :', error);
  }

  // Documentaires (événements et personnages historiques) : relais Cloudflare, Commons et sélection du dépôt, avec le `fetch` de la page (CORS ouvert).
  try {
    const issueFetch = (url: string, init?: RequestInit) => fetch(url, init);
    setDocumentaryService(
      createDocumentaryService({
        collection: collectionRepo,
        kinds: kindsRepo,
        subject: (slug) => fetchSubject((url) => fetch(url), slug),
        selection: {
          forQid: async (qid) => {
            const response = await fetch(SELECTION_URL);
            if (!response.ok) throw new Error(`Sélection : HTTP ${response.status}`);
            return parseSelection(await response.json(), qid);
          },
        },
        commons: { search: (names, subject) => searchCommons((url) => fetch(url), names, subject) },
        relay: createRelayApi({ fetch: (url) => fetch(url) }),
        repo: createDocumentaryRepo(store),
        issues: { send: (draft) => postIssue(issueFetch, draft) },
        cache: createTtlCache(store, { ttlMs: 7 * 24 * 3_600_000 }),
        platform: anomalyPlatform,
        profileName: () => getProfileName(window.localStorage),
      }),
    );
  } catch (error) {
    console.warn(LOG, 'documentaires indisponibles :', error);
  }

  // Relevé du marché : les cartes de la Collection affichées à l'écran d'abord, puis en fond le reste de la
  // Collection (une recherche par titre, une fois par carte et par 30 min). Il se poursuit d'une page à l'autre
  // quand l'utilisateur navigue.
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
    const auctions = takePendingAuctionSearch(window.sessionStorage, Date.now());
    if (auctions) void showAuctionsEndingSoon(document, auctions);
  } else {
    // Retour depuis le marché : la fiche de la carte se rouvre ici.
    const reopen = takePendingReopen(window.sessionStorage, Date.now());
    if (reopen) void marketUi.reopenCard(reopen);
  }

  // Après une mise à jour : nouveautés et corrections jamais annoncées (rien au premier lancement).
  // Une visite guidée en cours (changement de page) reprend d'abord, puis le retour à l'interface de départ ; sinon, les nouveautés jamais annoncées.
  if (!resumeTour() && !resumeTourReturn()) void showPendingWhatsNew(whatsNew, ENTRIES, FIXES, openWhatsNew).catch((error) => console.warn(LOG, 'nouveautés indisponibles :', error));
}
