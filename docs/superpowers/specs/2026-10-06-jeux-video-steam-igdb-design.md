# Section « Jeu vidéo » (Steam, IGDB en repli) — conception

Date : 2026-10-06. Maquettes : `.superpowers/maquette-jeux-video.html`, `.superpowers/maquette-jeux-video-fiche.html`.

## But

Sur la fiche native d'une carte de jeu vidéo, afficher une section avec la bande-annonce, la note, les informations publiques du jeu, la bande originale (comme pour les films) et un lien vers la page du jeu. Source prioritaire : Steam ; à défaut de correspondance : IGDB (jeux anciens SNES, Game Boy, etc.).

## Hors périmètre (phase 1)

- Liaison du compte Steam, bibliothèque, « jeu possédé » (voie envisagée plus tard : clé API personnelle + SteamID saisis dans les réglages ; `GetOwnedGames` exige une clé et un profil public).
- Succès, captures d'écran, DLC, avis détaillés.
- Plateformes d'écoute autres que Spotify et Tidal pour la BO.

## Faits vérifiés (2026-10-06)

- Steam, sans clé : `store.steampowered.com/api/appdetails?appids=ID&l=french&cc=fr`, `store.steampowered.com/appreviews/ID?json=1&language=all&purchase_type=all&num_per_page=1`, `store.steampowered.com/api/storesearch/?term=…&l=french&cc=fr`, `api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=ID`. Aucun en-tête CORS (la permission d'hôte de l'extension suffit). `appdetails` n'est pas documenté officiellement ; limite non officielle d'environ 200 requêtes par 5 minutes.
- Bandes-annonces Steam : `movies[]` en `hls_h264` / `dash_h264` / `dash_av1` seulement (plus de mp4/webm). Chrome ne lit pas le HLS seul : hls.js nécessaire (lecture vérifiée dans la maquette).
- IGDB : jeton Twitch par `client_credentials` (`id.twitch.tv/oauth2/token`, ~60 jours), `POST https://api.igdb.com/v4/games` (Apicalypse), environ 4 requêtes par seconde, sans CORS. Identifiants dans `.env.local` : `WXT_IGDB_CLIENT_ID`, `WXT_IGDB_CLIENT_SECRET`. Test réussi.
- Wikidata : P1733 (Steam) sur 129 204 jeux vidéo sur 190 434 ; P5794 (IGDB) sur 154 196.
- La recherche IGDB par titre renvoie d'abord des jeux de fans (« Super Metroid » → « Super Metroid Arcade ») : l'identifiant Wikidata est la voie normale, la recherche est un dernier recours strict.

## Résolution d'une carte (ordre de priorité)

1. La carte est un jeu vidéo (Q7889, déjà dans `kinds-book.ts`) ; sinon aucune section.
2. Wikidata, par lots de 50 titres comme `wikidata-screen.ts` : P1733 (Steam), P5794 (IGDB).
3. P1733 présent → détail Steam.
4. Sinon P5794 présent → détail IGDB.
5. Sinon recherche par titre nettoyé : Steam (`storesearch`) d'abord, puis IGDB. Un résultat n'est retenu que si son titre normalisé est égal au titre cherché ; à égalité, le plus connu (nombre d'avis) ; au moindre doute, aucune section. Le résultat (y compris « rien ») est mémorisé.
6. Rien trouvé → aucune section, sans message.

## Correction « Ce n'est pas le bon jeu »

Sur toute fiche, qu'elle vienne de Steam ou d'IGDB, un bouton « Ce n'est pas le bon jeu » (glyphe + libellé, zone tactile de 44 px) ouvre une fenêtre de propositions, sur le modèle de la recherche de BO (`SoundtrackDialog`) :
- Candidats : résultats des deux recherches (Steam `storesearch` puis IGDB) sur le titre de la carte, hors le jeu actuel (nom, source, plateformes, année, jaquette) ; Steam d'abord, puis IGDB, chaque groupe du plus connu au moins connu ; champ de recherche libre pour taper un autre titre.
- Choisir un candidat : il remplace le jeu de cette carte. Le choix est mémorisé par carte (`game-choice-v1`, clé = slug) et prime sur la résolution automatique, y compris sur les identifiants Wikidata.
- Aucune autre proposition : la fenêtre l'indique (« Aucune autre proposition ») et propose « Ne rien afficher » : la section de cette carte reste vide (aucune section), choix mémorisé lui aussi. Comme la section n'est plus visible, un réglage permet de revenir au choix automatique (« Jeux vidéo : oublier mes corrections », dans les réglages de la collection, où figurent déjà les autres réglages).
- Une correction manuelle est toujours possible, même quand l'identifiant vient de Wikidata (il peut être faux).

### Saisie et sélection manuelles

Un second bouton, « Choisir moi-même » (toujours disponible, sur les fiches Steam comme IGDB, et aussi quand aucune section n'est affichée grâce au réglage ci-dessus), ouvre la même fenêtre en mode manuel :
- Champ de recherche libre : l'utilisateur tape un titre ; les résultats viennent des deux sources, Steam d'abord puis IGDB, chaque ligne indiquant sa source (nom, année, plateformes, jaquette). Il sélectionne la bonne fiche.
- Champ « lien » : coller l'adresse d'une page `store.steampowered.com/app/<id>/…` ou `igdb.com/games/<slug>` ; l'identifiant est lu (le slug IGDB est converti en identifiant par une requête) et la fiche s'affiche en aperçu avant validation. Une adresse non reconnue affiche « Adresse non reconnue ».
- Valider : le jeu choisi remplace celui de la carte, mémorisé comme toute correction (`game-choice-v1`, avec sa source).
- La fenêtre a un bouton de fermeture et un retour au choix automatique ; zones tactiles de 44 px, mêmes réglages que la fenêtre de BO.

## Modèle commun

```ts
type GameDetail = {
  source: 'steam' | 'igdb';
  id: number;                        // appid Steam ou id IGDB
  title: string;
  originalTitle?: string;            // pour la recherche de BO
  year?: number;
  summary?: string;
  genres: string[];
  platforms: string[];               // IGDB ; Steam : Windows/Mac/Linux
  developers: string[];
  releaseDate?: string;              // texte localisé
  rating?: { percent: number; verdict?: string; count: number }; // Steam : % positif ; IGDB : note /100
  metascore?: { score: number; url?: string };
  price?: string;                    // Steam seulement
  playersOnline?: number;            // Steam seulement
  trailer?: { kind: 'hls'; url: string; poster?: string } | { kind: 'youtube'; key: string };
  pageUrl: string;                   // store.steampowered.com/app/ID ou page IGDB
};
```

## Architecture

Calquée sur les films (`src/core/screen/`, `src/content/ScreenSection.tsx`).

`src/core/game/`
- `config.ts` : lecture de `WXT_IGDB_CLIENT_ID` / `WXT_IGDB_CLIENT_SECRET` (+ `env.d.ts`).
- `steam-api.ts` : `detail(appid)` (appdetails + appreviews + joueurs en ligne), `search(title)` ; validation `zod`, erreurs typées (`rate-limited`, `not-found`, `http`) avec messages français, comme `TmdbError`. Un `appdetails` avec `success: false` (jeu retiré, barrière d'âge) vaut « introuvable ».
- `igdb-api.ts` : jeton Twitch mis en cache (renouvelé avant expiration), `detail(id)`, `search(title)` ; file d'attente pour rester sous 4 requêtes par seconde.
- `wikidata-game.ts` : P1733 / P5794 par lots de 50, mêmes garde-fous que `wikidata-screen.ts` (un format inattendu lève, il n'est pas mémorisé comme « absent »).
- `game-kinds.ts` : `isGameCard(kinds)`.
- `game-detail.ts` : le type `GameDetail` et les conversions Steam → `GameDetail`, IGDB → `GameDetail`.
- `game-format.ts` : mise en forme (pourcentage, nombre d'avis, prix, joueurs, date).
- `game-repo.ts` : mémorisation des identifiants résolus, comme `screen-repo.ts`, et des corrections de l'utilisateur (`game-choice-v1`).

`src/content/`
- `game-service.ts` : `view(slug, title)` suivant l'ordre de résolution ; `TtlCache` pour les détails (Steam : détail 24 h, note et joueurs en ligne 1 h ; IGDB : 7 jours).
- `GameSection.tsx` + montage via `createNativeSections` (`mount.tsx`), `decorateGame` comme `decorateScreen`, `game-registry.ts` ; posé sous « Mauvaise image », avant ATK/DEF.
- `GameChoiceDialog.tsx` : fenêtre « Ce n'est pas le bon jeu » (propositions, recherche libre, « Ne rien afficher »).
- `HlsTrailerPlayer.tsx` : lecteur `<video>` + hls.js (chargé à la demande) ; `TrailerPlayer` existant pour YouTube.
- `SoundtrackButton.tsx` : prend un type plus large (`{ key, title, originalTitle }`) au lieu de `ScreenDetail` ; clé `game:<source>:<id>` ; mêmes règles (rien sans compte lié, mémorisation `soundtracks-v1`).

`wxt.config.ts` : `host_permissions` ajoutées : `https://store.steampowered.com/*`, `https://api.steampowered.com/*`, `https://id.twitch.tv/*`, `https://api.igdb.com/*`.

## Interface

Maquette de référence : section « Jeu vidéo » dans la fiche, sans bordure de maquette. De haut en bas : ligne BO (si connue), bande-annonce, note (Steam : % + verdict + nombre d'avis, Metascore ; IGDB : note /100), genres, faits (prix, joueurs en ligne, studio, sortie, plateformes), bouton « Page Steam ↗ » ou « Fiche IGDB ↗ » (zone tactile de 44 px), mention de la source. Même contenu sur bureau et mobile ; glyphes de l'application plutôt que du texte. Lecteur HLS : à vérifier sur Android (WebView).

## Erreurs

- Sans identifiants IGDB (build sans `.env.local`) : l'étape IGDB est ignorée, Steam fonctionne seul.
- Échec réseau, limite de débit ou format inattendu : message discret dans la section (`role="status"`), la fiche reste utilisable, rien n'est mémorisé comme « absent ».
- Pas de bande-annonce : la ligne est omise.

## Mentions

Pied de section : « Données : Steam » ou « Données : IGDB.com » (condition d'usage IGDB), « Metascore : Metacritic ». IGDB : usage gratuit non commercial.

## Tests

- `core` : réponses réelles enregistrées (fixtures, comme `tidal-fixtures`) pour Steam (Elden Ring), IGDB (jeu ancien), Wikidata ; cas d'erreur (429, 401, `success: false`, format inattendu).
- `game-service` avec API simulées : Steam prioritaire sur IGDB, repli IGDB, recherche par titre stricte (rejet des homonymes), cache, absence d'identifiants IGDB.
- Saisie manuelle : recherche sur les deux sources, lecture d'une adresse Steam ou IGDB (valide, invalide, slug IGDB), aperçu avant validation.
- Correction : choix mémorisé prioritaire sur Wikidata, aucune proposition → « Ne rien afficher », retour au choix automatique.
- Composants : rendu de la section (avec/sans bande-annonce, avec/sans Metascore), bouton BO pour un jeu.
- Vérification manuelle : recharger l'extension dans Chrome, ouvrir un jeu Steam et un jeu ancien ; Android : appels réseau et lecteur HLS ; `npm run build` à chaque étape.

## Risques

- `appdetails` non documenté : un changement de format est détecté par `zod` et affiché comme erreur, pas comme absence.
- Secret IGDB embarqué dans le build (même risque que Tidal) ; régénérable à tout moment.
- Poids de hls.js (chargé à la demande pour ne pas alourdir les pages sans jeu).
- Barrière d'âge Steam : certains jeux n'ont pas de données sans cookie ; ils retombent sur IGDB.
