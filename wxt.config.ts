import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Wikimasters Tools (non officiel)',
    description:
      'Outils en lecture seule pour WikiMasters : prix estimés à partir de vos propres transactions.',
    // `identity` : liaison des comptes Spotify et Tidal (écoute des cartes musique).
    // `unlimitedStorage` : lève le plafond de 10 Mo de `chrome.storage.local` (historique du marché, listes d'écoute, pochettes).
    permissions: ['storage', 'unlimitedStorage', 'identity'],
    // Le service worker appelle Spotify et Tidal (jamais le site du jeu).
    host_permissions: [
      'https://api.spotify.com/*',
      'https://accounts.spotify.com/*',
      'https://openapi.tidal.com/*',
      'https://auth.tidal.com/*',
      'https://login.tidal.com/*',
      'https://api.themoviedb.org/*',
      'https://api.github.com/*',
      // Firefox MV3 : l'accès au site est une permission d'hôte à accorder (demandée à l'installation).
      ...(browser === 'firefox' ? ['https://www.wiki-masters.com/*'] : []),
    ],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'wikimasters-tools-unofficial@maximus49000.github.io',
          // data_collection_permissions n'est reconnu qu'à partir de Firefox 140 (142 sur Android).
          strict_min_version: '140.0',
          // Champ exigé par addons.mozilla.org : l'extension ne collecte ni n'envoie de données personnelles.
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: { strict_min_version: '142.0' },
      },
    }),
  }),
  zip: {
    name: 'wikimasters-tools',
    artifactTemplate: '{{name}}-{{version}}-{{browser}}.zip',
    sourcesTemplate: '{{name}}-{{version}}-sources.zip',
    excludeSources: ['.output/**', '.wxt/**', 'node_modules/**', '.superpowers/**', 'livrables/**', '.claude/**'],
  },
});
