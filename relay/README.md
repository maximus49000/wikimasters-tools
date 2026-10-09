# Relais Wikimasters Tools (Cloudflare Worker)

Relais de recherche de documentaires (voir `docs/superpowers/specs/2026-10-07-documentaire-histoire-design.md`).

Routes : `/ping`, `/weather?lat&lon` (météo actuelle Open-Meteo, coordonnées arrondies à 0,1°, cache 10 min, sans secret ; limite 60 appels par minute et par adresse), `/school-calendar?zone=A|B|C|Corse` (vacances scolaires officielles réduites, cache 24 h, sans secret ; limite 30 appels par minute et par adresse), `/department?lat&lon` (département par position arrondie à 0,1°, cache 30 jours, sans secret ; limite 60 appels par minute), `/search` (documentaires notés), `/oembed?id=` (vérifie qu'une vidéo YouTube existe et s'intègre), `/status` (avancement de l'index des chaînes).
Tâche planifiée : toutes les 30 minutes, avance l'index des chaînes de confiance (ARTE, INA Officiel, Nota Bene, Lumni, Hérodote).

Réglages Cloudflare (Workers Builds) : répertoire racine vide, commande de déploiement `npx wrangler deploy`.
Liaison KV : `DOC_CACHE` (espace `wikimasters-doc-cache`, voir `wrangler.toml`).
Secrets (jamais dans le dépôt), depuis le tableau de bord Cloudflare ou `npx wrangler secret put <NOM>` : `YOUTUBE_API_KEY`, et `DEBUG_TOKEN` (facultatif, ouvre le mode de réglage de `/search`).
Budget du jour : 9 000 unités de quota YouTube, partagées entre l'index (2 par page) et la recherche (101).
Mode opératoire complet : `docs/guides/cloudflare-relais.md`.

## Mesure d'usage anonyme

Routes : `POST /t` (lot d'événements, validé contre `src/core/telemetry/catalogue.ts`), `GET /stats` (agrégats JSON, en-tête `x-stats` = secret `STATS_TOKEN`), `GET /dashboard` (page HTML, jeton demandé à l'ouverture).
Liaison D1 : `USAGE_DB` (base `wikimasters-usage`, table `events` créée par `migrations/0001_events.sql`). Secret : `STATS_TOKEN`. Purge à 90 jours chaque nuit (03:00 UTC, cron existant).
Mise en place : partie E de `docs/guides/cloudflare-relais.md`. Aucune adresse IP ni contenu de page n'est stocké.
