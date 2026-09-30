import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Wikimasters Tools (non officiel)',
    description:
      'Outils en lecture seule pour WikiMasters : prix estimés à partir de vos propres transactions.',
    permissions: ['storage'],
  },
});
