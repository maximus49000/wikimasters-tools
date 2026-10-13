import type { KeyValueStore } from '../cache/store';
import type { CardTag } from '../collection/collection-book';
import { createInitialState, parseStoredLibraryState } from './library-book';
import type { LibraryState } from './library-types';

const KEY = 'library';
const CARDS_KEY = 'library-cards';
// Copie du blob brut d'avant la v7 (rangement par largeur réelle), écrite une seule fois avant la première écriture, jamais remplacée.
const BACKUP_KEY = 'library-backup-pre-v7';

// État brut enregistré par une version d'avant la v7 (à copier avant de le convertir).
const isPreV7 = (raw: unknown): boolean => {
  const version = typeof raw === 'object' && raw !== null ? (raw as { version?: unknown }).version : undefined;
  return typeof version === 'number' && version < 7;
};

// Copie locale des cartes affichées dans les pièces : la pièce se dessine sans dépendre de la Collection.
export type RoomCardData = { title: string; imageUrl?: string; rarity?: string; extract?: string; attack?: number; defense?: number; tags?: CardTag[] };
export type RoomCardsData = Record<string, RoomCardData>;

export function createLibraryRepo(store: KeyValueStore) {
  // Écritures sérialisées : deux changements simultanés ne s'écrasent pas (comme `geo-repo`).
  let writeTail: Promise<unknown> = Promise.resolve();
  // Dernier état lu ou écrit : le panneau, remonté, repart de là sans attendre le stockage.
  let latest: LibraryState | null = null;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  // Copie de sécurité faite (ou déjà présente) : plus besoin de relire sa clé.
  let backedUp = false;
  const backup = async (raw: unknown): Promise<void> => {
    if (backedUp || !isPreV7(raw)) return;
    if ((await store.get<unknown>(BACKUP_KEY)) === undefined) await store.set(BACKUP_KEY, raw);
    backedUp = true;
  };
  // Lecture analysée ; `damaged` : un état était enregistré mais il est illisible (pièce vide affichée, à ne jamais écrire par-dessus).
  const read = async (): Promise<{ raw: unknown; state: LibraryState; damaged: boolean }> => {
    const raw = await store.get<unknown>(KEY);
    const parsed = parseStoredLibraryState(raw);
    return { raw, state: parsed ?? createInitialState(), damaged: parsed === null && raw !== undefined && raw !== null };
  };
  // Écriture d'un changement : copie de sécurité d'abord (son échec annule l'écriture) ; sur un état illisible, le changement reste en mémoire.
  const write = async (change: (state: LibraryState) => LibraryState): Promise<void> => {
    const { raw, state, damaged } = await read();
    if (damaged) {
      latest = change(latest ?? state);
      return;
    }
    await backup(raw);
    const next = change(state);
    await store.set(KEY, next);
    latest = next;
  };

  return {
    current: (): LibraryState | null => latest,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    // Lecture mise en file avec les écritures : un changement lancé pendant le chargement n'est pas écrasé par un état plus ancien.
    // Si le stockage échoue, on affiche une pièce vide SANS l'écrire : les vraies données ne sont jamais remplacées.
    load(): Promise<LibraryState> {
      const run = writeTail.then(async () => {
        try {
          const { raw, state } = await read();
          // Copie faite dès le chargement ; son échec n'empêche pas d'afficher la pièce (aucune écriture de l'état ne se fera sans elle).
          await backup(raw).catch(() => undefined);
          latest = state;
        } catch {
          latest ??= createInitialState();
        }
        notify();
        return latest;
      });
      writeTail = run.catch(() => undefined);
      return run;
    },
    async loadCards(): Promise<RoomCardsData> {
      await writeTail;
      return (await store.get<RoomCardsData>(CARDS_KEY)) ?? {};
    },
    // Fusionne les cartes données ; n'écrit que s'il y a un changement. Renvoie vrai si quelque chose a été écrit.
    saveCards(cards: RoomCardsData): Promise<boolean> {
      const run = writeTail.then(async () => {
        const known = (await store.get<RoomCardsData>(CARDS_KEY)) ?? {};
        const next = { ...known };
        let changed = false;
        for (const [slug, card] of Object.entries(cards)) {
          const before = known[slug];
          const merged: RoomCardData = { ...before, ...card };
          if (JSON.stringify(merged) === JSON.stringify(before)) continue;
          next[slug] = merged;
          changed = true;
        }
        if (changed) await store.set(CARDS_KEY, next);
        return changed;
      });
      writeTail = run.catch(() => undefined);
      return run;
    },
    update(change: (state: LibraryState) => LibraryState): Promise<void> {
      const run = writeTail.then(async () => {
        await write(change);
        notify();
      });
      writeTail = run.catch(() => undefined);
      return run;
    },
    // Comme `update`, mais sans prévenir les abonnés : le plan du chat change toutes les quelques secondes sans qu'il y ait rien à redessiner.
    updateQuiet(change: (state: LibraryState) => LibraryState): Promise<void> {
      const run = writeTail.then(async () => {
        await write(change);
      });
      writeTail = run.catch(() => undefined);
      return run;
    },
  };
}

export type LibraryRepo = ReturnType<typeof createLibraryRepo>;
