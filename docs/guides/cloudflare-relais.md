# Mode opératoire — créer le compte Cloudflare et la clé YouTube

À faire une seule fois. Durée : environ 30 minutes. Coût : 0 €, aucune carte bancaire demandée (à vérifier à l'écran : les intitulés peuvent avoir changé).

## Partie A — Clé YouTube (Google)

1. Ouvrir https://console.cloud.google.com et se connecter avec un compte Google (idéalement dédié au projet).
2. Accepter les conditions si demandé. **Ne pas activer la facturation.**
3. En haut, menu des projets → **Nouveau projet** → nom « wikimasters-relais » → Créer.
4. Menu ☰ → **API et services** → **Bibliothèque** → chercher « YouTube Data API v3 » → **Activer**.
5. **API et services** → **Identifiants** → **Créer des identifiants** → **Clé API**.
6. Cliquer sur la clé créée → **Restrictions relatives aux API** → « Restreindre la clé » → cocher **YouTube Data API v3** → Enregistrer.
7. Copier la clé dans un endroit privé (gestionnaire de mots de passe). **Ne jamais la coller dans le dépôt, un message ou une issue.**

## Partie B — Compte Cloudflare

1. Ouvrir https://dash.cloudflare.com/sign-up, saisir un e-mail et un mot de passe solide, valider.
2. Cliquer sur le lien reçu par e-mail pour vérifier l'adresse.
3. Activer la double authentification (Mon profil → Authentification) : le compte contiendra la clé YouTube.
4. Dans le menu de gauche : **Workers et Pages** (« Compute (Workers) » selon la version). Choisir un nom de sous-domaine `…workers.dev` si demandé. L'offre **Free** suffit.

## Partie C — Déploiement (je guiderai pas à pas à ce moment)

Dans un terminal, à la racine du projet :

```bash
npx wrangler login
```
Une page s'ouvre : autoriser Wrangler sur le compte Cloudflare.

```bash
npx wrangler kv namespace create DOC_CACHE
```
Noter l'identifiant affiché ; il sera reporté dans `relay/wrangler.toml` (je le ferai).

```bash
npx wrangler secret put YOUTUBE_API_KEY
```
Coller la clé de la partie A quand elle est demandée (elle n'est pas affichée).

```bash
npx wrangler deploy --config relay/wrangler.toml
```
L'adresse du relais s'affiche (`https://…workers.dev`) ; elle sera enregistrée dans la configuration de l'extension.

## Partie D — Déploiement automatique depuis GitHub (facultatif, recommandé)

Pour que chaque fusion sur `main` redéploie le relais :
1. Cloudflare → Mon profil → **Jetons API** → **Créer un jeton** → modèle « Modifier Cloudflare Workers » → copier le jeton.
2. Noter aussi l'**ID de compte** (page d'accueil du compte, colonne de droite).
3. GitHub → dépôt → Settings → Secrets and variables → Actions → ajouter `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`.

## Surveillance et sécurité

- Quota YouTube : Google Cloud → API et services → YouTube Data API v3 → Quotas (10 000 unités par jour, 100 par recherche).
- Si la clé fuite : Identifiants → supprimer la clé, en créer une autre, relancer `wrangler secret put`.
- Cloudflare gratuit : surveiller Workers → Métriques (limite d'environ 100 000 requêtes par jour).

## Partie E — Mesure d'usage (base D1 et tableau de bord)

À faire une seule fois. Voir `docs/superpowers/specs/2026-10-08-monitoring-usage-design.md`.

1. **Base D1** : `npx wrangler d1 create wikimasters-usage` (ou Cloudflare → Storage & Databases → D1 → Create). Reporter l'identifiant dans `wrangler.toml` et `relay/wrangler.toml` (déjà fait pour la base actuelle).
2. **Table** : appliquer `relay/migrations/0001_events.sql` — soit `npx wrangler d1 migrations apply wikimasters-usage --remote`, soit coller le fichier dans l'onglet **Console** de la base sur le site Cloudflare (même résultat).
3. **Jeton du tableau de bord** : générer une valeur aléatoire (`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`) puis la poser comme secret `STATS_TOKEN` (`npx wrangler secret put STATS_TOKEN`, ou Workers → wikimasters-tools → Settings → Variables and Secrets → type Secret). Ne jamais la coller dans le dépôt ni dans un message.
4. **Tableau de bord** : `https://<adresse-du-relais>/dashboard` ; le jeton est demandé une fois puis gardé dans le navigateur.

Sans la base ou sans le secret, l'application fonctionne : les envois d'usage échouent sans bruit (réponse 503) et `/stats` répond « non configuré ».

Rétention : 90 jours, purge automatique chaque nuit (03:00 UTC) par le cron existant. Contrôle : Cloudflare → Workers → Métriques ; les lignes de la table `events` se lisent dans l'onglet Console de la base.

Jeton d'API Wrangler : si `wrangler d1 …` répond « Authentication error [code: 10000] », se reconnecter (`npx wrangler logout` puis `npx wrangler login`) ou utiliser la Console du site. Un jeton d'API, s'il est créé, doit avoir « Account → D1 → Edit » et être supprimé après usage.
