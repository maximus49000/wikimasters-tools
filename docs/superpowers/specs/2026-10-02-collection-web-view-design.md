# Vue « Toile d'araignée » — design

Nouvelle vue de la page Collection, à côté de Homemade, Monde, Chronologique et la Grille du site. Elle relie les cartes par les articles Wikipédia qu'elles citent. Maquette validée le 2026-10-02 ; ce document décrit ce qui est livré (des écarts avec la première version du design sont expliqués plus bas).

## Besoin

- Pour chaque carte de la Collection, récupérer ses liens vers des articles Wikipédia FR, et les mémoriser avec la carte source (slug).
- Le graphe est biparti : des **cartes** et des **points** (articles Wikipédia). Un trait relie une carte à chaque point qu'elle cite. Un point n'est affiché que s'il relie **au moins deux cartes visibles**, quel que soit le nombre de liens.
- Pas d'exploration des pages hors collection : seuls les liens sortants des cartes sont lus. Un article qui est lui-même une carte de la Collection s'affiche comme carte : si une carte en cite une autre, un trait **en pointillés** les relie (c'est ce qui permet les enchaînements carte → carte → point → carte).
- Une carte sans trait n'est pas dessinée.
- La vue respecte les filtres existants (rareté, étiquette, nature, occupation, ×2) comme Monde et Chronologique.

### Quels liens : l'introduction de l'article

La première version du design lisait **tous** les liens de chaque article. Mesuré sur 50 articles réels de la Wikipédia FR, un article compte en moyenne **1000 liens** (50 420 pour 50 articles, 101 requêtes) ; 82 % des titres ne sont cités qu'une fois, et les points les plus partagés sont du bruit bibliographique (ISBN 88 %, ISSN, DOI, « Autorité (sciences de l'information) » 92 %, « Le Monde », « Internet Archive »). Stocker cela pèserait une quinzaine de Mo pour 1000 cartes (impossible dans le `localStorage` de l'appli Android) et la toile serait illisible.

On lit donc les liens de **l'introduction** de chaque article (résumé et infobox : genre, métier, lieu, époque…), par `action=parse&section=0&prop=links` : 85 liens en moyenne (50 articles : 4225 liens, 3308 titres), et des points qui ont du sens (« Pop (musique) », « Chanteur », « Guitare », « Chef-lieu », « Poète »…). Environ 1 Mo pour 1000 cartes.

## Affichage

- Graphe libre, zoomable et déplaçable (glisser, pincer, Ctrl + molette, boutons + − ⤢), placement automatique par forces.
- **Zoomer écarte les nœuds sans les grossir** : une carte ne dépasse jamais sa taille de départ (34 px) à l'écran, comme un repère de la vue Monde ; dézoomé, les nœuds rétrécissent avec les distances pour ne pas se chevaucher. Cartes : vignettes (image de la carte, ou initiales ; simple pastille de la couleur de la rareté quand elles sont très petites). Points : disques d'autant plus gros qu'ils relient de cartes, de la même façon.
- Les noms gardent la même taille à l'écran. Ils sont choisis par ordre d'importance et ne sont gardés que s'ils ne recouvrent pas un autre nom : les nœuds mis en avant d'abord, puis les cartes (à partir du zoom 1), puis les points du plus au moins partagé.
- Bouton « Toile » dans `VIEWS` (`world-toggle.ts`), icône seule (Lucide « network »), sur extension et mobile.
- Toucher un **point** : met en avant ses cartes (et atténue le reste), avec une phrase sous la toile (« Rock relie 31 cartes : … ») ; toucher à nouveau, ou le fond, retire la mise en avant.
- Toucher une **carte** : **pas de carte en grand** (elle masquerait la toile). Seuls les boutons d'ouverture, 📈 « Voir le marché » (`onOpen`) et 🃏 « Ouvrir la carte » (`onOpenCard`), apparaissent **au-dessus de la carte**, dans une petite barre de deux boutons de 44 px (sous la carte quand le haut manque de place). La barre suit la carte au zoom et au glissement. La carte, ses points et les cartes qu'elle cite restent mis en avant. Elle se referme en touchant la même carte, le fond, un point, avec Échap, ou après un bouton.
- Avancement visible tant que des cartes restent à lire (« Liens lus : 120 / 300 cartes… »), la toile se complète au fil de l'eau.

## Quels points afficher

- Au plus **300** points (`MAX_HUBS`), les plus partagés ; le texte sous la toile indique combien sont masqués.
- Un point « générique », cité par plus de 30 % des cartes affichées (et par au moins 30 cartes, `GENERIC_SHARE`, `GENERIC_MIN`), relie tout et n'apprend rien : il passe après les autres et n'est affiché que s'il reste de la place sous la limite. Une petite Collection n'est donc pas touchée.
- Quelques pages qui ne disent rien du sujet sont ignorées : identifiants (ISBN, ISSN, DOI), bibliothèques et archives (Internet Archive, BnF, SUDOC, VIAF, WorldCat), Wikidata, Wikimedia Commons, alphabet phonétique (« API a »…).

## Architecture

Calquée sur la vue Monde (`geo`).

- `src/core/links/wiki-links.ts` : `fetchLeadLinks(fetch, slug)` (`action=parse`, `section=0`, `redirects=1`), `parseLeadLinks`. Garde les articles existants de l'espace de noms principal ; un article supprimé donne une liste vide ; toute autre erreur lève.
- `src/core/links/links-book.ts` : état `links-v1` : dictionnaire partagé de titres + identifiants par carte (`{ at, links }`), fraîcheur 30 jours, 400 liens au plus par carte.
- `src/core/links/links-repo.ts` : un article par requête (150 ms entre deux), enregistrement tous les 10 articles ; ce qui a été lu avant un échec est gardé ; pause de 60 s après un échec (429, hors ligne, stockage plein) ; `failed()` ; abonnés.
- `src/core/links/web-graph.ts` : `buildWeb`, `neighborhood`, `webNodes`, `webEdges`, rayons.
- `src/core/links/web-layout.ts` : `createLayout` / `layoutWeb` : forces sans hasard, ressorts affaiblis par le degré, repousse croissante avec le nombre de nœuds, passe finale anti-chevauchement, repart des positions précédentes ; calcul par tranches de temps.
- `src/core/links/web-labels.ts` : `chooseLabels`, `shortTitle`.
- `src/core/links/web-view.ts` : zoom, pincer, cadrage, `placeActions` (place de la barre de boutons).
- `src/content/useFilteredCards.ts`, `src/content/WebPanel.tsx` : le panneau.
- `collection-view.ts`, `world-toggle.ts`, `collection-ui.tsx`, `overlay.ts` : branchement (une requête abandonnée au bout de 20 s).

Le code est commun à l'extension WXT et à l'APK Android.

## Flux de données

1. La vue s'ouvre, lit les cartes, et demande au dépôt la lecture des cartes sans entrée (les cartes affichées d'abord, puis le reste) ; un nouvel essai part toutes les 30 s tant qu'il en reste.
2. Chaque groupe de dix articles lus est écrit dans le stockage et notifie le panneau, qui recalcule le graphe puis le placement (par tranches de 12 ms, repartant du précédent) ; l'affichage est rafraîchi au plus toutes les 300 ms pendant le calcul.
3. Les liens mémorisés ne sont pas relus avant 30 jours. Un article lu sans aucun lien est mémorisé aussi.

## Erreurs et limites

- Wikipédia indisponible ou 429 : pause de 60 s, message « Wikipédia est indisponible pour l'instant : nouvel essai automatique », les liens déjà connus restent affichés.
- Stockage plein : même traitement que l'indisponibilité.
- La lecture est lente (environ 1,3 s par article, 22 minutes pour 1000 cartes) : elle se fait en arrière-plan, une fois, puis une fois par mois.
- Les liens sont ceux écrits dans l'article : deux synonymes (une redirection et sa cible) donnent deux points.

## Tests

- `wiki-links` : espace de noms, liens rouges, erreurs, article inexistant, paramètres envoyés. `links-book` / `links-repo` : fraîcheur, enregistrement par groupes, reprise après échec, stockage plein. `web-graph` : points partagés, filtres, limite, génériques, pages ignorées, voisinage. `web-layout` : déterminisme, pas de chevauchement dans un graphe dense, positions précédentes, tranches de temps identiques au calcul d'un coup. `web-labels`, `web-view` (zoom, pincer, cadrage, place de la barre).
- `WebPanel` (jsdom) : cartes et points dessinés, lecture demandée, progression, indisponibilité, barre de boutons au toucher (pas de carte en grand), mise en avant, fermeture.
- Vérifié dans un navigateur sur de vraies données (50 articles de Wikipédia FR) et sur une largeur de téléphone ; reste la vérification manuelle sur Chrome (extension rechargée) et sur l'APK.

## Hors périmètre

Exploration de pages intermédiaires (A → B → C → D hors collection), liens par attributs communs, tous les liens de l'article (références, bibliographie), lecture du wikitexte.
