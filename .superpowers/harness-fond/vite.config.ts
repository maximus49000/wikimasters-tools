import path from 'node:path';
import { defineConfig } from 'vite';

// Banc du fond de la Ville : sert tout le dépôt (les pages sont dans .superpowers/harness-fond/).
export default defineConfig({
  root: path.resolve(__dirname, '../..'),
  server: { port: 5179, strictPort: true, host: '127.0.0.1' },
  esbuild: { jsx: 'automatic' },
});
