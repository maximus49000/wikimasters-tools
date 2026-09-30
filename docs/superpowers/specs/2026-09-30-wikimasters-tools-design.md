# Wikimasters Tools — Design

Date : 2026-09-30
Statut : validé section par section en conversation, en attente de relecture de la spec écrite.

## 1. Objectif et périmètre

Outils **non officiels, en lecture seule** pour le jeu wiki-masters.com (cartes Wikipédia à collectionner), sous forme d'une **extension Chrome** qui affiche des widgets dans les pages du jeu et un popup de tableau de bord.

Cible à terme : service communautaire public (données agrégées anonymes + synchronisation personnelle). **La V1 est extension seule, tout reste local.** Le serveur est reporté en V2 derrière une interface stable.

### Widgets de la V1

| # | Widget | Domaine |
|---|--------|---------|
| 1 | Badge de prix par carte (médiane, fourchette, nb de ventes, tendance) | prix |
| 2 | « Bonne affaire » sur les enchères actives (écart à la médiane) | prix |
| 3 | Prix de mise en vente conseillé (médiane + taux d'invendus) | prix |
| 4 | Courbe de prix d'une carte | prix |
| 5 | Valeur estimée de la collection | collection |
| 6 | Doublons à vendre | collection |
| 8 | Alertes de fin d'enchère (notification locale) | suivi |
| 9 | Bilan achats / ventes | suivi |
| 10 | Tableau de bord (popup) : enchères actives sur 5 max, gains/pertes, valeur | suivi |

Reporté : 7 (équité d'un échange : les wikibidous ne sont pas observables sur le marché).

### Hors périmètre (règles du jeu : automatisation et multi-compte interdits)

Enchère ou surenchère automatique, ouverture automatique de packs, mise en vente ou revente automatique, multi-comptes. Les alertes notifient seulement, elles n'agissent jamais.

## 2. Ce que l'on sait de l'API du jeu

Observé sur le site (session connectée) et sur des réponses fournies par l'utilisateur. Non documentée, susceptible de changer sans préavis.

- Application Next.js ; backend Supabase (`profiles`, `tags`, tables `cards`/`auctions` lues aussi par d'autres outils). Authentification par cookie de session ; les appels `/api/*` partent du navigateur connecté.
- Endpoints internes :
  - `GET /api/my-collection?sort=rarity&page=N&stats=0` (paginé, page 0-indexée, tri requis)
  - `GET /api/my-collection/stats?sort=rarity` (a renvoyé **500** : ne pas en dépendre)
  - `GET /api/marketplace?page=&limit=&sort=&mine=1` : enchères actives paginées (`hasMore`) ; avec `mine=1` ajoute `selling`, `bidding`, `history`, `won`, `maxConcurrentAuctions` (5)
  - `GET /api/marketplace/cards/{cardId}/sales` : historique de ventes d'une carte. **Fonction payante « Vue du marché PRO »** du jeu (champ `is_pro` de `profiles`). Format non observé, **non utilisé en V1** (voir section 4).
  - `GET /api/marketplace/{auctionId}` : détail d'une enchère (historique des mises) ; `GET /api/wikibidous` : solde.
  - `GET /api/trades`, `GET /api/trades?active=1`, `GET /api/notifications`
- Limites signalées par d'autres outils : HTTP 429 en cas de volume élevé (plusieurs milliers de requêtes en quelques minutes ont provoqué des pannes), 409 au-delà du nombre d'enchères simultanées.

### Modèles de données (champs utiles)

- **Carte** : `id`, `wikipedia_title`, `wikipedia_url`, `category` (nullable), `rarity` (`C`, `PC`, `R`, `SR`, `UR`, `L`), `atk`, `def`, `q_score`, `pageviews`, `is_shiny`, `image_url` (nullable), `hide_image`, `lang`, `created_at`.
- **Enchère** : `card_id`, `snapshot_rarity`, `snapshot_atk`, `snapshot_def`, `is_shiny`, `base_amount`, `current_bid`, `effective_bid`, `final_price`, `created_at`, `end_at`, `settled_at`, `status` (`active`, `settled_sold`, `settled_unsold`), `seller`, `winner`, `owned`.
- **Exemplaire possédé** : `user_card_id` distinct de `card_id` (le modèle) ; instantanés `snapshot_atk/def/rarity`.
- **Échange** : `status`, `initiator`, `recipient`, `items[]` (avec `offered_by`), `initiator_wikibidous`, `recipient_wikibidous`, `parent_trade_id`.

Les identités d'autres joueurs (pseudos, identifiants) présentes dans ces réponses ne sont **jamais** stockées ni exportées par l'extension au-delà de ce que l'affichage local exige.

## 3. Architecture

Extension Chrome Manifest V3, TypeScript strict, WXT + React. Quatre couches, chacune testable seule :

1. **`GameApi`** — seul module qui parle à wiki-masters.com. Utilise la session existante, **régule le débit** (file d'attente, backoff sur 429), **valide le format** des réponses et renvoie une erreur typée si un champ attendu manque.
2. **`DataSource`** — interface consommée par les widgets (`getCollection()`, `getPriceStats(cardId, rarity, isShiny)`, `getActiveAuctions()`, `getMyAuctions()`…). V1 : implémentée par `GameApi` + cache local. V2 : une seconde implémentation (serveur communautaire) derrière la même interface, sans modifier les widgets.
3. **Cache et stockage** — `chrome.storage.local` et IndexedDB : prix avec durée de vie, collection, cartes suivies, réglages.
4. **Widgets** — composants React injectés dans les pages du jeu **dans un shadow DOM** (isolation du style), plus le **popup** (tableau de bord, bilan, réglages).

Un **service worker** gère les alarmes (alertes de fin d'enchère, rafraîchissement du cache) et les notifications.

Aucun cookie, jeton ni donnée personnelle n'est envoyé hors du navigateur en V1.

## 4. Données et calculs de prix

- **Source des prix (V1)** : uniquement les **transactions de l'utilisateur** : ventes (`history`) et achats (`won`) de `GET /api/marketplace?page=1&limit=1&mine=1` avec `status = settled_sold` et `final_price` non nul. Jamais les mises à prix ni les invendus. **Aucun appel à `…/sales`** : c'est une fonction payante du jeu (« Vue du marché PRO »), on ne la contourne pas. Les prix communautaires (agrégation d'observations anonymes) sont reportés en V2 et demanderont de vérifier les règles du jeu au préalable.
- **Conséquence** : un badge n'apparaît que pour les cartes que l'utilisateur a déjà achetées ou vendues ; les autres n'affichent rien.
- **Clé de comparaison** : `card_id` + `rarity` + `is_shiny`. `atk`/`def` ne sont pas pris en compte.
- **Statistiques** sur les N dernières ventes (N ≈ 20, fenêtre de temps réglable) : **médiane**, fourchette min/max, nombre de ventes, **tendance** (médiane récente vs précédente). Moins de 3 ventes : indicateur « peu de données ». Aucune vente : « pas de données » (jamais de prix inventé).
- **Bonne affaire** : `écart = enchère actuelle / médiane`, seuil réglable (par défaut 70 %).
- **Prix conseillé** : médiane, ajustée à la baisse selon le **taux d'invendus** (`settled_unsold` / total) des mises en vente passées de l'utilisateur.
- **Valeur de collection** : somme des médianes par carte. Les cartes sans prix connu sont comptées à part. Calculée côté extension à partir des cartes de la collection (indépendante de `my-collection/stats`).
- **Cache** : 12 h par défaut (réglable), reprise 5 min après un échec. Chargement progressif : cartes visibles d'abord, le reste en arrière-plan à débit limité.

## 5. Widgets, alertes, erreurs

**Emplacements.** Badge de prix sous chaque carte (Collection, Marché, Packs) ; liseré « bonne affaire » sur les enchères du marché ; prix conseillé et courbe dans le formulaire de mise en vente et le détail d'une carte ; bandeau valeur/doublons en haut de la Collection ; popup pour le tableau de bord, le bilan et les réglages (seuils, durées de cache, activation par widget).

**Alertes de fin d'enchère.** Alarmes programmées par le service worker pour les enchères où l'utilisateur a misé ou vend ; notification Chrome quelques minutes avant la fin. Notification seulement : aucune action de jeu.

**Erreurs.**
- 429 : backoff croissant ; le badge affiche « données indisponibles », jamais un faux prix.
- Format inattendu : `GameApi` rejette la réponse, le widget concerné se désactive avec un message discret, les autres continuent.
- Utilisateur déconnecté : widgets masqués, message d'invitation à se connecter.
- Page du jeu modifiée (point d'injection introuvable) : ne rien rendre plutôt que casser la page.

## 6. Tests

- **Logique pure** (médiane, écart, tendance, taux d'invendus, valeur de collection) : Vitest, tests unitaires.
- **`GameApi`** : tests de contrat sur des échantillons de réponses **anonymisés** ; un test échoue si un champ attendu disparaît.
- **Bout en bout** : pages simulées avec réponses figées ; aucun appel au vrai site.

## 7. Vie privée et conformité

- V1 : tout reste local ; aucune donnée n'est envoyée à un serveur tiers.
- L'extension est **non officielle et en lecture seule** ; le README le dit et rappelle que les règles du jeu interdisent l'automatisation.
- V2 (hors périmètre de cette spec) : service communautaire avec deux domaines séparés, **A** (observations anonymes de prix agrégées : jamais de pseudos, d'identifiants de joueurs, de cookies ni de jetons) et **D** (synchronisation personnelle privée). Elle exigera son propre design, hébergement, politique de confidentialité et modération des données.

## 8. Points ouverts à confirmer à l'implémentation

- Taille des listes `history` et `won` de `mine=1` (pagination éventuelle, limite d'ancienneté) : les statistiques couvrent ce que l'endpoint renvoie.
- Forme de la réponse de `GET /api/my-collection` (non observée ; nécessaire pour les widgets Collection).
- Option future : utiliser `…/sales` seulement pour un compte PRO (droit de l'utilisateur), avec détection de `is_pro`.
- Valeurs possibles de `status` d'un échange et d'une enchère au-delà de celles observées.
- Point d'injection DOM exact des badges sur chaque page du jeu.
- Débit sûr des requêtes (à calibrer prudemment, en commençant bas).
