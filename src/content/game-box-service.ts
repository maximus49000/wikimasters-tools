import type { TtlCache } from '../core/cache/ttl-cache';
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

type Images = Record<number, { shots: string[]; logo?: string }>;

export type GameBoxDeps = {
  versions: (name: string) => Promise<TgdbVersion[] | null>;
  images: (ids: number[]) => Promise<Images | null>;
  choices: Pick<GameVersionRepo, 'load' | 'save' | 'clear'>;
  game: { view(slug: string, title: string): Promise<GameView> };
  // Réponses de TheGamesDB : 365 jours (une réponse vide n'en garde que 7, voir plus bas).
  cache: Pick<TtlCache, 'getOrLoad'>;
  now?: () => number;
  // La version d'une carte vient de changer : les affiches déjà retenues pour elle sont à oublier.
  onChanged?: (slug: string) => void;
};

const RETRY_AFTER_FAILURE_MS = 60_000;
const EMPTY_TTL_MS = 7 * 24 * 3_600_000;

type Known = { box: GameBox | null; failedAt?: number };
type Cached = { list: TgdbVersion[]; at: number };

export function createGameBoxService(deps: GameBoxDeps) {
  const { versions, images, choices, game, cache, onChanged } = deps;
  const now = deps.now ?? (() => Date.now());
  const known = new Map<string, Known>();
  const running = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((listener) => listener());

  // Versions d'un nom : null = panne (jamais mémorisée) ; [] = rien trouvé (mémorisé 7 jours seulement,
  // car une erreur amont douce peut revenir sous cette forme) ; sinon mémorisé 365 jours.
  async function lookup(name: string): Promise<TgdbVersion[] | null> {
    const normalized = normalizeTitle(name);
    if (normalized === '') return [];
    const load = async (): Promise<Cached> => {
      const list = await versions(name);
      if (list === null) throw new Error('TheGamesDB indisponible');
      return { list, at: now() };
    };
    try {
      let entry = await cache.getOrLoad(`game-tgdb-${normalized}`, load);
      if (entry.list.length === 0 && now() - entry.at >= EMPTY_TTL_MS) {
        entry = await cache.getOrLoad(`game-tgdb-${normalized}-${Math.floor(now() / EMPTY_TTL_MS)}`, load);
      }
      return entry.list;
    } catch {
      return null;
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
    let extra: Images[number] | undefined;
    try {
      extra = (await images([version.id]))?.[version.id];
    } catch {
      extra = undefined;
    }
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

  // `failed` : TheGamesDB n'a pas pu répondre (la boîte rendue est alors le repli).
  async function compute(slug: string, title: string): Promise<{ box: GameBox | null; failed: boolean }> {
    const view = await game.view(slug, title);
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

  async function box(slug: string, title: string): Promise<GameBox | null> {
    try {
      const out = await compute(slug, title);
      known.set(slug, { box: out.box, ...(out.failed ? { failedAt: now() } : {}) });
      return out.box;
    } catch {
      return null;
    }
  }

  return {
    box,

    // Synchrone : undefined = pas encore demandé.
    peek: (slug: string): GameBox | null | undefined => known.get(slug)?.box,

    // Lance box() si inconnu ; après une panne de TheGamesDB, un nouvel essai par minute au plus.
    request(slug: string, title: string): void {
      if (running.has(slug)) return;
      const state = known.get(slug);
      if (state && (state.failedAt === undefined || now() - state.failedAt < RETRY_AFTER_FAILURE_MS)) return;
      const run = box(slug, title)
        .then(() => undefined)
        .finally(() => running.delete(slug))
        .then(notify);
      running.set(slug, run);
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
      known.delete(slug);
      onChanged?.(slug);
      notify();
    },

    async resetVersion(slug: string): Promise<void> {
      await choices.clear(slug);
      known.delete(slug);
      onChanged?.(slug);
      notify();
    },
  };
}

export type GameBoxService = ReturnType<typeof createGameBoxService>;
