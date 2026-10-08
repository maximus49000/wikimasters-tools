# Clé Spotify personnelle — design

Date : 2026-10-08. Maquette validée dans la conversation (3 états de la fenêtre « Lecteur »).

## But

L'application Spotify partagée est en « mode développement » : 25 utilisateurs au plus, ajoutés à la main. Pour lever cette limite, chacun fournit **son propre Client ID** (sa propre application Spotify). Les installations déjà liées gardent l'identifiant actuel sans rien faire ; les autres doivent saisir le leur. Un mode d'emploi (fiche WikiHow) guide la création du compte et de l'application Spotify.

## Décisions

- Le Client ID devient un **réglage local** : clé `spotify-client-id` dans le `KeyValueStore` de la surcouche (extension et APK). Le Client ID est public (PKCE, aucun secret) : stockage en clair.
- La constante actuelle devient `LEGACY_SPOTIFY_CLIENT_ID` : elle ne sert **qu'à la migration**, jamais comme valeur par défaut d'une nouvelle installation.
- **Migration** (au démarrage de la surcouche, avant de créer la session) : si `spotify-client-id` est absent **et** qu'un compte est lié (`spotify-session` non nul), on enregistre `LEGACY_SPOTIFY_CLIENT_ID` dans `spotify-client-id`. Sinon rien : une nouvelle installation, ou un compte jamais lié / déjà délié, n'a pas de clé. Idempotente.
- **Délier ne touche jamais la clé.** Seuls les jetons sont supprimés.
- **Remplacer ou effacer la clé délie le compte** (les jetons appartiennent à l'ancien Client ID), après confirmation à l'écran. Enregistrer la première clé (aucun compte lié) ne délie rien. Enregistrer la même clé ne fait rien.
- Sans clé, `link()` ne fait aucun appel réseau et échoue avec la nouvelle erreur `no-client-id`.
- Tidal n'est pas modifié.

## Architecture

### `src/core/spotify/config.ts`
`SPOTIFY_CLIENT_ID` renommée `LEGACY_SPOTIFY_CLIENT_ID` (commentaire : migration uniquement). Ajout de `CLIENT_ID_KEY = 'spotify-client-id'`.

### `src/core/spotify/client-id.ts` (nouveau, pur)
- `isValidClientId(value)` : 32 caractères hexadécimaux minuscules après `trim()` / mise en minuscules.
- `normalizeClientId(value)` : renvoie l'identifiant normalisé ou `null`.
- `migrateClientId(store)` : la migration ci-dessus.

### `src/core/spotify/spotify-session.ts`
- Lit la clé dans `store` à chaque besoin (pas de copie mémoire qui divergerait entre onglets).
- Nouvelles méthodes : `clientId(): Promise<string | null>`, `setClientId(value): Promise<'saved' | 'invalid' | 'unlinked'>` (`unlinked` : l'ancien compte a été délié parce que la clé a changé), `clearClientId(): Promise<void>` (délie si lié). Toutes notifient les abonnés.
- `link()` : lit la clé ; absente → `SpotifyError('no-client-id')`. `requestTokens` prend le Client ID lu au début de l'opération (le rafraîchissement utilise la clé courante ; une clé changée entre-temps a déjà délié, donc `not-linked`).
- `errors.ts` : code `no-client-id`, message « Ajoute ta clé Spotify pour lier ton compte. ».

### Service musical et lecteur
`music-service.ts` expose, pour Spotify seulement et en option (`clientKey?`), l'accès à `clientId / setClientId / clearClientId` et l'adresse de retour (`redirectUris()`). Tidal ne les fournit pas, donc l'interface n'affiche rien pour lui.

### Interface — `PlayerSettings.tsx` (extension et mobile, même composant)
Sous Spotify, avant la zone « Compte » :
- **Sans clé** : champ + « Enregistrer » (glyphe), indication écrite « Menu Plus › WikiHow › Utiliser sa propre clé Spotify » (pas de lien direct), liste des **Redirect URIs à déclarer** avec bouton « copier » (extension : `browser.identity.getRedirectURL()` ; APK : `wikimasterstools://spotify`). « Lier Spotify » désactivé avec la mention « Ajoutez d'abord votre clé ».
- **Clé enregistrée** : clé affichée tronquée (8 premiers et 9 derniers caractères), « Remplacer » et « Effacer ». « Lier / Délier » comme aujourd'hui.
- **Remplacer / Effacer avec compte lié** : avertissement + « Annuler » / « Remplacer et délier ». Sans compte lié, application immédiate.
- Clé invalide : message sous le champ, rien n'est enregistré.
- Tous les boutons gardent `aria-label` et `title`, glyphes plutôt que du texte, hauteur tactile 40 px minimum.

### Guide — `src/core/whats-new/entries.ts`
Nouvelle fiche WikiHow « Utiliser sa propre clé Spotify » (id nouveau), rédigée avec text + how + tip :
1. Créer un compte Spotify et ouvrir developer.spotify.com/dashboard.
2. Créer une application, cocher « Web API ».
3. Y déclarer les Redirect URIs affichées par l'application.
4. Copier le Client ID.
5. Ajouter son compte dans « User Management » (mode développement : 25 utilisateurs par application ; Spotify Premium requis pour lancer la lecture).
6. Coller le Client ID dans Lecteur, puis lier.
Limites : le mode développement a ses limites de débit (message d'attente déjà géré) ; changer de clé délie le compte ; la clé reste sur l'appareil.
Entrée « Quoi de neuf » associée.

## Données et vie privée
Le Client ID reste local, n'est jamais envoyé à la mesure d'usage et n'apparaît pas dans les journaux.

## Erreurs
- Clé invalide : message sous le champ.
- Sans clé : `no-client-id` (aucun appel réseau).
- Clé refusée par Spotify (identifiant inexistant, Redirect URI non déclarée) : l'erreur HTTP existante s'affiche ; le mode d'emploi couvre ces deux causes.

## Tests (Vitest)
- `client-id` : validation / normalisation ; migration (lié → clé ancienne ; délié, absent ou clé déjà présente → inchangé ; idempotence).
- Session : `link()` utilise la clé du réglage dans l'URL d'autorisation et dans les échanges de jetons ; sans clé → `no-client-id` sans `fetch` ; délier conserve la clé ; remplacer / effacer délie si lié ; même clé = aucun effet.
- `PlayerSettings` : les trois états de la maquette, avertissement avant de délier, clé invalide, bouton Lier désactivé sans clé.
- WikiHow : la fiche existe, id jamais annoncé auparavant.

## Hors périmètre
Clé livrée par défaut aux nouveaux utilisateurs ; chiffrement de la clé ; Tidal ; saisie d'une clé depuis un autre appareil.

## Livraison
Fusion de la PR sans attendre (routine du dépôt), pré-prod après fusion. APK à la demande. Vérification manuelle restante : relier un compte avec une clé personnelle dans Chrome.
