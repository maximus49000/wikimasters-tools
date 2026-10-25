import { describe, expect, it } from 'vitest';
import { SpriteRegistry } from '../../src/content/furniture/sprite-host';
import type { PaintedSprite } from '../../src/content/furniture/sprite-paint';

// Pompe de peinture du registre (tâche 4b) : budget par image selon qu'un repli est affiché ou non, plusieurs tâches par image,
// encodage (finish → toDataURL) reporté à l'image suivante, priorité aux plus grands meubles. Horloge et images d'animation injectées.

const img = (url: string): PaintedSprite => ({ url, box: { x: 0, y: 0, w: 1, h: 1 } });

// Registre à horloge manuelle : chaque tranche coûte `cost(budget)` ms ; `frame()` joue une image d'animation.
function bench(opts: { budgetMs?: number; rushMs?: number } = {}) {
  let clock = 0;
  const queue: (() => void)[] = [];
  const reg = new SpriteRegistry('test', { ...opts, store: null, schedule: (cb) => void queue.push(cb), now: () => clock });
  const log: { k: string; budget: number; frame: number }[] = [];
  const finished: { k: string; frame: number }[] = [];
  let frames = 0;
  // Tâche qui finit après `slices` tranches, chacune coûtant `ms` (ou tout le budget si ms = 'all').
  const job = (k: string, slices: number, ms: number | 'all' = 'all') => () => {
    let n = 0;
    return {
      step(budget: number) {
        log.push({ k, budget, frame: frames });
        clock += ms === 'all' ? budget : ms;
        return ++n >= slices;
      },
      finish() {
        finished.push({ k, frame: frames });
        clock += 1;
        return img(`data:image/png;base64,${k}`);
      },
    };
  };
  const frame = () => {
    frames++;
    const cbs = queue.splice(0);
    for (const cb of cbs) cb();
  };
  const run = (max = 100) => {
    for (let i = 0; i < max && queue.length; i++) frame();
  };
  return { reg, job, log, finished, frame, run, get frames() { return frames; } };
}

describe('pompe de peinture des sprites', () => {
  it('plus de budget par image tant qu’un repli est affiché que quand la pièce est complète', () => {
    // 60 ms de rendu en tout, chaque tranche prend tout le budget qu'on lui donne.
    const work = (b: ReturnType<typeof bench>) => () => {
      let left = 60;
      const j = b.job('a', Infinity)();
      return { step: (budget: number) => (j.step(Math.min(budget, left)), (left -= budget) <= 0), finish: j.finish };
    };
    const rush = bench({ budgetMs: 6, rushMs: 16 });
    rush.reg.want('a', work(rush), () => undefined, { urgent: true });
    rush.run();
    const calm = bench({ budgetMs: 6, rushMs: 16 });
    calm.reg.want('a', work(calm), () => undefined, { urgent: false });
    calm.run();
    const maxOf = (l: { budget: number }[]) => Math.max(...l.map((e) => e.budget));
    expect(maxOf(rush.log)).toBeGreaterThan(maxOf(calm.log));
    expect(maxOf(rush.log)).toBeLessThanOrEqual(16);
    expect(maxOf(calm.log)).toBeLessThanOrEqual(6);
    // À tâche égale, moins d'images pour finir avec le budget élargi.
    expect(rush.frames).toBeLessThan(calm.frames);
  });

  it('budget dynamique : tant qu’un repli est affiché, autant que le temps passé ailleurs depuis l’image précédente, borné', () => {
    let clock = 0;
    const queue: (() => void)[] = [];
    const reg = new SpriteRegistry('test', { budgetMs: 6, rushMs: 12, rushMaxMs: 100, store: null, schedule: (cb) => void queue.push(cb), now: () => clock });
    const budgets: number[] = [];
    // Chaque tranche prend tout son budget ; le reste de la pièce prend `gap` ms entre deux images.
    const job = () => ({ step: (b: number) => (budgets.push(b), (clock += b), false), finish: () => img('data:image/png;base64,A') });
    reg.want('a', job, () => undefined, { urgent: true });
    for (const gap of [0, 5, 40, 300]) {
      clock += gap;
      queue.shift()!();
    }
    // 1re image : rien de mesuré (12) ; 5 ms ailleurs → 12 (plancher) ; 40 → 40 ; 300 → 100 (plafond).
    expect(budgets).toEqual([12, 12, 40, 100]);
    // Sans repli (paliers de vie), 6 ms quel que soit le temps passé ailleurs.
    const calm: number[] = [];
    const q2: (() => void)[] = [];
    const reg2 = new SpriteRegistry('test', { budgetMs: 6, rushMs: 12, rushMaxMs: 100, store: null, schedule: (cb) => void q2.push(cb), now: () => clock });
    reg2.want('b', () => ({ step: (b: number) => (calm.push(b), (clock += b), false), finish: () => img('data:image/png;base64,B') }), () => undefined, { urgent: false });
    for (const gap of [0, 300]) {
      clock += gap;
      q2.shift()!();
    }
    expect(calm).toEqual([6, 6]);
  });

  it('le budget redescend quand plus personne n’attend avec un repli', () => {
    const b = bench({ budgetMs: 6, rushMs: 16 });
    b.reg.want('a', b.job('a', 1, 2), () => undefined, { urgent: true });
    b.reg.want('palier', b.job('palier', 4), () => undefined, { urgent: false });
    b.run();
    const palier = b.log.filter((e) => e.k === 'palier');
    // Dès que « a » est fini (image suivante), seul le palier de vie reste : 6 ms par image.
    expect(palier.at(-1)!.budget).toBeLessThanOrEqual(6);
  });

  it('plusieurs tâches avancent dans une même image si le budget le permet', () => {
    const b = bench({ budgetMs: 6, rushMs: 16 });
    for (const k of ['a', 'b', 'c']) b.reg.want(k, b.job(k, 1, 3), () => undefined, { urgent: true });
    b.frame();
    expect(b.log.filter((e) => e.frame === 1).map((e) => e.k)).toEqual(['a', 'b', 'c']);
  });

  it('l’encodage (finish) est reporté à l’image suivante, hors du budget de l’image qui termine le rendu', () => {
    const b = bench({ budgetMs: 6, rushMs: 16 });
    let done = 0;
    b.reg.want('a', b.job('a', 1, 3), () => done++, { urgent: true });
    b.frame();
    expect(b.finished).toEqual([]);
    expect(done).toBe(0);
    expect(b.reg.pendingCount()).toBe(1);
    b.frame();
    expect(b.finished).toEqual([{ k: 'a', frame: 2 }]);
    expect(done).toBe(1);
    expect(b.reg.pendingCount()).toBe(0);
  });

  it('priorité : repli d’abord, puis le plus grand ; une tâche commencée est menée à son terme', () => {
    const b = bench({ budgetMs: 6, rushMs: 6 });
    b.reg.want('petit', b.job('petit', 2), () => undefined, { urgent: true, priority: 10 });
    b.reg.want('palier', b.job('palier', 2), () => undefined, { urgent: false, priority: 1e6 });
    b.reg.want('grand', b.job('grand', 2), () => undefined, { urgent: true, priority: 500 });
    b.run();
    const order = b.log.map((e) => e.k);
    expect(order).toEqual(['grand', 'grand', 'petit', 'petit', 'palier', 'palier']);
  });

  it('une tâche commencée n’est pas doublée par une demande plus prioritaire arrivée après (un seul tampon de rendu à la fois)', () => {
    const b = bench({ budgetMs: 6, rushMs: 6 });
    b.reg.want('petit', b.job('petit', 3), () => undefined, { urgent: true, priority: 10 });
    b.frame();
    b.reg.want('énorme', b.job('énorme', 1), () => undefined, { urgent: true, priority: 1e9 });
    b.run();
    expect(b.log.map((e) => e.k)).toEqual(['petit', 'petit', 'petit', 'énorme']);
  });

  it('pendingCount compte les tâches en attente, en cours et à encoder', () => {
    const b = bench();
    expect(b.reg.pendingCount()).toBe(0);
    const cancel = b.reg.want('a', b.job('a', 3), () => undefined, { urgent: true });
    b.reg.want('b', b.job('b', 3), () => undefined);
    expect(b.reg.pendingCount()).toBe(2);
    cancel();
    expect(b.reg.pendingCount()).toBe(1);
    b.run();
    expect(b.reg.pendingCount()).toBe(0);
  });
});
