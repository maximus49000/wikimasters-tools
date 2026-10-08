# Secrets côté serveur : TMDB, IGDB et anomalies via le relais Cloudflare

Date : 2026-10-08. Statut : conception validée en discussion, à relire avant le plan.

## Pourquoi

Le dépôt est public et les APK/zips sont téléchargeables : les clés injectées au build (`WXT_TMDB_API_KEY`, `WXT_IGDB_CLIENT_ID/SECRET`, `WXT_GITHUB_ISSUES_TOKEN`, `WXT_GOOGLE_BOOKS_API_KEY`) sont lisibles par n'importe qui en décompilant le paquet. Avant d'ouvrir l'APK à 100-200 utilisateurs ou plus, ces secrets passent sur le relais Cloudflare existant (`relay/`, Worker `wikimasters-tools`), qui est le seul à les connaître.

## Décisions

- **Anciennes clés non révoquées** (décision de l'utilisateur, 2026-10-08) : la diffusion n'a pas commencé, le risque est jugé faible. Les anciens paquets continuent donc de fonctionner. Les nouveaux secrets du relais peuvent être les mêmes valeurs ou des valeurs neuves, au choix de l'utilisateur (le plus propre : des valeurs neuves, sans effet sur les anciens paquets tant que les anciennes ne sont pas révoquées).
- **Pas de jeton d'application** entre les clients et le relais : il serait lisible dans le paquet comme les clés actuelles. La protection repose sur une liste blanche stricte de routes, de paramètres et de corps, un cache et une limite de débit par IP.
- **Pas de cache côté relais** : l’API Cache de Cloudflare n’est fonctionnelle que sur un domaine personnalisé (documentation : « Workers deployed to custom domains have access to functional cache operations »), or le relais est sur `workers.dev` ; KV n’offre que 1 000 écritures par jour, déjà entamées par l’indexeur. Les caches locaux des clients (24 h à 7 jours) suffisent à cette échelle.
- Limites Cloudflare vérifiées dans la documentation le 2026-10-08 (offre gratuite) : 100 000 requêtes par jour par compte, 10 ms de calcul par requête (l'attente d'un `fetch` n'est pas comptée), 50 appels sortants par requête. Charge ajoutée estimée à ~10 000 requêtes par jour pour 200 utilisateurs. Risque nouveau et accepté : le relais devient le point de passage unique ; le dépassement du plafond quotidien coupe toutes ses fonctions jusqu'à minuit UTC. Au-delà d'environ 1 000 utilisateurs actifs : offre Workers payante.

## Relais : quatre nouveaux modules

Chaque module est un fichier de `relay/src/` avec une fonction pure testable par un `fetch` factice ; `index.ts` ne fait que router.

### `tmdb.ts` — `GET /tmdb/<chemin TMDB>?<paramètres>`

- Chemins acceptés (expressions fermées) : `/movie/{id}`, `/tv/{id}`, `/person/{id}/combined_credits`, `/search/movie`, `/search/tv`, `/search/person`, `/search/multi`. `{id}` = entier. Tout autre chemin : 404.
- Paramètres acceptés : `language`, `query`, `append_to_response` (valeurs `videos`, `watch/providers`, combinaisons), `include_video_language`. Tout autre paramètre est ignoré (jamais transmis) ; `api_key` fourni par le client est supprimé.
- Le relais ajoute `api_key` (secret `TMDB_API_KEY`) et transmet la réponse telle quelle (corps et statut, sans retraitement : pas de coût CPU).
- 401/403 de TMDB : le relais répond 502 `{ok:false, reason:'upstream'}` (le client ne doit pas croire que sa propre clé est refusée).

### `igdb.ts` — `POST /igdb/games`

- Corps texte : une requête IGDB. Acceptée seulement si elle correspond à l'une des trois formes émises par le client (`fields …; where id = N; limit 1;`, `fields …; where slug = "…"; limit 1;`, `search "…"; fields …; limit N;`), avec liste blanche de champs, `limit` ≤ 10 et longueur ≤ 600 caractères. Sinon 400.
- Jeton Twitch (client credentials) obtenu et gardé par le relais : en mémoire de l'isolat (pas de KV), renouvelé une heure avant l'expiration et une fois sur 401. Secrets `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`.
- Aucun cache côté relais (les clients mémorisent déjà les jeux 7 jours).
- Pas d’espacement des appels côté relais : le client espace déjà les siens (260 ms) ; une réponse 429 d’IGDB est transmise telle quelle et le client affiche son message habituel.
- Statuts renvoyés : 200 (réponse IGDB), 400 (forme refusée), 429 (limite), 502 (amont).

### `issues.ts` — `POST /issues`

- Corps JSON `{title, body, labels}` : titre ≤ 120 caractères, corps ≤ 8 000, étiquettes ∈ liste blanche (`Nouveau` et celles qu'émettent les propositions de documentaire, relevées dans `src/content/documentary-*` pendant le plan). Sinon 400.
- Le relais crée l'issue sur `maximus49000/wikimasters-tools` avec le secret `GITHUB_ISSUES_TOKEN` (jeton fine-grained, Issues seulement) et renvoie `{ok:true, number, url}` ; échec GitHub : `{ok:false, error}` avec un message lisible (même texte que `postIssue` aujourd'hui).

### `books.ts` — `GET /books/volumes`

- Une seule route, qui reproduit l’appel de `google-books-api.ts` : paramètres acceptés `q` (≤ 200 caractères), `country` (valeur `FR` seulement), `maxResults` (entier 1 à 10). Tout autre paramètre est ignoré ; `key` fourni par le client est supprimé.
- Le relais ajoute `key` (secret `GOOGLE_BOOKS_API_KEY`, déjà posé) et transmet la réponse telle quelle vers `https://www.googleapis.com/books/v1/volumes`.
- Quota de Google Livres : la clé est restreinte à l’API Books ; les clients mémorisent déjà les prix et la limite de débit protège le quota.

### Limite de débit

- Par IP (`cf-connecting-ip`) : `/tmdb` 60 par minute, `/igdb` 20 par minute, `/books` 20 par minute, `/issues` 5 par heure. Dépassement : 429 avec `Retry-After`.
- Implémentation : compteurs en mémoire du Worker (fenêtre fixe par route et par IP). Ils sont par isolat et se remettent à zéro quand l’isolat est recyclé : c’est un filtre contre l’usage abusif, pas une garantie. La liaison native `ratelimits` (période 10 ou 60 s seulement, disponibilité sur l’offre gratuite non confirmée par la documentation) est écartée pour ne pas risquer un échec de déploiement.

### CORS et configuration

- Les en-têtes CORS deviennent : méthodes `GET, POST, OPTIONS`, en-têtes `content-type, x-debug`. Le Worker répond déjà à `OPTIONS` (204).
- `/status` indique la présence (jamais la valeur) de `tmdbKey`, `igdbId`, `igdbSecret`, `issuesToken`, `booksKey`.
- Aucune des routes existantes (`/search`, `/oembed`, `/t`, `/stats`, `/dashboard`) ne change.
- `wrangler.toml` : aucun nouveau binding.
- Secrets posés par l'utilisateur depuis son terminal : `npx wrangler secret put TMDB_API_KEY` (et `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, `GITHUB_ISSUES_TOKEN`). Jamais dans le chat ni dans le dépôt.

## Clients

Les trois clients reçoivent déjà un `fetch` injectable ; ils perdent toute notion de clé.

- `tmdb-api.ts` : `createTmdbApi({ fetch })` sans `apiKey` ; `get()` appelle `${RELAY_BASE}/tmdb${path}?${params}` (sans `api_key`). Les images (`image.tmdb.org`) restent directes (pas de clé). Erreur `auth` remplacée par `http` pour un 502 du relais (la clé n'est plus l'affaire du client) ; 429 du relais → `rate-limited`.
- `igdb-api.ts` : plus de `clientId`/`clientSecret`/jeton/`store` : `query(body)` fait un `POST ${RELAY_BASE}/igdb/games` (corps texte `text/plain`) ; le jeton et son renouvellement disparaissent côté client ; l'espacement `paced` reste.
- `google-books-api.ts` : `createGoogleBooksApi({ fetch })` sans `key` ; appelle `${RELAY_BASE}/books/volumes?q=…&country=FR&maxResults=10`. Google Livres n’est plus appelé directement : on retire `www.googleapis.com` des hôtes et préfixes (`wxt.config.ts`, `FETCH_PREFIXES`) et on classe `/books` sous `googlebooks`.
- `anomaly.ts` : `postIssue(fetch, draft)` fait un `POST ${RELAY_BASE}/issues` ; `ANOMALY_API_PREFIX`, `Authorization` et `token` disparaissent. Même type de résultat `AnomalyResult`. Les propositions de documentaire utilisent le même `postIssue`.
- `config.ts` (screen, game, anomalies) : suppression de `TMDB_API_KEY`, `IGDB_CLIENT_*`, `GITHUB_ISSUES_TOKEN`, `TWITCH_TOKEN_URL`, `IGDB_BASE`, `ANOMALY_API_PREFIX` ; `IGDB_ENABLED` et le test `if (TMDB_API_KEY)` / `GITHUB_ISSUES_TOKEN ?` de `overlay.ts` deviennent « toujours actifs » (le relais en panne donne les erreurs habituelles).
- `env.d.ts` : variables `WXT_TMDB_API_KEY`, `WXT_IGDB_*`, `WXT_GITHUB_ISSUES_TOKEN`, `WXT_GOOGLE_BOOKS_API_KEY` supprimées.
- Les appels vont à `RELAY_BASE` depuis la page, comme ceux des documentaires (`fetch` simple vers un hôte à CORS ouvert) ; pas besoin du service worker ni du pont Android pour le relais. À vérifier dans Chrome et sur l'APK dès la première tâche du plan (politique de sécurité du site).
- Nettoyage des listes d'hôtes devenues inutiles : `wxt.config.ts` (`api.themoviedb.org`, `id.twitch.tv`, `api.igdb.com`, `api.github.com`), `FETCH_PREFIXES` de `transport.ts`, `HTTP_ALLOWED` de `MainActivity.java` (IGDB, Twitch ; Steam reste), `GAME_NATIVE_PREFIXES` de `native-http.ts`. L'hôte `api.github.com` n'est retiré que si plus rien d'autre ne l'utilise (à vérifier).
- Mesure d'usage : `fetch-observer.ts` classe les appels du relais sous `relais`. Il faut un classement par chemin (`/tmdb` → `tmdb`, `/igdb` → `igdb`, `/books` → `googlebooks`, `/issues` → `github`) pour que le tableau de bord garde les erreurs d'API par service.
- Compatibilité : cache déjà rempli (`screen-detail-v2`, jeux, jetons `igdb-token-v1` inutilisé) inchangé ; le jeton IGDB stocké devient orphelin (inoffensif).

## Gestion des erreurs

| Situation | Relais | Client |
|---|---|---|
| Chemin, paramètre ou corps hors liste | 404 / 400 | Même message que « http » |
| Limite de débit dépassée | 429 + `Retry-After` | « TMDB demande de patienter… » / pause existante |
| Secret absent du Worker | 503 `not-configured` | Fonction muette avec message « indisponible » |
| TMDB/IGDB/GitHub en panne ou refus de la clé | 502 `upstream` | « … est indisponible pour le moment. » |
| Plafond Cloudflare dépassé (erreur 1027) | page d'erreur Cloudflare | Échec réseau, mêmes messages |

## Tests

- Relais (`tests/relay/`, `fetch` amont factice) : liste blanche (chemin refusé, paramètre inconnu supprimé, `api_key` du client écrasée), le secret n'apparaît dans aucune réponse ni dans `/status`, jeton Twitch unique et renouvelé, formes de requêtes IGDB refusées, étiquettes d'issue hors liste, limite de débit, CORS (`OPTIONS` + `POST`).
- Clients : `tmdb-api`, `igdb-api`, `anomaly`, `fetch-observer` testés contre un faux relais ; les tests actuels sont adaptés (plus de clé, plus de jeton).
- Vérification : `npm test`, `npm run typecheck`, `npm run build`, puis contrôle que **ni le bundle de l'extension ni l'APK ne contiennent plus les valeurs des secrets** (recherche de chaînes dans `.output/` et dans `wikimasters-overlay.js`).
- Reste manuel (utilisateur) : les cinq secrets sont déjà posés (2026-10-08, par Claude depuis `.env.local`) ; `wrangler deploy` (ou fusion déclenchant Workers Builds), puis ouvrir une carte de film, une de jeu, un livre (prix de l’ebook), et envoyer une anomalie, sur Chrome et sur l'APK.

## Hors périmètre

- Révocation des anciennes clés (décision : non).
- Spotify, Tidal, Steam, Open Library, Google Books : pas de secret, inchangés.
- Remplacement du suivi d'usage ou passage en offre Workers payante.
- Fiche WikiHow : revue pendant le plan ; aucune fonction visible ne change a priori.
