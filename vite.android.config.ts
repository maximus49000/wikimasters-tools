import { defineConfig } from 'vite';
import { recentFixes } from './scripts/build-info.mjs';

// Bundle unique de la surcouche pour l'application Android (injecté dans la WebView).
export default defineConfig({
  define: { 'process.env.NODE_ENV': '"production"', __WMT_FIXES__: JSON.stringify(recentFixes(process.cwd())) },
  // Le bundle lit WXT_TMDB_API_KEY dans .env.local, comme l'extension.
  envPrefix: ['VITE_', 'WXT_'],
  build: {
    lib: { entry: 'src/android/entry.ts', formats: ['iife'], name: 'WikimastersTools', fileName: () => 'wikimasters-overlay.js' },
    outDir: 'android/app/src/main/assets',
    emptyOutDir: true,
    target: 'es2020',
  },
});
