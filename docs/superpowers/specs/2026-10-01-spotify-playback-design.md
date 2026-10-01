# Lecture Spotify depuis les cartes musique — conception

## Objectif

Pour une carte musique **de ma collection**, pouvoir lancer la musique sur Spotify depuis la fiche de la carte, la laisser jouer en quittant la page, et la contrôler (lecture/pause) depuis un mini-lecteur flottant visible sur toutes les pages du jeu. Le compte Spotify se lie depuis l'extension (Chrome, Firefox) et depuis l'APK Android.

Dépend de la fonction « nature / occupation » ([spec](2026-10-01-nature-occupation-filters-design.md), module `core/kinds/`) : la nature Wikidata d'une carte dit si c'est un morceau, un album ou un artiste.

## Décisions

- **Lecture = télécommande Spotify Connect** : on pilote l'appli Spotify déjà installée (téléphone ou PC) via l'API Web. Rien ne joue dans l'extension ou l'APK ; la musique continue donc seule quand on quitte la page, et s'arrête par pause. Exige Spotify Premium et un appareil Spotify actif.
- **Appariement** : identifiant Spotify lu sur Wikidata (P2207 morceau, P2205 album, P1902 artiste) ; à défaut, recherche Spotify `track:"titre" artist:"interprète"` (interprète = P175). Sans ID ni interprète : pas de bouton.
- **Contenu** :
  - Morceau → un bouton ▶.
  - Album → toutes les pistes (`GET /albums/{id}/tracks`), un ▶ par piste.
  - Artiste ou groupe → 10 titres au plus par recherche Spotify `artist:"nom"` (type `track`, `limit=10`), un ▶ par titre. `GET /artists/{id}/top-tracks` est supprimé pour les applications en mode développement (changements de février 2026), d'où la recherche ; ce n'est pas un classement officiel de popularité.
- **Cartes concernées** : nature morceau, album, artiste/groupe (table `MUSIC_KINDS`), **et** slug présent dans `wmt:collection`. Une carte hors collection n'a pas de section « Écouter ».
- **Mini-lecteur** : flottant, sur toutes les pages du jeu, titre + artiste + ▶/⏸, masquable (état mémorisé).
- **Pas de contrôle de la file d'attente, du volume, des playlists.**

## Prérequis Spotify (faits)

- Application créée sur https://developer.spotify.com/dashboard, API Web.
- **Client ID : `53483f8dd5374f1889f994488d989283`** (public, PKCE : aucun secret).
- Redirect URIs déclarées : `wikimasterstools://spotify` (APK). À ajouter à l'implémentation : l'adresse Chrome `https://<id>.chromiumapp.org/` (identifiant stabilisé par une `key` dans le manifeste) et l'adresse Firefox `https://<hash>.extensions.allizom.org/` (donnée par `browser.identity.getRedirectURL()`).

## 1. Données Wikidata (`core/music/`)

- Même requête `wbgetentities props=claims` que `core/birth/` et `core/kinds/` (`BATCH_SIZE`, `getJson`, `parseWikibaseItems`) ; on lit P175 (interprète), P2207, P2205, P1902. Libellé de l'interprète par `wbgetentities props=labels languages=fr` (repli en, puis identifiant Q écarté : sans libellé, pas de recherche).
- Stockage : clé `music-v1` (distincte des autres), par slug :
  ```ts
  type CardMusic = { trackId?: string; albumId?: string; artistId?: string; performer?: string };
  ```
  Une carte sans donnée est mémorisée vide et n'est plus redemandée. Un lot en échec n'est pas enregistré ; cooldown de 60 s comme `birth-repo`.
- Seules les cartes musique de la collection sont demandées.

## 2. Client Spotify (`core/spotify/`)

- `spotify-auth.ts` : PKCE (verifier/challenge S256, `state`), échange du code, rafraîchissement du jeton. Droits : `user-modify-playback-state`, `user-read-playback-state`.
- `spotify-api.ts` : client sur un `fetch` injecté ; `searchTrack`, `searchArtistTracks`, `albumTracks`, `play`, `pause`, `playerState`, `devices`. Une tentative de rafraîchissement sur 401, attente `Retry-After` sur 429, erreurs typées (`NoDevice`, `NotPremium`, `NotLinked`, `RateLimited`).
- `spotify-resolve.ts` (pur sauf le client) : carte + `CardMusic` + nature → `{ kind: 'track' | 'album' | 'artist', items: { uri, title, artist }[] }`.
- `spotify-session.ts` : état lié/non lié, jetons. Stockage : `browser.storage.local` dans l'extension ; `localStorage` de la surcouche dans l'APK (droits limités au pilotage de la lecture). Bouton « Délier » = effacement.

## 3. Liaison du compte

- **Extension** : nouveau service worker `entrypoints/background.ts`, permission `identity`, `host_permissions` `https://api.spotify.com/*` et `https://accounts.spotify.com/*`. Le content script envoie un message ; le service worker lance `identity.launchWebAuthFlow`, échange le code et enregistre les jetons. Tous les appels à l'API Spotify passent par le service worker (hors des règles CSP du site). Firefox Android n'a probablement pas `identity` : la liaison n'y est pas garantie, l'APK couvre le mobile.
- **APK** : `MainActivity` ouvre l'autorisation dans le navigateur du téléphone (jamais dans la WebView), reçoit `wikimasterstools://spotify?code=…` (filtre d'intent), puis le transmet à la surcouche (`evaluateJavascript`) qui finit l'échange.
- **Extension** : L'identifiant Chrome est fixé par une clé publique dans le manifeste : `mdkdnoegkdbdohmpcidefciomgdaecoj`, d'où l'adresse de retour `https://mdkdnoegkdbdohmpcidefciomgdaecoj.chromiumapp.org/` (à déclarer dans le tableau de bord Spotify ; une publication sur le Chrome Web Store donnera un autre identifiant).
- À vérifier à la main (voir le plan, tâche 10) : que la surcouche de l'APK peut appeler `api.spotify.com` depuis la page du jeu (CSP/CORS) ; sinon, passer les appels par un pont natif (hors de cette conception).

## 4. Lecture

- `play` : `PUT /me/player/play` avec `uris: [uri]` (morceau, titre d'artiste) ou `context_uri` + `offset.uri` (piste d'un album). Sans appareil actif (404) : message « Ouvre Spotify sur un de tes appareils, puis réessaie », sans transférer la lecture automatiquement.
- `pause` : `PUT /me/player/pause`.

## 5. Interface (maquettes validées)

- **Fiche de la carte (`CardPopup`)** : section « Écouter » en glyphes sous l'en-tête. Non lié : bouton « Lier Spotify ». Morceau : un ▶. Album / artiste : liste ligne à ligne (numéro, titre, ▶ ; ⏸ sur la piste qui joue).
- **Mini-lecteur** (`SpotifyPlayer.tsx`, shadow DOM, monté par le script de contenu et par `app/overlay.ts` sur toutes les pages du jeu) : pochette/note, titre, artiste, ▶/⏸, flèche pour masquer. Masqué : pastille ronde en bas à droite (note, ⏸, flèche pour rouvrir). Sondage `GET /me/player` toutes les 5 s pendant une lecture, 15 s sinon (lecteur visible ou masqué, tant que le compte est lié) ; un seul sondage actif à la fois, un sondage périmé (arrêt, nouvel appel) est ignoré. Visible seulement si une lecture existe. État masqué mémorisé (`wmt:spotifyPlayerHidden`, erreurs de stockage absorbées).
- Tout en glyphes (SVG en ligne, style du site), cibles larges, sans survol, utilisable à l'écran étroit.

## 6. Câblage

Mêmes dépendances injectées dans `entrypoints/content.tsx` et `app/overlay.ts` : `music` repo, `spotify` session/client, source d'état du lecteur.

## 7. Erreurs

Pas d'appareil (404) ; pas Premium (403) ; jeton expiré (401 → un rafraîchissement, puis « Lier Spotify ») ; limite (429, attente) ; liaison annulée (rien ne change) ; aucun résultat de recherche (« Introuvable sur Spotify », pas de bouton ▶).

## 8. Tests (vitest, faux `fetch`)

PKCE (challenge, `state`), échange et rafraîchissement ; client (corps des requêtes `play`, 401/403/404/429) ; analyse Wikidata (P175, P2207/P2205/P1902, rangs) ; résolution (ID présent, repli recherche, sans interprète) ; limite de 10 titres d'artiste ; carte hors collection ; état du mini-lecteur (sondage, masqué, rien en lecture) ; stockage indisponible. Vérification manuelle dans Chrome et sur l'APK à la fin.

## Hors périmètre

Lecture dans l'extension elle-même (Web Playback SDK), playlists, file d'attente, volume, Last.fm, Firefox Android garanti, cartes hors collection.
