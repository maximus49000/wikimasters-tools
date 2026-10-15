# Lecture Spotify par le SDK Android App Remote — design

Date : 2026-10-15. Sections 1 à 4 validées (commencée sur un ordinateur, terminée sur un autre). Prochaine étape : plan d'implémentation (writing-plans).

## Problème

Sur l'APK, lancer une musique échoue souvent. La lecture passe par la Web API (`PUT /me/player/play`), qui dépend de la liste des appareils Spotify Connect :

- quand Spotify est en veille sur le téléphone, il peut être listé sans accepter la lecture ; la branche « téléphone en priorité » (`preferredDeviceId`, `spotify-api.ts`, commit `ef14580`) n'a alors aucun repli, et chaque relance vise de nouveau le téléphone ;
- tout 403 s'affiche « Spotify Premium requis », alors que Spotify renvoie aussi 403 quand il refuse la lecture sur un appareil ;
- l'APK bascule vers l'appli Spotify (`launchApp`) puis relance 8 fois en 12 s.

## Décisions

- **Portée B : télécommande complète sur l'APK.** Le SDK App Remote gère lecture, pause, reprise et état du lecteur. La Web API ne sert plus qu'à la recherche, aux pochettes et en **repli** quand le SDK est indisponible. Aucune limite d'appels (429) côté SDK.
- **Liste de titres hors album :** le SDK lance le titre choisi puis ajoute les suivants, **10 au plus**, à la file d'attente Spotify (`queue`). Albums et playlists : `skipToIndex(contexte, position)`.
- **Architecture option 1 :** un module séparé `src/core/spotify/remote-playback.ts` qui imite `play` / `pause` / `playerState` de la Web API ; `spotify-api.ts` et ses tests ne changent pas, et le SDK ne passe jamais par la file d'appels ni par les pauses par famille.
- **Signature :** on garde la clé de debug du poste qui construit les APK (`build.gradle.kts`, `signingConfig = debug`). L'empreinte SHA-1 reste stable tant qu'on construit sur ce poste ; en changer obligerait chaque utilisateur à mettre à jour sa clé.
- **Livraison en correctif de production**, sans les évolutions non publiées de `main` (voir « Livraison »).
- Extension (ordinateur) : rien ne change.

## Section 1 — côté Android (validée)

**Compilation**
- `spotify-app-remote-release-0.8.0.aar` (GitHub de Spotify, `spotify/android-sdk`) dans `android/app/libs/`.
- `android/app/build.gradle.kts` : `implementation(files("libs/spotify-app-remote-release-0.8.0.aar"))` et `implementation("com.google.code.gson:gson:…")` (requis par le SDK).
- `AndroidManifest.xml` : `<queries><package android:name="com.spotify.music"/></queries>` (sinon Android 11+ cache Spotify au SDK ; minSdk = 30).

**Nouvelle classe `SpotifyRemote.java`** (à côté de `Updater.java`) ; `MainActivity` ne fait que l'exposer à la page sous `WmtSpotifyRemote` (MainActivity diverge entre `production` et `main` : la toucher le moins possible).
- `connect(id, clientId, redirectUri)` : `SpotifyAppRemote.connect` avec `showAuthView(true)` (écran d'accord la première fois). Client ID = clé personnelle enregistrée ; adresse de retour = celle déjà déclarée (`wikimasterstools://spotify`, ou `wikimasterstools-preprod://spotify`).
- `play(id, uri)`, `skipToIndex(id, contextUri, index)`, `queue(id, uri)`, `pause(id)`, `resume(id)`.
- `fingerprint()` : SHA-1 du certificat de l'APK, lu par `PackageManager` (`GET_SIGNING_CERTIFICATES`), jamais codé en dur.
- Réponse : `window.__wmtSpotifyRemoteDone(id, codeErreur)` (code vide = réussite), via `evaluateJavascript` sur le fil UI.
- État : `window.__wmtSpotifyRemoteState(json)` après connexion puis à chaque changement — `{ uri, title, artist, imageUrl, playing }` ; `spotify:image:xxx` converti en `https://i.scdn.co/image/xxx`.

**Codes d'erreur**

| Code | Cas |
|---|---|
| `not-installed` | Spotify absent (`CouldNotFindSpotifyApp`) |
| `not-logged-in` | personne connecté dans Spotify |
| `not-authorized` | clé sans Android (paquet ou empreinte), ou accord refusé |
| `unsupported` | appli Spotify trop ancienne |
| `failed` | tout le reste |

**Cycle de vie** : connexion à la première lecture ; déconnexion quand l'APK passe en arrière-plan (`onStop`) ; reconnexion silencieuse (`showAuthView(false)`) au retour (`onStart`) si on était connecté. Le SDK démarre Spotify en arrière-plan : l'utilisateur **reste dans Wikimasters**.

## Section 2 — côté page (validée)

**Pont `src/android/spotify-remote.ts`** (modèle : `src/android/native-http.ts`)
- `createAndroidSpotifyRemote(win)` → `SpotifyRemote`, ou `undefined` si `WmtSpotifyRemote` est absent (ancien APK).
- Promesses ; rejet avec `RemoteError(code)`. Délais : 60 s pour `connect`, 10 s pour le reste.
- `onState(listener)`, `fingerprint()`.
- `SpotifyEnv` (`src/core/spotify/transport.ts`) gagne `remote?: SpotifyRemote`, fourni par `createAndroidSpotifyEnv` seulement.

**Couche `src/core/spotify/remote-playback.ts`**
`createRemotePlayback({ remote, api, clientId, redirectUri, store })` → `play`, `pause`, `playerState`, `subscribe`, `status`.
- Connexion à la demande, partagée entre lectures simultanées (une lecture ne rejoint pas la reconnexion silencieuse du démarrage : elle la remplace par une connexion interactive). Une fois le SDK réussi, on le note dans le stockage : au démarrage suivant, reconnexion silencieuse (`connect(…, silent = true)`, jamais d'écran d'accord ; le lecteur lit l'état sans Web API dès l'ouverture). Déjà connecté (changement de page) : Android renvoie l'état du lecteur.
- `play(target)` :

| Cible | SDK |
|---|---|
| reprise (`null`) | `resume()` |
| album / playlist à partir d'un titre | `skipToIndex(contexte, offsetIndex)` |
| album / playlist depuis le début | `play(contexte)` |
| liste de titres | `play(1er)` puis `queue()` des 10 suivants, un par un |

  `offsetIndex` est ajouté à la cible par `music-service.ts` (il connaît déjà la position `from`) ; la Web API l'ignore. Un `queue` qui échoue n'arrête pas la lecture (console seulement).
- `pause()` → `remote.pause()`. `playerState()` : connecté → dernier état reçu, sans réseau ; sinon Web API. `subscribe` prévient le lecteur à chaque état.

**Repli Web API**

| Erreur SDK | Réaction |
|---|---|
| `not-installed`, `not-authorized`, `unsupported` | SDK écarté jusqu'au prochain changement de clé ou nouvelle liaison ; tout passe par la Web API comme aujourd'hui |
| `failed` à la connexion (ou délai dépassé) | Web API pour cet appel, et SDK ignoré pendant 60 s (mémoire de la page) |
| `failed` d'une commande sur une connexion établie, déconnexion | une reconnexion, puis Web API pour cet appel |
| `not-logged-in` | Web API pour cet appel ; si elle échoue aussi : « Connecte-toi dans l'appli Spotify du téléphone. » |

`status()` : `ok` / `not-configured` / `not-installed` / `outdated` (et « pas encore essayé »). Délier ou changer de clé déconnecte et remet le statut à zéro.

**Branchements**
- `src/app/overlay.ts` (création de `spotifyApi`) : si `spotify.remote` existe, `play` / `pause` / `playerState` viennent de la couche lecture ; recherche et pochettes restent sur `spotifyApi`.
- `src/content/player-source.ts` : abonnement facultatif à `subscribe` (rafraîchissement immédiat) ; la boucle reste, sans réseau tant que le SDK est connecté.

## Section 3 — écran Lecteur, WikiHow, nouveautés (validée)

**Lecteur (`src/content/SpotifyKeySettings.tsx`), APK seulement** : bloc « Lecture sur ce téléphone » sous les adresses de retour.
- Ligne d'état :
  - `ok` : « Lecture directe par l'appli Spotify : active. »
  - pas encore essayé : « … sera essayée à la prochaine lecture. »
  - `not-configured` : « Ta clé Spotify n'autorise pas encore ce téléphone : ajoute les deux lignes ci-dessous dans ta clé (Android packages). En attendant, la lecture passe par l'ancienne méthode. »
  - `not-installed` : « Installe l'appli Spotify pour la lecture directe. »
  - `outdated` : « Mets à jour l'appli Spotify. »
- « À déclarer chez Spotify (Android packages) » : nom du paquet de l'APK installé et empreinte SHA-1 (`fingerprint()`), chacun avec un bouton copier.
- Bouton « Réessayer la lecture directe » (si `not-configured` / `not-installed` / `outdated`) : remet le statut à zéro.

**Fiche WikiHow `SPOTIFY_KEY_GUIDE`** (`src/core/whats-new/entries.ts`, nouvel `id`) : étape 2 « cochez Web API et, sur Android, Android » ; nouvelle étape « Android packages : collez le paquet et l'empreinte affichés dans Lecteur » ; ligne « Sur Android » (lecture sans quitter Wikimasters, accord unique dans Spotify).

**Nouveautés du correctif** : « Sur l'application Android, la musique se lance directement dans l'appli Spotify, même fermée, sans quitter Wikimasters. Si tu as ta propre clé : ajoute une fois la ligne Android affichée dans Paramètre d'extension, puis Lecteur. »

**Suivi d'usage** : `track('lecture-musique', 'spotify')` précise la voie (`sdk` ou `web-api`) ; `reportError` avec le code d'erreur SDK.

## Section 4 — tests et livraison (validée)

**Tests automatiques** (seules les familles touchées : Spotify, Android, réglages)
- `tests/core/spotify/remote-playback.test.ts` (faux `SpotifyRemote` + fausse Web API) : reprise ; titre d'album à sa position (`skipToIndex`) ; album depuis le début ; liste = 1er titre puis 10 `queue` au plus ; un `queue` en échec n'arrête pas la lecture ; repli Web API pour chaque code d'erreur ; état poussé lu sans réseau ; connexion partagée entre appels simultanés ; reconnexion silencieuse au démarrage ; délier / changer de clé remet le statut à zéro.
- `tests/android/spotify-remote.test.ts` (pont) : identifiants des réponses, délais (60 s `connect`, 10 s le reste), rejet `RemoteError(code)`, `undefined` sans `WmtSpotifyRemote` (ancien APK), `onState`.
- Tests de `SpotifyKeySettings` : bloc visible sur l'APK seulement, une ligne d'état par statut, boutons copier, « Réessayer la lecture directe ».

**Vérification manuelle sur le téléphone (S26, Android d'abord)**, sur la pré-production publiée après le report dans `main` : Spotify force-stoppé ; Spotify en veille ; premier accord dans Spotify ; titre seul ; titre au milieu d'un album ; liste d'un artiste ; pause / reprise depuis le mini-lecteur ; arrière-plan puis retour ; clé sans Android → repli Web API + ligne « n'autorise pas encore ce téléphone ». Ne pas tester pendant qu'une autre personne écoute sur le compte.

**Question tranchée (APK de pré-production) :** pas d'APK de pré-production construit depuis la branche du correctif ni de modification de `scripts/publish-preprod.mjs`. La pré-production est publiée comme d'habitude depuis `main` après le report du correctif ; elle porte un numéro plus élevé (≈ 1550) et contient aussi les évolutions de `main`, ce qui est accepté.

## Livraison (processus habituel d'un correctif)

1. Travail sur `fix/spotify-app-remote`, partie de `origin/production` ; jamais depuis `main`.
2. PR vers `production` (via `fix/production`) : `production` ne reçoit que le correctif, aucune évolution de `main`.
3. Report dans `main` (merge `production` → `main`), puis `npm run preprod` sans demander : la pré-production reçoit le correctif.
4. Vérification manuelle sur le téléphone (pré-production).
5. Production : `npm run corriger` (`scripts/fix-release.mjs`, APK depuis `production` seule) **uniquement sur ordre explicite** du propriétaire.

## Déclaration de la clé Spotify (à faire une fois)

0. **Empreinte SHA-1**, sur le poste qui construit les APK :
   ```powershell
   & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -J-Duser.language=en -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android
   ```
   Garder la valeur de la ligne `SHA1:`.
1. https://developer.spotify.com/dashboard → l'appli de la clé.
2. **Settings** → **Edit**.
3. « Which API/SDKs… » : garder **Web API**, cocher **Android**.
4. **Android packages** : `io.github.maximus49000.wikimasterstools` + SHA-1 → **Add**.
5. Pré-production : `io.github.maximus49000.wikimasterstools.preprod` + même SHA-1 → **Add**.
6. **Redirect URIs** inchangées (`wikimasterstools://spotify`, `wikimasterstools-preprod://spotify`).
7. **Save**.

Faire de même sur l'appli de la clé historique partagée (`LEGACY_SPOTIFY_CLIENT_ID`) : ses utilisateurs n'auront alors rien à faire.

**Fait le 2026-10-15** sur l'appli « 30d88341… », qui est aussi la clé historique partagée (`LEGACY_SPOTIFY_CLIENT_ID`) : les utilisateurs migrés n'ont rien à faire : Android coché, les deux paquets déclarés avec l'empreinte `C2:21:A4:37:FA:93:03:8C:31:B1:61:D1:B5:49:68:A9:C1:26:F3:9E` (clé de debug de ce poste, identique à celle des APK de `livrables/`, vérifiée par `apksigner`). Sous Windows en français, `keytool -list -v` plante (`MissingFormatArgumentException`) : ajouter `-J-Duser.language=en`.
