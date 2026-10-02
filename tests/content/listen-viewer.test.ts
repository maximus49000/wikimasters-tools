import { describe, expect, it, vi } from 'vitest';
import { createListenViewer, type ListenViewerDeps } from '../../src/content/listen-viewer';
import { createMemoryStore } from '../../src/core/cache/store';
import { createListenRepo } from '../../src/core/music/listen-repo';

const album = { kind: 'album' as const, items: [{ uri: 'x:1', title: 'Come Together', artist: 'The Beatles' }], albumUri: 'x:album:1' };

function setup(over: Partial<ListenViewerDeps> = {}) {
  const resolve = vi.fn(async () => album as never);
  const viewer = createListenViewer({
    collection: { list: async () => [{ slug: 'Abbey_Road', title: 'Abbey_Road' }] },
    kinds: {
      resolveMissing: async () => undefined,
      load: async () => ({ cards: { Abbey_Road: { natures: ['Q482994'], occupations: [], genres: [] } }, labels: {} }) as never,
    },
    music: { resolve: async () => ({ Abbey_Road: { performer: 'The Beatles' } }) as never },
    listens: createListenRepo(createMemoryStore()),
    session: { isLinked: async () => true },
    resolve,
    describeError: (error) => ({ message: `échec : ${String(error)}` }),
    ...over,
  });
  return { viewer, resolve };
}

describe('createListenViewer', () => {
  it("rend la liste de resolve, puis la garde : resolve n'est plus appelé", async () => {
    const { viewer, resolve } = setup();
    expect(await viewer.show('Abbey_Road', 'Abbey Road', false)).toEqual({ status: 'ready', listen: album });
    await viewer.show('Abbey_Road', 'Abbey Road', false);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ title: 'Abbey Road', kind: 'album', music: { performer: 'The Beatles' } });
  });

  it('rend none hors collection, unlinked sans compte, notfound quand resolve ne trouve rien', async () => {
    expect(await setup({ collection: { list: async () => [] } }).viewer.show('Abbey_Road', 'x', false)).toEqual({ status: 'none' });
    const unlinked = setup({ session: { isLinked: async () => false } });
    expect(await unlinked.viewer.show('Abbey_Road', 'x', false)).toEqual({ status: 'unlinked' });
    expect(unlinked.resolve).not.toHaveBeenCalled();
    expect(await setup({ resolve: async () => null }).viewer.show('Abbey_Road', 'x', false)).toEqual({ status: 'notfound' });
  });

  it('rend le message de describeError, avec retryAfterMs seulement quand il existe, et ne garde pas une erreur', async () => {
    const failing = setup({
      resolve: vi.fn(async () => {
        throw new Error('boum');
      }),
      describeError: () => ({ message: 'patiente', retryAfterMs: 4_000 }),
    });
    expect(await failing.viewer.show('Abbey_Road', 'x', false)).toEqual({ status: 'error', message: 'patiente', retryAfterMs: 4_000 });
    const boom = vi.fn(async () => {
      throw new Error('boum');
    });
    const plain = setup({ resolve: boom, describeError: () => ({ message: 'panne' }) });
    expect(await plain.viewer.show('Abbey_Road', 'x', false)).toEqual({ status: 'error', message: 'panne' });
    await plain.viewer.show('Abbey_Road', 'x', false);
    expect(boom).toHaveBeenCalledTimes(2);
  });
});
