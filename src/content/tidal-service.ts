import type { KnownCard } from '../core/collection/collection-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { Listen } from '../core/music/listen';
import type { ListenRepo } from '../core/music/listen-repo';
import type { MusicRepo } from '../core/music/music-repo';
import { TidalError, tidalMessage } from '../core/tidal/errors';
import { resolveTidalListen, type TidalSearch } from '../core/tidal/tidal-listen';
import { resolveTidalSoundtrack } from '../core/tidal/tidal-soundtrack';
import type { TidalSession } from '../core/tidal/tidal-session';
import { createListenViewer } from './listen-viewer';
import type { SoundtrackOutcome, SoundtrackSearch } from './music-service';

export type TidalServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  music: Pick<MusicRepo, 'resolve'>;
  // Les listes déjà trouvées sur Tidal (leur propre dépôt) : Tidal n'est interrogé qu'une fois par carte.
  listens: Pick<ListenRepo, 'load' | 'save'>;
  // Les bandes originales déjà trouvées (clé `movie:<id TMDB>`) : leur propre dépôt, Tidal n'est interrogé qu'une fois par film.
  soundtracks: Pick<ListenRepo, 'load' | 'save'>;
  session: Pick<TidalSession, 'isLinked' | 'link' | 'unlink' | 'subscribe'>;
  api: TidalSearch;
};

// La fiche « Écouter » d'une carte pour Tidal : les pistes, avec leur lien d'écoute (la lecture dans l'appli viendra ensuite).
export function createTidalService(deps: TidalServiceDeps) {
  const { collection, kinds, music, listens, soundtracks, session, api } = deps;
  const viewer = createListenViewer({
    collection,
    kinds,
    music,
    listens,
    session,
    resolve: (input) => resolveTidalListen(api, input),
    describeError: (error) => {
      const retryAfterMs = error instanceof TidalError && error.code === 'rate-limited' ? error.retryAfterMs : undefined;
      return { message: tidalMessage(error), ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
    },
  });

  return {
    view: (slug: string, title: string) => viewer.show(slug, title, false),
    refresh: (slug: string, title: string) => viewer.show(slug, title, true),
    // La BO d'un film ou d'une série (`key` : `movie:<id>` / `tv:<id>`) : un lien vers l'album Tidal. Seule une vraie réponse est gardée ;
    // une erreur (réseau, limite) rend null et sera retentée à la prochaine ouverture de la fiche.
    async soundtrack(key: string, titles: string[]): Promise<Listen | null> {
      if (!(await session.isLinked())) return null;
      const kept = await soundtracks.load();
      if (kept.has(key)) return kept.get(key) ?? null;
      let listen: Listen | null;
      try {
        listen = await resolveTidalSoundtrack(api, titles);
      } catch {
        return null;
      }
      await soundtracks.save(key, listen).catch((error: unknown) => console.warn('[wikimasters-tools]', 'bande originale non gardée :', error));
      return listen;
    },
    // Le pop-up BO (onglet Auto) : relance la recherche et remplace ce qui était gardé.
    async refreshSoundtrack(key: string, titles: string[]): Promise<SoundtrackOutcome> {
      if (!(await session.isLinked())) return { listen: null };
      let listen: Listen | null;
      try {
        listen = await resolveTidalSoundtrack(api, titles);
      } catch (error) {
        return { listen: null, message: tidalMessage(error) };
      }
      await soundtracks.save(key, listen).catch((error: unknown) => console.warn('[wikimasters-tools]', 'bande originale non gardée :', error));
      return { listen };
    },
    // Pas de recherche à la main pour Tidal : le pop-up n'affiche que l'onglet Auto.
    manualSoundtrack: false as boolean,
    searchSoundtracks: async (_query?: string): Promise<SoundtrackSearch> => ({ choices: [] }),
    chooseSoundtrack: async (_key?: string, _choice?: unknown): Promise<SoundtrackOutcome> => ({ listen: null }),
    // Rien ne joue dans l'appli pour Tidal : aucune carte n'est « en cours ».
    playingSlugs: async (_cards?: unknown, _track?: unknown): Promise<Set<string>> => new Set<string>(),
    // Pas de lecture dans l'appli pour l'instant : le lien ↗ de chaque piste ouvre Tidal.
    play: async (_item?: unknown, _listen?: unknown, _card?: unknown): Promise<string | null> => 'Utilise le lien pour écouter sur Tidal.',
    async link(): Promise<string | null> {
      try {
        await session.link();
        return null;
      } catch (error) {
        // Une erreur hors Tidal (fenêtre d'autorisation refusée, adresse de retour non déclarée…) : on en montre la cause.
        if (error instanceof Error && !(error instanceof TidalError)) return `Liaison Tidal impossible : ${error.message}`;
        return tidalMessage(error);
      }
    },
    unlink: () => session.unlink(),
    isLinked: () => session.isLinked(),
    subscribe: (listener: () => void) => session.subscribe(listener),
  };
}

export type TidalService = ReturnType<typeof createTidalService>;
