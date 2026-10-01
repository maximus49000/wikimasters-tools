# Films, séries, acteurs et réalisateurs dans la fiche de la carte — conception

## Objectif

Dans la **fiche de la carte** (`CardPopup`), pour une carte **de ma collection** :

- **film ou série** : bande-annonce, note et description ;
- **acteur ou réalisateur** : sa filmographie ; un clic sur un titre remplace la fiche par celle du film (bande-annonce, description, note), avec « ← » pour revenir à la liste.

Rien ne change dans la grille, la map ou la frise : ces vues continuent d'ouvrir la même fiche. Fonctionne dans l'extension (Chrome, Firefox) et dans l'APK.

Dépend de `core/kinds/` (nature et occupation Wikidata) et suit le modèle de la section « Écouter » ([spec](2026-10-01-spotify-playback-design.md)).

## Décisions

- **Reconnaissance par Wikidata** (comme `music-kinds`), **contenu par TMDB** (API v3, `language=fr-FR`).
- **Collection seulement** : slug présent dans `wmt:collection`. Une carte hors collection n'a pas de section.
- **Lecteur de bande-annonce intégré** : miniature + ▶ ; au clic, iframe `youtube-nocookie.com/embed/<clé>`. Si l'iframe est bloquée (CSP du site, WebView), repli sur un lien externe vers YouTube. Aucune iframe n'est chargée avant le clic.
- **Navigation** : un seul popup. Le contenu bascule de la filmographie à la fiche d'un film (un niveau de retour). Pas de second popup.
- **Clé API TMDB v3** lue à la compilation depuis `WXT_TMDB_API_KEY` (`.env.local`, ignoré par git). Elle est donc lisible dans le code livré (clé en lecture seule, usage normal de TMDB v3). Sans clé : la section n'apparaît pas.
- **Attribution obligatoire** : « Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB. » dans le pied de la section et dans le README.
- Pas de nouvelle donnée envoyée sur le jeu ou le compte : seuls des titres, années et identifiants TMDB partent vers TMDB.

## 1. Reconnaissance (`core/screen/screen-kinds.ts`)

`screenKindOf(kinds: CardKinds | undefined): 'film' | 'series' | 'person' | null`

- **film** : natures film (Q11424), court métrage (Q24862), film d'animation (Q202866), téléfilm (Q506240).
- **série** : série télévisée (Q5398426), série d'animation (Q581714), mini-série (Q1259759).
- **personne** : humain (Q5) dont une occupation est acteur (Q33999), acteur de cinéma (Q10800557), de télévision (Q10798782), de doublage (Q2405480), réalisateur (Q2526255), réalisateur de télévision (Q2059704).
- Priorité : film/série avant personne ; ordre d'ajout des tables vérifié par test.
- Les identifiants Q sont vérifiés sur Wikidata pendant l'implémentation (ils sont ici des candidats).

## 2. Identifiants TMDB (`core/screen/wikidata-screen.ts`, `screen-repo.ts`)

- Même requête `wbgetentities props=claims` que `core/music/` : on lit P4947 (film TMDB), P4983 (série TMDB), P4985 (personne TMDB). `parseWikibaseItems`, `getJson`, `BATCH_SIZE` réutilisés.
- Pour une personne, on lit aussi l'occupation « réalisateur » pour savoir quelle liste afficher (déjà présente dans `kinds`).
- Stockage : clé `screen-v1`, par slug : `{ tmdbId?: number }`. Carte sans identifiant : mémorisée vide.
- **Repli** sans identifiant Wikidata : recherche TMDB (`/search/movie`, `/search/tv` ou `/search/person`) par titre ; si plusieurs résultats, on ne retient que le premier **si le titre normalisé est identique** à celui de la carte (sinon : rien, plutôt qu'un film erroné). Le résultat est mémorisé dans `screen-v1`.
- Un lot en échec n'est pas enregistré ; cooldown de 60 s, comme `music-repo`.

## 3. Client TMDB (`core/screen/tmdb-api.ts`)

Client sur un `fetch` injecté, schémas zod (un format inattendu lève, il n'est pas enregistré comme « vide »).

- `movie(id)` / `tv(id)` : `GET /movie/{id}?append_to_response=videos&language=fr-FR`. Bande-annonce : première vidéo `site=YouTube` et `type=Trailer`, `official` d'abord ; si aucune en français, seconde requête `/videos?language=en-US`. Note : `vote_average` (sur 10, arrondie à 0,1) et `vote_count` ; absente si `vote_count = 0`. Description : `overview` (vide : on n'affiche rien).
- `person(id)` : `GET /person/{id}/combined_credits?language=fr-FR`. Acteur : entrées `cast` ; réalisateur : entrées `crew` avec `job = Director`. Dédoublonnage par `(media_type, id)`, tri par date décroissante (sans date : en dernier), 40 titres au plus. Chaque entrée : `{ mediaType, id, title, year?, rating?, posterPath? }`. Une personne à la fois acteur et réalisateur voit les deux listes réunies, dédoublonnées.
- Erreurs typées : clé refusée (401), introuvable (404), limite (429, `Retry-After`), réseau.
- Cache TTL 24 h par ressource (`screen-detail-v1`, `screen-person-v1`) via `KeyValueStore`.

## 4. Service (`content/screen-service.ts`)

Sur le modèle de `music-service.ts`, dépendances injectées :

```ts
type ScreenView =
  | { status: 'none' }
  | { status: 'detail'; detail: ScreenDetail }          // film ou série
  | { status: 'filmography'; items: FilmographyItem[] } // personne
  | { status: 'error'; message: string };
view(slug, title): Promise<ScreenView>   // collection → kinds → screenKindOf → id TMDB → contenu
detail(mediaType, id): Promise<ScreenDetail | { error: string }> // clic sur un titre de la filmographie
```

## 5. Interface (maquette validée)

- `ScreenSection.tsx`, rendue par `CardPopup` sous les boutons, à côté de `ListenSection` (les deux sont exclusives : une carte est de la musique ou de l'écran). Même mécanisme `onHeight` pour réserver la hauteur dans le calcul d'échelle de la carte.
- **Détail** : `TrailerPlayer` (miniature TMDB `img.youtube.com/vi/<clé>/hqdefault.jpg`, ▶), `★ 7,8 /10 · 12 450 votes`, description sur quelques lignes (défilement au-delà).
- **Filmographie** : titre « Filmographie · N », liste défilante (affiche miniature, titre, année, ★ note). Chaque ligne est un bouton de 44 px minimum.
- **Fiche d'un film ouvert depuis la liste** : ligne `←` / titre + année / `✕`, puis le même détail. `←` rétablit la liste (position de défilement conservée).
- Tout en glyphes (`Glyphs.tsx`), sans survol, utilisable à l'écran étroit. Un `message` d'erreur d'une ligne (clé refusée, limite, hors ligne) remplace la zone, sans bloquer la fiche.
- Affiches ou miniatures bloquées par la CSP : on affiche un cadre neutre, rien d'autre ne change.

## 6. Câblage et réseau

- **Extension** : TMDB passe par le service worker, comme Spotify (hors des règles CSP du site). `FETCH_PREFIXES` de `core/spotify/transport.ts` reçoit `https://api.themoviedb.org/3/`, et `host_permissions` de `wxt.config.ts` reçoit `https://api.themoviedb.org/*`. Le préfixe est le seul ajout ; l'opération `fetch` existante est réutilisée. Pas de redirection suivie.
- **APK** : `window.fetch` direct, comme pour Spotify ; à vérifier à la main (CSP/CORS de la page du jeu).
- `src/app/overlay.ts` et `entrypoints/content.tsx` : mêmes dépendances injectées, `setScreenService` dans un `screen-registry.ts` (jumeau de `music-registry.ts`).
- `src/core/screen/config.ts` : `TMDB_API_KEY = import.meta.env.WXT_TMDB_API_KEY ?? ''`. Le script de build de l'APK (`scripts/build-apk.mjs`) doit passer la même variable à son bundle.
- Aucune permission navigateur nouvelle hors l'hôte TMDB.

## 7. Erreurs et cas limites

Pas de clé : section masquée. Carte sans identifiant ni résultat sûr : masquée. Film sans bande-annonce : note et description seules. Note sans vote : omise. Filmographie vide : « Aucun titre connu » (texte discret). 401/404/429/hors ligne : message d'une ligne, réessai au prochain affichage (cooldown 60 s). Navigation rapide (clic sur plusieurs titres) : une réponse périmée est ignorée.

## 8. Tests (vitest, faux `fetch`)

`screenKindOf` (films, séries, acteurs, réalisateurs, ni l'un ni l'autre, priorité) ; analyse Wikidata (P4947/P4983/P4985, rangs) ; client TMDB (choix de la bande-annonce, repli anglais, note sans vote, dédoublonnage et tri de la filmographie, plafond de 40, réalisateur vs acteur, 401/404/429) ; repli par recherche (titre identique accepté, différent refusé) ; service (hors collection, sans clé, détail, filmographie, erreur) ; cache TTL ; `TrailerPlayer` (pas d'iframe avant le clic, repli externe) ; navigation liste ↔ détail. Vérification manuelle dans Chrome, puis sur l'APK (iframe YouTube et affiches).

## Hors périmètre

Pastille de note dans la grille ou la map, cartes hors collection, saisons et épisodes, distribution d'un film (acteurs d'un film), avis détaillés, plusieurs bandes-annonces, notation IMDb ou Rotten Tomatoes.
