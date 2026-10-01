import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Wikimasters Tools (non officiel)',
    description:
      'Outils en lecture seule pour WikiMasters : prix estimés à partir de vos propres transactions.',
    // `identity` : liaison du compte Spotify (écoute des cartes musique).
    permissions: ['storage', 'identity'],
    // Le service worker appelle Spotify (jamais le site du jeu).
    host_permissions: [
      'https://api.spotify.com/*',
      'https://accounts.spotify.com/*',
      // Firefox MV3 : l'accès au site est une permission d'hôte à accorder (demandée à l'installation).
      ...(browser === 'firefox' ? ['https://www.wiki-masters.com/*'] : []),
    ],
    // Chrome : clé publique qui fixe l'identifiant de l'extension (donc l'adresse de retour Spotify).
    ...(browser !== 'firefox' && {
      key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArqHmiTmz7PCLPn+L3IClQ0hDpzPZYMWEHWkAmQvKPyiH8GWVXV8h40n22SLoykFoi1jKTVVII+MCKBUZxc3V0d9R21vhBsIXpkTEOWN2hA6n42FfJ1zPV75/igoW3dgy7g4HfIIL9SLbeVmJBgs9ruqS7WTOdszIduAEBLrHbo6IFpZahgmVnyLPS0JVH/bLTxcZ7o9Dtsxc6/TbrLTWSKhmaKXBoyx+TDuPvrFRiLldPqQ/F7hH0v2eCeiatm4gti5IqzSZmdouwzg7lSgLrC8J76Qc5j95HN66y3ts2GRrS5uoEvaxbJnJcq7XGyp7wVbBWr6Rfgo7QHy/aP8ldQIDAQAB',
    }),
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
