# Catégorie « Livres » : carte livre, couverture et glyphe — plan d'implémentation (plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Une carte de livre (roman, poème, essai, théâtre, BD…) a sa section « Livre » dans la fiche (auteur, année, éditeur, pages, genres, synopsis agrandi), sa **couverture comme image par défaut**, son **glyphe livre** sur la carte dans les listes (comme la manette des jeux vidéo) et sa catégorie « Livre » dans le filtre.

**Architecture :** calquée sur les jeux vidéo (`src/core/game/`, `GameSection.tsx`) : natures Wikidata → `book-kinds` ; identifiant Open Library de l'œuvre lu sur Wikidata (P648, `book-repo` mémorisé) ; Open Library (recherche par clé, sinon par titre exact) pour les faits et la couverture ; l'introduction de l'article Wikipédia FR pour le synopsis (repli : description Open Library) ; `book-service` assemble la vue ; la couverture passe par le canal d'image « officiel » déjà utilisé par les jeux (affiche devant l'image Wikipédia).

**Tech Stack :** TypeScript, React 19 (shadow DOM), zod, Vitest + jsdom, WXT.

**Spec :** `docs/superpowers/specs/2026-10-07-livres-design.md` (sections « Résolution d'une carte », « Modèle commun » sans les prix ni la lecture libre, « Image de la carte », « Filtre « Livres » », « Interface »). Feuille de route : `docs/superpowers/plans/2026-10-07-livres-feuille-de-route.md` (ce plan est le n° 2 ; « Changer de livre » ⇄ est le plan 3).

## Global Constraints

- **Glyphes** de l'application (SVG de `Glyphs.tsx`, traits) plutôt que du texte ou des émojis dans l'interface ; les fiches WikiHow, elles, utilisent des émojis (`glyph: '📖'`).
- Zones tactiles de **44 px** ; même contenu sur bureau et mobile ; styles **en ligne** (shadow DOM).
- Textes de l'interface en **français** ; commentaires de code en français, sobres, dans le style du dépôt. **Écrire le français avec les vrais caractères UTF-8 (é è ê à ç ’ « » ×) via les outils Write/Edit, jamais via un chemin ASCII** (des accents ont déjà été perdus) ; vérifier par `grep` avant de committer.
- **Synopsis agrandi** : 16 px sur bureau, 15 px sur mobile (`fontSize: 'clamp(15px, 4vw, 16px)'`), interligne 25 px, encadré défilant (`maxHeight: 300`), titre « Synopsis » ; lien « Lire l'article complet ↗ » vers Wikipédia ; jamais tronqué.
- La carte garde la vision habituelle de toutes les cartes ; la **couverture est l'image par défaut** quand elle existe, devant l'image Wikipédia et les images de remplacement.
- Section placée **comme film / série / jeu** : sous le bloc d'étiquettes, après les autres sections de l'extension, avant « Mauvaise image » ; ordre : écouter, écran, jeu, **livre**, image.
- Glyphe de carte dans les listes : la bobine l'emporte sur la manette, puis sur la note, puis sur le **livre** ; titre/`aria-label` « Livre ».
- Natures regroupées sous « Livre » (Wikidata) : `Q571, Q8261, Q7725634, Q49084, Q25379, Q35760, Q5185279, Q12106333, Q149537, Q1318295, Q1667921, Q1004, Q725377, Q8274, Q21198342` ; *Les Misérables* n'a que `Q7725634` (œuvre littéraire).
- Un format de réponse inattendu **lève** (jamais mémorisé comme « absent ») ; un échec réseau ne casse pas la fiche (message discret `role="status"`) ; rien n'est inventé.
- Limites : requêtes Wikipédia/Wikidata par lots, sans parallélisme excessif (200 requêtes par minute et par IP) ; Open Library sans clé.
- `exactOptionalPropertyTypes` est actif : propriétés optionnelles ajoutées par `...(x ? { k: x } : {})`.
- Vérification : `npm run typecheck`, `npm test`, `npm run build`.

## Structure des fichiers

Créer : `src/core/book/{config,errors,http,book-detail,book-format,book-kinds,openlibrary-api,wikidata-book,wikipedia-intro,book-repo}.ts`, `src/content/{book-service.ts,book-registry.ts,BookSection.tsx,useBookSlugs.ts}`, tests miroirs sous `tests/core/book/` et `tests/content/`.
Modifier : `src/core/kinds/kinds-book.ts`, `src/content/Glyphs.tsx`, `src/content/decorate-listen.ts`, `src/content/mount.tsx`, `src/core/collection/card-preview.ts`, `src/content/card-preview-dom.ts`, `src/content/{HomemadePanel,TimelinePanel,WorldPanel}.tsx`, `src/app/overlay.ts`, `src/core/whats-new/entries.ts`.

---

### Task 0 : Branche de travail

**Files:** aucun.

- [ ] **Step 1 : Vérifier**

Run: `git branch --show-current && git status --short`
Expected: `feat/livres-carte`, arbre propre (créée depuis `main` après la fusion du plan 1). Une autre session peut travailler dans le même dossier : ne jamais utiliser `git stash -u` ; en cas de doute, créer un worktree hors du dépôt.

- [ ] **Step 2 : Commiter ce plan**

```bash
git add docs/superpowers/plans/2026-10-07-livres-carte.md docs/superpowers/plans/2026-10-07-livres-feuille-de-route.md
git commit -m "docs(livres): plan 2 (carte livre, couverture, glyphe)"
```

---

### Task 1 : Natures « Livre » et filtre

**Files:**
- Create: `src/core/book/book-kinds.ts`
- Modify: `src/core/kinds/kinds-book.ts` (table `NATURE_GROUPS`, lignes `Q571: 'Livre', Q8261: 'Livre',`)
- Test: `tests/core/book/book-kinds.test.ts`, `tests/core/kinds/kinds-book.test.ts` (ajout)

**Interfaces:**
- Produces: `BOOK_NATURES: readonly string[]`, `isBookCard(kinds: CardKinds | undefined): boolean`.

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
// tests/core/book/book-kinds.test.ts
import { describe, expect, it } from 'vitest';
import { BOOK_NATURES, isBookCard } from '../../../src/core/book/book-kinds';

const kinds = (natures: string[]) => ({ natures, occupations: [], genres: [] });

describe('isBookCard', () => {
  it('reconnaît une œuvre littéraire (Les Misérables), un roman, une pièce de théâtre, une bande dessinée', () => {
    for (const nature of ['Q7725634', 'Q8261', 'Q25379', 'Q1004']) expect(isBookCard(kinds([nature])), nature).toBe(true);
  });
  it('ne reconnaît ni un film, ni un jeu vidéo, ni une personne, ni une carte sans nature', () => {
    expect(isBookCard(kinds(['Q11424']))).toBe(false);
    expect(isBookCard(kinds(['Q7889']))).toBe(false);
    expect(isBookCard(kinds(['Q5']))).toBe(false);
    expect(isBookCard(undefined)).toBe(false);
  });
  it('liste quinze natures sans doublon', () => {
    expect(new Set(BOOK_NATURES).size).toBe(15);
  });
});
```

Ajouter à la fin de `tests/core/kinds/kinds-book.test.ts` (dans un nouveau `describe`, en réutilisant l'aide `kinds` du fichier) :

```ts
describe('natures « Livre »', () => {
  it('regroupe œuvre littéraire, roman, nouvelle, théâtre et bande dessinée sous un même nom', () => {
    expect(natureKeys(kinds(['Q7725634']))).toEqual(['group:Livre']);
    expect(natureKeys(kinds(['Q8261', 'Q7725634']))).toEqual(['group:Livre']);
    expect(natureKeys(kinds(['Q25379']))).toEqual(['group:Livre']);
    expect(natureKeys(kinds(['Q1004']))).toEqual(['group:Livre']);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/book/book-kinds.test.ts tests/core/kinds/kinds-book.test.ts`
Expected: FAIL (module `book-kinds` introuvable ; `group:Livre` absent pour `Q7725634`).

- [ ] **Step 3 : Implémenter**

```ts
// src/core/book/book-kinds.ts
import type { CardKinds } from '../kinds/wikidata-kinds';

// Natures Wikidata d'une œuvre écrite : livre, roman, œuvre littéraire, nouvelle, pièce de théâtre, essai, poème, recueil de poèmes,
// roman court, récit, suite romanesque, bande dessinée, roman graphique, manga, série de manga.
export const BOOK_NATURES: readonly string[] = [
  'Q571',
  'Q8261',
  'Q7725634',
  'Q49084',
  'Q25379',
  'Q35760',
  'Q5185279',
  'Q12106333',
  'Q149537',
  'Q1318295',
  'Q1667921',
  'Q1004',
  'Q725377',
  'Q8274',
  'Q21198342',
];

const BOOK = new Set(BOOK_NATURES);

// Une carte dont une nature Wikidata est une œuvre écrite.
export const isBookCard = (kinds: CardKinds | undefined): boolean => kinds?.natures.some((id) => BOOK.has(id)) ?? false;
```

Dans `src/core/kinds/kinds-book.ts` : ajouter `import { BOOK_NATURES } from '../book/book-kinds';` en tête, retirer les deux lignes `Q571: 'Livre',` et `Q8261: 'Livre',` de `NATURE_GROUPS`, et ajouter en première entrée de l'objet : `...Object.fromEntries(BOOK_NATURES.map((id) => [id, 'Livre'])),`.

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/core/book/book-kinds.test.ts tests/core/kinds && npm run typecheck`
Expected: PASS (les tests existants de `kinds-book` aussi), aucune erreur de types.

- [ ] **Step 5 : Commit**

```bash
git add src/core/book/book-kinds.ts src/core/kinds/kinds-book.ts tests/core/book/book-kinds.test.ts tests/core/kinds/kinds-book.test.ts
git commit -m "feat(book): natures « Livre » regroupées pour le filtre et la reconnaissance des cartes"
```

---

### Task 2 : Socle `core/book` (config, erreurs, appels JSON, format, types)

**Files:**
- Create: `src/core/book/config.ts`, `src/core/book/errors.ts`, `src/core/book/http.ts`, `src/core/book/book-detail.ts`, `src/core/book/book-format.ts`
- Test: `tests/core/book/http.test.ts`, `tests/core/book/book-format.test.ts`

**Interfaces:**
- Produces :
  - `OPENLIBRARY_BASE`, `OPENLIBRARY_COVER_BASE`, `WIKIPEDIA_API`, `WIKIPEDIA_ARTICLE_BASE` (constantes de `config.ts`)
  - `class BookError(code: 'not-found' | 'rate-limited' | 'http', message)`, `bookErrorMessage(error: unknown): string`
  - `requestJson<S extends z.ZodType>(fetchFn: BookFetch, url: string, schema: S): Promise<z.infer<S>>`
  - `type BookFetch = (url: string) => Promise<Response>`
  - `type BookDetail` (voir code), `type BookView` n'est **pas** ici (Task 6)
  - `normalizeTitle` (ré-export de `../game/game-format`), `coverUrl(coverId: number): string`, `workPageUrl(workId: string): string`, `articleUrl(slug: string): string`, `firstIsbn13(isbns: readonly string[] | undefined): string | undefined`, `isWorkId(id: string): boolean`

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
// tests/core/book/http.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BookError, bookErrorMessage } from '../../../src/core/book/errors';
import { requestJson } from '../../../src/core/book/http';

const schema = z.object({ docs: z.array(z.object({ title: z.string() })) });
const reply = (status: number, body: unknown = {}) => async () => new Response(JSON.stringify(body), { status });

describe('requestJson', () => {
  it('rend le JSON valide', async () => {
    expect(await requestJson(reply(200, { docs: [{ title: 'L’étranger' }] }), 'https://x/y', schema)).toEqual({ docs: [{ title: 'L’étranger' }] });
  });

  it.each([
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'http'],
  ])('le statut %i devient une BookError « %s »', async (status, code) => {
    await expect(requestJson(reply(status), 'https://x/y', schema)).rejects.toMatchObject({ name: 'BookError', code });
  });

  it('un réseau en panne devient une BookError « http »', async () => {
    const down = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(requestJson(down, 'https://x/y', schema)).rejects.toMatchObject({ code: 'http' });
  });

  it('une réponse au format inattendu lève', async () => {
    await expect(requestJson(reply(200, { pas: 'open library' }), 'https://x/y', schema)).rejects.toBeInstanceOf(BookError);
  });
});

describe('bookErrorMessage', () => {
  it('parle français et nomme Open Library', () => {
    expect(bookErrorMessage(new BookError('rate-limited', 'x'))).toContain('patienter');
    expect(bookErrorMessage(new BookError('not-found', 'x'))).toBe('Introuvable sur Open Library.');
    expect(bookErrorMessage(new BookError('http', 'x'))).toContain('Open Library');
    expect(bookErrorMessage(new Error('autre'))).toContain('indisponibles');
  });
});
```

```ts
// tests/core/book/book-format.test.ts
import { describe, expect, it } from 'vitest';
import { articleUrl, coverUrl, firstIsbn13, isWorkId, normalizeTitle, workPageUrl } from '../../../src/core/book/book-format';

describe('book-format', () => {
  it('construit les adresses Open Library et Wikipédia', () => {
    expect(coverUrl(13151269)).toBe('https://covers.openlibrary.org/b/id/13151269-L.jpg');
    expect(workPageUrl('OL1230613W')).toBe('https://openlibrary.org/works/OL1230613W');
    expect(articleUrl("L'Étranger_(roman)")).toBe("https://fr.wikipedia.org/wiki/L'%C3%89tranger_(roman)");
  });
  it('choisit le premier ISBN-13', () => {
    expect(firstIsbn13(['2070360024', '9782070360024', '9780679720201'])).toBe('9782070360024');
    expect(firstIsbn13(['2070360024'])).toBeUndefined();
    expect(firstIsbn13(undefined)).toBeUndefined();
  });
  it('reconnaît un identifiant d’œuvre Open Library', () => {
    expect(isWorkId('OL1230613W')).toBe(true);
    expect(isWorkId('OL1230613A')).toBe(false);
    expect(isWorkId('../etc')).toBe(false);
  });
  it('compare les titres sans accents, casse ni ponctuation', () => {
    expect(normalizeTitle('L’étranger')).toBe(normalizeTitle("L'Étranger"));
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/book/http.test.ts tests/core/book/book-format.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3 : Écrire les fichiers**

```ts
// src/core/book/config.ts
// Open Library (sans clé, CORS ouvert) et Wikipédia FR : l'introduction d'un article sert de synopsis.
export const OPENLIBRARY_BASE = 'https://openlibrary.org';
export const OPENLIBRARY_COVER_BASE = 'https://covers.openlibrary.org/b/id';
export const WIKIPEDIA_API = 'https://fr.wikipedia.org/w/api.php';
export const WIKIPEDIA_ARTICLE_BASE = 'https://fr.wikipedia.org/wiki';
```

```ts
// src/core/book/errors.ts
export type BookErrorCode = 'not-found' | 'rate-limited' | 'http';

export class BookError extends Error {
  constructor(
    readonly code: BookErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BookError';
  }
}

export function bookErrorMessage(error: unknown): string {
  if (!(error instanceof BookError)) return 'Les informations du livre sont indisponibles pour le moment.';
  if (error.code === 'rate-limited') return 'Open Library demande de patienter un instant. Réessaie dans quelques secondes.';
  if (error.code === 'not-found') return 'Introuvable sur Open Library.';
  return 'Open Library est indisponible pour le moment.';
}
```

```ts
// src/core/book/book-detail.ts
export type BookFetch = (url: string) => Promise<Response>;

// Un livre tel que la fiche l'affiche. `id` : identifiant Open Library de l'œuvre (OL…W).
export type BookDetail = {
  id: string;
  title: string;
  author?: string;
  year?: number;
  publisher?: string;
  pages?: number;
  // ISBN-13 d'une édition (sert aux liens d'achat, plan suivant).
  isbn?: string;
  genres: string[];
  synopsis?: { text: string; url: string; source: 'wikipedia' | 'openlibrary' };
  coverUrl?: string;
  pageUrl: string;
};
```

```ts
// src/core/book/http.ts
import type { z } from 'zod';
import type { BookFetch } from './book-detail';
import { BookError } from './errors';

// Un appel JSON : les statuts d'erreur deviennent des `BookError`, un format inattendu lève.
export async function requestJson<S extends z.ZodType>(fetchFn: BookFetch, url: string, schema: S): Promise<z.infer<S>> {
  let response: Response;
  try {
    response = await fetchFn(url);
  } catch {
    throw new BookError('http', 'injoignable');
  }
  if (response.status === 404) throw new BookError('not-found', 'introuvable');
  if (response.status === 429) throw new BookError('rate-limited', 'limite atteinte');
  if (!response.ok) throw new BookError('http', `HTTP ${response.status}`);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new BookError('http', 'réponse illisible');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new BookError('http', 'réponse inattendue');
  return parsed.data;
}
```

```ts
// src/core/book/book-format.ts
import { OPENLIBRARY_BASE, OPENLIBRARY_COVER_BASE, WIKIPEDIA_ARTICLE_BASE } from './config';

export { normalizeTitle } from '../game/game-format';

// Couverture Open Library (grand format) : adresse construite sur l'identifiant de couverture, sans appel à l'API.
export const coverUrl = (coverId: number): string => `${OPENLIBRARY_COVER_BASE}/${coverId}-L.jpg`;
export const workPageUrl = (workId: string): string => `${OPENLIBRARY_BASE}/works/${workId}`;
export const articleUrl = (slug: string): string => `${WIKIPEDIA_ARTICLE_BASE}/${encodeURIComponent(slug)}`;

// Les identifiants d'œuvre finissent dans une adresse : ils sont vérifiés avant d'être posés.
export const isWorkId = (id: string): boolean => /^OL\d+W$/.test(id);

export function firstIsbn13(isbns: readonly string[] | undefined): string | undefined {
  return isbns?.find((isbn) => /^\d{13}$/.test(isbn));
}
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/core/book && npm run typecheck`
Expected: PASS, aucune erreur de types.

- [ ] **Step 5 : Commit**

```bash
git add src/core/book tests/core/book/http.test.ts tests/core/book/book-format.test.ts
git commit -m "feat(book): socle (config, erreurs, appels JSON, adresses, types)"
```

---

### Task 3 : Open Library (`openlibrary-api`)

**Files:**
- Create: `src/core/book/openlibrary-api.ts`
- Test: `tests/core/book/openlibrary-api.test.ts`

**Interfaces:**
- Consumes: `requestJson`, `BookFetch`, `BookError`, `firstIsbn13`, `isWorkId`, `OPENLIBRARY_BASE`.
- Produces :
  - `type OlWork = { id: string; title: string; author?: string; year?: number; publisher?: string; pages?: number; isbn?: string; coverId?: number; popularity: number }`
  - `createOpenLibraryApi(deps: { fetch: BookFetch })` → `{ byWork(workId: string): Promise<OlWork | null>; searchByTitle(title: string): Promise<OlWork[]>; description(workId: string): Promise<string | null> }`
  - `type OpenLibraryApi = ReturnType<typeof createOpenLibraryApi>`

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// tests/core/book/openlibrary-api.test.ts
import { describe, expect, it, vi } from 'vitest';
import { BookError } from '../../../src/core/book/errors';
import { createOpenLibraryApi } from '../../../src/core/book/openlibrary-api';

// Forme réelle de search.json (champs demandés seulement).
const etranger = {
  key: '/works/OL1230613W',
  title: 'L’étranger',
  author_name: ['Albert Camus'],
  first_publish_year: 1942,
  cover_i: 13151269,
  isbn: ['2070360024', '9782070360024'],
  publisher: ['Gallimard'],
  number_of_pages_median: 186,
  edition_count: 468,
};

const json = (body: unknown, status = 200) => vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));

describe('createOpenLibraryApi', () => {
  it('byWork interroge la recherche par clé et convertit la première œuvre', async () => {
    const fetchFn = json({ docs: [etranger] });
    const work = await createOpenLibraryApi({ fetch: fetchFn }).byWork('OL1230613W');
    expect(work).toEqual({ id: 'OL1230613W', title: 'L’étranger', author: 'Albert Camus', year: 1942, publisher: 'Gallimard', pages: 186, isbn: '9782070360024', coverId: 13151269, popularity: 468 });
    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://openlibrary.org/search.json');
    expect(url.searchParams.get('q')).toBe('key:/works/OL1230613W');
  });

  it('byWork rend null sans résultat et refuse un identifiant mal formé sans appel réseau', async () => {
    expect(await createOpenLibraryApi({ fetch: json({ docs: [] }) }).byWork('OL1W')).toBeNull();
    const fetchFn = json({ docs: [] });
    await expect(createOpenLibraryApi({ fetch: fetchFn }).byWork('../x')).rejects.toBeInstanceOf(BookError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('une œuvre sans auteur, sans couverture ni ISBN reste valide', async () => {
    const work = await createOpenLibraryApi({ fetch: json({ docs: [{ key: '/works/OL9W', title: 'Anonyme' }] }) }).byWork('OL9W');
    expect(work).toEqual({ id: 'OL9W', title: 'Anonyme', popularity: 0 });
  });

  it('searchByTitle cherche par titre et rend toutes les œuvres', async () => {
    const fetchFn = json({ docs: [etranger, { key: '/works/OL16033130W', title: 'Novels (La chute / L’Étranger)' }] });
    const works = await createOpenLibraryApi({ fetch: fetchFn }).searchByTitle('L’étranger');
    expect(works.map((work) => work.id)).toEqual(['OL1230613W', 'OL16033130W']);
    expect(new URL(fetchFn.mock.calls[0]![0]).searchParams.get('title')).toBe('L’étranger');
  });

  it('description lit une chaîne ou un objet { value }, et rend null si absente ou introuvable', async () => {
    expect(await createOpenLibraryApi({ fetch: json({ description: ' Un roman. ' }) }).description('OL1W')).toBe('Un roman.');
    expect(await createOpenLibraryApi({ fetch: json({ description: { type: '/type/text', value: 'Autre' } }) }).description('OL1W')).toBe('Autre');
    expect(await createOpenLibraryApi({ fetch: json({}) }).description('OL1W')).toBeNull();
    expect(await createOpenLibraryApi({ fetch: json({}, 404) }).description('OL1W')).toBeNull();
  });

  it('un échec autre que « introuvable » remonte', async () => {
    await expect(createOpenLibraryApi({ fetch: json({}, 429) }).description('OL1W')).rejects.toMatchObject({ code: 'rate-limited' });
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/book/openlibrary-api.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Implémenter**

```ts
// src/core/book/openlibrary-api.ts
import { z } from 'zod';
import type { BookFetch } from './book-detail';
import { firstIsbn13, isWorkId } from './book-format';
import { OPENLIBRARY_BASE } from './config';
import { BookError } from './errors';
import { requestJson } from './http';

const FIELDS = 'key,title,author_name,first_publish_year,cover_i,isbn,publisher,number_of_pages_median,edition_count';

const docSchema = z.object({
  key: z.string(),
  title: z.string(),
  author_name: z.array(z.string()).optional(),
  first_publish_year: z.number().optional(),
  cover_i: z.number().optional(),
  isbn: z.array(z.string()).optional(),
  publisher: z.array(z.string()).optional(),
  number_of_pages_median: z.number().optional(),
  edition_count: z.number().optional(),
});
const searchSchema = z.object({ docs: z.array(docSchema) });
const workSchema = z.object({ description: z.union([z.string(), z.object({ value: z.string() })]).optional() });

// Une œuvre d'Open Library ; `popularity` (nombre d'éditions) départage des titres identiques.
export type OlWork = { id: string; title: string; author?: string; year?: number; publisher?: string; pages?: number; isbn?: string; coverId?: number; popularity: number };

function toWork(row: z.infer<typeof docSchema>): OlWork {
  const isbn = firstIsbn13(row.isbn);
  return {
    id: row.key.replace(/^\/works\//, ''),
    title: row.title,
    ...(row.author_name?.[0] ? { author: row.author_name[0] } : {}),
    ...(row.first_publish_year !== undefined ? { year: row.first_publish_year } : {}),
    ...(row.publisher?.[0] ? { publisher: row.publisher[0] } : {}),
    ...(row.number_of_pages_median !== undefined ? { pages: row.number_of_pages_median } : {}),
    ...(isbn ? { isbn } : {}),
    ...(row.cover_i !== undefined ? { coverId: row.cover_i } : {}),
    popularity: row.edition_count ?? 0,
  };
}

export function createOpenLibraryApi(deps: { fetch: BookFetch }) {
  const search = (params: Record<string, string>) => requestJson(deps.fetch, `${OPENLIBRARY_BASE}/search.json?${new URLSearchParams({ ...params, fields: FIELDS })}`, searchSchema);
  const checked = (workId: string): string => {
    if (!isWorkId(workId)) throw new BookError('not-found', 'identifiant d’œuvre invalide');
    return workId;
  };

  return {
    // L'œuvre d'un identifiant connu (lu sur Wikidata) ; null si Open Library ne la connaît pas.
    async byWork(workId: string): Promise<OlWork | null> {
      const data = await search({ q: `key:/works/${checked(workId)}`, limit: '1' });
      return data.docs[0] ? toWork(data.docs[0]) : null;
    },

    // Recherche par titre : le choix (titre exact, le plus connu) est fait par le service.
    async searchByTitle(title: string): Promise<OlWork[]> {
      return (await search({ title, limit: '10' })).docs.map(toWork);
    },

    // Description d'une œuvre (repli du synopsis) ; null si elle n'en a pas.
    async description(workId: string): Promise<string | null> {
      try {
        const data = await requestJson(deps.fetch, `${OPENLIBRARY_BASE}/works/${checked(workId)}.json`, workSchema);
        const text = typeof data.description === 'string' ? data.description : data.description?.value;
        return text?.trim() || null;
      } catch (error) {
        if (error instanceof BookError && error.code === 'not-found') return null;
        throw error;
      }
    },
  };
}
export type OpenLibraryApi = ReturnType<typeof createOpenLibraryApi>;
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/core/book/openlibrary-api.test.ts && npm run typecheck`
Expected: PASS (6 tests), aucune erreur de types.

- [ ] **Step 5 : Commit**

```bash
git add src/core/book/openlibrary-api.ts tests/core/book/openlibrary-api.test.ts
git commit -m "feat(book): lecture d'Open Library (œuvre, recherche par titre, description)"
```

---

### Task 4 : Wikidata (identifiant d'œuvre) et introduction Wikipédia

**Files:**
- Create: `src/core/book/wikidata-book.ts`, `src/core/book/wikipedia-intro.ts`
- Test: `tests/core/book/wikidata-book.test.ts`, `tests/core/book/wikipedia-intro.test.ts`

**Interfaces:**
- Consumes (existants, `src/core/birth/wikidata-birth.ts`) : `getJson(fetchFn, base, params, name)`, `parseWikibaseItems(json, titles)`, `usableClaims(claims, property)`, `FetchLike` ; `slugToTitle` (`src/core/market/market-book.ts`) ; `WIKIPEDIA_API` (Task 2).
- Produces :
  - `type CardBook = { workId?: string }` ; `parseCardBook(json: unknown): Record<string, CardBook>` ; `fetchWikidataBook(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, CardBook>>`
  - `fetchWikipediaIntro(fetchFn: FetchLike, slug: string): Promise<string | null>`

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
// tests/core/book/wikidata-book.test.ts
import { describe, expect, it, vi } from 'vitest';
import { fetchWikidataBook, parseCardBook } from '../../../src/core/book/wikidata-book';

const text = (value: string, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value } } });
const entities = (record: Record<string, Record<string, unknown[]>>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([key, claims]) => [key, { claims }])),
});

describe('parseCardBook', () => {
  it('lit l’identifiant Open Library de l’œuvre (P648)', () => {
    expect(parseCardBook(entities({ Q1: { P648: [text('OL1063588W')] } })).Q1).toEqual({ workId: 'OL1063588W' });
  });
  it('ignore une valeur mal formée (édition, auteur, adresse) et un rang déprécié, préfère le rang préféré', () => {
    const parsed = parseCardBook(entities({ Q1: { P648: [text('OL123M'), text('../x'), text('OL1W', 'deprecated'), text('OL2W', 'preferred')] } }));
    expect(parsed.Q1).toEqual({ workId: 'OL2W' });
  });
  it('rend un objet vide sans valeur, et lève sur un format inattendu', () => {
    expect(parseCardBook(entities({ Q1: {} })).Q1).toEqual({});
    expect(() => parseCardBook({ pas: 'wikidata' })).toThrow();
  });
});

describe('fetchWikidataBook', () => {
  it('rend une entrée par article, vide quand l’article n’a pas d’élément Wikidata', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      if (params.get('prop') === 'pageprops') {
        return Response.json({ query: { pages: [{ title: 'Les Misérables', pageprops: { wikibase_item: 'Q180736' } }, { title: 'Inconnu' }] } });
      }
      return Response.json(entities({ Q180736: { P648: [text('OL1063588W')] } }));
    });
    expect(await fetchWikidataBook(fetchFn, ['Les_Misérables', 'Inconnu'])).toEqual({ Les_Misérables: { workId: 'OL1063588W' }, Inconnu: {} });
  });
});
```

```ts
// tests/core/book/wikipedia-intro.test.ts
import { describe, expect, it, vi } from 'vitest';
import { fetchWikipediaIntro } from '../../../src/core/book/wikipedia-intro';

const page = (extra: object) => vi.fn(async (_url: string) => Response.json({ query: { pages: [{ title: 'Les Misérables', ...extra }] } }));

describe('fetchWikipediaIntro', () => {
  it('rend l’introduction de l’article (texte brut) et interroge le bon titre', async () => {
    const fetchFn = page({ extract: ' Les Misérables est un roman de Victor Hugo.\nIl décrit… ' });
    expect(await fetchWikipediaIntro(fetchFn, 'Les_Misérables')).toBe('Les Misérables est un roman de Victor Hugo.\nIl décrit…');
    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.searchParams.get('titles')).toBe('Les Misérables');
    expect(url.searchParams.get('exintro')).toBe('1');
    expect(url.searchParams.get('explaintext')).toBe('1');
  });
  it('rend null pour un article absent ou sans texte', async () => {
    expect(await fetchWikipediaIntro(page({ missing: true }), 'Inconnu')).toBeNull();
    expect(await fetchWikipediaIntro(page({ extract: '  ' }), 'Vide')).toBeNull();
  });
  it('lève sur un format inattendu ou une erreur HTTP', async () => {
    await expect(fetchWikipediaIntro(async () => Response.json({ pas: 'wikipédia' }), 'X')).rejects.toThrow();
    await expect(fetchWikipediaIntro(async () => new Response('', { status: 500 }), 'X')).rejects.toThrow();
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/book/wikidata-book.test.ts tests/core/book/wikipedia-intro.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3 : Implémenter**

```ts
// src/core/book/wikidata-book.ts
import { z } from 'zod';
import { getJson, parseWikibaseItems, usableClaims, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle } from '../market/market-book';

// Identifiant lu sur Wikidata : Open Library, œuvre (P648, `OL…W`) ; champ absent = inconnu.
export type CardBook = { workId?: string };

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

const claimsResponse = z.object({
  entities: z.record(z.string(), z.object({ claims: z.record(z.string(), z.unknown()).optional() })),
});
const workId = z.string().regex(/^OL\d+W$/);

function firstWorkId(claims: Record<string, unknown>): string | undefined {
  for (const claim of usableClaims(claims, 'P648')) {
    const parsed = workId.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de valeur ».
export function parseCardBook(json: unknown): Record<string, CardBook> {
  const parsed = claimsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, CardBook> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const id648 = firstWorkId(entity.claims ?? {});
    result[id] = id648 !== undefined ? { workId: id648 } : {};
  }
  return result;
}

// Un lot d'articles (50 au plus) : élément Wikidata, puis identifiant Open Library. Seuls les titres sont envoyés.
export async function fetchWikidataBook(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, CardBook>> {
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
    itemIds.length > 0 ? parseCardBook(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims', ids: itemIds.join('|') }, 'Wikidata')) : {};
  const result: Record<string, CardBook> = {};
  slugs.forEach((slug, index) => {
    const id = items[titles[index] ?? ''];
    result[slug] = (id ? byItem[id] : undefined) ?? {};
  });
  return result;
}
```

```ts
// src/core/book/wikipedia-intro.ts
import { z } from 'zod';
import { getJson, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle } from '../market/market-book';
import { WIKIPEDIA_API } from './config';

const introSchema = z.object({ query: z.object({ pages: z.array(z.object({ extract: z.string().optional() })) }) });

// Introduction de l'article Wikipédia FR de la carte, en texte brut ; null si l'article n'existe pas ou n'a pas de texte.
// Un format inattendu lève (le synopsis se rabat alors sur Open Library sans rien mémoriser d'erroné).
export async function fetchWikipediaIntro(fetchFn: FetchLike, slug: string): Promise<string | null> {
  const json = await getJson(
    fetchFn,
    WIKIPEDIA_API,
    { action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', redirects: '1', formatversion: '2', titles: slugToTitle(slug) },
    'Wikipédia',
  );
  const parsed = introSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikipédia inattendue');
  const text = parsed.data.query.pages[0]?.extract?.trim();
  return text ? text : null;
}
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/core/book && npm run typecheck`
Expected: PASS, aucune erreur de types. Si `slugToTitle('Les_Misérables')` ne rend pas exactement « Les Misérables », lire `src/core/market/market-book.ts` et ajuster seulement l'attente du test.

- [ ] **Step 5 : Commit**

```bash
git add src/core/book/wikidata-book.ts src/core/book/wikipedia-intro.ts tests/core/book/wikidata-book.test.ts tests/core/book/wikipedia-intro.test.ts
git commit -m "feat(book): identifiant d'œuvre Wikidata (P648) et introduction Wikipédia"
```

---

### Task 5 : Mémorisation des identifiants (`book-repo`)

**Files:**
- Create: `src/core/book/book-repo.ts`
- Test: `tests/core/book/book-repo.test.ts`

**Interfaces:**
- Consumes: `CardBook` (Task 4), `KeyValueStore` (`src/core/cache/store.ts`).
- Produces: `type BookState = Record<string, CardBook>`, `type BookFetcher = (slugs: string[]) => Promise<Record<string, CardBook>>`, `createBookRepo(store, fetchBook, now?)` → `{ load(): Promise<BookState>; resolve(slugs: string[]): Promise<BookState> }`, `type BookRepo`.

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// tests/core/book/book-repo.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createBookRepo } from '../../../src/core/book/book-repo';
import { createMemoryStore } from '../../../src/core/cache/store';

describe('createBookRepo', () => {
  it('n’interroge Wikidata que pour les articles jamais vus, et mémorise un article vide', async () => {
    const fetchBook = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, slug === 'A' ? { workId: 'OL1W' } : {}])));
    const repo = createBookRepo(createMemoryStore(), fetchBook);
    expect(await repo.resolve(['A', 'B'])).toEqual({ A: { workId: 'OL1W' }, B: {} });
    await repo.resolve(['A', 'B']);
    expect(fetchBook).toHaveBeenCalledTimes(1);
    expect(await repo.load()).toEqual({ A: { workId: 'OL1W' }, B: {} });
  });

  it('ne mémorise rien après un échec et attend avant de réessayer', async () => {
    let t = 0;
    const fetchBook = vi.fn(async () => {
      throw new Error('429');
    });
    const repo = createBookRepo(createMemoryStore(), fetchBook, () => t);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await repo.resolve(['A'])).toEqual({});
    t = 10_000;
    await repo.resolve(['A']);
    expect(fetchBook).toHaveBeenCalledTimes(1);
    t = 70_000;
    await repo.resolve(['A']);
    expect(fetchBook).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/book/book-repo.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Implémenter**

```ts
// src/core/book/book-repo.ts
import type { KeyValueStore } from '../cache/store';
import type { CardBook } from './wikidata-book';

export type BookState = Record<string, CardBook>;
export type BookFetcher = (slugs: string[]) => Promise<Record<string, CardBook>>;

const KEY = 'book-v1';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

// Identifiants Open Library des cartes (même principe que `game-repo` et `screen-repo`).
export function createBookRepo(store: KeyValueStore, fetchBook: BookFetcher, now: () => number = () => Date.now()) {
  // Lectures et écritures sérialisées.
  let tail: Promise<unknown> = Promise.resolve();
  let failedAt: number | undefined;

  const read = async (): Promise<BookState> => (await store.get<BookState>(KEY)) ?? {};

  return {
    load: read,

    // Interroge Wikidata pour les articles jamais vus (un article sans valeur est mémorisé vide) ; rend l'état à jour.
    resolve(slugs: string[]): Promise<BookState> {
      const run = tail.then(async () => {
        const state = await read();
        const missing = slugs.filter((slug) => !Object.prototype.hasOwnProperty.call(state, slug));
        if (missing.length === 0) return state;
        if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return state;
        try {
          const next = { ...state, ...(await fetchBook(missing)) };
          await store.set(KEY, next);
          return next;
        } catch (error) {
          console.warn('[wikimasters-tools]', 'identifiants Open Library Wikidata indisponibles :', error);
          failedAt = now();
          return state;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}
export type BookRepo = ReturnType<typeof createBookRepo>;
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/core/book/book-repo.test.ts && npm run typecheck`
Expected: PASS (2 tests), aucune erreur de types.

- [ ] **Step 5 : Commit**

```bash
git add src/core/book/book-repo.ts tests/core/book/book-repo.test.ts
git commit -m "feat(book): mémorisation des identifiants Open Library des cartes"
```

---

### Task 6 : Service `book-service` et son registre

**Files:**
- Create: `src/content/book-service.ts`, `src/content/book-registry.ts`
- Test: `tests/content/book-service.test.ts`

**Interfaces:**
- Consumes: `OlWork`, `OpenLibraryApi` (Task 3) ; `BookRepo` (Task 5) ; `BookDetail`, `bookErrorMessage`, `isBookCard`, `coverUrl`, `articleUrl`, `workPageUrl`, `normalizeTitle` (Tasks 1-2) ; `KindsRepo['resolveMissing' | 'load']`, `facetLabel` (`src/core/kinds/kinds-book.ts`) ; `cleanTitle` (`src/core/music/listen.ts`) ; `TtlCache['getOrLoad']` (qui mémorise aussi `null`).
- Produces :
  - `type BookView = { status: 'none' } | { status: 'empty' } | { status: 'detail'; detail: BookDetail } | { status: 'error'; message: string }`
  - `createBookService(deps)` → `{ bookSlugs(cards): Promise<Set<string>>; view(slug, title): Promise<BookView>; cover(slug, title): Promise<string[] | null> }`, `type BookService`
  - `setBookService(next: BookService | null): void`, `getBookService(): BookService | null`
  - `BookServiceDeps = { collection: { list(): Promise<KnownCard[]> }; kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>; books: Pick<BookRepo, 'resolve'>; openLibrary: Pick<OpenLibraryApi, 'byWork' | 'searchByTitle' | 'description'>; intro: (slug: string) => Promise<string | null>; cache: Pick<TtlCache, 'getOrLoad'> }`

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// tests/content/book-service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createBookService } from '../../src/content/book-service';
import { BookError } from '../../src/core/book/errors';
import type { OlWork } from '../../src/core/book/openlibrary-api';
import { createMemoryStore } from '../../src/core/cache/store';
import { createTtlCache } from '../../src/core/cache/ttl-cache';

const etranger: OlWork = { id: 'OL1230613W', title: 'L’étranger', author: 'Albert Camus', year: 1942, publisher: 'Gallimard', pages: 186, isbn: '9782070360024', coverId: 13151269, popularity: 468 };

type Setup = {
  natures?: string[];
  genres?: string[];
  ids?: object;
  unreachable?: boolean;
  collection?: string[];
  byWork?: OlWork | null;
  search?: OlWork[];
  intro?: string | null | Error;
  description?: string | null;
  kindsUnknown?: boolean;
};

function setup(over: Setup = {}) {
  const openLibrary = {
    byWork: vi.fn(async (_id: string) => (over.byWork === undefined ? etranger : over.byWork)),
    searchByTitle: vi.fn(async (_title: string) => over.search ?? []),
    description: vi.fn(async (_id: string) => (over.description === undefined ? null : over.description)),
  };
  const intro = vi.fn(async (_slug: string) => {
    if (over.intro instanceof Error) throw over.intro;
    return over.intro === undefined ? 'Meursault enterre sa mère.' : over.intro;
  });
  const service = createBookService({
    collection: { list: async () => (over.collection ?? ['Livre']).map((slug) => ({ slug, title: slug })) },
    kinds: {
      resolveMissing: vi.fn(async () => undefined),
      load: async () => ({
        cards: over.kindsUnknown ? {} : { Livre: { natures: over.natures ?? ['Q7725634'], occupations: [], genres: over.genres ?? [] } },
        labels: { Q1: 'roman philosophique', Q2: 'roman policier' },
      }),
    },
    books: { resolve: async () => (over.unreachable ? {} : { Livre: over.ids ?? { workId: 'OL1230613W' } }) as never },
    openLibrary,
    intro,
    cache: createTtlCache(createMemoryStore()),
  });
  return { service, openLibrary, intro };
}

describe('bookSlugs', () => {
  it('ne garde que les cartes dont la nature est une œuvre écrite', async () => {
    const { service } = setup();
    expect([...(await service.bookSlugs([{ slug: 'Livre' }, { slug: 'Ailleurs' }]))]).toEqual(['Livre']);
    expect((await setup({ natures: ['Q11424'] }).service.bookSlugs([{ slug: 'Livre' }])).size).toBe(0);
  });
});

describe('view', () => {
  it('rien pour une carte hors Collection ou qui n’est pas un livre', async () => {
    expect(await setup({ collection: [] }).service.view('Livre', 'L’Étranger')).toEqual({ status: 'none' });
    expect(await setup({ natures: ['Q5'] }).service.view('Livre', 'Camus')).toEqual({ status: 'none' });
  });

  it('un livre : faits d’Open Library, synopsis Wikipédia, genres de Wikidata, couverture, page', async () => {
    const { service, openLibrary } = setup({ genres: ['Q1', 'Q2'] });
    const view = await service.view('Livre', 'L’Étranger');
    expect(view).toEqual({
      status: 'detail',
      detail: {
        id: 'OL1230613W',
        title: 'L’étranger',
        author: 'Albert Camus',
        year: 1942,
        publisher: 'Gallimard',
        pages: 186,
        isbn: '9782070360024',
        genres: ['Roman philosophique', 'Roman policier'],
        synopsis: { text: 'Meursault enterre sa mère.', url: 'https://fr.wikipedia.org/wiki/Livre', source: 'wikipedia' },
        coverUrl: 'https://covers.openlibrary.org/b/id/13151269-L.jpg',
        pageUrl: 'https://openlibrary.org/works/OL1230613W',
      },
    });
    expect(openLibrary.byWork).toHaveBeenCalledWith('OL1230613W');
    expect(openLibrary.searchByTitle).not.toHaveBeenCalled();
  });

  it('sans article Wikipédia utile, le synopsis vient d’Open Library ; sans rien, la fiche n’a pas de synopsis', async () => {
    const withDescription = await setup({ intro: null, description: 'Un roman.' }).service.view('Livre', 'L’Étranger');
    expect(withDescription.status === 'detail' && withDescription.detail.synopsis).toEqual({ text: 'Un roman.', url: 'https://openlibrary.org/works/OL1230613W', source: 'openlibrary' });
    const none = await setup({ intro: null, description: null }).service.view('Livre', 'L’Étranger');
    expect(none.status === 'detail' && none.detail.synopsis).toBeUndefined();
  });

  it('un échec de Wikipédia ne casse pas la fiche : repli sur Open Library', async () => {
    const view = await setup({ intro: new Error('429'), description: 'Un roman.' }).service.view('Livre', 'L’Étranger');
    expect(view.status === 'detail' && view.detail.synopsis?.source).toBe('openlibrary');
  });

  it('sans identifiant Wikidata, cherche par titre : titre exact seulement, le plus connu d’abord', async () => {
    const homonym: OlWork = { id: 'OL2W', title: 'L’étranger', popularity: 3 };
    const other: OlWork = { id: 'OL3W', title: 'L’étranger au village', popularity: 900 };
    const { service, openLibrary } = setup({ ids: {}, search: [homonym, other, etranger] });
    const view = await service.view('Livre', 'L’Étranger');
    expect(view.status === 'detail' && view.detail.id).toBe('OL1230613W');
    expect(openLibrary.searchByTitle).toHaveBeenCalledWith('L’Étranger');
  });

  it('une fiche vide quand rien n’est trouvé, une erreur lisible quand Open Library échoue', async () => {
    expect(await setup({ ids: {}, search: [{ id: 'OL3W', title: 'Autre chose', popularity: 1 }] }).service.view('Livre', 'L’Étranger')).toEqual({ status: 'empty' });
    expect(await setup({ byWork: null, ids: { workId: 'OL9W' } }).service.view('Livre', 'Inconnu')).toEqual({ status: 'empty' });
    const failing = setup();
    failing.openLibrary.byWork.mockRejectedValueOnce(new BookError('rate-limited', 'x'));
    const view = await failing.service.view('Livre', 'L’Étranger');
    expect(view.status === 'error' && view.message).toContain('patienter');
  });

  it('Wikidata injoignable : on cherche quand même par titre', async () => {
    const { service } = setup({ unreachable: true, search: [etranger] });
    expect((await service.view('Livre', 'L’Étranger')).status).toBe('detail');
  });
});

describe('cover', () => {
  it('la couverture d’un livre, liste vide pour une autre carte ou un livre sans couverture', async () => {
    expect(await setup().service.cover('Livre', 'L’Étranger')).toEqual(['https://covers.openlibrary.org/b/id/13151269-L.jpg']);
    expect(await setup({ natures: ['Q7889'] }).service.cover('Livre', 'Jeu')).toEqual([]);
    expect(await setup({ byWork: { id: 'OL1W', title: 'Sans couverture', popularity: 0 } }).service.cover('Livre', 'X')).toEqual([]);
  });

  it('null quand une source n’a pas répondu (natures inconnues, Wikidata injoignable, erreur)', async () => {
    expect(await setup({ kindsUnknown: true }).service.cover('Livre', 'X')).toBeNull();
    expect(await setup({ unreachable: true }).service.cover('Livre', 'X')).toBeNull();
    const failing = setup();
    failing.openLibrary.byWork.mockRejectedValueOnce(new Error('réseau'));
    expect(await failing.service.cover('Livre', 'X')).toBeNull();
  });

  it('ne fait aucun appel réseau pour une carte qui n’est pas un livre', async () => {
    const { service, openLibrary } = setup({ natures: ['Q11424'] });
    await service.cover('Livre', 'Un film');
    expect(openLibrary.byWork).not.toHaveBeenCalled();
    expect(openLibrary.searchByTitle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/book-service.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Implémenter**

```ts
// src/content/book-service.ts
import { articleUrl, coverUrl, normalizeTitle, workPageUrl } from '../core/book/book-format';
import type { BookDetail } from '../core/book/book-detail';
import { isBookCard } from '../core/book/book-kinds';
import type { BookRepo } from '../core/book/book-repo';
import { bookErrorMessage } from '../core/book/errors';
import type { OlWork, OpenLibraryApi } from '../core/book/openlibrary-api';
import type { TtlCache } from '../core/cache/ttl-cache';
import type { KnownCard } from '../core/collection/collection-book';
import { facetLabel } from '../core/kinds/kinds-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { cleanTitle } from '../core/music/listen';

export type BookView = { status: 'none' } | { status: 'empty' } | { status: 'detail'; detail: BookDetail } | { status: 'error'; message: string };

export type BookServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  books: Pick<BookRepo, 'resolve'>;
  openLibrary: Pick<OpenLibraryApi, 'byWork' | 'searchByTitle' | 'description'>;
  // Introduction de l'article Wikipédia FR de la carte (texte brut), null s'il n'y en a pas.
  intro: (slug: string) => Promise<string | null>;
  cache: Pick<TtlCache, 'getOrLoad'>;
};

const MAX_GENRES = 5;

export function createBookService(deps: BookServiceDeps) {
  const { collection, kinds, books, openLibrary, intro, cache } = deps;

  // Une aide facultative (synopsis) qui échoue ne doit pas faire échouer la fiche.
  const optional = async <T>(job: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await job();
    } catch {
      return null;
    }
  };

  // L'œuvre de la carte : identifiant Wikidata d'abord ; sinon recherche par titre, retenue seulement si le titre est égal
  // (accents, casse, ponctuation) ; à égalité, la plus connue (nombre d'éditions).
  async function workOf(workId: string | undefined, title: string): Promise<OlWork | null> {
    if (workId !== undefined) {
      const found = await cache.getOrLoad(`book-work-v1-${workId}`, () => openLibrary.byWork(workId));
      if (found) return found;
    }
    const query = cleanTitle(title);
    const wanted = normalizeTitle(query);
    if (wanted === '') return null;
    const candidates = await cache.getOrLoad(`book-search-v1-${wanted}`, () => openLibrary.searchByTitle(query));
    return candidates.filter((candidate) => normalizeTitle(candidate.title) === wanted).sort((a, b) => b.popularity - a.popularity)[0] ?? null;
  }

  // Synopsis : introduction de l'article Wikipédia de la carte, sinon description d'Open Library.
  async function synopsisOf(slug: string, work: OlWork): Promise<BookDetail['synopsis']> {
    const wiki = await optional(() => cache.getOrLoad(`book-intro-v1-${slug}`, () => intro(slug)));
    if (wiki) return { text: wiki, url: articleUrl(slug), source: 'wikipedia' };
    const description = await optional(() => cache.getOrLoad(`book-description-v1-${work.id}`, () => openLibrary.description(work.id)));
    return description ? { text: description, url: workPageUrl(work.id), source: 'openlibrary' } : undefined;
  }

  return {
    // Les cartes (parmi `cards`) dont la nature est une œuvre écrite : elles portent le glyphe livre. Nature seule, aucun appel à Open Library.
    async bookSlugs(cards: Pick<KnownCard, 'slug'>[]): Promise<Set<string>> {
      if (cards.length === 0) return new Set();
      await kinds.resolveMissing(cards.map((card) => card.slug));
      const loaded = await kinds.load();
      return new Set(cards.filter((card) => isBookCard(loaded.cards[card.slug])).map((card) => card.slug));
    },

    // Ce que la fiche d'une carte montre : rien (pas un livre), une fiche vide (livre introuvable), un livre, ou une erreur.
    async view(slug: string, title: string): Promise<BookView> {
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const state = await kinds.load();
        const cardKinds = state.cards[slug];
        if (!isBookCard(cardKinds)) return { status: 'none' };
        const ids = (await books.resolve([slug]))[slug] ?? {};
        const work = await workOf(ids.workId, title);
        if (!work) return { status: 'empty' };
        const genres = (cardKinds?.genres ?? []).slice(0, MAX_GENRES).map((id) => facetLabel(state, id));
        const synopsis = await synopsisOf(slug, work);
        return {
          status: 'detail',
          detail: {
            id: work.id,
            title: work.title,
            ...(work.author ? { author: work.author } : {}),
            ...(work.year !== undefined ? { year: work.year } : {}),
            ...(work.publisher ? { publisher: work.publisher } : {}),
            ...(work.pages !== undefined ? { pages: work.pages } : {}),
            ...(work.isbn ? { isbn: work.isbn } : {}),
            genres,
            ...(synopsis ? { synopsis } : {}),
            ...(work.coverId !== undefined ? { coverUrl: coverUrl(work.coverId) } : {}),
            pageUrl: workPageUrl(work.id),
          },
        };
      } catch (error) {
        return { status: 'error', message: bookErrorMessage(error) };
      }
    },

    // Couvertures possibles de la carte : liste vide si ce n'est pas un livre ou si rien n'existe ;
    // `null` si une source n'a pas pu répondre (natures, Wikidata, Open Library) : à redemander plus tard, sans rien mémoriser.
    async cover(slug: string, title: string): Promise<string[] | null> {
      try {
        await kinds.resolveMissing([slug]);
        const cardKinds = (await kinds.load()).cards[slug];
        if (cardKinds === undefined) return null;
        if (!isBookCard(cardKinds)) return [];
        const ids = (await books.resolve([slug]))[slug];
        if (ids === undefined) return null;
        const work = await workOf(ids.workId, title);
        return work?.coverId !== undefined ? [coverUrl(work.coverId)] : [];
      } catch {
        return null;
      }
    },
  };
}

export type BookService = ReturnType<typeof createBookService>;
```

```ts
// src/content/book-registry.ts
import type { BookService } from './book-service';

// Le service est créé une fois par la surcouche ; les fiches de carte le lisent ici.
let service: BookService | null = null;

export const setBookService = (next: BookService | null): void => {
  service = next;
};
export const getBookService = (): BookService | null => service;
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/content/book-service.test.ts && npm run typecheck`
Expected: PASS, aucune erreur de types. Si un test échoue parce que `facetLabel` met une majuscule ou parce que le cache mémorise `null`, lire `src/core/kinds/kinds-book.ts` / `src/core/cache/ttl-cache.ts` (déjà conformes d'après le plan) avant de toucher à une attente ; ne jamais affaiblir une assertion en silence.

- [ ] **Step 5 : Commit**

```bash
git add src/content/book-service.ts src/content/book-registry.ts tests/content/book-service.test.ts
git commit -m "feat(book): service livre (vue de la fiche, couverture, cartes livres)"
```

---

### Task 7 : Section « Livre » dans la fiche (glyphe, composant, montage)

**Files:**
- Modify: `src/content/Glyphs.tsx` (glyphe `book`), `src/content/decorate-listen.ts` (hôte + `decorateBook`), `src/content/mount.tsx` (montage)
- Create: `src/content/BookSection.tsx`
- Test: `tests/content/BookSection.test.tsx`, `tests/content/decorate-listen.test.ts` (ajout)

**Interfaces:**
- Consumes: `getBookService`, `BookView`, `BookDetail`, `Glyph`.
- Produces: `BOOK_HOST_ATTRIBUTE = 'data-wmt-book'`, `decorateBook(root, mount)`, `BookSection({ slug, title })`, `mountBookSection: MountListen`, `pruneBookSections`, glyphe `book`.

- [ ] **Step 1 : Écrire les tests qui échouent**

```tsx
// tests/content/BookSection.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setBookService } from '../../src/content/book-registry';
import type { BookService, BookView } from '../../src/content/book-service';
import { BookSection } from '../../src/content/BookSection';
import type { BookDetail } from '../../src/core/book/book-detail';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const etranger: BookDetail = {
  id: 'OL1230613W',
  title: 'L’étranger',
  author: 'Albert Camus',
  year: 1942,
  publisher: 'Gallimard',
  pages: 186,
  genres: ['Roman philosophique'],
  synopsis: { text: 'Meursault enterre sa mère sans verser une larme.', url: 'https://fr.wikipedia.org/wiki/L%27%C3%89tranger', source: 'wikipedia' },
  coverUrl: 'https://covers.openlibrary.org/b/id/13151269-L.jpg',
  pageUrl: 'https://openlibrary.org/works/OL1230613W',
};

async function show(view: BookView) {
  setBookService({ view: vi.fn(async () => view) } as unknown as BookService);
  await act(async () => root.render(<BookSection slug="L'Étranger" title="L'Étranger" />));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setBookService(null);
});

describe('BookSection', () => {
  it('rien pour une carte qui n’est pas un livre, ni sans service', async () => {
    await show({ status: 'none' });
    expect(container.innerHTML).toBe('');
    setBookService(null);
    await act(async () => root.render(<BookSection slug="X" title="X" />));
    expect(container.innerHTML).toBe('');
  });

  it('un livre : titre de section, auteur, année · éditeur, pages, genres, synopsis agrandi, lien et sources', async () => {
    await show({ status: 'detail', detail: etranger });
    const text = container.textContent ?? '';
    expect(text).toContain('Livre');
    expect(text).toContain('Albert Camus');
    expect(text).toContain('1942 · Gallimard');
    expect(text).toContain('186 pages');
    expect(text).toContain('Roman philosophique');
    expect(text).toContain('Synopsis');
    expect(text).toContain('Meursault enterre sa mère sans verser une larme.');
    expect(text).toContain('Données : Open Library, Wikipédia, Wikidata');
    const synopsis = [...container.querySelectorAll('p')].find((p) => p.textContent?.includes('Meursault')) as HTMLElement;
    expect(synopsis.style.fontSize).toBe('clamp(15px, 4vw, 16px)');
    expect(synopsis.style.maxHeight).toBe('300px');
    const links = [...container.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]);
    expect(links).toContainEqual(['https://fr.wikipedia.org/wiki/L%27%C3%89tranger', '_blank', 'noopener noreferrer']);
    expect(links).toContainEqual(['https://openlibrary.org/works/OL1230613W', '_blank', 'noopener noreferrer']);
  });

  it('le synopsis d’Open Library est présenté comme tel, et un livre sans synopsis n’affiche pas ce bloc', async () => {
    await show({ status: 'detail', detail: { ...etranger, synopsis: { text: 'Un roman.', url: 'https://openlibrary.org/works/OL1230613W', source: 'openlibrary' } } });
    expect(container.textContent).toContain('Résumé Open Library');
    const { synopsis: _omitted, ...bare } = etranger;
    await show({ status: 'detail', detail: bare });
    expect(container.textContent).not.toContain('Synopsis');
  });

  it('une fiche vide et une erreur restent discrètes mais lisibles', async () => {
    await show({ status: 'empty' });
    expect(container.textContent).toContain('Livre');
    expect(container.textContent).toContain('Aucune fiche trouvée');
    await show({ status: 'error', message: 'Open Library est indisponible pour le moment.' });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('indisponible');
  });

  it('l’hôte de la section porte l’attribut utilisé par la visite guidée', async () => {
    await show({ status: 'detail', detail: etranger });
    expect(container.querySelector('[data-wmt-book-card]')).not.toBeNull();
  });
});
```

Ajouter à `tests/content/decorate-listen.test.ts` (importer `decorateBook` et `BOOK_HOST_ATTRIBUTE` en tête, avec les autres) :

```ts
describe('decorateBook', () => {
  beforeEach(() => {
    document.body.innerHTML = SHEET;
  });
  function mountWith(attribute: string): MountListen {
    return (anchor) => {
      const host = document.createElement('div');
      host.setAttribute(attribute, '');
      anchor.insertAdjacentElement('afterend', host);
    };
  }
  it('se place après « Écouter », film / série et jeu, une seule fois par fiche', () => {
    decorateListen(document, mountWith(LISTEN_HOST_ATTRIBUTE));
    decorateScreen(document, mountWith(SCREEN_HOST_ATTRIBUTE));
    decorateGame(document, mountWith(GAME_HOST_ATTRIBUTE));
    const book = mountWith(BOOK_HOST_ATTRIBUTE);
    decorateBook(document, book);
    const names = [...document.querySelector('.space-y-2')!.parentElement!.children].map((el) =>
      el.hasAttribute(LISTEN_HOST_ATTRIBUTE) ? 'listen' : el.hasAttribute(SCREEN_HOST_ATTRIBUTE) ? 'screen' : el.hasAttribute(GAME_HOST_ATTRIBUTE) ? 'game' : el.hasAttribute(BOOK_HOST_ATTRIBUTE) ? 'book' : el.tagName,
    );
    expect(names.slice(1, 6)).toEqual(['DIV', 'listen', 'screen', 'game', 'book']);
    expect(decorateBook(document, book)).toBe(0);
    expect(document.querySelectorAll(`[${BOOK_HOST_ATTRIBUTE}]`)).toHaveLength(1);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/BookSection.test.tsx tests/content/decorate-listen.test.ts`
Expected: FAIL (`BookSection` et `decorateBook` introuvables).

- [ ] **Step 3 : Implémenter**

Glyphe `book` — dans `src/content/Glyphs.tsx`, ajouter dans `PATHS` après `gamepad` (livre ouvert, traits) :

```tsx
  book: (
    <>
      <path d="M12 7c-1.7-1.3-4-2-7-2v13c3 0 5.3.7 7 2" />
      <path d="M12 7c1.7-1.3 4-2 7-2v13c-3 0-5.3.7-7 2" />
      <line x1="12" y1="7" x2="12" y2="20" />
    </>
  ),
```

`src/content/decorate-listen.ts` : ajouter `export const BOOK_HOST_ATTRIBUTE = 'data-wmt-book';` sous `GAME_HOST_ATTRIBUTE`, ajouter `BOOK_HOST_ATTRIBUTE` à `NATIVE_HOSTS`, et en fin de fichier :

```ts
// Section « livre » (Open Library) : après les autres sections de l'extension, comme film / série et jeu vidéo.
export const decorateBook = (root: ParentNode, mount: MountListen): number => decorateNative(root, BOOK_HOST_ATTRIBUTE, true, mount);
```

```tsx
// src/content/BookSection.tsx
import { useEffect, useState, type CSSProperties } from 'react';
import type { BookDetail } from '../core/book/book-detail';
import { getBookService } from './book-registry';
import type { BookView } from './book-service';
import { Glyph } from './Glyphs';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const link: CSSProperties = { color: 'inherit', fontWeight: 600 };

function Facts({ detail }: { detail: BookDetail }) {
  const published = [detail.year, detail.publisher].filter((value) => value !== undefined && value !== '').join(' · ');
  const rows: [string, string][] = [
    ...(detail.author ? ([['Auteur', detail.author]] as [string, string][]) : []),
    ...(published ? ([['Publié', published]] as [string, string][]) : []),
    ...(detail.pages !== undefined ? ([['Édition', `${detail.pages} pages`]] as [string, string][]) : []),
  ];
  if (rows.length === 0) return null;
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', margin: 0, fontSize: 13 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt style={{ opacity: 0.65 }}>{label}</dt>
          <dd style={{ margin: 0 }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Synopsis agrandi : 16 px sur bureau, 15 px sur mobile, encadré défilant, jamais tronqué.
function Synopsis({ synopsis }: { synopsis: NonNullable<BookDetail['synopsis']> }) {
  const wikipedia = synopsis.source === 'wikipedia';
  return (
    <>
      <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Synopsis</div>
      <p style={{ margin: 0, fontSize: 'clamp(15px, 4vw, 16px)', lineHeight: '25px', maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-line', padding: '12px 14px', border, borderRadius: 10, background: 'rgba(148,163,184,0.08)' }}>
        {synopsis.text}
      </p>
      <span style={{ fontSize: 12, opacity: 0.8 }}>
        {wikipedia ? 'Résumé Wikipédia (fr) · ' : 'Résumé Open Library · '}
        <a href={synopsis.url} target="_blank" rel="noopener noreferrer" style={link}>
          {wikipedia ? 'Lire l’article complet' : 'Voir la fiche'} <Glyph name="external" size={12} />
        </a>
      </span>
    </>
  );
}

function Detail({ detail }: { detail: BookDetail }) {
  return (
    <>
      <Facts detail={detail} />
      {detail.genres.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {detail.genres.map((genre) => (
            <span key={genre} style={{ border, borderRadius: 999, padding: '1px 9px', fontSize: 12 }}>
              {genre}
            </span>
          ))}
        </div>
      )}
      {detail.synopsis && <Synopsis synopsis={detail.synopsis} />}
      <a
        href={detail.pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ouvrir la fiche Open Library"
        style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border, borderRadius: 10, color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
      >
        Fiche Open Library <Glyph name="external" size={16} />
      </a>
      <p style={{ margin: 0, fontSize: 10, opacity: 0.6 }}>Données : Open Library, Wikipédia, Wikidata</p>
    </>
  );
}

type Props = { slug: string; title: string };

// Section « livre » de la fiche native d'une carte : un livre (Open Library), ou une fiche vide ; rien pour les autres cartes.
export function BookSection({ slug, title }: Props) {
  const service = getBookService();
  const [view, setView] = useState<BookView | null>(null);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    service
      .view(slug, title)
      .catch((): BookView => ({ status: 'error', message: 'Le livre est indisponible pour le moment.' }))
      .then((next) => !cancelled && setView(next));
    return () => {
      cancelled = true;
    };
  }, [service, slug, title]);

  if (!service || !view || view.status === 'none') return null;

  return (
    <div data-wmt-book-card="" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Glyph name="book" size={16} />
        <span style={{ flex: 1, minWidth: 0 }}>Livre</span>
      </div>
      {view.status === 'error' && (
        <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {view.message}
        </p>
      )}
      {view.status === 'empty' && (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>Aucune fiche trouvée pour ce livre.</p>
      )}
      {view.status === 'detail' && <Detail detail={view.detail} />}
    </div>
  );
}
```

`src/content/mount.tsx` : ajouter `BOOK_HOST_ATTRIBUTE` à l'import ligne 22 de `./decorate-listen`, importer `BookSection` (`import { BookSection } from './BookSection';`) près de `GameSection`, et après le bloc `gameSections` :

```tsx
const bookSections = createNativeSections(BOOK_HOST_ATTRIBUTE, '0', (slug, title) => <BookSection slug={slug} title={title} />);
export const mountBookSection: MountListen = bookSections.mount;
export const pruneBookSections = bookSections.prune;
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/content/BookSection.test.tsx tests/content/decorate-listen.test.ts && npm run typecheck`
Expected: PASS, aucune erreur de types (le test de décoration existant `decorateGame` reste vert : `NATIVE_HOSTS` accepte désormais aussi l'hôte livre).

- [ ] **Step 5 : Commit**

```bash
git add src/content/Glyphs.tsx src/content/decorate-listen.ts src/content/mount.tsx src/content/BookSection.tsx tests/content/BookSection.test.tsx tests/content/decorate-listen.test.ts
git commit -m "feat(book): section « Livre » dans la fiche (synopsis agrandi, glyphe livre)"
```

---

### Task 8 : Glyphe livre sur la carte, dans les listes

**Files:**
- Modify: `src/core/collection/card-preview.ts`, `src/content/card-preview-dom.ts`, `src/content/HomemadePanel.tsx`, `src/content/TimelinePanel.tsx`, `src/content/WorldPanel.tsx`
- Create: `src/content/useBookSlugs.ts`
- Test: `tests/core/collection/card-preview.test.ts` (ajout), `tests/content/card-preview-dom.test.ts` (ajout)

**Interfaces:**
- Consumes: `getBookService().bookSlugs(cards)` (Task 6).
- Produces: `CardPreview.book?: boolean` ; `toCardPreview(card, entry, market?, playing?, music?, film?, game?, book?)` (8ᵉ paramètre) ; `useBookSlugs(cards): ReadonlySet<string>` ; classe DOM `wmt-card-book`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `tests/core/collection/card-preview.test.ts`, ajouter (en réutilisant `CARD` du fichier) :

```ts
it('marque une carte livre ; la valeur par défaut n’ajoute rien', () => {
  expect(toCardPreview(CARD, null, undefined, false, false, false, false, true).book).toBe(true);
  expect('book' in toCardPreview(CARD, null)).toBe(false);
});
```

Dans `tests/content/card-preview-dom.test.ts`, ajouter à côté des tests de la manette (en réutilisant `base` et `buildCardPreview` du fichier) :

```ts
it('un livre porte un glyphe livre, titré « Livre » ; la bobine, la manette et la note l’emportent', () => {
  const glyph = buildCardPreview({ ...base, book: true }).querySelector<HTMLElement>('.wmt-card-book');
  expect(glyph?.getAttribute('aria-label')).toBe('Livre');
  expect(glyph?.title).toBe('Livre');
  for (const other of [{ film: true }, { game: true }, { music: true }]) {
    expect(buildCardPreview({ ...base, book: true, ...other }).querySelector('.wmt-card-book')).toBeNull();
  }
  expect(buildCardPreview({ ...base, book: true }).classList.contains('wmt-card-linked')).toBe(true);
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/collection/card-preview.test.ts tests/content/card-preview-dom.test.ts`
Expected: FAIL (`book` inconnu).

- [ ] **Step 3 : Implémenter**

`src/core/collection/card-preview.ts` : dans `CardPreview`, après `game?: boolean;` :

```ts
  // Carte « livre » (roman, poème, essai, théâtre, BD) : un livre ouvert marque la carte ; absent sinon.
  book?: boolean;
```

dans `toCardPreview`, ajouter le paramètre `book = false,` après `game = false,` et la ligne `...(book ? { book: true } : {}),` après celle de `game`.

`src/content/card-preview-dom.ts` : remplacer le bloc

```ts
  if (preview.film || preview.game || preview.music) {
    card.classList.add('wmt-card-linked');
    marks.append(preview.film ? filmGlyph() : preview.game ? gameGlyph() : musicGlyph());
  }
```

par

```ts
  if (preview.film || preview.game || preview.music || preview.book) {
    card.classList.add('wmt-card-linked');
    marks.append(preview.film ? filmGlyph() : preview.game ? gameGlyph() : preview.music ? musicGlyph() : bookGlyph());
  }
```

(mettre aussi à jour le commentaire au-dessus : « … la bobine l'emporte sur la manette, puis sur la note, puis sur le livre. ») et ajouter, après `gameGlyph` :

```ts
// Livre ouvert (même dessin que le glyphe « book » des fiches), sans fond ni animation.
function bookGlyph(): HTMLElement {
  const glyph = div('wmt-card-link wmt-card-book');
  glyph.setAttribute('role', 'img');
  glyph.title = 'Livre';
  glyph.setAttribute('aria-label', glyph.title);
  const svg = icon('', ['M12 7c-1.7-1.3-4-2-7-2v13c3 0 5.3.7 7 2', 'M12 7c1.7-1.3 4-2 7-2v13c-3 0-5.3.7-7 2', 'M12 7v13']);
  svg.setAttribute('class', 'wmt-card-book-pages');
  glyph.append(svg);
  return glyph;
}
```

(`icon(className, paths)` est l'aide déjà utilisée par `musicGlyph` et `gameGlyph` : la lire et respecter sa signature.)

```ts
// src/content/useBookSlugs.ts
import { useEffect, useState } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { getBookService } from './book-registry';

const NONE: ReadonlySet<string> = new Set();

// Les cartes (parmi `cards`) qui sont des livres : elles portent le glyphe livre.
export function useBookSlugs(cards: Pick<KnownCard, 'slug'>[]): ReadonlySet<string> {
  const [slugs, setSlugs] = useState<ReadonlySet<string>>(NONE);
  const key = cards.map((card) => card.slug).join(',');

  useEffect(() => {
    const service = getBookService();
    if (!service || cards.length === 0) {
      setSlugs(NONE);
      return;
    }
    let cancelled = false;
    void service
      .bookSlugs(cards)
      .then((found) => !cancelled && setSlugs(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `key` résume `cards`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return slugs;
}
```

Panneaux (sur le modèle exact de `useGameSlugs`) :
- `HomemadePanel.tsx` : `import { useBookSlugs } from './useBookSlugs';` ; après `const gameSlugs = useGameSlugs(current.items);` ajouter `const bookSlugs = useBookSlugs(current.items);` ; ajouter `bookSlugs.has(card.slug)` comme 8ᵉ argument de `toCardPreview` et `bookSlugs` à la liste de dépendances du `useMemo`.
- `TimelinePanel.tsx` : `const bookSlugs = useBookSlugs(tipCards);` ; argument `bookSlugs.has(tipCard.slug),` après celui de `gameSlugs` ; `bookSlugs` dans les dépendances.
- `WorldPanel.tsx` : `const pickedBook = useBookSlugs(pickedCards);` ; argument `pickedBook.has(pickedCard.slug),` ; `pickedBook` dans les dépendances.

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/core/collection/card-preview.test.ts tests/content/card-preview-dom.test.ts && npm run typecheck && npm test`
Expected: PASS (le test `market-search-flow` est instable sous la charge de la suite complète : s'il échoue seul, le relancer isolément ; il doit passer), aucune erreur de types.

- [ ] **Step 5 : Commit**

```bash
git add src/core/collection/card-preview.ts src/content/card-preview-dom.ts src/content/useBookSlugs.ts src/content/HomemadePanel.tsx src/content/TimelinePanel.tsx src/content/WorldPanel.tsx tests/core/collection/card-preview.test.ts tests/content/card-preview-dom.test.ts
git commit -m "feat(book): glyphe livre sur les cartes dans les listes"
```

---

### Task 9 : Câblage de la surcouche (service, section, couverture)

**Files:**
- Modify: `src/app/overlay.ts` (imports ; création du service après le bloc des jeux vidéo, ~ligne 570 ; pose de la section ~ligne 359)
- Test: aucun nouveau test unitaire (le câblage est couvert par `typecheck`, `build` et la vérification manuelle) ; ajouter si possible un test d'intégration léger s'il en existe déjà un pour `decorateGame` dans l'overlay.

**Interfaces:**
- Consumes: `createBookService`, `setBookService`, `createOpenLibraryApi`, `createBookRepo`, `fetchWikidataBook`, `fetchWikipediaIntro`, `decorateBook`, `mountBookSection`, `pruneBookSections`, `getBookService`.
- Produces: service livre enregistré ; section posée ; couverture dans le canal d'image « officiel ».

- [ ] **Step 1 : Lire les emplacements**

Run: `sed -n 36,42p src/app/overlay.ts && sed -n 354,366p src/app/overlay.ts && sed -n 552,575p src/app/overlay.ts`
Expected: les imports de `mount` / `decorate-listen`, le bloc `pruneGameSections` / `decorateGame`, et le bloc des jeux vidéo (`artSources.game = gameService`).

- [ ] **Step 2 : Imports**

Ajouter `mountBookSection` et `pruneBookSections` à l'import de `'../content/mount'` (ligne 38), `decorateBook` à celui de `'../content/decorate-listen'` (ligne 39), et :

```ts
import { getBookService, setBookService } from '../content/book-registry';
import { createBookService } from '../content/book-service';
import { createBookRepo } from '../core/book/book-repo';
import { createOpenLibraryApi } from '../core/book/openlibrary-api';
import { fetchWikidataBook } from '../core/book/wikidata-book';
import { fetchWikipediaIntro } from '../core/book/wikipedia-intro';
```

- [ ] **Step 3 : Poser la section (après le bloc « jeu vidéo », avant les cartes liées)**

```ts
      try {
        pruneBookSections();
        // La section livre se pose dès que son service est créé (Open Library et Wikipédia n'ont besoin d'aucune clé).
        if (getBookService()) decorateBook(document, mountBookSection);
      } catch (error) {
        console.warn(LOG, 'section livre indisponible :', error);
      }
```

- [ ] **Step 4 : Créer le service et brancher la couverture (juste après le bloc `try { … createGameService … }`)**

```ts
  // Livres : Open Library et Wikipédia, sans clé, avec le `fetch` de la page (CORS ouvert). Une panne ici ne doit jamais empêcher la surcouche.
  try {
    const bookService = createBookService({
      collection: collectionRepo,
      kinds: kindsRepo,
      books: createBookRepo(store, (slugs) => fetchWikidataBook((url) => fetch(url), slugs)),
      openLibrary: createOpenLibraryApi({ fetch: (url) => fetch(url) }),
      intro: (slug) => fetchWikipediaIntro((url) => fetch(url), slug),
      cache: createTtlCache(store, { ttlMs: 7 * 24 * 3_600_000 }),
    });
    setBookService(bookService);
    // Couverture des livres : même canal d'image « officiel » que les affiches de jeux (elle passe devant l'image Wikipédia).
    // Le jeu répond d'abord (liste vide pour une carte qui n'est pas un jeu) ; `null` = pas prêt, on redemandera.
    const gameArt = artSources.game;
    artSources.game = {
      async cover(slug, title) {
        const games = gameArt ? await gameArt.cover(slug, title) : [];
        if (games === null || games.length > 0) return games;
        return bookService.cover(slug, title);
      },
    };
  } catch (error) {
    console.warn(LOG, 'livres indisponibles :', error);
  }
```

(`artSources` est le `MediaArtSources` créé plus haut ; le canal `game` n'est pas mémorisé sur disque : aucun changement d'`ART_VERSION` n'est nécessaire.)

- [ ] **Step 5 : Vérifier**

Run: `npm run typecheck && npm test && npm run build`
Expected: aucune erreur de types, toute la suite passe (voir la remarque sur `market-search-flow`), build réussi. Run: `grep -n "createBookService\|decorateBook\|artSources.game" src/app/overlay.ts` : une occurrence de chaque.

- [ ] **Step 6 : Commit**

```bash
git add src/app/overlay.ts
git commit -m "feat(book): brancher le service livre, la section et la couverture dans la surcouche"
```

---

### Task 10 : Fiche WikiHow « Livres »

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvelle fiche, juste après `jeux-video`)
- Test: `tests/core/whats-new/entries.test.ts` (existant)

**Interfaces:** `Entry` / `TourStep` (`src/core/whats-new/types.ts`). Id nouveau, jamais annoncé. Glyphe émoji.

- [ ] **Step 1 : Lire l'entrée voisine**

Run: `n=$(grep -n "id: 'jeux-video'" src/core/whats-new/entries.ts | cut -d: -f1); sed -n "$((n-1)),$((n+32))p" src/core/whats-new/entries.ts`
Expected: la fiche des jeux vidéo (indentation et champs à copier).

- [ ] **Step 2 : Insérer la fiche après `jeux-video`**

```ts
  {
    id: 'livres',
    theme: 'fiche',
    glyph: '📖',
    title: 'Livres',
    summary: 'Synopsis, informations et couverture des romans, poèmes et essais',
    steps: [
      {
        target: '[data-wmt-book]',
        title: 'Fiche d’un livre',
        text: 'Sur une carte de roman, de poème, d’essai, de pièce de théâtre ou de bande dessinée, la fiche affiche l’auteur, l’année, l’éditeur, le nombre de pages, les genres et un synopsis en grand. La couverture du livre devient l’image de la carte quand elle existe.',
        details: [
          { label: 'D’où viennent les données', text: 'Wikidata pour reconnaître qu’une carte est un livre et retrouver son identifiant Open Library ; Open Library pour l’auteur, l’édition et la couverture ; l’introduction de l’article Wikipédia pour le synopsis (à défaut, la description d’Open Library).' },
          { label: 'Comment s’en servir', text: 'Faites défiler le synopsis dans son cadre ; « Lire l’article complet » ouvre Wikipédia. « Fiche Open Library » ouvre la page de l’œuvre. Un petit livre ouvert marque, dans les listes, les cartes de livres.' },
          { label: 'À savoir', text: 'Quand Wikidata ne donne pas l’identifiant, le livre est cherché par son titre exact : un homonyme peut se glisser. Prix, achat et lecture gratuite arriveront dans une prochaine version.' },
        ],
        glyph: '📖',
        optional: true,
      },
    ],
  },
```

- [ ] **Step 3 : Vérifier**

Run: `npx vitest run tests/core/whats-new && npm run typecheck`
Expected: PASS (identifiant unique, champs renseignés, au moins deux paragraphes titrés par étape).

- [ ] **Step 4 : Commit**

```bash
git add src/core/whats-new/entries.ts
git commit -m "docs(wikihow): fiche « Livres »"
```

---

### Task 11 : Vérification finale et livraison

**Files:** aucun (livraison).

- [ ] **Step 1 : Vérification complète**

Run: `npm run typecheck && npm test && npm run build`
Expected: tout passe (voir la remarque sur `market-search-flow` en Task 8).

- [ ] **Step 2 : Vérification manuelle dans Chrome (à faire par l'utilisateur ; ne pas la déclarer faite)**

Recharger l'extension. Ouvrir la fiche de *L'Étranger* ou des *Misérables* (Collection) : section « Livre » sous les étiquettes (glyphe livre, auteur, année · éditeur, pages, genres, synopsis agrandi défilant, lien Wikipédia, « Fiche Open Library ») ; la **couverture** remplace l'image de la carte ; le **glyphe livre** apparaît sur la carte dans les listes (Homemade, Chronologie, Map) et la catégorie « Livre » dans le filtre. Points à surveiller : la politique de sécurité (CSP) du site face aux couvertures (`covers.openlibrary.org` redirige vers `archive.org`) ; un homonyme quand l'identifiant Wikidata manque ; mobile (zones de 44 px, synopsis à 15 px). APK à la demande.

- [ ] **Step 3 : Pousser, ouvrir et fusionner la PR (règles du projet : sans demander)**

```bash
git push -u origin feat/livres-carte
gh pr create --title "feat(book): carte livre (synopsis, couverture, glyphe) — plan 2 sur la catégorie Livres" --body "Conception : docs/superpowers/specs/2026-10-07-livres-design.md ; plan : docs/superpowers/plans/2026-10-07-livres-carte.md.

- Natures « Livre » regroupées (filtre) et reconnaissance des cartes de livres.
- Open Library (œuvre par identifiant Wikidata P648, sinon par titre exact) + introduction Wikipédia pour le synopsis agrandi.
- Section « Livre » dans la fiche, glyphe livre sur les cartes dans les listes, couverture prioritaire (canal d'image officiel des jeux).
- Fiche WikiHow « Livres ».

Reste : vérification manuelle dans Chrome ; APK à la demande. Suite : ⇄ Changer de livre, prix, lecture gratuite, bibliographie.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --merge
```

- [ ] **Step 4 : Livrer en pré-prod (règle : sans demander après fusion)**

Run: `git switch main && git pull && npm run build && npm run preprod`
Expected: pre-release `preprod-N`. La production (`npm run promouvoir`) n'est **jamais** lancée sans ordre explicite de l'utilisateur.
