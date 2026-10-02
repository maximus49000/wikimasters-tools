# Tidal : une seconde plateforme d'écoute, au choix

Date : 2026-10-02. Remplace l'idée initiale « Amazon Music » (écartée : API en bêta fermée, sans refresh token navigateur).

## But

Aujourd'hui la section « Écouter » des cartes musique ne parle qu'à Spotify. On ajoute Tidal comme **plateforme au choix** : un sélecteur Spotify / Tidal dans Plus → Lecteur. Une seule plateforme est active à la fois ; on ne mélange jamais leurs résultats dans une même fiche (ce n'est pas un repli : les conditions de Tidal interdisent d'« intégrer du contenu Tidal avec un autre service »).

## Décisions (validées avec l'utilisateur)

1. **Sélecteur de plateforme** dans Plus → Lecteur ; Spotify par défaut.
2. **Délier uniquement dans Plus → Lecteur.** Le bouton « Délier » de la fiche (`ListenSection`) disparaît ; il ne reste, sur la fiche, que « Lier » quand la plateforme choisie n'est pas liée.
3. **Données par plateforme, jamais perdues.** `listens-v1` reste le dépôt Spotify (aucune migration) ; Tidal écrit dans `listens-tidal-v1`. Délier ne vide aucun dépôt ; changer de plateforme ne lit que le dépôt de la plateforme choisie. Règles identiques pour Tidal : trouvé = gardé pour toujours, « introuvable » = revérifié après 30 j, erreur ou limite = jamais gardé. Pochettes mémorisées avec la liste (aucun appel de plus).
4. **Lecture Tidal = extrait dans l'appli + lien « Ouvrir dans Tidal »** (`tidal.com/track/{id}`, `tidal.com/album/{id}`). Pas de pilotage de l'appli Tidal (n'existe pas). Mini-lecteur avec pastille « Extrait ». Mention « Écoute sur TIDAL » avec lien retour (exigée par les Developer Guidelines).
5. **Pas de Client Secret dans le code.** Flux « code d'autorisation + PKCE » avec le seul Client ID (`Js7eZgbN3qENNo9e`, public). Le secret communiqué dans le chat est à régénérer par l'utilisateur ; il n'est écrit nulle part.

## Architecture

Un `MusicProvider` commun, que `createMusicService` consomme au lieu de `SpotifyApi` / `SpotifySession` en dur :

```
MusicProvider {
  id: 'spotify' | 'tidal'
  session: { isLinked, link, unlink, subscribe }
  resolve(card, kind, music): Promise<Listen | null>   // recherche, jamais de lecture
  listens: ListenRepo                                  // un dépôt par plateforme
  play(item, listen): Promise<void>                    // Spotify : Connect ; Tidal : extrait
  openUrl?(item): string                               // Tidal : page d'écoute
}
```

- `Track.uri` reste l'identifiant de la plateforme (`spotify:track:…`, `tidal:track:…`) ; `Listen` gagne un champ `platform` (le dépôt séparé suffit à les distinguer, le champ sert aux assertions et à l'affichage).
- `createMusicService` choisit le fournisseur actif d'après le réglage `player-platform` (mémorisé comme `player-source`), se réabonne au changement, et ne touche qu'à son dépôt.
- Spotify : comportement inchangé (lecteur, pochettes, file à priorités, pauses par famille). Refactor limité à l'interface ; les tests existants restent verts.
- Tidal : `src/core/tidal/` — `config.ts` (Client ID, scopes, URLs `login.tidal.com`, `auth.tidal.com`, `openapi.tidal.com/v2`), `tidal-session.ts` (PKCE public, refresh token, jetons de 24 h, mêmes garde-fous que `spotify-session`), `tidal-api.ts` (recherche piste/album/artiste, pistes d'un album, JSON:API), `limit` : pause sur 429 via `limit-gate` (famille `tidal`).
- Transport : le service worker de l'extension relaie aussi `login.tidal.com`, `auth.tidal.com`, `openapi.tidal.com` (liste blanche de `transport.ts` étendue, message `wmt:tidal` ou préfixe partagé) ; l'APK appelle depuis la page.
- UI : `PlayerSettings` gagne le sélecteur et lie/délie la plateforme **choisie** ; `ListenSection` perd « Délier », gagne le bouton ↗ et le message « Introuvable sur {plateforme} » ; `SpotifyPlayer` est généralisé (pastille « Extrait » pour Tidal).

## Phases

- **Phase 1 — Plateformes** (sans Tidal réel) : interface `MusicProvider`, sélecteur, dépôts par plateforme, suppression de « Délier » de la fiche. Spotify fonctionne comme avant.
- **Phase 2 — Tidal catalogue** : liaison PKCE, recherche, résolution des listes, mémorisation, bouton ↗. Dépend des Redirect URIs acceptées par le Dashboard Tidal (extension : `https://<id>.chromiumapp.org/` ; APK : à vérifier, un schéma `wikimasterstools://` peut être refusé, auquel cas une page HTTPS de relais sera nécessaire).
- **Phase 3 — Extrait** : lecteur officiel du SDK Tidal (seule lecture autorisée). **Précédée d'une exploration jetable** : le Player tourne-t-il dans l'extension Manifest V3 (pas de code distant, CSP, Widevine) et dans la WebView Android 113 ? Si non, repli : seul le lien ↗ est proposé et on le dit à l'utilisateur.

## Risques connus

- Conditions Tidal : interdiction (sans accord écrit) d'intégrer avec un autre service, de stocker des données d'utilisateur, d'analyser le contenu. Usage privé accepté par l'utilisateur ; ne pas publier sur un store sans accord de Tidal.
- Forme exacte des réponses JSON:API et des scopes non lue en détail (référence Tidal) : à confirmer au début de la phase 2 avec le jeton de l'utilisateur.
- Le Client Secret est exposé dans l'historique du chat : régénération conseillée.

## Tests

Tests unitaires pour chaque module nouveau (session PKCE, API, dépôts séparés, bascule de plateforme, non-perte au déliage), sur le modèle des tests Spotify existants. Non vérifiable sans compte : liaison réelle, extrait, retour sur l'APK (reste manuel, par l'utilisateur).
