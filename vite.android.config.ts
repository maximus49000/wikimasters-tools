import { defineConfig } from 'vite';
import { buildId, recentFixes } from './scripts/build-info.mjs';

// Bundle unique de la surcouche pour l'application Android (injecté dans la WebView).
export default defineConfig({
  define: { 'process.env.NODE_ENV': '"production"', __WMT_FIXES__: JSON.stringify(recentFixes(process.cwd())), __WMT_BUILD__: JSON.stringify(buildId(process.cwd())) },
  // Aucune clé n'est lue : les secrets restent dans le relais (le contrôle `npm run verifier-secrets` le vérifie).
  envPrefix: ['VITE_', 'WXT_'],
  build: {
    lib: { entry: 'src/android/entry.ts', formats: ['iife'], name: 'WikimastersTools', fileName: () => 'wikimasters-overlay.js' },
    outDir: 'android/app/src/main/assets',
    emptyOutDir: true,
    target: 'es2020',
  },
});
