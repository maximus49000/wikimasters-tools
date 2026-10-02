import type { KnownCard } from '../core/collection/collection-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { ListenRepo } from '../core/music/listen-repo';
import type { MusicRepo } from '../core/music/music-repo';
import { TidalError, tidalMessage } from '../core/tidal/errors';
import { resolveTidalListen, type TidalSearch } from '../core/tidal/tidal-listen';
import type { TidalSession } from '../core/tidal/tidal-session';
import { createListenViewer } from './listen-viewer';

export type TidalServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  music: Pick<MusicRepo, 'resolve'>;
  // Les listes déjà trouvées sur Tidal (leur propre dépôt) : Tidal n'est interrogé qu'une fois par carte.
  listens: Pick<ListenRepo, 'load' | 'save'>;
  session: Pick<TidalSession, 'isLinked' | 'link' | 'unlink' | 'subscribe'>;
  api: TidalSearch;
};

// La fiche « Écouter » d'une carte pour Tidal : les pistes, avec leur lien d'écoute (la lecture dans l'appli viendra ensuite).
export function createTidalService(deps: TidalServiceDeps) {
  const { collection, kinds, music, listens, session, api } = deps;
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
    // Rien ne joue dans l'appli pour Tidal : aucune carte n'est « en cours ».
    playingSlugs: async (_cards?: unknown, _track?: unknown): Promise<Set<string>> => new Set<string>(),
    // Pas de lecture dans l'appli pour l'instant : le lien ↗ de chaque piste ouvre Tidal.
    play: async (): Promise<string | null> => 'Utilise le lien pour écouter sur Tidal.',
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
