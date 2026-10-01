import { describe, expect, it, vi } from 'vitest';
import { createCallQueue } from '../../../src/core/spotify/call-queue';

// Horloge simulée : attendre fait avancer le temps.
function clocked(gaps = {}) {
  let clock = 0;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const queue = createCallQueue({ gaps, now: () => clock, sleep });
  return { queue, sleep, now: () => clock };
}

describe('createCallQueue', () => {
  it("fait passer la lecture, puis le contenu de la page, puis les images, même arrivés dans l'ordre inverse", async () => {
    const { queue } = clocked();
    const order: string[] = [];
    const job = (name: string) => async () => void order.push(name);
    await Promise.all([queue.run('image', job('image')), queue.run('page', job('page')), queue.run('now', job('now'))]);
    expect(order).toEqual(['now', 'page', 'image']);
  });

  it("sert dans l'ordre d'arrivée à l'intérieur d'un niveau", async () => {
    const { queue } = clocked();
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((n) => queue.run('page', async () => void order.push(n))));
    expect(order).toEqual([1, 2, 3]);
  });

  it("espace les appels selon le niveau, depuis le début de l'appel précédent", async () => {
    const { queue, now } = clocked({ page: 250, image: 1_000 });
    const starts: number[] = [];
    const job = async () => void starts.push(now());
    await queue.run('page', job);
    await queue.run('page', job);
    await queue.run('image', job);
    expect(starts).toEqual([0, 250, 1_250]);
  });

  it('un appel plus prioritaire arrivé pendant une attente passe devant', async () => {
    let clock = 0;
    const order: string[] = [];
    const holder: { queue?: ReturnType<typeof createCallQueue> } = {};
    let injected = false;
    const sleep = async (ms: number) => {
      clock += ms;
      if (!injected) {
        injected = true;
        void holder.queue?.run('page', async () => void order.push('page'));
      }
    };
    holder.queue = createCallQueue({ gaps: { page: 250, image: 1_000 }, now: () => clock, sleep });
    await Promise.all([
      holder.queue.run('image', async () => void order.push('image 1')),
      holder.queue.run('image', async () => void order.push('image 2')),
    ]);
    // La seconde image attend son délai ; pendant ce temps un appel de contenu arrive et part avant elle.
    expect(order).toEqual(['image 1', 'page', 'image 2']);
  });

  it("refuse sans délai un appel dont la garde rejette, et cela ne compte pas dans l'espacement", async () => {
    const { queue, sleep } = clocked({ page: 250 });
    const refused = new Error('pause');
    await expect(queue.run('page', async () => 'jamais', () => Promise.reject(refused))).rejects.toBe(refused);
    expect(sleep).not.toHaveBeenCalled();
    // Le premier appel réel part tout de suite : le refus n'a pas consommé de délai.
    await queue.run('page', async () => 'ok');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('exécute un seul appel à la fois', async () => {
    const { queue } = clocked();
    let running = 0;
    let peak = 0;
    const job = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
    };
    await Promise.all([queue.run('page', job), queue.run('page', job), queue.run('now', job)]);
    expect(peak).toBe(1);
  });

  it('un appel en échec ne bloque pas les suivants', async () => {
    const { queue } = clocked();
    const failing = queue.run('page', async () => Promise.reject(new Error('boom')));
    const next = queue.run('page', async () => 'suite');
    await expect(failing).rejects.toThrow('boom');
    expect(await next).toBe('suite');
  });
});
