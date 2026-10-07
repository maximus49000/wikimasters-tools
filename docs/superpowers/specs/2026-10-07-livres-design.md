# Catégorie « Livres » (romans, poèmes, essais, théâtre, BD) et bibliographie des écrivains — conception

Date : 2026-10-07. Maquette (non versionnée, `.superpowers/` est ignoré) : `.superpowers/maquette-livres.html` — validée par l'utilisateur.

## But

Sur la fiche native d'une carte de livre : synopsis, informations, prix et liens d'achat (papier et ebook), lecture gratuite du texte intégral quand il est libre de droits. Sur la fiche d'un écrivain : sa bibliographie, avec la même structure et le même rendu que la filmographie d'un acteur. Une catégorie « Livres » dans le filtre de la Collection réunit toutes ces œuvres.

## Décisions de l'utilisateur

- La carte garde la vision habituelle de toutes les cartes (cadre de rareté, carte en grand, ATK/DEF) ; seule une section « Livre » s'ajoute à la fiche.
- La **couverture du livre est l'image par défaut de la carte**, en priorité quand elle existe (puis l'image habituelle) ; elle passe devant les images de remplacement.
- Le **synopsis est grand** (16 px bureau, 15 px mobile, encadré défilant, lien vers l'article complet).
- Comme pour les jeux vidéo et la musique : section avec un **glyphe** « livre » en en-tête et un glyphe ⇄ « Changer de livre » ; glyphes de l'application plutôt que du texte ou des émojis.
- Prix : « quand disponible, sinon liens d'achat par ISBN / titre », avec les libraires français (Fnac, Decitre, Amazon, librairie indépendante) pour le papier.
- Section placée comme film / série / jeu : sous les étiquettes, après « Mauvaise image », avant ATK/DEF ; ordre des sections : écouter, écran, jeu, **livre**, image.

## Hors périmètre (phase 1)

- Bibliothèque personnelle, « livre lu », notes et avis des lecteurs.
- Lecteur de texte intégré : « Lire gratuitement » ouvre la source dans un onglet.
- Prix des libraires autres que ceux listés ; API d'affiliation.
- Livres audio.

## Faits vérifiés (sondage du 2026-10-07)

- **Wikidata** : les œuvres d'un auteur (`?w wdt:P50 wd:Qauteur`) sont bruyantes sans filtre ; avec `wikibase:sitelinks >= 8` et un tri décroissant, Victor Hugo donne *Les Misérables, Notre-Dame de Paris, L'Homme qui rit, Quatrevingt-treize…* (bonne « filmographie »). P648 (Open Library), P50 (auteur), P2034 (Gutenberg), liens Wikisource ; P212 (ISBN-13) est souvent absent côté œuvre.
- **Open Library** (sans clé, CORS ouvert) : `search.json` renvoie couvertures (`cover_i`), `has_fulltext` et identifiants Internet Archive (`ia`) → lecture en ligne ; `covers.openlibrary.org/b/isbn/…-L.jpg`.
- **Wikisource FR** : texte intégral des poèmes et classiques (recherche `action=query&list=search`). Gutendex est pauvre en français.
- **Google Books** : **sans clé, quota 0/jour** ; avec clé (`WXT_GOOGLE_BOOKS_API_KEY`, dans `.env.local`, restreinte à Books API) : `saleInfo.listPrice` en euros **pour les ebooks seulement** (jamais le papier), résultats bruyants (essais, résumés, éditions scolaires) ; le paramètre `fields` a été rejeté ; `isbn:` n'a rien renvoyé → recherche par titre + auteur, puis filtrage.
- **Libraires** (script, sans navigateur) : Amazon.fr lisible (7,60 € pour *L'Étranger*, Folio) ; **Fnac et Decitre : 403** (protection anti-robot) ; Cultura/Leclerc : prix chargés en JavaScript ; Place des libraires : pas de prix lisible.
- **Prix unique du livre** (loi Lang) : le prix neuf papier est fixé par l'éditeur, identique chez tous les vendeurs (remise ≤ 5 %). Un seul prix de référence suffit donc pour le papier.

## Résolution d'une carte (ordre de priorité)

1. La carte est une œuvre écrite (natures Wikidata regroupées sous « Livre », voir Filtre) ; sinon aucune section.
2. Wikidata par lots de 50 titres (comme `wikidata-game.ts`) : P648, P50 (auteur), P2034, lien Wikisource FR, date, genres.
3. Open Library (identifiant P648, sinon recherche titre + auteur stricte) : couverture, éditions, ISBN, `ia`.
4. Texte de présentation : extrait d'introduction de l'article Wikipédia FR de la carte ; à défaut, description Open Library.
5. Recherche par titre : retenue seulement si titre normalisé identique **et** auteur concordant ; au moindre doute, aucune donnée de catalogue (la section reste affichée avec le glyphe pour corriger).
6. Le résultat (y compris « rien ») est mémorisé.

## Modèle commun

```ts
type BookDetail = {
  id: string;                     // identifiant Open Library de l'œuvre (OL…W) ou, à défaut, slug de la carte
  title: string;
  originalTitle?: string;
  author?: { name: string; slug?: string };   // slug = carte de l'écrivain quand elle existe
  year?: number;
  publisher?: string;
  pages?: number;
  isbn?: string;                  // ISBN-13 de l'édition de référence
  genres: string[];
  synopsis?: { text: string; url: string; source: 'wikipedia' | 'openlibrary' };
  cover?: string;
  price?: { paper?: PriceLine; ebook?: PriceLine };
  shops: ShopLink[];              // Amazon, Fnac, Decitre, librairie indépendante, Google Play
  reading?: ReadingLink[];        // Wikisource, Internet Archive, Gutenberg ; vide si protégé
  copyrightUntil?: number;        // année estimée de passage au domaine public (France, auteur + 70 ans)
};
type PriceLine = { amount: number; currency: 'EUR'; source: string; readAt: number };
type ShopLink = { shop: string; url: string; price?: PriceLine; kind: 'paper' | 'ebook' };
```

## Prix : règles

- **Prix de référence papier** (« 7,60 € ») : le premier prix papier lu avec succès ; affiché une fois en grand avec la mention du prix unique du livre. Sans prix lu, la zone est omise (jamais de prix inventé).
- **Lignes de vendeurs** : prix affiché quand il est lu, sinon « voir le prix ↗ » vers la page de l'ISBN (ou la recherche par titre + auteur sans ISBN). Liens construits à partir de l'ISBN-13.
- **Ebook** : Google Books (clé) ; édition retenue = titre et auteur concordants, `saleability = FOR_SALE`, la moins chère des éditions du même texte ; lien `buyLink`.
- **Lecture directe d'Amazon.fr** (isolée dans `retail-price.ts`, désactivable d'un seul réglage) : une requête par fiche ouverte, mémorisée 7 jours, repli silencieux sur « voir le prix » en cas d'échec ou de page inattendue. Risque : lecture de page non prévue par les conditions d'Amazon, fragile à tout changement ; Fnac/Decitre restent en liens (403). À confirmer à la relecture de ce document ; sur Android, liens seulement tant que le pont HTTP natif n'est pas éprouvé.
- Pas de prix de livre numérisé gratuit.

## Lecture gratuite

- Disponible si une source libre existe : Wikisource FR (lien Wikidata ou recherche stricte), Internet Archive (`has_fulltext` + `ia`), Gutenberg (P2034).
- Bouton principal « Lire gratuitement » (source la plus lisible d'abord : Wikisource, Gutenberg, Internet Archive) ; les autres sources en lignes secondaires.
- Sinon : ligne grisée « Pas de texte libre », avec « protégé jusqu'en AAAA » quand la date de décès de l'auteur est connue (+ 70 ans, droit français).

## Fiche écrivain

- Une carte « Personne » dont l'occupation est écrivain / poète / romancier / dramaturge / scénariste de bande dessinée reçoit une section « Bibliographie » ; **même structure et même rendu graphique que la filmographie** de `ScreenSection.tsx` (`FilmographyItem` → `BookshelfItem`).
- Liste verticale compacte : en-tête (glyphe livre, « Bibliographie », `· N`), puis une ligne par œuvre de 44 px minimum, séparée par un trait : petite couverture 26×38, titre (une ligne, ellipse), année, et à droite ★ + note (Open Library, sur 5, omise si absente). Liste défilante (`maxHeight: min(180px, 28vh)`), « Aucun livre connu. » si vide. Pas de grille, pas d'onglets.
- Œuvres : Wikidata `P50` avec `sitelinks >= 8` (repli à `>= 3` si moins de 6 œuvres) pour choisir les plus connues ; maximum 40, **affichées du plus récent au plus ancien**, sans doublon (éditions regroupées) ; une seule requête par auteur, mémorisée 7 jours.
- Les livres possédés sont repérés comme décrit dans « Ma collection dans les listes ».
- Un appui sur une ligne ouvre, dans la section, la fiche du livre (même contenu que `BookSection` : synopsis, prix, vendeurs, lecture) avec une flèche ← « Retour à la bibliographie » et le titre + année ; la liste est masquée (non retirée), donc son défilement est conservé au retour. Pas de navigation vers une autre carte.

## Ma collection dans les listes (bibliographie **et** filmographie)

Décision de l'utilisateur : on repère, dans la liste d'un écrivain, les livres dont on possède la carte ; la **même chose est réalisée pour la filmographie** (`ScreenSection.tsx`). Maquette : section 3.

- **Ligne d'une œuvre possédée** : miniature plus grande (30×42) **en cadre de rareté**, comme les cartes liées (`Thumb` de `LinkedCards.tsx` : couleur `--color-rarity-*`, image via `ImageService.displayUrl` — donc la couverture du livre en priorité), pastille **×N** (`KnownCard.copies`, omise si inconnu), ligne en surbrillance, titre en gras, rareté dans la ligne d'état (« 1942 · Légendaire »), et bouton **carte** (glyphe `card`, 44 px) qui ouvre la carte (même action que le choix d'une carte liée). Un appui ailleurs sur la ligne ouvre toujours la fiche du livre / du film dans la section ; sa fiche rappelle « Tu possèdes cette carte · Rareté · ×N » avec un lien vers la carte.
- **En-tête** : « 3 / 14 dans ma collection » (glyphe `card`, couleur or) et un interrupteur « Seulement ma collection » qui ne garde que les cartes possédées (compteur « 3 sur 14 », nouvel appui = liste complète). État local à la fiche, non mémorisé. Sans aucune carte possédée : ni résumé ni interrupteur.
- **Correspondance œuvre → carte (livres)** : la requête Wikidata de bibliographie renvoie aussi le titre de l'article Wikipédia FR de chaque œuvre (lien de site) = le slug de la carte ; recherche directe dans la Collection, aucune résolution supplémentaire.
- **Correspondance œuvre → carte (films et séries)** : identifiant TMDB → slug en inversant `screen-v1` (`CardScreen.movieId` / `tvId`). Les cartes de la Collection de nature film / série encore jamais résolues sont résolues en arrière-plan par lots de 50 (`screenRepo.resolve`, même file que les autres chargeurs, en respectant la limite de 200 requêtes par minute et par IP de l'API Wikipédia) ; l'affichage se complète à mesure (abonnement `subscribe`), et la liste n'attend pas.
- **Source de vérité** : `CollectionRepo` (`list` + `subscribe`), comme `LinkedSource` ; un nouveau `CollectionMarks` (`src/content/collection-marks.ts`) expose `cardOf(key)` et `count(keys)` pour les deux sections.
- **Composant commun** `WorkList.tsx` : liste (ligne, miniature, année, note, repère de collection, bouton carte, interrupteur, ouverture d'un titre avec retour ←) utilisée par `WriterSection` et `ScreenSection` ; la filmographie existante est portée sur ce composant sans changer son rendu pour les cartes non possédées.
- **Limite connue** : seules les cartes connues de la Collection (scan) sont repérées ; sans scan complet, une carte possédée mais jamais vue n'apparaît pas encore.
- Découpage : la filmographie et la bibliographie partagent ce composant ; la filmographie peut être livrée la première (sans dépendre des livres).

## Image de la carte

- Nouvelle source `sources.book.cover` dans `createMediaArt` : couverture Open Library (ISBN puis identifiant d'œuvre `cover_i`), puis miniature Google Books ; liste vide pour toute autre carte. Même place que `game` : elle passe devant l'image Wikipédia et les images de remplacement.
- Réglage Actif / Inactif d'« Paramètre d'image » appliqué ; `ART_VERSION` incrémenté pour rafraîchir les cartes déjà vues.

## Filtre « Livres »

- `kinds-book.ts` : natures regroupées sous « Livre » : Q571 (livre), Q8261 (roman) existants + œuvre littéraire (Q7725634), nouvelle (Q49084), recueil de poèmes, poème, pièce de théâtre (Q25379), essai (Q35760), bande dessinée / manga / roman graphique ; identifiants à valider sur Wikidata à l'implémentation. Onglet « Livres » du filtre : un livre n'est plus mélangé aux autres.

## Architecture

Calquée sur les jeux vidéo (`src/core/game/`, `src/content/GameSection.tsx`).

`src/core/book/`
- `config.ts` : lecture de `WXT_GOOGLE_BOOKS_API_KEY` (+ `env.d.ts`) ; sans clé, ebook et miniature Google ignorés, le reste fonctionne.
- `openlibrary-api.ts` : œuvre, éditions, auteur, recherche, couverture ; validation `zod`, erreurs typées comme `TmdbError`.
- `googlebooks-api.ts` : recherche titre + auteur, filtrage, prix ebook.
- `wikidata-book.ts` : P648 / P50 / P2034 / Wikisource / date par lots de 50 ; bibliographie d'un auteur (requête filtrée).
- `wikisource-api.ts` : recherche stricte d'un texte.
- `retail-price.ts` : lecture du prix Amazon.fr + construction des liens libraires (ISBN-13).
- `book-kinds.ts` : `isBookCard(kinds)`, `isWriterCard(kinds)`.
- `book-detail.ts`, `book-format.ts` (prix en euros, droits d'auteur), `book-repo.ts` (identifiants résolus, choix manuel `book-choice-v1`).

`src/content/`
- `book-service.ts` : `view(slug, title)` suivant l'ordre de résolution ; `TtlCache` (détail 7 jours, prix 7 jours, bibliographie 7 jours).
- `BookSection.tsx` : en-tête (glyphe `book` + ⇄), faits, synopsis, prix, vendeurs, lecture ; `WriterSection.tsx` : bibliographie en liste (calquée sur la filmographie de `ScreenSection.tsx`), avec ouverture d'un livre dans la section et retour ←. Le détail d'un livre est un composant partagé par les deux.
- `BookChoiceDialog.tsx` : « Changer de livre » (recherche Open Library + Google Books, lien collé, aperçu, « Aucun livre », retour au choix automatique) sur le modèle de `GameChoiceDialog`.
- `Glyphs.tsx` : nouveau glyphe `book` ; `mount.tsx`, `book-registry.ts`, `decorateBook`.

`wxt.config.ts` : `host_permissions` ajoutées : `https://openlibrary.org/*`, `https://covers.openlibrary.org/*`, `https://www.googleapis.com/*`, `https://fr.wikisource.org/*`, `https://www.amazon.fr/*`. Pont HTTP Android : mêmes hôtes en liste blanche.

## Interface

Maquette de référence. Section « Livre » : titre + glyphe ⇄ ; auteur (lien vers sa fiche), année · éditeur, édition (pages, ISBN) ; étiquettes de genre ; **synopsis agrandi** dans son encadré ; prix de référence papier ; lignes vendeurs (Amazon, Fnac, Decitre, librairie indépendante, Google Play) ; bloc lecture (« Lire gratuitement » ou « Pas de texte libre ») ; pied : sources et date de lecture des prix. Zones tactiles de 44 px ; même contenu sur bureau et mobile.

## Erreurs

- Échec réseau, limite ou format inattendu : message discret (`role="status"`), la fiche reste utilisable, rien n'est mémorisé comme « absent ».
- Sans clé Google Books : pas d'ebook ni de miniature de repli, aucun message d'erreur.
- Prix illisible : ligne « voir le prix ↗ ».

## Mentions

« Données : Open Library, Wikipédia, Wikidata, Google Books » ; couvertures Open Library ; date de lecture des prix ; lien vers l'article Wikipédia (CC BY-SA).

## Tests

- `core` : réponses réelles enregistrées (fixtures) pour Open Library (*L'Étranger*), Wikidata (œuvres de Camus / Hugo), Wikisource, Google Books (ebook en vente, non en vente, bruit), page Amazon ; erreurs (429, 403, format inattendu).
- `book-service` avec API simulées : résolution P648 prioritaire, repli par titre + auteur strict (rejet des homonymes), cache, absence de clé Google, prix de référence, lecture gratuite vs protégé (calcul de la date).
- `media-art` : couverture prioritaire, réglage Inactif, `ART_VERSION`.
- Composants : rendu de la section (avec / sans prix, avec / sans lecture libre), liste de bibliographie (ouverture d'un livre, retour ←), glyphe ⇄ et fenêtre de choix.
- Ma collection : `collection-marks` (slug d'un livre, identifiant TMDB inversé, copies, rareté, mise à jour à l'arrivée d'une carte) ; `WorkList` (ligne possédée / non possédée, résumé « N / M », interrupteur, absence de résumé sans carte possédée, bouton carte, ouverture + retour) ; non-régression de la filmographie existante.
- Filtre : natures « Livre » regroupées.
- Vérification manuelle : recharger l'extension, ouvrir *L'Étranger*, *Les Fleurs du mal*, un écrivain ; Android (APK à la demande) ; `npm run build` à chaque étape.
- Guide : fiche WikiHow (`entries.ts`) dans la même PR.

## Risques

- Lecture d'Amazon.fr : fragile et hors conditions d'usage ; isolée, désactivable, repli par liens.
- Clé Google Books embarquée dans le build (même risque que TMDB / IGDB) ; restreinte à Books API, régénérable.
- Qualité de l'appariement carte → livre : exiger titre et auteur concordants ; le glyphe ⇄ permet de corriger.
- Bibliographie : `sitelinks >= 8` peut écarter des œuvres de petits auteurs (repli à 3) ; requêtes SPARQL à garder sous les limites de Wikidata.
