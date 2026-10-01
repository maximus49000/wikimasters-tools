# Filtres nature / occupation et vue « Homemade » — conception

## Objectif

Pour chaque carte de la Collection, récupérer sur Wikidata sa **nature** (P31), ses **occupations** (P106, personnes) et ses **genres** (P136, œuvres), les stocker, et proposer deux filtres en cascade dans les vues Map, Chronologique et une nouvelle vue grille « Homemade ». La Grille legacy du site n'est pas modifiée.

## Décisions

- Toutes les valeurs sont stockées (une carte peut avoir plusieurs natures, occupations, genres) : un identifiant Q brut par valeur, jamais réduit à la première.
- Une carte passe un filtre si **au moins une** de ses valeurs correspond.
- 2ᵉ filtre adaptatif : nature « personne » (Q5) → occupations ; sinon → genres. Ses choix viennent **uniquement des cartes de la nature active**. Grisé si rien n'existe.
- Les filtres apparaissent dans Homemade, Map et Chronologique, pas dans la Grille legacy.
- Homemade : même nombre de cartes par page que le site, rendu le plus proche possible de la grille native.

## 1. Données

- **Source** : même requête `wbgetentities props=claims` que les dates ([wikidata-birth.ts](../../../src/core/birth/wikidata-birth.ts)) ; on lit en plus P31, P106, P136 (valeurs de type entité, rangs dépréciés ignorés, rang préféré d'abord). Réutilise `parseWikibaseItems`, `BATCH_SIZE`, `getJson`.
- **Libellés** : une requête `wbgetentities props=labels languages=fr` pour les identifiants Q distincts, par lots de 50. Repli sur le libellé anglais, puis sur l'identifiant.
- **Stockage** : nouveau module `core/kinds/` (`kinds-book.ts`, `kinds-repo.ts`, `wikidata-kinds.ts`) sur le modèle de `core/birth/`. Clé `kinds-v1`, distincte de `dates-v2` (aucune migration).
  ```ts
  type CardKinds = { natures: string[]; occupations: string[]; genres: string[] }; // identifiants Q
  type KindsState = { cards: Record<slug, CardKinds>; labels: Record<qid, string> };
  ```
  Une carte sans élément Wikidata ou sans valeur est enregistrée avec trois tableaux vides (« Inconnu ») et n'est plus redemandée. Un lot en échec n'est pas enregistré ; cooldown de 60 s comme `birth-repo`.
- **Regroupement d'affichage** : table `NATURE_GROUPS` (album studio, live, compilation → « Album », etc.) appliquée à l'affichage et au filtre. Les valeurs stockées restent brutes.

## 2. Filtres

- `buildKindOptions(cards, state, nature)` (pur) : renvoie `{ natures: Option[], facetKind: 'occupation' | 'genre' | null, facets: Option[] }`, chaque `Option` = `{ id, label, count }`.
  - Natures : celles des cartes données, regroupées, avec nombre.
  - Facettes : celles des seules cartes de la nature active ; occupations si la nature active est une personne, genres sinon ; sans nature active, occupations des personnes puis genres des autres.
  - Sans valeur disponible : `facets = []` et le 2ᵉ filtre est grisé.
- `applyKindFilter(cards, state, { nature, facet })` (pur) : intersection « contient ».
- Changer de nature réinitialise la facette si elle n'existe plus dans les nouvelles options.
- Les options sont calculées sur les cartes que laisse le filtre natif en cours (étiquette, rareté).

## 3. État partagé et rangée de filtres

- `kindFilterSource` (`content/kind-filter.ts`), sur le modèle de `createCollectionFilterSource` : `current()`, `set()`, `subscribe()`. Contient `{ nature, facet }`, mémorisé dans `localStorage` (clé `wmt:kindFilter`, erreurs de stockage absorbées).
- Rangée de deux listes déroulantes insérée **juste avant le groupe de pastilles de rareté** (`findRarityFilterAnchor`, [collection-dom.ts](../../../src/content/collection-dom.ts)), entre les listes du site et les pastilles. Style repris des listes natives, deux colonnes égales, y compris à l'écran étroit (APK). Affiche la progression du relevé (« 120 / 450 cartes classées »).
- Montée dans `collection-ui.tsx > sync()` pour les vues Homemade, Map, Chronologique ; retirée en vue Grille legacy.
- Le relevé (`kinds.resolveMissing`) est lancé par `collection-ui`, une seule fois, dès qu'une des trois vues s'ouvre.

## 4. Application dans les vues

- **Map / Chronologique** : `kindFilterSource` s'ajoute en intersection avec `visible` ([TimelinePanel.tsx](../../../src/content/TimelinePanel.tsx), [WorldPanel.tsx](../../../src/content/WorldPanel.tsx)). Le relevé des prix ne porte que sur les cartes qui passent.
- **Homemade** (`CollectionView` : `'list' | 'world' | 'timeline' | 'homemade'`, bouton ajouté dans `world-toggle.ts`) :
  - Cartes locales → filtre natif en cours → filtre nature/occupation → tri rareté puis titre → pagination.
  - **Taille de page** : lue sur le site, jamais en dur. Plus grande valeur de `entries` vue pendant le scan, mémorisée ; à défaut, nombre de cartes de la grille native (`findCardMounts`).
  - **Rendu** : dans le DOM normal (pas de shadow DOM) pour que les classes du site s'appliquent. Conteneur avec la classe de la grille native. Chaque tuile est un clone d'une carte native dont on remplace titre, image, pastille de rareté (éléments repérés par structure, pas par classes CSS). Clics recâblés vers la fiche de marché et la fiche du jeu. Pagination « ← Précédent · Page N / M · Suivant → » clonée de la pagination native (`findPagination`).
  - **Repli** : sans carte native modèle, ou si la structure ne correspond plus, les tuiles de l'aperçu actuel sont utilisées.
  - Prix relevés comme dans les autres vues (`useWantPrices`).

## 4 bis. Sélecteur de vue

- Boutons en **glyphes** (SVG en ligne, style lucide du site) au lieu de texte ; `title` et `aria-label` portent le nom. Ordre, de gauche à droite : **Homemade** (maison), **Monde** (globe), **Chronologique** (frise), **Grille** legacy (grille de carrés) tout à droite.
- **Vue par défaut : Homemade**, à la première ouverture (aucune valeur mémorisée). `readView` ([collection-view.ts](../../../src/content/collection-view.ts)) accepte désormais `'list'` explicitement : une valeur `'list'` déjà mémorisée par un utilisateur est respectée, seule l'absence de valeur donne Homemade. Si le stockage est inaccessible, on reste sur Homemade.
- Le glyphe « maison » est provisoire ; il peut être remplacé sans effet sur le reste.

## 5. Câblage

Mêmes dépendances injectées dans l'extension (`entrypoints/content.tsx`) et dans l'APK (`app/overlay.ts`) : `kinds` repo + fetcher, `kindFilterSource`.

## 6. Tests (vitest)

- Analyse des `claims` (P31/P106/P136, rangs, valeurs non-entité) et des libellés, y compris réponse inattendue qui lève.
- `kinds-repo` : lots, cooldown après échec, « Inconnu » mémorisé, clé distincte.
- `buildKindOptions` et `applyKindFilter` : cascade (nature Album → pas d'occupations d'autres natures), valeurs multiples, regroupement, réinitialisation de la facette.
- Pagination Homemade (taille lue, dernière page partielle, filtre qui réduit le nombre de pages).
- Lecture/écriture de `kindFilterSource` avec stockage indisponible.
- `readView` : absence de valeur → Homemade ; `'list'`, `'world'`, `'timeline'` mémorisés respectés ; stockage inaccessible → Homemade.
- Vérification manuelle dans Chrome (extension) à la fin, comme pour les livraisons précédentes.

## Hors périmètre

Filtre dans la Grille legacy ; occupation du créateur d'une œuvre ; regroupement exhaustif des natures (seuls les cas évidents sont fusionnés, le reste garde son libellé brut).
