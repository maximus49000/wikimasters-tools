# Monitoring de l'utilisation — conception

Date : 2026-10-08

## But

Savoir **combien de personnes utilisent l'application, quelles actions elles font, et si elle tombe en panne**, sur l'extension Chrome et l'app Android, pré-prod et production. Aujourd'hui seuls le cercle restreint de l'auteur l'utilise ; l'objectif est une diffusion large (Chrome Web Store, APK distribué), donc le dispositif est conçu dès le départ pour y être conforme.

## Décisions

| Sujet | Décision |
|---|---|
| Collecte | Événements anonymes envoyés au relais Cloudflare existant (`relay/`) |
| Stockage | Cloudflare D1 (SQL), purge à 90 jours par le cron existant |
| Consultation | Page de tableau de bord servie par le relais, protégée par un jeton |
| Consentement | **Erreurs techniques** : toujours remontées, sans identifiant. **Usage** (actifs + actions) : activé par défaut, désactivable dans Paramètres. Le défaut est une constante unique, à basculer en opt-in à la diffusion publique |
| Granularité | On suit **l'action** réalisée dans un module, jamais son simple affichage (lecture d'un morceau, pas ouverture du module Spotify) |

Écarté : service tiers (PostHog, Plausible, Umami) — service en plus, scripts distants interdits en extension MV3, risque RGPD / Chrome Web Store. Analytics Engine — oblige à un jeton d'API Cloudflare externe pour alimenter le tableau de bord.

## Architecture

### Relais (`relay/src/`)

Trois routes ajoutées au Worker `wikimasters-tools` :

| Route | Rôle |
|---|---|
| `POST /t` | Reçoit un lot (≤ 50 événements), valide chaque événement contre la liste fermée, écrit dans D1. Réponse 204. Événement invalide ignoré, lot trop gros refusé (413) |
| `GET /stats` | Agrégats JSON pour le tableau de bord. Exige l'en-tête `x-stats` égal au secret `STATS_TOKEN` |
| `GET /dashboard` | Page HTML unique (sans dépendance). Le jeton est saisi une fois puis gardé dans `localStorage` |

Nouveaux éléments de configuration : binding D1 `USAGE_DB`, secret `STATS_TOKEN`. Le cron existant (toutes les 30 min) purge les lignes de plus de 90 jours (au plus une purge par jour).

Protections : plafond de taille du corps, plafond d'événements par lot, aucune lecture de l'IP (non stockée, non journalisée par le code), CORS ouvert en écriture seulement sur `/t`.

### Modèle de données (D1)

Table `events` :

| Colonne | Contenu |
|---|---|
| `ts` | Horodatage serveur (secondes) |
| `type` | `active`, `action`, `update` ou `error` |
| `name` | Nom tiré de la liste fermée |
| `client_id` | UUID aléatoire d'installation ; **NULL pour `error`** |
| `platform` | `extension` ou `android` |
| `version` | Version de l'application au moment de l'événement (pour `update` : la version **ciblée**, celle qui vient d'être installée) |
| `from_version` | Uniquement pour `update` : la version **génératrice**, celle d'où part la mise à jour ; NULL sinon |
| `channel` | `preprod` ou `prod` |
| `detail` | Optionnel, valeur d'une courte liste fermée par événement (ex. `spotify` / `tidal`) ; jamais de texte libre |

Index sur `(ts)`, `(type, name, ts)`.

### Jamais collecté

Titres de cartes, pseudo Wikimaster, adresse IP stockée, contenu de page, URL complète, texte saisi (recherches, notes), identifiants ou jetons de tout service.

## Catalogue des événements (liste fermée)

La liste vit dans un seul fichier TypeScript partagé par le client et le relais. Un nom hors liste est refusé à la compilation côté client et ignoré côté relais.

**`active`** — un ping par jour et par installation, au premier lancement de la journée.

**`action`** — l'utilisateur **a fait** quelque chose. Règle : on ne déclenche jamais sur une ouverture ou un affichage de module, seulement sur le résultat de l'action. Exemples de départ :

| Module | Événement | Déclenché quand |
|---|---|---|
| Écoute | `lecture-musique` (detail : `spotify` / `tidal`) | Une lecture démarre effectivement |
| Écoute | `liaison-compte` (detail : plateforme) | Le compte est relié avec succès |
| Film / série | `bande-annonce-lue` | La vidéo démarre (pas à l'affichage du lecteur) |
| Film / série | `bo-lue` | Un titre de la BO démarre |
| Film / série | `streaming-lien-ouvert` | Le lien « Voir où regarder » (JustWatch) est ouvert (un seul lien, donc pas de détail) |
| Film / série | `film-change` | Un autre film ou série est choisi et confirmé via ⇄ |
| Toile | `toile-generee` | Une toile est construite (pas à l'ouverture du menu) |
| Documentaire | `documentaire-lu` | La lecture démarre (pas à l'ouverture de la section) |
| Documentaire | `documentaire-change` | Un autre documentaire est choisi et confirmé |
| Documentaire | `documentaire-propose` | Une proposition de documentaire est envoyée |
| Livre | `livre-lecture-ouverte` (detail : `wikisource` / `gutenberg` / `internet-archive`) | « Lire gratuitement » est effectivement ouvert |
| Livre | `livre-achat-ouvert` (detail : `papier` / `ebook`) | Un lien de vendeur est ouvert |
| Livre | `livre-change` | Un autre livre est choisi et confirmé via ⇄ |
| Jeu vidéo | `jeu-video-lu` | Une vidéo ou la BO du jeu démarre |
| Cartes liées | `carte-liee-ouverte` | Une carte liée est ouverte depuis le bloc |
| Sélection | `echange-prepare` | Les cartes sont posées dans l'offre via la poignée de main |
| Plein écran | `plein-ecran` | Une vidéo passe en plein écran |
| Anomalie | `anomalie-signalee` | L'issue est créée |
| WikiHow | `wikihow-fiche-lue` | Une fiche est dépliée |
| Nouveautés | `visite-terminee` | La visite guidée va au bout |
| Réglage | `reglage-modifie` (detail : nom du réglage) | Un réglage change de valeur |

**Règle de couverture :** chaque module de contenu (musique, film / série, jeu vidéo, livre, documentaire, cartes liées, Toile) compte au moins une action « consommer » (lecture, lecture gratuite, ouverture d'un lien sortant) et, quand il existe, une action « corriger » (⇄ changer). Ouvrir une fiche, déplier une section, afficher une bibliographie ou une filmographie ne sont jamais des événements.

La liste définitive est arrêtée dans le plan, par relecture des modules ; la règle « action, jamais affichage » prime sur ces exemples.

**`update`** (nom `maj-appliquee`) — une mise à jour a été réalisée. Détection côté client : la dernière version lancée est gardée en local ; au démarrage, si la version courante est différente, un événement part avec `from_version` = version gardée (génératrice) et `version` = version courante (ciblée), puis la version gardée est mise à jour. Le premier lancement (aucune version gardée) n'est pas une mise à jour. Un saut de plusieurs versions (application restée fermée) produit un seul événement `from → to`. Même consentement que l'usage (porte `client_id`, coupé avec l'interrupteur) ; la version gardée en local est tenue à jour même si la mesure est coupée, pour ne pas émettre de fausse mise à jour en la réactivant.

**`error`** — catégories fixes, sans identifiant : `api-429` (detail : `wikipedia`, `spotify`, `tidal`, `tmdb`, `steam`, `igdb`, `relais`), `api-5xx` (idem), `api-reseau`, `js-erreur`, `lecture-echec` (detail : `spotify` / `tidal` / `video`).

## Client (`src/core/telemetry/`)

Module partagé par l'extension et l'app Android.

- `track(name, detail?)` et `reportError(name, detail?)` : signatures typées sur la liste fermée.
- File en mémoire vidée par lots toutes les 60 s et à la fermeture de la page (`sendBeacon`, repli `fetch keepalive`). Échec d'envoi : lot abandonné, jamais rejoué en boucle. Aucune exception ne remonte à l'application.
- `clientId` : UUID aléatoire créé au premier lancement, stocké en local, sans lien avec un compte. Réinstaller = nouvel identifiant.
- `version`, `channel`, `platform` lus depuis le build existant.
- Réglage `usageStats` : si désactivé, `active`, `action` et `update` ne sont ni mis en file ni envoyés ; les `error` partent quand même, sans identifiant.
- Constante `USAGE_STATS_DEFAULT = true`, à passer à `false` au passage en diffusion publique.
- Réglage visible dans Paramètres : « Statistiques d'usage anonymes », interrupteur, courte explication de ce qui est envoyé (mêmes glyphes et visibilité à l'écran que les autres réglages, extension **et** mobile).

### Points d'appel

Une ligne `track('…')` à l'endroit où l'action aboutit (callback de lecture démarrée, fin de construction de la toile, etc.), jamais dans le code d'affichage. Les erreurs passent par un crochet unique sur les gestionnaires déjà en place (429, échecs d'API) et par `window.onerror` / `unhandledrejection`.

## Tableau de bord

Page HTML unique, lisible sur téléphone, thème clair/sombre. Contenu :

1. Tuiles : actifs aujourd'hui / 7 jours / 30 jours.
2. Courbe des actifs par jour.
3. Classement des actions les plus utilisées sur la période.
4. Erreurs par catégorie, avec courbe pour repérer les pics.
5. Répartition par version (adoption des mises à jour).
6. Journal des mises à jour réalisées : tableau `version génératrice → version ciblée` avec le nombre d'installations et la date, par plateforme et canal, pour voir qui a migré, d'où, et les retards.

Filtres : plateforme (extension / Android), canal (pré-prod / prod), période (7 / 30 / 90 jours).

## Tests

- Relais (Vitest, D1 simulé) : validation contre la liste fermée, rejet des lots trop gros, `error` sans `client_id`, jeton sur `/stats`, agrégats, purge à 90 jours.
- Client : file et envoi par lots avec faux `fetch`, abandon silencieux sur échec, opt-out (aucun `active`/`action`, `error` conservées), un seul `active` par jour, `update` émis une fois avec `from_version` et `version` corrects (pas au premier lancement, un seul événement pour un saut de plusieurs versions, version gardée mise à jour même mesure coupée), noms hors liste refusés au typage.
- Vérification manuelle : tableau de bord avec données d'exemple, réglage dans Paramètres sur extension et mobile.

## Livraison

Un guide WikiHow (`entries.ts`) pour le réglage, une entrée « Quoi de neuf » annonçant la mesure, mention dans `docs/guides/cloudflare-relais.md` de la création de la base D1 et du secret `STATS_TOKEN`. Déploiement du relais à faire par l'utilisateur (création D1 + secret) ; l'application fonctionne sans, les envois échouant silencieusement.

## Limites connues

- Chiffres estimatifs : pas de dédoublonnage entre appareils d'une même personne.
- Un utilisateur qui coupe la mesure sort des comptes d'actifs et d'actions.
- Réinstallation = nouvel identifiant, donc légère surestimation des actifs.
- Avant diffusion publique : politique de confidentialité à rédiger (la liste fermée ci-dessus en est la base) et bascule du défaut en opt-in.
