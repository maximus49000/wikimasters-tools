// src/core/documentary/config.ts
// Relais de recherche de documentaires (Cloudflare Worker, dossier `relay/`).
export const RELAY_BASE = 'https://wikimasters-tools.maxime-protais-baumer.workers.dev';
// Documentaires validés à la main : fichier `documentaires.json` du dépôt, lu à l'exécution (mise à jour sans republier l'extension).
export const SELECTION_URL = 'https://raw.githubusercontent.com/maximus49000/wikimasters-tools/main/documentaires.json';
