import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createTempoRepo } from '../../../src/core/music/tempo-repo';

const DAY = 86_400_000;

describe('createTempoRepo', () => {
  it('rend undefined pour une piste jamais mesurée', async () => {
    const repo = createTempoRepo(createMemoryStore());
    expect(await repo.get('spotify:track:a')).toBeUndefined();
  });

  it('garde un tempo trouvé 180 jours : relu à 179 j, plus à 181 j', async () => {
    let t = 1_000_000;
    const repo = createTempoRepo(createMemoryStore(), () => t);
    await repo.save('spotify:track:a', 124);
    t += 179 * DAY;
    expect(await repo.get('spotify:track:a')).toBe(124);
    t += 2 * DAY;
    expect(await repo.get('spotify:track:a')).toBeUndefined();
  });

  it('garde « introuvable » (null) 30 jours : relu à 29 j, plus à 31 j', async () => {
    let t = 5_000;
    const repo = createTempoRepo(createMemoryStore(), () => t);
    await repo.save('spotify:track:a', null);
    t += 29 * DAY;
    expect(await repo.get('spotify:track:a')).toBeNull();
    t += 2 * DAY;
    expect(await repo.get('spotify:track:a')).toBeUndefined();
  });

  it('écrit sous la clé tempo-v1, indexée par uri', async () => {
    const store = createMemoryStore();
    const repo = createTempoRepo(store, () => 10);
    await repo.save('spotify:track:a', 90);
    await repo.save('spotify:track:b', null);
    const raw = await store.get<Record<string, unknown>>('tempo-v1');
    expect(Object.keys(raw ?? {}).sort()).toEqual(['spotify:track:a', 'spotify:track:b']);
    expect(await repo.get('spotify:track:b')).toBeNull();
  });

  it('des sauvegardes simultanées ne s’écrasent pas', async () => {
    const repo = createTempoRepo(createMemoryStore());
    await Promise.all([repo.save('a', 100), repo.save('b', 110), repo.save('c', null)]);
    expect(await repo.get('a')).toBe(100);
    expect(await repo.get('b')).toBe(110);
    expect(await repo.get('c')).toBeNull();
  });
});
