// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { setRoomScene } from '../../src/core/library/library-book';
import { createLibraryRepo } from '../../src/core/library/library-repo';
import { LibraryPanel } from '../../src/content/LibraryPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root?.unmount());
  container?.remove();
});

describe('jour de départ de la rue commerçante', () => {
  it('est posé sur une pièce Ville sans cityEpoch, enregistré ET notifié (la pièce affichée le porte aussitôt)', async () => {
    const repo = createLibraryRepo(createMemoryStore());
    await repo.update((state) => setRoomScene(state, state.rooms[0]!.id, 'city'));
    expect(repo.current()?.rooms[0]?.cityEpoch).toBeUndefined();
    const seen: Array<number | undefined> = [];
    repo.subscribe(() => seen.push(repo.current()?.rooms[0]?.cityEpoch));
    const quiet = vi.spyOn(repo, 'updateQuiet');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root!.render(<LibraryPanel library={repo} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const epoch = repo.current()?.rooms[0]?.cityEpoch;
    expect(typeof epoch).toBe('number');
    // Les abonnés (donc le panneau) ont été prévenus de l'écriture.
    expect(seen).toContain(epoch);
    // Jamais par l'écriture silencieuse : le panneau n'en serait pas prévenu et la rue retomberait sur « aujourd'hui ».
    expect(quiet).not.toHaveBeenCalled();
  });
});
