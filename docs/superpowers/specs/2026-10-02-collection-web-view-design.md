# Vue « Toile d'araignée » — design

Nouvelle vue de la page Collection, à côté de Homemade, Monde, Chronologique et la Grille du site. Elle relie les cartes par les articles Wikipédia qu'elles citent. Maquette validée le 2026-10-02 ; ce document décrit ce qui est livré (les écarts avec la première version du design sont expliqués plus bas).

## Besoin

- Pour chaque carte de la Collection, récupérer ses liens vers des articles Wikipédia FR, et les mémoriser avec la carte source (slug).
- Le graphe est biparti : des **cartes** et des **points** (articles Wikipédia). Un trait relie une carte à chaque point qu'elle cite. Un point n'est affiché que s'il relie **au moins deux cartes visibles**, quel que soit le nombre de liens.
- Pas d'exploration des pages hors collection : seuls les liens sortants des cartes sont lus. Un article qui est lui-même une carte de la Collection s'affiche comme carte : si une carte en cite une autre, un trait **en pointillés** les relie (c'est ce qui permet les enchaînements carte → carte → point → carte).
- Une carte sans trait n'est pas dessinée.
- La vue respecte les filtres existants (rareté, étiquette, nature, occupation, ×2) comme Monde et Chronologique.

### Quels liens : ceux de l'introduction, lus dans le wikitexte

La première version du design lisait **tous** les liens de chaque article. Mesuré sur 50 articles réels de la Wikipédia FR, un article compte en moyenne **1000 liens** (50 420 pour 50 articles) ; 82 % des titres ne sont cités qu'une fois, et les points les plus partagés sont du bruit bibliographique (ISBN 88 %, « Autorité (sciences de l'information) » 92 %, « Le Monde »). Stocker cela pèserait une quinzaine de Mo pour 1000 cartes (impossible dans le `localStorage` de l'appli Android) et la toile serait illisible.

On lit donc les liens de **l'introduction** de chaque article (résumé et infobox : genre, métier, lieu, époque…).

**Comment : le wikitexte, 50 articles par requête.** Deux façons de lire l'introduction ont été comparées sur 50 articles réels (albums, chanteurs, pages au hasard) :
- `action=parse&section=0&prop=links` : un article par requête (~1 s), liens rendus par les modèles ; 29 liens en moyenne.
- `action=query&prop=revisions&rvprop=content&rvsection=0&titles=A|B|…` : **50 articles par requête** (619 ms pour 50), les liens `[[Cible]]` extraits du wikitexte ; 19 liens en moyenne, 98 % de précision, 63 % des liens de `parse`. Ce que le wikitexte ne voit pas, ce sont les liens que les modèles fabriquent : les libellés d'infobox (« Genre musical » 31 albums sur 50, « Label discographique » 28, « Album (musique) » 23, « Format de fichier audio » 11), les termes d'astronomie des fiches d'astéroïdes, l'ISBN, et les dates (« 2012 en musique », « Août 2012 »). Les libellés sont du bruit (c'est précisément ce qui reliait tous les albums entre eux) ; les dates sont une perte réelle mais mineure. Pour des personnes (Kamini, Édith Piaf), tous les liens thématiques sont retrouvés (genre, métier, lieu, labels, chansons).

Le wikitexte l'emporte : **45 requêtes pour 2233 cartes** au lieu de 2233 (voir la limite de Wikipédia ci-dessous).

### La limite de Wikipédia : 200 requêtes par minute

Mesuré depuis un navigateur (même type de requête que l'extension), `parse` un article à la fois :

| Lecteurs en parallèle | 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Requêtes par seconde (48 à 192 requêtes) | 1,8 | 3,3 | 5,1 | 7,1 | 9,3 à 10,4 | 13,0 | 20,6 | 27,5 |
| Erreurs | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **136 en 429 sur 192** |

Ces essais courts masquaient la vraie limite. Sur 60 secondes d'affilée : 4 lecteurs (6,3 par seconde) passent (383 requêtes, mais à cheval sur deux minutes d'horloge) ; 6 lecteurs (10 par seconde) passent exactement **200 requêtes** en 20 s puis tout est refusé. La mesure du blocage (trois cycles, une requête de sonde par seconde) : le quota se rétablit pile à chaque minute d'horloge (08:59:00, 09:00:00, 09:01:00) après 196 à 199 requêtes acceptées. **Wikipédia accorde donc 200 requêtes par minute d'horloge et par IP, toutes requêtes confondues** (celles des autres vues de l'extension, `kinds`, `geo`, `birth`…, comptent aussi).

Conséquence : avec un article par requête, la meilleure parallélisation soutenue sans erreur est **2 lecteurs** (≈ 3,3 requêtes par seconde, soit les 200 par minute) ; plus de lecteurs n'accélère rien et provoque des 429 jusqu'à la minute suivante. D'où les lots de 50 articles : la parallélisation importe peu quand 45 requêtes suffisent (deux lecteurs, dix secondes).

## Affichage

- Graphe libre, zoomable et déplaçable (glisser, pincer, Ctrl + molette, boutons + − ⤢), placement automatique par forces.
- **Zoomer écarte les nœuds sans les grossir** : une carte ne dépasse jamais sa taille de départ (34 px) à l'écran, comme un repère de la vue Monde ; dézoomé, les nœuds rétrécissent avec les distances pour ne pas se chevaucher. Cartes : vignettes (image du jeu, sinon image de remplacement déjà trouvée par le service d'images, sinon initiales ; simple pastille de la couleur de la rareté quand elles sont très petites). Points : disques d'autant plus gros qu'ils relient de cartes, de la même façon.
- Les noms gardent la même taille à l'écran. Ils sont choisis par ordre d'importance et ne sont gardés que s'ils ne recouvrent pas un autre nom : les nœuds mis en avant d'abord, puis les cartes (à partir du zoom 1), puis les points du plus au moins partagé.
- Bouton « Toile » dans `VIEWS` (`world-toggle.ts`), icône seule (Lucide « network »), sur extension et mobile.
- Toucher un **point** : met en avant ses cartes (et atténue le reste), avec une phrase sous la toile (« Rock relie 31 cartes : … ») ; toucher à nouveau, ou le fond, retire la mise en avant.
- Toucher une **carte** : **pas de carte en grand** (elle masquerait la toile). Seuls les boutons d'ouverture, 📈 « Voir le marché » (`onOpen`) et 🃏 « Ouvrir la carte » (`onOpenCard`), apparaissent **au-dessus de la carte**, dans une petite barre de deux boutons de 44 px (sous la carte quand le haut manque de place). La barre suit la carte au zoom et au glissement. La carte, ses points et les cartes qu'elle cite restent mis en avant. Elle se referme en touchant la même carte, le fond, un point, avec Échap, ou après un bouton.
- Toucher un nœud **fige le cadrage** : la lecture des liens continue, la toile ne doit pas glisser sous le doigt.
- Avancement visible tant que des cartes restent à lire (« Liens lus : 120 / 300 cartes… »), la toile se complète au fil de l'eau.

## Quels points afficher

- Au plus **300** points (`MAX_HUBS`), les plus partagés ; le texte sous la toile indique combien sont masqués.
- Un point « générique », cité par plus de 30 % des cartes affichées (et par au moins 30 cartes, `GENERIC_SHARE`, `GENERIC_MIN`), relie tout et n'apprend rien : il passe après les autres et n'est affiché que s'il reste de la place sous la limite. Une petite Collection n'est donc pas touchée.
- Quelques pages qui ne disent rien du sujet sont ignorées : identifiants (ISBN, ISSN, DOI), bibliothèques et archives (Internet Archive, BnF, SUDOC, VIAF, WorldCat), Wikidata, Wikimedia Commons, alphabet phonétique (« API a »…), sources de la critique citées dans la fiche d'un album (AllMusic, Metacritic, Pitchfork, Rolling Stone).

## Architecture

Calquée sur la vue Monde (`geo`).

- `src/core/links/wiki-links.ts` : `fetchLeadLinks(fetch, slugs)` : au plus 50 titres par requête (`LEAD_BATCH`), `redirects=1`, suite de la réponse suivie (`rvcontinue`) ; un lot dont les titres rendraient l'adresse trop longue (> 6000 caractères encodés) est coupé en plusieurs requêtes ; `extractLeadLinks(wikitexte)` : cibles des `[[…]]`, sans fichiers, catégories, liens vers un autre wiki, commentaires ni notes de bas de page, première lettre en majuscule. Un article inexistant, invalide ou sans introduction donne une liste vide ; toute erreur ou réponse inattendue lève.
- `src/core/links/links-book.ts` : état : dictionnaire partagé de titres + identifiants par carte (`{ at, links }`), fraîcheur 30 jours, 400 liens au plus par carte.
- `src/core/links/links-repo.ts` : clé de stockage **`links-v2`** (les `links-v1`, lus avec `parse`, sont laissés de côté) ; lots de 50 articles (`BATCH_SIZE`), 2 lecteurs (`CONCURRENCY`), 150 ms entre deux requêtes d'un même lecteur ; chaque lot est écrit dès qu'il est lu ; les articles sont marqués « pris » dès qu'ils sont dans un lot (une demande répétée en cours de lecture ne les relit pas) ; pause de 60 s après un échec (429, hors ligne, stockage plein), les lots lus avant l'échec sont gardés ; `failed()` ; abonnés.
- `src/core/links/web-graph.ts` : `buildWeb`, `neighborhood`, `webNodes`, `webEdges`, rayons, points génériques, pages ignorées.
- `src/core/links/web-layout.ts` : `createLayout` / `layoutWeb` : forces sans hasard, ressorts affaiblis par le degré, repousse croissante avec le nombre de nœuds, passe finale anti-chevauchement ; calcul par tranches de temps. **Incrémental** : quand la toile grandit (90 % des nœuds déjà placés sont encore là), ils sont figés et seuls les nouveaux se placent, près de leurs voisins ; un graphe qui change beaucoup (filtre) repart de zéro. Mesuré : un placement par forces relancé sur lui-même dérive de 40 à 90 px à chaque fois (il ne se stabilise jamais tout à fait), d'où le figement.
- `src/core/links/web-labels.ts` : `chooseLabels`, `shortTitle`. `src/core/links/web-view.ts` : zoom, pincer, cadrage, `placeActions`.
- `src/content/useFilteredCards.ts`, `src/content/WebPanel.tsx` : le panneau.
- `collection-view.ts`, `world-toggle.ts`, `collection-ui.tsx`, `overlay.ts` : branchement (une requête abandonnée au bout de 20 s).

Le code est commun à l'extension WXT et à l'APK Android.

## Flux de données

1. La vue s'ouvre, lit les cartes, et demande au dépôt la lecture des cartes sans entrée (les cartes affichées d'abord, puis le reste) ; un nouvel essai part toutes les 30 s tant qu'il en reste.
2. Chaque lot de 50 articles lus est écrit dans le stockage et notifie le panneau, qui recalcule le graphe puis le placement (par tranches de 12 ms, incrémental) ; l'affichage est rafraîchi au plus toutes les 300 ms pendant le calcul, et pas du tout si rien n'a bougé.
3. Les liens mémorisés ne sont pas relus avant 30 jours. Un article lu sans aucun lien est mémorisé aussi.

## Erreurs et limites

- Wikipédia indisponible ou 429 : pause de 60 s, message « Wikipédia est indisponible pour l'instant : nouvel essai automatique », les liens déjà connus restent affichés.
- Stockage plein : même traitement que l'indisponibilité.
- Toute la Collection (2233 cartes) se lit en 45 requêtes, une dizaine de secondes ; relue une fois par mois.
- Les 200 requêtes par minute et par IP sont partagées avec les autres vues. **Piste, hors de ce chantier** : `geo` fait une requête par carte (`prop=coordinates`, 2233 requêtes pour la vue Monde, soit onze minutes au mieux), alors que l'API accepte 50 titres par requête.
- Les liens sont ceux écrits dans l'article : deux synonymes (une redirection et sa cible) donnent deux points ; les liens rouges (pages inexistantes) sont lus mais restent seuls, donc jamais affichés.

## Tests

- `wiki-links` : extraction (cibles, ancres, espaces de noms, commentaires, notes, légendes, titres avec « : », accents), redirections, suite de la réponse, lot coupé, erreurs. `links-book` / `links-repo` : fraîcheur, lots, parallélisme limité, pas de doublon pendant une lecture, reprise après échec, clé `links-v2`, stockage plein. `web-graph` : points partagés, filtres, limite, génériques, pages ignorées, voisinage. `web-layout` : déterminisme, pas de chevauchement dans un graphe dense, nœuds figés quand la toile grandit, relance identique, graphe qui change beaucoup, tranches de temps identiques au calcul d'un coup. `web-labels`, `web-view` (zoom, pincer, cadrage, place de la barre).
- `WebPanel` (jsdom) : cartes et points dessinés, lecture demandée, progression, indisponibilité, images (jeu, remplacement, option coupée), barre de boutons au toucher (pas de carte en grand), mise en avant, fermeture.
- Vérifié dans un navigateur : données fictives, vraie API (300 albums, 6 requêtes), largeur de téléphone, échec réseau ; et dans Chrome avec l'extension chargée et la vraie Collection (2233 cartes). Reste à revérifier dans Chrome après cette version (lots de 50, placement figé).

## Hors périmètre

Exploration de pages intermédiaires (A → B → C → D hors collection), liens par attributs communs, tous les liens de l'article (références, bibliographie), liens fabriqués par les modèles (dates, libellés d'infobox).
