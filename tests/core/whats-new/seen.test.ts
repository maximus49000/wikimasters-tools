import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createWhatsNewRepo } from '../../../src/core/whats-new/seen';
import type { Entry, Fix } from '../../../src/core/whats-new/types';

const entry = (id: string, fresh = false): Entry => ({ id, theme: 'collection', glyph: 'x', title: id, summary: '', steps: [], fresh });
const fix = (id: string): Fix => ({ id, title: id });

describe('createWhatsNewRepo', () => {
  it('au premier lancement, annonce seulement les fiches « fresh » et enregistre le reste comme annoncé', async () => {
    const repo = createWhatsNewRepo(createMemoryStore());
    const pending = await repo.pending([entry('a'), entry('b', true)], [fix('f1')]);
    expect(pending.entries.map((e) => e.id)).toEqual(['b']);
    expect(pending.fixes).toEqual([]);
    // Deuxième lecture : « b » est toujours à annoncer tant qu'il n'est pas marqué.
    expect((await repo.pending([entry('a'), entry('b', true)], [fix('f1')])).entries.map((e) => e.id)).toEqual(['b']);
  });

  it('cumule tout ce qui n’a jamais été annoncé (versions sautées)', async () => {
    const store = createMemoryStore();
    const repo = createWhatsNewRepo(store);
    await repo.pending([entry('a')], [fix('f1')]);
    const pending = await repo.pending([entry('a'), entry('b'), entry('c')], [fix('f1'), fix('f2'), fix('f3')]);
    expect(pending.entries.map((e) => e.id)).toEqual(['b', 'c']);
    expect(pending.fixes.map((f) => f.id)).toEqual(['f2', 'f3']);
  });

  it('n’annonce plus ce qui a été marqué annoncé', async () => {
    const repo = createWhatsNewRepo(createMemoryStore());
    await repo.pending([entry('a')], []);
    await repo.markAnnounced(['b']);
    expect((await repo.pending([entry('a'), entry('b')], [])).entries).toEqual([]);
  });

  it('mémorise les fiches consultées', async () => {
    const repo = createWhatsNewRepo(createMemoryStore());
    expect([...(await repo.consulted())]).toEqual([]);
    await repo.markConsulted('a');
    await repo.markConsulted('a');
    await repo.markConsulted('b');
    expect([...(await repo.consulted())].sort()).toEqual(['a', 'b']);
  });
});
