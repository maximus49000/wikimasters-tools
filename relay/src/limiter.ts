// relay/src/limiter.ts
// Compteurs de fenêtre fixe en mémoire du Worker : par isolat, remis à zéro quand il est recyclé. C'est un filtre contre l'usage
// abusif, pas une garantie (l'API Cache de Cloudflare ne fonctionne pas sur workers.dev).
export type Verdict = { ok: boolean; retryAfterSec: number };

type Window = { start: number; count: number; windowMs: number };
const MAX_KEYS = 5_000;

export function createLimiter(now: () => number) {
  const windows = new Map<string, Window>();
  return {
    check(key: string, limit: number, windowMs: number): Verdict {
      const at = now();
      if (windows.size > MAX_KEYS) {
        for (const [name, window] of windows) if (at - window.start >= window.windowMs) windows.delete(name);
      }
      const current = windows.get(key);
      if (!current || at - current.start >= windowMs) {
        windows.set(key, { start: at, count: 1, windowMs });
        return { ok: true, retryAfterSec: 0 };
      }
      if (current.count >= limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((current.start + windowMs - at) / 1000)) };
      current.count += 1;
      return { ok: true, retryAfterSec: 0 };
    },
  };
}
