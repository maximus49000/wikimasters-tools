# Vue « Monde » de la Collection — design

Date : 2026-09-30. Branche : `plan-1-foundation`.

## Objectif

Ajouter à la page Collection un interrupteur ON/OFF, à côté du bouton « Sélectionner », qui bascule entre la vue « Liste » (grille actuelle du site) et la vue « Monde » : une carte du monde sur laquelle les cartes du joueur sont des points. Un clic sur un point ouvre la fiche de la carte dans le jeu.

## Contraintes héritées

- Extension en lecture seule ; aucune requête ajoutée vers l'API du jeu, pas de crawl, pas d'appel à `/sales` (voir spec `2026-09-30-wikimasters-tools-design.md`).
- Les cartes connues viennent de l'observation passive (comme `market-tap`). Pas de parcours automatique des 35 pages.
- Appariement carte ↔ article par le slug de l'URL Wikipédia (comme pour le marché).

## Composants

### Interrupteur (`src/content/WorldToggle.tsx`, `world-toggle.ts`)
- Repère le bouton « Sélectionner » : un `<button>` dont le texte est « Sélectionner » (repli : icône `.lucide-square-check-big`). Injecte l'interrupteur comme frère, dans le même parent, avec le même style (`rounded-lg border`, variables `--color-*` du site).
- Ré-injection idempotente (le site est une SPA ; un `MutationObserver` existe déjà dans `mount.tsx`, on s'y greffe).
- État persisté dans `localStorage` `wmt:collectionView` (`"list"` | `"world"`), défaut `"list"`.
- ON : masque la grille de cartes (`hidden`, sans la retirer du DOM) et monte le panneau carte à sa place. OFF : démonte la carte et ré-affiche la grille.
- Si le bouton « Sélectionner » est introuvable, rien n'est injecté (aucun effet sur la page).

### Carte (`src/content/WorldMap.tsx`)
- Leaflet (import statique : WXT regroupe le script de contenu en un seul fichier). Tuiles OpenStreetMap (`tile.openstreetmap.org`, sans clé API ; CARTO a été écarté car il exige désormais une clé). Thème sombre : filtre CSS d'inversion des tuiles, selon la couleur de fond de la page. Aucun `host_permissions` nécessaire : les appels Wikipédia utilisent `origin=*` (CORS), les tuiles sont de simples `<img>` et le site n'envoie pas d'en-tête CSP.
- Un marqueur par carte positionnée ; survol = titre ; clic = ouverture de la fiche via `collection-reopen` (`marketUi.reopenCard`). La page ne change pas : la vue Monde reste affichée, aucun mécanisme de retour n'est nécessaire.
- Liste latérale « À placer » : cartes connues sans position. Clic sur une carte de la liste, puis clic sur la carte du monde = position manuelle. Déplacer un point = le glisser (il devient un placement manuel, en orange) ; clic droit sur un point orange = retirer le placement manuel (retour à la position Wikipédia, ou « À placer »).

### Positions (`src/core/geo/`)
- `wiki-coords.ts` : appel `https://<lang>.wikipedia.org/w/api.php?action=query&prop=coordinates&titles=…&format=json&origin=*`, schéma zod, retourne `{lat, lon} | null`. Un seul appel par carte, résultat (y compris « aucune ») mis en cache.
- `geo-book.ts` : `slug → {lat, lon, source: "wiki" | "manual"}` dans `wmt:geo` ; priorité manuel > wiki ; `resolve(slug)`, `setManual`, `clearManual`.
- Seule Wikipédia en français est interrogée (`fr.wikipedia.org`) : toutes les cartes du jeu pointent vers fr.wikipedia.org et le DOM de la Collection n'expose pas de langue. Le placement manuel sert de repli.
- La fonctionnalité ne s'exécute que sur les chemins commençant par `/collection`.
- Les appels Wikipédia ne portent que le titre de l'article (aucune donnée du jeu ni du compte) et sont espacés en file d'attente (un à la fois).

### Cartes connues
- Source : observation passive des cartes affichées sur la Collection (titre et slug), stockées dans `wmt:collection`. Au démarrage, la carte affiche ce qui est déjà connu ; elle se complète au fil de la navigation du joueur.
- Un message « N cartes connues — parcourez la Collection pour en ajouter » indique les limites de la vue.

## Cas limites
- Aucune carte connue : état vide explicatif.
- Wikipédia injoignable : les cartes restent dans « À placer », réessai au prochain affichage.
- Plusieurs cartes à la même position : regroupement (clustering) à prévoir seulement si le besoin apparaît (YAGNI en V1).
- Le site change son DOM : l'interrupteur disparaît sans casser la page.

## Tests (Vitest)
- `wiki-coords` : parsing de réponses avec, sans et avec plusieurs coordonnées.
- `geo-book` : priorité manuel/wiki, persistance, retour à Wikipédia.
- `world-toggle` : repérage du bouton (texte et repli icône), idempotence, persistance de la vue.
- Vérification manuelle dans Chrome : rendu de la carte, thème, clic vers la fiche, retour en vue Monde.

## Hors périmètre
- Crawl de toute la collection, clustering, import/export des positions, autres pages que la Collection.

## Questions ouvertes
- Nom exact des éléments du DOM pour extraire titre/image/slug des cartes de la Collection (à relever dans les DevTools lors de la mise en œuvre, comme pour `card-finder`).
- Usage des tuiles OSM : la politique d'OpenStreetMap tolère un usage léger avec attribution ; si l'usage grossit, prévoir un fournisseur avec clé.

## Scan de la Collection en arrière plan (ajout du 30/09/2026)

Décision de l'utilisateur : au premier chargement de la Collection, l'extension récupère **toutes** les cartes en arrière plan (elle remplace donc, pour la complétude, la seule observation passive, qui reste active en complément).

- Source : `GET /api/my-collection?sort=rarity&page=N&stats=0` (page 0-indexée, `total` toujours `null`, pas de `hasMore`) ; une page vide marque la fin. On ne conserve que titre et slug.
- Débit : une requête à la fois, 1 500 ms d'écart, backoff 429 de `createGameApi` ; arrêt à la première erreur, reprise au chargement suivant (état `wmt:collectionScan` : `idle | running | done | error`, `nextPage`, `entries`).
- Affichage : la carte se recharge (au plus une fois par seconde) à mesure que les pages arrivent ; le panneau affiche l'état du scan et un bouton « Re-scanner » / « Reprendre ».
- Risque : les règles du jeu interdisent l'automatisation ; ce scan est un choix explicite de l'utilisateur, noté dans le README. Plan : `docs/superpowers/plans/2026-09-30-collection-scan.md`.
