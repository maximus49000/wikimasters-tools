# Documentaire sur la fiche (histoire) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher dans la fiche d'une carte « événement historique » ou « personnage historique » un documentaire pertinent (sélection validée, Commons, puis YouTube via un relais Cloudflare), avec proposition par l'utilisateur et sans jamais afficher une vidéo peu pertinente.

**Architecture:** Un module pur de notation (`src/core/documentary/score.ts`) est partagé par l'extension et par le relais (Worker déjà déployé : `wikimasters-tools.maxime-protais-baumer.workers.dev`). Le relais cherche sur YouTube (clé en secret), note, met en cache (KV) et plafonne les recherches neuves. L'extension ajoute un service (`documentary-service.ts`) qui enchaîne propositions de l'utilisateur → sélection (`documentaires.json`) → Commons → relais, et une section de fiche posée comme `BookSection`.

**Tech Stack:** TypeScript strict, React, WXT, Vitest, zod, Cloudflare Workers (KV), API YouTube Data v3, API Commons/Wikidata.

**Spec:** `docs/superpowers/specs/2026-10-07-documentaire-histoire-design.md` · Maquette : `.superpowers/mockups/documentaire-histoire.html`

## Global Constraints

- Français partout dans l'interface et les commentaires ; glyphes plutôt que du texte dans les commandes (`Glyph`), cibles tactiles ≥ 44 px.
- Extension **et** mobile (APK) : même code, rien de propre à Chrome.
- Aucune requête tierce avant le clic sur ▶ (miniature seule) ; YouTube via `youtube-nocookie.com` (`embedUrl` existant).
- La clé YouTube n'existe que chez Cloudflare (secret `YOUTUBE_API_KEY`) : jamais dans le dépôt, ni dans `.env.local`, ni dans l'extension.
- « Aucune vidéo plutôt qu'une mauvaise » : seuil `THRESHOLD = 60` ; durée YouTube 8–120 min.
- Une carte film/série (`screenKindOf` = `film` ou `series`) n'a jamais de section Documentaire.
- Chaque PR : `npm run typecheck`, `npm test`, `npm run build` verts ; PR ouverte puis fusionnée sans attendre (routine du projet) ; travail dans un worktree hors dépôt créé depuis `origin/main`.
- Fiche WikiHow dans la même PR que la fonction (Task 8) ; pré-production après fusion ; production seulement sur ordre explicite.

## Écarts assumés par rapport à la spécification

1. **Personnage historique** = humain dont Wikidata donne une année de décès ≤ 1950 (quel que soit le métier). Simplification de « décédé avant 1950 ou métier… » : un métier seul n'exclurait pas les vivants.
2. **Commons** : plancher de durée 45 s (au lieu de 8 min) et bonus de 20 points, car les archives libres sont courtes ; elles passent par le même seuil de 60.
3. **Limite de débit par IP** : non faite (le plafond journalier global suffit à protéger le quota). À ajouter si quelqu'un vide le quota.
4. Le bouton « Pas pertinent » masque la vidéo **localement** et ouvre une issue ; il ne retire rien aux autres utilisateurs avant votre décision.

## File Structure

| Fichier | Rôle |
|---|---|
| `src/core/documentary/types.ts` | `DocCandidate` (schéma zod), `DocSubject` |
| `src/core/documentary/score.ts` | Normalisation, noms du sujet, notation, seuil (pur, partagé) |
| `src/core/documentary/history-kinds.ts` | Natures d'événements, `mayBeHistory`, `historyKindOf` |
| `src/core/documentary/subject.ts` | Wikidata : QID, noms (fr/en/alias), dates d'un article |
| `src/core/documentary/format.ts` | Durée, liens de recherche |
| `src/core/documentary/config.ts` | URL du relais, URL de `documentaires.json` |
| `src/core/documentary/relay-api.ts` | Client du relais (`search`, `oembed`) |
| `src/core/documentary/commons-api.ts` | Recherche de vidéos libres sur Commons |
| `src/core/documentary/selection.ts` | Lecture de `documentaires.json` |
| `src/core/documentary/proposal.ts` | Lien YouTube → clé ; issues « proposition » et « pas pertinent » |
| `src/core/documentary/documentary-repo.ts` | Propositions et masquages de l'utilisateur (stockage local) |
| `src/core/anomalies/anomaly.ts` | (modifié) `postIssue` extrait pour être réutilisé |
| `relay/src/youtube.ts` | Recherche YouTube + durées |
| `relay/src/search.ts` | Cache KV, budget, notation côté relais, validation des paramètres |
| `relay/src/index.ts` | Routes `/ping`, `/search`, `/oembed` (remplace `index.js`) |
| `documentaires.json` | Sélection validée à la main (racine du dépôt) |
| `src/content/documentary-service.ts` + `documentary-registry.ts` | Service et registre |
| `src/content/DocumentaryPlayer.tsx`, `DocumentarySection.tsx`, `DocumentaryProposeDialog.tsx` | Interface |
| `src/content/decorate-listen.ts`, `mount.tsx`, `src/app/overlay.ts` | Câblage (modifiés) |
| `src/core/whats-new/entries.ts` | Fiche WikiHow (modifié) |

## Découpage en PR

PR 1 = Tasks 1-2 · PR 2 = Task 3 (relais, déploiement par Cloudflare) · PR 3 = Tasks 4-6 · PR 4 = Tasks 7-8 · PR 5 = Task 9 (réglage du seuil).

---

### Task 1: Types et notation de pertinence

**Files:**
- Create: `src/core/documentary/types.ts`, `src/core/documentary/score.ts`
- Test: `tests/core/documentary/score.test.ts`

**Interfaces:**
- Produces: `DocCandidate`, `DocSubject`, `candidateSchema`, `normalize(text)`, `subjectNames(labels)`, `scoreCandidate(subject, candidate, rules)`, `passes(result)`, `THRESHOLD`, `YOUTUBE_RULES`, `COMMONS_RULES`, `ScoreResult`.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// tests/core/documentary/score.test.ts
import { describe, expect, it } from 'vitest';
import { COMMONS_RULES, normalize, passes, scoreCandidate, subjectNames, YOUTUBE_RULES } from '../../../src/core/documentary/score';
import type { DocCandidate, DocSubject } from '../../../src/core/documentary/types';

const verdun: DocSubject = { qid: 'Q2280', kind: 'event', names: ['Bataille de Verdun', 'Verdun'], startYear: 1916, endYear: 1916 };
const base: DocCandidate = { source: 'youtube', id: 'abc123', title: '', channel: 'Une chaîne', durationSec: 3120, language: 'fr', description: '', url: 'https://www.youtube.com/watch?v=abc123' };
const make = (change: Partial<DocCandidate>): DocCandidate => ({ ...base, ...change });

describe('normalize', () => {
  it('retire accents, casse et ponctuation', () => {
    expect(normalize("L'Été d'Éloïse !")).toBe('l ete d eloise');
  });
});

describe('subjectNames', () => {
  it('retire les parenthèses, les doublons et les noms trop courts', () => {
    expect(subjectNames(['Napoléon Ier', 'Napoleon', 'Bataille de Verdun (1916)', 'Ab', 'napoléon ier'])).toEqual(['Napoléon Ier', 'Napoleon', 'Bataille de Verdun']);
  });
});

describe('scoreCandidate', () => {
  it('retient un documentaire dont le titre porte le nom et le genre', () => {
    const result = scoreCandidate(verdun, make({ title: "Verdun, la bataille de l'impossible - documentaire" }), YOUTUBE_RULES);
    expect(result.score).toBe(75);
    expect(passes(result)).toBe(true);
  });

  it('rejette un titre sans le nom du sujet', () => {
    const result = scoreCandidate(verdun, make({ title: 'Les grandes batailles - documentaire' }), YOUTUBE_RULES);
    expect(result.reason).toBe('titre sans le nom du sujet');
    expect(passes(result)).toBe(false);
  });

  it('rejette un extrait trop court et un film trop long', () => {
    expect(scoreCandidate(verdun, make({ title: 'Verdun documentaire', durationSec: 120 }), YOUTUBE_RULES).reason).toBe('trop court');
    expect(scoreCandidate(verdun, make({ title: 'Verdun documentaire', durationSec: 9000 }), YOUTUBE_RULES).reason).toBe('trop long');
  });

  it('rejette une durée inconnue', () => {
    expect(scoreCandidate(verdun, make({ title: 'Verdun documentaire', durationSec: null }), YOUTUBE_RULES).reason).toBe('durée inconnue');
  });

  it('rejette les mots parasites', () => {
    expect(scoreCandidate(verdun, make({ title: 'Verdun documentaire REACTION' }), YOUTUBE_RULES).reason).toBe('mot parasite');
    expect(scoreCandidate(verdun, make({ title: 'Verdun - bande annonce' }), YOUTUBE_RULES).reason).toBe('mot parasite');
  });

  it('exige mieux qu’un titre nu : 55 points ne passent pas', () => {
    const result = scoreCandidate(verdun, make({ title: 'Verdun 1916', durationSec: 3000 }), YOUTUBE_RULES);
    expect(result.score).toBe(55);
    expect(passes(result)).toBe(false);
  });

  it('une chaîne reconnue suffit à passer', () => {
    const result = scoreCandidate(verdun, make({ title: 'Verdun 14-18', channel: 'ARTE', durationSec: 2600 }), YOUTUBE_RULES);
    expect(result.score).toBe(75);
    expect(passes(result)).toBe(true);
  });

  it('pénalise une année du titre éloignée de la période (homonyme)', () => {
    const result = scoreCandidate(verdun, make({ title: 'Verdun 1250 documentaire' }), YOUTUBE_RULES);
    expect(result.score).toBe(45);
    expect(passes(result)).toBe(false);
  });

  it('ne pénalise pas l’année de réalisation (après 1990)', () => {
    const result = scoreCandidate(verdun, make({ title: 'Verdun documentaire 2016' }), YOUTUBE_RULES);
    expect(passes(result)).toBe(true);
  });

  it('accepte une archive libre de Commons plus courte', () => {
    const napoleon: DocSubject = { qid: 'Q517', kind: 'person', names: ['Napoléon Ier', 'Napoleon'], startYear: 1769, endYear: 1821 };
    const archive = make({ source: 'commons', title: 'La Révolution française et Napoléon - Planet Wissen', durationSec: 100, language: null });
    expect(passes(scoreCandidate(napoleon, archive, COMMONS_RULES))).toBe(true);
    expect(scoreCandidate(napoleon, { ...archive, durationSec: 30 }, COMMONS_RULES).reason).toBe('trop court');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/documentary/score.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

```ts
// src/core/documentary/types.ts
import { z } from 'zod';

export const candidateSchema = z.object({
  source: z.enum(['selection', 'commons', 'youtube', 'proposal']),
  // Clé YouTube, ou titre du fichier sur Commons.
  id: z.string(),
  title: z.string(),
  // Chaîne YouTube ou auteur Commons.
  channel: z.string(),
  durationSec: z.number().nullable(),
  language: z.string().nullable(),
  description: z.string(),
  // Page d'origine (bouton ↗).
  url: z.string(),
  // Fichier vidéo direct (Commons).
  mediaUrl: z.string().optional(),
  thumbUrl: z.string().optional(),
  license: z.string().optional(),
});
export type DocCandidate = z.infer<typeof candidateSchema>;

// Le sujet de la carte : noms (libellés et alias fr/en) et période (naissance–décès pour une personne, début–fin pour un événement).
export type DocSubject = { qid: string; kind: 'event' | 'person'; names: string[]; startYear: number | null; endYear: number | null };
```

```ts
// src/core/documentary/score.ts
import type { DocCandidate, DocSubject } from './types';

// Note minimale pour afficher une vidéo. Réglée à la Task 9.
export const THRESHOLD = 60;

export type ScoreRules = { minDurationSec: number; maxDurationSec: number; bonus: number };
export const YOUTUBE_RULES: ScoreRules = { minDurationSec: 480, maxDurationSec: 7200, bonus: 0 };
// Les archives libres sont courtes ; leur titre vient de contributeurs qui les ont classées : léger bonus.
export const COMMONS_RULES: ScoreRules = { minDurationSec: 45, maxDurationSec: 7200, bonus: 20 };

export type ScoreResult = { score: number; reason?: string };

const GENRE = ['documentaire', 'documentary', 'docu', 'reportage'];
const NOISE = ['reaction', 'react', 'clip', 'remix', 'gameplay', 'let s play', 'trailer', 'bande annonce', 'shorts', 'asmr', 'meme', 'parodie', 'karaoke', 'lyrics', 'amv', 'tiktok'];
// Chaînes d'histoire / de service public, comparées sur des mots entiers.
const TRUSTED = ['arte', 'ina', 'france tv', 'francetv', 'france 2', 'france 5', 'histoire tv', 'nota bene', 'herodote', 'lumni', 'public senat', 'bbc', 'national geographic'];

// Minuscules, sans accents ni ponctuation : « L'Été » → « l ete ».
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Le groupe de mots `phrase` apparaît en mots entiers dans `text` (tous deux déjà normalisés).
const hasPhrase = (text: string, phrase: string): boolean => ` ${text} `.includes(` ${phrase} `);

// Noms sous lesquels un sujet peut apparaître dans un titre : libellés et alias, sans parenthèses, sans doublon, 4 caractères au moins.
export function subjectNames(labels: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const label of labels) {
    const name = label.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const key = normalize(name);
    if (key.length < 4 || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

const reject = (reason: string): ScoreResult => ({ score: 0, reason });

// Années « historiques » (≤ 1990) citées dans le titre : une année de réalisation (après 1990) ne compte pas.
function historicalYears(title: string): number[] {
  return [...title.matchAll(/\b(\d{4})\b/g)].map((match) => Number(match[1])).filter((year) => year <= 1990);
}

export function scoreCandidate(subject: DocSubject, candidate: DocCandidate, rules: ScoreRules): ScoreResult {
  const title = normalize(candidate.title);
  if (!subject.names.some((name) => hasPhrase(title, normalize(name)))) return reject('titre sans le nom du sujet');
  if (NOISE.some((word) => hasPhrase(title, word))) return reject('mot parasite');
  const duration = candidate.durationSec;
  if (duration === null) return reject('durée inconnue');
  if (duration < rules.minDurationSec) return reject('trop court');
  if (duration > rules.maxDurationSec) return reject('trop long');

  let score = 40 + rules.bonus;
  if (GENRE.some((word) => hasPhrase(title, word))) score += 20;
  else if (GENRE.some((word) => hasPhrase(normalize(candidate.description.slice(0, 500)), word))) score += 10;
  score += duration >= 1200 && duration <= 5400 ? 10 : 5;
  if (TRUSTED.some((channel) => hasPhrase(normalize(candidate.channel), channel))) score += 20;
  const language = (candidate.language ?? '').toLowerCase();
  if (language.startsWith('fr')) score += 5;
  else if (language.startsWith('en')) score += 3;

  if (subject.startYear !== null) {
    const low = subject.startYear - 50;
    const high = (subject.endYear ?? subject.startYear) + 50;
    const years = historicalYears(candidate.title);
    if (years.length > 0 && years.every((year) => year < low || year > high)) score -= 30;
  }
  return { score: Math.max(0, Math.min(100, score)) };
}

export const passes = (result: ScoreResult): boolean => result.reason === undefined && result.score >= THRESHOLD;
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run tests/core/documentary/score.test.ts`
Expected: PASS (11 tests). Si un score diffère, recalculer à la main avec les barèmes ci-dessus avant de toucher au test.

- [ ] **Step 5: Commit**

```bash
git add src/core/documentary tests/core/documentary
git commit -m "feat(documentaire): types et notation de pertinence"
```

---

### Task 2: Détection historique et lecture Wikidata du sujet

**Files:**
- Create: `src/core/documentary/history-kinds.ts`, `src/core/documentary/subject.ts`
- Test: `tests/core/documentary/history-kinds.test.ts`, `tests/core/documentary/subject.test.ts`

**Interfaces:**
- Consumes: `CardKinds` (`../kinds/wikidata-kinds`), `getJson`, `parseWikibaseItems`, `parseCardDates`, `FetchLike` (`../birth/wikidata-birth`), `slugToTitle` (`../market/market-book`), `subjectNames` (Task 1).
- Produces: `EVENT_NATURES`, `mayBeHistory(kinds)`, `historyKindOf(kinds, deathYear)`, `SubjectInfo`, `fetchSubject(fetchFn, slug)`.

- [ ] **Step 1: Vérifier les identifiants d'événements sur Wikidata**

Run:
```bash
node -e "fetch('https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels&languages=fr&format=json&ids=Q13418847|Q178561|Q198|Q350604|Q645883|Q188055|Q10931|Q131569|Q1261499|Q8465|Q124734|Q1006311').then(r=>r.json()).then(j=>Object.entries(j.entities).forEach(([k,v])=>console.log(k,v.labels?.fr?.value)))"
```
Expected : événement historique, bataille, guerre, conflit armé, opération militaire, siège, révolution, traité, bataille navale, guerre civile, rébellion, guerre d'indépendance. Remplacer dans l'étape 3 tout identifiant dont le libellé ne correspond pas.

- [ ] **Step 2: Écrire les tests qui échouent**

```ts
// tests/core/documentary/history-kinds.test.ts
import { describe, expect, it } from 'vitest';
import { historyKindOf, mayBeHistory } from '../../../src/core/documentary/history-kinds';

const kinds = (natures: string[]) => ({ natures, occupations: [], genres: [] });

describe('mayBeHistory', () => {
  it('retient un événement ou un humain, pas le reste', () => {
    expect(mayBeHistory(kinds(['Q178561']))).toBe(true);
    expect(mayBeHistory(kinds(['Q5']))).toBe(true);
    expect(mayBeHistory(kinds(['Q515']))).toBe(false);
    expect(mayBeHistory(undefined)).toBe(false);
  });
});

describe('historyKindOf', () => {
  it('reconnaît une bataille, une guerre, une révolution', () => {
    expect(historyKindOf(kinds(['Q178561']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q198']), null)).toBe('event');
    expect(historyKindOf(kinds(['Q10931']), null)).toBe('event');
  });
  it('reconnaît un humain décédé en 1950 ou avant, jamais un vivant ni un décès récent', () => {
    expect(historyKindOf(kinds(['Q5']), 1821)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), 1950)).toBe('person');
    expect(historyKindOf(kinds(['Q5']), 1951)).toBeNull();
    expect(historyKindOf(kinds(['Q5']), null)).toBeNull();
  });
  it('rend null pour une carte sans rapport', () => {
    expect(historyKindOf(kinds(['Q515']), 1800)).toBeNull();
    expect(historyKindOf(undefined, 1800)).toBeNull();
  });
});
```

```ts
// tests/core/documentary/subject.test.ts
import { describe, expect, it } from 'vitest';
import { fetchSubject } from '../../../src/core/documentary/subject';

const claim = (time: string) => [{ rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { type: 'time', value: { time, precision: 11 } } } }];

function fakeFetch(entity: Record<string, unknown>, item: string | null) {
  const urls: string[] = [];
  const fetchFn = async (url: string) => {
    urls.push(url);
    if (url.includes('fr.wikipedia.org')) {
      return new Response(JSON.stringify({ query: { pages: [{ title: 'Napoléon Ier', pageprops: item ? { wikibase_item: item } : undefined }] } }));
    }
    return new Response(JSON.stringify({ entities: { [item ?? 'Q0']: entity } }));
  };
  return { fetchFn, urls };
}

describe('fetchSubject', () => {
  it('lit les noms (fr, en, alias) et les dates', async () => {
    const { fetchFn } = fakeFetch(
      {
        labels: { fr: { value: 'Napoléon Ier' }, en: { value: 'Napoleon' } },
        aliases: { fr: [{ value: 'Napoléon Bonaparte' }] },
        claims: { P569: claim('+1769-08-15T00:00:00Z'), P570: claim('+1821-05-05T00:00:00Z') },
      },
      'Q517',
    );
    const subject = await fetchSubject(fetchFn, 'Napoléon_Ier');
    expect(subject).toEqual({ qid: 'Q517', names: ['Napoléon Ier', 'Napoleon', 'Napoléon Bonaparte'], birth: 1769, death: 1821, start: null, end: null });
  });

  it('rend null pour un article sans élément Wikidata', async () => {
    const { fetchFn, urls } = fakeFetch({}, null);
    expect(await fetchSubject(fetchFn, 'Napoléon_Ier')).toBeNull();
    expect(urls).toHaveLength(1);
  });

  it('laisse remonter une panne réseau (jamais mémorisée comme « sans valeur »)', async () => {
    await expect(fetchSubject(async () => new Response('', { status: 429 }), 'X')).rejects.toThrow('HTTP 429');
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npx vitest run tests/core/documentary/history-kinds.test.ts tests/core/documentary/subject.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 4: Implémenter**

```ts
// src/core/documentary/history-kinds.ts
import type { CardKinds } from '../kinds/wikidata-kinds';

// Natures Wikidata d'un événement historique : événement historique, bataille, guerre, conflit armé, opération militaire, siège, révolution,
// traité, bataille navale, guerre civile, rébellion, guerre d'indépendance.
export const EVENT_NATURES: ReadonlySet<string> = new Set(['Q13418847', 'Q178561', 'Q198', 'Q350604', 'Q645883', 'Q188055', 'Q10931', 'Q131569', 'Q1261499', 'Q8465', 'Q124734', 'Q1006311']);
const HUMAN = 'Q5';
// Un humain est « historique » s'il est mort en 1950 ou avant ; les vivants sont exclus.
export const MAX_DEATH_YEAR = 1950;

export type HistoryKind = 'event' | 'person';

// La carte peut être historique : on ira lire ses dates (un humain n'est « historique » qu'une fois sa date de décès connue).
export const mayBeHistory = (kinds: CardKinds | undefined): boolean => kinds !== undefined && (kinds.natures.includes(HUMAN) || kinds.natures.some((id) => EVENT_NATURES.has(id)));

export function historyKindOf(kinds: CardKinds | undefined, deathYear: number | null): HistoryKind | null {
  if (!kinds) return null;
  if (kinds.natures.some((id) => EVENT_NATURES.has(id))) return 'event';
  if (kinds.natures.includes(HUMAN) && deathYear !== null && deathYear <= MAX_DEATH_YEAR) return 'person';
  return null;
}
```

```ts
// src/core/documentary/subject.ts
import { z } from 'zod';
import { getJson, parseCardDates, parseWikibaseItems, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle } from '../market/market-book';
import { subjectNames } from './score';

// Ce que la recherche de documentaire sait d'une carte : élément Wikidata, noms (fr, en, alias fr) et années (entières).
export type SubjectInfo = { qid: string; names: string[]; birth: number | null; death: number | null; start: number | null; end: number | null };

const entitiesSchema = z.object({
  entities: z.record(
    z.string(),
    z.object({
      labels: z.record(z.string(), z.object({ value: z.string() })).optional(),
      aliases: z.record(z.string(), z.array(z.object({ value: z.string() }))).optional(),
    }),
  ),
});

const whole = (year: number | null): number | null => (year === null ? null : Math.floor(year));

// Deux requêtes (élément, puis noms et dates) ; seul le titre de l'article est envoyé. Une panne lève : elle ne doit pas être mémorisée.
export async function fetchSubject(fetchFn: FetchLike, slug: string): Promise<SubjectInfo | null> {
  const title = slugToTitle(slug);
  const pagesJson = await getJson(fetchFn, 'https://fr.wikipedia.org/w/api.php', { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', formatversion: '2', titles: title }, 'Wikipédia');
  const qid = parseWikibaseItems(pagesJson, [title])[title] ?? null;
  if (qid === null) return null;
  const json = await getJson(fetchFn, 'https://www.wikidata.org/w/api.php', { action: 'wbgetentities', props: 'labels|aliases|claims', languages: 'fr|en', ids: qid }, 'Wikidata');
  const parsed = entitiesSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const entity = parsed.data.entities[qid];
  const dates = parseCardDates(json)[qid];
  if (!entity || !dates) return null;
  const names = subjectNames([entity.labels?.fr?.value ?? '', entity.labels?.en?.value ?? '', ...(entity.aliases?.fr ?? []).map((alias) => alias.value)]);
  return { qid, names, birth: whole(dates.birth), death: whole(dates.death), start: whole(dates.start), end: whole(dates.end) };
}
```

- [ ] **Step 5: Vérifier, puis le typage**

Run: `npx vitest run tests/core/documentary && npm run typecheck`
Expected: PASS ; typecheck sans erreur. Si `parseCardDates` rejette le jeu d'essai, aligner `claim()` du test sur le schéma de `src/core/birth/wikidata-birth.ts` (lignes 11-40), pas l'inverse.

- [ ] **Step 6: Commit, PR 1**

```bash
git add src/core/documentary tests/core/documentary
git commit -m "feat(documentaire): détection historique et lecture Wikidata du sujet"
```
Puis `npm test && npm run build`, pousser, ouvrir et fusionner la PR (routine du projet).

---

### Task 3: Relais — recherche YouTube, notation, cache, budget

**Files:**
- Create: `relay/src/youtube.ts`, `relay/src/search.ts`, `relay/src/index.ts`
- Delete: `relay/src/index.js`
- Modify: `wrangler.toml`, `relay/wrangler.toml`, `relay/README.md`
- Test: `tests/relay/youtube.test.ts`, `tests/relay/search.test.ts`

**Interfaces:**
- Consumes: `scoreCandidate`, `passes`, `YOUTUBE_RULES` (Task 1), `DocCandidate`, `DocSubject`.
- Produces: `parseDuration`, `searchYoutube(fetchFn, key, query)`, `searchDocumentaries(deps, request)`, `parseSearchRequest(params)`, `KvLike`, `Env`. Réponses HTTP : `/search` → `{ok:true,candidates,cached}` ou `{ok:false,reason:'budget'|'upstream'|'bad-request'}` ; `/oembed?id=` → `{ok:true,title,channel}` ou `{ok:false,reason:'not-found'|'not-embeddable'|'upstream'}`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// tests/relay/youtube.test.ts
import { describe, expect, it } from 'vitest';
import { parseDuration, searchYoutube } from '../../relay/src/youtube';

describe('parseDuration', () => {
  it('lit les durées ISO 8601', () => {
    expect(parseDuration('PT52M')).toBe(3120);
    expect(parseDuration('PT1H2M3S')).toBe(3723);
    expect(parseDuration('PT45S')).toBe(45);
    expect(parseDuration('P0D')).toBe(0);
    expect(parseDuration('n’importe quoi')).toBeNull();
  });
});

describe('searchYoutube', () => {
  it('recherche puis complète avec les durées', async () => {
    const urls: string[] = [];
    const fetchFn = async (url: string) => {
      urls.push(url);
      if (url.includes('/search?')) return new Response(JSON.stringify({ items: [{ id: { videoId: 'AAA' } }, { id: { videoId: 'BBB' } }] }));
      return new Response(
        JSON.stringify({
          items: [
            { id: 'AAA', snippet: { title: 'Verdun documentaire', channelTitle: 'ARTE', description: 'Le film', defaultAudioLanguage: 'fr' }, contentDetails: { duration: 'PT52M' } },
            { id: 'BBB', snippet: { title: 'Autre', channelTitle: 'X', description: '' }, contentDetails: { duration: 'PT10M' } },
          ],
        }),
      );
    };
    const found = await searchYoutube(fetchFn, 'CLE', 'Bataille de Verdun documentaire');
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ source: 'youtube', id: 'AAA', title: 'Verdun documentaire', channel: 'ARTE', durationSec: 3120, language: 'fr', url: 'https://www.youtube.com/watch?v=AAA' });
    expect(found[1]?.language).toBeNull();
    expect(urls[0]).toContain('videoEmbeddable=true');
    expect(urls[0]).toContain('key=CLE');
    expect(urls[1]).toContain('id=AAA%2CBBB');
  });

  it('ne fait pas de seconde requête sans résultat', async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return new Response(JSON.stringify({ items: [] }));
    };
    expect(await searchYoutube(fetchFn, 'CLE', 'x')).toEqual([]);
    expect(calls).toBe(1);
  });

  it('lève sur une réponse en erreur (quota)', async () => {
    await expect(searchYoutube(async () => new Response('', { status: 403 }), 'CLE', 'x')).rejects.toThrow('YouTube : HTTP 403');
  });
});
```

```ts
// tests/relay/search.test.ts
import { describe, expect, it } from 'vitest';
import { parseSearchRequest, searchDocumentaries, type KvLike, type SearchRequest } from '../../relay/src/search';

function memoryKv(): KvLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: async (key) => data.get(key) ?? null, put: async (key, value) => void data.set(key, value) };
}

const request: SearchRequest = { qid: 'Q2280', kind: 'event', names: ['Bataille de Verdun', 'Verdun'], startYear: 1916, endYear: 1916 };

const youtubeFetch = (calls: string[]) => async (url: string) => {
  calls.push(url);
  if (url.includes('/search?')) return new Response(JSON.stringify({ items: [{ id: { videoId: 'GOOD' } }, { id: { videoId: 'BAD' } }] }));
  return new Response(
    JSON.stringify({
      items: [
        { id: 'GOOD', snippet: { title: 'Verdun, la bataille - documentaire', channelTitle: 'ARTE', description: '', defaultAudioLanguage: 'fr' }, contentDetails: { duration: 'PT52M' } },
        { id: 'BAD', snippet: { title: 'Verdun reaction', channelTitle: 'Z', description: '' }, contentDetails: { duration: 'PT20M' } },
      ],
    }),
  );
};

const deps = (kv: KvLike, calls: string[], day = '2026-10-07') => ({ fetch: youtubeFetch(calls), kv, apiKey: 'CLE', now: () => new Date(`${day}T10:00:00Z`) });

describe('searchDocumentaries', () => {
  it('cherche, note, ne garde que les pertinents et met en cache', async () => {
    const kv = memoryKv();
    const calls: string[] = [];
    const first = await searchDocumentaries(deps(kv, calls), request);
    expect(first).toMatchObject({ ok: true, cached: false });
    expect(first.ok && first.candidates.map((c) => c.id)).toEqual(['GOOD']);
    const second = await searchDocumentaries(deps(kv, calls), request);
    expect(second).toMatchObject({ ok: true, cached: true });
    expect(calls).toHaveLength(2);
  });

  it('mémorise aussi « rien de pertinent »', async () => {
    const kv = memoryKv();
    const only = async () => new Response(JSON.stringify({ items: [] }));
    const result = await searchDocumentaries({ ...deps(kv, []), fetch: only }, request);
    expect(result).toEqual({ ok: true, candidates: [], cached: false });
    expect(kv.data.get('doc-v1-Q2280')).toBe('[]');
  });

  it('s’arrête au plafond journalier sans appeler YouTube ni mémoriser', async () => {
    const kv = memoryKv();
    kv.data.set('budget-2026-10-07', '90');
    const calls: string[] = [];
    expect(await searchDocumentaries(deps(kv, calls), request)).toEqual({ ok: false, reason: 'budget' });
    expect(calls).toHaveLength(0);
    expect(kv.data.has('doc-v1-Q2280')).toBe(false);
  });

  it('compte les recherches neuves par jour', async () => {
    const kv = memoryKv();
    await searchDocumentaries(deps(kv, []), request);
    expect(kv.data.get('budget-2026-10-07')).toBe('1');
  });

  it('signale une panne de YouTube sans mémoriser', async () => {
    const kv = memoryKv();
    const result = await searchDocumentaries({ ...deps(kv, []), fetch: async () => new Response('', { status: 403 }) }, request);
    expect(result).toEqual({ ok: false, reason: 'upstream' });
    expect(kv.data.has('doc-v1-Q2280')).toBe(false);
  });

  it('en mode debug rend tous les candidats notés, sans cache', async () => {
    const kv = memoryKv();
    const result = await searchDocumentaries(deps(kv, []), { ...request, debug: true });
    expect(result.ok && result.debug?.map((entry) => [entry.candidate.id, entry.result.reason ?? 'ok'])).toEqual([['GOOD', 'ok'], ['BAD', 'mot parasite']]);
    expect(kv.data.has('doc-v1-Q2280')).toBe(false);
  });
});

describe('parseSearchRequest', () => {
  it('lit des paramètres valides', () => {
    const params = new URLSearchParams({ qid: 'Q2280', kind: 'event', names: 'Bataille de Verdun|Verdun', start: '1916', end: '1916' });
    expect(parseSearchRequest(params)).toEqual(request);
  });
  it('rejette un QID, un genre ou des noms invalides', () => {
    expect(parseSearchRequest(new URLSearchParams({ qid: 'x', kind: 'event', names: 'A B' }))).toBeNull();
    expect(parseSearchRequest(new URLSearchParams({ qid: 'Q1', kind: 'lieu', names: 'A B' }))).toBeNull();
    expect(parseSearchRequest(new URLSearchParams({ qid: 'Q1', kind: 'event', names: '' }))).toBeNull();
    expect(parseSearchRequest(new URLSearchParams({ qid: 'Q1', kind: 'event', names: 'x'.repeat(121) }))).toBeNull();
  });
  it('année absente ou illisible : null', () => {
    const request2 = parseSearchRequest(new URLSearchParams({ qid: 'Q1', kind: 'person', names: 'Cléopâtre', start: 'abc' }));
    expect(request2).toMatchObject({ startYear: null, endYear: null });
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/relay`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Implémenter le client YouTube**

```ts
// relay/src/youtube.ts
import { z } from 'zod';
import type { DocCandidate } from '../../src/core/documentary/types';

export type FetchLike = (url: string) => Promise<Response>;

const API = 'https://www.googleapis.com/youtube/v3';

const searchSchema = z.object({ items: z.array(z.object({ id: z.object({ videoId: z.string().optional() }) })).default([]) });
const videosSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({
          title: z.string(),
          channelTitle: z.string(),
          description: z.string().default(''),
          defaultAudioLanguage: z.string().optional(),
          defaultLanguage: z.string().optional(),
        }),
        contentDetails: z.object({ duration: z.string() }),
      }),
    )
    .default([]),
});

// « PT1H2M3S » → secondes ; null si le format est inconnu.
export function parseDuration(iso: string): number | null {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  return Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

async function getJson(fetchFn: FetchLike, path: string, params: Record<string, string>): Promise<unknown> {
  const response = await fetchFn(`${API}/${path}?${new URLSearchParams(params).toString()}`);
  if (!response.ok) throw new Error(`YouTube : HTTP ${response.status}`);
  return response.json();
}

// Une recherche (100 unités de quota), puis les durées et langues des résultats (1 unité). Seules les vidéos intégrables ailleurs sont demandées.
export async function searchYoutube(fetchFn: FetchLike, key: string, query: string): Promise<DocCandidate[]> {
  const found = searchSchema.parse(
    await getJson(fetchFn, 'search', { part: 'snippet', type: 'video', maxResults: '10', q: query, relevanceLanguage: 'fr', videoEmbeddable: 'true', videoSyndicated: 'true', safeSearch: 'moderate', key }),
  );
  const ids = found.items.map((item) => item.id.videoId).filter((id): id is string => id !== undefined);
  if (ids.length === 0) return [];
  const details = videosSchema.parse(await getJson(fetchFn, 'videos', { part: 'snippet,contentDetails', id: ids.join(','), key }));
  return details.items.map((video) => ({
    source: 'youtube' as const,
    id: video.id,
    title: video.snippet.title,
    channel: video.snippet.channelTitle,
    durationSec: parseDuration(video.contentDetails.duration),
    language: video.snippet.defaultAudioLanguage ?? video.snippet.defaultLanguage ?? null,
    description: video.snippet.description,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    thumbUrl: `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`,
  }));
}
```

- [ ] **Step 4: Implémenter la recherche notée**

```ts
// relay/src/search.ts
import { passes, scoreCandidate, YOUTUBE_RULES, type ScoreResult } from '../../src/core/documentary/score';
import type { DocCandidate, DocSubject } from '../../src/core/documentary/types';
import { searchYoutube, type FetchLike } from './youtube';

export type KvLike = { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> };

export type SearchRequest = { qid: string; kind: 'event' | 'person'; names: string[]; startYear: number | null; endYear: number | null; debug?: boolean };
export type SearchResponse =
  | { ok: true; candidates: DocCandidate[]; cached: boolean; debug?: { candidate: DocCandidate; result: ScoreResult }[] }
  | { ok: false; reason: 'budget' | 'upstream' };
export type SearchDeps = { fetch: FetchLike; kv: KvLike; apiKey: string; now: () => Date; dailyBudget?: number };

// Une recherche YouTube coûte 100 unités sur 10 000 par jour : 90 recherches neuves laissent de la marge.
export const DAILY_BUDGET = 90;
const DAY = 86400;

export function parseSearchRequest(params: URLSearchParams): SearchRequest | null {
  const qid = params.get('qid') ?? '';
  const kind = params.get('kind');
  const names = (params.get('names') ?? '').split('|').map((name) => name.trim()).filter((name) => name !== '').slice(0, 6);
  if (!/^Q\d{1,12}$/.test(qid) || (kind !== 'event' && kind !== 'person') || names.length === 0 || names.some((name) => name.length > 120)) return null;
  const year = (key: string): number | null => {
    const raw = params.get(key);
    if (raw === null || raw === '') return null;
    const value = Number(raw);
    return Number.isInteger(value) ? value : null;
  };
  return { qid, kind, names, startYear: year('start'), endYear: year('end') };
}

export async function searchDocumentaries(deps: SearchDeps, request: SearchRequest): Promise<SearchResponse> {
  const cacheKey = `doc-v1-${request.qid}`;
  if (!request.debug) {
    const hit = await deps.kv.get(cacheKey);
    if (hit !== null) return { ok: true, candidates: JSON.parse(hit) as DocCandidate[], cached: true };
  }
  const budgetKey = `budget-${deps.now().toISOString().slice(0, 10)}`;
  const used = Number((await deps.kv.get(budgetKey)) ?? '0');
  if (used >= (deps.dailyBudget ?? DAILY_BUDGET)) return { ok: false, reason: 'budget' };
  await deps.kv.put(budgetKey, String(used + 1), { expirationTtl: 2 * DAY });

  let found: DocCandidate[];
  try {
    found = await searchYoutube(deps.fetch, deps.apiKey, `${request.names[0] ?? ''} documentaire`);
  } catch {
    return { ok: false, reason: 'upstream' };
  }
  const subject: DocSubject = { qid: request.qid, kind: request.kind, names: request.names, startYear: request.startYear, endYear: request.endYear };
  const scored = found.map((candidate) => ({ candidate, result: scoreCandidate(subject, candidate, YOUTUBE_RULES) }));
  if (request.debug) return { ok: true, candidates: [], cached: false, debug: scored };

  const candidates = scored
    .filter((entry) => passes(entry.result))
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, 3)
    .map((entry) => entry.candidate);
  // Succès : 30 jours ; « rien de pertinent » : 7 jours (un nouveau documentaire peut sortir).
  await deps.kv.put(cacheKey, JSON.stringify(candidates), { expirationTtl: (candidates.length > 0 ? 30 : 7) * DAY });
  return { ok: true, candidates, cached: false };
}
```

- [ ] **Step 5: Implémenter les routes**

```ts
// relay/src/index.ts
import { parseSearchRequest, searchDocumentaries, type KvLike } from './search';

// Squelette → relais de recherche de documentaires (voir docs/superpowers/specs/2026-10-07-documentaire-histoire-design.md).
export type Env = { YOUTUBE_API_KEY?: string; DOC_CACHE?: KvLike; DEBUG_TOKEN?: string };

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'x-debug',
  'cache-control': 'no-store',
};
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });

// Une vidéo existe et peut être intégrée ailleurs : l'oEmbed de YouTube répond 200 ; 401/403 = intégration interdite ; 400/404 = introuvable.
async function oembed(id: string): Promise<Response> {
  if (!/^[\w-]{3,32}$/.test(id)) return json({ ok: false, reason: 'not-found' }, 400);
  const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`);
  if (response.ok) {
    const body = (await response.json()) as { title?: string; author_name?: string };
    return json({ ok: true, title: body.title ?? '', channel: body.author_name ?? '' });
  }
  if (response.status === 401 || response.status === 403) return json({ ok: false, reason: 'not-embeddable' });
  if (response.status === 400 || response.status === 404) return json({ ok: false, reason: 'not-found' });
  return json({ ok: false, reason: 'upstream' }, 502);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/ping') return json({ ok: true, service: 'wikimasters-tools' });
    if (url.pathname === '/oembed') return oembed(url.searchParams.get('id') ?? '');
    if (url.pathname === '/search') {
      const parsed = parseSearchRequest(url.searchParams);
      if (!parsed) return json({ ok: false, reason: 'bad-request' }, 400);
      if (!env.YOUTUBE_API_KEY || !env.DOC_CACHE) return json({ ok: false, reason: 'upstream' }, 503);
      const debug = env.DEBUG_TOKEN !== undefined && env.DEBUG_TOKEN !== '' && request.headers.get('x-debug') === env.DEBUG_TOKEN;
      const result = await searchDocumentaries({ fetch: (target) => fetch(target), kv: env.DOC_CACHE, apiKey: env.YOUTUBE_API_KEY, now: () => new Date() }, { ...parsed, debug });
      return json(result);
    }
    return json({ ok: false, error: 'Route inconnue' }, 404);
  },
};
```

- [ ] **Step 6: Lancer les tests et le typage**

Run: `npx vitest run tests/relay && npm run typecheck`
Expected: PASS. (`Request`, `Response`, `fetch` viennent de la bibliothèque DOM déjà utilisée par WXT : aucun paquet à ajouter.)

- [ ] **Step 7: Étape manuelle (utilisateur) — créer le cache KV**

Demander à l'utilisateur : Cloudflare → **Stockage et bases de données** → **KV** → **Créer un espace de noms** → nom `wikimasters-doc-cache` → copier son **ID** (ce n'est pas un secret) et le donner dans la conversation.

- [ ] **Step 8: Brancher le KV et le nouveau point d'entrée**

Remplacer le contenu de `wrangler.toml` (racine) par (en mettant l'ID reçu) :

```toml
# Configuration lue par `npx wrangler deploy` lancé à la racine (Cloudflare Workers Builds).
# Même Worker que relay/wrangler.toml, utilisé en local depuis le dossier relay.
name = "wikimasters-tools"
main = "relay/src/index.ts"
compatibility_date = "2026-10-01"

[[kv_namespaces]]
binding = "DOC_CACHE"
id = "<ID reçu>"
```

Même contenu pour `relay/wrangler.toml` avec `main = "src/index.ts"`. Supprimer `relay/src/index.js` (`git rm relay/src/index.js`). Mettre à jour `relay/README.md` : routes `/ping`, `/search`, `/oembed`, binding `DOC_CACHE`, secrets `YOUTUBE_API_KEY` et `DEBUG_TOKEN` (facultatif, Task 9).

- [ ] **Step 9: Valider le déploiement à blanc**

Run: `npx --yes wrangler@4 deploy --dry-run`
Expected: `Total Upload` sans erreur, binding `DOC_CACHE` listé.

- [ ] **Step 10: Commit, PR 2, vérification en ligne**

```bash
git add wrangler.toml relay tests/relay
git commit -m "feat(relais): recherche YouTube notée, cache KV, plafond journalier, oEmbed"
```
Pousser, fusionner (Cloudflare redéploie). Puis vérifier avec le secret en place :

```bash
curl "https://wikimasters-tools.maxime-protais-baumer.workers.dev/search?qid=Q2280&kind=event&names=Bataille%20de%20Verdun%7CVerdun&start=1916&end=1916"
curl "https://wikimasters-tools.maxime-protais-baumer.workers.dev/oembed?id=dQw4w9WgXcQ"
```
Expected: `{"ok":true,"candidates":[…],"cached":false}` (ou liste vide) puis, au second appel, `"cached":true` ; l'oEmbed rend `ok:true` et un titre. Une réponse `{"ok":false,"reason":"upstream","…"}` avec 503 = secret ou KV mal reliés (revoir Settings → Bindings / Variables et secrets).

---

### Task 4: Clients de l'extension (relais, Commons, sélection)

**Files:**
- Create: `src/core/documentary/config.ts`, `relay-api.ts`, `commons-api.ts`, `selection.ts`, `format.ts`, `documentaires.json`
- Test: `tests/core/documentary/relay-api.test.ts`, `commons-api.test.ts`, `selection.test.ts`, `format.test.ts`

**Interfaces:**
- Consumes: `DocCandidate`, `DocSubject`, `candidateSchema` (Task 1), `scoreCandidate`, `passes`, `COMMONS_RULES`.
- Produces: `createRelayApi({ fetch, base? })` → `{ search(subject): Promise<RelayResult>, oembed(key): Promise<OembedResult> }` ; `searchCommons(fetchFn, names): Promise<DocCandidate[]>` (déjà notés et filtrés, du mieux noté au moins bien) ; `parseSelection(json, qid): DocCandidate[]` ; `formatDuration(sec)` ; `searchLinks(name)`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// tests/core/documentary/relay-api.test.ts
import { describe, expect, it } from 'vitest';
import { createRelayApi } from '../../../src/core/documentary/relay-api';

const subject = { qid: 'Q2280', kind: 'event' as const, names: ['Bataille de Verdun', 'Verdun'], startYear: 1916, endYear: 1916 };
const candidate = { source: 'youtube', id: 'AAA', title: 'Verdun', channel: 'ARTE', durationSec: 3120, language: 'fr', description: '', url: 'https://www.youtube.com/watch?v=AAA' };
const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

describe('createRelayApi.search', () => {
  it('envoie le sujet et rend les candidats', async () => {
    let seen = '';
    const api = createRelayApi({ fetch: async (url) => ((seen = url), new Response(JSON.stringify({ ok: true, candidates: [candidate], cached: false }))), base: 'https://relais.test' });
    const result = await api.search(subject);
    expect(result).toEqual({ status: 'ok', candidates: [candidate] });
    expect(seen).toBe('https://relais.test/search?qid=Q2280&kind=event&names=Bataille+de+Verdun%7CVerdun&start=1916&end=1916');
  });
  it('omet les années inconnues', async () => {
    let seen = '';
    const api = createRelayApi({ fetch: async (url) => ((seen = url), new Response(JSON.stringify({ ok: true, candidates: [], cached: true }))), base: 'https://r.test' });
    await api.search({ ...subject, startYear: null, endYear: null });
    expect(seen).not.toContain('start=');
  });
  it('« plafond atteint » et « YouTube en panne » donnent busy', async () => {
    expect(await createRelayApi({ fetch: reply({ ok: false, reason: 'budget' }) }).search(subject)).toEqual({ status: 'busy' });
    expect(await createRelayApi({ fetch: reply({ ok: false, reason: 'upstream' }, 503) }).search(subject)).toEqual({ status: 'busy' });
  });
  it('lève sur une réponse illisible ou une requête refusée', async () => {
    await expect(createRelayApi({ fetch: reply({ nimporte: 1 }) }).search(subject)).rejects.toThrow();
    await expect(createRelayApi({ fetch: reply({ ok: false, reason: 'bad-request' }, 400) }).search(subject)).rejects.toThrow('Relais');
  });
});

describe('createRelayApi.oembed', () => {
  it('rend le titre et la chaîne, ou la raison du refus', async () => {
    expect(await createRelayApi({ fetch: reply({ ok: true, title: 'T', channel: 'C' }) }).oembed('AAA')).toEqual({ ok: true, title: 'T', channel: 'C' });
    expect(await createRelayApi({ fetch: reply({ ok: false, reason: 'not-embeddable' }) }).oembed('AAA')).toEqual({ ok: false, reason: 'not-embeddable' });
    expect(await createRelayApi({ fetch: reply({ ok: false, reason: 'upstream' }, 502) }).oembed('AAA')).toEqual({ ok: false, reason: 'busy' });
  });
});
```

```ts
// tests/core/documentary/commons-api.test.ts
import { describe, expect, it } from 'vitest';
import { searchCommons } from '../../../src/core/documentary/commons-api';

const page = (title: string, duration: number, extra: Record<string, unknown> = {}) => ({
  title,
  videoinfo: [{ url: `https://upload.wikimedia.org/${encodeURIComponent(title)}`, mime: 'video/webm', duration, thumburl: 'https://thumb.test/t.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Felicitas Graßl</a>' }, ImageDescription: { value: 'Un <b>film</b>' } }, ...extra }],
});

describe('searchCommons', () => {
  it('garde les vidéos notées pertinentes, avec licence et auteur nettoyés', async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ query: { pages: [page('File:La Révolution française et Napoléon - Planet Wissen.webm', 100), page('File:Napoleon extrait.webm', 20), page('File:Autre sujet.webm', 600)] } }));
    const found = await searchCommons(fetchFn, ['Napoléon Ier', 'Napoleon'], { qid: 'Q517', kind: 'person', startYear: 1769, endYear: 1821 });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      source: 'commons',
      id: 'File:La Révolution française et Napoléon - Planet Wissen.webm',
      title: 'La Révolution française et Napoléon - Planet Wissen',
      channel: 'Felicitas Graßl',
      durationSec: 100,
      license: 'CC BY-SA 4.0',
      thumbUrl: 'https://thumb.test/t.jpg',
      url: 'https://commons.wikimedia.org/wiki/File%3ALa%20R%C3%A9volution%20fran%C3%A7aise%20et%20Napol%C3%A9on%20-%20Planet%20Wissen.webm',
    });
  });
  it('rend une liste vide sans résultat', async () => {
    expect(await searchCommons(async () => new Response(JSON.stringify({ batchcomplete: '' })), ['Verdun'], { qid: 'Q1', kind: 'event', startYear: null, endYear: null })).toEqual([]);
  });
  it('lève sur une panne', async () => {
    await expect(searchCommons(async () => new Response('', { status: 500 }), ['Verdun'], { qid: 'Q1', kind: 'event', startYear: null, endYear: null })).rejects.toThrow('Commons : HTTP 500');
  });
});
```

```ts
// tests/core/documentary/selection.test.ts
import { describe, expect, it } from 'vitest';
import { parseSelection } from '../../../src/core/documentary/selection';

describe('parseSelection', () => {
  const file = { Q2280: [{ id: 'AAA', title: 'Verdun 14-18', channel: 'INA', durationSec: 1500 }], Q517: [] };
  it('transforme les entrées d’un sujet en candidats « sélection »', () => {
    expect(parseSelection(file, 'Q2280')).toEqual([
      { source: 'selection', id: 'AAA', title: 'Verdun 14-18', channel: 'INA', durationSec: 1500, language: null, description: '', url: 'https://www.youtube.com/watch?v=AAA', thumbUrl: 'https://img.youtube.com/vi/AAA/hqdefault.jpg' },
    ]);
  });
  it('rend une liste vide pour un sujet absent ou sans entrée', () => {
    expect(parseSelection(file, 'Q1')).toEqual([]);
    expect(parseSelection(file, 'Q517')).toEqual([]);
  });
  it('ignore une entrée à la clé invalide et lève sur un fichier mal formé', () => {
    expect(parseSelection({ Q1: [{ id: 'pas une clé !', title: 'x', channel: 'y', durationSec: null }] }, 'Q1')).toEqual([]);
    expect(() => parseSelection('n’importe quoi', 'Q1')).toThrow();
  });
});
```

```ts
// tests/core/documentary/format.test.ts
import { describe, expect, it } from 'vitest';
import { formatDuration, searchLinks } from '../../../src/core/documentary/format';

describe('formatDuration', () => {
  it('écrit minutes ou heures', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(3120)).toBe('52 min');
    expect(formatDuration(3900)).toBe('1 h 05');
    expect(formatDuration(null)).toBe('');
  });
});

describe('searchLinks', () => {
  it('encode le nom dans trois recherches', () => {
    const links = searchLinks('Jeanne d’Arc');
    expect(links.map((link) => link.label)).toEqual(['YouTube', 'Arte', 'INA']);
    expect(links[0]?.url).toBe('https://www.youtube.com/results?search_query=Jeanne%20d%E2%80%99Arc%20documentaire');
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/documentary` → FAIL (modules introuvables).

- [ ] **Step 3: Implémenter**

```ts
// src/core/documentary/config.ts
// Relais de recherche de documentaires (Cloudflare Worker, dossier `relay/`).
export const RELAY_BASE = 'https://wikimasters-tools.maxime-protais-baumer.workers.dev';
// Documentaires validés à la main : fichier `documentaires.json` du dépôt, lu à l'exécution (mise à jour sans republier l'extension).
export const SELECTION_URL = 'https://raw.githubusercontent.com/maximus49000/wikimasters-tools/main/documentaires.json';
```

```ts
// src/core/documentary/relay-api.ts
import { z } from 'zod';
import { RELAY_BASE } from './config';
import { candidateSchema, type DocCandidate, type DocSubject } from './types';

export type RelayResult = { status: 'ok'; candidates: DocCandidate[] } | { status: 'busy' };
export type OembedResult = { ok: true; title: string; channel: string } | { ok: false; reason: 'not-found' | 'not-embeddable' | 'busy' };

const searchSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), candidates: z.array(candidateSchema) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
const oembedSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), title: z.string(), channel: z.string() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

type Options = { fetch: (url: string) => Promise<Response>; base?: string };

// Le relais ne reçoit que l'identifiant Wikidata, les noms et les années de la carte : rien du jeu ni du compte.
export function createRelayApi({ fetch: doFetch, base = RELAY_BASE }: Options) {
  return {
    async search(subject: DocSubject): Promise<RelayResult> {
      const params = new URLSearchParams({ qid: subject.qid, kind: subject.kind, names: subject.names.slice(0, 6).join('|') });
      if (subject.startYear !== null) params.set('start', String(subject.startYear));
      if (subject.endYear !== null) params.set('end', String(subject.endYear));
      const response = await doFetch(`${base}/search?${params.toString()}`);
      const body = searchSchema.parse(await response.json());
      if (body.ok) return { status: 'ok', candidates: body.candidates };
      // Plafond du jour atteint ou YouTube en panne : on réessaiera plus tard, ce n'est pas une absence de documentaire.
      if (body.reason === 'budget' || body.reason === 'upstream') return { status: 'busy' };
      throw new Error(`Relais : ${body.reason}`);
    },

    async oembed(key: string): Promise<OembedResult> {
      const response = await doFetch(`${base}/oembed?${new URLSearchParams({ id: key }).toString()}`);
      const body = oembedSchema.parse(await response.json());
      if (body.ok) return body;
      return { ok: false, reason: body.reason === 'not-found' || body.reason === 'not-embeddable' ? body.reason : 'busy' };
    },
  };
}
export type RelayApi = ReturnType<typeof createRelayApi>;
```

```ts
// src/core/documentary/commons-api.ts
import { z } from 'zod';
import { COMMONS_RULES, passes, scoreCandidate } from './score';
import type { DocCandidate, DocSubject } from './types';

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
type FetchLike = (url: string) => Promise<Response>;

const metaValue = z.object({ value: z.string() }).optional();
const pagesSchema = z.object({
  query: z
    .object({
      pages: z.array(
        z.object({
          title: z.string(),
          videoinfo: z
            .array(
              z.object({
                url: z.string(),
                duration: z.number().optional(),
                thumburl: z.string().optional(),
                extmetadata: z.object({ LicenseShortName: metaValue, Artist: metaValue, ImageDescription: metaValue }).optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
});

// Les valeurs d'extmetadata contiennent du HTML ; l'interface les affiche en texte simple.
const plain = (html: string | undefined): string => (html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// Vidéos libres de Commons dont le titre porte un des noms du sujet, notées avec les mêmes règles que YouTube (plancher de durée plus bas, léger bonus).
export async function searchCommons(fetchFn: FetchLike, names: string[], subject: Pick<DocSubject, 'qid' | 'kind' | 'startYear' | 'endYear'>): Promise<DocCandidate[]> {
  const first = names[0];
  if (!first) return [];
  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `${first} filetype:video`, gsrnamespace: '6', gsrlimit: '10',
    prop: 'videoinfo', viprop: 'url|size|mime|duration|extmetadata', viurlwidth: '640', format: 'json', formatversion: '2', origin: '*',
  });
  const response = await fetchFn(`${COMMONS}?${params.toString()}`);
  if (!response.ok) throw new Error(`Commons : HTTP ${response.status}`);
  const parsed = pagesSchema.parse(await response.json());
  const full: DocSubject = { ...subject, names };
  const scored: { candidate: DocCandidate; score: number }[] = [];
  for (const page of parsed.query?.pages ?? []) {
    const info = page.videoinfo?.[0];
    if (!info) continue;
    const candidate: DocCandidate = {
      source: 'commons',
      id: page.title,
      title: page.title.replace(/^File:/, '').replace(/\.[A-Za-z0-9]+$/, ''),
      channel: plain(info.extmetadata?.Artist?.value),
      durationSec: info.duration ?? null,
      language: null,
      description: plain(info.extmetadata?.ImageDescription?.value),
      url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      mediaUrl: info.url,
      ...(info.thumburl ? { thumbUrl: info.thumburl } : {}),
      ...(info.extmetadata?.LicenseShortName?.value ? { license: plain(info.extmetadata.LicenseShortName.value) } : {}),
    };
    const result = scoreCandidate(full, candidate, COMMONS_RULES);
    if (passes(result)) scored.push({ candidate, score: result.score });
  }
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.candidate);
}
```

```ts
// src/core/documentary/selection.ts
import { z } from 'zod';
import type { DocCandidate } from './types';

// Format de `documentaires.json` : { "Q2280": [ { "id": "<clé YouTube>", "title": "…", "channel": "…", "durationSec": 3120 } ] }
const KEY = /^[\w-]{3,32}$/;
const fileSchema = z.record(z.string(), z.array(z.object({ id: z.string(), title: z.string(), channel: z.string(), durationSec: z.number().nullable() })));

export function parseSelection(json: unknown, qid: string): DocCandidate[] {
  const file = fileSchema.parse(json);
  return (file[qid] ?? [])
    .filter((entry) => KEY.test(entry.id))
    .map((entry) => ({
      source: 'selection' as const,
      id: entry.id,
      title: entry.title,
      channel: entry.channel,
      durationSec: entry.durationSec,
      language: null,
      description: '',
      url: `https://www.youtube.com/watch?v=${entry.id}`,
      thumbUrl: `https://img.youtube.com/vi/${entry.id}/hqdefault.jpg`,
    }));
}
```

```ts
// src/core/documentary/format.ts
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

// Repli quand aucune vidéo n'est assez pertinente : recherche « nom + documentaire » chez trois diffuseurs.
export function searchLinks(name: string): { label: string; url: string }[] {
  const query = encodeURIComponent(`${name} documentaire`);
  const plain = encodeURIComponent(name);
  return [
    { label: 'YouTube', url: `https://www.youtube.com/results?search_query=${query}` },
    { label: 'Arte', url: `https://www.arte.tv/fr/search/?q=${plain}` },
    { label: 'INA', url: `https://www.ina.fr/recherche/${plain}` },
  ];
}
```

`documentaires.json` (racine) : `{}`

- [ ] **Step 4: Vérifier** — `npx vitest run tests/core/documentary && npm run typecheck` → PASS.
- [ ] **Step 5: Vérifier les adresses de recherche** — ouvrir `searchLinks('Napoléon')` pour les trois diffuseurs dans le navigateur ; corriger `format.ts` ET son test si INA ou Arte utilisent une autre forme d'adresse.
- [ ] **Step 6: Commit** — `git add src/core/documentary documentaires.json tests/core/documentary && git commit -m "feat(documentaire): clients relais, Commons et sélection"`

---

### Task 5: Propositions, masquages et envoi d'issues

**Files:**
- Modify: `src/core/anomalies/anomaly.ts` (extraire `postIssue`)
- Create: `src/core/documentary/proposal.ts`, `src/core/documentary/documentary-repo.ts`
- Test: `tests/core/documentary/proposal.test.ts`, `tests/core/documentary/documentary-repo.test.ts` (les tests existants des anomalies doivent rester verts)

**Interfaces:**
- Consumes: `ANOMALY_API_PREFIX` (`../anomalies/config`), `KeyValueStore`, `DocCandidate`.
- Produces: `IssueDraft`, `postIssue(fetch, token, draft)` ; `parseYoutubeKey(input)`, `buildProposalIssue(input)`, `buildFlagIssue(input)`, `PROPOSAL_LABEL`, `FLAG_LABEL` ; `createDocumentaryRepo(store)` → `{ proposals(slug), addProposal(slug, candidate), flagged(slug), addFlag(slug, id) }`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// tests/core/documentary/proposal.test.ts
import { describe, expect, it } from 'vitest';
import { buildFlagIssue, buildProposalIssue, FLAG_LABEL, parseYoutubeKey, PROPOSAL_LABEL } from '../../../src/core/documentary/proposal';

describe('parseYoutubeKey', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('lit %s', (input, key) => expect(parseYoutubeKey(input)).toBe(key));

  it('refuse ce qui n’est pas YouTube', () => {
    expect(parseYoutubeKey('https://exemple.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYoutubeKey('pas un lien !')).toBeNull();
    expect(parseYoutubeKey('')).toBeNull();
  });
});

const input = { qid: 'Q2280', slug: 'Bataille_de_Verdun', cardTitle: 'Bataille de Verdun', key: 'dQw4w9WgXcQ', videoTitle: 'Verdun @pseudo', channel: 'ARTE', platform: 'extension du navigateur', name: 'Max' };

describe('issues', () => {
  it('une proposition porte l’étiquette, la carte, le lien et neutralise les @', () => {
    const issue = buildProposalIssue(input);
    expect(issue.labels).toEqual([PROPOSAL_LABEL]);
    expect(issue.title).toBe('Documentaire proposé : Bataille de Verdun');
    expect(issue.body).toContain('Q2280');
    expect(issue.body).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(issue.body).toContain('@​pseudo');
    expect(issue.body).toContain('Max');
  });
  it('un signalement « pas pertinent » a son étiquette et reste anonyme sans nom', () => {
    const issue = buildFlagIssue({ ...input, name: null });
    expect(issue.labels).toEqual([FLAG_LABEL]);
    expect(issue.title).toBe('Documentaire non pertinent : Bataille de Verdun');
    expect(issue.body).toContain('anonyme');
  });
});
```

```ts
// tests/core/documentary/documentary-repo.test.ts
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createDocumentaryRepo } from '../../../src/core/documentary/documentary-repo';

const proposal = { source: 'proposal' as const, id: 'AAA', title: 'T', channel: 'C', durationSec: null, language: null, description: '', url: 'https://www.youtube.com/watch?v=AAA' };

describe('createDocumentaryRepo', () => {
  it('mémorise les propositions de l’utilisateur sans doublon', async () => {
    const repo = createDocumentaryRepo(createMemoryStore());
    expect(await repo.proposals('Verdun')).toEqual([]);
    await repo.addProposal('Verdun', proposal);
    await repo.addProposal('Verdun', proposal);
    expect(await repo.proposals('Verdun')).toEqual([proposal]);
    expect(await repo.proposals('Autre')).toEqual([]);
  });
  it('mémorise les vidéos signalées « pas pertinent », par carte', async () => {
    const repo = createDocumentaryRepo(createMemoryStore());
    await repo.addFlag('Verdun', 'AAA');
    await repo.addFlag('Verdun', 'AAA');
    await repo.addFlag('Verdun', 'BBB');
    expect(await repo.flagged('Verdun')).toEqual(['AAA', 'BBB']);
    expect(await repo.flagged('Autre')).toEqual([]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/documentary/proposal.test.ts tests/core/documentary/documentary-repo.test.ts` → FAIL.

- [ ] **Step 3: Extraire `postIssue` de `anomaly.ts`**

Dans `src/core/anomalies/anomaly.ts`, ajouter après `buildIssue` :

```ts
export type IssueDraft = { title: string; body: string; labels: string[] };

// Crée une issue GitHub ; partagé par « Remonter une anomalie » et les propositions de documentaire.
export async function postIssue(doFetch: Fetch, token: string, draft: IssueDraft): Promise<AnomalyResult> {
  try {
    const response = await doFetch(`${ANOMALY_API_PREFIX}issues`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!response.ok) return { ok: false, error: `GitHub a refusé l’envoi (code ${response.status}).` };
    const created = (await response.json()) as { number?: unknown; html_url?: unknown };
    if (typeof created.number !== 'number') return { ok: false, error: 'Réponse inattendue de GitHub.' };
    return { ok: true, number: created.number, url: typeof created.html_url === 'string' ? created.html_url : '' };
  } catch {
    return { ok: false, error: 'Envoi impossible : vérifiez la connexion.' };
  }
}
```
(Déplacer `type Fetch` au-dessus de `postIssue` si besoin.) Remplacer le corps du `try` de `createAnomalyReporter.report` par `return postIssue(doFetch, token, buildIssue(input));` après le contrôle de description vide. Lancer `npx vitest run tests/core/anomalies` : les tests existants restent verts.

- [ ] **Step 4: Implémenter**

```ts
// src/core/documentary/proposal.ts
export const PROPOSAL_LABEL = 'Proposition documentaire';
export const FLAG_LABEL = 'Documentaire non pertinent';

const KEY = /^[\w-]{11}$/;

// Clé de vidéo YouTube depuis un lien (watch, youtu.be, embed, shorts) ou la clé seule ; null sinon.
export function parseYoutubeKey(input: string): string | null {
  const text = input.trim();
  if (KEY.test(text)) return text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  let key: string | null = null;
  if (host === 'youtu.be') key = url.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    key = url.searchParams.get('v') ?? (/^\/(?:embed|shorts)\/([\w-]{11})/.exec(url.pathname)?.[1] ?? null);
  }
  return key !== null && KEY.test(key) ? key : null;
}

export type ProposalInput = { qid: string; slug: string; cardTitle: string; key: string; videoTitle: string; channel: string; platform: string; name: string | null };

// Un « @pseudo » dans le texte notifierait un compte GitHub : on l'en empêche.
const defuse = (text: string): string => text.replace(/@/g, '@​');

function body(input: ProposalInput): string {
  const details = [
    `Carte : ${defuse(input.cardTitle)} (${input.slug})`,
    `Élément Wikidata : ${input.qid}`,
    `Vidéo : https://www.youtube.com/watch?v=${input.key}`,
    `Titre : ${defuse(input.videoTitle)}`,
    `Chaîne : ${defuse(input.channel)}`,
    `Plateforme : ${input.platform}`,
    `Signalé par : ${input.name ? defuse(input.name) : 'anonyme'}`,
  ];
  return details.map((line) => `- ${line}`).join('\n');
}

export const buildProposalIssue = (input: ProposalInput) => ({ title: `Documentaire proposé : ${defuse(input.cardTitle)}`, body: body(input), labels: [PROPOSAL_LABEL] });
export const buildFlagIssue = (input: ProposalInput) => ({ title: `Documentaire non pertinent : ${defuse(input.cardTitle)}`, body: body(input), labels: [FLAG_LABEL] });
```

```ts
// src/core/documentary/documentary-repo.ts
import type { KeyValueStore } from '../cache/store';
import type { DocCandidate } from './types';

const PROPOSALS_KEY = 'doc-proposals-v1';
const FLAGS_KEY = 'doc-flagged-v1';

// Ce que l'utilisateur a fait lui-même : ses propositions (visibles pour lui tout de suite) et les vidéos qu'il juge hors sujet (masquées chez lui).
export function createDocumentaryRepo(store: KeyValueStore) {
  let tail: Promise<unknown> = Promise.resolve();
  const update = <T>(key: string, change: (state: Record<string, T[]>) => Record<string, T[]>): Promise<void> => {
    const run = tail.then(async () => store.set(key, change((await store.get<Record<string, T[]>>(key)) ?? {})));
    tail = run.catch(() => undefined);
    return run;
  };
  const read = async <T>(key: string, slug: string): Promise<T[]> => {
    await tail;
    return ((await store.get<Record<string, T[]>>(key)) ?? {})[slug] ?? [];
  };
  return {
    proposals: (slug: string): Promise<DocCandidate[]> => read<DocCandidate>(PROPOSALS_KEY, slug),
    addProposal: (slug: string, candidate: DocCandidate): Promise<void> =>
      update<DocCandidate>(PROPOSALS_KEY, (state) => {
        const list = state[slug] ?? [];
        return list.some((entry) => entry.id === candidate.id) ? state : { ...state, [slug]: [...list, candidate] };
      }),
    flagged: (slug: string): Promise<string[]> => read<string>(FLAGS_KEY, slug),
    addFlag: (slug: string, id: string): Promise<void> =>
      update<string>(FLAGS_KEY, (state) => {
        const list = state[slug] ?? [];
        return list.includes(id) ? state : { ...state, [slug]: [...list, id] };
      }),
  };
}
export type DocumentaryRepo = ReturnType<typeof createDocumentaryRepo>;
```

- [ ] **Step 5: Vérifier** — `npx vitest run tests/core && npm run typecheck` → PASS.
- [ ] **Step 6: Commit** — `git add src/core tests/core && git commit -m "feat(documentaire): propositions, masquages et issues GitHub"`

---

### Task 6: Service du documentaire

**Files:**
- Create: `src/content/documentary-service.ts`, `src/content/documentary-registry.ts`
- Test: `tests/content/documentary-service.test.ts`

**Interfaces:**
- Consumes: `KnownCard` (`../core/collection/collection-book`), `KindsRepo`, `screenKindOf`, `mayBeHistory`, `historyKindOf`, `SubjectInfo`, `DocCandidate`, `DocSubject`, `RelayApi`, `DocumentaryRepo`, `IssueDraft`, `AnomalyResult`, `buildProposalIssue`, `buildFlagIssue`, `parseYoutubeKey`, `TtlCache`.
- Produces: `createDocumentaryService(deps)` → `{ view(slug, title), propose(slug, subject, cardTitle, link), flag(slug, subject, cardTitle, candidate) }` ; `DocView` ; `getDocumentaryService` / `setDocumentaryService`.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// tests/content/documentary-service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createDocumentaryService, type DocumentaryServiceDeps } from '../../src/content/documentary-service';
import { createMemoryStore } from '../../src/core/cache/store';
import { createDocumentaryRepo } from '../../src/core/documentary/documentary-repo';
import type { DocCandidate } from '../../src/core/documentary/types';

const cand = (id: string, source: DocCandidate['source'] = 'youtube'): DocCandidate => ({ source, id, title: `Vidéo ${id}`, channel: 'C', durationSec: 3000, language: 'fr', description: '', url: `https://www.youtube.com/watch?v=${id}` });
const noCache = { getOrLoad: <T>(_key: string, loader: () => Promise<T>) => loader() };

function setup(overrides: Partial<DocumentaryServiceDeps> = {}, natures = ['Q178561']) {
  const kinds = { natures, occupations: [], genres: [] };
  const sent: unknown[] = [];
  const deps: DocumentaryServiceDeps = {
    collection: { list: async () => [{ slug: 'Bataille_de_Verdun', title: 'Bataille de Verdun' } as never] },
    kinds: { resolveMissing: async () => undefined, load: async () => ({ cards: { Bataille_de_Verdun: kinds }, labels: {} }) },
    subject: async () => ({ qid: 'Q2280', names: ['Bataille de Verdun'], birth: null, death: null, start: 1916, end: 1916 }),
    selection: { forQid: async () => [] },
    commons: { search: async () => [] },
    relay: { search: async () => ({ status: 'ok', candidates: [cand('REL')] }), oembed: async () => ({ ok: true, title: 'Titre', channel: 'Chaîne' }) },
    repo: createDocumentaryRepo(createMemoryStore()),
    issues: { send: async (draft) => (sent.push(draft), { ok: true, number: 7, url: '' }) },
    cache: noCache,
    platform: () => 'extension du navigateur',
    profileName: () => null,
    ...overrides,
  };
  return { service: createDocumentaryService(deps), deps, sent };
}

describe('view', () => {
  it('rend les candidats du relais pour un événement historique', async () => {
    const { service } = setup();
    const view = await service.view('Bataille_de_Verdun', 'Bataille de Verdun');
    expect(view).toMatchObject({ status: 'detail', subject: { qid: 'Q2280', kind: 'event', startYear: 1916 } });
    expect(view.status === 'detail' && view.candidates.map((c) => c.id)).toEqual(['REL']);
  });

  it('ne dit rien d’une carte sans rapport, d’un film ou d’une carte hors collection', async () => {
    expect((await setup({}, ['Q515']).service.view('Bataille_de_Verdun', 'x')).status).toBe('none');
    expect((await setup({}, ['Q11424', 'Q178561']).service.view('Bataille_de_Verdun', 'x')).status).toBe('none');
    expect((await setup({ collection: { list: async () => [] } }).service.view('Bataille_de_Verdun', 'x')).status).toBe('none');
  });

  it('ne dit rien d’un humain vivant ou mort après 1950', async () => {
    const alive = setup({ subject: async () => ({ qid: 'Q1', names: ['Quelqu’un'], birth: 1970, death: null, start: null, end: null }) }, ['Q5']);
    expect((await alive.service.view('Bataille_de_Verdun', 'x')).status).toBe('none');
  });

  it('un humain mort avant 1950 a une période naissance–décès', async () => {
    const { service } = setup({ subject: async () => ({ qid: 'Q517', names: ['Napoléon Ier'], birth: 1769, death: 1821, start: null, end: null }) }, ['Q5']);
    const view = await service.view('Bataille_de_Verdun', 'Napoléon');
    expect(view).toMatchObject({ status: 'detail', subject: { kind: 'person', startYear: 1769, endYear: 1821 } });
  });

  it('les propositions de l’utilisateur et la sélection passent avant tout, et arrêtent la recherche', async () => {
    const relay = vi.fn(async () => ({ status: 'ok' as const, candidates: [cand('REL')] }));
    const { service, deps } = setup({ selection: { forQid: async () => [cand('SEL', 'selection')] }, relay: { search: relay, oembed: async () => ({ ok: false, reason: 'busy' }) } });
    await deps.repo.addProposal('Bataille_de_Verdun', cand('MINE', 'proposal'));
    const view = await service.view('Bataille_de_Verdun', 'x');
    expect(view.status === 'detail' && view.candidates.map((c) => c.id)).toEqual(['MINE', 'SEL']);
    expect(relay).not.toHaveBeenCalled();
  });

  it('Commons passe avant le relais', async () => {
    const relay = vi.fn(async () => ({ status: 'ok' as const, candidates: [cand('REL')] }));
    const { service } = setup({ commons: { search: async () => [cand('COM', 'commons')] }, relay: { search: relay, oembed: async () => ({ ok: false, reason: 'busy' }) } });
    const view = await service.view('Bataille_de_Verdun', 'x');
    expect(view.status === 'detail' && view.candidates.map((c) => c.id)).toEqual(['COM']);
    expect(relay).not.toHaveBeenCalled();
  });

  it('une panne de Commons n’empêche pas le relais', async () => {
    const { service } = setup({ commons: { search: async () => { throw new Error('HTTP 500'); } } });
    expect((await service.view('Bataille_de_Verdun', 'x')).status).toBe('detail');
  });

  it('retire les vidéos que l’utilisateur a jugées hors sujet', async () => {
    const { service, deps } = setup({ relay: { search: async () => ({ status: 'ok', candidates: [cand('REL'), cand('AUT')] }), oembed: async () => ({ ok: false, reason: 'busy' }) } });
    await deps.repo.addFlag('Bataille_de_Verdun', 'REL');
    const view = await service.view('Bataille_de_Verdun', 'x');
    expect(view.status === 'detail' && view.candidates.map((c) => c.id)).toEqual(['AUT']);
  });

  it('rien de pertinent : fiche vide ; relais occupé : fiche vide « busy » ; panne : erreur', async () => {
    const none = setup({ relay: { search: async () => ({ status: 'ok', candidates: [] }), oembed: async () => ({ ok: false, reason: 'busy' }) } });
    expect(await none.service.view('Bataille_de_Verdun', 'x')).toMatchObject({ status: 'empty', busy: false });
    const busy = setup({ relay: { search: async () => ({ status: 'busy' }), oembed: async () => ({ ok: false, reason: 'busy' }) } });
    expect(await busy.service.view('Bataille_de_Verdun', 'x')).toMatchObject({ status: 'empty', busy: true });
    const broken = setup({ subject: async () => { throw new Error('HTTP 429'); } });
    expect((await broken.service.view('Bataille_de_Verdun', 'x')).status).toBe('error');
  });
});

describe('propose', () => {
  const subject = { qid: 'Q2280', kind: 'event' as const, names: ['Bataille de Verdun'], startYear: 1916, endYear: 1916 };
  it('vérifie la vidéo, la garde pour l’utilisateur et crée l’issue', async () => {
    const { service, deps, sent } = setup();
    const result = await service.propose('Bataille_de_Verdun', subject, 'Bataille de Verdun', 'https://youtu.be/dQw4w9WgXcQ');
    expect(result).toEqual({ ok: true, sent: true });
    expect((await deps.repo.proposals('Bataille_de_Verdun'))[0]).toMatchObject({ source: 'proposal', id: 'dQw4w9WgXcQ', title: 'Titre', channel: 'Chaîne' });
    expect(sent).toHaveLength(1);
  });
  it('refuse un lien qui n’est pas YouTube et une vidéo non intégrable', async () => {
    const { service } = setup({ relay: { search: async () => ({ status: 'busy' }), oembed: async () => ({ ok: false, reason: 'not-embeddable' }) } });
    expect(await service.propose('Bataille_de_Verdun', subject, 'x', 'https://exemple.com')).toEqual({ ok: false, error: 'Ce lien n’est pas une vidéo YouTube.' });
    expect(await service.propose('Bataille_de_Verdun', subject, 'x', 'dQw4w9WgXcQ')).toEqual({ ok: false, error: 'Cette vidéo ne peut pas être intégrée ailleurs que sur YouTube.' });
  });
  it('garde la proposition même si l’envoi échoue ou n’est pas configuré', async () => {
    const failing = setup({ issues: { send: async () => ({ ok: false, error: 'GitHub a refusé' }) } });
    expect(await failing.service.propose('Bataille_de_Verdun', subject, 'x', 'dQw4w9WgXcQ')).toEqual({ ok: true, sent: false });
    const without = setup({ issues: null });
    expect(await without.service.propose('Bataille_de_Verdun', subject, 'x', 'dQw4w9WgXcQ')).toEqual({ ok: true, sent: false });
  });
});

describe('flag', () => {
  it('masque la vidéo chez l’utilisateur et crée l’issue', async () => {
    const { service, deps, sent } = setup();
    await service.flag('Bataille_de_Verdun', { qid: 'Q2280', kind: 'event', names: ['Bataille de Verdun'], startYear: 1916, endYear: 1916 }, 'Bataille de Verdun', cand('REL'));
    expect(await deps.repo.flagged('Bataille_de_Verdun')).toEqual(['REL']);
    expect(sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/content/documentary-service.test.ts` → FAIL.

- [ ] **Step 3: Implémenter**

```ts
// src/content/documentary-service.ts
import type { AnomalyResult, IssueDraft } from '../core/anomalies/anomaly';
import type { TtlCache } from '../core/cache/ttl-cache';
import type { KnownCard } from '../core/collection/collection-book';
import type { DocumentaryRepo } from '../core/documentary/documentary-repo';
import { historyKindOf, mayBeHistory } from '../core/documentary/history-kinds';
import { buildFlagIssue, buildProposalIssue, parseYoutubeKey } from '../core/documentary/proposal';
import type { OembedResult, RelayResult } from '../core/documentary/relay-api';
import type { SubjectInfo } from '../core/documentary/subject';
import type { DocCandidate, DocSubject } from '../core/documentary/types';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { screenKindOf } from '../core/screen/screen-kinds';

export type DocView =
  | { status: 'none' }
  | { status: 'detail'; subject: DocSubject; candidates: DocCandidate[] }
  // `busy` : le relais n'a pas pu chercher (plafond du jour, panne) ; on redemandera plus tard.
  | { status: 'empty'; subject: DocSubject; busy: boolean }
  | { status: 'error'; message: string };

export type DocumentaryServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  subject: (slug: string) => Promise<SubjectInfo | null>;
  selection: { forQid(qid: string): Promise<DocCandidate[]> };
  commons: { search(names: string[], subject: Pick<DocSubject, 'qid' | 'kind' | 'startYear' | 'endYear'>): Promise<DocCandidate[]> };
  relay: { search(subject: DocSubject): Promise<RelayResult>; oembed(key: string): Promise<OembedResult> };
  repo: Pick<DocumentaryRepo, 'proposals' | 'addProposal' | 'flagged' | 'addFlag'>;
  // null : pas de jeton GitHub (propositions gardées chez l'utilisateur seulement).
  issues: { send(draft: IssueDraft): Promise<AnomalyResult> } | null;
  cache: Pick<TtlCache, 'getOrLoad'>;
  platform: () => string;
  profileName: () => string | null;
};

export function createDocumentaryService(deps: DocumentaryServiceDeps) {
  const { collection, kinds, subject: subjectOf, selection, commons, relay, repo, issues, cache } = deps;

  // Un « jamais cherché » ne doit pas être confondu avec une panne : seule une réponse est mémorisée (le cache ne garde pas les exceptions).
  const cached = <T>(key: string, loader: () => Promise<T>): Promise<T> => cache.getOrLoad(key, loader);

  async function find(slug: string, subject: DocSubject): Promise<{ candidates: DocCandidate[]; busy: boolean }> {
    const curated = [...(await repo.proposals(slug)), ...(await cached(`doc-selection-v1-${subject.qid}`, () => selection.forQid(subject.qid)).catch(() => []))];
    if (curated.length > 0) return { candidates: curated, busy: false };
    const archives = await cached(`doc-commons-v1-${subject.qid}`, () => commons.search(subject.names, subject)).catch((): DocCandidate[] => []);
    if (archives.length > 0) return { candidates: archives, busy: false };
    try {
      const found = await cached(`doc-relay-v1-${subject.qid}`, async () => {
        const result = await relay.search(subject);
        if (result.status === 'busy') throw new Error('relais occupé');
        return result.candidates;
      });
      return { candidates: found, busy: false };
    } catch {
      return { candidates: [], busy: true };
    }
  }

  const draftInput = (slug: string, subject: DocSubject, cardTitle: string, key: string, videoTitle: string, channel: string) => ({
    qid: subject.qid, slug, cardTitle, key, videoTitle, channel, platform: deps.platform(), name: deps.profileName(),
  });

  return {
    // Ce que la fiche montre : rien (carte sans rapport), une liste de vidéos, une fiche vide (boutons de recherche) ou une erreur.
    async view(slug: string, _title: string): Promise<DocView> {
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const cardKinds = (await kinds.load()).cards[slug];
        const screen = screenKindOf(cardKinds);
        if (screen === 'film' || screen === 'series' || !mayBeHistory(cardKinds)) return { status: 'none' };
        const info = await cached(`doc-subject-v1-${slug}`, () => subjectOf(slug));
        if (!info) return { status: 'none' };
        const kind = historyKindOf(cardKinds, info.death);
        if (!kind) return { status: 'none' };
        const subject: DocSubject = { qid: info.qid, kind, names: info.names, startYear: kind === 'person' ? info.birth : info.start, endYear: kind === 'person' ? info.death : info.end };
        const hidden = new Set(await repo.flagged(slug));
        const { candidates, busy } = await find(slug, subject);
        const shown = candidates.filter((candidate) => !hidden.has(candidate.id));
        return shown.length > 0 ? { status: 'detail', subject, candidates: shown } : { status: 'empty', subject, busy };
      } catch {
        return { status: 'error', message: 'Le documentaire est indisponible pour le moment.' };
      }
    },

    // « Proposer un documentaire » : lien vérifié (existe, intégrable), gardé pour l'utilisateur tout de suite, signalé à GitHub si possible.
    async propose(slug: string, subject: DocSubject, cardTitle: string, link: string): Promise<{ ok: true; sent: boolean } | { ok: false; error: string }> {
      const key = parseYoutubeKey(link);
      if (!key) return { ok: false, error: 'Ce lien n’est pas une vidéo YouTube.' };
      const check = await relay.oembed(key).catch((): OembedResult => ({ ok: false, reason: 'busy' }));
      if (!check.ok) {
        const reasons = { 'not-found': 'Cette vidéo est introuvable.', 'not-embeddable': 'Cette vidéo ne peut pas être intégrée ailleurs que sur YouTube.', busy: 'Vérification impossible pour le moment, réessayez plus tard.' };
        return { ok: false, error: reasons[check.reason] };
      }
      await repo.addProposal(slug, { source: 'proposal', id: key, title: check.title, channel: check.channel, durationSec: null, language: null, description: '', url: `https://www.youtube.com/watch?v=${key}`, thumbUrl: `https://img.youtube.com/vi/${key}/hqdefault.jpg` });
      const sent = issues ? (await issues.send(buildProposalIssue(draftInput(slug, subject, cardTitle, key, check.title, check.channel)))).ok : false;
      return { ok: true, sent };
    },

    // « Pas pertinent » : la vidéo disparaît de cette fiche chez l'utilisateur ; l'issue permet à l'auteur du projet de la retirer pour tous.
    async flag(slug: string, subject: DocSubject, cardTitle: string, candidate: DocCandidate): Promise<void> {
      await repo.addFlag(slug, candidate.id);
      if (issues) await issues.send(buildFlagIssue(draftInput(slug, subject, cardTitle, candidate.id, candidate.title, candidate.channel)));
    },
  };
}
export type DocumentaryService = ReturnType<typeof createDocumentaryService>;
```

```ts
// src/content/documentary-registry.ts
import type { DocumentaryService } from './documentary-service';

// Le service est créé une fois par la surcouche ; les fiches de carte le lisent ici.
let service: DocumentaryService | null = null;

export const setDocumentaryService = (next: DocumentaryService | null): void => {
  service = next;
};
export const getDocumentaryService = (): DocumentaryService | null => service;
```

- [ ] **Step 4: Vérifier** — `npx vitest run tests/content/documentary-service.test.ts && npm run typecheck` → PASS. Corriger le typage de `issues: null` et de la carte `{ slug, title } as never` si `KnownCard` exige d'autres champs.
- [ ] **Step 5: Commit, PR 3** — `git add src tests && git commit -m "feat(documentaire): service (propositions, sélection, Commons, relais)"` ; `npm test && npm run build` ; pousser, fusionner.

---

### Task 7: Interface et câblage

**Files:**
- Create: `src/content/DocumentaryPlayer.tsx`, `src/content/DocumentarySection.tsx`, `src/content/DocumentaryProposeDialog.tsx`
- Modify: `src/content/decorate-listen.ts`, `src/content/mount.tsx`, `src/app/overlay.ts` ; tout autre fichier qui cite `BOOK_HOST_ATTRIBUTE` (le repérer avec `grep -rn BOOK_HOST_ATTRIBUTE src` et reproduire chaque usage pour `DOCUMENTARY_HOST_ATTRIBUTE`)

**Interfaces:**
- Consumes: `getDocumentaryService`, `DocView`, `DocCandidate`, `embedUrl`, `thumbnailUrl`, `watchUrl` (`../core/screen/screen-format`), `formatDuration`, `searchLinks`, `Glyph` (noms disponibles : `play pause note link unlink star back film refresh image card ticket cart external search close playlist disc swap gamepad book`), `useOverlayHost` (`./SoundtrackDialog`).
- Produces: `DocumentarySection({ slug, title })`, `mountDocumentarySection`, `pruneDocumentarySections`, `decorateDocumentary`, `DOCUMENTARY_HOST_ATTRIBUTE = 'data-wmt-documentary'`.

- [ ] **Step 1: Lecteur**

```tsx
// src/content/DocumentaryPlayer.tsx
import { useState } from 'react';
import type { DocCandidate } from '../core/documentary/types';
import { embedUrl, thumbnailUrl } from '../core/screen/screen-format';
import { Glyph } from './Glyphs';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const frame = { position: 'relative', width: '100%', aspectRatio: '16 / 9', maxHeight: 'min(240px, 34vh)', borderRadius: 8, overflow: 'hidden', background: '#000', border } as const;

// Miniature + ▶ ; rien n'est chargé chez un tiers avant le clic. YouTube : iframe sans cookie ; Commons : lecture directe du fichier libre.
export function DocumentaryPlayer({ candidate }: { candidate: DocCandidate }) {
  const [playing, setPlaying] = useState(false);
  const isCommons = candidate.source === 'commons' && candidate.mediaUrl !== undefined;
  const embed = isCommons ? null : embedUrl(candidate.id);
  const thumb = candidate.thumbUrl ?? (isCommons ? null : thumbnailUrl(candidate.id));
  if (!isCommons && !embed) return null;

  return (
    <div style={frame}>
      {playing && isCommons && <video src={candidate.mediaUrl} poster={thumb ?? undefined} controls autoPlay playsInline style={{ width: '100%', height: '100%', background: '#000' }} />}
      {playing && embed && (
        <iframe src={embed} title={candidate.title} allow="autoplay; encrypted-media; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" style={{ width: '100%', height: '100%', border: 0 }} />
      )}
      {!playing && (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label="Lire le documentaire"
          title="Lire le documentaire"
          style={{ width: '100%', height: '100%', cursor: 'pointer', border: 0, padding: 0, color: '#fff', background: thumb ? `center / cover no-repeat url(${thumb})` : '#1b2330', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name="play" size={22} />
          </span>
        </button>
      )}
      <a
        href={candidate.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ouvrir à la source"
        title="Ouvrir à la source"
        style={{ position: 'absolute', top: 4, right: 4, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Glyph name="external" size={16} />
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Boîte « Proposer un documentaire »**

```tsx
// src/content/DocumentaryProposeDialog.tsx
import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Glyph } from './Glyphs';
import { useOverlayHost } from './SoundtrackDialog';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const button = (primary: boolean, disabled: boolean): CSSProperties => ({
  flex: 1, minHeight: 44, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, font: '600 14px system-ui, sans-serif',
  color: primary ? '#0d1117' : 'inherit', background: primary ? 'var(--color-accent, #34d399)' : 'none', border: primary ? '1px solid transparent' : border, borderRadius: 8,
});

type Props = {
  // Rend l'erreur à afficher, ou { sent } si la proposition est enregistrée.
  onPropose: (link: string) => Promise<{ ok: true; sent: boolean } | { ok: false; error: string }>;
  onClose: () => void;
  onDone: () => void;
};

// Coller un lien YouTube : la vidéo est vérifiée (elle existe, elle s'intègre), visible tout de suite pour son auteur, relue avant d'être proposée aux autres.
export function DocumentaryProposeDialog({ onPropose, onClose, onDone }: Props) {
  const mountPoint = useOverlayHost();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ sent: boolean } | null>(null);
  if (!mountPoint) return null;

  const submit = async () => {
    if (busy || link.trim() === '') return;
    setBusy(true);
    setError(null);
    const result = await onPropose(link);
    setBusy(false);
    if (result.ok) {
      setDone({ sent: result.sent });
      onDone();
    } else setError(result.error);
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div role="dialog" aria-label="Proposer un documentaire" onClick={(event) => event.stopPropagation()} style={{ width: 'min(400px, 100%)', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: '#0d1117', color: '#e6edf3', font: '14px/20px system-ui, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Proposer un documentaire</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 }}>
            <Glyph name="close" />
          </button>
        </div>
        {done ? (
          <>
            <p role="status" style={{ margin: '0 0 12px' }}>{done.sent ? 'Merci ! Votre vidéo est visible chez vous ; elle sera relue avant d’être proposée aux autres.' : 'Votre vidéo est enregistrée chez vous. Elle n’a pas pu être envoyée pour relecture.'}</p>
            <button type="button" onClick={onClose} style={{ ...button(true, false), width: '100%', flex: 'none' }}>Fermer</button>
          </>
        ) : (
          <>
            <input type="url" inputMode="url" aria-label="Lien YouTube" placeholder="Collez un lien YouTube" value={link} onChange={(event) => setLink(event.target.value)} style={{ width: '100%', minHeight: 44, boxSizing: 'border-box', padding: '0 10px', color: 'inherit', background: 'none', border, borderRadius: 8, font: '14px system-ui, sans-serif' }} />
            <p style={{ margin: '8px 0 12px', fontSize: 12, opacity: 0.75 }}>La vidéo doit exister et pouvoir être intégrée. Rien n’est envoyé avant que vous appuyiez sur le bouton.</p>
            {error && <p role="alert" style={{ margin: '0 0 12px', color: '#f87171' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={button(false, false)}>Annuler</button>
              <button type="button" onClick={() => void submit()} disabled={busy || link.trim() === ''} style={button(true, busy || link.trim() === '')}>{busy ? 'Vérification …' : 'Proposer'}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    mountPoint,
  );
}
```

- [ ] **Step 3: Section de fiche**

```tsx
// src/content/DocumentarySection.tsx
import { useEffect, useState, type CSSProperties } from 'react';
import { formatDuration, searchLinks } from '../core/documentary/format';
import { getDocumentaryService } from './documentary-registry';
import type { DocView } from './documentary-service';
import { DocumentaryPlayer } from './DocumentaryPlayer';
import { DocumentaryProposeDialog } from './DocumentaryProposeDialog';
import { Glyph } from './Glyphs';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const SIZE = 44; // cible tactile
const iconButton: CSSProperties = { width: SIZE, height: SIZE, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };
const linkButton: CSSProperties = { minHeight: SIZE, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', border, borderRadius: 8, font: '600 13px system-ui, sans-serif' };

type Props = { slug: string; title: string };

// Section « documentaire » de la fiche native d'une carte historique : une vidéo pertinente (⇄ pour voir les autres), ou des recherches guidées ; rien pour les autres cartes.
export function DocumentarySection({ slug, title }: Props) {
  const service = getDocumentaryService();
  const [view, setView] = useState<DocView | null>(null);
  const [version, setVersion] = useState(0);
  const [index, setIndex] = useState(0);
  const [proposing, setProposing] = useState(false);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    service
      .view(slug, title)
      .catch((): DocView => ({ status: 'error', message: 'Le documentaire est indisponible pour le moment.' }))
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setIndex(0);
      });
    return () => {
      cancelled = true;
    };
  }, [service, slug, title, version]);

  if (!service || !view || view.status === 'none') return null;
  const current = view.status === 'detail' ? view.candidates[index % view.candidates.length] : undefined;
  const subject = view.status === 'detail' || view.status === 'empty' ? view.subject : null;
  const name = subject?.names[0] ?? title;

  return (
    <div data-wmt-documentary-card="" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Glyph name="film" size={16} />
        <span style={{ flex: 1, minWidth: 0 }}>Documentaire</span>
        {view.status === 'detail' && view.candidates.length > 1 && (
          <button type="button" onClick={() => setIndex((value) => value + 1)} aria-label="Autre documentaire" title="Autre documentaire" style={iconButton}>
            <Glyph name="swap" />
          </button>
        )}
        {subject && (
          <button type="button" onClick={() => setProposing(true)} aria-label="Proposer un documentaire" title="Proposer un documentaire" style={iconButton}>
            <Glyph name="link" />
          </button>
        )}
      </div>

      {view.status === 'error' && <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{view.message}</p>}

      {current && subject && (
        <>
          <DocumentaryPlayer key={current.id} candidate={current} />
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>{current.title}</div>
            <div style={{ opacity: 0.7 }}>
              {[current.channel, formatDuration(current.durationSec), current.license, current.source === 'commons' ? 'Wikimedia Commons' : current.source === 'proposal' ? 'Votre proposition (en attente de relecture)' : 'YouTube'].filter((part) => part).join(' · ')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void service.flag(slug, subject, title, current).then(() => setVersion((value) => value + 1))}
            aria-label="Cette vidéo n’est pas pertinente"
            title="Cette vidéo n’est pas pertinente"
            style={{ ...iconButton, alignSelf: 'flex-start' }}
          >
            <Glyph name="close" />
          </button>
        </>
      )}

      {view.status === 'empty' && (
        <>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
            {view.busy ? 'Recherche indisponible pour le moment, réessayez plus tard.' : 'Aucun documentaire assez pertinent trouvé.'} Chercher « {name} » :
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {searchLinks(name).map((link) => (
              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={linkButton}>
                <Glyph name="search" size={16} /> {link.label}
              </a>
            ))}
          </div>
        </>
      )}

      {proposing && subject && (
        <DocumentaryProposeDialog onPropose={(link) => service.propose(slug, subject, title, link)} onClose={() => setProposing(false)} onDone={() => setVersion((value) => value + 1)} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Pose dans la fiche (décoration, montage)**

`src/content/decorate-listen.ts` : ajouter `export const DOCUMENTARY_HOST_ATTRIBUTE = 'data-wmt-documentary';` après `BOOK_HOST_ATTRIBUTE`, l'ajouter au tableau `NATIVE_HOSTS`, puis :

```ts
// Section « documentaire » (événements et personnages historiques) : après les autres sections de l'extension.
export const decorateDocumentary = (root: ParentNode, mount: MountListen): number => decorateNative(root, DOCUMENTARY_HOST_ATTRIBUTE, true, mount);
```

`src/content/mount.tsx` : importer `DocumentarySection` et `DOCUMENTARY_HOST_ATTRIBUTE`, puis après `bookSections` :

```tsx
const documentarySections = createNativeSections(DOCUMENTARY_HOST_ATTRIBUTE, '0', (slug, title) => <DocumentarySection slug={slug} title={title} />);
export const mountDocumentarySection: MountListen = documentarySections.mount;
export const pruneDocumentarySections = documentarySections.prune;
```

Reproduire tout autre usage de `BOOK_HOST_ATTRIBUTE` repéré par le `grep` (visite guidée, détection de sections).

- [ ] **Step 5: Câblage dans `src/app/overlay.ts`**

Imports (à côté de ceux des livres) : `decorateDocumentary`, `mountDocumentarySection`, `pruneDocumentarySections`, `getDocumentaryService`, `setDocumentaryService`, `createDocumentaryService`, `createRelayApi`, `searchCommons`, `parseSelection`, `SELECTION_URL`, `fetchSubject`, `createDocumentaryRepo`, `postIssue`, `createTtlCache`.

Dans le bloc qui pose les sections (après le `try` des livres) :

```ts
      try {
        pruneDocumentarySections();
        // La section documentaire se pose dès que son service est créé (relais, Commons et Wikidata n'ont besoin d'aucune clé dans l'extension).
        if (getDocumentaryService()) decorateDocumentary(document, mountDocumentarySection);
      } catch (error) {
        console.warn(LOG, 'section documentaire indisponible :', error);
      }
```

Après la création du service livre (même style, une panne ici n'empêche jamais la surcouche) :

```ts
  // Documentaires (événements et personnages historiques) : relais Cloudflare, Commons, sélection du dépôt.
  try {
    const relay = createRelayApi({ fetch: (url) => fetch(url) });
    const issueFetch = (url: string, init?: RequestInit) => (spotify ? spotify.fetch(url, init) : fetch(url, init));
    setDocumentaryService(
      createDocumentaryService({
        collection: collectionRepo,
        kinds: kindsRepo,
        subject: (slug) => fetchSubject((url) => fetch(url), slug),
        selection: {
          forQid: async (qid) => {
            const response = await fetch(SELECTION_URL);
            if (!response.ok) throw new Error(`Sélection : HTTP ${response.status}`);
            return parseSelection(await response.json(), qid);
          },
        },
        commons: { search: (names, subject) => searchCommons((url) => fetch(url), names, subject) },
        relay,
        repo: createDocumentaryRepo(store),
        issues: GITHUB_ISSUES_TOKEN ? { send: (draft) => postIssue(issueFetch, GITHUB_ISSUES_TOKEN, draft) } : null,
        cache: createTtlCache(store, { ttlMs: 7 * 24 * 3_600_000 }),
        platform: anomalyPlatform,
        profileName: () => getProfileName(window.localStorage),
      }),
    );
  } catch (error) {
    console.warn(LOG, 'documentaires indisponibles :', error);
  }
```

- [ ] **Step 6: Vérifications automatiques** — `npm run typecheck && npm test && npm run build` → verts. Si TypeScript réclame un type pour `spotify.fetch`, reprendre la signature utilisée par `createAnomalyReporter` dans le même fichier.

- [ ] **Step 7: Vérification dans le navigateur (extension)**

Lancer l'application pour voir le résultat réel : charger `.output/chrome-mv3` dans Chrome (recharger l'extension), ouvrir le jeu, puis la fiche de trois cartes : « Bataille de Verdun » (section avec vidéo ou recherches), « Napoléon Ier » (vidéo ou Commons), un film (aucune section). Contrôler : la miniature ne charge rien avant ▶ ; ⇄ change de vidéo ; « ✕ » masque la vidéo ; le lien de proposition vérifie, enregistre et n'écrase pas la fiche ; aucune erreur dans la console.

- [ ] **Step 8: Commit** — `git add src && git commit -m "feat(documentaire): section de fiche, lecteur et proposition"`

---

### Task 8: WikiHow, Quoi de neuf, spécification, livraisons

**Files:**
- Modify: `src/core/whats-new/entries.ts`, `docs/superpowers/specs/2026-10-07-documentaire-histoire-design.md`

- [ ] **Step 1:** Ouvrir `src/core/whats-new/entries.ts`, repérer la fiche du livre (`id` contenant `book`/`livre`) et ajouter à la suite une fiche `id: 'documentaire'` de même forme (thème, glyphe `🎞`, `fresh: true`, étapes `text` + `details` avec « Comment s'en servir » et « À savoir », cible `[data-wmt-documentary-card]`, `scene` copiée de la fiche du livre en demandant une carte de nature « événement » ou « personne »). Textes à reprendre tels quels :
  - Titre : « Documentaire d’histoire » ; résumé : « Un documentaire sur les événements et personnages historiques ».
  - Étape 1 (texte) : « Pour une bataille, une guerre ou un personnage historique, la fiche propose un documentaire. »
  - Détails : « D’où viennent les vidéos » → « D’abord les documentaires choisis à la main, puis les archives libres de Wikimedia Commons, puis une recherche YouTube notée : le titre doit contenir le nom du sujet, la durée doit être celle d’un documentaire. » ; « Si rien ne convient » → « Aucune vidéo n’est affichée plutôt qu’une mauvaise : des boutons ouvrent la recherche chez YouTube, Arte et l’INA. » ; « Proposer » → « Le bouton lien permet de coller une vidéo YouTube : elle est vérifiée, visible chez vous aussitôt, et relue avant d’être proposée aux autres. » ; « À savoir » → « Rien n’est chargé chez YouTube avant d’appuyer sur ▶. Certaines chaînes interdisent l’intégration : le bouton ↗ ouvre la vidéo à la source. »
- [ ] **Step 2:** Mettre à jour la spécification : section « Écarts » reprenant les 4 écarts du plan, et la ligne « Détection » (humain décédé ≤ 1950, quel que soit le métier).
- [ ] **Step 3:** `npm run typecheck && npm test && npm run build` → verts.
- [ ] **Step 4:** Commit `docs(documentaire): fiche WikiHow et écarts de la spécification`, PR 4, fusion, puis pré-production (`npm run preprod`, sans demander) et APK ajouté à `livrables/` selon la routine du projet. Production : seulement sur ordre explicite.

---

### Task 9: Réglage du seuil sur 30 cartes

**Files:**
- Create: `scripts/documentary-tuning.mjs`
- Modify: `src/core/documentary/score.ts` (seuil, mots, chaînes), `tests/core/documentary/score.test.ts`

- [ ] **Step 1: Étape manuelle (utilisateur)** — Cloudflare → Worker → Paramètres → Variables et secrets → ajouter le secret `DEBUG_TOKEN` (une phrase aléatoire de 20 caractères, gardée dans un gestionnaire de mots de passe, jamais collée dans la conversation).

- [ ] **Step 2: Script de réglage** — le script lit `scripts/documentary-cards.json` (les 30 cartes choisies par l'utilisateur : `[{ "qid": "Q2280", "kind": "event", "names": ["Bataille de Verdun","Verdun"], "start": 1916, "end": 1916 }, …]`, fichier non commité) et, pour chacune, appelle le relais avec l'en-tête `x-debug` lu dans la variable d'environnement `DEBUG_TOKEN`, puis affiche un tableau « carte / titre / note / retenu ou motif de rejet ».

```js
// scripts/documentary-tuning.mjs
import { readFileSync } from 'node:fs';

const BASE = 'https://wikimasters-tools.maxime-protais-baumer.workers.dev';
const token = process.env.DEBUG_TOKEN;
if (!token) throw new Error('Définissez DEBUG_TOKEN dans l’environnement (secret du relais).');
const cards = JSON.parse(readFileSync(new URL('./documentary-cards.json', import.meta.url), 'utf8'));

for (const card of cards) {
  const params = new URLSearchParams({ qid: card.qid, kind: card.kind, names: card.names.join('|') });
  if (card.start != null) params.set('start', String(card.start));
  if (card.end != null) params.set('end', String(card.end));
  const response = await fetch(`${BASE}/search?${params}`, { headers: { 'x-debug': token } });
  const body = await response.json();
  console.log(`\n== ${card.names[0]} (${card.qid})`);
  if (!body.ok) { console.log(`  indisponible : ${body.reason}`); continue; }
  for (const { candidate, result } of body.debug ?? []) {
    console.log(`  ${result.reason ? 'REJET ' : result.score >= 60 ? 'RETENU' : 'sous le seuil'}  ${String(result.score).padStart(3)}  ${candidate.title.slice(0, 70)}  [${candidate.channel}]  ${result.reason ?? ''}`);
  }
}
```

- [ ] **Step 3:** Lancer `DEBUG_TOKEN=… node scripts/documentary-tuning.mjs` (30 cartes ≈ 30 recherches du budget du jour ; faire en deux fois si le plafond est atteint). Présenter le tableau à l'utilisateur, qui juge pour chaque ligne « bon / mauvais ».
- [ ] **Step 4:** Ajuster `THRESHOLD`, `TRUSTED`, `NOISE`, `GENRE` dans `score.ts` uniquement d'après ces jugements ; ajouter à `score.test.ts` un cas par erreur corrigée (titre réel rejeté à tort ou retenu à tort) ; `npx vitest run tests/core/documentary` → PASS.
- [ ] **Step 5:** Commit `fix(documentaire): réglage du seuil sur 30 cartes`, PR 5, fusion (le relais se redéploie seul), pré-production.

---

## Self-Review

**Spec coverage:** sélection → Task 4 (`selection.ts`) et 6 ; Commons → Tasks 4, 6 ; YouTube/relais, cache, budget → Task 3 ; notation → Task 1 ; détection → Task 2 ; propositions et « pas pertinent » → Tasks 5, 6, 7 ; affichage extension/mobile et ↗ → Task 7 ; boutons de recherche → Tasks 4, 7 ; WikiHow/Quoi de neuf/APK/pré-prod → Task 8 ; réglage sur 30 cartes → Task 9 ; limite par IP → écart n° 3 (déclaré). Rien d'autre n'est laissé sans tâche.

**Cohérence des types:** `DocCandidate`/`DocSubject` (Task 1) sont utilisés tels quels dans les Tasks 3-7 ; `RelayResult`/`OembedResult` (Task 4) correspondent aux dépendances du service (Task 6) ; `IssueDraft`/`postIssue` (Task 5) sont ceux du câblage (Task 7) ; `SubjectInfo` (Task 2) alimente `subject` du service ; `searchCommons(fetch, names, subject)` a la même signature dans Tasks 4, 6, 7.

**Points à surveiller à l'exécution:** les jeux d'essai de `subject.test.ts` dépendent des schémas zod de `wikidata-birth.ts` (Task 2, étape 5) ; les adresses INA/Arte sont à vérifier (Task 4, étape 5) ; les scores exacts des tests de la Task 1 sont calculés à la main à partir des barèmes (recalculer avant de modifier un test).
