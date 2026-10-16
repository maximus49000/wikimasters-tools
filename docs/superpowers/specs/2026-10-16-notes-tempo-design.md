# Notes de musique au tempo du morceau — conception

Date : 2026-10-16. Suite du chantier « Ouverture d'un objet + chaîne hi-fi » (PR #318) : les notes de musique qui montent
au-dessus de la chaîne (`src/content/hifi/music-notes.tsx`, Task 14) ont aujourd'hui un rythme fixe (une note toutes les
700 ms, montée de ~110 px en 3,4 s).

## Intention

L'utilisateur veut que les notes **suivent le tempo (BPM) du morceau en cours** : « plus la musique va vite, plus les notes
vont vite ; plus c'est lent, plus elles sont lentes ». Concrètement (ses mots) : **la vitesse de montée** change, et les notes
sont **plus nombreuses et plus rapides** sur un morceau rapide, **moins nombreuses et plus lentes** sur un morceau lent.

## Ce qui a été vérifié (2026-10-16)

- **Spotify ne donne plus le tempo** : `GET /v1/audio-features` et `audio-analysis` répondent 403 aux applications créées
  après le 27/11/2024 (cas de toutes les clés Spotify personnelles du projet).
- **Champ `bpm` de Deezer** (`api.deezer.com/track/{id}`) : peu fiable. Sur 8 morceaux, 3 à 0 (One More Time, Hello,
  Enter Sandman), 2 faux (Dancing Queen 200,7 au lieu de ~101 ; Gymnopédie n° 1 123,8 au lieu de ~70).
- **Extrait Deezer de 30 s** (`preview`, MP3 sur `cdnt-preview.dzcdn.net`) : `Access-Control-Allow-Origin: *`, décodable dans
  la page (`OfflineAudioContext.decodeAudioData`). Un calcul rapide (enveloppe d'énergie par pas de 10 ms, flux positif,
  autocorrélation 60–200 BPM pondérée autour de 120) a trouvé **5 sur 8** justes en ~120 ms par morceau : One More Time 122,5,
  Dancing Queen 102, Harder Better Faster Stronger 125, Another One Bites the Dust 109, Billie Jean 117,5 ; faux : Hello 143
  (~79), Enter Sandman 187,5 (~123), Gymnopédie 176,5 (~70). Les erreurs sont des multiples (×2, ×1,5) sur des morceaux lents
  ou doux.
- **`api.deezer.com` n'envoie pas d'en-tête CORS** : la recherche Deezer doit passer par le relais Cloudflare (`relay/`).
  L'URL de l'extrait est signée et expire (~15 min) : elle ne se garde pas.

## Décision de l'utilisateur

Il **accepte** que, sur quelques morceaux lents ou très doux, les notes aillent parfois un peu trop vite, en échange d'un
tempo trouvé pour presque tous les morceaux. Source retenue : **mesure du tempo sur l'extrait Deezer de 30 s**, une fois par
morceau, résultat gardé.

## Objectifs

1. Pendant la lecture, la cadence de naissance des notes **et** la durée de leur montée suivent le BPM du morceau en cours.
2. Tempo trouvé pour la plupart des morceaux (ceux que Deezer connaît), mesuré **une seule fois** par morceau puis gardé.
3. Aucun ralentissement visible de la scène sur Android (la mesure se fait hors de l'animation, une fois).

## Non-objectifs

- Caler les notes sur les temps exacts du morceau (synchronisation au battement) : on ne connaît pas la position de lecture
  avec précision, seul le **rythme moyen** compte.
- Analyser le son réellement joué par Spotify (impossible : il sort de l'appli Spotify).
- Changer l'allure des notes (dessin, couleurs, ondulation, hauteur de montée) ou le comportement pause / mouvement réduit.
- Afficher le BPM à l'utilisateur.

## Anti-objectifs (échec même si « ça marche »)

- La scène saccade pendant la mesure, ou la mesure se relance à chaque passage du morceau.
- Une pluie de notes illisible sur un morceau très rapide, ou des notes quasi figées sur un morceau très lent.
- Le morceau suivant garde le rythme du précédent pendant longtemps.

## Comportement

- **Référence** : à **120 BPM**, le rythme actuel est conservé (une note toutes les 700 ms, montée en 3 400 ms).
- **Échelle** : facteur `k = 120 / bpm` ; intervalle de naissance = `700 × k` ms, durée de montée = `3400 × k` ms. La hauteur
  de montée (~110 px) ne change pas : la **vitesse** de montée est donc proportionnelle au BPM, et le nombre de notes à
  l'écran reste à peu près constant (cadence et durée varient ensemble) — *mon choix* : plus nombreuses par seconde et plus
  rapides quand ça va vite, comme demandé.
- **Bornes** : le BPM utilisé est borné à **[60, 180]** (*mon choix*) : à 60, une note toutes les 1,4 s, montée en 6,8 s ;
  à 180, une note toutes les 467 ms, montée en 2,27 s.
- **Tempo inconnu** (morceau introuvable sur Deezer, extrait absent, mesure douteuse, panne réseau, Tidal sans piste connue) :
  rythme de référence (120), comme aujourd'hui.
- **Changement de morceau** : les notes déjà en vol finissent leur course à leur vitesse ; les nouvelles naissent au nouveau
  rythme dès que le tempo du nouveau morceau est connu (rythme de référence en attendant).
- Pause, mouvement réduit, mode Aménager : inchangés (Task 14).

## Fonctionnement

1. **Quel morceau** : la piste en cours du lecteur (`getPlayerSource().current().track` : `uri`, `title`, `artist`). La clé
   du tempo gardé est l'`uri` Spotify de la piste.
2. **Mémoire** : un dépôt dans le `store` existant (clé à créer, p. ex. `tempo-v1`), comme `listens-v1` / `soundtracks-v1` :
   tempo trouvé = gardé pour toujours ; « introuvable / douteux » = re-vérifié après 30 jours ; erreur réseau = rien gardé
   (réessayé au prochain passage). Une seule mesure en cours à la fois par piste.
3. **Relais** : nouvelle route du Worker (p. ex. `GET /deezer-preview?title=…&artist=…`) qui cherche le morceau sur Deezer
   (`api.deezer.com/search?q=…`, recherche libre « artiste titre », la syntaxe `artist:"…" track:"…"` ayant renvoyé 0
   résultat au test), puis rend `{ previewUrl, deezerBpm }` du premier résultat jugé correspondant (titre et artiste
   normalisés), ou `{ previewUrl: null }`. Pas de secret. Cache KV de l'**identifiant** Deezer trouvé (30 jours), jamais de
   l'URL d'extrait (elle expire) ; limite d'appels par adresse comme les autres routes. Le relais se déploie par Workers
   Builds (voir `relay/README.md`, `docs/guides/cloudflare-relais.md`).
4. **Mesure** dans la page (extension et APK) : télécharger l'extrait (CORS ouvert), le décoder, estimer le BPM (module pur
   testable dans `src/core/`, entrée = échantillons PCM + fréquence), écarter un résultat douteux (pic d'autocorrélation trop
   faible). Le champ `bpm` Deezer, quand il est non nul, peut servir d'indice pour choisir entre deux multiples (×2, ×1,5),
   jamais de réponse seule.
5. **Notes** : `MusicNotes` reçoit le BPM (ou `null`) et en tire intervalle et durée ; la durée de l'animation CSS est posée
   **par note** à sa naissance (la règle `@keyframes` partagée ne change pas).

## Contraintes

- Android d'abord : décodage et calcul hors du chemin de l'animation (une fois par morceau, ~100–300 ms) ; pas de rendu
  React par image (règle de la Task 14).
- `core` n'importe jamais `content` (types structurels si besoin).
- Aucun nouveau secret ; aucune donnée personnelle envoyée au relais au-delà du titre et de l'artiste du morceau.
- Tests dans la famille `scene-piece` (`tests/familles.ts`), estimateur testé sur des signaux synthétiques (clics réguliers
  à tempo connu, avec bruit) — aucun fichier audio du commerce dans le dépôt.
- Fiche WikiHow : la fiche `ouvrir-objet` a déjà été publiée en pré-prod → **nouvel id** (règle du projet) avec une phrase sur
  les notes au tempo du morceau et la limite (tempo approximatif sur les morceaux lents ou doux).
- Extension **et** Android.

## Précisions (relecture du constructeur, mes choix)

- **Changement de piste** : le lecteur est observable (`playerSource.subscribe` / `current`, déjà utilisé par `use-hifi`) ;
  la mesure se déclenche quand l'`uri` de la piste en cours change. Pas de piste (Tidal, SDK muet) → rythme de référence.
- **Minuterie des notes** : une naissance programme la suivante avec l'intervalle du moment (minuterie qui se reprogramme),
  pour qu'un changement de tempo prenne effet à la note suivante.
- **Correspondance Deezer** (relais) : titre normalisé (accents, casse, parenthèses du type « Remastered », « feat. ») égal
  ou contenu l'un dans l'autre, ET artiste contenu l'un dans l'autre (même règle que `sameTrack`) ; sinon `previewUrl: null`.
  Une mauvaise correspondance n'est pas éternelle : un tempo trouvé est gardé **180 jours** (pas « pour toujours »), et la clé
  versionnée (`tempo-v1`) permet de tout remesurer en changeant de version.
- **« Douteux »** : seulement quand l'autocorrélation n'a pas de pic net (morceau sans rythme marqué) ; un multiple probable
  (×2, ×1,5) n'est pas « douteux » : on le garde (choix accepté par l'utilisateur). Le banc compte les 8 morceaux, trouvés ou
  non.
- **Banc** : le constructeur a le réseau ; il retrouve les 8 extraits par la recherche Deezer (mêmes requêtes libres :
  « Daft Punk One More Time », « ABBA Dancing Queen », « Adele Hello », « Metallica Enter Sandman », « Daft Punk Harder Better
  Faster Stronger », « Satie Gymnopedie 1 », « Queen Another One Bites the Dust », « Michael Jackson Billie Jean » ; tempos
  de référence ~123, ~101, ~79, ~123, ~123, ~70, ~110, ~117).
- **Réseau Android / extension** : le téléchargement de l'extrait et son décodage se font dans la page (surcouche de
  l'extension, WebView de l'APK), sans proxy audio. À vérifier sur le téléphone (APK pré-prod) ; si l'extrait est bloqué ou
  indécodable quelque part, le tempo reste inconnu (rythme de référence) sur cette plateforme — on ne fait pas transiter
  l'audio par le relais. Vérifier aussi si le manifeste de l'extension ou la CSP de l'APK demande une entrée pour
  `cdnt-preview.dzcdn.net` / le relais (le relais est déjà appelé par d'autres routes).
- **Relais** : la liaison KV `DOC_CACHE` existe déjà (réutilisée avec un préfixe de clé) ; la limite par adresse réutilise
  `limiter.ts`. Le Worker se déploie au push sur `main` (Workers Builds) ; le plan inclut une vérification `curl` de la route
  après fusion.

## Laissé au constructeur

- L'algorithme exact de l'estimateur (bandes de fréquence, flux spectral, peigne ou autocorrélation, pondération), à
  condition de faire **au moins aussi bien que le calcul rapide testé** (5/8 sur la liste ci-dessus) mesuré au banc local
  avec les extraits réels (non commités), et de ne pas dépasser ~300 ms par morceau sur le téléphone.
- Le seuil « douteux ».
- Le nom exact de la route du relais et du dépôt.
