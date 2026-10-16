import type { KeyValueStore } from '../core/cache/store';
import type { GameDetail } from '../core/game/game-detail';
import { normalizeTitle } from '../core/game/game-format';
import type { GameVersionRepo } from '../core/game/game-version-repo';
import { caseStyleOfPlatformName, formatOfPlatformName, type BoxFormat, type CaseStyle } from '../core/game/platform-boxes';
import { boxartUrl, defaultVersion, matchingVersions, type TgdbVersion } from '../core/game/tgdb-api';
import { cleanTitle } from '../core/music/listen';
import type { GameView } from './game-service';
export { getGameBoxService } from './game-box-registry';

export type GameBox = {
  format: BoxFormat;
  style: CaseStyle;
  tgdbId?: number;
  platformName: string;
  frontUrl?: string;
  backUrl?: string;
  backFullUrl?: string;
  shots: string[];
  logoUrl?: string;
  title: string;
  // Studio (premier développeur de la fiche du jeu), imprimé en bas de la tranche.
  studio?: string;
  summary?: string;
};

type Extra = { shots: string[]; logo?: string };
type Images = Record<number, Extra>;

export type GameBoxDeps = {
  versions: (name: string) => Promise<TgdbVersion[] | null>;
  images: (ids: number[]) => Promise<Images | null>;
  choices: Pick<GameVersionRepo, 'load' | 'save' | 'clear'>;
  game: { view(slug: string, title: string): Promise<GameView> };
  // Réponses de TheGamesDB gardées ici : 365 jours (une réponse vide n'en garde que 7).
  store: KeyValueStore;
  now?: () => number;
  // La version d'une carte vient de changer : les affiches déjà retenues pour elle sont à oublier.
  onChanged?: (slug: string) => void;
  // Écart minimal entre deux appels au relais TheGamesDB (défaut 1,1 s : sa limite est de 60 par minute et par IP).
  spacingMs?: number;
  // Délai maximal d'un appel : au-delà, c'est une panne (défaut 15 s).
  timeoutMs?: number;
};

// Studio lu dans la fiche déjà chargée pour la boîte (aucun appel de plus).
const studioOf = (detail: GameDetail): { studio?: string } => (detail.developers?.[0] ? { studio: detail.developers[0] } : {});

// Titre imprimé sur la boîte : celui de la carte sans sa désambiguïsation finale (« (jeu vidéo) »).
const printedTitle = (title: string, detail: GameDetail): string => cleanTitle(title) || detail.title;

const RETRY_AFTER_FAILURE_MS = 60_000;
const FOUND_TTL_MS = 365 * 24 * 3_600_000;
const EMPTY_TTL_MS = 7 * 24 * 3_600_000;
const SPACING_MS = 1_100;
const TIMEOUT_MS = 15_000;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Un appel trop long compte comme une panne (null), jamais mémorisée.
const withTimeout = <T>(job: Promise<T | null>, ms: number): Promise<T | null> => Promise.race([job, wait(ms).then((): null => null)]);

type Known = { box: GameBox | null; failedAt?: number };
// `failed` : une source n'a pas pu répondre (TheGamesDB : la boîte rendue est le repli ; erreur de la fiche : null).
export type BoxOutcome = { box: GameBox | null; failed: boolean };
type Cached = { list: TgdbVersion[]; at: number };
type CachedImages = Extra & { at: number };
type Job = { slug: string; urgent: boolean; run: () => Promise<void> };

export function createGameBoxService(deps: GameBoxDeps) {
  const { versions, images, choices, game, store, onChanged } = deps;
  const now = deps.now ?? (() => Date.now());
  const spacingMs = deps.spacingMs ?? SPACING_MS;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const known = new Map<string, Known>();
  const running = new Map<string, Promise<BoxOutcome>>();
  const generation = new Map<string, number>();
  const lastTitle = new Map<string, string>();
  const loading = new Map<string, Promise<TgdbVersion[] | null>>();
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((listener) => listener());
  const generationOf = (slug: string): number => generation.get(slug) ?? 0;

  // File des appels au relais : un à la fois, espacés, pour qu'une page de Collection pleine de jeux reste sous sa limite.
  // Une carte demandée par la fiche ou par la fenêtre des versions (urgente) passe devant les affiches de la Collection.
  const queue: Job[] = [];
  const urgentSlugs = new Set<string>();
  let pumping = false;
  let lastCallAt = Number.NEGATIVE_INFINITY;
  function nextJob(): Job | undefined {
    const index = queue.findIndex((job) => job.urgent || urgentSlugs.has(job.slug));
    return queue.splice(index === -1 ? 0 : index, 1)[0];
  }
  async function pump(): Promise<void> {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length > 0) {
        const delay = lastCallAt + spacingMs - Date.now();
        if (delay > 0) await wait(delay);
        // Choisi après l'attente : une demande urgente arrivée entre-temps passe devant.
        const job = nextJob();
        if (!job) break;
        lastCallAt = Date.now();
        await job.run();
      }
    } finally {
      pumping = false;
    }
  }
  const paced = <T>(slug: string, urgent: boolean, call: () => Promise<T | null>): Promise<T | null> =>
    new Promise<T | null>((resolve) => {
      queue.push({ slug, urgent, run: () => withTimeout(call(), timeoutMs).catch((): null => null).then(resolve) });
      void pump();
    });

  async function loadVersions(name: string, key: string, slug: string, urgent: boolean): Promise<TgdbVersion[] | null> {
    const list = await paced(slug, urgent, () => versions(name));
    if (list === null) return null;
    await store.set<Cached>(key, { list, at: now() });
    return list;
  }

  // Versions d'un nom : null = panne (jamais mémorisée) ; sinon mémorisé 365 jours, ou 7 jours si rien n'a été trouvé
  // (une erreur amont douce peut revenir sous cette forme). Une seule clé, réécrite à l'expiration.
  async function lookup(name: string, slug: string, urgent: boolean): Promise<TgdbVersion[] | null> {
    const normalized = normalizeTitle(name);
    if (normalized === '') return [];
    const key = `game-tgdb-${normalized}`;
    try {
      const entry = await store.get<Cached>(key);
      if (entry && entry.at <= now()) {
        const age = now() - entry.at;
        if (age < (entry.list.length > 0 ? FOUND_TTL_MS : EMPTY_TTL_MS)) return entry.list;
      }
      const existing = loading.get(key);
      if (existing) return await existing;
      const promise = loadVersions(name, key, slug, urgent).finally(() => loading.delete(key));
      loading.set(key, promise);
      return await promise;
    } catch {
      return null;
    }
  }

  // Captures et logo d'une version, mémorisés par identifiant : 365 jours, ou 7 jours pour « aucune image »
  // (une panne n'est jamais mémorisée).
  async function extraOf(id: number, slug: string, urgent: boolean): Promise<Extra | undefined> {
    const key = `game-tgdb-img-${id}`;
    try {
      const entry = await store.get<CachedImages>(key);
      if (entry && entry.at <= now()) {
        const empty = entry.shots.length === 0 && !entry.logo;
        if (now() - entry.at < (empty ? EMPTY_TTL_MS : FOUND_TTL_MS)) return entry;
      }
      const answer = await paced(slug, urgent, () => images([id]));
      if (answer === null) return undefined;
      const found: Extra = answer[id] ?? { shots: [] };
      await store.set<CachedImages>(key, { ...found, at: now() });
      return found;
    } catch {
      return undefined;
    }
  }

  // Sans TheGamesDB : la jaquette de Steam/IGDB sur une boîte de la console du jeu.
  const fallback = (detail: GameDetail, title: string): GameBox => {
    const platform = detail.platforms[0] ?? '';
    return {
      format: formatOfPlatformName(platform),
      style: caseStyleOfPlatformName(platform),
      platformName: platform,
      ...(detail.coverUrl ? { frontUrl: detail.coverUrl } : {}),
      shots: [],
      title: printedTitle(title, detail),
      ...studioOf(detail),
      ...(detail.summary ? { summary: detail.summary } : {}),
    };
  };

  async function fromVersion(version: TgdbVersion, title: string, detail: GameDetail, slug: string, urgent: boolean): Promise<GameBox> {
    const extra = await extraOf(version.id, slug, urgent);
    return {
      format: version.format,
      style: version.style,
      tgdbId: version.id,
      platformName: version.platformName,
      ...(version.front ? { frontUrl: boxartUrl(version.front, 'medium') } : {}),
      ...(version.back ? { backUrl: boxartUrl(version.back, 'medium'), backFullUrl: boxartUrl(version.back, 'original') } : {}),
      shots: (extra?.shots ?? []).map((file) => boxartUrl(file, 'medium')),
      ...(extra?.logo ? { logoUrl: boxartUrl(extra.logo, 'original') } : {}),
      title: printedTitle(title, detail),
      ...studioOf(detail),
      ...(version.overview ? { summary: version.overview } : {}),
    };
  }

  const titlesOf = (detail: GameDetail, title: string): string[] => [title, detail.title, ...(detail.originalTitle ? [detail.originalTitle] : [])];

  async function compute(slug: string, title: string, urgent: boolean): Promise<BoxOutcome> {
    const view = await game.view(slug, title);
    if (view.status === 'error') return { box: null, failed: true };
    if (view.status !== 'detail') return { box: null, failed: false };
    const detail = view.detail;
    const all = await lookup(detail.title, slug, urgent);
    if (all === null) return { box: fallback(detail, title), failed: true };
    // L'année (±1) ne sert qu'à la version par défaut : un portage plus tardif reste proposé dans « Changer de version ».
    const matching = matchingVersions(all, titlesOf(detail, title), detail.year);
    const wanted = (await choices.load())[slug]?.tgdbId;
    const chosen = wanted === undefined ? undefined : all.find((version) => version.id === wanted);
    const version = chosen ?? defaultVersion(matching, formatOfPlatformName(detail.platforms[0] ?? ''));
    return { box: version ? await fromVersion(version, title, detail, slug, urgent) : fallback(detail, title), failed: false };
  }

  // Un seul calcul à la fois par carte (box, request et outcome partagent le même) ; un calcul lancé avant un
  // changement de version ne peut pas écraser le résultat plus récent. Une demande urgente faite pendant un calcul
  // de fond fait passer les appels restants de cette carte devant la file.
  function start(slug: string, title: string, urgent: boolean): Promise<BoxOutcome> {
    if (urgent) urgentSlugs.add(slug);
    const existing = running.get(slug);
    if (existing) return existing;
    lastTitle.set(slug, title);
    const gen = generationOf(slug);
    const promise: Promise<BoxOutcome> = compute(slug, title, urgent)
      .then((out) => {
        if (generationOf(slug) !== gen) return out;
        known.set(slug, { box: out.box, ...(out.failed ? { failedAt: now() } : {}) });
        return out;
      })
      .catch((): BoxOutcome => ({ box: null, failed: true }))
      .finally(() => {
        if (running.get(slug) === promise) running.delete(slug);
        if (!running.has(slug)) urgentSlugs.delete(slug);
      });
    running.set(slug, promise);
    void promise.then(() => {
      if (generationOf(slug) === gen) notify();
    });
    return promise;
  }

  // Recalcule aussitôt la boîte d'une carte dont la version vient de changer.
  function restart(slug: string): void {
    generation.set(slug, generationOf(slug) + 1);
    known.delete(slug);
    running.delete(slug);
    onChanged?.(slug);
    notify();
    const title = lastTitle.get(slug);
    if (title !== undefined) void start(slug, title, true);
  }

  return {
    // La boîte d'une carte montrée en grand (fiche, boîte ouverte) : urgente.
    box: (slug: string, title: string): Promise<GameBox | null> => start(slug, title, true).then((out) => out.box),

    // Pour les affiches (en fond) : la boîte, et si une source n'a pas répondu (rien à mémoriser alors).
    outcome: (slug: string, title: string): Promise<BoxOutcome> => start(slug, title, false),

    // Synchrone : undefined = pas encore demandé.
    peek: (slug: string): GameBox | null | undefined => known.get(slug)?.box,

    // Lance le calcul (en fond) si inconnu ; après une panne, un nouvel essai par minute au plus.
    request(slug: string, title: string): void {
      if (running.has(slug)) return;
      const state = known.get(slug);
      if (state && (state.failedAt === undefined || now() - state.failedAt < RETRY_AFTER_FAILURE_MS)) return;
      void start(slug, title, false);
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    // Les versions proposées pour la carte : toutes celles au titre exact, quelle que soit l'année (liste vide si rien ou panne).
    async versions(slug: string, title: string): Promise<TgdbVersion[]> {
      try {
        const view = await game.view(slug, title);
        if (view.status !== 'detail') return [];
        const all = await lookup(view.detail.title, slug, true);
        return all ? matchingVersions(all, titlesOf(view.detail, title)) : [];
      } catch {
        return [];
      }
    },

    async chooseVersion(slug: string, tgdbId: number): Promise<void> {
      await choices.save(slug, { tgdbId });
      restart(slug);
    },

    async resetVersion(slug: string): Promise<void> {
      await choices.clear(slug);
      restart(slug);
    },
  };
}

export type GameBoxService = ReturnType<typeof createGameBoxService>;
