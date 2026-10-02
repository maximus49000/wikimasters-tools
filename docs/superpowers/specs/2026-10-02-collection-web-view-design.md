# Vue « Toile d'araignée » — design

Nouvelle vue de la page Collection, à côté de Homemade, Monde, Frise et Liste. Elle relie les cartes de la collection par les articles Wikipédia qu'elles citent. Maquette validée le 2026-10-02.

## Besoin

- Pour chaque carte de la collection, récupérer tous les hyperliens vers des articles Wikipédia (espace de noms principal ; liens externes, fichiers, catégories, modèles ignorés).
- Chaque lien est stocké avec la carte source (slug) et le titre de l'article visé.
- Le graphe est biparti : des **cartes** et des **points** (articles Wikipédia). Un trait relie une carte à chaque point qu'elle cite.
- Un point n'est affiché que s'il relie **au moins deux cartes visibles**. Les liens cités par une seule carte restent stockés, non affichés.
- Pas d'exploration des pages hors collection : seuls les liens sortants des cartes sont lus. Un point qui est lui-même une carte de la collection s'affiche comme carte, pas comme point.
- Une carte sans point partagé n'est pas dessinée.
- La vue respecte les filtres existants (rareté, nature, occupation) comme Monde et Frise, via `filterSource` / `loadFiltered`.

## Affichage

- Graphe libre, zoomable et déplaçable (pincer, glisser, molette), placement automatique par forces.
- Cartes : vignettes avec l'image de la carte, titre en dessous. Points : cercles étiquetés dont la taille croît avec le nombre de cartes reliées.
- Bouton « Toile » dans `VIEWS` (`world-toggle.ts`), icône seule, comme les autres vues, sur extension et mobile.
- Toucher un point : met en avant ses cartes et atténue le reste. Toucher dans le vide : retire la mise en avant.
- **Toucher une carte : affiche la carte comme dans la vue Monde**, c'est-à-dire la fenêtre `CardPopup` (aperçu avec « Voir le marché » → `onOpen` et « Ouvrir la carte » → `onOpenCard`), avec en plus les points de la carte mis en avant.
- Avancement visible tant que des cartes restent à lire (« 120 / 300 cartes lues »), la toile se complète au fil de l'eau.

## Architecture

Calquée sur la vue Monde (`geo`).

- `src/core/links/wiki-links.ts` : `fetchLinks(slugs)` appelle l'API Wikipédia FR (`action=query&prop=links&plnamespace=0&pllimit=max`), jusqu'à 50 titres par requête, avec suite de pagination (`plcontinue`). Renvoie `Record<slug, string[]>` (titres normalisés en slugs via `titleToSlug`).
- `src/core/links/links-book.ts` : état pur `Record<slug, { links: string[]; at: number }>`, `needsLookup`, `setLinks`. Clé de stockage `links-v1`.
- `src/core/links/links-repo.ts` : modèle de `geo-repo.ts` : écritures sérialisées, file `pending`, un parcours à la fois, intervalle 150 ms, repos de 60 s après un échec (429, hors ligne), `subscribe`, `load`, `resolveMissing(slugs)`.
- `src/core/links/web-graph.ts` : fonction pure `buildWeb(cards, links, minShared = 2)` → `{ cards, hubs: { slug, title, cards[] }[], edges }`. Calcule les points partagés, exclut ceux déjà cartes de la collection.
- `src/content/WebPanel.tsx` : panneau (mêmes props communes que `WorldPanel`/`TimelinePanel`), rendu SVG, simulation de forces légère (pas de dépendance lourde), gestes tactiles et souris.
- `collection-view.ts` : ajouter `'web'` au type `CollectionView`. `world-toggle.ts` : ajouter l'entrée à `VIEWS`. `collection-ui.tsx` : brancher `WebPanel` (l.233-239). `overlay.ts` : instancier le dépôt de liens, comme pour `geo`.

Aucune modification d'interface existante ; le code reste commun à l'extension WXT et à l'APK Android.

## Flux de données

1. La vue s'ouvre, lit `collection.list()` filtré, demande `links.resolveMissing(slugs)` pour les cartes sans entrée.
2. Chaque réponse est écrite dans le stockage et notifie le panneau, qui recalcule `buildWeb` et met la toile à jour.
3. Les liens mémorisés ne sont pas relus : seules les nouvelles cartes le sont. Une carte sans liens enregistrée est quand même mémorisée (réponse vide ≠ non lue).

## Erreurs et limites

- Wikipédia indisponible ou 429 : repos de 60 s, message discret « Liens indisponibles pour l'instant », les liens déjà connus restent affichés.
- Article sans page Wikipédia FR (slug introuvable) : entrée vide mémorisée.
- Grosse collection : la toile ne montre que les points partagés ; plafond d'affichage (par exemple les 300 points les plus partagés) avec indication du nombre masqué, à valider en implémentation.
- Rafraîchissement des liens : relecture d'une carte après 30 jours (`at`).

## Tests

- `web-graph` : points partagés vs non partagés, exclusion des cartes, filtres appliqués, carte isolée.
- `links-book` / `links-repo` : file, cooldown après échec, mémorisation d'une réponse vide, écritures sérialisées (même schéma que `geo-repo`).
- `wiki-links` : pagination `plcontinue`, lots de 50, normalisation des titres.
- `WebPanel` : toucher une carte ouvre `CardPopup`, toucher un point met en avant ses cartes.
- Vérification manuelle : recharger l'extension, ouvrir la vue Toile sur Chrome, puis sur l'APK (cf. test tactile Android).

## Hors périmètre

Exploration de pages intermédiaires (A → B → C → D hors collection), liens par attributs communs, lecture du wikitexte.
