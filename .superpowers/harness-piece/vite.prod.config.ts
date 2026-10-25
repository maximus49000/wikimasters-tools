import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vite';

// Banc de la pièce G6 construit en production (React sans ses contrôles de développement, comme l'appli construite) :
// `npx vite build --config .superpowers/harness-piece/vite.prod.config.ts` puis
// `npx vite preview --config .superpowers/harness-piece/vite.prod.config.ts` (port 5184). Sortie hors dépôt (dossier temporaire).
const root = path.resolve(__dirname, '../..');
export default defineConfig({
  root,
  base: './',
  esbuild: { jsx: 'automatic' },
  build: { outDir: path.join(os.tmpdir(), 'banc-piece-prod'), emptyOutDir: true, rollupOptions: { input: path.join(root, '.superpowers/harness-piece/piece.html') } },
  preview: { port: 5184, strictPort: true, host: '127.0.0.1' },
});
