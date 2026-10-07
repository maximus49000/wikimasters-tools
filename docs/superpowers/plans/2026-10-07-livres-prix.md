# Catégorie « Livres » : prix et achat — plan d'implémentation (plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Dans la section « Livre », montrer le **prix** (papier et ebook) et des **liens d'achat** : un prix de référence papier en grand (« 7,60 € », le prix du livre est unique en France), une ligne par vendeur (Amazon.fr, Fnac, Decitre, librairie indépendante, Google Play Livres) avec son prix quand il a pu être lu, sinon « voir le prix ↗ » vers la page du livre (par ISBN, sinon par titre et auteur).

**Architecture :** les **liens** sont de pure logique (`shops.ts`, instantanés, toujours affichés). Les **prix** sont lus après l'affichage de la fiche, sans la retarder : l'**ebook** par l'API Google Books (clé `WXT_GOOGLE_BOOKS_API_KEY` embarquée au build, comme TMDB), le **papier** par la lecture de la page produit d'Amazon.fr (module isolé `amazon-price.ts`, désactivable d'un seul réglage, extension seulement). Chaque lecture est mémorisée 7 jours **en cas de succès seulement** (un échec n'est jamais mémorisé comme « pas de prix ») ; tout échec laisse simplement la ligne sur « voir le prix ». Le service `book-service` expose `offers(livre)`, la section l'appelle après son premier affichage.

**Tech Stack :** TypeScript, React 19 (shadow DOM), zod, Vitest + jsdom, WXT.

**Spec :** `docs/superpowers/specs/2026-10-07-livres-design.md`, section « Prix : règles » ; maquette validée (non versionnée) `.superpowers/maquette-livres.html`, écran 1 (bloc « Prix en France »). Feuille de route : `docs/superpowers/plans/2026-10-07-livres-feuille-de-route.md` (plan n° 4).

## Global Constraints

- **Sondage du 2026-10-07** (faits vérifiés) : Google Books exige une clé (sans clé : quota 0) et ne donne un prix qu'aux **ebooks** (jamais au papier) ; sa recherche `intitle:/inauthor:` ne renvoie rien, la recherche **simple** « titre auteur » fonctionne ; il répond parfois `503` ; il autorise le CORS. Amazon.fr : la page `https://www.amazon.fr/dp/{ISBN-10}` répond `200` sans redirection, contient l'ISBN-13 (`978-2070360024`), `"priceAmount":7.60` (le premier est le prix de l'édition), le titre `Amazon.fr - L&#x27;étranger - Camus, Albert - Livres` ; elle ne renvoie pas le CORS (passer par le service worker). **Fnac et Decitre bloquent les scripts (403) : liens seulement.**
- **Prix unique du livre** (loi Lang) : un seul prix papier de référence, affiché une fois avec la mention « prix du livre unique en France : identique chez tous les vendeurs (remise max. 5 %) ». Jamais de prix inventé : sans prix lu, la zone de référence est omise.
- **Amazon : une requête par fiche ouverte, mémorisée 7 jours, repli silencieux sur « voir le prix »** ; lecture non prévue par les conditions d'Amazon et fragile à tout changement de page → module isolé, **désactivable d'un seul réglage** (`AMAZON_PRICE_ENABLED` dans `config.ts`) ; **extension seulement** : jamais dans l'APK (liens seulement tant que le pont HTTP natif n'est pas éprouvé).
- Seuls le titre, l'auteur et l'ISBN d'un livre partent vers Google Books / Amazon : jamais de donnée du jeu ni du compte. La clé Google Books ne s'affiche ni ne se journalise jamais.
- Un prix lu est validé : strictement positif et inférieur à 1000 ; euros uniquement ; la page Amazon doit mentionner l'ISBN-13 demandé (sinon : illisible) ; une page de vérification anti-robot est illisible.
- Édition ebook retenue (Google Books) : titre normalisé **égal** à celui du livre (accents, casse, ponctuation ignorés), auteur concordant quand il est connu, `FOR_SALE`, ebook, EUR, avec un `buyLink` en https ; à égalité, la moins chère.
- **Glyphes** de l'application (`external` existe) plutôt que du texte ; zones tactiles de **44 px** ; même contenu sur bureau et mobile ; styles **en ligne** (shadow DOM) ; liens externes `target="_blank"` + `rel="noopener noreferrer"`.
- Textes de l'interface en **français**, commentaires de code en français sobres. **Écrire le français avec les vrais caractères UTF-8 (é è ê à ç ’ « » œ € ↗ ×) via les outils Write/Edit, jamais via un script ou un chemin ASCII** (des accents ont déjà été perdus) ; vérifier par `grep` avant de committer.
- `exactOptionalPropertyTypes` est actif : propriétés optionnelles ajoutées par `...(x ? { k: x } : {})`.
- Vérification : `npm run typecheck`, `npm test`, `npm run build`.

## Hors périmètre

- Recherche Google Books dans la fenêtre « Changer de livre » (la spec la prévoit) : un volume Google n'a pas d'identifiant Open Library, il faudrait une correspondance ISBN → œuvre ; à concevoir à part.
- Prix Fnac / Decitre / Cultura en direct (bloqués) ; API d'affiliation ; lecture gratuite (plan 5) ; bibliographie (plan 6).
- Prix de l'ebook d'autres vendeurs que Google Play.

## Structure des fichiers

Créer : `src/core/book/book-isbn.ts`, `src/core/book/shops.ts`, `src/core/book/amazon-price.ts`, `src/core/book/google-books-api.ts` ; tests miroirs sous `tests/core/book/`.
Modifier : `src/core/book/config.ts`, `src/env.d.ts`, `src/core/book/book-format.ts`, `src/content/book-service.ts`, `src/content/BookSection.tsx`, `src/core/spotify/transport.ts`, `wxt.config.ts`, `src/app/overlay.ts`, `src/core/whats-new/entries.ts` ; tests : `tests/core/book/book-format.test.ts`, `tests/content/book-service.test.ts`, `tests/content/BookSection.test.tsx`, `tests/core/spotify/transport.test.ts`.

---

### Task 0 : Branche de travail

**Files:** aucun.

- [ ] **Step 1 : Vérifier**

Run: `git branch --show-current && git status --short`
Expected: `feat/livres-prix` (créée depuis `main` après la fusion du plan 3), arbre propre. Une autre session peut travailler dans le même dossier : ne jamais utiliser `git stash -u` ; `git add` avec des chemins explicites seulement.

- [ ] **Step 2 : Commiter ce plan**

```bash
git add docs/superpowers/plans/2026-10-07-livres-prix.md
git commit -m "docs(livres): plan 4 (prix et achat)"
```

---

### Task 1 : Configuration, ISBN-10 et liens d'achat

**Files:**
- Modify: `src/core/book/config.ts`, `src/env.d.ts`, `src/core/book/book-format.ts`
- Create: `src/core/book/book-isbn.ts`, `src/core/book/shops.ts`
- Test: `tests/core/book/book-isbn.test.ts`, `tests/core/book/shops.test.ts`, `tests/core/book/book-format.test.ts` (ajout)

**Interfaces:**
- Produces :
  - `config.ts` : `GOOGLE_BOOKS_API_KEY: string` (vide si absente), `GOOGLE_BOOKS_BASE`, `AMAZON_FR_BASE`, `AMAZON_PRICE_ENABLED: boolean`
  - `isbn10Of(isbn13: string): string | undefined`
  - `type PriceLine = { amount: number; currency: 'EUR'; source: string; readAt: number }`
  - `type ShopLink = { shop: 'amazon' | 'fnac' | 'decitre' | 'libraire' | 'google-play'; label: string; kind: 'paper' | 'ebook'; url: string; price?: PriceLine }`
  - `paperShopLinks(book: { isbn?: string; title: string; author?: string }): ShopLink[]` (ordre : Amazon, Fnac, Decitre, librairie indépendante)
  - `formatEuro(amount: number): string` (« 7,60 € », espace ordinaire), `formatDay(ms: number): string` (« 07/10 »)

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
// tests/core/book/book-isbn.test.ts
import { describe, expect, it } from 'vitest';
import { isbn10Of } from '../../../src/core/book/book-isbn';

describe('isbn10Of', () => {
  it('convertit un ISBN-13 en 978 en ISBN-10 avec sa clé de contrôle', () => {
    expect(isbn10Of('9782070360024')).toBe('2070360024');
    expect(isbn10Of('9780679720201')).toBe('0679720200');
    expect(isbn10Of('9780306406157')).toBe('0306406152');
  });
  it('écrit la clé 10 avec un X', () => {
    expect(isbn10Of('9780804429573')).toBe('080442957X');
  });
  it('rend undefined hors du préfixe 978, ou pour une valeur mal formée', () => {
    expect(isbn10Of('9791032000000')).toBeUndefined();
    expect(isbn10Of('2070360024')).toBeUndefined();
    expect(isbn10Of('97820703600X4')).toBeUndefined();
    expect(isbn10Of('')).toBeUndefined();
  });
});
```

```ts
// tests/core/book/shops.test.ts
import { describe, expect, it } from 'vitest';
import { paperShopLinks } from '../../../src/core/book/shops';

describe('paperShopLinks', () => {
  it('avec un ISBN : page du livre chez Amazon (ISBN-10), recherche par ISBN ailleurs, dans cet ordre', () => {
    const links = paperShopLinks({ isbn: '9782070360024', title: 'L’étranger', author: 'Albert Camus' });
    expect(links.map((link) => [link.shop, link.label, link.kind, link.url])).toEqual([
      ['amazon', 'Amazon.fr', 'paper', 'https://www.amazon.fr/dp/2070360024'],
      ['fnac', 'Fnac', 'paper', 'https://www.fnac.com/SearchResult/ResultList.aspx?Search=9782070360024'],
      ['decitre', 'Decitre', 'paper', 'https://www.decitre.fr/rechercher/result?q=9782070360024'],
      ['libraire', 'Librairie indépendante', 'paper', 'https://www.placedeslibraires.fr/listeliv.php?base=allbooks&mots_recherche=9782070360024'],
    ]);
    expect(links.every((link) => link.price === undefined)).toBe(true);
  });

  it('sans ISBN : recherche par titre et auteur, encodée', () => {
    const links = paperShopLinks({ title: 'L’étranger', author: 'Albert Camus' });
    const query = encodeURIComponent('L’étranger Albert Camus');
    expect(links[0]?.url).toBe(`https://www.amazon.fr/s?k=${query}`);
    expect(links[1]?.url).toBe(`https://www.fnac.com/SearchResult/ResultList.aspx?Search=${query}`);
  });

  it('sans ISBN ni auteur : recherche par titre seul ; un ISBN hors 978 reste utilisable en recherche', () => {
    expect(paperShopLinks({ title: 'Poèmes' })[2]?.url).toBe(`https://www.decitre.fr/rechercher/result?q=${encodeURIComponent('Poèmes')}`);
    expect(paperShopLinks({ isbn: '9791032000000', title: 'X' })[0]?.url).toBe('https://www.amazon.fr/s?k=9791032000000');
  });
});
```

Ajouter à `tests/core/book/book-format.test.ts` (étendre l'import avec `formatEuro`, `formatDay`) :

```ts
it('met un prix en euros à la française avec une espace ordinaire', () => {
  expect(formatEuro(7.6)).toBe('7,60 €');
  expect(formatEuro(126.55)).toBe('126,55 €');
  expect(formatEuro(0.99)).toBe('0,99 €');
});
it('met un jour au format jj/mm', () => {
  expect(formatDay(new Date(2026, 9, 7, 12).getTime())).toBe('07/10');
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/book/book-isbn.test.ts tests/core/book/shops.test.ts tests/core/book/book-format.test.ts`
Expected: FAIL (modules et fonctions introuvables).

- [ ] **Step 3 : Implémenter**

Ajouter à `src/core/book/config.ts` :

```ts
// Google Books : clé injectée à la compilation depuis `.env.local` (restreinte à l'API Books) ; vide : l'ebook n'est pas cherché.
export const GOOGLE_BOOKS_API_KEY: string = import.meta.env.WXT_GOOGLE_BOOKS_API_KEY ?? '';
export const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1';
export const AMAZON_FR_BASE = 'https://www.amazon.fr';
// Lecture du prix papier sur la page produit d'Amazon.fr : un seul réglage pour la couper (liens seulement).
export const AMAZON_PRICE_ENABLED = true;
```

`src/env.d.ts` : ajouter `readonly WXT_GOOGLE_BOOKS_API_KEY?: string;` dans `ImportMetaEnv`.

```ts
// src/core/book/book-isbn.ts
// ISBN-10 d'un ISBN-13 en 978 (la page produit d'Amazon.fr s'adresse par ISBN-10) ; undefined hors du préfixe 978 ou si la valeur est mal formée.
export function isbn10Of(isbn13: string): string | undefined {
  if (!/^978\d{10}$/.test(isbn13)) return undefined;
  const body = isbn13.slice(3, 12);
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const check = (11 - (sum % 11)) % 11;
  return body + (check === 10 ? 'X' : String(check));
}
```

```ts
// src/core/book/shops.ts
import { AMAZON_FR_BASE } from './config';
import { isbn10Of } from './book-isbn';

// Un prix lu quelque part, avec sa source et le moment de la lecture.
export type PriceLine = { amount: number; currency: 'EUR'; source: string; readAt: number };

export type ShopLink = {
  shop: 'amazon' | 'fnac' | 'decitre' | 'libraire' | 'google-play';
  label: string;
  kind: 'paper' | 'ebook';
  url: string;
  price?: PriceLine;
};

// Les libraires du papier, dans l'ordre d'affichage. Un ISBN-13 mène à la page du livre (Amazon) ou à une recherche exacte (les autres) ;
// sans ISBN, la recherche se fait par titre et auteur. Aucun appel réseau : ces liens sont toujours là.
export function paperShopLinks(book: { isbn?: string; title: string; author?: string }): ShopLink[] {
  const query = encodeURIComponent(book.isbn ?? [book.title, book.author].filter(Boolean).join(' '));
  const isbn10 = book.isbn ? isbn10Of(book.isbn) : undefined;
  return [
    { shop: 'amazon', label: 'Amazon.fr', kind: 'paper', url: isbn10 ? `${AMAZON_FR_BASE}/dp/${isbn10}` : `${AMAZON_FR_BASE}/s?k=${query}` },
    { shop: 'fnac', label: 'Fnac', kind: 'paper', url: `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${query}` },
    { shop: 'decitre', label: 'Decitre', kind: 'paper', url: `https://www.decitre.fr/rechercher/result?q=${query}` },
    { shop: 'libraire', label: 'Librairie indépendante', kind: 'paper', url: `https://www.placedeslibraires.fr/listeliv.php?base=allbooks&mots_recherche=${query}` },
  ];
}
```

`src/core/book/book-format.ts` : ajouter à la fin :

```ts
// Prix en euros à la française, avec une espace ordinaire (l'espace insécable de Intl complique les comparaisons et les césures).
export const formatEuro = (amount: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount).replace(/[  ]/g, ' ');

// Jour de lecture d'un prix : « 07/10 ».
export const formatDay = (ms: number): string => {
  const date = new Date(ms);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
};
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/core/book && npm run typecheck`
Expected: PASS, aucune erreur de types.

- [ ] **Step 5 : Commit**

```bash
git add src/core/book/config.ts src/env.d.ts src/core/book/book-format.ts src/core/book/book-isbn.ts src/core/book/shops.ts tests/core/book
git commit -m "feat(book): liens d'achat par ISBN, ISBN-10 et mise en forme des prix"
```

---

### Task 2 : Lecture du prix papier sur Amazon.fr (`amazon-price`)

**Files:**
- Create: `src/core/book/amazon-price.ts`
- Test: `tests/core/book/amazon-price.test.ts`

**Interfaces:**
- Consumes: `isbn10Of` (Task 1), `AMAZON_FR_BASE`, `BookError`, `BookFetch`.
- Produces :
  - `parseAmazonPrice(html: string, isbn13: string): number | undefined`
  - `createAmazonPrice(deps: { fetch: BookFetch })` → `{ read(isbn13: string): Promise<number> }` — **lève** une `BookError` quand le prix est illisible (page absente, anti-robot, mauvaise édition, format inconnu) : l'appelant ne mémorise rien.
  - `type AmazonPrice = ReturnType<typeof createAmazonPrice>`

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// tests/core/book/amazon-price.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createAmazonPrice, parseAmazonPrice } from '../../../src/core/book/amazon-price';
import { BookError } from '../../../src/core/book/errors';

// Extraits de la forme réelle de la page produit (titre, ISBN-13 avec tiret, premier prix = celui de l'édition).
const PAGE = `<html><head><title>Amazon.fr - L&#x27;étranger - Camus, Albert - Livres</title></head><body>
<div id="corePrice_feature_div"><span class="a-offscreen">7,60€</span></div>
<li><span>ISBN-13</span> <span>978-2070360024</span></li>
<script>{"priceAmount":7.60,"currency":"EUR"} {"priceAmount":2.04}</script></body></html>`;

describe('parseAmazonPrice', () => {
  it('lit le premier prix de la page de l’édition demandée', () => {
    expect(parseAmazonPrice(PAGE, '9782070360024')).toBe(7.6);
  });
  it('se rabat sur le prix affiché quand le prix structuré manque', () => {
    const page = PAGE.replace(/\{"priceAmount":7\.60[^}]*\} \{"priceAmount":2\.04\}/, '');
    expect(parseAmazonPrice(page, '9782070360024')).toBe(7.6);
  });
  it('refuse une page qui ne mentionne pas l’ISBN-13 demandé (autre édition)', () => {
    expect(parseAmazonPrice(PAGE, '9780679720201')).toBeUndefined();
  });
  it('refuse une page de vérification anti-robot', () => {
    expect(parseAmazonPrice(`${PAGE}<form action="/errors/validateCaptcha">`, '9782070360024')).toBeUndefined();
  });
  it('refuse un prix nul, absurde ou absent', () => {
    const zero = PAGE.replace('"priceAmount":7.60', '"priceAmount":0').replace('7,60€', '0,00€');
    expect(parseAmazonPrice(zero, '9782070360024')).toBeUndefined();
    expect(parseAmazonPrice(PAGE.replace('"priceAmount":7.60', '"priceAmount":99999'), '9782070360024')).toBeUndefined();
    expect(parseAmazonPrice('<p>978-2070360024</p>', '9782070360024')).toBeUndefined();
  });

});

const respond = (status: number, body = '') => vi.fn(async (_url: string) => new Response(body, { status }));

describe('createAmazonPrice', () => {
  it('lit la page produit par l’ISBN-10 et rend le prix', async () => {
    const fetchFn = respond(200, PAGE);
    expect(await createAmazonPrice({ fetch: fetchFn }).read('9782070360024')).toBe(7.6);
    expect(fetchFn).toHaveBeenCalledWith('https://www.amazon.fr/dp/2070360024');
  });

  it('lève une BookError, sans rien mémoriser comme « pas de prix », quand la page est illisible', async () => {
    await expect(createAmazonPrice({ fetch: respond(200, '<html>autre chose</html>') }).read('9782070360024')).rejects.toBeInstanceOf(BookError);
    await expect(createAmazonPrice({ fetch: respond(503) }).read('9782070360024')).rejects.toMatchObject({ code: 'rate-limited' });
    await expect(createAmazonPrice({ fetch: respond(404) }).read('9782070360024')).rejects.toMatchObject({ code: 'not-found' });
    await expect(createAmazonPrice({ fetch: respond(500) }).read('9782070360024')).rejects.toMatchObject({ code: 'http' });
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(createAmazonPrice({ fetch: down }).read('9782070360024')).rejects.toMatchObject({ code: 'http' });
  });

  it('refuse un ISBN sans équivalent ISBN-10, sans appel réseau', async () => {
    const fetchFn = respond(200, PAGE);
    await expect(createAmazonPrice({ fetch: fetchFn }).read('9791032000000')).rejects.toMatchObject({ code: 'not-found' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/book/amazon-price.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Implémenter**

```ts
// src/core/book/amazon-price.ts
import type { BookFetch } from './book-detail';
import { isbn10Of } from './book-isbn';
import { AMAZON_FR_BASE } from './config';
import { BookError } from './errors';

const PRICE_AMOUNT = /"priceAmount":\s*(\d+(?:\.\d+)?)/;
const OFFSCREEN_PRICE = /<span class="a-offscreen">\s*(\d{1,4}(?:[.,]\d{2}))\s*(?:€|&euro;|EUR)/;
const ROBOT_CHECK = /validateCaptcha|api-services-support@amazon/i;

// Le prix de l'édition sur la page produit d'Amazon.fr : le premier prix structuré de la page, à défaut le premier prix affiché.
// La page doit mentionner l'ISBN-13 demandé (sinon c'est une autre édition) et ne pas être une vérification anti-robot ;
// un prix nul ou absurde est refusé. undefined : page illisible.
export function parseAmazonPrice(html: string, isbn13: string): number | undefined {
  if (ROBOT_CHECK.test(html)) return undefined;
  if (!html.includes(isbn13) && !html.includes(`${isbn13.slice(0, 3)}-${isbn13.slice(3)}`)) return undefined;
  const raw = PRICE_AMOUNT.exec(html)?.[1] ?? OFFSCREEN_PRICE.exec(html)?.[1]?.replace(',', '.');
  const amount = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(amount) && amount > 0 && amount < 1000 ? amount : undefined;
}

// Lecture du prix papier d'un livre sur Amazon.fr. Fragile par nature (la page n'est pas une API) : elle lève dès que le prix
// n'est pas lisible, et l'appelant ne mémorise alors rien.
export function createAmazonPrice(deps: { fetch: BookFetch }) {
  return {
    async read(isbn13: string): Promise<number> {
      const isbn10 = isbn10Of(isbn13);
      if (!isbn10) throw new BookError('not-found', 'pas d’ISBN-10');
      let response: Response;
      try {
        response = await deps.fetch(`${AMAZON_FR_BASE}/dp/${isbn10}`);
      } catch {
        throw new BookError('http', 'injoignable');
      }
      if (response.status === 404) throw new BookError('not-found', 'introuvable');
      if (response.status === 429 || response.status === 503) throw new BookError('rate-limited', 'limite atteinte');
      if (!response.ok) throw new BookError('http', `HTTP ${response.status}`);
      const amount = parseAmazonPrice(await response.text(), isbn13);
      if (amount === undefined) throw new BookError('http', 'page illisible');
      return amount;
    },
  };
}
export type AmazonPrice = ReturnType<typeof createAmazonPrice>;
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/core/book/amazon-price.test.ts && npm run typecheck`
Expected: PASS, aucune erreur de types.

- [ ] **Step 5 : Commit**

```bash
git add src/core/book/amazon-price.ts tests/core/book/amazon-price.test.ts
git commit -m "feat(book): lecture du prix papier sur la page produit d'Amazon.fr (isolée, illisible = erreur)"
```

---

### Task 3 : Prix de l'ebook par Google Books (`google-books-api`)

**Files:**
- Create: `src/core/book/google-books-api.ts`
- Test: `tests/core/book/google-books-api.test.ts`

**Interfaces:**
- Consumes: `requestJson`, `BookFetch`, `normalizeTitle`, `GOOGLE_BOOKS_BASE`.
- Produces :
  - `type EbookOffer = { amount: number; url: string }`
  - `createGoogleBooksApi(deps: { fetch: BookFetch; key: string })` → `{ findEbook(book: { title: string; author?: string }): Promise<EbookOffer | null> }` ; `type GoogleBooksApi`

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// tests/core/book/google-books-api.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createGoogleBooksApi } from '../../../src/core/book/google-books-api';

const sale = (saleability: string, amount?: number, over: Record<string, unknown> = {}) => ({
  saleability,
  isEbook: amount !== undefined,
  ...(amount !== undefined ? { listPrice: { amount, currencyCode: 'EUR' }, retailPrice: { amount, currencyCode: 'EUR' }, buyLink: `https://play.google.com/store/books/details?id=${amount}` } : {}),
  ...over,
});
const volume = (title: string, authors: string[], saleInfo: unknown) => ({ volumeInfo: { title, authors }, saleInfo });

// Forme réelle de la réponse pour « Les misérables Victor Hugo » (extrait).
const MISERABLES = {
  items: [
    volume('Les misérables', ['Victor Hugo'], sale('FOR_SALE', 4.99)),
    volume('Les misérables', ['Victor Hugo'], sale('FOR_SALE', 2.99)),
    volume('Les Misérables de Victor Hugo (Texte abrégé)', ['Victor Hugo', 'Camille Page'], sale('FOR_SALE', 3.99)),
    volume('Les Miserables', ['Victor Hugo'], sale('NOT_FOR_SALE')),
    volume('Les misérables', ['Autre Auteur'], sale('FOR_SALE', 1.99)),
  ],
};

const json = (body: unknown, status = 200) => vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
const api = (fetchFn: ReturnType<typeof json>) => createGoogleBooksApi({ fetch: fetchFn, key: 'CLE-TEST' });

describe('createGoogleBooksApi', () => {
  it('retient, parmi les ebooks en vente au titre égal et de l’auteur, le moins cher, avec son lien d’achat', async () => {
    const fetchFn = json(MISERABLES);
    expect(await api(fetchFn).findEbook({ title: 'Les Misérables', author: 'Victor Hugo' })).toEqual({ amount: 2.99, url: 'https://play.google.com/store/books/details?id=2.99' });
  });

  it('cherche en simple « titre auteur », pour la France, avec la clé', async () => {
    const fetchFn = json(MISERABLES);
    await api(fetchFn).findEbook({ title: 'Les Misérables', author: 'Victor Hugo' });
    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/books/v1/volumes');
    expect(url.searchParams.get('q')).toBe('Les Misérables Victor Hugo');
    expect(url.searchParams.get('country')).toBe('FR');
    expect(url.searchParams.get('key')).toBe('CLE-TEST');
    expect(url.searchParams.get('q')).not.toContain('intitle');
  });

  it('sans auteur connu, ne filtre que sur le titre', async () => {
    expect((await api(json(MISERABLES)).findEbook({ title: 'Les misérables' }))?.amount).toBe(1.99);
  });

  it('rend null sans résultat, sans ebook en vente, ou pour un prix hors euros ou sans lien https', async () => {
    expect(await api(json({})).findEbook({ title: 'Inconnu' })).toBeNull();
    expect(await api(json({ items: [volume('Inconnu', [], sale('NOT_FOR_SALE'))] })).findEbook({ title: 'Inconnu' })).toBeNull();
    const dollars = volume('Inconnu', [], { saleability: 'FOR_SALE', isEbook: true, retailPrice: { amount: 5, currencyCode: 'USD' }, buyLink: 'https://x.test/a' });
    const http = volume('Inconnu', [], { saleability: 'FOR_SALE', isEbook: true, retailPrice: { amount: 5, currencyCode: 'EUR' }, buyLink: 'http://x.test/a' });
    expect(await api(json({ items: [dollars, http] })).findEbook({ title: 'Inconnu' })).toBeNull();
  });

  it('lève une BookError sur une réponse en erreur (503 de Google) ou au format inattendu', async () => {
    await expect(api(json({}, 503)).findEbook({ title: 'X' })).rejects.toMatchObject({ name: 'BookError', code: 'http' });
    await expect(api(json({}, 429)).findEbook({ title: 'X' })).rejects.toMatchObject({ code: 'rate-limited' });
    await expect(api(json({ items: 'pas une liste' })).findEbook({ title: 'X' })).rejects.toMatchObject({ code: 'http' });
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/book/google-books-api.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Implémenter**

```ts
// src/core/book/google-books-api.ts
import { z } from 'zod';
import type { BookFetch } from './book-detail';
import { normalizeTitle } from './book-format';
import { GOOGLE_BOOKS_BASE } from './config';
import { requestJson } from './http';

const priceSchema = z.object({ amount: z.number(), currencyCode: z.string() });
const volumeSchema = z.object({
  volumeInfo: z.object({ title: z.string(), authors: z.array(z.string()).optional() }),
  saleInfo: z.object({ saleability: z.string(), isEbook: z.boolean().optional(), listPrice: priceSchema.optional(), retailPrice: priceSchema.optional(), buyLink: z.string().optional() }),
});
const responseSchema = z.object({ items: z.array(volumeSchema).optional() });

// L'offre d'ebook retenue : prix en euros et lien d'achat (Google Play Livres).
export type EbookOffer = { amount: number; url: string };

// Prix de l'ebook d'un livre par Google Books (seul à donner un prix en France : jamais pour le papier).
// La recherche est « titre auteur » en texte simple (les opérateurs intitle/inauthor ne renvoient rien) ; les résultats sont bruyants
// (essais, résumés, éditions scolaires) : on ne garde que le titre égal, l'auteur concordant, un ebook en vente, en euros, avec un lien https ; le moins cher.
export function createGoogleBooksApi(deps: { fetch: BookFetch; key: string }) {
  return {
    async findEbook(book: { title: string; author?: string }): Promise<EbookOffer | null> {
      const query = [book.title, book.author].filter(Boolean).join(' ');
      const params = new URLSearchParams({ q: query, country: 'FR', maxResults: '10', key: deps.key });
      const data = await requestJson(deps.fetch, `${GOOGLE_BOOKS_BASE}/volumes?${params}`, responseSchema);
      const wantedTitle = normalizeTitle(book.title);
      const wantedAuthor = book.author ? normalizeTitle(book.author) : '';
      const offers: EbookOffer[] = [];
      for (const item of data.items ?? []) {
        if (normalizeTitle(item.volumeInfo.title) !== wantedTitle) continue;
        if (wantedAuthor !== '' && !normalizeTitle((item.volumeInfo.authors ?? []).join(' ')).includes(wantedAuthor)) continue;
        const sale = item.saleInfo;
        const price = sale.retailPrice ?? sale.listPrice;
        if (sale.saleability !== 'FOR_SALE' || sale.isEbook === false || !price || price.currencyCode !== 'EUR' || price.amount <= 0) continue;
        if (!sale.buyLink?.startsWith('https://')) continue;
        offers.push({ amount: price.amount, url: sale.buyLink });
      }
      return offers.sort((a, b) => a.amount - b.amount)[0] ?? null;
    },
  };
}
export type GoogleBooksApi = ReturnType<typeof createGoogleBooksApi>;
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/core/book/google-books-api.test.ts && npm run typecheck`
Expected: PASS (5 tests), aucune erreur de types. Si un test échoue sur le cas « sans auteur » (attendu : 1,99 = le moins cher des ebooks de titre égal, tous auteurs confondus), c'est le comportement voulu : ne pas toucher l'attente.

- [ ] **Step 5 : Commit**

```bash
git add src/core/book/google-books-api.ts tests/core/book/google-books-api.test.ts
git commit -m "feat(book): prix de l'ebook par Google Books (titre égal, auteur concordant, le moins cher)"
```

---

### Task 4 : `offers()` dans `book-service`

**Files:**
- Modify: `src/content/book-service.ts`
- Test: `tests/content/book-service.test.ts` (ajouts + `setup` étendu)

**Interfaces:**
- Consumes: `paperShopLinks`, `ShopLink`, `PriceLine` (Task 1), `AmazonPrice` (Task 2), `GoogleBooksApi` (Task 3), `normalizeTitle`.
- Produces :
  - `type BookOffers = { shops: ShopLink[]; paperPrice?: PriceLine }`
  - dépendances **optionnelles** ajoutées à `BookServiceDeps` : `amazon?: Pick<AmazonPrice, 'read'> | null`, `googleBooks?: Pick<GoogleBooksApi, 'findEbook'> | null`, `now?: () => number` (défaut `Date.now`)
  - `offers(book: { title: string; author?: string; isbn?: string }): Promise<BookOffers>` — ne lève jamais ; les liens du papier sont toujours là ; `shops` = papier (Amazon, Fnac, Decitre, librairie) puis l'ebook Google Play quand il existe ; `paperPrice` = le prix Amazon quand il a été lu.

- [ ] **Step 1 : Étendre le `setup` du test, puis écrire les tests qui échouent**

Dans `tests/content/book-service.test.ts` : étendre `type Setup` avec `amazon?: { read: (isbn: string) => Promise<number> } | null; googleBooks?: { findEbook: (book: { title: string; author?: string }) => Promise<{ amount: number; url: string } | null> } | null;` ; dans `setup`, créer `const amazon = over.amazon === undefined ? null : over.amazon;` et `const googleBooks = over.googleBooks === undefined ? null : over.googleBooks;`, les passer à `createBookService({ …, amazon, googleBooks, now: () => NOW })` avec `const NOW = 1_760_000_000_000;` en tête de fichier. Les tests existants ne changent pas. Ajouter :

```ts
describe('offers', () => {
  const book = { title: 'L’étranger', author: 'Albert Camus', isbn: '9782070360024' };
  const labels = (offers: { shops: { shop: string }[] }) => offers.shops.map((shop) => shop.shop);

  it('sans source de prix : les quatre liens du papier, aucun prix', async () => {
    const offers = await setup().service.offers(book);
    expect(labels(offers)).toEqual(['amazon', 'fnac', 'decitre', 'libraire']);
    expect(offers.paperPrice).toBeUndefined();
    expect(offers.shops[0]?.url).toBe('https://www.amazon.fr/dp/2070360024');
  });

  it('le prix lu sur Amazon devient le prix de référence et celui de la ligne Amazon', async () => {
    const read = vi.fn(async (_isbn: string) => 7.6);
    const offers = await setup({ amazon: { read } }).service.offers(book);
    const price = { amount: 7.6, currency: 'EUR', source: 'Amazon.fr', readAt: NOW };
    expect(offers.paperPrice).toEqual(price);
    expect(offers.shops[0]?.price).toEqual(price);
    expect(offers.shops[1]?.price).toBeUndefined();
    expect(read).toHaveBeenCalledWith('9782070360024');
  });

  it('l’ebook de Google Books s’ajoute après les libraires, avec son prix et son lien', async () => {
    const findEbook = vi.fn(async () => ({ amount: 7.49, url: 'https://play.google.com/store/books/details?id=x' }));
    const offers = await setup({ googleBooks: { findEbook } }).service.offers(book);
    expect(labels(offers)).toEqual(['amazon', 'fnac', 'decitre', 'libraire', 'google-play']);
    expect(offers.shops[4]).toMatchObject({ label: 'Google Play Livres', kind: 'ebook', url: 'https://play.google.com/store/books/details?id=x', price: { amount: 7.49, currency: 'EUR', source: 'Google Play Livres', readAt: NOW } });
    expect(findEbook).toHaveBeenCalledWith({ title: 'L’étranger', author: 'Albert Camus' });
  });

  it('sans ISBN, Amazon n’est pas interrogé (liens seulement) ; l’ebook se cherche quand même', async () => {
    const read = vi.fn(async () => 7.6);
    const findEbook = vi.fn(async () => null);
    const offers = await setup({ amazon: { read }, googleBooks: { findEbook } }).service.offers({ title: 'Poèmes' });
    expect(read).not.toHaveBeenCalled();
    expect(findEbook).toHaveBeenCalled();
    expect(offers.paperPrice).toBeUndefined();
    expect(labels(offers)).toEqual(['amazon', 'fnac', 'decitre', 'libraire']);
  });

  it('un échec d’Amazon ou de Google ne fait rien perdre : les liens restent, le prix manque', async () => {
    const amazon = { read: vi.fn(async () => Promise.reject(new Error('503'))) };
    const googleBooks = { findEbook: vi.fn(async () => Promise.reject(new Error('503'))) };
    const offers = await setup({ amazon, googleBooks }).service.offers(book);
    expect(labels(offers)).toEqual(['amazon', 'fnac', 'decitre', 'libraire']);
    expect(offers.paperPrice).toBeUndefined();
  });

  it('un prix lu est mémorisé (une seule lecture) ; un échec ne l’est pas (nouvelle tentative)', async () => {
    const read = vi.fn(async () => 7.6);
    const ok = setup({ amazon: { read } });
    await ok.service.offers(book);
    await ok.service.offers(book);
    expect(read).toHaveBeenCalledTimes(1);

    let calls = 0;
    const flaky = { read: vi.fn(async () => (++calls === 1 ? Promise.reject(new Error('503')) : 7.6)) };
    const retry = setup({ amazon: flaky });
    expect((await retry.service.offers(book)).paperPrice).toBeUndefined();
    expect(flaky.read).toHaveBeenCalledTimes(1);
  });

  it('une absence d’ebook est mémorisée (pas de nouvelle requête à chaque ouverture)', async () => {
    const findEbook = vi.fn(async () => null);
    const { service } = setup({ googleBooks: { findEbook } });
    await service.offers(book);
    await service.offers(book);
    expect(findEbook).toHaveBeenCalledTimes(1);
  });
});
```

(La non-mémorisation d’un échec vient de `TtlCache` : il lève sans enregistrer de valeur ; le test établit « pas de prix » et un seul appel après l’échec.)

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/book-service.test.ts`
Expected: FAIL (`offers` inexistant ; `amazon`/`googleBooks` inconnus).

- [ ] **Step 3 : Implémenter dans `src/content/book-service.ts`**

Ajouter les imports :

```ts
import type { AmazonPrice } from '../core/book/amazon-price';
import type { GoogleBooksApi } from '../core/book/google-books-api';
import { paperShopLinks, type PriceLine, type ShopLink } from '../core/book/shops';
```

Ajouter le type après `BookPreview` :

```ts
// Les offres d'un livre : les liens du papier (toujours là), l'ebook s'il existe, et le prix papier de référence quand il a été lu.
export type BookOffers = { shops: ShopLink[]; paperPrice?: PriceLine };
```

Ajouter à `BookServiceDeps` (champs optionnels) :

```ts
  // Lecture du prix papier (Amazon.fr) et prix de l'ebook (Google Books) : absents (null / non fournis), seuls les liens restent.
  amazon?: Pick<AmazonPrice, 'read'> | null;
  googleBooks?: Pick<GoogleBooksApi, 'findEbook'> | null;
  now?: () => number;
```

En tête de `createBookService`, étendre la déstructuration : `const { collection, kinds, books, choices, openLibrary, intro, cache, onChoice, amazon = null, googleBooks = null, now = () => Date.now() } = deps;` et ajouter, parmi les méthodes retournées, après `preview` :

```ts
    // Les liens d'achat du livre, puis les prix quand ils se lisent : l'ebook (Google Books) et le prix papier (Amazon.fr, qui devient le prix de référence).
    // Ne lève jamais ; un prix lu est mémorisé (7 jours), un échec ne l'est pas (la ligne reste sur « voir le prix »).
    async offers(book: { title: string; author?: string; isbn?: string }): Promise<BookOffers> {
      const shops = paperShopLinks(book);
      const isbn = book.isbn;
      const [paper, ebook] = await Promise.all([
        amazon && isbn ? optional(() => cache.getOrLoad(`book-amazon-v1-${isbn}`, async () => ({ amount: await amazon.read(isbn), readAt: now() }))) : null,
        googleBooks
          ? optional(() =>
              cache.getOrLoad(`book-ebook-v1-${normalizeTitle(book.title)}-${normalizeTitle(book.author ?? '')}`, async () => {
                const found = await googleBooks.findEbook(book);
                return found ? { ...found, readAt: now() } : null;
              }),
            )
          : null,
      ]);
      const paperPrice: PriceLine | undefined = paper ? { amount: paper.amount, currency: 'EUR', source: 'Amazon.fr', readAt: paper.readAt } : undefined;
      const all: ShopLink[] = shops.map((shop) => (shop.shop === 'amazon' && paperPrice ? { ...shop, price: paperPrice } : shop));
      if (ebook) {
        all.push({ shop: 'google-play', label: 'Google Play Livres', kind: 'ebook', url: ebook.url, price: { amount: ebook.amount, currency: 'EUR', source: 'Google Play Livres', readAt: ebook.readAt } });
      }
      return { shops: all, ...(paperPrice ? { paperPrice } : {}) };
    },
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/content/book-service.test.ts && npm run typecheck`
Expected: PASS (les tests existants + 7 nouveaux), aucune erreur de types. Si `optional` (aide existante : `<T>(job: () => Promise<T | null>)`) ne type pas avec le chargeur d'Amazon, ne rien affaiblir : typer le résultat du chargeur (`Promise<{ amount: number; readAt: number } | null>`) et expliquer.

- [ ] **Step 5 : Commit**

```bash
git add src/content/book-service.ts tests/content/book-service.test.ts
git commit -m "feat(book): offres d'un livre (liens d'achat, prix papier Amazon, ebook Google Books)"
```

---

### Task 5 : Bloc « Prix en France » dans la section

**Files:**
- Modify: `src/content/BookSection.tsx`
- Test: `tests/content/BookSection.test.tsx` (ajouts + `show` étendu)

**Interfaces:**
- Consumes: `service.offers(...)` (Task 4), `paperShopLinks`, `ShopLink`, `PriceLine`, `formatEuro`, `formatDay` (Task 1), `Glyph name="external"`.
- Produces: un bloc `data-wmt-book-prices` dans le détail du livre : libellé « Prix en France », bloc de référence (seulement si un prix papier est lu), une ligne par vendeur.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `tests/content/BookSection.test.tsx` : le `show` existant fournit déjà `...dialogService()` ; ajouter `offers: vi.fn(async () => ({ shops: [] }))` à son service par défaut (les tests existants ne regardent pas les prix), puis :

```tsx
const READ_AT = new Date(2026, 9, 7, 12).getTime();
const price = (amount: number, source: string) => ({ amount, currency: 'EUR', source, readAt: READ_AT });
const shop = (shop: string, label: string, kind: string, url: string, extra: object = {}) => ({ shop, label, kind, url, ...extra });
const withPrices = {
  shops: [
    shop('amazon', 'Amazon.fr', 'paper', 'https://www.amazon.fr/dp/2070360024', { price: price(7.6, 'Amazon.fr') }),
    shop('fnac', 'Fnac', 'paper', 'https://www.fnac.com/x'),
    shop('decitre', 'Decitre', 'paper', 'https://www.decitre.fr/x'),
    shop('libraire', 'Librairie indépendante', 'paper', 'https://www.placedeslibraires.fr/x'),
    shop('google-play', 'Google Play Livres', 'ebook', 'https://play.google.com/store/books/details?id=x', { price: price(7.49, 'Google Play Livres') }),
  ],
  paperPrice: price(7.6, 'Amazon.fr'),
};
const withIsbn = { ...etranger, isbn: '9782070360024' };

describe('BookSection — prix et achat', () => {
  it('affiche le prix de référence, une ligne par vendeur avec son prix ou « voir le prix », et la date de lecture', async () => {
    await show({ status: 'detail', detail: withIsbn }, { offers: vi.fn(async () => withPrices) });
    const block = container.querySelector('[data-wmt-book-prices]') as HTMLElement;
    expect(block).not.toBeNull();
    const text = block.textContent ?? '';
    expect(text).toContain('Prix en France');
    expect(text).toContain('7,60 €');
    expect(text).toContain('prix du livre unique en France');
    expect(text).toContain('7,49 €');
    expect(text).toContain('Google Play Livres');
    expect(text).toContain('voir le prix');
    expect(text).toContain('chercher');
    expect(text).toContain('Prix lus le 07/10');
    const rows = [...block.querySelectorAll('a')];
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(withPrices.shops.map((s) => s.url));
    for (const row of rows) {
      expect(row.getAttribute('target')).toBe('_blank');
      expect(row.getAttribute('rel')).toBe('noopener noreferrer');
      expect(parseInt((row as HTMLElement).style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
  });

  it('les liens du papier s’affichent tout de suite, avant la réponse des prix, sans prix de référence', async () => {
    await show({ status: 'detail', detail: withIsbn }, { offers: vi.fn(() => new Promise(() => undefined)) });
    const block = container.querySelector('[data-wmt-book-prices]') as HTMLElement;
    const hrefs = [...block.querySelectorAll('a')].map((row) => row.getAttribute('href'));
    expect(hrefs[0]).toBe('https://www.amazon.fr/dp/2070360024');
    expect(hrefs).toHaveLength(4);
    expect(block.textContent).not.toContain('prix du livre unique');
    expect(block.textContent).not.toContain('Prix lus le');
  });

  it('un échec de la lecture des prix laisse les liens, sans message d’erreur', async () => {
    await show({ status: 'detail', detail: withIsbn }, { offers: vi.fn(async () => Promise.reject(new Error('x'))) });
    const block = container.querySelector('[data-wmt-book-prices]') as HTMLElement;
    expect(block.querySelectorAll('a')).toHaveLength(4);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('sans prix lu, la zone de référence est omise ; le pied cite les sources', async () => {
    await show({ status: 'detail', detail: withIsbn }, { offers: vi.fn(async () => ({ shops: withPrices.shops.map((s) => ({ ...s, price: undefined })).map(({ price: _p, ...rest }) => rest) })) });
    const block = container.querySelector('[data-wmt-book-prices]') as HTMLElement;
    expect(block.textContent).not.toContain('prix du livre unique');
    expect(container.textContent).toContain('Données : Open Library, Wikipédia, Wikidata, Google Books');
  });

  it('pas de bloc de prix pour une fiche vide ou en erreur', async () => {
    await show({ status: 'empty' });
    expect(container.querySelector('[data-wmt-book-prices]')).toBeNull();
    await show({ status: 'error', message: 'x' });
    expect(container.querySelector('[data-wmt-book-prices]')).toBeNull();
  });

  it('interroge les offres avec le titre, l’auteur et l’ISBN du livre', async () => {
    const offers = vi.fn(async () => withPrices);
    await show({ status: 'detail', detail: withIsbn }, { offers });
    expect(offers).toHaveBeenCalledWith({ title: 'L’étranger', author: 'Albert Camus', isbn: '9782070360024' });
  });
});
```

Adapter le test existant qui vérifie le pied « Données : Open Library, Wikipédia, Wikidata » : le texte devient « Données : Open Library, Wikipédia, Wikidata, Google Books » (changement légitime, à expliquer dans le rapport).

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/BookSection.test.tsx`
Expected: FAIL (pas de bloc de prix).

- [ ] **Step 3 : Implémenter dans `src/content/BookSection.tsx`**

Ajouter aux imports : `import { formatDay, formatEuro } from '../core/book/book-format';`, `import { paperShopLinks, type PriceLine } from '../core/book/shops';`, `import type { BookOffers } from './book-service';` (compléter l'import existant de `./book-service` si présent). Ajouter, avant `function Detail` :

```tsx
const REFERENCE_NOTE = 'prix neuf papier · le prix du livre unique en France : identique chez tous les vendeurs (remise max. 5 %)';

function ShopRow({ shop }: { shop: BookOffers['shops'][number] }) {
  const fallback = shop.shop === 'libraire' ? 'chercher' : 'voir le prix';
  return (
    <a
      href={shop.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', border, borderRadius: 8, color: 'inherit', textDecoration: 'none', fontSize: 13 }}
    >
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>
        {shop.label}
        <small style={{ display: 'block', fontWeight: 400, fontSize: 11, opacity: 0.65 }}>{shop.kind === 'ebook' ? 'ebook' : 'papier'}</small>
      </span>
      <span style={{ fontWeight: shop.price ? 700 : 400, opacity: shop.price ? 1 : 0.65 }}>{shop.price ? formatEuro(shop.price.amount) : fallback}</span>
      <Glyph name="external" size={14} />
    </a>
  );
}

// « Prix en France » : les liens d'achat s'affichent aussitôt (pure logique) ; les prix s'y ajoutent quand ils sont lus (ebook Google Books,
// papier Amazon.fr). Aucun prix lu : pas de prix de référence, jamais de prix inventé.
function Prices({ detail }: { detail: BookDetail }) {
  const service = getBookService();
  const [offers, setOffers] = useState<BookOffers | null>(null);

  useEffect(() => {
    setOffers(null);
    if (!service) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => service.offers({ title: detail.title, ...(detail.author ? { author: detail.author } : {}), ...(detail.isbn ? { isbn: detail.isbn } : {}) }))
      .then((next) => !cancelled && setOffers(next))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [service, detail.id, detail.title, detail.author, detail.isbn]);

  const shops = offers?.shops ?? paperShopLinks({ title: detail.title, ...(detail.author ? { author: detail.author } : {}), ...(detail.isbn ? { isbn: detail.isbn } : {}) });
  const paperPrice: PriceLine | undefined = offers?.paperPrice;
  const readAt = Math.max(0, ...shops.map((shop) => shop.price?.readAt ?? 0));
  return (
    <div data-wmt-book-prices="" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prix en France</div>
      {paperPrice && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 12px', border, borderRadius: 10, background: 'rgba(148,163,184,0.08)' }}>
          <b style={{ fontSize: 22, color: '#4ade80' }}>{formatEuro(paperPrice.amount)}</b>
          <span style={{ fontSize: 12, opacity: 0.75 }}>{REFERENCE_NOTE}</span>
        </div>
      )}
      {shops.map((shop) => (
        <ShopRow key={shop.shop} shop={shop} />
      ))}
      {readAt > 0 && <span style={{ fontSize: 10, opacity: 0.6 }}>Prix lus le {formatDay(readAt)} · mémorisés 7 jours</span>}
    </div>
  );
}
```

Dans `Detail` : insérer `<Prices detail={detail} />` juste après le bloc du synopsis (`{detail.synopsis && <Synopsis … />}`) et avant le lien « Fiche Open Library », et remplacer la mention du pied par `Données : Open Library, Wikipédia, Wikidata, Google Books`.

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/content/BookSection.test.tsx tests/content/BookChoiceDialog.test.tsx && npm run typecheck`
Expected: PASS (les tests existants + 6 nouveaux), aucune erreur de types. `useState`/`useEffect` sont déjà importés dans ce fichier.

- [ ] **Step 5 : Commit**

```bash
git add src/content/BookSection.tsx tests/content/BookSection.test.tsx
git commit -m "feat(book): bloc « Prix en France » (prix de référence, vendeurs, ebook) dans la section"
```

---

### Task 6 : Câblage de la surcouche, relais du service worker, WikiHow

**Files:**
- Modify: `src/core/spotify/transport.ts` (liste blanche du relais), `wxt.config.ts` (permissions d'hôte), `src/app/overlay.ts` (services), `src/core/whats-new/entries.ts` (fiche `livres-v3`)
- Test: `tests/core/spotify/transport.test.ts` (ajout), `tests/core/whats-new/entries.test.ts` (existant)

**Interfaces:**
- Consumes: `createAmazonPrice`, `createGoogleBooksApi`, `GOOGLE_BOOKS_API_KEY`, `AMAZON_PRICE_ENABLED`, `NativeHttpWindow` (`src/android/native-http.ts`).
- Produces: les services de prix passés à `createBookService` ; relais autorisé vers `https://www.amazon.fr/dp/` et `https://www.googleapis.com/books/v1/` ; fiche WikiHow `livres-v3`.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `tests/core/spotify/transport.test.ts` (lire d'abord les tests existants « refuse un faux hôte de jeux vidéo » et leur aide `d` / forme de réponse ; réutiliser exactement leurs aides) :

```ts
it('relaie Amazon.fr (pages produit) et Google Books (API v1), et refuse le reste de ces hôtes', async () => {
  const fetchSpy = vi.fn(async () => new Response('ok', { status: 200 }));
  const deps = { launchWebAuthFlow: async () => '', getRedirectUrl: () => '', fetch: fetchSpy };
  for (const url of ['https://www.amazon.fr/dp/2070360024', 'https://www.googleapis.com/books/v1/volumes?q=x&key=k']) {
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'fetch', url }, deps)).toMatchObject({ ok: true });
  }
  for (const url of ['https://www.amazon.fr/gp/css/homepage.html', 'https://www.amazon.fr.evil.example/dp/2070360024', 'https://www.googleapis.com/drive/v3/files', 'https://evil.example/https://www.amazon.fr/dp/1']) {
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'fetch', url }, deps)).toEqual({ ok: false, error: 'adresse refusée' });
  }
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/spotify/transport.test.ts`
Expected: FAIL (les deux adresses sont refusées).

- [ ] **Step 3 : Implémenter**

`src/core/spotify/transport.ts` : dans `FETCH_PREFIXES`, après le bloc des jeux vidéo, ajouter :

```ts
  // Livres : prix papier (page produit d'Amazon.fr) et prix de l'ebook (Google Books) ; même contournement de la CSP du site.
  'https://www.amazon.fr/dp/',
  'https://www.googleapis.com/books/v1/',
```

(et adapter le commentaire de tête pour citer les livres.) `wxt.config.ts` : ajouter à `host_permissions`, après `'https://api.igdb.com/*',` : `'https://www.amazon.fr/*',` et `'https://www.googleapis.com/*',`.

`src/app/overlay.ts` : ajouter les imports

```ts
import { createAmazonPrice } from '../core/book/amazon-price';
import { AMAZON_PRICE_ENABLED, GOOGLE_BOOKS_API_KEY } from '../core/book/config';
import { createGoogleBooksApi } from '../core/book/google-books-api';
import type { NativeHttpWindow } from '../android/native-http';
```

(vérifier d'abord ce qui est déjà importé depuis `../android/native-http` dans ce fichier et ne pas dupliquer l'import) et, dans le bloc livres, avant `createBookService`, puis dans ses options :

```ts
    // Prix : Google Books (ebook, avec la clé de la compilation) et Amazon.fr (papier) passent par le relais de la plateforme (service worker,
    // hors CSP du site). Amazon : extension seulement, jamais dans l'APK (pas de pont HTTP éprouvé pour une page HTML : liens seulement).
    const platformFetch = (url: string) => (spotify ? spotify.fetch(url) : fetch(url));
    const isApk = Boolean((window as unknown as NativeHttpWindow).WmtHttp);
    const googleBooks = GOOGLE_BOOKS_API_KEY ? createGoogleBooksApi({ fetch: platformFetch, key: GOOGLE_BOOKS_API_KEY }) : null;
    const amazon = AMAZON_PRICE_ENABLED && spotify && !isApk ? createAmazonPrice({ fetch: platformFetch }) : null;
```

options à ajouter à `createBookService({ … })` : `googleBooks,` et `amazon,`.

`src/core/whats-new/entries.ts` : remplacer l'entrée `id: 'livres-v2'` par l'entrée ci-dessous (nouvel `id` : la fiche est modifiée, donc annoncée de nouveau ; même place, juste après `jeux-video`). Reprendre à l'identique les étapes 1 et 3 existantes (texte, `details`, `scene`, `glyph`, `gesture`, labels), sauf : à l'étape 1, remplacer la dernière phrase de « À savoir » (« Prix, achat et lecture gratuite arriveront dans une prochaine version. ») par « Prix et achat sont décrits à l'étape suivante ; la lecture gratuite arrivera dans une prochaine version. » ; et insérer entre elles cette étape :

```ts
      {
        target: '[data-wmt-book-prices]',
        title: 'Prix et achat',
        text: 'Sous le synopsis, « Prix en France » montre le prix du livre neuf (papier) et une ligne par vendeur : Amazon.fr, Fnac, Decitre, une librairie indépendante, et l’ebook sur Google Play Livres. Chaque ligne ouvre la page du livre chez le vendeur.',
        details: [
          { label: 'D’où viennent les données', text: 'Le prix papier est lu sur la page du livre d’Amazon.fr quand c’est possible (extension seulement) ; l’ebook vient de Google Books. Les liens se construisent avec l’ISBN du livre, ou avec son titre et son auteur à défaut.' },
          { label: 'Comment s’en servir', text: 'Touchez une ligne pour ouvrir le vendeur. Un prix affiché est celui lu le jour indiqué en bas ; « voir le prix » ou « chercher » signifie que le prix n’a pas pu être lu et que le bouton mène à la page du livre.' },
          { label: 'À savoir', text: 'En France, le prix du livre neuf est le même chez tous les vendeurs (remise de 5 % au plus) : un seul prix de référence suffit. Les prix lus sont gardés 7 jours. Fnac et Decitre ne se laissent pas lire : liens seulement. Sur l’application Android, seuls les liens et l’ebook sont proposés.' },
        ],
        scene: { card: 'book' },
        glyph: '💶',
      },
```

(Le test des fiches exige un détail « Comment faire » seulement pour les étapes qui ont un `gesture` : cette étape n'en a pas, ses libellés sont libres.)

- [ ] **Step 4 : Vérifier**

Run: `npx vitest run tests/core/spotify tests/core/whats-new && npm run typecheck && npm test && npm run build`
Expected: tout passe ; `market-search-flow` est instable sous la charge de la suite complète : s'il est seul à échouer, le relancer isolément. Run: `grep -n "createAmazonPrice\|createGoogleBooksApi\|AMAZON_PRICE_ENABLED\|googleBooks,\|amazon," src/app/overlay.ts` : le câblage est présent une fois ; `grep -rn "'livres-v2'" src tests` : aucune occurrence restante.

- [ ] **Step 5 : Commit**

```bash
git add src/core/spotify/transport.ts wxt.config.ts src/app/overlay.ts src/core/whats-new/entries.ts tests/core/spotify/transport.test.ts
git commit -m "feat(book): brancher les prix (Google Books, Amazon.fr) dans la surcouche et le relais ; fiche « Livres » v3"
```

---

### Task 7 : Vérification finale et livraison

**Files:** aucun (livraison).

- [ ] **Step 1 : Vérification complète**

Run: `npm run typecheck && npm test && npm run build`
Expected: tout passe.

- [ ] **Step 2 : Vérification manuelle dans Chrome (à faire par l'utilisateur ; ne pas la déclarer faite)**

Recharger l'extension (les permissions d'hôte changent : Chrome peut demander de les accepter). Ouvrir *L'Étranger* : le bloc « Prix en France » s'affiche aussitôt avec les liens, puis le prix papier de référence (7,60 € attendu) et l'ebook (≈ 7,49 €) apparaissent ; les boutons Amazon / Fnac / Decitre / librairie ouvrent la bonne page ; la date de lecture est en bas. Vérifier un livre sans ISBN (liens par titre), un ebook absent (pas de ligne Google Play), et le **mobile** : sur l'APK, seuls les liens (et l'ebook) apparaissent, jamais le prix Amazon. Points à surveiller : la CSP du site vis-à-vis du relais ; Google Books répond parfois 503 (la ligne reste sur « voir le prix ») ; la page Amazon peut changer (le prix cesse alors d'apparaître sans erreur). APK à la demande.

- [ ] **Step 3 : Pousser, ouvrir et fusionner la PR (règles du projet : sans demander)**

```bash
git push -u origin feat/livres-prix
gh pr create --title "feat(book): prix et achat (Amazon.fr, Google Books, liens libraires)" --body "Conception : docs/superpowers/specs/2026-10-07-livres-design.md ; plan : docs/superpowers/plans/2026-10-07-livres-prix.md (plan 4 sur la catégorie Livres).

- Bloc « Prix en France » dans la section Livre : prix papier de référence (le prix du livre est unique en France), une ligne par vendeur (Amazon.fr, Fnac, Decitre, librairie indépendante, Google Play Livres), « voir le prix » quand un prix ne se lit pas.
- Liens d'achat par ISBN (ISBN-10 pour Amazon), sinon par titre et auteur.
- Prix ebook par Google Books (clé embarquée), prix papier lu sur la page produit d'Amazon.fr (module isolé, désactivable par AMAZON_PRICE_ENABLED, extension seulement, mémorisé 7 jours en cas de succès seulement).
- Relais du service worker et permissions d'hôte étendus (Amazon.fr /dp/, Google Books v1) ; fiche WikiHow « Livres » v3.
- Hors périmètre : recherche Google Books dans « Changer de livre » ; prix Fnac/Decitre (bloqués).

Vérifié : typecheck, tests, build. Reste la vérification manuelle dans Chrome ; APK à la demande.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --merge
```

- [ ] **Step 4 : Livrer en pré-prod (règle : sans demander après fusion)**

Run: `git switch main && git pull && npm run build && npm run preprod`
Expected: pre-release `preprod-N`. La production (`npm run promouvoir`) n'est **jamais** lancée sans ordre explicite de l'utilisateur. Si `git pull` est bloqué par des fichiers non suivis d'une autre session, comparer avant de supprimer (`git show origin/main:<fichier> | diff - <fichier>`), sauvegarder hors du dépôt, puis retirer seulement les copies identiques.
