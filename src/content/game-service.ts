import type { TtlCache } from '../core/cache/ttl-cache';
import type { KnownCard } from '../core/collection/collection-book';
import { gameErrorMessage } from '../core/game/errors';
import type { GameCandidate, GameDetail, GameRef } from '../core/game/game-detail';
import { normalizeTitle, parseGameLink } from '../core/game/game-format';
import { isVideoGame } from '../core/game/game-kinds';
import type { GameChoiceRepo, GameRepo } from '../core/game/game-repo';
import type { IgdbApi } from '../core/game/igdb-api';
import type { SteamApi } from '../core/game/steam-api';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { cleanTitle } from '../core/music/listen';

export type GameView = { status: 'none' } | { status: 'empty' } | { status: 'detail'; detail: GameDetail } | { status: 'error'; message: string };
export type GameCandidates = { steam: GameCandidate[]; igdb: GameCandidate[]; message?: string };
export type GamePreview = { detail?: GameDetail; message?: string };

export type GameServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  games: Pick<GameRepo, 'resolve'>;
  choices: Pick<GameChoiceRepo, 'load' | 'save' | 'clear'>;
  steam: Pick<SteamApi, 'detail' | 'search'>;
  // Absent sans identifiants IGDB à la compilation.
  igdb: Pick<IgdbApi, 'detail' | 'search'> | null;
  // Steam : 6 h ; IGDB : 7 jours.
  steamCache: Pick<TtlCache, 'getOrLoad'>;
  igdbCache: Pick<TtlCache, 'getOrLoad'>;
};

const SOURCE_NAMES = { steam: 'Steam', igdb: 'IGDB' } as const;

export function createGameService(deps: GameServiceDeps) {
  const { collection, kinds, games, choices, steam, igdb, steamCache, igdbCache } = deps;

  const steamDetail = (id: number) => steamCache.getOrLoad(`game-steam-${id}`, () => steam.detail(id));
  const igdbDetail = (by: { id: number } | { slug: string }) =>
    igdb ? igdbCache.getOrLoad(`game-igdb-${'id' in by ? by.id : `slug-${by.slug}`}`, () => igdb.detail(by)) : Promise.resolve(null);
  const detailOf = (ref: GameRef): Promise<GameDetail | null> => (ref.source === 'steam' ? steamDetail(ref.id) : igdbDetail({ id: ref.id }));

  // Un titre égal (accents, casse, ponctuation) ; à égalité, le plus connu.
  const exact = (candidates: GameCandidate[], wanted: string): GameCandidate | undefined =>
    candidates.filter((candidate) => normalizeTitle(candidate.title) === wanted).sort((a, b) => b.popularity - a.popularity)[0];

  async function automatic(ids: { steamId?: number; igdbSlug?: string }, title: string): Promise<GameDetail | null> {
    if (ids.steamId !== undefined) {
      const found = await steamDetail(ids.steamId);
      if (found) return found;
    }
    if (ids.igdbSlug !== undefined && igdb) {
      const found = await igdbDetail({ slug: ids.igdbSlug });
      if (found) return found;
    }
    const query = cleanTitle(title);
    const wanted = normalizeTitle(query);
    if (wanted === '') return null;
    const steamHit = exact(await steamCache.getOrLoad(`game-search-steam-${wanted}`, () => steam.search(query)), wanted);
    if (steamHit) {
      const found = await steamDetail(steamHit.id);
      if (found) return found;
    }
    if (igdb) {
      const igdbHit = exact(await igdbCache.getOrLoad(`game-search-igdb-${wanted}`, () => igdb.search(query)), wanted);
      if (igdbHit) return igdbDetail({ id: igdbHit.id });
    }
    return null;
  }

  // Aperçu d'un jeu proposé ou collé, avant validation.
  async function preview(ref: GameRef): Promise<GamePreview> {
    try {
      const detail = await detailOf(ref);
      return detail ? { detail } : { message: 'Ce jeu est introuvable.' };
    } catch (error) {
      return { message: gameErrorMessage(error) };
    }
  }

  return {
    igdbEnabled: igdb !== null,

    // Ce que la fiche d'une carte montre : rien (pas un jeu), une section vide, un jeu, ou une erreur.
    async view(slug: string, title: string): Promise<GameView> {
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const cardKinds = (await kinds.load()).cards[slug];
        const ids = (await games.resolve([slug]))[slug] ?? {};
        if (!isVideoGame(cardKinds) && ids.steamId === undefined) return { status: 'none' };

        const choice = (await choices.load())[slug];
        if (choice) {
          if ('none' in choice) return { status: 'empty' };
          const chosen = await detailOf(choice);
          return chosen ? { status: 'detail', detail: chosen } : { status: 'empty' };
        }
        const found = await automatic(ids, title);
        return found ? { status: 'detail', detail: found } : { status: 'empty' };
      } catch (error) {
        return { status: 'error', message: gameErrorMessage(error) };
      }
    },

    // Les propositions de la fenêtre « Changer de jeu » : les deux sources, chacune pouvant échouer sans gêner l'autre.
    async candidates(query: string): Promise<GameCandidates> {
      const text = cleanTitle(query);
      const failures: string[] = [];
      const run = async (search: (() => Promise<GameCandidate[]>) | null): Promise<GameCandidate[]> => {
        if (!search) return [];
        try {
          return await search();
        } catch (error) {
          failures.push(gameErrorMessage(error));
          return [];
        }
      };
      const [steamList, igdbList] = await Promise.all([run(() => steam.search(text)), run(igdb ? () => igdb.search(text) : null)]);
      return { steam: steamList, igdb: igdbList, ...(failures[0] ? { message: failures[0] } : {}) };
    },

    preview,

    async fromLink(text: string): Promise<GamePreview> {
      const link = parseGameLink(text);
      if (!link) return { message: 'Adresse non reconnue.' };
      if (link.source === 'steam') return preview({ source: 'steam', id: link.id });
      if (!igdb) return { message: `${SOURCE_NAMES.igdb} n'est pas configuré.` };
      try {
        const detail = await igdbDetail({ slug: link.slug });
        return detail ? { detail } : { message: 'Ce jeu est introuvable.' };
      } catch (error) {
        return { message: gameErrorMessage(error) };
      }
    },

    choose: (slug: string, ref: GameRef): Promise<void> => choices.save(slug, ref),
    chooseNone: (slug: string): Promise<void> => choices.save(slug, { none: true }),
    reset: (slug: string): Promise<void> => choices.clear(slug),
  };
}

export type GameService = ReturnType<typeof createGameService>;
