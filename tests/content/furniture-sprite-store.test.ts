import { IDBDatabase, IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { SpriteRegistry } from '../../src/content/furniture/sprite-host';
import type { PaintedSprite } from '../../src/content/furniture/sprite-paint';
import { createSpriteStore, type SpriteStore } from '../../src/content/furniture/sprite-store';

// Mémoire persistante des sprites (tâche 4b) : data URL gardées en IndexedDB (faux IndexedDB en mémoire ici), relues sans peinture
// au rechargement, invalidées par un changement de version du dessin, plafonnées en octets (LRU par date de dernière lecture).

const sprite = (c: string, n = 4): PaintedSprite => ({ url: `data:image/png;base64,${c.repeat(n)}`, box: { x: -1, y: -2, w: 3, h: 4 } });

// Registre à images manuelles ; `settle` laisse passer les événements d'IndexedDB (macrotâches) et joue les images en attente.
function registry(store: SpriteStore | null) {
  const queue: (() => void)[] = [];
  const reg = new SpriteRegistry('test', { store, schedule: (cb) => void queue.push(cb) });
  const settle = async () => {
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 0));
      while (queue.length) queue.shift()!();
    }
  };
  return { reg, settle };
}
// Peintre compté : nombre de tâches fabriquées et de tranches jouées.
function painter(s: PaintedSprite) {
  const count = { made: 0, steps: 0 };
  const job = () => {
    count.made++;
    return { step: () => (count.steps++, true), finish: () => s };
  };
  return { count, job };
}
const want = (reg: SpriteRegistry, k: string, job: () => ReturnType<ReturnType<typeof painter>['job']>) => {
  let done = 0;
  reg.want(k, job, () => done++, { urgent: true });
  return () => done;
};

describe('mémoire persistante des sprites', () => {
  it('un sprite peint est écrit, puis relu SANS peinture par un nouveau registre (rechargement)', async () => {
    const factory = new IDBFactory();
    const first = registry(createSpriteStore({ factory, gen: 'cel1' }));
    const p1 = painter(sprite('A'));
    const d1 = want(first.reg, 'cel1|f|sofa', p1.job);
    await first.settle();
    expect(d1()).toBe(1);
    expect(p1.count.steps).toBeGreaterThan(0);
    const store = createSpriteStore({ factory, gen: 'cel1' })!;
    expect(await store.bytes()).toBe(sprite('A').url.length);

    // Rechargement : nouvelle base ouverte, nouveau registre.
    const second = registry(createSpriteStore({ factory, gen: 'cel1' }));
    const p2 = painter(sprite('Z'));
    const d2 = want(second.reg, 'cel1|f|sofa', p2.job);
    await second.settle();
    expect(d2()).toBe(1);
    expect(p2.count).toEqual({ made: 0, steps: 0 });
    expect(second.reg.get('cel1|f|sofa')).toEqual(sprite('A'));
  });

  it('petite mémoire : tout est relu à l’ouverture, une image demandée ne coûte aucune lecture de plus', async () => {
    const factory = new IDBFactory();
    const store = createSpriteStore({ factory, gen: 'cel1' })!;
    for (const k of ['a', 'b']) await store.write(k, sprite(k.toUpperCase()));
    const again = createSpriteStore({ factory, gen: 'cel1' })!;
    await again.count(); // base ouverte (et relue)
    const proto = IDBDatabase.prototype;
    const tx = proto.transaction;
    const modes: string[] = [];
    proto.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      modes.push(String(args[0]));
      return tx.apply(this, args);
    } as IDBDatabase['transaction'];
    try {
      const got = await Promise.all(['a', 'b', 'absent'].map((k) => again.read(k)));
      expect(got.map((s) => s?.url ?? null)).toEqual([sprite('A').url, sprite('B').url, null]);
      await new Promise((r) => setTimeout(r, 0));
      // Seule l'écriture groupée des dates de lecture touche la base (la table des fiches, pas celle des images).
      expect(modes).toEqual(['meta']);
    } finally {
      proto.transaction = tx;
    }
  });

  it('indice de taille : gardé à chaque écriture ; avec lui, fiches et images sont demandées ensemble à l’ouverture', async () => {
    const factory = new IDBFactory();
    const map = new Map<string, string>();
    const hint = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) } as unknown as Storage;
    const store = createSpriteStore({ factory, gen: 'cel1', hint })!;
    await store.write('a', sprite('A'));
    expect(map.get('wmt:sprites-bytes:cel1')).toBe(String(sprite('A').url.length));
    // Ouverture suivante : la lecture des images part avant la réponse des fiches.
    const proto = IDBObjectStore.prototype;
    const getAll = proto.getAll;
    const order: string[] = [];
    proto.getAll = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['getAll']>) {
      order.push(this.name);
      return getAll.apply(this, args);
    } as IDBObjectStore['getAll'];
    try {
      const again = createSpriteStore({ factory, gen: 'cel1', hint })!;
      expect((await again.read('a'))?.url).toBe(sprite('A').url);
      expect(order).toEqual(['data', 'meta']);
    } finally {
      proto.getAll = getAll;
    }
  });

  it('grande mémoire : les images demandées ensemble sont relues dans une seule transaction', async () => {
    const factory = new IDBFactory();
    const store = createSpriteStore({ factory, gen: 'cel1' })!;
    for (const k of ['a', 'b', 'c']) await store.write(k, sprite(k.toUpperCase()));
    const again = createSpriteStore({ factory, gen: 'cel1', preloadBytes: 0 })!;
    await again.count(); // base ouverte
    const proto = IDBDatabase.prototype;
    const tx = proto.transaction;
    let n = 0;
    proto.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      n++;
      return tx.apply(this, args);
    } as IDBDatabase['transaction'];
    try {
      const got = await Promise.all(['a', 'b', 'c', 'absent'].map((k) => again.read(k)));
      expect(got.map((s) => s?.url ?? null)).toEqual([sprite('A').url, sprite('B').url, sprite('C').url, null]);
      expect(n).toBe(1);
    } finally {
      proto.transaction = tx;
    }
  });

  it('pas de peinture tant que la lecture est en cours ; une clé absente est peinte ensuite', async () => {
    const factory = new IDBFactory();
    const { reg, settle } = registry(createSpriteStore({ factory, gen: 'cel1' }));
    const p = painter(sprite('B'));
    const d = want(reg, 'cel1|f|lamp', p.job);
    expect(p.count.made).toBe(0);
    await settle();
    expect(p.count.made).toBe(1);
    expect(d()).toBe(1);
  });

  it('une image d’une autre version du dessin n’est pas relue (et la place est libérée)', async () => {
    const factory = new IDBFactory();
    const old = registry(createSpriteStore({ factory, gen: 'cel1' }));
    want(old.reg, 'k', painter(sprite('A')).job);
    await old.settle();
    const neu = registry(createSpriteStore({ factory, gen: 'cel2' }));
    const p = painter(sprite('N'));
    want(neu.reg, 'k', p.job);
    await neu.settle();
    expect(p.count.made).toBe(1);
    expect(neu.reg.get('k')).toEqual(sprite('N'));
    // Seule la nouvelle image occupe la mémoire.
    expect(await createSpriteStore({ factory, gen: 'cel2' })!.bytes()).toBe(sprite('N').url.length);
  });

  it('le plafond d’octets évince l’image lue le moins récemment', async () => {
    const factory = new IDBFactory();
    let clock = 0;
    const size = sprite('A', 10).url.length;
    const store = createSpriteStore({ factory, gen: 'cel1', maxBytes: size * 2 + 1, now: () => ++clock })!;
    await store.write('a', sprite('A', 10));
    await store.write('b', sprite('B', 10));
    expect((await store.read('a'))?.url).toBe(sprite('A', 10).url); // « a » relue : « b » est la plus ancienne
    await store.write('c', sprite('C', 10));
    expect(await store.bytes()).toBeLessThanOrEqual(size * 2 + 1);
    const again = createSpriteStore({ factory, gen: 'cel1', maxBytes: size * 2 + 1 })!;
    expect(await again.read('b')).toBeNull();
    expect((await again.read('a'))?.url).toBe(sprite('A', 10).url);
    expect((await again.read('c'))?.url).toBe(sprite('C', 10).url);
  });

  it('sans IndexedDB, aucune erreur : la peinture se fait comme avant', async () => {
    expect(createSpriteStore({ factory: null })).toBeNull();
    const none = registry(createSpriteStore({ factory: null }));
    const p = painter(sprite('A'));
    const d = want(none.reg, 'k', p.job);
    await none.settle();
    expect(d()).toBe(1);
    // IndexedDB qui refuse de s'ouvrir (navigation privée, quota) : même chose, sans rejet non rattrapé.
    const broken = { open: () => { throw new Error('refusé'); } } as unknown as IDBFactory;
    const b = registry(createSpriteStore({ factory: broken, gen: 'cel1' }));
    const pb = painter(sprite('B'));
    const db = want(b.reg, 'k', pb.job);
    await b.settle();
    expect(db()).toBe(1);
    expect(pb.count.made).toBe(1);
  });

  it('sous jsdom/vitest, le registre par défaut se passe de mémoire persistante', () => {
    expect(typeof indexedDB).toBe('undefined');
    const reg = new SpriteRegistry('défaut', { schedule: () => undefined });
    const p = painter(sprite('A'));
    // Sans mémoire, la tâche entre directement dans la file de peinture (aucune lecture en attente).
    reg.want('k', p.job, () => undefined, { urgent: true });
    expect(reg.pendingCount()).toBe(1);
  });
});
