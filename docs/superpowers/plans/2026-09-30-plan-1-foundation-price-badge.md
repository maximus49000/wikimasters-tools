# Wikimasters Tools — Plan 1 : fondation et badge de prix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer une extension Chrome (MV3) qui, sur wiki-masters.com, affiche sous chaque carte déjà achetée ou vendue par l'utilisateur un badge de prix calculé localement à partir de ses propres transactions.

**Architecture:** Un client d'API (`GameApi`) à débit régulé et à réponses validées par zod, un cache à durée de vie (`TtlCache`) au-dessus de `chrome.storage.local`, une couche `DataSource` qui produit un `PriceBook` (statistiques par carte), et un content script qui repère les cartes dans le DOM par leur titre puis injecte un badge React dans un shadow DOM.

**Tech Stack:** TypeScript strict, WXT (Manifest V3), React 19, zod 4, Vitest 5 (+ jsdom), npm.

**Spec:** `docs/superpowers/specs/2026-09-30-wikimasters-tools-design.md`

## Global Constraints

- Node.js **≥ 22.12** (exigé par WXT et Vitest). Vérifier avec `node -v` avant de commencer.
- L'outil est **non officiel et en lecture seule** : aucune enchère, mise, vente, ouverture de pack ni action automatique. Aucun multi-compte.
- **Aucun appel à `/api/marketplace/cards/{id}/sales`** : c'est la fonction payante « Vue du marché PRO » du jeu.
- Source des prix V1 : uniquement `history` (ventes) et `won` (achats) de `GET /api/marketplace?page=1&limit=1&mine=1`, avec `status = settled_sold` et `final_price` non nul.
- Clé de comparaison d'un prix : `card_id` + `rarity` (`snapshot_rarity`) + `is_shiny`. `atk` et `def` ne comptent pas.
- Statistiques : médiane, min, max, nombre de transactions, tendance ; N = 20 dernières transactions maximum, fenêtre 60 jours par défaut ; « peu de données » sous 3 transactions ; aucune transaction = aucun badge (jamais de prix inventé).
- Cache : 12 h par défaut, nouvelle tentative 5 min après un échec.
- Débit vers le jeu : file séquentielle, 1000 ms minimum entre deux requêtes, backoff exponentiel sur HTTP 429 (base 2000 ms, 3 nouvelles tentatives, `Retry-After` respecté).
- Aucune donnée (cookie, jeton, transaction) ne quitte le navigateur. Permission d'extension : `storage` uniquement.
- Badges rendus dans un **shadow DOM** ; si un point d'injection est introuvable, ne rien rendre.
- Interface en français.
- Les fixtures de tests sont **anonymisées** : aucun vrai identifiant ni pseudo de joueur dans le dépôt.
- Chaque message de commit se termine par le trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (deuxième `-m`, comme dans les étapes ci-dessous).

## Plans suivants (hors de ce plan)

Plan 2 : marché (bonne affaire, prix conseillé, courbe). Plan 3 : collection (valeur estimée, doublons ; nécessite de capturer la forme de `GET /api/my-collection`). Plan 4 : suivi (alertes de fin d'enchère, bilan achats/ventes, tableau de bord popup). Chacun aura son propre plan.

## File Structure

```
package.json, tsconfig.json, wxt.config.ts, vitest.config.ts, .gitignore, README.md
src/
  core/
    api/errors.ts            erreurs typées (HTTP, format, non connecté)
    api/schemas.ts           schémas zod + parseMineResponse
    api/game-api.ts          client à débit régulé (getMine)
    cache/store.ts           KeyValueStore (mémoire, chrome.storage.local)
    cache/ttl-cache.ts       cache TTL, échec/reprise, dédoublonnage
    pricing/observations.ts  extractObservations (history/won -> observations)
    pricing/stats.ts         median, computeStats
    pricing/price-book.ts    normalizeTitle, buildPriceBook
    pricing/badge.ts         toBadgeModel (texte du badge)
    data-source.ts           createDataSource -> getMyPriceBook
  content/
    card-finder.ts           repère les cartes dans le DOM par leur titre
    decorate.ts              orchestre repérage + montage, idempotent
    PriceBadge.tsx           composant React du badge
    mount.tsx                crée l'hôte + shadow root + racine React
  entrypoints/
    content.tsx              content script WXT
tests/
  fixtures/mine-response.json
  core/api/schemas.test.ts, game-api.test.ts
  core/cache/store.test.ts, ttl-cache.test.ts
  core/pricing/observations.test.ts, stats.test.ts, price-book.test.ts, badge.test.ts
  core/data-source.test.ts
  content/card-finder.test.ts, decorate.test.ts
```

---

### Task 1 : Squelette du projet et schémas d'API (test de contrat)

**Files:**
- Create: `package.json`, `tsconfig.json`, `wxt.config.ts`, `vitest.config.ts`, `.gitignore`
- Create: `src/entrypoints/content.tsx` (stub, remplacé à la tâche 9)
- Create: `src/core/api/errors.ts`, `src/core/api/schemas.ts`
- Create: `tests/fixtures/mine-response.json`, `tests/core/api/schemas.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `ApiHttpError(status: number, endpoint: string)`, `ApiFormatError(endpoint: string, detail: string)`, `NotAuthenticatedError(endpoint: string)` (classes `Error`).
  - `MINE_ENDPOINT: string` = `'/api/marketplace?page=1&limit=1&mine=1'`.
  - `parseMineResponse(json: unknown): MineResponse` (lève `ApiFormatError`).
  - Types `MineResponse`, `Auction` (= `MineResponse['history'][number]`).

- [ ] **Step 1: Vérifier Node et initialiser git**

Run: `node -v`
Expected: `v22.12.0` ou plus. Sinon, s'arrêter et installer Node 22 LTS.

Run (à la racine `C:\Users\maxim\Downloads\Wikimasters tools`) :
```bash
git init
```
Expected: `Initialized empty Git repository`.

- [ ] **Step 2: Créer les fichiers de configuration**

`package.json` :
```json
{
  "name": "wikimasters-tools",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Extension Chrome non officielle et en lecture seule pour wiki-masters.com",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "postinstall": "wxt prepare",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@types/chrome": "^0.3.4",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@wxt-dev/module-react": "^1.2.2",
    "jsdom": "^30.1.1",
    "typescript": "^5.9.0",
    "vitest": "^5.0.2",
    "wxt": "^0.21.4"
  }
}
```

`wxt.config.ts` :
```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Wikimasters Tools (non officiel)',
    description:
      'Outils en lecture seule pour WikiMasters : prix estimés à partir de vos propres transactions.',
    permissions: ['storage'],
  },
});
```

`tsconfig.json` :
```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "strict": true
  },
  "include": ["src", "tests", ".wxt/wxt.d.ts"]
}
```

`vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
```

`.gitignore` :
```
node_modules
.output
.wxt
*.log
```

`src/entrypoints/content.tsx` (stub minimal pour que WXT ait un point d'entrée) :
```tsx
export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  main() {},
});
```

- [ ] **Step 3: Installer les dépendances**

Run: `npm install`
Expected: installation sans erreur ; le script `postinstall` exécute `wxt prepare` et crée `.wxt/`. Si npm signale une version introuvable, ajuster le numéro dans `package.json` sur la dernière version publiée (`npm view <paquet> version`) et relancer.

- [ ] **Step 4: Créer la fixture anonymisée**

`tests/fixtures/mine-response.json` (forme réelle de la réponse, identifiants et titres fictifs) :
```json
{
  "selling": [],
  "bidding": [],
  "history": [
    {
      "id": "a0000000-0000-4000-8000-000000000001",
      "card": {
        "id": "c0000000-0000-4000-8000-000000000001",
        "atk": 7324,
        "def": 5450,
        "lang": "fr",
        "rarity": "UR",
        "q_score": 36.37,
        "category": "catégorie d'exemple",
        "image_url": null,
        "pageviews": 6447,
        "created_at": "2026-05-01T12:38:25.295795+00:00",
        "hide_image": false,
        "wikipedia_url": "https://fr.wikipedia.org/wiki/Exemple_Un",
        "wikipedia_title": "Exemple Un",
        "is_shiny": false
      },
      "end_at": "2026-09-29T06:53:05.367288+00:00",
      "seller": { "id": "b0000000-0000-4000-8000-000000000001", "username": "joueur-moi", "avatar_url": null, "avatar_pos_x": 50, "avatar_pos_y": 50 },
      "status": "settled_sold",
      "winner": { "id": "b0000000-0000-4000-8000-000000000002", "username": "joueur-acheteur", "avatar_url": null, "avatar_pos_x": 50, "avatar_pos_y": 50 },
      "card_id": "c0000000-0000-4000-8000-000000000001",
      "is_shiny": false,
      "seller_id": "b0000000-0000-4000-8000-000000000001",
      "winner_id": "b0000000-0000-4000-8000-000000000002",
      "created_at": "2026-09-28T18:53:05.367288+00:00",
      "settled_at": "2026-09-29T06:53:08.09808+00:00",
      "base_amount": 10,
      "current_bid": 11,
      "final_price": 11,
      "snapshot_atk": 7324,
      "snapshot_def": 5450,
      "effective_bid": 11,
      "current_bidder": { "id": "b0000000-0000-4000-8000-000000000002", "username": "joueur-acheteur", "avatar_url": null, "avatar_pos_x": 50, "avatar_pos_y": 50 },
      "snapshot_rarity": "UR",
      "base_repriced_at": null,
      "current_bidder_id": "b0000000-0000-4000-8000-000000000002",
      "listing_base_amount": 10,
      "owned": false
    },
    {
      "id": "a0000000-0000-4000-8000-000000000002",
      "card": {
        "id": "c0000000-0000-4000-8000-000000000002",
        "atk": 6319,
        "def": 5197,
        "lang": "fr",
        "rarity": "SR",
        "q_score": 33.6,
        "category": null,
        "image_url": null,
        "pageviews": 1071,
        "created_at": "2026-04-22T18:17:47.010783+00:00",
        "hide_image": false,
        "wikipedia_url": "https://fr.wikipedia.org/wiki/Exemple_Deux",
        "wikipedia_title": "Exemple Deux",
        "is_shiny": false
      },
      "end_at": "2026-09-29T18:50:05.909165+00:00",
      "seller": { "id": "b0000000-0000-4000-8000-000000000001", "username": "joueur-moi", "avatar_url": null, "avatar_pos_x": 50, "avatar_pos_y": 50 },
      "status": "settled_unsold",
      "winner": null,
      "card_id": "c0000000-0000-4000-8000-000000000002",
      "is_shiny": false,
      "seller_id": "b0000000-0000-4000-8000-000000000001",
      "winner_id": null,
      "created_at": "2026-09-29T12:50:05.909165+00:00",
      "settled_at": "2026-09-29T18:50:10.543656+00:00",
      "base_amount": 10,
      "current_bid": null,
      "final_price": null,
      "snapshot_atk": 6319,
      "snapshot_def": 5197,
      "effective_bid": 10,
      "current_bidder": null,
      "snapshot_rarity": "SR",
      "base_repriced_at": null,
      "current_bidder_id": null,
      "listing_base_amount": 10,
      "owned": true
    }
  ],
  "won": [
    {
      "id": "a0000000-0000-4000-8000-000000000003",
      "card": {
        "id": "c0000000-0000-4000-8000-000000000003",
        "atk": 3066,
        "def": 3125,
        "lang": "fr",
        "rarity": "PC",
        "q_score": 14.39,
        "category": "grand magasin d'exemple",
        "image_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Exemple.jpg/330px-Exemple.jpg",
        "pageviews": 108,
        "created_at": "2026-04-20T20:57:33.476977+00:00",
        "hide_image": false,
        "wikipedia_url": "https://fr.wikipedia.org/wiki/Exemple_Trois",
        "wikipedia_title": "Exemple Trois",
        "is_shiny": false
      },
      "end_at": "2026-09-29T18:39:57.064992+00:00",
      "seller": { "id": "b0000000-0000-4000-8000-000000000003", "username": "joueur-vendeur", "avatar_url": null, "avatar_pos_x": 50, "avatar_pos_y": 50 },
      "status": "settled_sold",
      "winner": { "id": "b0000000-0000-4000-8000-000000000001", "username": "joueur-moi", "avatar_url": null, "avatar_pos_x": 50, "avatar_pos_y": 50 },
      "card_id": "c0000000-0000-4000-8000-000000000003",
      "is_shiny": false,
      "seller_id": "b0000000-0000-4000-8000-000000000003",
      "winner_id": "b0000000-0000-4000-8000-000000000001",
      "created_at": "2026-09-29T15:39:57.064992+00:00",
      "settled_at": "2026-09-29T18:40:01.897162+00:00",
      "base_amount": 10,
      "current_bid": 20,
      "final_price": 20,
      "snapshot_atk": 3066,
      "snapshot_def": 3125,
      "effective_bid": 20,
      "current_bidder": { "id": "b0000000-0000-4000-8000-000000000001", "username": "joueur-moi", "avatar_url": null, "avatar_pos_x": 50, "avatar_pos_y": 50 },
      "snapshot_rarity": "PC",
      "base_repriced_at": null,
      "current_bidder_id": "b0000000-0000-4000-8000-000000000001",
      "listing_base_amount": 10,
      "owned": true
    }
  ],
  "maxConcurrentAuctions": 5,
  "mine": true
}
```

- [ ] **Step 5: Écrire le test qui échoue**

`tests/core/api/schemas.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/mine-response.json';
import { ApiFormatError } from '../../../src/core/api/errors';
import { parseMineResponse } from '../../../src/core/api/schemas';

describe('parseMineResponse', () => {
  it('accepte une réponse de forme réelle', () => {
    const parsed = parseMineResponse(fixture);
    expect(parsed.history).toHaveLength(2);
    expect(parsed.won).toHaveLength(1);
    expect(parsed.maxConcurrentAuctions).toBe(5);
    expect(parsed.history[0].card.wikipedia_title).toBe('Exemple Un');
  });

  it('rejette une réponse où final_price est absent', () => {
    const broken = structuredClone(fixture) as any;
    delete broken.history[0].final_price;
    expect(() => parseMineResponse(broken)).toThrow(ApiFormatError);
    expect(() => parseMineResponse(broken)).toThrow(/final_price/);
  });

  it("rejette ce qui n'est pas un objet", () => {
    expect(() => parseMineResponse('nope')).toThrow(ApiFormatError);
  });

  it('conserve une rareté inconnue au lieu de rejeter', () => {
    const changed = structuredClone(fixture) as any;
    changed.won[0].snapshot_rarity = 'MYTHIC';
    expect(parseMineResponse(changed).won[0].snapshot_rarity).toBe('MYTHIC');
  });
});
```

- [ ] **Step 6: Vérifier que le test échoue**

Run: `npx vitest run tests/core/api/schemas.test.ts`
Expected: FAIL (`Cannot find module '../../../src/core/api/errors'` ou équivalent).

- [ ] **Step 7: Implémenter les erreurs et les schémas**

`src/core/api/errors.ts` :
```ts
export class ApiHttpError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(status: number, endpoint: string) {
    super(`HTTP ${status} pour ${endpoint}`);
    this.name = 'ApiHttpError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

export class ApiFormatError extends Error {
  readonly endpoint: string;
  readonly detail: string;

  constructor(endpoint: string, detail: string) {
    super(`Format inattendu pour ${endpoint} : ${detail}`);
    this.name = 'ApiFormatError';
    this.endpoint = endpoint;
    this.detail = detail;
  }
}

export class NotAuthenticatedError extends Error {
  readonly endpoint: string;

  constructor(endpoint: string) {
    super(`Non connecté (accès refusé à ${endpoint})`);
    this.name = 'NotAuthenticatedError';
    this.endpoint = endpoint;
  }
}
```

`src/core/api/schemas.ts` :
```ts
import { z } from 'zod';
import { ApiFormatError } from './errors';

export const MINE_ENDPOINT = '/api/marketplace?page=1&limit=1&mine=1';

// On ne déclare que les champs utilisés. Les champs inconnus sont ignorés,
// et la rareté reste une chaîne libre pour ne pas casser si le jeu en ajoute.
const cardSchema = z.object({
  id: z.string(),
  wikipedia_title: z.string(),
  rarity: z.string(),
  is_shiny: z.boolean(),
});

const auctionSchema = z.object({
  id: z.string(),
  card_id: z.string(),
  status: z.string(),
  snapshot_rarity: z.string(),
  is_shiny: z.boolean(),
  base_amount: z.number(),
  final_price: z.number().nullable(),
  created_at: z.string(),
  end_at: z.string(),
  settled_at: z.string().nullable(),
  seller_id: z.string(),
  winner_id: z.string().nullable(),
  card: cardSchema,
});

const mineResponseSchema = z.object({
  selling: z.array(auctionSchema),
  bidding: z.array(auctionSchema),
  history: z.array(auctionSchema),
  won: z.array(auctionSchema),
  maxConcurrentAuctions: z.number(),
});

export type MineResponse = z.infer<typeof mineResponseSchema>;
export type Auction = MineResponse['history'][number];

export function parseMineResponse(json: unknown): MineResponse {
  const result = mineResponseSchema.safeParse(json);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.map(String).join('.') || '(racine)'} : ${issue.message}`)
      .join(' ; ');
    throw new ApiFormatError(MINE_ENDPOINT, detail);
  }
  return result.data;
}
```

- [ ] **Step 8: Vérifier que les tests passent, ainsi que le typage et le build**

Run: `npx vitest run tests/core/api/schemas.test.ts`
Expected: PASS (4 tests).

Run: `npm run typecheck`
Expected: aucune erreur.

Run: `npm run build`
Expected: build réussi, dossier `.output/chrome-mv3/` créé.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: squelette WXT + schémas d'API validés par test de contrat" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2 : Observations de prix et statistiques

**Files:**
- Create: `src/core/pricing/observations.ts`, `src/core/pricing/stats.ts`
- Test: `tests/core/pricing/observations.test.ts`, `tests/core/pricing/stats.test.ts`

**Interfaces:**
- Consumes: `MineResponse` (tâche 1).
- Produces:
  - `type PriceObservation = { auctionId: string; cardId: string; title: string; rarity: string; isShiny: boolean; price: number; at: string; kind: 'sold' | 'bought' }`
  - `extractObservations(mine: MineResponse): PriceObservation[]`
  - `type PriceStats = { count: number; median: number | null; min: number | null; max: number | null; trend: 'up' | 'down' | 'flat' | null; reliability: 'none' | 'low' | 'ok' }`
  - `type StatsOptions = { maxSales?: number; windowDays?: number; now?: Date }`
  - `median(values: number[]): number`
  - `computeStats(observations: PriceObservation[], options?: StatsOptions): PriceStats`

- [ ] **Step 1: Écrire le test des observations (échoue)**

`tests/core/pricing/observations.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/mine-response.json';
import { parseMineResponse } from '../../../src/core/api/schemas';
import { extractObservations } from '../../../src/core/pricing/observations';

describe('extractObservations', () => {
  it('garde les ventes et achats conclus, pas les invendus', () => {
    const observations = extractObservations(parseMineResponse(fixture));
    expect(observations).toEqual([
      {
        auctionId: 'a0000000-0000-4000-8000-000000000001',
        cardId: 'c0000000-0000-4000-8000-000000000001',
        title: 'Exemple Un',
        rarity: 'UR',
        isShiny: false,
        price: 11,
        at: '2026-09-29T06:53:08.09808+00:00',
        kind: 'sold',
      },
      {
        auctionId: 'a0000000-0000-4000-8000-000000000003',
        cardId: 'c0000000-0000-4000-8000-000000000003',
        title: 'Exemple Trois',
        rarity: 'PC',
        isShiny: false,
        price: 20,
        at: '2026-09-29T18:40:01.897162+00:00',
        kind: 'bought',
      },
    ]);
  });

  it('ne compte pas deux fois la même enchère', () => {
    const mine = parseMineResponse(fixture);
    mine.won.push(mine.history[0]);
    const ids = extractObservations(mine).map((o) => o.auctionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/pricing/observations.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `observations.ts`**

`src/core/pricing/observations.ts` :
```ts
import type { Auction, MineResponse } from '../api/schemas';

export type PriceObservation = {
  auctionId: string;
  cardId: string;
  title: string;
  rarity: string;
  isShiny: boolean;
  price: number;
  at: string;
  kind: 'sold' | 'bought';
};

function toObservation(auction: Auction, kind: 'sold' | 'bought'): PriceObservation | null {
  if (auction.status !== 'settled_sold' || auction.final_price === null) return null;
  return {
    auctionId: auction.id,
    cardId: auction.card_id,
    title: auction.card.wikipedia_title,
    rarity: auction.snapshot_rarity,
    isShiny: auction.is_shiny,
    price: auction.final_price,
    at: auction.settled_at ?? auction.end_at,
    kind,
  };
}

export function extractObservations(mine: MineResponse): PriceObservation[] {
  const seen = new Set<string>();
  const observations: PriceObservation[] = [];
  const collect = (auctions: Auction[], kind: 'sold' | 'bought') => {
    for (const auction of auctions) {
      const observation = toObservation(auction, kind);
      if (observation && !seen.has(observation.auctionId)) {
        seen.add(observation.auctionId);
        observations.push(observation);
      }
    }
  };
  collect(mine.history, 'sold');
  collect(mine.won, 'bought');
  return observations;
}
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `npx vitest run tests/core/pricing/observations.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Écrire le test des statistiques (échoue)**

`tests/core/pricing/stats.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import type { PriceObservation } from '../../../src/core/pricing/observations';
import { computeStats, median } from '../../../src/core/pricing/stats';

const NOW = new Date('2026-09-30T12:00:00Z');
const DAY = 86_400_000;

function obs(price: number, daysAgo: number): PriceObservation {
  return {
    auctionId: `a-${price}-${daysAgo}-${Math.random()}`,
    cardId: 'c1',
    title: 'Exemple',
    rarity: 'SR',
    isShiny: false,
    price,
    at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    kind: 'sold',
  };
}

describe('median', () => {
  it('prend la valeur centrale (nombre impair)', () => {
    expect(median([30, 10, 20])).toBe(20);
  });
  it('arrondit la moyenne des deux valeurs centrales (nombre pair)', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([10, 11])).toBe(11);
  });
});

describe('computeStats', () => {
  it("renvoie « aucune donnée » sans transaction", () => {
    expect(computeStats([], { now: NOW })).toEqual({
      count: 0, median: null, min: null, max: null, trend: null, reliability: 'none',
    });
  });

  it('marque une seule transaction comme peu fiable', () => {
    expect(computeStats([obs(11, 1)], { now: NOW })).toEqual({
      count: 1, median: 11, min: 11, max: 11, trend: null, reliability: 'low',
    });
  });

  it('calcule médiane, min, max et fiabilité correcte à partir de 3 transactions', () => {
    const stats = computeStats([obs(10, 1), obs(30, 2), obs(20, 3)], { now: NOW });
    expect(stats).toMatchObject({ count: 3, median: 20, min: 10, max: 30, reliability: 'ok', trend: null });
  });

  it('ignore les transactions hors de la fenêtre de temps', () => {
    const stats = computeStats([obs(10, 1), obs(999, 200)], { now: NOW, windowDays: 60 });
    expect(stats.count).toBe(1);
    expect(stats.max).toBe(10);
  });

  it('ne garde que les N transactions les plus récentes', () => {
    const recent = Array.from({ length: 20 }, (_, i) => obs(10, i + 1));
    const old = Array.from({ length: 5 }, () => obs(100, 40));
    const stats = computeStats([...old, ...recent], { now: NOW, maxSales: 20 });
    expect(stats.count).toBe(20);
    expect(stats.median).toBe(10);
  });

  it('détecte une tendance à la hausse', () => {
    const stats = computeStats([obs(22, 1), obs(20, 2), obs(10, 3), obs(10, 4)], { now: NOW });
    expect(stats.trend).toBe('up');
  });

  it('détecte une tendance à la baisse', () => {
    const stats = computeStats([obs(10, 1), obs(10, 2), obs(20, 3), obs(22, 4)], { now: NOW });
    expect(stats.trend).toBe('down');
  });

  it('détecte une tendance stable', () => {
    const stats = computeStats([obs(10, 1), obs(10, 2), obs(10, 3), obs(10, 4)], { now: NOW });
    expect(stats.trend).toBe('flat');
  });
});
```

- [ ] **Step 6: Vérifier l'échec**

Run: `npx vitest run tests/core/pricing/stats.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 7: Implémenter `stats.ts`**

`src/core/pricing/stats.ts` :
```ts
import type { PriceObservation } from './observations';

export type PriceStats = {
  count: number;
  median: number | null;
  min: number | null;
  max: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  reliability: 'none' | 'low' | 'ok';
};

export type StatsOptions = {
  maxSales?: number;
  windowDays?: number;
  now?: Date;
};

const DAY_MS = 86_400_000;
const TREND_THRESHOLD = 0.1;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function trendOf(newestFirst: number[]): PriceStats['trend'] {
  if (newestFirst.length < 4) return null;
  const recentCount = Math.ceil(newestFirst.length / 2);
  const recent = median(newestFirst.slice(0, recentCount));
  const previous = median(newestFirst.slice(recentCount));
  if (recent > previous * (1 + TREND_THRESHOLD)) return 'up';
  if (recent < previous * (1 - TREND_THRESHOLD)) return 'down';
  return 'flat';
}

export function computeStats(
  observations: PriceObservation[],
  options: StatsOptions = {},
): PriceStats {
  const { maxSales = 20, windowDays = 60, now = new Date() } = options;
  const cutoff = now.getTime() - windowDays * DAY_MS;
  const kept = observations
    .filter((o) => Date.parse(o.at) >= cutoff)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, maxSales);

  if (kept.length === 0) {
    return { count: 0, median: null, min: null, max: null, trend: null, reliability: 'none' };
  }

  const prices = kept.map((o) => o.price);
  return {
    count: prices.length,
    median: median(prices),
    min: Math.min(...prices),
    max: Math.max(...prices),
    trend: trendOf(prices),
    reliability: prices.length < 3 ? 'low' : 'ok',
  };
}
```

- [ ] **Step 8: Vérifier que tout passe**

Run: `npx vitest run tests/core/pricing`
Expected: PASS (observations + stats).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: observations de prix et statistiques (médiane, tendance)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : PriceBook et texte du badge

**Files:**
- Create: `src/core/pricing/price-book.ts`, `src/core/pricing/badge.ts`
- Test: `tests/core/pricing/price-book.test.ts`, `tests/core/pricing/badge.test.ts`

**Interfaces:**
- Consumes: `PriceObservation` (tâche 2), `computeStats`, `PriceStats`, `StatsOptions` (tâche 2).
- Produces:
  - `normalizeTitle(title: string): string`
  - `type PriceBookEntry = { cardId: string; rarity: string; isShiny: boolean; stats: PriceStats }`
  - `type PriceBook = { byTitle(title: string): PriceBookEntry | null }`
  - `buildPriceBook(observations: PriceObservation[], options?: StatsOptions): PriceBook` — renvoie `null` pour un titre inconnu **ou ambigu** (plusieurs combinaisons carte/rareté/brillance sous le même titre).
  - `type BadgeModel = { label: string; detail: string; tone: 'ok' | 'low'; tooltip: string }`
  - `toBadgeModel(stats: PriceStats): BadgeModel | null` (`null` si aucune donnée).

- [ ] **Step 1: Écrire le test du PriceBook (échoue)**

`tests/core/pricing/price-book.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import type { PriceObservation } from '../../../src/core/pricing/observations';
import { buildPriceBook, normalizeTitle } from '../../../src/core/pricing/price-book';

const NOW = new Date('2026-09-30T12:00:00Z');

function obs(partial: Partial<PriceObservation> & { price: number }): PriceObservation {
  return {
    auctionId: `a-${Math.random()}`,
    cardId: 'c1',
    title: 'Mad Max',
    rarity: 'SR',
    isShiny: false,
    at: '2026-09-29T12:00:00Z',
    kind: 'sold',
    ...partial,
  };
}

describe('normalizeTitle', () => {
  it('compacte les espaces et normalise Unicode', () => {
    expect(normalizeTitle('  Mad   Max ')).toBe('Mad Max');
    expect(normalizeTitle('E\u0301lections')).toBe('\u00c9lections');
  });
});

describe('buildPriceBook', () => {
  it('renvoie les statistiques de la carte connue', () => {
    const book = buildPriceBook([obs({ price: 10 }), obs({ price: 20 }), obs({ price: 30 })], { now: NOW });
    const entry = book.byTitle('Mad Max');
    expect(entry).toMatchObject({ cardId: 'c1', rarity: 'SR', isShiny: false });
    expect(entry?.stats.median).toBe(20);
  });

  it('retrouve un titre malgré des espaces différents', () => {
    const book = buildPriceBook([obs({ price: 10 })], { now: NOW });
    expect(book.byTitle('  Mad  Max')).not.toBeNull();
  });

  it('renvoie null pour un titre inconnu', () => {
    const book = buildPriceBook([obs({ price: 10 })], { now: NOW });
    expect(book.byTitle('Inconnu')).toBeNull();
  });

  it("renvoie null quand un titre est ambigu (brillante et normale)", () => {
    const book = buildPriceBook(
      [obs({ price: 10, isShiny: false }), obs({ price: 90, isShiny: true })],
      { now: NOW },
    );
    expect(book.byTitle('Mad Max')).toBeNull();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/pricing/price-book.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `price-book.ts`**

`src/core/pricing/price-book.ts` :
```ts
import type { PriceObservation } from './observations';
import { computeStats, type PriceStats, type StatsOptions } from './stats';

export type PriceBookEntry = {
  cardId: string;
  rarity: string;
  isShiny: boolean;
  stats: PriceStats;
};

export type PriceBook = {
  byTitle(title: string): PriceBookEntry | null;
};

export function normalizeTitle(title: string): string {
  return title.normalize('NFC').replace(/\s+/g, ' ').trim();
}

function keyOf(o: PriceObservation): string {
  return `${o.cardId}|${o.rarity}|${o.isShiny ? 1 : 0}`;
}

export function buildPriceBook(
  observations: PriceObservation[],
  options: StatsOptions = {},
): PriceBook {
  const byTitle = new Map<string, Map<string, PriceObservation[]>>();
  for (const o of observations) {
    const title = normalizeTitle(o.title);
    const groups = byTitle.get(title) ?? new Map<string, PriceObservation[]>();
    const key = keyOf(o);
    groups.set(key, [...(groups.get(key) ?? []), o]);
    byTitle.set(title, groups);
  }

  return {
    byTitle(title: string): PriceBookEntry | null {
      const groups = byTitle.get(normalizeTitle(title));
      // Titre inconnu, ou ambigu : on préfère ne rien afficher plutôt qu'un mauvais prix.
      if (!groups || groups.size !== 1) return null;
      const [group] = [...groups.values()];
      const first = group[0];
      return {
        cardId: first.cardId,
        rarity: first.rarity,
        isShiny: first.isShiny,
        stats: computeStats(group, options),
      };
    },
  };
}
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `npx vitest run tests/core/pricing/price-book.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Écrire le test du badge (échoue)**

`tests/core/pricing/badge.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { toBadgeModel } from '../../../src/core/pricing/badge';
import type { PriceStats } from '../../../src/core/pricing/stats';

const base: PriceStats = { count: 0, median: null, min: null, max: null, trend: null, reliability: 'none' };

describe('toBadgeModel', () => {
  it("ne rend rien quand il n'y a aucune donnée", () => {
    expect(toBadgeModel(base)).toBeNull();
  });

  it('affiche un badge peu fiable pour une seule transaction', () => {
    const model = toBadgeModel({ ...base, count: 1, median: 11, min: 11, max: 11, reliability: 'low' });
    expect(model).toMatchObject({
      label: '11 WB',
      detail: '1 transaction · peu de données',
      tone: 'low',
    });
    expect(model?.tooltip).toContain('non officiel');
  });

  it('accorde « transactions » au pluriel pour un badge peu fiable', () => {
    const model = toBadgeModel({ ...base, count: 2, median: 5, min: 3, max: 6, reliability: 'low' });
    expect(model?.detail).toBe('2 transactions · peu de données');
  });

  it('affiche fourchette et tendance quand les données sont fiables', () => {
    const model = toBadgeModel({ ...base, count: 5, median: 15, min: 12, max: 20, trend: 'up', reliability: 'ok' });
    expect(model).toMatchObject({ label: '15 WB', detail: '12–20 · 5 transactions ▲', tone: 'ok' });
  });

  it('affiche une flèche vers le bas', () => {
    const model = toBadgeModel({ ...base, count: 4, median: 9, min: 5, max: 12, trend: 'down', reliability: 'ok' });
    expect(model?.detail).toBe('5–12 · 4 transactions ▼');
  });

  it("n'affiche pas de flèche quand la tendance est stable", () => {
    const model = toBadgeModel({ ...base, count: 5, median: 15, min: 12, max: 20, trend: 'flat', reliability: 'ok' });
    expect(model?.detail).toBe('12–20 · 5 transactions');
  });
});
```

- [ ] **Step 6: Vérifier l'échec**

Run: `npx vitest run tests/core/pricing/badge.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 7: Implémenter `badge.ts`**

`src/core/pricing/badge.ts` :
```ts
import type { PriceStats } from './stats';

export type BadgeModel = {
  label: string;
  detail: string;
  tone: 'ok' | 'low';
  tooltip: string;
};

const TREND_ARROW = { up: '▲', down: '▼' } as const;

function plural(count: number): string {
  return `${count} ${count === 1 ? 'transaction' : 'transactions'}`;
}

export function toBadgeModel(stats: PriceStats): BadgeModel | null {
  if (stats.reliability === 'none' || stats.median === null) return null;

  const label = `${stats.median} WB`;
  const tooltip =
    `Médiane de vos ${plural(stats.count)} (ventes et achats) sur cette carte. ` +
    'Calcul local, outil non officiel.';

  if (stats.reliability === 'low') {
    return { label, detail: `${plural(stats.count)} · peu de données`, tone: 'low', tooltip };
  }

  const arrow = stats.trend === 'up' || stats.trend === 'down' ? ` ${TREND_ARROW[stats.trend]}` : '';
  return {
    label,
    detail: `${stats.min}–${stats.max} · ${plural(stats.count)}${arrow}`,
    tone: 'ok',
    tooltip,
  };
}
```

- [ ] **Step 8: Vérifier que tout passe**

Run: `npx vitest run tests/core/pricing`
Expected: PASS (observations, stats, price-book, badge).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: PriceBook par titre et texte du badge" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : Client d'API à débit régulé (`GameApi`)

**Files:**
- Create: `src/core/api/game-api.ts`
- Test: `tests/core/api/game-api.test.ts`

**Interfaces:**
- Consumes: `MINE_ENDPOINT`, `parseMineResponse`, `MineResponse` (tâche 1) ; `ApiHttpError`, `ApiFormatError`, `NotAuthenticatedError` (tâche 1).
- Produces:
  - `type FetchLike = (input: string, init?: RequestInit) => Promise<Response>`
  - `type GameApiOptions = { fetch: FetchLike; sleep?: (ms: number) => Promise<void>; now?: () => number; minIntervalMs?: number; maxRetries?: number; baseBackoffMs?: number }`
  - `createGameApi(options: GameApiOptions): { getMine(): Promise<MineResponse> }`
  - `type GameApi = ReturnType<typeof createGameApi>`

- [ ] **Step 1: Écrire le test (échoue)**

`tests/core/api/game-api.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/mine-response.json';
import { ApiFormatError, ApiHttpError, NotAuthenticatedError } from '../../../src/core/api/errors';
import { createGameApi, type FetchLike } from '../../../src/core/api/game-api';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function setup(responses: Response[], options: { minIntervalMs?: number } = {}) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const queue = [...responses];
  const fetch: FetchLike = async (input) => {
    calls.push(input);
    const next = queue.shift();
    if (!next) throw new Error('plus de réponse simulée');
    return next;
  };
  const api = createGameApi({
    fetch,
    sleep: async (ms) => { sleeps.push(ms); },
    now: () => 0,
    minIntervalMs: options.minIntervalMs ?? 0,
  });
  return { api, calls, sleeps };
}

describe('createGameApi.getMine', () => {
  it("appelle l'endpoint mine=1 et renvoie la réponse validée", async () => {
    const { api, calls } = setup([json(fixture)]);
    const mine = await api.getMine();
    expect(calls).toEqual(['/api/marketplace?page=1&limit=1&mine=1']);
    expect(mine.history).toHaveLength(2);
  });

  it('attend puis réessaie après un 429 (backoff)', async () => {
    const { api, calls, sleeps } = setup([json({}, 429), json(fixture)]);
    await api.getMine();
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it('respecte Retry-After', async () => {
    const { api, sleeps } = setup([json({}, 429, { 'Retry-After': '3' }), json(fixture)]);
    await api.getMine();
    expect(sleeps).toEqual([3000]);
  });

  it('abandonne après 3 nouvelles tentatives avec un backoff exponentiel', async () => {
    const { api, calls, sleeps } = setup([json({}, 429), json({}, 429), json({}, 429), json({}, 429)]);
    await expect(api.getMine()).rejects.toMatchObject({ name: 'ApiHttpError', status: 429 });
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([2000, 4000, 8000]);
  });

  it('signale un utilisateur non connecté (401/403)', async () => {
    const { api } = setup([json({}, 401)]);
    await expect(api.getMine()).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it('remonte les autres erreurs HTTP', async () => {
    const { api } = setup([json({}, 500)]);
    await expect(api.getMine()).rejects.toBeInstanceOf(ApiHttpError);
  });

  it('rejette une réponse au format inattendu', async () => {
    const { api } = setup([json({ nope: true })]);
    await expect(api.getMine()).rejects.toBeInstanceOf(ApiFormatError);
  });

  it('rejette une réponse qui n’est pas du JSON', async () => {
    const { api } = setup([new Response('<html>', { status: 200 })]);
    await expect(api.getMine()).rejects.toBeInstanceOf(ApiFormatError);
  });

  it('espace deux requêtes consécutives d’au moins minIntervalMs', async () => {
    const { api, sleeps } = setup([json(fixture), json(fixture)], { minIntervalMs: 1000 });
    await api.getMine();
    await api.getMine();
    expect(sleeps).toEqual([1000]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/api/game-api.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `game-api.ts`**

`src/core/api/game-api.ts` :
```ts
import { ApiFormatError, ApiHttpError, NotAuthenticatedError } from './errors';
import { MINE_ENDPOINT, parseMineResponse, type MineResponse } from './schemas';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GameApiOptions = {
  fetch: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  minIntervalMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
};

export function createGameApi(options: GameApiOptions) {
  const {
    fetch: doFetch,
    sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
    minIntervalMs = 1000,
    maxRetries = 3,
    baseBackoffMs = 2000,
  } = options;

  let tail: Promise<unknown> = Promise.resolve();
  let lastStart: number | null = null;

  // Toutes les requêtes passent par une file séquentielle.
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  }

  async function requestJson(path: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const wait = lastStart === null ? 0 : Math.max(0, lastStart + minIntervalMs - now());
      if (wait > 0) await sleep(wait);
      lastStart = now();

      const response = await doFetch(path, { headers: { Accept: 'application/json' } });

      if (response.status === 401 || response.status === 403) {
        throw new NotAuthenticatedError(path);
      }
      if (response.status === 429) {
        if (attempt >= maxRetries) throw new ApiHttpError(429, path);
        const retryAfter = Number(response.headers.get('Retry-After'));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : baseBackoffMs * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new ApiHttpError(response.status, path);

      try {
        return await response.json();
      } catch {
        throw new ApiFormatError(path, 'réponse non JSON');
      }
    }
  }

  return {
    getMine: (): Promise<MineResponse> =>
      enqueue(async () => parseMineResponse(await requestJson(MINE_ENDPOINT))),
  };
}

export type GameApi = ReturnType<typeof createGameApi>;
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/core/api/game-api.test.ts`
Expected: PASS (9 tests).

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: client GameApi à débit régulé (429, Retry-After, file séquentielle)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : Stockage et cache à durée de vie

**Files:**
- Create: `src/core/cache/store.ts`, `src/core/cache/ttl-cache.ts`
- Test: `tests/core/cache/store.test.ts`, `tests/core/cache/ttl-cache.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `interface KeyValueStore { get<T>(key: string): Promise<T | undefined>; set<T>(key: string, value: T): Promise<void> }`
  - `createMemoryStore(): KeyValueStore`
  - `createChromeLocalStore(area?: StorageArea): KeyValueStore` (clés préfixées `wmt:`)
  - `type TtlCacheOptions = { ttlMs?: number; retryAfterFailureMs?: number; now?: () => number }`
  - `createTtlCache(store: KeyValueStore, options?: TtlCacheOptions): { getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> }`
  - `type TtlCache = ReturnType<typeof createTtlCache>`
  - `class CacheBackoffError extends Error`

- [ ] **Step 1: Écrire le test du stockage (échoue)**

`tests/core/cache/store.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { createChromeLocalStore, createMemoryStore } from '../../../src/core/cache/store';

describe('createMemoryStore', () => {
  it('relit ce qui a été écrit et renvoie undefined pour une clé absente', async () => {
    const store = createMemoryStore();
    expect(await store.get('x')).toBeUndefined();
    await store.set('x', { a: 1 });
    expect(await store.get('x')).toEqual({ a: 1 });
  });

  it('se comporte comme un stockage JSON (copie, pas de référence partagée)', async () => {
    const store = createMemoryStore();
    const value = { list: [1] };
    await store.set('x', value);
    value.list.push(2);
    expect(await store.get('x')).toEqual({ list: [1] });
  });
});

describe('createChromeLocalStore', () => {
  it('préfixe les clés et délègue à la zone de stockage', async () => {
    const backing: Record<string, unknown> = {};
    const area = {
      get: async (key: string) => (key in backing ? { [key]: backing[key] } : {}),
      set: async (items: Record<string, unknown>) => { Object.assign(backing, items); },
    };
    const store = createChromeLocalStore(area);
    expect(await store.get('prices')).toBeUndefined();
    await store.set('prices', [1, 2]);
    expect(backing).toEqual({ 'wmt:prices': [1, 2] });
    expect(await store.get('prices')).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/cache/store.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `store.ts`**

`src/core/cache/store.ts` :
```ts
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export function createMemoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    async get<T>(key: string) {
      const raw = data.get(key);
      return raw === undefined ? undefined : (JSON.parse(raw) as T);
    },
    async set<T>(key: string, value: T) {
      data.set(key, JSON.stringify(value));
    },
  };
}

type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

const PREFIX = 'wmt:';

export function createChromeLocalStore(
  area: StorageArea = chrome.storage.local as unknown as StorageArea,
): KeyValueStore {
  return {
    async get<T>(key: string) {
      const stored = await area.get(PREFIX + key);
      return stored[PREFIX + key] as T | undefined;
    },
    async set<T>(key: string, value: T) {
      await area.set({ [PREFIX + key]: value });
    },
  };
}
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `npx vitest run tests/core/cache/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Écrire le test du cache TTL (échoue)**

`tests/core/cache/ttl-cache.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { CacheBackoffError, createTtlCache } from '../../../src/core/cache/ttl-cache';

function setup() {
  let t = 0;
  const cache = createTtlCache(createMemoryStore(), {
    ttlMs: 1000,
    retryAfterFailureMs: 500,
    now: () => t,
  });
  return { cache, at: (value: number) => { t = value; } };
}

describe('createTtlCache', () => {
  it('sert le cache tant que la durée de vie n’est pas dépassée', async () => {
    const { cache, at } = setup();
    let calls = 0;
    const loader = async () => `v${++calls}`;
    expect(await cache.getOrLoad('k', loader)).toBe('v1');
    at(999);
    expect(await cache.getOrLoad('k', loader)).toBe('v1');
    expect(calls).toBe(1);
  });

  it('recharge après expiration', async () => {
    const { cache, at } = setup();
    let calls = 0;
    const loader = async () => `v${++calls}`;
    await cache.getOrLoad('k', loader);
    at(1000);
    expect(await cache.getOrLoad('k', loader)).toBe('v2');
  });

  it('sert la valeur périmée en cas d’échec et ne réessaie pas avant le délai', async () => {
    const { cache, at } = setup();
    let calls = 0;
    await cache.getOrLoad('k', async () => { calls++; return 'v1'; });
    const failing = async () => { calls++; throw new Error('réseau'); };
    at(1500);
    expect(await cache.getOrLoad('k', failing)).toBe('v1');
    expect(calls).toBe(2);
    at(1700);
    expect(await cache.getOrLoad('k', failing)).toBe('v1');
    expect(calls).toBe(2);
    at(2100);
    expect(await cache.getOrLoad('k', async () => { calls++; return 'v2'; })).toBe('v2');
    expect(calls).toBe(3);
  });

  it('propage l’erreur sans valeur en cache, puis bloque le délai de reprise', async () => {
    const { cache, at } = setup();
    let calls = 0;
    const failing = async () => { calls++; throw new Error('réseau'); };
    await expect(cache.getOrLoad('k', failing)).rejects.toThrow('réseau');
    at(100);
    await expect(cache.getOrLoad('k', failing)).rejects.toBeInstanceOf(CacheBackoffError);
    expect(calls).toBe(1);
    at(600);
    await expect(cache.getOrLoad('k', failing)).rejects.toThrow('réseau');
    expect(calls).toBe(2);
  });

  it('ne lance qu’un chargement pour des appels simultanés', async () => {
    const { cache } = setup();
    let calls = 0;
    const loader = async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'v';
    };
    const [a, b] = await Promise.all([cache.getOrLoad('k', loader), cache.getOrLoad('k', loader)]);
    expect([a, b]).toEqual(['v', 'v']);
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 6: Vérifier l'échec**

Run: `npx vitest run tests/core/cache/ttl-cache.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 7: Implémenter `ttl-cache.ts`**

`src/core/cache/ttl-cache.ts` :
```ts
import type { KeyValueStore } from './store';

export class CacheBackoffError extends Error {
  constructor() {
    super('Nouvelle tentative trop tôt après un échec précédent');
    this.name = 'CacheBackoffError';
  }
}

export type TtlCacheOptions = {
  ttlMs?: number;
  retryAfterFailureMs?: number;
  now?: () => number;
};

type Entry<T> = { value?: T; storedAt?: number; failedAt?: number };

export function createTtlCache(store: KeyValueStore, options: TtlCacheOptions = {}) {
  const {
    ttlMs = 12 * 3_600_000,
    retryAfterFailureMs = 5 * 60_000,
    now = () => Date.now(),
  } = options;
  const inflight = new Map<string, Promise<unknown>>();

  async function load<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const entry = (await store.get<Entry<T>>(key)) ?? {};
    const t = now();

    if (entry.value !== undefined && entry.storedAt !== undefined && t - entry.storedAt < ttlMs) {
      return entry.value;
    }
    if (entry.failedAt !== undefined && t - entry.failedAt < retryAfterFailureMs) {
      if (entry.value !== undefined) return entry.value;
      throw new CacheBackoffError();
    }

    try {
      const value = await loader();
      await store.set<Entry<T>>(key, { value, storedAt: t });
      return value;
    } catch (error) {
      await store.set<Entry<T>>(key, { ...entry, failedAt: t });
      if (entry.value !== undefined) return entry.value;
      throw error;
    }
  }

  return {
    getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
      const existing = inflight.get(key);
      if (existing) return existing as Promise<T>;
      const promise = load(key, loader).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },
  };
}

export type TtlCache = ReturnType<typeof createTtlCache>;
```

- [ ] **Step 8: Vérifier que tout passe**

Run: `npx vitest run tests/core/cache`
Expected: PASS (store + ttl-cache).

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: stockage clé-valeur et cache TTL (reprise après échec, dédoublonnage)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : `DataSource`

**Files:**
- Create: `src/core/data-source.ts`
- Test: `tests/core/data-source.test.ts`

**Interfaces:**
- Consumes: `GameApi` (tâche 4), `TtlCache` (tâche 5), `extractObservations`, `PriceObservation` (tâche 2), `buildPriceBook`, `PriceBook` (tâche 3).
- Produces:
  - `type DataSourceDeps = { api: Pick<GameApi, 'getMine'>; cache: TtlCache; now?: () => Date }`
  - `interface DataSource { getMyPriceBook(): Promise<PriceBook> }`
  - `createDataSource(deps: DataSourceDeps): DataSource`

- [ ] **Step 1: Écrire le test (échoue)**

`tests/core/data-source.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/mine-response.json';
import { parseMineResponse } from '../../src/core/api/schemas';
import { createMemoryStore } from '../../src/core/cache/store';
import { createTtlCache } from '../../src/core/cache/ttl-cache';
import { createDataSource } from '../../src/core/data-source';

const NOW = new Date('2026-09-30T12:00:00Z');

function setup() {
  let calls = 0;
  const api = {
    getMine: async () => {
      calls++;
      return parseMineResponse(fixture);
    },
  };
  const cache = createTtlCache(createMemoryStore(), { now: () => NOW.getTime() });
  const dataSource = createDataSource({ api, cache, now: () => NOW });
  return { dataSource, calls: () => calls };
}

describe('createDataSource.getMyPriceBook', () => {
  it('construit le PriceBook depuis les ventes et achats conclus', async () => {
    const { dataSource } = setup();
    const book = await dataSource.getMyPriceBook();
    expect(book.byTitle('Exemple Un')).toMatchObject({
      cardId: 'c0000000-0000-4000-8000-000000000001',
      stats: { count: 1, median: 11, reliability: 'low' },
    });
    expect(book.byTitle('Exemple Trois')?.stats.median).toBe(20);
    expect(book.byTitle('Exemple Deux')).toBeNull();
  });

  it("n'interroge l'API qu'une fois grâce au cache", async () => {
    const { dataSource, calls } = setup();
    await dataSource.getMyPriceBook();
    await dataSource.getMyPriceBook();
    expect(calls()).toBe(1);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/data-source.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `data-source.ts`**

`src/core/data-source.ts` :
```ts
import type { GameApi } from './api/game-api';
import type { TtlCache } from './cache/ttl-cache';
import { extractObservations, type PriceObservation } from './pricing/observations';
import { buildPriceBook, type PriceBook } from './pricing/price-book';

// Incrémenter la version invalide le cache si le format des observations change.
const OBSERVATIONS_KEY = 'mine-observations:v1';

export type DataSourceDeps = {
  api: Pick<GameApi, 'getMine'>;
  cache: TtlCache;
  now?: () => Date;
};

export interface DataSource {
  getMyPriceBook(): Promise<PriceBook>;
}

export function createDataSource(deps: DataSourceDeps): DataSource {
  const { api, cache, now = () => new Date() } = deps;
  return {
    async getMyPriceBook() {
      const observations = await cache.getOrLoad<PriceObservation[]>(OBSERVATIONS_KEY, async () =>
        extractObservations(await api.getMine()),
      );
      return buildPriceBook(observations, { now: now() });
    },
  };
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/core/data-source.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: DataSource (PriceBook mis en cache depuis mine=1)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : Repérage des cartes dans le DOM

**Files:**
- Create: `src/content/card-finder.ts`
- Test: `tests/content/card-finder.test.ts`

**Interfaces:**
- Consumes: rien (DOM pur).
- Produces:
  - `type CardMount = { title: string; container: HTMLElement }`
  - `findCardMounts(root: ParentNode, isKnownTitle: (title: string) => boolean): CardMount[]` — pour chaque titre (`h1`–`h6` ou `[role=heading]`) connu, renvoie le plus grand ancêtre qui ne contient que ce titre, contient une `img`, et n'est pas `main`/`body`/`html`.

- [ ] **Step 1: Écrire le test (échoue)**

`tests/content/card-finder.test.ts` :
```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { findCardMounts } from '../../src/content/card-finder';

function page(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe('findCardMounts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renvoie le conteneur de chaque carte dont le titre est connu', () => {
    const root = page(`
      <main>
        <h1>Collection</h1>
        <div class="grid">
          <div class="card" id="a"><img alt="x"><button>Ajouter aux favoris</button><h3>Mad Max</h3><span>film</span></div>
          <div class="card" id="b"><img alt="y"><h3>Ovide</h3></div>
        </div>
      </main>`);
    const mounts = findCardMounts(root, (t) => t === 'Mad Max');
    expect(mounts).toHaveLength(1);
    expect(mounts[0].title).toBe('Mad Max');
    expect(mounts[0].container.id).toBe('a');
  });

  it('monte jusqu’au plus grand ancêtre qui ne contient qu’un seul titre', () => {
    const root = page(`
      <main>
        <h1>Collection</h1>
        <div class="grid">
          <div class="card" id="a"><div><img alt="x"></div><div><h3>Mad Max</h3></div></div>
          <div class="card" id="b"><div><img alt="y"></div><div><h3>Ovide</h3></div></div>
        </div>
      </main>`);
    const [mount] = findCardMounts(root, (t) => t === 'Mad Max');
    expect(mount.container.id).toBe('a');
  });

  it('ignore un titre sans image dans sa carte', () => {
    const root = page(`
      <main>
        <h1>Collection</h1>
        <div class="grid">
          <div class="card"><h3>Mad Max</h3></div>
          <div class="card"><img alt="y"><h3>Ovide</h3></div>
        </div>
      </main>`);
    expect(findCardMounts(root, (t) => t === 'Mad Max')).toHaveLength(0);
  });

  it('ignore un titre directement voisin d’autres titres (pas de carte englobante)', () => {
    const root = page(`
      <main>
        <h1>Collection</h1>
        <img alt="x">
        <h3>Mad Max</h3>
        <h3>Ovide</h3>
      </main>`);
    expect(findCardMounts(root, (t) => t === 'Mad Max')).toHaveLength(0);
  });

  it('ne monte pas au-delà de <main>', () => {
    const root = page(`
      <main>
        <div class="grid"><div class="card" id="a"><img alt="x"><h3>Mad Max</h3></div></div>
      </main>`);
    const [mount] = findCardMounts(root, () => true);
    expect(mount.container.tagName).not.toBe('MAIN');
    expect(mount.container.contains(mount.container.querySelector('h3'))).toBe(true);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/content/card-finder.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `card-finder.ts`**

`src/content/card-finder.ts` :
```ts
const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]';

export type CardMount = { title: string; container: HTMLElement };

function headingCount(element: Element): number {
  return element.querySelectorAll(HEADING_SELECTOR).length + (element.matches(HEADING_SELECTOR) ? 1 : 0);
}

function isBoundary(element: Element | null): boolean {
  return element === null || ['MAIN', 'BODY', 'HTML'].includes(element.tagName);
}

// Les cartes sont repérées par la structure (un titre, une image), pas par des
// noms de classes CSS que le jeu peut changer à tout moment.
export function findCardMounts(
  root: ParentNode,
  isKnownTitle: (title: string) => boolean,
): CardMount[] {
  const mounts: CardMount[] = [];
  for (const heading of root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)) {
    const title = heading.textContent?.trim() ?? '';
    if (!title || !isKnownTitle(title)) continue;

    let container: HTMLElement = heading;
    while (
      container.parentElement &&
      !isBoundary(container.parentElement) &&
      headingCount(container.parentElement) === 1
    ) {
      container = container.parentElement;
    }

    if (container === heading) continue;
    if (!container.querySelector('img')) continue;
    mounts.push({ title, container });
  }
  return mounts;
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/content/card-finder.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: repérage structurel des cartes dans le DOM" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8 : `decorate` et rendu du badge

**Files:**
- Create: `src/content/decorate.ts`, `src/content/PriceBadge.tsx`, `src/content/mount.tsx`
- Test: `tests/content/decorate.test.ts`

**Interfaces:**
- Consumes: `findCardMounts` (tâche 7), `PriceBook`, `PriceBookEntry` (tâche 3), `toBadgeModel`, `BadgeModel` (tâche 3).
- Produces:
  - `HOST_ATTRIBUTE = 'data-wmt-host'`
  - `type MountBadge = (container: HTMLElement, model: BadgeModel) => void`
  - `decorate(root: ParentNode, book: PriceBook, mount: MountBadge): number` — idempotent ; renvoie le nombre de badges montés.
  - `PriceBadge({ model }: { model: BadgeModel })` (React)
  - `mountBadge: MountBadge` (crée l'hôte avec l'attribut, un shadow root et une racine React)

- [ ] **Step 1: Écrire le test de `decorate` (échoue)**

`tests/content/decorate.test.ts` :
```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { decorate, HOST_ATTRIBUTE, type MountBadge } from '../../src/content/decorate';
import type { PriceBook } from '../../src/core/pricing/price-book';

const book: PriceBook = {
  byTitle: (title) =>
    title === 'Mad Max'
      ? {
          cardId: 'c1',
          rarity: 'SR',
          isShiny: false,
          stats: { count: 2, median: 5, min: 3, max: 6, trend: null, reliability: 'low' },
        }
      : null,
};

function recordingMount() {
  const mounted: string[] = [];
  const mount: MountBadge = (container, model) => {
    mounted.push(model.label);
    const host = document.createElement('div');
    host.setAttribute(HOST_ATTRIBUTE, '');
    container.appendChild(host);
  };
  return { mount, mounted };
}

describe('decorate', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <h1>Collection</h1>
        <div class="grid">
          <div class="card"><img alt="x"><h3>Mad Max</h3></div>
          <div class="card"><img alt="y"><h3>Ovide</h3></div>
        </div>
      </main>`;
  });

  it('monte un badge seulement sur les cartes dont le prix est connu', () => {
    const { mount, mounted } = recordingMount();
    expect(decorate(document, book, mount)).toBe(1);
    expect(mounted).toEqual(['5 WB']);
  });

  it('est idempotent : un second passage ne remonte pas le badge', () => {
    const { mount, mounted } = recordingMount();
    decorate(document, book, mount);
    expect(decorate(document, book, mount)).toBe(0);
    expect(mounted).toHaveLength(1);
  });

  it('remonte le badge si la carte a été recréée par la page', () => {
    const { mount, mounted } = recordingMount();
    decorate(document, book, mount);
    document.querySelector(`[${HOST_ATTRIBUTE}]`)?.remove();
    expect(decorate(document, book, mount)).toBe(1);
    expect(mounted).toHaveLength(2);
  });

  it("ne monte rien quand la carte n'a aucune donnée exploitable", () => {
    const emptyBook: PriceBook = {
      byTitle: () => ({
        cardId: 'c1',
        rarity: 'SR',
        isShiny: false,
        stats: { count: 0, median: null, min: null, max: null, trend: null, reliability: 'none' },
      }),
    };
    const { mount } = recordingMount();
    expect(decorate(document, emptyBook, mount)).toBe(0);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/content/decorate.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `decorate.ts`**

`src/content/decorate.ts` :
```ts
import { toBadgeModel, type BadgeModel } from '../core/pricing/badge';
import type { PriceBook } from '../core/pricing/price-book';
import { findCardMounts } from './card-finder';

export const HOST_ATTRIBUTE = 'data-wmt-host';

export type MountBadge = (container: HTMLElement, model: BadgeModel) => void;

export function decorate(root: ParentNode, book: PriceBook, mount: MountBadge): number {
  let mounted = 0;
  for (const { title, container } of findCardMounts(root, (t) => book.byTitle(t) !== null)) {
    if (container.querySelector(`:scope > [${HOST_ATTRIBUTE}]`)) continue;
    const entry = book.byTitle(title);
    const model = entry ? toBadgeModel(entry.stats) : null;
    if (!model) continue;
    mount(container, model);
    mounted += 1;
  }
  return mounted;
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/content/decorate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Créer le composant et le montage (non testés unitairement : rendu React vérifié à la tâche 9)**

`src/content/PriceBadge.tsx` :
```tsx
import type { CSSProperties } from 'react';
import type { BadgeModel } from '../core/pricing/badge';

const base: CSSProperties = {
  font: '600 12px/1.3 system-ui, sans-serif',
  padding: '4px 8px',
  margin: '6px 8px',
  borderRadius: 8,
  background: 'rgba(16, 24, 20, 0.88)',
  color: '#e6f4ec',
  border: '1px solid rgba(52, 211, 153, 0.6)',
};

const low: CSSProperties = {
  border: '1px dashed rgba(148, 163, 184, 0.7)',
  color: '#cbd5e1',
};

export function PriceBadge({ model }: { model: BadgeModel }) {
  return (
    <div title={model.tooltip} style={model.tone === 'low' ? { ...base, ...low } : base}>
      <strong>{model.label}</strong>
      <span style={{ fontWeight: 400, opacity: 0.85 }}> {model.detail}</span>
    </div>
  );
}
```

`src/content/mount.tsx` :
```tsx
import { createRoot } from 'react-dom/client';
import type { BadgeModel } from '../core/pricing/badge';
import { HOST_ATTRIBUTE } from './decorate';
import { PriceBadge } from './PriceBadge';

export function mountBadge(container: HTMLElement, model: BadgeModel): void {
  const host = document.createElement('div');
  host.setAttribute(HOST_ATTRIBUTE, '');
  host.style.display = 'block';

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  container.appendChild(host);
  createRoot(mountPoint).render(<PriceBadge model={model} />);
}
```

- [ ] **Step 6: Vérifier le typage**

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: decorate idempotent et badge React en shadow DOM" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9 : Content script, README et vérification sur le vrai site

**Files:**
- Modify: `src/entrypoints/content.tsx` (remplace le stub de la tâche 1)
- Create: `README.md`

**Interfaces:**
- Consumes: `createGameApi` (tâche 4), `createChromeLocalStore`, `createTtlCache` (tâche 5), `createDataSource` (tâche 6), `decorate` et `mountBadge` (tâche 8), `PriceBook` (tâche 3).
- Produces: l'extension complète, chargeable dans Chrome depuis `.output/chrome-mv3`.

- [ ] **Step 1: Remplacer le content script**

`src/entrypoints/content.tsx` :
```tsx
import { createGameApi } from '../core/api/game-api';
import { createChromeLocalStore } from '../core/cache/store';
import { createTtlCache } from '../core/cache/ttl-cache';
import { createDataSource } from '../core/data-source';
import type { PriceBook } from '../core/pricing/price-book';
import { decorate } from '../content/decorate';
import { mountBadge } from '../content/mount';

const LOG = '[wikimasters-tools]';
const DEBOUNCE_MS = 300;

export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  async main() {
    const api = createGameApi({
      fetch: (input, init) => fetch(input, { credentials: 'same-origin', ...init }),
    });
    const dataSource = createDataSource({
      api,
      cache: createTtlCache(createChromeLocalStore()),
    });

    let book: PriceBook;
    try {
      book = await dataSource.getMyPriceBook();
    } catch (error) {
      // Déconnecté, 429, format modifié… : on ne rend rien plutôt que casser la page.
      console.warn(LOG, 'prix indisponibles :', error);
      return;
    }

    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, DEBOUNCE_MS);
    });

    function run() {
      // On se déconnecte pendant nos propres insertions pour éviter une boucle.
      observer.disconnect();
      try {
        decorate(document, book, mountBadge);
      } finally {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }

    run();
  },
});
```

- [ ] **Step 2: Créer le README**

`README.md` :
```markdown
# Wikimasters Tools (non officiel)

Extension Chrome **non officielle et en lecture seule** pour [WikiMasters](https://www.wiki-masters.com).
Elle n'est liée ni au jeu, ni à Wikipédia.

## Ce que fait la V1

Un badge de prix sous chaque carte que vous avez déjà achetée ou vendue : médiane de vos
transactions (ventes et achats), fourchette, nombre de transactions et tendance. Le calcul se fait
dans votre navigateur ; rien n'est envoyé à un serveur.

## Ce qu'elle ne fait pas

- Aucune enchère, mise, vente ni ouverture de pack, aucune action automatique (les règles du jeu
  interdisent l'automatisation).
- Aucun appel à la « Vue du marché PRO » du jeu (fonction payante).

## Développement

Node.js 22.12 ou plus est requis.

    npm install
    npm test
    npm run build     # produit .output/chrome-mv3

Chargement dans Chrome : `chrome://extensions` → mode développeur → « Charger l'extension non
empaquetée » → dossier `.output/chrome-mv3`.
```

- [ ] **Step 3: Lancer toute la suite, le typage et le build**

Run: `npm test`
Expected: tous les tests passent.

Run: `npm run typecheck`
Expected: aucune erreur.

Run: `npm run build`
Expected: build réussi ; `.output/chrome-mv3/manifest.json` contient `"permissions": ["storage"]` et un content script pour `https://www.wiki-masters.com/*`.

- [ ] **Step 4: Vérification manuelle sur le vrai site (action de l'utilisateur, en lecture seule)**

1. Dans Chrome : `chrome://extensions`, activer le **mode développeur**, « Charger l'extension non empaquetée », choisir `.output/chrome-mv3`.
2. Ouvrir `https://www.wiki-masters.com/collection` en étant connecté.
3. Attendre 2 à 3 secondes. **Attendu** : un badge apparaît sous les cartes que vous avez déjà achetées ou vendues. Par exemple une carte « Trélazé » achetée à 3 et à 6 wikibidous : `5 WB` et `2 transactions · peu de données`. Les cartes jamais échangées n'ont **pas** de badge.
4. Survoler un badge : l'infobulle indique « Médiane de vos N transactions… outil non officiel ».
5. Changer de page de collection avec « Suivant → » : les badges apparaissent aussi sur la nouvelle page.
6. Ouvrir la console des DevTools (`F12`) : **aucune erreur** provenant de `[wikimasters-tools]`. Dans l'onglet Network, filtrer sur `mine=1` : une seule requête de l'extension ; recharger la page dans les 12 h n'en ajoute pas (cache).
7. Se déconnecter du jeu puis recharger : aucun badge, un simple avertissement `[wikimasters-tools] prix indisponibles` dans la console, la page reste intacte.

Si à l'étape 3 aucun badge n'apparaît alors que la console n'affiche pas d'erreur : le repérage structurel des cartes ne correspond pas au DOM réel. Dans les DevTools, inspecter une carte, noter la structure autour du titre et de l'image, puis ajuster `src/content/card-finder.ts` et ajouter un cas de test correspondant dans `tests/content/card-finder.test.ts` avant de continuer.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: content script, README et badge de prix de bout en bout" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (spec ↔ plan)

- **Widget 1 (badge de prix)** : tâches 2, 3, 6, 7, 8, 9. Source = transactions personnelles, sans `sales` (contrainte spec §4 mise à jour).
- **Architecture §3** : `GameApi` (4), `DataSource` (6), cache (5), widgets en shadow DOM (8, 9) ; le service worker est hors de ce plan (plan 4).
- **Erreurs §5** : 429 (4), format inattendu (1, 4), déconnecté (4, 9), point d'injection introuvable = rien rendu (7, 8).
- **Tests §6** : logique pure (2, 3), contrat sur fixture anonymisée (1), `GameApi` (4) ; le test bout en bout sur pages simulées est couvert par `decorate` + `card-finder` en jsdom, complété par la vérification manuelle (9).
- **Vie privée §7** : rien ne quitte le navigateur ; permission `storage` seule ; fixtures fictives.
- **Widgets 2–6, 8–10** : reportés aux plans 2 à 4 (voir « Plans suivants »).
- **Cohérence des types** : `PriceObservation` (2) est consommé tel quel par `buildPriceBook` (3) ; `PriceBook.byTitle` (3) est utilisé par `decorate` (8) ; `TtlCache`/`GameApi` (5, 4) sont ceux de `createDataSource` (6) ; `HOST_ATTRIBUTE` (8) est partagé par `decorate` et `mountBadge`.
