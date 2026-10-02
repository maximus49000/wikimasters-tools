import type { KnownCard } from '../core/collection/collection-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { Listen } from '../core/music/listen';
import type { ListenRepo } from '../core/music/listen-repo';
import { musicKindOf, type MusicKind } from '../core/music/music-kinds';
import type { MusicRepo } from '../core/music/music-repo';
import type { CardMusic } from '../core/music/wikidata-music';

export type ListenView =
  | { status: 'none' }
  | { status: 'notfound' }
  | { status: 'unlinked' }
  | { status: 'ready'; listen: Listen }
  // `retryAfterMs` : limite de la plateforme (429) ; la fiche recharge d'elle-même une fois ce délai passé.
  | { status: 'error'; message: string; retryAfterMs?: number };

export type ListenViewerDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  music: Pick<MusicRepo, 'resolve'>;
  // Les listes d'écoute déjà trouvées : la plateforme n'est interrogée qu'une fois par carte.
  listens: Pick<ListenRepo, 'load' | 'save'>;
  session: { isLinked(): Promise<boolean> };
  // Ce qu'on peut écouter d'une carte sur cette plateforme (recherche) ; `null` : rien trouvé.
  resolve(input: { title: string; kind: MusicKind; music: CardMusic }): Promise<Listen | null>;
  // Message à afficher pour une erreur, et délai avant la relance automatique quand la plateforme limite les appels.
  describeError(error: unknown): { message: string; retryAfterMs?: number };
};

// La fiche « Écouter » d'une carte, commune à toutes les plateformes.
export function createListenViewer(deps: ListenViewerDeps) {
  const { collection, kinds, music, listens, session, resolve, describeError } = deps;

  // `kept` : les listes gardées, lues une fois par l'appelant. `force` : redemander même si une liste est gardée.
  async function listenOf(card: Pick<KnownCard, 'slug' | 'title'>, kind: MusicKind, kept: Map<string, Listen | null>, force = false): Promise<Listen | null> {
    if (!force && kept.has(card.slug)) return kept.get(card.slug) ?? null;
    const state = await music.resolve([card.slug]);
    // Wikidata n'a pas répondu (panne, pause après échec) : sans l'interprète, « rien trouvé » ne serait pas une vraie réponse.
    const answered = Object.prototype.hasOwnProperty.call(state, card.slug);
    if (force && !answered && kept.has(card.slug)) return kept.get(card.slug) ?? null;
    const listen = await resolve({ title: card.title, kind, music: state[card.slug] ?? {} });
    if (answered) {
      // Un stockage plein ne doit pas priver la fiche de sa liste : elle sera simplement redemandée.
      await listens.save(card.slug, listen).catch((error: unknown) => console.warn('[wikimasters-tools]', 'liste d’écoute non gardée :', error));
    }
    return listen;
  }

  async function show(slug: string, title: string, force: boolean): Promise<ListenView> {
    try {
      if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
      await kinds.resolveMissing([slug]);
      const kind = musicKindOf((await kinds.load()).cards[slug]);
      if (!kind) return { status: 'none' };
      if (!(await session.isLinked())) return { status: 'unlinked' };
      const listen = await listenOf({ slug, title }, kind, await listens.load(), force);
      return listen ? { status: 'ready', listen } : { status: 'notfound' };
    } catch (error) {
      const { message, retryAfterMs } = describeError(error);
      return { status: 'error', message, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
    }
  }

  return { listenOf, show };
}

export type ListenViewer = ReturnType<typeof createListenViewer>;
