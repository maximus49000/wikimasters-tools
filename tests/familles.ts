// Familles de tests : chaque fichier de test appartient à UNE famille (tests/familles.test.ts le vérifie).
// Pendant un développement, on ne joue que les familles touchées : `npm run test:famille -- fiche toile`
// (un nom = une famille ; `scene-*` = toute la scène). La suite entière (TNR global) : `npm test`.
//
// La scène (vue « Ma Pièce » : pièce, ville, Ghibli, animaux, commerces…) est découpée en sous-familles « scene-… » :
// on ne joue que celles qu'un développement impacte. Toucher `scene-commun` (moteur partagé) ⇒ toute la scène.
// Ses tests simulent des journées entières : ils ont un délai long et passent APRÈS les autres familles en TNR global
// (sinon les deux se disputent le processeur et les tests de la scène dépassent leur délai).

export interface Famille {
  nom: string;
  /** Motifs relatifs à la racine du dépôt. */
  fichiers: string[];
  /** Tests lourds (simulations de journées) : délai long, joués après les autres. */
  lourde?: boolean;
}

const c = (...noms: string[]): string[] => noms.map((n) => `tests/content/${n}`);
const lib = (...noms: string[]): string[] => noms.map((n) => `tests/core/library/${n}`);

export const FAMILLES: Famille[] = [
  // ---------- Hors scène ----------
  {
    nom: 'fiche',
    fichiers: [
      ...c(
        'Book*', 'book-service.*', 'Game*', 'game-service.*', 'game-box-service.*', 'Writer*', 'WatchProviders.*', 'HlsTrailerPlayer.*', 'fullscreen.*',
        'documentary-*', 'screen-*', 'platform-service.*', 'use-platform.*', 'work-list.*', 'orientation-lock.*',
        'card-art.*', 'card-frame.*', 'card-preview-dom.*', 'card-popup-position.*', 'card-thumb.*', 'media-art.*', 'image-probe.*', 'cover-cache.*', 'cover-versions.*',
      ),
      'tests/core/{book,game,documentary,screen,images,birth,geo}/**',
    ],
  },
  {
    nom: 'collection',
    fichiers: [
      ...c(
        'collection-*', 'collector-wiring.*', 'card-finder.*', 'isolate-navigation.*', 'kind-*', 'auction-*', 'market-*',
        'pending-search.*', 'return-target.*', 'price-sort-menu.*', 'homemade-*', 'selection-*', 'long-press.*', 'trade-flow.*',
        'decorate.*', 'decorate-history.*', 'decorate-loading.*', 'recount-source.*', 'refresh-button.*', 'open-card.*',
        'open-card-in-page.*', 'world-toggle.*', 'map-theme.*',
      ),
      'tests/core/{collection,market,pricing,kinds,cache}/**',
    ],
  },
  {
    nom: 'toile',
    fichiers: [...c('web-*', 'linked-*', 'open-linked-card.*', 'decorate-linked.*'), 'tests/core/links/**'],
  },
  {
    nom: 'ecoute',
    fichiers: [
      ...c('listen-*', 'music-registry.*', 'music-service.*', 'spotify-*', 'tidal-*', 'player-*', 'mount-player.*', 'SoundtrackButton.*', 'decorate-listen.*', 'tempo-*'),
      'tests/core/{music,spotify,tidal}/**',
    ],
  },
  {
    nom: 'socle',
    fichiers: [
      ...c(
        'anomaly.*', 'extension-*', 'update-setting-menu.*', 'settings-windows.*', 'telemetry-settings.*', 'whats-new.*',
        'tour*', 'scene.test.ts', 'demo-game.*', 'throttle.*', 'use-throttled-value.*', 'purchase-offers.*',
      ),
      'tests/core/{ads,anomalies,api,telemetry,whats-new}/**',
      'tests/core/data-source.test.ts',
      'tests/scripts/**',
    ],
  },
  { nom: 'relais', fichiers: ['tests/relay/**'] },
  { nom: 'android', fichiers: ['tests/android/**'] },

  // ---------- Scène (Ma Pièce) ----------
  {
    // Moteur partagé de la scène : réglage du graphisme, horloge, boucle d'animation, file de peinture, monde, profondeur.
    nom: 'scene-commun',
    lourde: true,
    fichiers: [
      ...c('art-setting.*', 'use-scene-time.*', 'use-wallclock-loop.*', 'paint-queue.*', 'library-launch.*', 'library-view.*', 'library-style-selector.*', 'library-art-ui.*'),
      ...lib('scene-world.*', 'depth-order.*', 'library-scene.*', 'time-setting.*', 'scene-clock.*', 'styles.*', 'activity.*', 'paint/paint-brush.*', 'paint/paint-grade.*'),
    ],
  },
  {
    // Intérieur : pièce, meubles, cartes posées, panneau, glisser-déposer, fenêtres de la pièce, stockage.
    nom: 'scene-piece',
    lourde: true,
    fichiers: [
      ...c(
        'furniture-drag*', 'arrange-view.*', 'card-bubble.*', 'arrange-shelf.*', 'arrange-add.*', 'placement.*', 'placement-bar.*', 'library-placement.*', 'library-sims-ui.*', 'furniture-thumb.*', 'library-cards.*', 'library-drag.*', 'library-furniture*', 'library-panel.*', 'library-steampunk-furniture.*',
        'library-window-furniture.*', 'room-card-dialog.*', 'card-picker-dialog.*', 'room-steampunk-decor.*', 'room-depth.*', 'window-gaps.*', 'window-art.*', 'model3d-art.*', 'item3d-art.*', 'room-angle.*', 'room-carried*', 'furniture-zoom.*', 'library-zoom.*', 'shelf-board-zoom.*', 'deco-art.*', 'deco-fonts.*', 'library-deco*', 'item-case.*', 'opened-item-hook.*', 'opened-item-layer.*', 'selectors.*', 'hifi*', 'disc-flight.*', 'game-box-content.*', 'game-spine.*', 'game-outside.*', 'back-magnifier.*',
      ),
      ...lib('room-grid*', 'board-mixed.*', 'surface.*', 'arrange.*', 'library-migration-v6.*', 'library-migration-v7.*', 'library-migration-v8.*', 'library-migration-v9.*', 'library-migration-v10.*', 'posed-cards.*', 'card-edit.*', 'furniture-catalog.*', 'footprint.*', 'library-book*', 'library-migration.*', 'library-repo.*', 'library-style.*', 'shape-suggest.*', 'zoom-target.*', 'shelf-link.*', 'furniture-render3d.*', 'furniture-models.*', 'item-models.*', 'carried-items.*', 'clock-cities.*', 'text-fit.*', 'opened-item.*', 'hifi.*'),
      'tests/core/picker-filter.test.ts',
    ],
  },
  {
    // Lumière de la pièce et des lampes (y compris les empreintes de référence du moteur d'éclairage).
    nom: 'scene-lumiere',
    lourde: true,
    fichiers: [...c('library-lamps.*', 'library-light*'), ...lib('light-ambient.*', 'light-beam.*', 'light-lamps.*', 'light-map.*', 'light-occluders.*', 'light-perf-golden.*', 'light-shadow.*', 'light-surfaces.*', 'lamp-state.*')],
  },
  {
    nom: 'scene-animaux',
    lourde: true,
    fichiers: [...c('library-pets-*', 'pet-sprite.*', 'room-pet-shadows.*'), ...lib('pets-*', 'library-pets.*', 'light-pet-*')],
  },
  {
    // Ciel, météo, position (lever/coucher), espace et nature.
    nom: 'scene-meteo',
    lourde: true,
    fichiers: [
      ...c('ghibli-sky.*', 'ghibli-weather.*', 'painted-sky.*', 'scene-weather.*', 'scene-nature.*', 'scene-space.*', 'library-weather-ui.*', 'use-weather.*', 'position-setting.*', 'scene-position.*', 'location-*', 'city-gloom.*', 'rain-*'),
      ...lib('sky.*', 'astro.*', 'scene-location.*', 'geocode.*', 'weather-*', 'deco-weather.*', 'weather/**', 'weather/rain-drops.*', 'weather/glass-rain.*', 'library-weather-setting.*', 'paint/paint-sky-*', 'paint/paint-snow.*'),
    ],
  },
  {
    // Décor de la ville : façades, lots, portes, lampadaires, peinture de la ville, nuit, vue dehors, fenêtre sur la ville.
    nom: 'scene-ville',
    lourde: true,
    fichiers: [
      ...c(
        'ghibli-city.*', 'painted-city*', 'painted-canvas.*', 'ghibli-g3c.*', 'ghibli-night.*', 'ghibli-windows.*', 'scene-panorama.*', 'room-window*', 'room-backdrop.*', 'room-outside.*',
        'library-outside.*', 'library-city-epoch.*', 'outside/**', 'hall-lights.*', 'window-life*', 'roof-life*', 'use-scene-life*', 'street-trees.*', 'hill-wind-layer.*',
      ),
      ...lib(
        'city-facades.*', 'city-lots.*', 'city-zones.*', 'city-metrics.*', 'city-doors.*', 'city-doorway.*', 'city-lamps.*', 'outside-camera.*',
        'city/hall-lights.*', 'city/night-light.*', 'city/window-lights.*', 'city/facade-layout.*', 'paint/paint-city-*', 'paint/paint-hill.*',
        'city/households.*', 'city/identity.*', 'city/person-traits.*', 'city/labour-law.*', 'city/leave-plan.*', 'city/id-card.*', 'city/scene-day.*', 'city/fireworks-show.*', 'city/schedules.*', 'city/home-state.*', 'city/window-choreo.*', 'city/roof-life.*',
      ),
    ],
  },
  {
    // Circulation : voitures, bus, feux, véhicules, camions de déménagement.
    nom: 'scene-circulation',
    lourde: true,
    fichiers: [...c('traffic-layer.*', 'use-bus-lines.*', 'vehicle/**', 'moving-*'), ...lib('city/traffic/**', 'city-vehicles.*', 'city-van.*', 'city-intensity.*')],
  },
  {
    // Piétons et pantins : squelette, démarche, passants, sprites des gens.
    nom: 'scene-pietons',
    lourde: true,
    fichiers: [...c('figure/figure-host.*', 'city-life.*', 'city-life-ghibli.*', 'city-sprites.*'), ...lib('figure/**', 'figure-g4b-poses.*', 'city-people.*')],
  },
  {
    // Habitants 3D : interrupteur, garde-robe, catalogue, visages, hôte three.js des figures.
    nom: 'scene-habitants3d',
    lourde: true,
    fichiers: [...c('citizens/**', 'figure/figure-host-3d.*'), 'tests/core/citizens/**'],
  },
  {
    // Commerces : boutiques, employés, clients, terrasses, metteur en scène, déménagements de boutiques.
    nom: 'scene-commerces',
    lourde: true,
    fichiers: [
      ...c('city-shops-*', 'shop-*', 'shop/**', 'use-shop-names.*'),
      ...lib('city-shops-*', 'shop-scene-*', 'city-beer.*', 'city/shops-*', 'paint/shop/**', 'paint/props/terrace.*'),
    ],
  },
  {
    // Événements du calendrier : fêtes, défilés, Fête de la musique, Père Noël, Halloween, équipes d'installation.
    nom: 'scene-evenements',
    lourde: true,
    fichiers: [
      ...c(
        'city-event*', 'city-extras-ghibli.*', 'concert-light.*', 'install-*', 'parade-*', 'music-fest.*', 'music-street*', 'stage-band.*',
        'santa-*', 'use-city-calendar.*', 'use-city-events.*', 'zone-setting.*', 'prop-host.*', 'flypast-*', 'gulls-layer.*', 'halloween-*',
      ),
      ...lib(
        'city-calendar.*', 'city-school-calendar.*', 'city-event*', 'city-install.*', 'city-music-crowd.*', 'city-parade.*', 'city-santa.*',
        'city/concert.*', 'city/gulls.*', 'city/halloween.*', 'city/halloween-night.*', 'paint/props/flags.*', 'paint/props/install.*', 'paint/props/kit.*', 'paint/props/music.*', 'paint/props/parade.*',
        'paint/props/santa.*', 'paint/props/street.*', 'paint/props/moving.*', 'paint/props/sky.*', 'paint/props/dog.*', 'paint/props/gull.*',
      ),
    ],
  },
];

/** Motifs restreints aux fichiers de test (`x/**` → `x/**\/*.test.{ts,tsx}`, `nom.*` et `nom*` → `….test.{ts,tsx}`). */
export const motifsDeTests = (f: Famille): string[] =>
  f.fichiers.map((m) => {
    if (/\.test\.tsx?$/.test(m)) return m;
    if (m.endsWith('**')) return `${m}/*.test.{ts,tsx}`;
    return `${m.replace(/\.\*$/, '')}.test.{ts,tsx}`;
  });

/** Délai par test pour les familles lourdes (simulations de journées entières, minute par minute). */
export const DELAI_LOURD_MS = 60_000;

/**
 * Nombre de processus pour les familles lourdes. Mesure du 2026-10-13 (6 cœurs, 7,4 Go de RAM) : avec 11 processus la scène
 * sature la mémoire (366 s et 15 échecs sur délai) ; avec 4, elle passe en 241 s sans échec de délai.
 */
export const TRAVAILLEURS_LOURDS = 4;
