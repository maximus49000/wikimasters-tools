# Appels Spotify ordonnés, pause enregistrée, heure de reprise — conception

## Objectif

Le 2026-10-01, Spotify a mis l'application en pause pendant ~16 h (`429`, `Retry-After: 56900` sur `GET /search`, mesuré dans Chrome : la valeur décroît à l'heure réelle, c'est une échéance fixe). La fiche affichait « Réessaie dans environ 16 h. Nouvelle tentative automatique. » alors que rien ne pouvait aboutir, et chaque page, onglet ou rechargement renvoyait quand même un appel dans la pause.

Trois changements :

1. **Heure de reprise** : le message dit à quelle heure les appels pourront reprendre.
2. **Pause enregistrée** : aucun appel ne part avant cette heure, depuis aucune page, aucun onglet, ni l'APK.
3. **Appels ordonnés** : le contenu de la page passe avant les images, les appels sont espacés.

Complète [la lecture Spotify](2026-10-01-spotify-playback-design.md) (limite de débit : PR #69, #72, #73, #75).

## Décisions

- **Une file d'attente par page**, dans le client Spotify (`createSpotifyApi`) : tous les appelants (fiche, lecteur, pochettes) y passent sans changer leur code. Pas de file partagée entre onglets (service worker : se rendort, absent de l'APK).
- **Trois niveaux** (un appel à la fois, premier arrivé premier servi dans un niveau) :

  | Niveau | Appels | Délai avant l'appel |
  |---|---|---|
  | `now` | lecture ▶, pause, état du lecteur, appareils | aucun |
  | `page` | listes d'écoute (`/search` morceaux et artistes, album, pistes d'un album) | `PAGE_GAP_MS` = 250 ms |
  | `image` | pochettes, photos d'artistes (`/search` album, morceau, artiste) | `IMAGE_GAP_MS` = 1 000 ms |

  Un appel `image` ne part que s'il ne reste aucun appel `now` ou `page` en attente. Le délai se compte depuis le début de l'appel précédent. **Ces valeurs sont des estimations** : Spotify ne publie pas la limite des applications en mode développement. Constantes nommées, à ajuster à l'usage.
- **La pause est enregistrée** dans le `store` (clé `spotify-limit`) : `{ until, strikes }`. Extension : `chrome.storage.local`, partagé par tous les onglets ; APK : `localStorage`. Elle est lue avant chaque appel.
  - `Retry-After` lisible (extension) : `until = maintenant + Retry-After`, `strikes = 0`.
  - `Retry-After` illisible (APK, voir PR #73) : l'escalade 5 s, ×3, plafond 5 min est conservée, mais `strikes` survit aux rechargements. Une réponse non 429 remet `strikes` à 0.
  - Pendant une pause, un appel échoue tout de suite avec `rate-limited` : aucun appel réseau, et la file ne s'accumule pas.
- **Plus de nouvelle tentative manuelle** : le bouton ⟳ « Réessayer maintenant » (PR #75) et `clearLimit` / `service.retry` sont retirés. Un nouvel essai pendant la pause est inutile.
- **Message** : « Spotify demande de patienter jusqu'à 14 h 30. », « …jusqu'à demain à 14 h 30. », « …jusqu'au 03/10 à 14 h 30. » au-delà ; moins d'une minute : « …un instant. ». L'heure est celle de l'appareil, arrondie à la minute supérieure. Le message sous la liste après un ▶ est le même. « Nouvelle tentative automatique. » disparaît.
- **La fiche se recharge toute seule** à l'heure indiquée (+ 1 s de marge, 5 relances d'affilée au plus : c'est déjà le cas, la durée vient désormais de l'heure et non d'un délai).
- **Nouveau Client ID** (PR #77) : les compteurs de Spotify sont remis à zéro. Les Redirect URIs et le compte testeur sont à déclarer dans cette application.

## Modules

- `core/spotify/limit-gate.ts` (nouveau) : `createLimitGate({ store, now })` → `remainingMs()`, `trip(retryAfterMs | null)` (rend l'attente), `success()`.
- `core/spotify/call-queue.ts` (nouveau) : `createCallQueue({ guard, gaps, now, sleep })` → `run(niveau, tâche)`. Avant chaque tâche, `guard()` (la pause enregistrée) peut la refuser sans délai.
- `core/spotify/spotify-api.ts` : reçoit `store`, range chaque méthode dans son niveau, enregistre la pause sur un 429. `blockedUntil`, `unreadableLimits` et `clearLimit` disparaissent.
- `core/spotify/errors.ts` : `SpotifyError` porte `retryAt` (heure absolue) en plus de `retryAfterMs` ; `userMessage` formate l'heure.
- `content/music-service.ts`, `content/ListenSection.tsx` : la vue d'erreur porte `retryAt` ; plus de bouton ni de `retry`.
- `content/media-art.ts` : la file locale `oneAtATime` est retirée, la file du client la remplace.
- `app/overlay.ts` : passe `store` au client.
- `content/player-source.ts` : inchangé (il lit déjà `retryAfterMs`).

## Conséquences

- Les pochettes Spotify des cartes musique arrivent au rythme d'une par seconde ; l'image Wikipédia d'une carte attend la réponse Spotify de cette carte (la pochette officielle passe devant). Une réponse trouvée est gardée pour toujours : le délai ne se paie qu'une fois.
- La première page chargée après la mise à jour envoie un appel pour apprendre la pause en cours si Spotify en impose une ; ensuite plus aucun.

## Hors périmètre

File partagée entre onglets, pause de TMDB (films et séries), logique de recherche de pochettes.

## Tests (vitest, horloge et attente simulées)

- `limit-gate` : valeur relue par une 2ᵉ instance sur le même `store` ; escalade 5 s → 15 s → 45 s → … → 300 s conservée entre instances ; remise à zéro après un succès ; pause échue ignorée.
- `call-queue` : un appel `page` arrivé après un appel `image` part avant lui ; ordre d'arrivée dans un niveau ; délais respectés ; un appel refusé par `guard` ne coûte aucun délai ; un appel à la fois.
- `spotify-api` : une 2ᵉ instance ne fait aucun appel réseau pendant la pause ; un 429 écrit `until` ; chaque méthode est rangée dans le bon niveau.
- `errors` : aujourd'hui, demain, plus loin, moins d'une minute, arrondi à la minute supérieure.
- `ListenSection` / `music-service` : plus de bouton, message avec l'heure, rechargement à l'heure dite.
- Vérification dans Chrome (extension) avec le nouveau Client ID : la fiche Kamini charge ses titres sans 429.
