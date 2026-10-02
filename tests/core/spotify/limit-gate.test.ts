import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createLimitGate } from '../../../src/core/spotify/limit-gate';

describe('createLimitGate', () => {
  it("n'a aucune pause au départ", async () => {
    const gate = createLimitGate({ store: createMemoryStore() });
    expect(await gate.remainingMs('search')).toBe(0);
  });

  it("garde la pause demandée par Spotify : une autre instance sur le même stockage la voit, jusqu'à son terme", async () => {
    let clock = 1_000;
    const store = createMemoryStore();
    const first = createLimitGate({ store, now: () => clock });
    expect(await first.trip('search', 56_900_000)).toEqual({ waitMs: 56_900_000, until: 56_901_000 });

    clock += 60_000;
    const second = createLimitGate({ store, now: () => clock });
    expect(await second.remainingMs('search')).toBe(56_840_000);
    clock += 56_840_000;
    expect(await second.remainingMs('search')).toBe(0);
  });

  it('la pause est par famille : la recherche en pause laisse passer le lecteur', async () => {
    const gate = createLimitGate({ store: createMemoryStore(), now: () => 0 });
    await gate.trip('search', 60_000);
    expect(await gate.remainingMs('search')).toBe(60_000);
    expect(await gate.remainingMs('player')).toBe(0);
    expect(await gate.remainingMs('catalog')).toBe(0);
  });

  it("sans Retry-After lisible, l'attente s'allonge à chaque limite d'affilée (5 s, ×3, plafond 5 min), même entre deux instances", async () => {
    let clock = 0;
    const store = createMemoryStore();
    const waits: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const gate = createLimitGate({ store, now: () => clock });
      const { waitMs } = await gate.trip('search', null);
      waits.push(waitMs);
      clock += waitMs;
    }
    expect(waits).toEqual([5_000, 15_000, 45_000, 135_000, 300_000, 300_000]);
  });

  it("une réponse qui n'est pas un 429 remet l'escalade à zéro, dans sa famille seulement", async () => {
    const gate = createLimitGate({ store: createMemoryStore(), now: () => 0 });
    await gate.trip('search', null);
    await gate.trip('search', null);
    await gate.trip('player', null);
    await gate.success('search');
    expect((await gate.trip('search', null)).waitMs).toBe(5_000);
    expect((await gate.trip('player', null)).waitMs).toBe(15_000);
  });

  it("un Retry-After lisible est respecté tel quel et remet l'escalade à zéro", async () => {
    const gate = createLimitGate({ store: createMemoryStore(), now: () => 0 });
    expect((await gate.trip('search', null)).waitMs).toBe(5_000);
    expect((await gate.trip('search', 40_000)).waitMs).toBe(40_000);
    expect((await gate.trip('search', null)).waitMs).toBe(5_000);
  });

  it('un autre préfixe garde sa pause à part (Tidal) sans toucher celle de Spotify', async () => {
    const store = createMemoryStore();
    const spotify = createLimitGate({ store, now: () => 0 });
    const tidal = createLimitGate({ store, now: () => 0, prefix: 'tidal-limit' });
    await tidal.trip('catalog', 30_000);
    expect(await tidal.remainingMs('catalog')).toBe(30_000);
    expect(await spotify.remainingMs('catalog')).toBe(0);
    expect(await store.get('tidal-limit:catalog')).toBeTruthy();
  });
});
