# Relais Wikimasters Tools (Cloudflare Worker)

Squelette : répond `{ "ok": true }` sur `/` et `/ping`. La recherche de documentaires s'y ajoutera.

Réglages Cloudflare (Workers Builds) : répertoire racine `relay`, commande de déploiement `npx wrangler deploy`.
Secrets (jamais dans le dépôt) : `npx wrangler secret put YOUTUBE_API_KEY` depuis ce dossier.
Mode opératoire complet : `docs/guides/cloudflare-relais.md`.
