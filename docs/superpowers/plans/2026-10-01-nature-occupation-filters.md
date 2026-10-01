# Filtres nature / occupation et vue Homemade — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** récupérer nature (P31), occupations (P106) et genres (P136) de chaque carte sur Wikidata, les stocker, et proposer deux filtres en cascade dans les vues Homemade (nouvelle grille paginée), Monde et Chronologique.

**Architecture :** un module `core/kinds/` (analyse Wikidata, état stocké, dépôt, filtres purs) sur le modèle de `core/birth/`. Une source de filtre partagée (`kindFilterSource`) et une rangée de listes insérée dans la page avant le groupe de pastilles de rareté. Les panneaux Monde et Chronologique intersectent leur filtre natif avec ce filtre ; un nouveau panneau React `HomemadePanel` (shadow DOM, comme les autres) affiche une grille paginée de `buildCardPreview`.

**Tech Stack :** TypeScript, React 19, zod, Vitest 5 (jsdom pour les tests DOM), WXT.

**Spec :** [docs/superpowers/specs/2026-10-01-nature-occupation-filters-design.md](../specs/2026-10-01-nature-occupation-filters-design.md)

## Global Constraints

- Sentence case, texte de l'interface en français, pas de ponctuation finale sur les libellés de boutons et listes.
- Toutes les valeurs P31 / P106 / P136 sont stockées (identifiants Q bruts, jamais réduits à la première) ; le regroupement des natures n'agit qu'à l'affichage et au filtre.
- Une carte passe un filtre si **au moins une** de ses valeurs correspond.
- 2ᵉ filtre : nature « Personne » → occupations ; toute autre nature → genres ; sans nature → les deux ; ses choix ne viennent que des cartes de la nature active.
- Aucune requête n'envoie de données du jeu ou du compte à Wikidata : seuls les titres d'articles partent (comme `fetchWikidataDates`).
- Lots de 50 (`BATCH_SIZE`), écart de 150 ms entre lots, repos de 60 s après un échec.
- Les filtres n'existent pas en vue Grille legacy (`'list'`) ; ils sont affichés en Homemade, Monde, Chronologique.
- Vue par défaut : `'homemade'` quand aucune vue n'est mémorisée ; une valeur `'list'` déjà mémorisée est respectée.
- Ordre des vues, de gauche à droite : Homemade, Monde, Chronologique, Grille legacy ; boutons en glyphes (SVG lucide) avec `title` et `aria-label`.
- Tout accès de tableau suit `noUncheckedIndexedAccess` (`?.`, gardes).
- Les erreurs de `localStorage` sont absorbées (try/catch), comme `collection-view.ts`.
- Les identifiants Q du regroupement des natures sont à vérifier sur Wikidata avant le commit (Task 2, étape 5).

## Commandes de l'environnement

`npx` et `npm` du PATH sont inutilisables ici. Depuis `C:\Users\maxim\Downloads\Wikimasters tools` :

- Un fichier de test : `node node_modules/vitest/vitest.mjs run <chemin>`
- Tous les tests : `node node_modules/vitest/vitest.mjs run`
- Typage : `node node_modules/typescript/bin/tsc --noEmit`
- Build : `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run build`
- `gh` : `"C:/Program Files/GitHub CLI/gh.exe"`
- Créer les fichiers avec l'outil Write (les heredocs multi-blocs échouent parfois).
- Chaque message de commit se termine par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

La branche de travail est `feat/kind-filters` (le spec y est déjà commité).

## Structure des fichiers

**Créés**
- `src/core/kinds/wikidata-kinds.ts` — analyse des `claims` (P31/P106/P136), des libellés, et `fetchWikidataKinds`.
- `src/core/kinds/kinds-book.ts` — état stocké, regroupement des natures, libellés.
- `src/core/kinds/kinds-filter.ts` — options en cascade, filtre, intersection (fonctions pures).
- `src/core/kinds/kinds-repo.ts` — dépôt (clé `kinds-v1`), lots et reprise.
- `src/core/collection/homemade-page.ts` — tri, taille de page, pagination (pur).
- `src/content/kind-filter.ts` — source du filtre choisi (mémorisée dans `localStorage`).
- `src/content/kind-row.ts` — la rangée de deux listes (DOM).
- `src/content/kind-row-controller.ts` — alimente la rangée (cartes, état, filtre natif).
- `src/content/useKindState.ts`, `src/content/useNativeFilter.ts` — hooks des panneaux.
- `src/content/HomemadePanel.tsx` — la vue Homemade.
- Tests miroirs sous `tests/` (voir chaque tâche).

**Modifiés**
- `src/core/birth/wikidata-birth.ts` — `getJson` et `usableClaims` exportés.
- `src/core/collection/collection-scan.ts` — `ScanState.pageSize`.
- `src/content/collection-view.ts`, `src/content/world-toggle.ts` — vue `homemade`, glyphes, ordre, défaut.
- `src/content/TimelinePanel.tsx`, `src/content/WorldPanel.tsx` — intersection avec le filtre nature/occupation.
- `src/content/collection-ui.tsx`, `src/app/overlay.ts` — câblage.
- `tests/content/world-toggle.test.ts`, `tests/core/collection/collection-scan.test.ts` — adaptés.

---

### Task 1: Lecture Wikidata des natures, occupations et genres

**Files:**
- Modify: `src/core/birth/wikidata-birth.ts` (exporter `getJson` et `usableClaims`)
- Create: `src/core/kinds/wikidata-kinds.ts`
- Test: `tests/core/kinds/wikidata-kinds.test.ts`

**Interfaces:**
- Consumes: `BATCH_SIZE`, `getJson`, `parseWikibaseItems`, `usableClaims`, `FetchLike` de `wikidata-birth.ts` ; `slugToTitle` de `core/market/market-book`.
- Produces :
  - `type CardKinds = { natures: string[]; occupations: string[]; genres: string[] }` (identifiants Q)
  - `const NO_KINDS: CardKinds`
  - `type KindsFetch = { kinds: Record<string, CardKinds>; labels: Record<string, string> }` (`kinds` par slug)
  - `parseCardKinds(json: unknown): Record<string, CardKinds>` (par identifiant d'élément ; lève sur format inattendu)
  - `parseLabels(json: unknown): Record<string, string>`
  - `fetchWikidataKinds(fetchFn: FetchLike, slugs: string[]): Promise<KindsFetch>`

- [ ] **Step 1: Exporter les deux helpers de `wikidata-birth.ts`**

Remplacer `function usableClaims(` par `export function usableClaims(` et `async function getJson(` par `export async function getJson(`. Aucune autre modification.

- [ ] **Step 2: Écrire le test qui échoue**

Créer `tests/core/kinds/wikidata-kinds.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { NO_KINDS, fetchWikidataKinds, parseCardKinds, parseLabels } from '../../../src/core/kinds/wikidata-kinds';

const item = (id: string, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value: { 'entity-type': 'item', id } } } });
const entities = (record: Record<string, Record<string, unknown[]>>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([id, claims]) => [id, { claims }])),
});

describe('parseCardKinds', () => {
  it('lit toutes les natures, occupations et genres', () => {
    const kinds = parseCardKinds(
      entities({ Q1: { P31: [item('Q5')], P106: [item('Q177220'), item('Q33999')], P136: [item('Q11399')] } }),
    );
    expect(kinds.Q1).toEqual({ natures: ['Q5'], occupations: ['Q177220', 'Q33999'], genres: ['Q11399'] });
  });

  it('met le rang préféré en premier et ignore les rangs dépréciés', () => {
    const kinds = parseCardKinds(entities({ Q1: { P106: [item('Q1', 'normal'), item('Q2', 'preferred'), item('Q3', 'deprecated')] } }));
    expect(kinds.Q1?.occupations).toEqual(['Q2', 'Q1']);
  });

  it('ignore les valeurs qui ne sont pas des éléments et les doublons', () => {
    const time = { rank: 'normal', mainsnak: { datavalue: { value: { time: '+1889-01-01T00:00:00Z', precision: 9 } } } };
    const kinds = parseCardKinds(entities({ Q1: { P31: [item('Q5'), item('Q5'), time] } }));
    expect(kinds.Q1?.natures).toEqual(['Q5']);
  });

  it('rend des listes vides pour un élément sans ces propriétés', () => {
    expect(parseCardKinds(entities({ Q1: {} })).Q1).toEqual(NO_KINDS);
  });

  it('lève sur une réponse inattendue (pour ne pas la mémoriser comme « sans valeur »)', () => {
    expect(() => parseCardKinds({})).toThrow();
  });
});

describe('parseLabels', () => {
  it('préfère le français, puis l’anglais, et saute les éléments sans libellé', () => {
    const labels = parseLabels({
      entities: {
        Q1: { labels: { fr: { value: 'chanteur' }, en: { value: 'singer' } } },
        Q2: { labels: { en: { value: 'actor' } } },
        Q3: {},
      },
    });
    expect(labels).toEqual({ Q1: 'chanteur', Q2: 'actor' });
  });
});

describe('fetchWikidataKinds', () => {
  const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
  const pages = { query: { pages: [{ title: 'Piaf', pageprops: { wikibase_item: 'Q1' } }, { title: 'Inconnue' }] } };
  const claims = entities({ Q1: { P31: [item('Q5')], P106: [item('Q177220')] } });
  const labels = { entities: { Q5: { labels: { fr: { value: 'être humain' } } }, Q177220: { labels: { fr: { value: 'chanteur' } } } } };

  it('renvoie les valeurs par article, les libellés, et des listes vides sans élément Wikidata', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('wikipedia.org') ? respond(pages) : url.includes('props=claims') ? respond(claims) : respond(labels),
    );

    const result = await fetchWikidataKinds(fetchFn, ['Piaf', 'Inconnue']);

    expect(result.kinds.Piaf).toEqual({ natures: ['Q5'], occupations: ['Q177220'], genres: [] });
    expect(result.kinds.Inconnue).toEqual(NO_KINDS);
    expect(result.labels).toEqual({ Q5: 'être humain', Q177220: 'chanteur' });
  });

  it('ne demande que les libellés des identifiants rencontrés, par lots de 50', async () => {
    const many = Array.from({ length: 120 }, (_, i) => item(`Q${1000 + i}`));
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('wikipedia.org')
        ? respond({ query: { pages: [{ title: 'A', pageprops: { wikibase_item: 'Q1' } }] } })
        : url.includes('props=claims')
          ? respond(entities({ Q1: { P106: many } }))
          : respond({ entities: {} }),
    );

    await fetchWikidataKinds(fetchFn, ['A']);

    const labelCalls = fetchFn.mock.calls.filter(([url]) => url.includes('props=labels'));
    expect(labelCalls).toHaveLength(3);
  });

  it('propage une erreur HTTP', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429 }) as Response);
    await expect(fetchWikidataKinds(fetchFn, ['A'])).rejects.toThrow('429');
  });
});
```

- [ ] **Step 3: Lancer le test, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/kinds/wikidata-kinds.test.ts`
Expected: FAIL (module `wikidata-kinds` introuvable).

- [ ] **Step 4: Implémenter `src/core/kinds/wikidata-kinds.ts`**

```ts
import { z } from 'zod';
import { BATCH_SIZE, getJson, parseWikibaseItems, usableClaims, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle } from '../market/market-book';

// Identifiants Wikidata (Q…) : nature (P31), occupations (P106, personnes) et genres (P136, œuvres).
export type CardKinds = { natures: string[]; occupations: string[]; genres: string[] };

export const NO_KINDS: CardKinds = { natures: [], occupations: [], genres: [] };

export type KindsFetch = {
  // Par slug d'article ; toutes les listes vides = article sans valeur (on ne le redemande pas).
  kinds: Record<string, CardKinds>;
  // Libellé de chaque identifiant rencontré (français, sinon anglais).
  labels: Record<string, string>;
};

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

const claimsResponse = z.object({
  entities: z.record(z.string(), z.object({ claims: z.record(z.string(), z.unknown()).optional() })),
});
const labelsResponse = z.object({
  entities: z.record(z.string(), z.object({ labels: z.record(z.string(), z.object({ value: z.string() })).optional() })),
});
const entityValue = z.object({ id: z.string().regex(/^Q\d+$/) });

// Valeurs de type élément d'une propriété, rang préféré d'abord, sans doublon.
function idsOf(claims: Record<string, unknown>, property: string): string[] {
  const ids: string[] = [];
  for (const claim of usableClaims(claims, property)) {
    const parsed = entityValue.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success && !ids.includes(parsed.data.id)) ids.push(parsed.data.id);
  }
  return ids;
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de valeur ».
export function parseCardKinds(json: unknown): Record<string, CardKinds> {
  const parsed = claimsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, CardKinds> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const claims = entity.claims ?? {};
    result[id] = { natures: idsOf(claims, 'P31'), occupations: idsOf(claims, 'P106'), genres: idsOf(claims, 'P136') };
  }
  return result;
}

export function parseLabels(json: unknown): Record<string, string> {
  const parsed = labelsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, string> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const label = entity.labels?.fr?.value ?? entity.labels?.en?.value;
    if (label) result[id] = label;
  }
  return result;
}

// Un lot d'articles : élément Wikidata, valeurs (une requête `claims`), puis libellés (par lots de 50).
// Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikidataKinds(fetchFn: FetchLike, slugs: string[]): Promise<KindsFetch> {
  const titles = slugs.map(slugToTitle);
  const pagesJson = await getJson(
    fetchFn,
    WIKIPEDIA,
    { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', formatversion: '2', titles: titles.join('|') },
    'Wikipédia',
  );
  const items = parseWikibaseItems(pagesJson, titles);
  const itemIds = [...new Set(Object.values(items).filter((id): id is string => id !== null))];
  const byItem =
    itemIds.length > 0
      ? parseCardKinds(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims', ids: itemIds.join('|') }, 'Wikidata'))
      : {};

  const wanted = new Set<string>();
  for (const kinds of Object.values(byItem)) for (const id of [...kinds.natures, ...kinds.occupations, ...kinds.genres]) wanted.add(id);
  const labels: Record<string, string> = {};
  const list = [...wanted];
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const json = await getJson(
      fetchFn,
      WIKIDATA,
      { action: 'wbgetentities', props: 'labels', languages: 'fr|en', ids: list.slice(i, i + BATCH_SIZE).join('|') },
      'Wikidata',
    );
    Object.assign(labels, parseLabels(json));
  }

  const kinds: Record<string, CardKinds> = {};
  slugs.forEach((slug, index) => {
    const id = items[titles[index] ?? ''];
    kinds[slug] = (id ? byItem[id] : undefined) ?? NO_KINDS;
  });
  return { kinds, labels };
}
```

- [ ] **Step 5: Lancer le test, vérifier qu'il passe**

Run: `node node_modules/vitest/vitest.mjs run tests/core/kinds/wikidata-kinds.test.ts tests/core/birth/wikidata-birth.test.ts`
Expected: PASS (les tests de `wikidata-birth` ne changent pas).

- [ ] **Step 6: Commit**

```bash
git add src/core/birth/wikidata-birth.ts src/core/kinds/wikidata-kinds.ts tests/core/kinds/wikidata-kinds.test.ts
git commit -m "feat: lecture Wikidata des natures, occupations et genres des cartes"
```

---

### Task 2: État stocké, regroupement et libellés

**Files:**
- Create: `src/core/kinds/kinds-book.ts`
- Test: `tests/core/kinds/kinds-book.test.ts`

**Interfaces:**
- Consumes: `CardKinds`, `NO_KINDS` (Task 1).
- Produces :
  - `type KindsState = { cards: Record<string, CardKinds>; labels: Record<string, string> }`
  - `const EMPTY_KINDS: KindsState`
  - `needsKindsLookup(state: KindsState, slug: string): boolean`
  - `setKinds(state: KindsState, kinds: Record<string, CardKinds>, labels: Record<string, string>): KindsState`
  - `const PERSON_NATURE = 'group:Personne'`, `const UNKNOWN_NATURE = 'unknown'`
  - `natureKeys(kinds: CardKinds | undefined): string[]` (clés regroupées, jamais vide : `['unknown']` sans nature)
  - `natureLabel(state: KindsState, key: string): string`
  - `facetsOf(kinds: CardKinds | undefined): string[]` (occupations pour une personne, sinon genres)
  - `facetLabel(state: KindsState, id: string): string`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/core/kinds/kinds-book.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  EMPTY_KINDS,
  PERSON_NATURE,
  UNKNOWN_NATURE,
  facetLabel,
  facetsOf,
  natureKeys,
  natureLabel,
  needsKindsLookup,
  setKinds,
} from '../../../src/core/kinds/kinds-book';

const kinds = (natures: string[], occupations: string[] = [], genres: string[] = []) => ({ natures, occupations, genres });

describe('état', () => {
  it('mémorise chaque article interrogé, y compris sans valeur', () => {
    const state = setKinds(EMPTY_KINDS, { A: kinds([]) }, { Q5: 'être humain' });
    expect(needsKindsLookup(state, 'A')).toBe(false);
    expect(needsKindsLookup(state, 'B')).toBe(true);
    expect(state.labels).toEqual({ Q5: 'être humain' });
  });

  it('fusionne sans perdre l’existant', () => {
    const first = setKinds(EMPTY_KINDS, { A: kinds(['Q5']) }, { Q5: 'être humain' });
    const second = setKinds(first, { B: kinds(['Q482994']) }, { Q482994: 'album' });
    expect(Object.keys(second.cards).sort()).toEqual(['A', 'B']);
    expect(second.labels).toEqual({ Q5: 'être humain', Q482994: 'album' });
  });
});

describe('natureKeys', () => {
  it('regroupe les natures voisines sous une même clé', () => {
    expect(natureKeys(kinds(['Q208569', 'Q482994']))).toEqual(['group:Album']);
    expect(natureKeys(kinds(['Q5']))).toEqual([PERSON_NATURE]);
  });

  it('garde toutes les natures d’une carte, non regroupées comprises', () => {
    expect(natureKeys(kinds(['Q5', 'Q99999']))).toEqual([PERSON_NATURE, 'Q99999']);
  });

  it('rend « inconnue » sans nature ou sans entrée', () => {
    expect(natureKeys(kinds([]))).toEqual([UNKNOWN_NATURE]);
    expect(natureKeys(undefined)).toEqual([UNKNOWN_NATURE]);
  });
});

describe('libellés', () => {
  const state = setKinds(EMPTY_KINDS, {}, { Q99999: 'bâtiment', Q177220: 'chanteur' });

  it('nomme les groupes, l’inconnu, et met une majuscule aux libellés Wikidata', () => {
    expect(natureLabel(state, PERSON_NATURE)).toBe('Personne');
    expect(natureLabel(state, UNKNOWN_NATURE)).toBe('Inconnu');
    expect(natureLabel(state, 'Q99999')).toBe('Bâtiment');
    expect(facetLabel(state, 'Q177220')).toBe('Chanteur');
  });

  it('retombe sur l’identifiant sans libellé', () => {
    expect(natureLabel(state, 'Q1')).toBe('Q1');
    expect(facetLabel(state, 'Q2')).toBe('Q2');
  });
});

describe('facetsOf', () => {
  it('donne les occupations d’une personne et les genres des autres', () => {
    expect(facetsOf(kinds(['Q5'], ['Q177220'], ['Q11399']))).toEqual(['Q177220']);
    expect(facetsOf(kinds(['Q482994'], [], ['Q11399']))).toEqual(['Q11399']);
    expect(facetsOf(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/kinds/kinds-book.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `src/core/kinds/kinds-book.ts`**

```ts
import type { CardKinds } from './wikidata-kinds';

export type KindsState = {
  // Une entrée par article interrogé ; toutes les listes vides = article sans valeur (on ne le redemande pas).
  cards: Record<string, CardKinds>;
  // Libellé de chaque identifiant Q rencontré.
  labels: Record<string, string>;
};

export const EMPTY_KINDS: KindsState = { cards: {}, labels: {} };

export const needsKindsLookup = (state: KindsState, slug: string): boolean =>
  !Object.prototype.hasOwnProperty.call(state.cards, slug);

export function setKinds(state: KindsState, kinds: Record<string, CardKinds>, labels: Record<string, string>): KindsState {
  return { cards: { ...state.cards, ...kinds }, labels: { ...state.labels, ...labels } };
}

const HUMAN = 'Q5';
export const PERSON_NATURE = 'group:Personne';
export const UNKNOWN_NATURE = 'unknown';

// Natures voisines réunies sous un même nom à l'affichage et au filtre. Les valeurs stockées restent brutes :
// changer ce tableau ne demande aucun nouveau téléchargement.
const NATURE_GROUPS: Record<string, string> = {
  Q5: 'Personne',
  Q482994: 'Album',
  Q208569: 'Album',
  Q209939: 'Album',
  Q222910: 'Album',
  Q134556: 'Single',
  Q7366: 'Chanson',
  Q11424: 'Film',
  Q571: 'Livre',
  Q8261: 'Livre',
  Q5398426: 'Série télévisée',
  Q7889: 'Jeu vidéo',
  Q515: 'Ville',
  Q6256: 'Pays',
};

const capitalize = (text: string): string => text.charAt(0).toLocaleUpperCase('fr') + text.slice(1);

// Clés de nature d'une carte : groupe (« group:Album ») ou identifiant Q non regroupé. Jamais vide.
export function natureKeys(kinds: CardKinds | undefined): string[] {
  const keys = new Set((kinds?.natures ?? []).map((id) => (NATURE_GROUPS[id] ? `group:${NATURE_GROUPS[id]}` : id)));
  return keys.size > 0 ? [...keys] : [UNKNOWN_NATURE];
}

export function natureLabel(state: KindsState, key: string): string {
  if (key === UNKNOWN_NATURE) return 'Inconnu';
  if (key.startsWith('group:')) return key.slice('group:'.length);
  return capitalize(state.labels[key] ?? key);
}

// Occupations d'une personne ; genres de tout le reste.
export function facetsOf(kinds: CardKinds | undefined): string[] {
  if (!kinds) return [];
  return kinds.natures.includes(HUMAN) ? kinds.occupations : kinds.genres;
}

export const facetLabel = (state: KindsState, id: string): string => capitalize(state.labels[id] ?? id);
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node node_modules/vitest/vitest.mjs run tests/core/kinds/kinds-book.test.ts`
Expected: PASS. Si `natureLabel(state, 'Q1')` échoue : `capitalize('Q1')` rend `Q1`, c'est attendu.

- [ ] **Step 5: Vérifier les identifiants du regroupement**

Ouvrir `https://www.wikidata.org/wiki/Special:EntityData/<Q>.json` (ou la page de l'élément) dans le navigateur intégré pour chacun : Q5 être humain, Q482994 album, Q208569 album studio, Q209939 album live, Q222910 album de compilation, Q134556 single, Q7366 chanson, Q11424 film, Q571 livre, Q8261 roman, Q5398426 série télévisée, Q7889 jeu vidéo, Q515 ville, Q6256 pays. Corriger tout identifiant dont le libellé français ne correspond pas (tableau `NATURE_GROUPS` et le test « regroupe les natures voisines »).

- [ ] **Step 6: Commit**

```bash
git add src/core/kinds/kinds-book.ts tests/core/kinds/kinds-book.test.ts
git commit -m "feat: état des natures, occupations et genres, regroupement d'affichage"
```

---

### Task 3: Options en cascade et filtre (fonctions pures)

**Files:**
- Create: `src/core/kinds/kinds-filter.ts`
- Test: `tests/core/kinds/kinds-filter.test.ts`

**Interfaces:**
- Consumes: `KindsState`, `PERSON_NATURE`, `facetLabel`, `facetsOf`, `natureKeys`, `natureLabel` (Task 2) ; `KnownCard` de `collection-book`.
- Produces :
  - `type KindFilter = { nature: string; facet: string }` (`''` = aucun) ; `const NO_KIND_FILTER`
  - `isKindFilterActive(filter: KindFilter): boolean`
  - `type KindOption = { id: string; label: string; count: number }`
  - `type KindOptions = { natures: KindOption[]; facets: KindOption[]; facetPlaceholder: string }`
  - `buildKindOptions(cards: KnownCard[], state: KindsState, filter: KindFilter): KindOptions`
  - `applyKindFilter(cards: KnownCard[], state: KindsState, filter: KindFilter): KnownCard[]`
  - `kindSlugs(cards: KnownCard[], state: KindsState, filter: KindFilter): Set<string> | null` (`null` = filtre inactif)
  - `intersectSlugs(a: Set<string> | null, b: Set<string> | null): Set<string> | null`
  - `selectNature(cards: KnownCard[], state: KindsState, filter: KindFilter, nature: string): KindFilter`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/core/kinds/kinds-filter.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { PERSON_NATURE, setKinds, EMPTY_KINDS } from '../../../src/core/kinds/kinds-book';
import {
  NO_KIND_FILTER,
  applyKindFilter,
  buildKindOptions,
  intersectSlugs,
  isKindFilterActive,
  kindSlugs,
  selectNature,
} from '../../../src/core/kinds/kinds-filter';

const card = (slug: string): KnownCard => ({ slug, title: slug });
const cards = ['Piaf', 'OmarSy', 'Hugo', 'Thriller', 'AbbeyRoad', 'Nouvelle'].map(card);
const k = (natures: string[], occupations: string[] = [], genres: string[] = []) => ({ natures, occupations, genres });

const state = setKinds(
  EMPTY_KINDS,
  {
    Piaf: k(['Q5'], ['chanteur']),
    OmarSy: k(['Q5'], ['acteur', 'humoriste']),
    Hugo: k(['Q5'], ['ecrivain', 'chanteur']),
    Thriller: k(['Q482994'], [], ['pop']),
    AbbeyRoad: k(['Q208569'], [], ['rock', 'pop']),
  },
  { chanteur: 'chanteur', acteur: 'acteur', humoriste: 'humoriste', ecrivain: 'écrivain', pop: 'pop', rock: 'rock' },
);

const ids = (options: { id: string }[]) => options.map((o) => o.id);

describe('buildKindOptions', () => {
  it('sans filtre : natures avec nombre, y compris « inconnue » pour les cartes pas encore classées', () => {
    const { natures } = buildKindOptions(cards, state, NO_KIND_FILTER);
    expect(natures.map((o) => [o.id, o.count])).toEqual([
      [PERSON_NATURE, 3],
      ['group:Album', 2],
      ['unknown', 1],
    ]);
  });

  it('nature personne : seulement les occupations des personnes, comptées par carte', () => {
    const { facets, facetPlaceholder } = buildKindOptions(cards, state, { nature: PERSON_NATURE, facet: '' });
    expect(facets.map((o) => [o.id, o.count])).toEqual([['chanteur', 2], ['acteur', 1], ['ecrivain', 1], ['humoriste', 1]]);
    expect(facetPlaceholder).toBe('Occupation');
  });

  it('nature album : seulement des genres, jamais les occupations des personnes', () => {
    const { facets, facetPlaceholder } = buildKindOptions(cards, state, { nature: 'group:Album', facet: '' });
    expect(ids(facets)).toEqual(['pop', 'rock']);
    expect(facets.find((o) => o.id === 'pop')?.count).toBe(2);
    expect(facetPlaceholder).toBe('Genre');
  });

  it('sans nature : occupations et genres ensemble', () => {
    const { facets, facetPlaceholder } = buildKindOptions(cards, state, NO_KIND_FILTER);
    expect(ids(facets).sort()).toEqual(['acteur', 'chanteur', 'ecrivain', 'humoriste', 'pop', 'rock']);
    expect(facetPlaceholder).toBe('Occupation / genre');
  });

  it('nature sans aucune valeur : pas de choix', () => {
    const { facets, facetPlaceholder } = buildKindOptions(cards, state, { nature: 'unknown', facet: '' });
    expect(facets).toEqual([]);
    expect(facetPlaceholder).toBe('Aucun choix');
  });

  it('garde une valeur choisie même si plus aucune carte ne la porte (count 0)', () => {
    const { natures } = buildKindOptions([card('Piaf')], state, { nature: 'group:Album', facet: '' });
    expect(natures.find((o) => o.id === 'group:Album')?.count).toBe(0);
  });
});

describe('applyKindFilter', () => {
  it('rend les cartes telles quelles sans filtre', () => {
    expect(applyKindFilter(cards, state, NO_KIND_FILTER)).toBe(cards);
    expect(isKindFilterActive(NO_KIND_FILTER)).toBe(false);
  });

  it('filtre par nature, puis par occupation (au moins une valeur)', () => {
    expect(applyKindFilter(cards, state, { nature: PERSON_NATURE, facet: '' }).map((c) => c.slug)).toEqual(['Piaf', 'OmarSy', 'Hugo']);
    expect(applyKindFilter(cards, state, { nature: PERSON_NATURE, facet: 'chanteur' }).map((c) => c.slug)).toEqual(['Piaf', 'Hugo']);
  });

  it('filtre par genre sur les albums regroupés, sans nature', () => {
    expect(applyKindFilter(cards, state, { nature: '', facet: 'pop' }).map((c) => c.slug)).toEqual(['Thriller', 'AbbeyRoad']);
  });

  it('écarte les cartes pas encore classées dès qu’un filtre est actif', () => {
    expect(applyKindFilter(cards, state, { nature: 'group:Album', facet: '' }).map((c) => c.slug)).not.toContain('Nouvelle');
  });
});

describe('kindSlugs / intersectSlugs', () => {
  it('kindSlugs vaut null sans filtre', () => {
    expect(kindSlugs(cards, state, NO_KIND_FILTER)).toBeNull();
    expect([...kindSlugs(cards, state, { nature: 'group:Album', facet: '' })!]).toEqual(['Thriller', 'AbbeyRoad']);
  });

  it('intersectSlugs : null = pas de contrainte', () => {
    const a = new Set(['x', 'y']);
    expect(intersectSlugs(null, null)).toBeNull();
    expect(intersectSlugs(a, null)).toBe(a);
    expect(intersectSlugs(null, a)).toBe(a);
    expect([...intersectSlugs(a, new Set(['y', 'z']))!]).toEqual(['y']);
  });
});

describe('selectNature', () => {
  it('garde la facette si elle existe encore pour la nouvelle nature', () => {
    expect(selectNature(cards, state, { nature: '', facet: 'pop' }, 'group:Album')).toEqual({ nature: 'group:Album', facet: 'pop' });
  });

  it('réinitialise la facette si elle n’existe plus (occupation vers album)', () => {
    expect(selectNature(cards, state, { nature: PERSON_NATURE, facet: 'chanteur' }, 'group:Album')).toEqual({ nature: 'group:Album', facet: '' });
  });

  it('revenir à « toutes les natures » garde la facette', () => {
    expect(selectNature(cards, state, { nature: PERSON_NATURE, facet: 'chanteur' }, '')).toEqual({ nature: '', facet: 'chanteur' });
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/kinds/kinds-filter.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `src/core/kinds/kinds-filter.ts`**

```ts
import type { KnownCard } from '../collection/collection-book';
import { PERSON_NATURE, facetLabel, facetsOf, natureKeys, natureLabel, type KindsState } from './kinds-book';
import type { CardKinds } from './wikidata-kinds';

// `''` = pas de choix. `nature` est une clé de `natureKeys` ; `facet` un identifiant Q (occupation ou genre).
export type KindFilter = { nature: string; facet: string };
export const NO_KIND_FILTER: KindFilter = { nature: '', facet: '' };
export const isKindFilterActive = (filter: KindFilter): boolean => filter.nature !== '' || filter.facet !== '';

export type KindOption = { id: string; label: string; count: number };
export type KindOptions = { natures: KindOption[]; facets: KindOption[]; facetPlaceholder: string };

const byCountThenLabel = (a: KindOption, b: KindOption): number => b.count - a.count || a.label.localeCompare(b.label, 'fr');

// Une carte compte une fois par valeur, même si elle la porte plusieurs fois.
function tally(lists: string[][], label: (id: string) => string): KindOption[] {
  const counts = new Map<string, number>();
  for (const list of lists) for (const id of new Set(list)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, label: label(id), count })).sort(byCountThenLabel);
}

// La valeur déjà choisie reste proposée (avec 0 carte) : la liste ne se vide pas sous les yeux de l'utilisateur.
const withSelected = (options: KindOption[], id: string, label: string): KindOption[] =>
  id === '' || options.some((option) => option.id === id) ? options : [...options, { id, label, count: 0 }];

export function buildKindOptions(cards: KnownCard[], state: KindsState, filter: KindFilter): KindOptions {
  const natures = withSelected(
    tally(cards.map((card) => natureKeys(state.cards[card.slug])), (key) => natureLabel(state, key)),
    filter.nature,
    natureLabel(state, filter.nature),
  );
  // Les choix du 2ᵉ filtre ne viennent que des cartes de la nature active.
  const pool = filter.nature ? cards.filter((card) => natureKeys(state.cards[card.slug]).includes(filter.nature)) : cards;
  const facets = withSelected(
    tally(pool.map((card) => facetsOf(state.cards[card.slug])), (id) => facetLabel(state, id)),
    filter.facet,
    facetLabel(state, filter.facet),
  );
  const facetPlaceholder =
    facets.length === 0 ? 'Aucun choix' : !filter.nature ? 'Occupation / genre' : filter.nature === PERSON_NATURE ? 'Occupation' : 'Genre';
  return { natures, facets, facetPlaceholder };
}

function matches(kinds: CardKinds | undefined, filter: KindFilter): boolean {
  if (filter.nature && !natureKeys(kinds).includes(filter.nature)) return false;
  if (filter.facet && !facetsOf(kinds).includes(filter.facet)) return false;
  return true;
}

export function applyKindFilter(cards: KnownCard[], state: KindsState, filter: KindFilter): KnownCard[] {
  return isKindFilterActive(filter) ? cards.filter((card) => matches(state.cards[card.slug], filter)) : cards;
}

// Cartes qui passent le filtre ; `null` : filtre inactif, aucune contrainte.
export function kindSlugs(cards: KnownCard[], state: KindsState, filter: KindFilter): Set<string> | null {
  return isKindFilterActive(filter) ? new Set(applyKindFilter(cards, state, filter).map((card) => card.slug)) : null;
}

// `null` = pas de contrainte de ce côté.
export function intersectSlugs(a: Set<string> | null, b: Set<string> | null): Set<string> | null {
  if (a === null) return b;
  if (b === null) return a;
  return new Set([...a].filter((slug) => b.has(slug)));
}

// Changer de nature garde la facette seulement si elle existe encore parmi les choix de cette nature.
export function selectNature(cards: KnownCard[], state: KindsState, filter: KindFilter, nature: string): KindFilter {
  const facets = buildKindOptions(cards, state, { nature, facet: '' }).facets;
  return { nature, facet: facets.some((option) => option.id === filter.facet) ? filter.facet : '' };
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node node_modules/vitest/vitest.mjs run tests/core/kinds/kinds-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/kinds/kinds-filter.ts tests/core/kinds/kinds-filter.test.ts
git commit -m "feat: options en cascade et filtre nature / occupation / genre"
```

---

### Task 4: Dépôt des natures (stockage, lots, reprise)

**Files:**
- Create: `src/core/kinds/kinds-repo.ts`
- Test: `tests/core/kinds/kinds-repo.test.ts`

**Interfaces:**
- Consumes: `KeyValueStore` ; `BATCH_SIZE` ; `EMPTY_KINDS`, `needsKindsLookup`, `setKinds`, `KindsState` ; `KindsFetch`.
- Produces :
  - `type KindsFetcher = (slugs: string[]) => Promise<KindsFetch>`
  - `createKindsRepo(store, fetchKinds, sleep?, gapMs?, now?)` → `{ subscribe(listener): () => void; load(): Promise<KindsState>; resolveMissing(slugs: string[]): Promise<void> }`
  - `type KindsRepo = ReturnType<typeof createKindsRepo>`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/core/kinds/kinds-repo.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createKindsRepo } from '../../../src/core/kinds/kinds-repo';
import { NO_KINDS, type KindsFetch } from '../../../src/core/kinds/wikidata-kinds';

const noSleep = async () => undefined;
const answer = (slugs: string[]): KindsFetch => ({
  kinds: Object.fromEntries(slugs.map((slug) => [slug, slug === 'Piaf' ? { natures: ['Q5'], occupations: ['Q177220'], genres: [] } : NO_KINDS])),
  labels: { Q5: 'être humain' },
});

describe('createKindsRepo', () => {
  it('interroge chaque article une fois, y compris sans valeur, par lots', async () => {
    const fetchKinds = vi.fn(async (slugs: string[]) => answer(slugs));
    const repo = createKindsRepo(createMemoryStore(), fetchKinds, noSleep);

    await repo.resolveMissing(['Piaf', 'Paris']);
    await repo.resolveMissing(['Piaf', 'Paris']);

    expect(fetchKinds).toHaveBeenCalledTimes(1);
    const state = await repo.load();
    expect(state.cards).toEqual({ Piaf: { natures: ['Q5'], occupations: ['Q177220'], genres: [] }, Paris: NO_KINDS });
    expect(state.labels).toEqual({ Q5: 'être humain' });
  });

  it('découpe en lots de 50 articles', async () => {
    const fetchKinds = vi.fn(async (slugs: string[]) => answer(slugs));
    const repo = createKindsRepo(createMemoryStore(), fetchKinds, noSleep);
    await repo.resolveMissing(Array.from({ length: 120 }, (_, i) => `A${i}`));
    expect(fetchKinds.mock.calls.map(([batch]) => batch.length)).toEqual([50, 50, 20]);
  });

  it('s’arrête à la première erreur, puis attend avant de réessayer', async () => {
    let time = 0;
    const fetchKinds = vi
      .fn<(slugs: string[]) => Promise<KindsFetch>>()
      .mockRejectedValueOnce(new Error('hors ligne'))
      .mockImplementation(async (slugs) => answer(slugs));
    const repo = createKindsRepo(createMemoryStore(), fetchKinds, noSleep, 0, () => time);

    await repo.resolveMissing(['A', 'B']);
    await repo.resolveMissing(['A', 'B']);
    expect(fetchKinds).toHaveBeenCalledTimes(1);
    expect((await repo.load()).cards).toEqual({});

    time = 61_000;
    await repo.resolveMissing(['A', 'B']);
    expect(Object.keys((await repo.load()).cards).sort()).toEqual(['A', 'B']);
  });

  it('prévient les abonnés à chaque écriture', async () => {
    const repo = createKindsRepo(createMemoryStore(), async (slugs) => answer(slugs), noSleep);
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.resolveMissing(Array.from({ length: 60 }, (_, i) => `A${i}`));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stocke sous sa propre clé, sans toucher aux dates', async () => {
    const store = createMemoryStore();
    await store.set('dates-v2', { dates: { X: { birth: 1, death: null, start: null, end: null } } });
    const repo = createKindsRepo(store, async (slugs) => answer(slugs), noSleep);
    await repo.resolveMissing(['A']);
    expect(await store.get('dates-v2')).toEqual({ dates: { X: { birth: 1, death: null, start: null, end: null } } });
    expect(await store.get('kinds-v1')).toBeDefined();
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/kinds/kinds-repo.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `src/core/kinds/kinds-repo.ts`**

```ts
import { BATCH_SIZE } from '../birth/wikidata-birth';
import type { KeyValueStore } from '../cache/store';
import { EMPTY_KINDS, needsKindsLookup, setKinds, type KindsState } from './kinds-book';
import type { KindsFetch } from './wikidata-kinds';

const KEY = 'kinds-v1';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

export type KindsFetcher = (slugs: string[]) => Promise<KindsFetch>;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createKindsRepo(
  store: KeyValueStore,
  fetchKinds: KindsFetcher,
  sleep: (ms: number) => Promise<void> = realSleep,
  gapMs = 150,
  now: () => number = () => Date.now(),
) {
  // Écritures sérialisées ; recherches regroupées en un seul parcours à la fois.
  let writeTail: Promise<unknown> = Promise.resolve();
  const pending = new Set<string>();
  let current: Promise<void> | null = null;
  let failedAt: number | undefined;
  const listeners = new Set<() => void>();

  async function read(): Promise<KindsState> {
    return (await store.get<KindsState>(KEY)) ?? EMPTY_KINDS;
  }

  function update(change: (state: KindsState) => KindsState): Promise<void> {
    const run = writeTail.then(async () => {
      await store.set(KEY, change(await read()));
      for (const listener of listeners) listener();
    });
    writeTail = run.catch(() => undefined);
    return run;
  }

  async function load(): Promise<KindsState> {
    await writeTail;
    return read();
  }

  async function lookupAll(): Promise<void> {
    try {
      let first = true;
      for (;;) {
        const state = await load();
        const batch = [...pending].filter((candidate) => needsKindsLookup(state, candidate)).slice(0, BATCH_SIZE);
        if (batch.length === 0) {
          pending.clear();
          return;
        }
        for (const slug of batch) pending.delete(slug);
        if (!first) await sleep(gapMs);
        first = false;
        try {
          const { kinds, labels } = await fetchKinds(batch);
          await update((latest) => setKinds(latest, kinds, labels));
        } catch (error) {
          console.warn('[wikimasters-tools]', 'natures Wikidata indisponibles :', error);
          failedAt = now();
          pending.clear();
          return;
        }
      }
    } finally {
      current = null;
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    resolveMissing(slugs: string[]): Promise<void> {
      if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return current ?? Promise.resolve();
      for (const slug of slugs) pending.add(slug);
      current ??= lookupAll();
      return current;
    },
  };
}

export type KindsRepo = ReturnType<typeof createKindsRepo>;
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node node_modules/vitest/vitest.mjs run tests/core/kinds`
Expected: PASS sur les quatre fichiers `kinds-*` et `wikidata-kinds`.

- [ ] **Step 5: Commit**

```bash
git add src/core/kinds/kinds-repo.ts tests/core/kinds/kinds-repo.test.ts
git commit -m "feat: dépôt des natures, occupations et genres (lots, reprise, clé kinds-v1)"
```

---

### Task 5: Le scan mémorise la taille de page du site

**Files:**
- Modify: `src/core/collection/collection-scan.ts`
- Test: `tests/core/collection/collection-scan.test.ts`

**Interfaces:**
- Produces: `ScanState.pageSize?: number` — plus grande valeur de `entries` d'une page lue (la taille de page de l'API du site).

- [ ] **Step 1: Ajouter le test qui échoue**

Dans `tests/core/collection/collection-scan.test.ts`, dans `describe('createCollectionScanner', …)`, après le test « demande le tri par date d'ajout » :

```ts
  it('retient la plus grande page lue comme taille de page du site', async () => {
    const { scanner } = setup([page('A', 'B', 'C'), page('D')]);
    await scanner.run();
    expect(await scanner.state()).toMatchObject({ status: 'done', pageSize: 3 });
  });

  it('garde la taille de page connue lors d’une mise à jour incrémentale', async () => {
    const { scanner } = setup([dated(['A', 30], ['B', 20], ['C', 10])]);
    await scanner.run();
    await scanner.run();
    expect(await scanner.state()).toMatchObject({ pageSize: 3 });
  });
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/collection/collection-scan.test.ts`
Expected: FAIL sur les deux nouveaux tests (`pageSize` absent).

- [ ] **Step 3: Modifier `collection-scan.ts`**

1. Dans `type ScanState`, après `pendingObtainedAt?: number;` :

```ts
  // Plus grande page lue (entrées d'une page de l'API du site) : la taille de page de la vue Homemade.
  pageSize?: number;
```

2. Dans `run`, après `let pending: number | undefined;` :

```ts
    let pageSize = 0;
```

3. Juste après `saved = await state();` :

```ts
      pageSize = saved.pageSize ?? 0;
```

4. Dans `snapshot`, après la ligne `...(mode === 'full' && status !== 'done' && pending !== undefined ? { pendingObtainedAt: pending } : {}),` :

```ts
        ...(pageSize > 0 ? { pageSize } : {}),
```

5. Dans la boucle incrémentale, juste après `const result = await api.getCollectionPage(page, undefined, 'added');` (première occurrence) et dans la boucle complète juste après la seconde occurrence de la même ligne, ajouter :

```ts
          pageSize = Math.max(pageSize, result.entries);
```
(indentation de 10 espaces dans la boucle incrémentale, 8 dans la boucle complète, comme le code voisin).

6. Dans le `catch`, dans l'objet passé à `write({ … })`, après la ligne `...(mode === 'full' && pending !== undefined ? { pendingObtainedAt: pending } : {}),` :

```ts
        ...(pageSize > 0 ? { pageSize } : {}),
```

- [ ] **Step 4: Lancer tous les tests du scan**

Run: `node node_modules/vitest/vitest.mjs run tests/core/collection`
Expected: PASS. Si une assertion d'égalité stricte sur l'état échoue à cause de `pageSize`, la remplacer par `toMatchObject` en conservant les champs vérifiés.

- [ ] **Step 5: Commit**

```bash
git add src/core/collection/collection-scan.ts tests/core/collection/collection-scan.test.ts
git commit -m "feat: le scan retient la taille de page du site"
```

---

### Task 6: Tri et pagination de la vue Homemade (fonctions pures)

**Files:**
- Create: `src/core/collection/homemade-page.ts`
- Test: `tests/core/collection/homemade-page.test.ts`

**Interfaces:**
- Consumes: `KnownCard`.
- Produces :
  - `const DEFAULT_PAGE_SIZE = 12`
  - `sortCards(cards: KnownCard[]): KnownCard[]` (rareté L, UR, SR, R, PC, C, puis titre ; nouvelle liste)
  - `pageSizeOf(scanPageSize: number | undefined, domCount: number): number`
  - `pageSlice<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number }` (`page` ramenée dans `[1, pages]`)

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { DEFAULT_PAGE_SIZE, pageSizeOf, pageSlice, sortCards } from '../../../src/core/collection/homemade-page';

const card = (title: string, rarity?: string): KnownCard => ({ slug: title, title, ...(rarity ? { rarity } : {}) });

describe('sortCards', () => {
  it('trie par rareté (L en tête), puis par titre, les cartes sans rareté à la fin', () => {
    const sorted = sortCards([card('B', 'C'), card('Z'), card('A', 'C'), card('M', 'L'), card('K', 'UR')]);
    expect(sorted.map((c) => c.title)).toEqual(['M', 'K', 'A', 'B', 'Z']);
  });

  it('ne modifie pas la liste reçue', () => {
    const input = [card('B', 'C'), card('A', 'L')];
    sortCards(input);
    expect(input.map((c) => c.title)).toEqual(['B', 'A']);
  });
});

describe('pageSizeOf', () => {
  it('retient la plus grande des deux sources', () => {
    expect(pageSizeOf(24, 20)).toBe(24);
    expect(pageSizeOf(undefined, 20)).toBe(20);
    expect(pageSizeOf(10, 0)).toBe(10);
  });

  it('retombe sur la valeur par défaut sans aucune information', () => {
    expect(pageSizeOf(undefined, 0)).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe('pageSlice', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it('découpe en pages de la taille voulue, dernière page partielle', () => {
    expect(pageSlice(items, 1, 12)).toEqual({ items: items.slice(0, 12), page: 1, pages: 3 });
    expect(pageSlice(items, 3, 12)).toEqual({ items: [24], page: 3, pages: 3 });
  });

  it('ramène une page hors limites dans la plage (filtre qui réduit le nombre de pages)', () => {
    expect(pageSlice(items, 9, 12).page).toBe(3);
    expect(pageSlice(items, 0, 12).page).toBe(1);
  });

  it('une liste vide compte une page vide', () => {
    expect(pageSlice([], 1, 12)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/collection/homemade-page.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `src/core/collection/homemade-page.ts`**

```ts
import type { KnownCard } from './collection-book';

// Dernier recours quand ni le scan ni la grille du site n'ont donné de taille de page.
export const DEFAULT_PAGE_SIZE = 12;

const RARITY_ORDER = ['L', 'UR', 'SR', 'R', 'PC', 'C'];
const rank = (rarity: string | undefined): number => {
  const index = rarity ? RARITY_ORDER.indexOf(rarity) : -1;
  return index === -1 ? RARITY_ORDER.length : index;
};

// Comme le tri par défaut du site : rareté décroissante, puis titre.
export function sortCards(cards: KnownCard[]): KnownCard[] {
  return [...cards].sort((a, b) => rank(a.rarity) - rank(b.rarity) || a.title.localeCompare(b.title, 'fr'));
}

// Nombre de cartes par page du site : la plus grande page vue par le scan, ou comptée dans la grille native.
export function pageSizeOf(scanPageSize: number | undefined, domCount: number): number {
  return Math.max(scanPageSize ?? 0, domCount) || DEFAULT_PAGE_SIZE;
}

export function pageSlice<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pages };
}
```

- [ ] **Step 4: Lancer, vérifier qu'il passe**

Run: `node node_modules/vitest/vitest.mjs run tests/core/collection/homemade-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/collection/homemade-page.ts tests/core/collection/homemade-page.test.ts
git commit -m "feat: tri et pagination de la vue Homemade"
```

---

### Task 7: Source du filtre choisi (mémorisée)

**Files:**
- Create: `src/content/kind-filter.ts`
- Test: `tests/content/kind-filter.test.ts`

**Interfaces:**
- Consumes: `KindFilter`, `NO_KIND_FILTER` (Task 3).
- Produces :
  - `createKindFilterSource(storage: Pick<Storage, 'getItem' | 'setItem'>)` → `{ current(): KindFilter; set(next: KindFilter): void; subscribe(listener: () => void): () => void }`
  - `type KindFilterSource = ReturnType<typeof createKindFilterSource>`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createKindFilterSource } from '../../src/content/kind-filter';
import { NO_KIND_FILTER } from '../../src/core/kinds/kinds-filter';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

describe('createKindFilterSource', () => {
  it('démarre sans filtre', () => {
    expect(createKindFilterSource(memoryStorage()).current()).toEqual(NO_KIND_FILTER);
  });

  it('mémorise le filtre et le relit à la création suivante', () => {
    const storage = memoryStorage();
    createKindFilterSource(storage).set({ nature: 'group:Album', facet: 'Q11399' });
    expect(createKindFilterSource(storage).current()).toEqual({ nature: 'group:Album', facet: 'Q11399' });
  });

  it('prévient les abonnés seulement quand la valeur change', () => {
    const source = createKindFilterSource(memoryStorage());
    const listener = vi.fn();
    const off = source.subscribe(listener);
    source.set({ nature: 'group:Film', facet: '' });
    source.set({ nature: 'group:Film', facet: '' });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    source.set(NO_KIND_FILTER);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignore une valeur mémorisée illisible', () => {
    const storage = memoryStorage();
    storage.setItem('wmt:kindFilter', '{"nature": 3}');
    expect(createKindFilterSource(storage).current()).toEqual(NO_KIND_FILTER);
    storage.setItem('wmt:kindFilter', 'pas du json');
    expect(createKindFilterSource(storage).current()).toEqual(NO_KIND_FILTER);
  });

  it('absorbe les erreurs de stockage', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
    };
    const source = createKindFilterSource(broken);
    expect(source.current()).toEqual(NO_KIND_FILTER);
    expect(() => source.set({ nature: 'x', facet: '' })).not.toThrow();
    expect(source.current()).toEqual({ nature: 'x', facet: '' });
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/content/kind-filter.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `src/content/kind-filter.ts`**

```ts
import { NO_KIND_FILTER, type KindFilter } from '../core/kinds/kinds-filter';

const KEY = 'wmt:kindFilter';

// Toute erreur de stockage (accès bloqué, valeur illisible) est absorbée : on repart sans filtre.
function read(storage: Pick<Storage, 'getItem'>): KindFilter {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return NO_KIND_FILTER;
    const value = JSON.parse(raw) as { nature?: unknown; facet?: unknown } | null;
    return typeof value?.nature === 'string' && typeof value.facet === 'string'
      ? { nature: value.nature, facet: value.facet }
      : NO_KIND_FILTER;
  } catch {
    return NO_KIND_FILTER;
  }
}

// Filtre nature / occupation choisi dans la rangée de listes, partagé par les trois vues et mémorisé.
export function createKindFilterSource(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  let current = read(storage);
  const listeners = new Set<() => void>();
  return {
    current: (): KindFilter => current,
    set(next: KindFilter): void {
      if (next.nature === current.nature && next.facet === current.facet) return;
      current = next;
      try {
        storage.setItem(KEY, JSON.stringify(next));
      } catch {
        // stockage indisponible
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type KindFilterSource = ReturnType<typeof createKindFilterSource>;
```

- [ ] **Step 4: Lancer, vérifier qu'il passe**

Run: `node node_modules/vitest/vitest.mjs run tests/content/kind-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/kind-filter.ts tests/content/kind-filter.test.ts
git commit -m "feat: source du filtre nature / occupation, mémorisée"
```

---

### Task 8: Sélecteur de vue en glyphes, vue Homemade, défaut

**Files:**
- Modify: `src/content/collection-view.ts`, `src/content/world-toggle.ts`
- Modify (tests): `tests/content/world-toggle.test.ts`

**Interfaces:**
- Produces :
  - `type CollectionView = 'homemade' | 'world' | 'timeline' | 'list'`
  - `readView(storage)` : `'homemade'` par défaut (aucune valeur, valeur inconnue, stockage inaccessible) ; `'list'`, `'world'`, `'timeline'`, `'homemade'` mémorisés respectés.
  - `ensureViewSwitch(anchor, template, view, onSelect)` inchangé en signature ; boutons en glyphes, ordre Homemade, Monde, Chronologique, Grille.

- [ ] **Step 1: Adapter les tests (ils décrivent le nouveau comportement)**

Dans `tests/content/world-toggle.test.ts`, remplacer le bloc `describe('readView / writeView', …)` et les quatre tests de `describe('ensureViewSwitch', …)` par :

```ts
describe('readView / writeView', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
  };

  it("vaut « homemade » quand aucune vue n'est mémorisée, et relit ce qui a été écrit", () => {
    const storage = memory();
    expect(readView(storage)).toBe('homemade');
    writeView(storage, 'world');
    expect(readView(storage)).toBe('world');
    writeView(storage, 'list');
    expect(readView(storage)).toBe('list');
    writeView(storage, 'timeline');
    expect(readView(storage)).toBe('timeline');
  });

  it("ignore une valeur inconnue", () => {
    const storage = memory();
    storage.setItem('wmt:collectionView', 'autre');
    expect(readView(storage)).toBe('homemade');
  });

  it("absorbe les erreurs de stockage", () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
    };
    expect(readView(broken)).toBe('homemade');
    expect(() => writeView(broken, 'world')).not.toThrow();
  });
});

describe('ensureViewSwitch', () => {
  const NAMES = ['Homemade', 'Monde', 'Chronologique', 'Grille'];

  it("insère quatre boutons en glyphes juste après l'ancre, Homemade en tête et la Grille à droite", () => {
    const select = makeSelect();
    const group = ensureViewSwitch(select, select, 'homemade', () => undefined);

    expect(select.nextElementSibling).toBe(group);
    const buttons = [...group.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('data-wmt-view'))).toEqual(['homemade', 'world', 'timeline', 'list']);
    expect(buttons.map((b) => b.getAttribute('aria-label')?.split(' ')[0])).toEqual(NAMES.map((name) => name.split(' ')[0]));
    expect(buttons.every((b) => b.textContent === '')).toBe(true);
    expect(buttons.every((b) => b.querySelector('svg') !== null)).toBe(true);
    expect(buttons.every((b) => b.className === select.className)).toBe(true);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
  });

  it("est idempotent et met à jour la vue active", () => {
    const select = makeSelect();
    const first = ensureViewSwitch(select, select, 'homemade', () => undefined);
    const second = ensureViewSwitch(select, select, 'timeline', () => undefined);

    expect(second).toBe(first);
    expect(document.querySelectorAll('[data-wmt-view-switch]')).toHaveLength(1);
    expect([...second.querySelectorAll('button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false']);
  });

  it("ne copie ni id, ni disabled, ni l'aria-label du bouton modèle", () => {
    document.body.innerHTML = '<div><button type="button" id="sel" disabled aria-label="x" class="a">Sélectionner</button></div>';
    const select = document.querySelector('button') as HTMLButtonElement;
    const group = ensureViewSwitch(select, select, 'homemade', () => undefined);

    for (const button of group.querySelectorAll('button')) {
      expect(button.hasAttribute('id')).toBe(false);
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-label')).not.toBe('x');
      expect(button.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it("appelle le dernier gestionnaire fourni avec la vue cliquée", () => {
    const select = makeSelect();
    const oldHandler = vi.fn();
    const newHandler = vi.fn();
    ensureViewSwitch(select, select, 'homemade', oldHandler);
    const group = ensureViewSwitch(select, select, 'homemade', newHandler);
    (group.querySelector('[data-wmt-view="timeline"]') as HTMLButtonElement).click();

    expect(oldHandler).not.toHaveBeenCalled();
    expect(newHandler).toHaveBeenCalledWith('timeline');
  });
});
```

Dans la suite `findRarityFilterAnchor`, remplacer les deux appels `ensureViewSwitch(anchor, anchor, 'list', …)` par `'homemade'` n'est pas nécessaire (la vue passée n'a pas d'effet sur ce test) ; ne rien changer d'autre.

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/content/world-toggle.test.ts`
Expected: FAIL (défaut `'list'`, boutons en texte, 3 boutons).

- [ ] **Step 3: Modifier `src/content/collection-view.ts`**

Remplacer tout le contenu par :

```ts
// `list` : la grille du site, inchangée ; `homemade` : notre grille paginée et filtrable (vue par défaut).
export type CollectionView = 'homemade' | 'world' | 'timeline' | 'list';

const KEY = 'wmt:collectionView';

// Toute erreur de stockage (accès bloqué…) est absorbée : on reste en vue Homemade.
export function readView(storage: Pick<Storage, 'getItem'>): CollectionView {
  try {
    const value = storage.getItem(KEY);
    return value === 'list' || value === 'world' || value === 'timeline' || value === 'homemade' ? value : 'homemade';
  } catch {
    return 'homemade';
  }
}

export function writeView(storage: Pick<Storage, 'setItem'>, view: CollectionView): void {
  try {
    storage.setItem(KEY, view);
  } catch {
    // stockage indisponible
  }
}
```

- [ ] **Step 4: Modifier `src/content/world-toggle.ts`**

Remplacer le tableau `VIEWS` (lignes 6 à 10) par la définition ci-dessous, et dans la boucle de création des boutons remplacer `button.textContent = label;` par l'ajout du glyphe et du `aria-label`. Le fichier devient :

```ts
import type { CollectionView } from './collection-view';

export const TOGGLE_ATTRIBUTE = 'data-wmt-view-switch';
const VIEW_ATTRIBUTE = 'data-wmt-view';
const SVG_NS = 'http://www.w3.org/2000/svg';

// Icônes Lucide (« house », « globe », « chart-no-axes-gantt », « layout-grid »), comme celles du site.
const HOUSE = ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'];
const GLOBE = ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'];
const GANTT = ['M8 6h10', 'M6 12h9', 'M11 18h7'];
const GRID = [
  'M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
  'M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
  'M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
  'M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
];

// De gauche à droite : Homemade d'abord (vue par défaut), la Grille du site tout à droite.
const VIEWS: { view: CollectionView; label: string; glyph: string[] }[] = [
  { view: 'homemade', label: 'Homemade : grille paginée et filtrable', glyph: HOUSE },
  { view: 'world', label: 'Monde : la Collection sur une carte du monde', glyph: GLOBE },
  { view: 'timeline', label: 'Chronologique : la Collection sur une frise', glyph: GANTT },
  { view: 'list', label: 'Grille du site', glyph: GRID },
];

function glyphElement(paths: string[]): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// Le sélecteur reprend les classes d'un bouton du site (« Sélectionner ») : il épouse son style sans en dépendre.
export function ensureViewSwitch(
  anchor: HTMLElement,
  template: HTMLButtonElement,
  view: CollectionView,
  onSelect: (view: CollectionView) => void,
): HTMLElement {
  let group: Element | null = anchor.nextElementSibling;
  if (!(group instanceof HTMLElement) || !group.hasAttribute(TOGGLE_ATTRIBUTE)) {
    group = document.createElement('div');
    group.setAttribute(TOGGLE_ATTRIBUTE, '');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Vue de la Collection');
    (group as HTMLElement).style.cssText = 'display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center';
    for (const { view: name, label, glyph } of VIEWS) {
      const button = template.cloneNode(false) as HTMLButtonElement;
      for (const attr of ['id', 'disabled', 'aria-label', 'aria-describedby', 'aria-controls', 'aria-expanded']) {
        button.removeAttribute(attr);
      }
      button.setAttribute(VIEW_ATTRIBUTE, name);
      button.setAttribute('aria-label', label);
      button.title = label;
      button.append(glyphElement(glyph));
      group.append(button);
    }
    anchor.insertAdjacentElement('afterend', group);
  }

  const root = group as HTMLElement;
  for (const button of root.querySelectorAll<HTMLButtonElement>(`[${VIEW_ATTRIBUTE}]`)) {
    const name = button.getAttribute(VIEW_ATTRIBUTE) as CollectionView;
    const on = name === view;
    button.disabled = false;
    button.onclick = () => onSelect(name);
    button.setAttribute('aria-pressed', String(on));
    button.style.borderColor = on ? 'var(--color-accent, #34d399)' : '';
    button.style.color = on ? 'var(--color-accent, #34d399)' : '';
  }
  return root;
}
```

- [ ] **Step 5: Lancer, vérifier que les tests passent, puis le typage**

Run: `node node_modules/vitest/vitest.mjs run tests/content/world-toggle.test.ts`
Expected: PASS.
Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: des erreurs dans `collection-ui.tsx` seulement (le type `CollectionView` a une valeur de plus : `mountPanel`/`sync` ne la gèrent pas encore). Elles seront corrigées Task 13 ; ne pas les corriger ici.

- [ ] **Step 6: Commit**

```bash
git add src/content/collection-view.ts src/content/world-toggle.ts tests/content/world-toggle.test.ts
git commit -m "feat: sélecteur de vues en glyphes, Homemade par défaut, Grille à droite"
```

---

### Task 9: La rangée de listes (DOM)

**Files:**
- Create: `src/content/kind-row.ts`
- Test: `tests/content/kind-row.test.ts`

**Interfaces:**
- Consumes: `KindOption` (Task 3).
- Produces :
  - `const KIND_ROW_ATTRIBUTE = 'data-wmt-kind-row'`
  - `type KindRowModel = { nature: string; facet: string; natures: KindOption[]; facets: KindOption[]; facetPlaceholder: string; progress: string | null }`
  - `type KindRowHandlers = { onNature(value: string): void; onFacet(value: string): void }`
  - `ensureKindRow(target: HTMLElement, model: KindRowModel, handlers: KindRowHandlers): HTMLElement` — insère (ou met à jour) la rangée **juste avant `target`**, idempotent ; ne reconstruit les options d'une liste que si elles ont changé (une liste ouverte ne se referme pas).
  - `removeKindRow(root: ParentNode): void`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KIND_ROW_ATTRIBUTE, ensureKindRow, removeKindRow, type KindRowModel } from '../../src/content/kind-row';

const model = (over: Partial<KindRowModel> = {}): KindRowModel => ({
  nature: '',
  facet: '',
  natures: [
    { id: 'group:Personne', label: 'Personne', count: 3 },
    { id: 'group:Album', label: 'Album', count: 2 },
  ],
  facets: [{ id: 'Q177220', label: 'Chanteur', count: 2 }],
  facetPlaceholder: 'Occupation / genre',
  progress: null,
  ...over,
});
const handlers = () => ({ onNature: vi.fn(), onFacet: vi.fn() });

let target: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="pills"><button>L</button><button>UR</button></div>';
  target = document.getElementById('pills') as HTMLElement;
});

const selects = (row: HTMLElement) => [...row.querySelectorAll('select')];

describe('ensureKindRow', () => {
  it('insère la rangée juste avant la cible, avec deux listes', () => {
    const row = ensureKindRow(target, model(), handlers());
    expect(target.previousElementSibling).toBe(row);
    expect(row.hasAttribute(KIND_ROW_ATTRIBUTE)).toBe(true);
    const [nature, facet] = selects(row);
    expect([...(nature?.options ?? [])].map((o) => o.text)).toEqual(['Nature', 'Personne (3)', 'Album (2)']);
    expect([...(facet?.options ?? [])].map((o) => o.text)).toEqual(['Occupation / genre', 'Chanteur (2)']);
  });

  it('sélectionne les valeurs courantes', () => {
    const row = ensureKindRow(target, model({ nature: 'group:Album', facet: 'Q177220' }), handlers());
    const [nature, facet] = selects(row);
    expect(nature?.value).toBe('group:Album');
    expect(facet?.value).toBe('Q177220');
  });

  it('est idempotent et ne reconstruit pas des options inchangées', () => {
    const first = ensureKindRow(target, model(), handlers());
    const option = selects(first)[0]?.options[1];
    const second = ensureKindRow(target, model({ nature: 'group:Album' }), handlers());
    expect(second).toBe(first);
    expect(document.querySelectorAll(`[${KIND_ROW_ATTRIBUTE}]`)).toHaveLength(1);
    expect(selects(second)[0]?.options[1]).toBe(option);
    expect(selects(second)[0]?.value).toBe('group:Album');
  });

  it('met à jour les options quand elles changent', () => {
    const row = ensureKindRow(target, model(), handlers());
    ensureKindRow(target, model({ facets: [{ id: 'Q11399', label: 'Rock', count: 1 }], facetPlaceholder: 'Genre' }), handlers());
    expect([...(selects(row)[1]?.options ?? [])].map((o) => o.text)).toEqual(['Genre', 'Rock (1)']);
  });

  it('grise le 2ᵉ filtre quand il n’a aucun choix', () => {
    const row = ensureKindRow(target, model({ facets: [], facetPlaceholder: 'Aucun choix' }), handlers());
    expect(selects(row)[1]?.disabled).toBe(true);
    ensureKindRow(target, model(), handlers());
    expect(selects(row)[1]?.disabled).toBe(false);
  });

  it('appelle le dernier gestionnaire fourni avec la valeur choisie', () => {
    const old = handlers();
    const latest = handlers();
    ensureKindRow(target, model(), old);
    const row = ensureKindRow(target, model(), latest);
    const [nature, facet] = selects(row);
    if (!nature || !facet) throw new Error('listes absentes');
    nature.value = 'group:Album';
    nature.dispatchEvent(new Event('change'));
    facet.value = 'Q177220';
    facet.dispatchEvent(new Event('change'));
    expect(old.onNature).not.toHaveBeenCalled();
    expect(latest.onNature).toHaveBeenCalledWith('group:Album');
    expect(latest.onFacet).toHaveBeenCalledWith('Q177220');
  });

  it('affiche la progression du relevé, et la masque quand elle est terminée', () => {
    const row = ensureKindRow(target, model({ progress: '120 / 450 cartes classées' }), handlers());
    const progress = row.querySelector('[data-wmt-kind="progress"]') as HTMLElement;
    expect(progress.textContent).toBe('120 / 450 cartes classées');
    expect(progress.hidden).toBe(false);
    ensureKindRow(target, model({ progress: null }), handlers());
    expect(progress.hidden).toBe(true);
  });
});

describe('ensureKindRow — pas d’écriture inutile', () => {
  it('ne touche pas au DOM quand rien ne change (sinon l’observateur de la page boucle)', () => {
    const row = ensureKindRow(target, model({ nature: 'group:Album', progress: '1 / 3 cartes classées' }), handlers());
    const observer = new MutationObserver(() => undefined);
    observer.observe(row, { childList: true, subtree: true, attributes: true, characterData: true });

    ensureKindRow(target, model({ nature: 'group:Album', progress: '1 / 3 cartes classées' }), handlers());

    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });
});

describe('removeKindRow', () => {
  it('retire la rangée', () => {
    ensureKindRow(target, model(), handlers());
    removeKindRow(document);
    expect(document.querySelector(`[${KIND_ROW_ATTRIBUTE}]`)).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/content/kind-row.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `src/content/kind-row.ts`**

```ts
import type { KindOption } from '../core/kinds/kinds-filter';

export const KIND_ROW_ATTRIBUTE = 'data-wmt-kind-row';

export type KindRowModel = {
  nature: string;
  facet: string;
  natures: KindOption[];
  facets: KindOption[];
  // Texte de l'entrée « aucun choix » du 2ᵉ filtre : « Occupation », « Genre », « Occupation / genre » ou « Aucun choix ».
  facetPlaceholder: string;
  // « 120 / 450 cartes classées » tant que le relevé Wikidata n'est pas fini ; null ensuite.
  progress: string | null;
};

export type KindRowHandlers = { onNature: (value: string) => void; onFacet: (value: string) => void };

const ROW_STYLE = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin:0 0 8px;align-items:center';
const SELECT_STYLE =
  'width:100%;min-width:0;height:44px;padding:0 12px;border-radius:12px;box-sizing:border-box;' +
  'border:1px solid var(--color-border, rgba(148,163,184,0.35));background:var(--color-surface, #0d1117);' +
  'color:var(--color-foreground, #e6edf3);font:500 14px system-ui,sans-serif;cursor:pointer';
const PROGRESS_STYLE = 'grid-column:1 / -1;margin:0;font:12px/16px system-ui,sans-serif;opacity:.7';

function makeSelect(kind: 'nature' | 'facet', label: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.dataset.wmtKind = kind;
  select.setAttribute('aria-label', label);
  select.style.cssText = SELECT_STYLE;
  return select;
}

// Les options ne sont reconstruites que si elles changent : une liste ouverte ne se referme pas à chaque mise à jour.
function fillSelect(select: HTMLSelectElement, placeholder: string, options: KindOption[], value: string): void {
  const signature = JSON.stringify([placeholder, options]);
  if (select.dataset.signature !== signature) {
    select.dataset.signature = signature;
    select.replaceChildren(new Option(placeholder, ''), ...options.map((o) => new Option(`${o.label} (${o.count})`, o.id)));
  }
  if (select.value !== value) select.value = value;
}

// Rangée de deux listes (nature, puis occupation ou genre), posée juste avant `target`.
// Idempotent : appelée à chaque changement du DOM, elle ne touche à rien quand tout est déjà en place.
export function ensureKindRow(target: HTMLElement, model: KindRowModel, handlers: KindRowHandlers): HTMLElement {
  const existing = target.previousElementSibling;
  let row: HTMLElement;
  if (existing instanceof HTMLElement && existing.hasAttribute(KIND_ROW_ATTRIBUTE)) {
    row = existing;
  } else {
    row = document.createElement('div');
    row.setAttribute(KIND_ROW_ATTRIBUTE, '');
    row.style.cssText = ROW_STYLE;
    const progress = document.createElement('p');
    progress.dataset.wmtKind = 'progress';
    progress.style.cssText = PROGRESS_STYLE;
    row.append(makeSelect('nature', 'Nature'), makeSelect('facet', 'Occupation ou genre'), progress);
    target.insertAdjacentElement('beforebegin', row);
  }

  const nature = row.querySelector<HTMLSelectElement>('[data-wmt-kind="nature"]');
  const facet = row.querySelector<HTMLSelectElement>('[data-wmt-kind="facet"]');
  const progress = row.querySelector<HTMLElement>('[data-wmt-kind="progress"]');
  if (!nature || !facet || !progress) return row;

  // Aucune écriture sans changement : la surcouche observe le DOM et rappelle `sync()` à chaque mutation,
  // une réécriture identique relancerait la boucle sans fin.
  fillSelect(nature, 'Nature', model.natures, model.nature);
  fillSelect(facet, model.facetPlaceholder, model.facets, model.facet);
  const noChoice = model.facets.length === 0;
  if (facet.disabled !== noChoice) facet.disabled = noChoice;
  nature.onchange = () => handlers.onNature(nature.value);
  facet.onchange = () => handlers.onFacet(facet.value);
  const text = model.progress ?? '';
  if (progress.textContent !== text) progress.textContent = text;
  const hidden = model.progress === null;
  if (progress.hidden !== hidden) progress.hidden = hidden;
  return row;
}

export function removeKindRow(root: ParentNode): void {
  for (const row of root.querySelectorAll(`[${KIND_ROW_ATTRIBUTE}]`)) row.remove();
}
```

- [ ] **Step 4: Lancer, vérifier qu'il passe**

Run: `node node_modules/vitest/vitest.mjs run tests/content/kind-row.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/kind-row.ts tests/content/kind-row.test.ts
git commit -m "feat: rangée de listes nature et occupation, posée avant les pastilles de rareté"
```

---

### Task 10: Contrôleur de la rangée (données, filtre natif, relevé Wikidata)

**Files:**
- Create: `src/content/kind-row-controller.ts`
- Test: `tests/content/kind-row-controller.test.ts`

**Interfaces:**
- Consumes: `CollectionRepo` (`list`, `subscribe`), `KindsRepo` (`load`, `subscribe`, `resolveMissing`), `CollectionFilterSource` (`current`, `subscribe`), `KindFilterSource` (`current`, `set`, `subscribe`), `filterLocally`, `buildKindOptions`, `selectNature`, `ensureKindRow`, `removeKindRow`.
- Produces: `createKindRowController(deps)` → `{ mount(target: HTMLElement): void; unmount(): void }`.
  - `mount(target)` : pose ou met à jour la rangée avant `target`, lance une fois le relevé Wikidata des cartes inconnues, et se met à jour quand cartes, état Wikidata, filtre natif ou choix changent.
  - `unmount()` : retire la rangée (la source du filtre n'est pas effacée).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKindFilterSource } from '../../src/content/kind-filter';
import { KIND_ROW_ATTRIBUTE } from '../../src/content/kind-row';
import { createKindRowController } from '../../src/content/kind-row-controller';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { EMPTY_KINDS, setKinds, type KindsState } from '../../src/core/kinds/kinds-book';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const cards: KnownCard[] = ['Piaf', 'Hugo', 'Thriller'].map((slug) => ({ slug, title: slug, tags: [] }));
const kindsState: KindsState = setKinds(
  EMPTY_KINDS,
  {
    Piaf: { natures: ['Q5'], occupations: ['Q177220'], genres: [] },
    Hugo: { natures: ['Q5'], occupations: ['Q36180'], genres: [] },
    Thriller: { natures: ['Q482994'], occupations: [], genres: ['Q11399'] },
  },
  { Q177220: 'chanteur', Q36180: 'écrivain', Q11399: 'pop' },
);

function setup(state: KindsState = kindsState) {
  document.body.innerHTML = '<div id="pills"><button>L</button></div>';
  const target = document.getElementById('pills') as HTMLElement;
  const kindFilterSource = createKindFilterSource(memory());
  const kinds = { load: vi.fn(async () => state), subscribe: vi.fn(() => () => undefined), resolveMissing: vi.fn(async () => undefined) };
  const collection = { list: vi.fn(async () => cards), subscribe: vi.fn(() => () => undefined) };
  const filterSource = { current: () => '', subscribe: vi.fn(() => () => undefined) };
  const controller = createKindRowController({
    collection: collection as never,
    kinds: kinds as never,
    filterSource: filterSource as never,
    kindFilterSource,
  });
  return { target, controller, kinds, kindFilterSource };
}

const row = () => document.querySelector(`[${KIND_ROW_ATTRIBUTE}]`) as HTMLElement | null;
const select = (kind: string) => row()?.querySelector<HTMLSelectElement>(`[data-wmt-kind="${kind}"]`);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createKindRowController', () => {
  it('pose la rangée avant la cible avec les natures de la collection, et lance le relevé Wikidata', async () => {
    const { target, controller, kinds } = setup();
    controller.mount(target);
    await vi.waitFor(() => expect(select('nature')?.options.length).toBe(3));

    expect(target.previousElementSibling).toBe(row());
    expect([...(select('nature')?.options ?? [])].map((o) => o.text)).toEqual(['Nature', 'Personne (2)', 'Album (1)']);
    expect(kinds.resolveMissing).toHaveBeenCalledWith(['Piaf', 'Hugo', 'Thriller']);
  });

  it('un choix de nature met à jour le filtre partagé et les occupations proposées', async () => {
    const { target, controller, kindFilterSource } = setup();
    controller.mount(target);
    await vi.waitFor(() => expect(select('nature')?.options.length).toBe(3));

    const nature = select('nature') as HTMLSelectElement;
    nature.value = 'group:Album';
    nature.dispatchEvent(new Event('change'));

    expect(kindFilterSource.current()).toEqual({ nature: 'group:Album', facet: '' });
    await vi.waitFor(() => expect([...(select('facet')?.options ?? [])].map((o) => o.text)).toEqual(['Genre', 'Pop (1)']));
  });

  it('indique la progression tant que des cartes ne sont pas classées', async () => {
    const partial = setKinds(EMPTY_KINDS, { Piaf: { natures: ['Q5'], occupations: [], genres: [] } }, {});
    const { target, controller } = setup(partial);
    controller.mount(target);
    await vi.waitFor(() => expect(row()?.querySelector('[data-wmt-kind="progress"]')?.textContent).toBe('1 / 3 cartes classées'));
  });

  it('ne relit rien quand `mount` est rappelé alors que la rangée est déjà en place (pas de boucle avec l’observateur du DOM)', async () => {
    const { target, controller, kinds } = setup();
    controller.mount(target);
    await vi.waitFor(() => expect(row()).not.toBeNull());
    const calls = kinds.load.mock.calls.length;

    controller.mount(target);
    controller.mount(target);
    await Promise.resolve();

    expect(kinds.load.mock.calls.length).toBe(calls);
  });

  it('retire la rangée au démontage, sans effacer le filtre choisi', async () => {
    const { target, controller, kindFilterSource } = setup();
    controller.mount(target);
    await vi.waitFor(() => expect(row()).not.toBeNull());
    kindFilterSource.set({ nature: 'group:Film', facet: '' });
    controller.unmount();
    expect(row()).toBeNull();
    expect(kindFilterSource.current()).toEqual({ nature: 'group:Film', facet: '' });
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/content/kind-row-controller.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `src/content/kind-row-controller.ts`**

```ts
import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { filterLocally } from '../core/collection/local-filter';
import type { KindsState } from '../core/kinds/kinds-book';
import { buildKindOptions, selectNature } from '../core/kinds/kinds-filter';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { CollectionFilterSource } from './collection-filter';
import type { KindFilterSource } from './kind-filter';
import { KIND_ROW_ATTRIBUTE, ensureKindRow, removeKindRow, type KindRowModel } from './kind-row';

const LOG = '[wikimasters-tools]';

export type KindRowDeps = {
  collection: Pick<CollectionRepo, 'list' | 'subscribe'>;
  kinds: Pick<KindsRepo, 'load' | 'subscribe' | 'resolveMissing'>;
  filterSource: Pick<CollectionFilterSource, 'current' | 'subscribe'>;
  kindFilterSource: KindFilterSource;
};

// Rangée de listes nature / occupation : elle propose les valeurs des cartes que laisse le filtre natif en cours
// (étiquette, rareté), lance le relevé Wikidata des cartes pas encore classées, et écrit le choix dans `kindFilterSource`.
export function createKindRowController({ collection, kinds, filterSource, kindFilterSource }: KindRowDeps) {
  let target: HTMLElement | null = null;
  let subscribed = false;
  let version = 0;
  // Dernières données lues : nécessaires pour réagir à un choix de nature.
  let base: KnownCard[] = [];
  let state: KindsState | null = null;

  const handlers = {
    onNature(value: string) {
      if (state) kindFilterSource.set(selectNature(base, state, kindFilterSource.current(), value));
    },
    onFacet(value: string) {
      kindFilterSource.set({ nature: kindFilterSource.current().nature, facet: value });
    },
  };

  async function refresh(): Promise<void> {
    if (!target) return;
    const mine = ++version;
    const [cards, loaded] = await Promise.all([collection.list(), kinds.load()]);
    if (mine !== version || !target) return;
    void kinds.resolveMissing(cards.map((card) => card.slug)).catch((error) => console.warn(LOG, 'natures non relevées :', error));

    const native = filterLocally(cards, filterSource.current());
    base = native ? cards.filter((card) => native.has(card.slug)) : cards;
    state = loaded;
    const filter = kindFilterSource.current();
    const options = buildKindOptions(base, loaded, filter);
    const classified = cards.filter((card) => Object.prototype.hasOwnProperty.call(loaded.cards, card.slug)).length;
    const model: KindRowModel = {
      nature: filter.nature,
      facet: filter.facet,
      natures: options.natures,
      facets: options.facets,
      facetPlaceholder: options.facetPlaceholder,
      progress: classified < cards.length ? `${classified} / ${cards.length} cartes classées` : null,
    };
    ensureKindRow(target, model, handlers);
  }

  function subscribeOnce(): void {
    if (subscribed) return;
    subscribed = true;
    const refreshLater = () => void refresh().catch((error) => console.warn(LOG, 'filtres nature indisponibles :', error));
    collection.subscribe(refreshLater);
    kinds.subscribe(refreshLater);
    filterSource.subscribe(refreshLater);
    kindFilterSource.subscribe(refreshLater);
  }

  return {
    // Appelé à chaque changement du DOM : rien à faire quand la rangée est déjà en place (les sources abonnées
    // la tiennent à jour) ; sinon (premier appel, cible changée, rangée perdue) on la pose.
    mount(next: HTMLElement): void {
      const placed = next.previousElementSibling?.hasAttribute(KIND_ROW_ATTRIBUTE) === true;
      if (target === next && placed) return;
      target = next;
      subscribeOnce();
      void refresh().catch((error) => console.warn(LOG, 'filtres nature indisponibles :', error));
    },
    unmount(): void {
      target = null;
      version += 1;
      removeKindRow(document);
    },
  };
}

export type KindRowController = ReturnType<typeof createKindRowController>;
```

- [ ] **Step 4: Lancer, vérifier qu'il passe**

Run: `node node_modules/vitest/vitest.mjs run tests/content/kind-row-controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/kind-row-controller.ts tests/content/kind-row-controller.test.ts
git commit -m "feat: contrôleur de la rangée de filtres (filtre natif, relevé Wikidata)"
```

---

### Task 11: Monde et Chronologique appliquent le filtre

**Files:**
- Create: `src/content/useKindState.ts`
- Modify: `src/content/TimelinePanel.tsx`, `src/content/WorldPanel.tsx`

**Interfaces:**
- Consumes: `KindsRepo`, `KindFilterSource`, `kindSlugs`, `intersectSlugs`, `EMPTY_KINDS`, `createThrottledLoader`.
- Produces: `useKindState(kinds: KindsRepo, source: KindFilterSource): { kindsState: KindsState; kindFilter: KindFilter }` ; les deux panneaux reçoivent les props `kinds: KindsRepo` et `kindFilterSource: KindFilterSource`.

Ces composants React n'ont pas de test dans le dépôt : la logique est dans `kinds-filter.ts` (testée) ; ils sont vérifiés par le typage (étape 5) et à la main (Task 14).

- [ ] **Step 1: Créer `src/content/useKindState.ts`**

```ts
import { useEffect, useState } from 'react';
import { EMPTY_KINDS, type KindsState } from '../core/kinds/kinds-book';
import type { KindFilter } from '../core/kinds/kinds-filter';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { KindFilterSource } from './kind-filter';
import { createThrottledLoader } from './throttle';

// État Wikidata (natures, occupations, genres) et filtre choisi dans la rangée de listes, tenus à jour pour une vue.
export function useKindState(kinds: KindsRepo, source: KindFilterSource): { kindsState: KindsState; kindFilter: KindFilter } {
  const [kindsState, setKindsState] = useState<KindsState>(EMPTY_KINDS);
  const [kindFilter, setKindFilter] = useState<KindFilter>(() => source.current());

  useEffect(() => {
    let alive = true;
    const load = () => void kinds.load().then((state) => alive && setKindsState(state));
    const reload = createThrottledLoader(load, 1000);
    load();
    const off = kinds.subscribe(reload.call);
    return () => {
      alive = false;
      reload.cancel();
      off();
    };
  }, [kinds]);

  useEffect(() => source.subscribe(() => setKindFilter(source.current())), [source]);

  return { kindsState, kindFilter };
}
```

- [ ] **Step 2: `TimelinePanel.tsx` — imports, props, filtre**

1. Après la ligne `import { createThrottledLoader } from './throttle';` ajouter :

```ts
import { intersectSlugs, kindSlugs } from '../core/kinds/kinds-filter';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { KindFilterSource } from './kind-filter';
import { useKindState } from './useKindState';
```

2. Dans `type Props`, après `birth: BirthRepo;` ajouter :

```ts
  kinds: KindsRepo;
  kindFilterSource: KindFilterSource;
```

3. Remplacer la signature `export function TimelinePanel({ collection, birth, scanner, book, market, filterSource, loadFiltered, onOpen, onOpenCard, onWantCards }: Props) {` par :

```ts
export function TimelinePanel({ collection, birth, kinds, kindFilterSource, scanner, book, market, filterSource, loadFiltered, onOpen, onOpenCard, onWantCards }: Props) {
```

4. Remplacer ces deux lignes :

```ts
  const visible = localSlugs ?? (filter && allowed?.filter === filter ? allowed.slugs : null);
  const filtering = Boolean(filter) && visible === null && !filterError;
```
par :

```ts
  const nativeVisible = localSlugs ?? (filter && allowed?.filter === filter ? allowed.slugs : null);
  const { kindsState, kindFilter } = useKindState(kinds, kindFilterSource);
  const kindVisible = useMemo(() => kindSlugs(cards, kindsState, kindFilter), [cards, kindsState, kindFilter]);
  // Filtre du site (étiquette, rareté) et filtre nature / occupation : une carte doit passer les deux.
  const visible = useMemo(() => intersectSlugs(nativeVisible, kindVisible), [nativeVisible, kindVisible]);
  const filtering = Boolean(filter) && nativeVisible === null && !filterError;
```

- [ ] **Step 3: `WorldPanel.tsx` — mêmes modifications**

1. Après `import { createThrottledLoader } from './throttle';` ajouter les quatre mêmes imports qu'à l'étape 2.1.
2. Dans `type Props`, après `geo: GeoRepo;` ajouter `kinds: KindsRepo;` et `kindFilterSource: KindFilterSource;`.
3. Remplacer `export function WorldPanel({ collection, geo, scanner, book, market, filterSource, loadFiltered, onOpen, onOpenCard, onWantCards }: Props) {` par :

```ts
export function WorldPanel({ collection, geo, kinds, kindFilterSource, scanner, book, market, filterSource, loadFiltered, onOpen, onOpenCard, onWantCards }: Props) {
```
4. Remplacer ces deux lignes (précédées du commentaire « Tant que la lecture du filtre courant… ») :

```ts
  const visible = localSlugs ?? (filter && allowed?.filter === filter ? allowed.slugs : null);
  const filtering = Boolean(filter) && visible === null && !filterError;
```
par le même bloc qu'à l'étape 2.4 (`nativeVisible`, `useKindState`, `kindVisible`, `visible`, `filtering`).

- [ ] **Step 4: Rappel**

Ne pas toucher au reste des deux fichiers : `visible` alimente déjà `placed`, `unplaced`, `dated`, `undated`, `shown` (prix relevés) et le texte « Filtre actif : N cartes ».

- [ ] **Step 5: Typage**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: des erreurs uniquement dans `collection-ui.tsx` (props `kinds` et `kindFilterSource` manquantes, vue `homemade`) ; aucune dans `TimelinePanel.tsx`, `WorldPanel.tsx`, `useKindState.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/content/useKindState.ts src/content/TimelinePanel.tsx src/content/WorldPanel.tsx
git commit -m "feat: Monde et Chronologique appliquent le filtre nature / occupation"
```

---

### Task 12: La vue Homemade (panneau React)

**Files:**
- Create: `src/content/useNativeFilter.ts`, `src/content/HomemadePanel.tsx`

**Interfaces:**
- Consumes: `useKindState` (Task 11), `applyKindFilter`, `sortCards`, `pageSizeOf`, `pageSlice`, `buildCardPreview`, `CardPopup`, `toCardPreview`, `cardMarket`, `useWantPrices`, `filterLocally`, `ScanState`.
- Produces :
  - `useNativeFilter({ filterSource, loadFiltered, cards, scan }): { filter: string; visible: Set<string> | null; filtering: boolean; error: boolean }` — même logique que Timeline/World pour le filtre du site (on ne refactore pas ces deux panneaux dans ce plan).
  - `HomemadePanel(props)` avec `type Props = { collection; scanner; kinds; kindFilterSource; book; market; filterSource; loadFiltered; nativePageSize: () => number; onOpen: (slug: string) => void; onOpenCard: (slug: string) => void; onWantCards: (cards: KnownCard[]) => void }`.

Pas de test unitaire React (aucun test de composant dans le dépôt) : les calculs sont dans `homemade-page.ts` et `kinds-filter.ts` ; vérification par typage puis à la main (Task 14).

- [ ] **Step 1: Créer `src/content/useNativeFilter.ts`**

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import type { ScanState } from '../core/collection/collection-scan';
import { filterLocally } from '../core/collection/local-filter';
import type { CollectionFilterSource } from './collection-filter';

type Args = {
  filterSource: CollectionFilterSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
  cards: KnownCard[];
  scan: ScanState;
};

// Cartes qui passent le filtre du site (étiquette, rareté, recherche) : lues localement quand la Collection est
// scannée, sinon demandées au site. `visible === null` : pas de filtre, ou lecture en cours (on montre tout).
export function useNativeFilter({ filterSource, loadFiltered, cards, scan }: Args) {
  const [filter, setFilter] = useState(() => filterSource.current());
  const [allowed, setAllowed] = useState<{ filter: string; slugs: Set<string> } | null>(null);
  const [error, setError] = useState(false);
  // Une sélection déjà lue est gardée : la retrouver est instantané.
  const cache = useRef(new Map<string, Set<string>>());

  useEffect(() => filterSource.subscribe(() => setFilter(filterSource.current())), [filterSource]);

  const localSlugs = useMemo(
    () => (filter && scan.status === 'done' ? filterLocally(cards, filter) : null),
    [filter, scan.status, cards],
  );

  useEffect(() => {
    setError(false);
    if (!filter || localSlugs) return;
    const cached = cache.current.get(filter);
    if (cached) {
      setAllowed({ filter, slugs: cached });
      return;
    }
    let cancelled = false;
    loadFiltered(filter, () => cancelled)
      .then((slugs) => {
        if (cancelled) return;
        cache.current.set(filter, slugs);
        setAllowed({ filter, slugs });
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [filter, loadFiltered, localSlugs]);

  const visible = localSlugs ?? (filter && allowed?.filter === filter ? allowed.slugs : null);
  return { filter, visible, filtering: Boolean(filter) && visible === null && !error, error };
}
```

- [ ] **Step 2: Créer `src/content/HomemadePanel.tsx`**

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { cardMarket, toCardPreview, type CardPreview } from '../core/collection/card-preview';
import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { IDLE_SCAN, type CollectionScanner, type ScanState } from '../core/collection/collection-scan';
import { pageSizeOf, pageSlice, sortCards } from '../core/collection/homemade-page';
import { applyKindFilter } from '../core/kinds/kinds-filter';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { PriceBook } from '../core/pricing/price-book';
import type { Rect } from './card-popup-position';
import { buildCardPreview } from './card-preview-dom';
import { CardPopup } from './CardPopup';
import type { CollectionFilterSource } from './collection-filter';
import type { KindFilterSource } from './kind-filter';
import type { MarketSource } from './market-source';
import { createThrottledLoader } from './throttle';
import { useKindState } from './useKindState';
import { useNativeFilter } from './useNativeFilter';
import { useWantPrices } from './useWantPrices';

type Props = {
  collection: CollectionRepo;
  scanner: CollectionScanner;
  kinds: KindsRepo;
  kindFilterSource: KindFilterSource;
  book: PriceBook | null;
  market: MarketSource;
  filterSource: CollectionFilterSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
  // Nombre de cartes comptées dans la grille native de la page (0 si aucune).
  nativePageSize: () => number;
  // Fiche de marché de la carte.
  onOpen: (slug: string) => void;
  onOpenCard: (slug: string) => void;
  // Cartes affichées dont les prix du marché sont à relever.
  onWantCards: (cards: KnownCard[]) => void;
};

// Taille de la carte construite par `buildCardPreview` (voir `.wmt-card` dans PANEL_CSS).
const CARD_WIDTH = 288;
const CARD_HEIGHT = 420;

const pagerButton = (disabled: boolean) =>
  ({
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    font: '500 14px/1 system-ui, sans-serif',
    color: 'inherit',
    background: 'var(--color-surface, #0d1117)',
    border: '1px solid var(--color-border, rgba(148,163,184,0.35))',
    borderRadius: 12,
    padding: '12px 16px',
  }) as const;

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, margin: '12px 0' }}>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} style={pagerButton(page <= 1)}>
        ← Précédent
      </button>
      <span style={{ opacity: 0.7, fontSize: 14 }}>
        Page {page} / {pages}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} style={pagerButton(page >= pages)}>
        Suivant →
      </button>
    </div>
  );
}

// La carte du jeu, réduite pour remplir sa colonne (la largeur est mesurée : 2 colonnes sur écran étroit).
function CardTile({ preview, onPick }: { preview: CardPreview; onPick: (anchor: Rect) => void }) {
  const wrapRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    cardRef.current?.replaceChildren(buildCardPreview(preview));
  }, [preview]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => setScale(wrap.clientWidth / CARD_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={wrapRef}
      type="button"
      aria-label={preview.title}
      onClick={() => {
        const box = wrapRef.current?.getBoundingClientRect();
        if (box) onPick({ left: box.left, right: box.right, top: box.top, bottom: box.bottom });
      }}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}`,
        padding: 0,
        border: 0,
        background: 'none',
        cursor: 'pointer',
        overflow: 'hidden',
        borderRadius: 16,
      }}
    >
      <div
        ref={cardRef}
        style={{ position: 'absolute', left: 0, top: 0, width: CARD_WIDTH, height: CARD_HEIGHT, transformOrigin: '0 0', transform: `scale(${scale})`, pointerEvents: 'none' }}
      />
    </button>
  );
}

export function HomemadePanel({
  collection,
  scanner,
  kinds,
  kindFilterSource,
  book,
  market,
  filterSource,
  loadFiltered,
  nativePageSize,
  onOpen,
  onOpenCard,
  onWantCards,
}: Props) {
  const [cards, setCards] = useState<KnownCard[]>([]);
  const [scan, setScan] = useState<ScanState>(IDLE_SCAN);
  const [page, setPage] = useState(1);
  const [tip, setTip] = useState<{ slug: string; anchor: Rect } | null>(null);

  useEffect(() => {
    let alive = true;
    const loadCards = () => void collection.list().then((list) => alive && setCards(list));
    const loadScan = () => void scanner.state().then((state) => alive && setScan(state));
    const cardsReload = createThrottledLoader(loadCards, 1000);
    loadCards();
    loadScan();
    const offCollection = collection.subscribe(cardsReload.call);
    const offScan = scanner.subscribe(loadScan);
    return () => {
      alive = false;
      cardsReload.cancel();
      offCollection();
      offScan();
    };
  }, [collection, scanner]);

  const { filter, visible, filtering, error } = useNativeFilter({ filterSource, loadFiltered, cards, scan });
  const { kindsState, kindFilter } = useKindState(kinds, kindFilterSource);

  const list = useMemo(
    () => sortCards(applyKindFilter(visible ? cards.filter((card) => visible.has(card.slug)) : cards, kindsState, kindFilter)),
    [cards, visible, kindsState, kindFilter],
  );
  const size = pageSizeOf(scan.pageSize, nativePageSize());
  const current = useMemo(() => pageSlice(list, page, size), [list, page, size]);

  // Un autre filtre : retour à la première page, et l'aperçu ouvert se ferme.
  const filterKey = `${filter}|${kindFilter.nature}|${kindFilter.facet}`;
  useEffect(() => {
    setPage(1);
    setTip(null);
  }, [filterKey]);

  const marketNow = useSyncExternalStore(market.subscribe, market.snapshot);
  const previews = useMemo(
    () =>
      current.items.map((card) =>
        toCardPreview(card, book?.byTitle(card.title) ?? null, cardMarket(marketNow.history, marketNow.pending, card.slug, Date.now())),
      ),
    [current.items, book, marketNow],
  );
  // Seules les cartes de la page affichée ont leurs prix relevés, comme sur la liste du site.
  useWantPrices(current.items, onWantCards);

  const goTo = (next: number) => {
    setTip(null);
    setPage(next);
  };
  const tipIndex = tip ? current.items.findIndex((card) => card.slug === tip.slug) : -1;
  const tipPreview = tipIndex >= 0 ? previews[tipIndex] : undefined;

  return (
    <div style={{ color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}>
      <Pager page={current.page} pages={current.pages} onPage={goTo} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {current.items.map((card, index) => {
          const preview = previews[index];
          return preview ? <CardTile key={card.slug} preview={preview} onPick={(anchor) => setTip({ slug: card.slug, anchor })} /> : null;
        })}
      </div>
      {current.items.length === 0 && (
        <p style={{ opacity: 0.7, textAlign: 'center', margin: '24px 0' }}>
          {cards.length === 0
            ? 'Aucune carte connue : parcourez la Collection pour que l’extension les découvre.'
            : 'Aucune carte ne correspond aux filtres.'}
        </p>
      )}
      <Pager page={current.page} pages={current.pages} onPage={goTo} />
      <p style={{ margin: '0 0 8px', opacity: 0.7, fontSize: 12, textAlign: 'center' }}>
        {filtering && 'Filtre en cours de lecture… '}
        {error && 'Filtre illisible : toutes les cartes sont affichées. '}
        {list.length} carte{list.length > 1 ? 's' : ''} · {size} par page
      </p>
      {tip && tipPreview && (
        <CardPopup
          preview={tipPreview}
          anchor={tip.anchor}
          onOpen={() => {
            setTip(null);
            onOpen(tip.slug);
          }}
          onOpenCard={() => {
            setTip(null);
            onOpenCard(tip.slug);
          }}
          onClose={() => setTip(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typage**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: aucune erreur dans `HomemadePanel.tsx` ni `useNativeFilter.ts` ; les erreurs restantes sont celles de `collection-ui.tsx` (Task 13).

- [ ] **Step 4: Commit**

```bash
git add src/content/useNativeFilter.ts src/content/HomemadePanel.tsx
git commit -m "feat: vue Homemade, grille paginée et filtrable"
```

---

### Task 13: Câblage (collection-ui et overlay)

**Files:**
- Modify: `src/content/collection-ui.tsx`, `src/app/overlay.ts`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: `CollectionUiDeps` reçoit `kinds: KindsRepo` et `kindFilterSource: KindFilterSource` ; `overlay.ts` les crée.

- [ ] **Step 1: `collection-ui.tsx` — imports**

Ajouter après `import type { GeoRepo } from '../core/geo/geo-repo';` :

```ts
import type { KindsRepo } from '../core/kinds/kinds-repo';
```
et après `import type { CollectionFilterSource } from './collection-filter';` :

```ts
import { HomemadePanel } from './HomemadePanel';
import type { KindFilterSource } from './kind-filter';
import { createKindRowController } from './kind-row-controller';
```

- [ ] **Step 2: `collection-ui.tsx` — dépendances et signature**

Dans `type CollectionUiDeps`, après `birth: BirthRepo;` ajouter :

```ts
  kinds: KindsRepo;
  // Filtre nature / occupation choisi dans la rangée de listes (Homemade, Monde, Chronologique).
  kindFilterSource: KindFilterSource;
```
Remplacer la signature par :

```ts
export function createCollectionUi({ collection, geo, birth, kinds, kindFilterSource, scanner, book, filterSource, loadFiltered, openCard, openGameCard, market, onVisibleCards }: CollectionUiDeps) {
```

- [ ] **Step 3: `collection-ui.tsx` — contrôleur, taille de page native, `showList`**

Après `let scanStarted = false;` ajouter :

```ts
  const kindRow = createKindRowController({ collection, kinds, filterSource, kindFilterSource });
  // Plus grand nombre de cartes vues dans la grille native : la taille de page du site, avant que le scan la connaisse.
  let nativeCount = 0;
```
Remplacer `showList` par :

```ts
  function showList(): void {
    unmountPanel();
    kindRow.unmount();
    restoreHiddenGrids(document);
  }
```

- [ ] **Step 4: `collection-ui.tsx` — `mountPanel` : la vue Homemade et les nouvelles props**

Remplacer le bloc `root.render( view === 'timeline' ? (…) : (…), );` par :

```tsx
    const common = { collection, scanner, book, market, filterSource, loadFiltered, onOpen: openCard, onOpenCard: openGameCard, onWantCards: wantCards };
    root.render(
      view === 'timeline' ? (
        <TimelinePanel {...common} birth={birth} kinds={kinds} kindFilterSource={kindFilterSource} />
      ) : view === 'world' ? (
        <WorldPanel {...common} geo={geo} kinds={kinds} kindFilterSource={kindFilterSource} />
      ) : (
        <HomemadePanel {...common} kinds={kinds} kindFilterSource={kindFilterSource} nativePageSize={() => nativeCount} />
      ),
    );
```
(`mountPanel(grid, view)` n'est appelé que pour les vues autres que `'list'` : la signature `view: CollectionView` reste.)

- [ ] **Step 5: `collection-ui.tsx` — `sync()`**

1. Dans le bloc `if (scope) { const cards = scanCollectionCards(scope); if (cards.length > 0) {` ajouter, avant `collection.observe(cards)…` :

```ts
        nativeCount = Math.max(nativeCount, cards.length);
```
2. Remplacer :

```ts
    ensureViewSwitch(findRarityFilterAnchor(document) ?? button, button, view, (next) => {
      writeView(window.localStorage, next);
      sync();
    });

    if (view === 'list') {
      showList();
      return;
    }
```
par :

```ts
    const rarityAnchor = findRarityFilterAnchor(document);
    const switchGroup = ensureViewSwitch(rarityAnchor ?? button, button, view, (next) => {
      writeView(window.localStorage, next);
      sync();
    });

    if (view === 'list') {
      showList();
      return;
    }
    // Les filtres nature / occupation sont posés avant les pastilles de rareté (sinon avant le sélecteur de vues).
    kindRow.mount(rarityAnchor?.parentElement ?? switchGroup);
```

- [ ] **Step 6: `overlay.ts`**

Ajouter aux imports :

```ts
import { fetchWikidataKinds } from '../core/kinds/wikidata-kinds';
import { createKindsRepo } from '../core/kinds/kinds-repo';
import { createKindFilterSource } from '../content/kind-filter';
```
Dans l'appel `createCollectionUi({ … })`, après la ligne `birth: createBirthRepo(…),` ajouter :

```ts
    kinds: createKindsRepo(store, (slugs) => fetchWikidataKinds((url) => fetch(url), slugs)),
    kindFilterSource: createKindFilterSource(window.localStorage),
```

- [ ] **Step 7: Typage et tous les tests**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: aucune erreur.
Run: `node node_modules/vitest/vitest.mjs run`
Expected: tous les tests passent (aucun test existant ne dépend de `collection-ui`).

- [ ] **Step 8: Commit**

```bash
git add src/content/collection-ui.tsx src/app/overlay.ts
git commit -m "feat: câblage des filtres nature / occupation et de la vue Homemade"
```

---

### Task 14: Vérification, build, PR et fusion

**Files:** aucun fichier de code ; routine de livraison du projet.

- [ ] **Step 1: Tests, typage et build complets**

Run, dans l'ordre :
`node node_modules/vitest/vitest.mjs run` — Expected: tous les tests passent.
`node node_modules/typescript/bin/tsc --noEmit` — Expected: aucune erreur.
`node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run build` — Expected: build Chrome terminé sans erreur dans `.output/chrome-mv3`.
`node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run build:overlay` — Expected: build de la surcouche Android sans erreur.

- [ ] **Step 2: Vérification manuelle dans Chrome (par l'utilisateur)**

Recharger l'extension (`chrome://extensions`) et ouvrir `/collection` :
1. Première ouverture sans choix mémorisé : la vue **Homemade** est active ; l'ordre des glyphes est maison, globe, frise, grille.
2. La rangée de deux listes est entre les listes du site et les pastilles L · UR · SR… ; elle disparaît en vue Grille et revient en Monde et Chronologique.
3. « Nature » propose Personne, Album, … avec nombre ; choisir Album ne propose que des genres ; choisir Personne ne propose que des occupations ; « Aucun choix » et liste grisée pour Inconnu.
4. Homemade : le nombre de cartes par page est celui de la Collection du site ; « Page N / M » suit les filtres ; un clic sur une carte ouvre la fenêtre (marché, carte du jeu).
5. Monde et Chronologique : seules les cartes du filtre sont affichées.
6. Recharger la page : le choix de filtre est conservé. Écran étroit (APK) : les deux listes restent côte à côte.
7. La progression « N / M cartes classées » avance, puis disparaît.

Noter tout écart (placement de la rangée, style des listes, taille de page) pour un correctif.

- [ ] **Step 3: Pousser, ouvrir la PR, fusionner (routine du projet)**

```bash
git push -u origin feat/kind-filters
"C:/Program Files/GitHub CLI/gh.exe" pr create --base main --title "feat: filtres nature / occupation et vue Homemade" --body "<résumé>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
"C:/Program Files/GitHub CLI/gh.exe" pr merge --merge
git checkout main && git pull
node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run build
```
(Le corps de la PR résume : Wikidata P31/P106/P136 stockés, filtres en cascade dans Homemade, Monde et Chronologique, glyphes, Homemade par défaut.) Fusionner sans attendre de confirmation (décision permanente du 2026-09-30), puis rebuild local.

- [ ] **Step 4: Livraison**

Pas de nouvelle livraison (`livrables/`) tant que l'utilisateur ne la demande pas ; à ce moment-là, reconstruire l'APK avec le reste (voir `project_livraisons`).
