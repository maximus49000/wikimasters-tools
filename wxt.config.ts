import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Wikimasters Tools (non officiel)',
    description:
      'Outils en lecture seule pour WikiMasters : prix estimés à partir de vos propres transactions.',
    permissions: ['storage'],
    ...(browser === 'firefox' && {
      // Firefox MV3 : l'accès au site est une permission d'hôte à accorder (demandée à l'installation).
      host_permissions: ['https://www.wiki-masters.com/*'],
      browser_specific_settings: {
        gecko: {
          id: 'wikimasters-tools@maximus49000.github.io',
          // MV3 + scripts de contenu en monde MAIN : Firefox 128 minimum.
          strict_min_version: '128.0',
          // Champ exigé par addons.mozilla.org : l'extension ne collecte ni n'envoie de données personnelles.
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: { strict_min_version: '128.0' },
      },
    }),
  }),
  zip: {
    name: 'wikimasters-tools',
    artifactTemplate: '{{name}}-{{version}}-{{browser}}.zip',
    sourcesTemplate: '{{name}}-{{version}}-sources.zip',
    excludeSources: ['.output/**', '.wxt/**', 'node_modules/**', '.superpowers/**', '.claude/**'],
  },
});
