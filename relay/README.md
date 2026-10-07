# Relais Wikimasters Tools (Cloudflare Worker)

Relais de recherche de documentaires (voir `docs/superpowers/specs/2026-10-07-documentaire-histoire-design.md`).

Routes : `/ping`, `/search` (documentaires notés), `/oembed?id=` (vérifie qu'une vidéo YouTube existe et s'intègre), `/status` (avancement de l'index des chaînes).
Tâche planifiée : toutes les 30 minutes, avance l'index des chaînes de confiance (ARTE, INA Officiel, Nota Bene, Lumni, Hérodote).

Réglages Cloudflare (Workers Builds) : répertoire racine vide, commande de déploiement `npx wrangler deploy`.
Liaison KV : `DOC_CACHE` (espace `wikimasters-doc-cache`, voir `wrangler.toml`).
Secrets (jamais dans le dépôt), depuis le tableau de bord Cloudflare ou `npx wrangler secret put <NOM>` : `YOUTUBE_API_KEY`, et `DEBUG_TOKEN` (facultatif, ouvre le mode de réglage de `/search`).
Budget du jour : 9 000 unités de quota YouTube, partagées entre l'index (2 par page) et la recherche (101).
Mode opératoire complet : `docs/guides/cloudflare-relais.md`.
