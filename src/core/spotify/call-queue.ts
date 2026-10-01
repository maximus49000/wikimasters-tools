// Niveaux d'appel, du plus au moins pressé : la lecture, le contenu de la page (listes d'écoute), puis les images (pochettes, photos).
export type Priority = 'now' | 'page' | 'image';

const ORDER: readonly Priority[] = ['now', 'page', 'image'];

type Job = {
  priority: Priority;
  run: () => Promise<unknown>;
  guard: (() => Promise<void>) | undefined;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export type CallQueueDeps = {
  // Délai minimal avant un appel du niveau, compté depuis le début de l'appel précédent (0 si absent).
  gaps?: Partial<Record<Priority, number>>;
  now?: () => number;
  // Remplaçable en test.
  sleep?: (ms: number) => Promise<void>;
};

// Un seul appel à la fois : Spotify limite l'application entière, une rafale d'images ne doit pas passer devant le contenu de la page.
export function createCallQueue(deps: CallQueueDeps = {}) {
  const { gaps = {}, now = () => Date.now(), sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) } = deps;
  const pending: Record<Priority, Job[]> = { now: [], page: [], image: [] };
  let draining = false;
  let lastStart = -Infinity;

  const best = (): Job | undefined => {
    for (const priority of ORDER) {
      const first = pending[priority][0];
      if (first) return first;
    }
    return undefined;
  };
  const drop = (job: Job): void => {
    pending[job.priority] = pending[job.priority].filter((other) => other !== job);
  };

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      for (;;) {
        const next = best();
        if (!next) return;
        // La garde (pause enregistrée) peut refuser l'appel : il n'attend alors aucun délai.
        try {
          await next.guard?.();
        } catch (error) {
          drop(next);
          next.reject(error);
          continue;
        }
        const wait = lastStart + (gaps[next.priority] ?? 0) - now();
        if (wait > 0) {
          await sleep(wait);
          // Un appel plus prioritaire a pu arriver, ou une pause commencer : on refait le choix.
          continue;
        }
        if (best() !== next) continue;
        drop(next);
        lastStart = now();
        try {
          next.resolve(await next.run());
        } catch (error) {
          next.reject(error);
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    run<T>(priority: Priority, job: () => Promise<T>, guard?: () => Promise<void>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pending[priority].push({ priority, run: job, guard, resolve: resolve as (value: unknown) => void, reject });
        // Au tour suivant : les appels lancés dans le même élan sont classés avant le premier départ.
        void Promise.resolve().then(drain);
      });
    },
  };
}

export type CallQueue = ReturnType<typeof createCallQueue>;
