import type { KeyValueStore } from '../core/cache/store';
import type { GameDetail } from '../core/game/game-detail';
import { normalizeTitle } from '../core/game/game-format';
import type { GameVersionRepo } from '../core/game/game-version-repo';
import { caseStyleOfPlatformName, formatOfPlatformName, type BoxFormat, type CaseStyle } from '../core/game/platform-boxes';
import { boxartUrl, defaultVersion, matchingVersions, type TgdbVersion } from '../core/game/tgdb-api';
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
};

const RETRY_AFTER_FAILURE_MS = 60_000;
const FOUND_TTL_MS = 365 * 24 * 3_600_000;
const EMPTY_TTL_MS = 7 * 24 * 3_600_000;

type Known = { box: GameBox | null; failedAt?: number };
type Cached = { list: TgdbVersion[]; at: number };
type CachedImages = Extra & { at: number };

export function createGameBoxService(deps: GameBoxDeps) {
  const { versions, images, choices, game, store, onChanged } = deps;
  const now = deps.now ?? (() => Date.now());
  const known = new Map<string, Known>();
  const running = new Map<string, Promise<GameBox | null>>();
  const generation = new Map<string, number>();
  const lastTitle = new Map<string, string>();
  const loading = new Map<string, Promise<TgdbVersion[] | null>>();
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((listener) => listener());
  const generationOf = (slug: string): number => generation.get(slug) ?? 0;

  async function loadVersions(name: string, key: string): Promise<TgdbVersion[] | null> {
    const list = await versions(name);
    if (list === null) return null;
    await store.set<Cached>(key, { list, at: now() });
    return list;
  }

  // Versions d'un nom : null = panne (jamais mémorisée) ; sinon mémorisé 365 jours, ou 7 jours si rien n'a été trouvé
  // (une erreur amont douce peut revenir sous cette forme). Une seule clé, réécrite à l'expiration.
  async function lookup(name: string): Promise<TgdbVersion[] | null> {
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
      const promise = loadVersions(name, key).finally(() => loading.delete(key));
      loading.set(key, promise);
      return await promise;
    } catch {
      return null;
    }
  }

  // Captures et logo d'une version, mémorisés par identifiant (une panne n'est jamais mémorisée).
  async function extraOf(id: number): Promise<Extra | undefined> {
    const key = `game-tgdb-img-${id}`;
    try {
      const entry = await store.get<CachedImages>(key);
      if (entry && entry.at <= now() && now() - entry.at < FOUND_TTL_MS) return entry;
      const found = (await images([id]))?.[id];
      if (found) await store.set<CachedImages>(key, { ...found, at: now() });
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
      title,
      ...(detail.summary ? { summary: detail.summary } : {}),
    };
  };

  async function fromVersion(version: TgdbVersion, title: string): Promise<GameBox> {
    const extra = await extraOf(version.id);
    return {
      format: version.format,
      style: version.style,
      tgdbId: version.id,
      platformName: version.platformName,
      ...(version.front ? { frontUrl: boxartUrl(version.front, 'medium') } : {}),
      ...(version.back ? { backUrl: boxartUrl(version.back, 'medium'), backFullUrl: boxartUrl(version.back, 'original') } : {}),
      shots: (extra?.shots ?? []).map((file) => boxartUrl(file, 'medium')),
      ...(extra?.logo ? { logoUrl: boxartUrl(extra.logo, 'original') } : {}),
      title,
      ...(version.overview ? { summary: version.overview } : {}),
    };
  }

  const titlesOf = (detail: GameDetail, title: string): string[] => [title, detail.title, ...(detail.originalTitle ? [detail.originalTitle] : [])];

  // `failed` : une source n'a pas pu répondre (TheGamesDB : la boîte rendue est le repli ; erreur de la fiche : null).
  async function compute(slug: string, title: string): Promise<{ box: GameBox | null; failed: boolean }> {
    const view = await game.view(slug, title);
    if (view.status === 'error') return { box: null, failed: true };
    if (view.status !== 'detail') return { box: null, failed: false };
    const detail = view.detail;
    const all = await lookup(detail.title);
    if (all === null) return { box: fallback(detail, title), failed: true };
    const matching = matchingVersions(all, titlesOf(detail, title), detail.year);
    const wanted = (await choices.load())[slug]?.tgdbId;
    const chosen = wanted === undefined ? undefined : all.find((version) => version.id === wanted);
    const version = chosen ?? defaultVersion(matching, formatOfPlatformName(detail.platforms[0] ?? ''));
    return { box: version ? await fromVersion(version, title) : fallback(detail, title), failed: false };
  }

  // Un seul calcul à la fois par carte (box, request et cover partagent le même) ; un calcul lancé avant un
  // changement de version ne peut pas écraser le résultat plus récent.
  function start(slug: string, title: string): Promise<GameBox | null> {
    const existing = running.get(slug);
    if (existing) return existing;
    lastTitle.set(slug, title);
    const gen = generationOf(slug);
    const promise: Promise<GameBox | null> = compute(slug, title)
      .then((out) => {
        if (generationOf(slug) !== gen) return out.box;
        known.set(slug, { box: out.box, ...(out.failed ? { failedAt: now() } : {}) });
        return out.box;
      })
      .catch((): GameBox | null => null)
      .finally(() => {
        if (running.get(slug) === promise) running.delete(slug);
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
    if (title !== undefined) void start(slug, title);
  }

  return {
    box: start,

    // Synchrone : undefined = pas encore demandé.
    peek: (slug: string): GameBox | null | undefined => known.get(slug)?.box,

    // Lance le calcul si inconnu ; après une panne, un nouvel essai par minute au plus.
    request(slug: string, title: string): void {
      if (running.has(slug)) return;
      const state = known.get(slug);
      if (state && (state.failedAt === undefined || now() - state.failedAt < RETRY_AFTER_FAILURE_MS)) return;
      void start(slug, title);
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    // Les versions proposées pour la carte (liste vide si rien ou panne).
    async versions(slug: string, title: string): Promise<TgdbVersion[]> {
      try {
        const view = await game.view(slug, title);
        if (view.status !== 'detail') return [];
        const all = await lookup(view.detail.title);
        return all ? matchingVersions(all, titlesOf(view.detail, title), view.detail.year) : [];
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
