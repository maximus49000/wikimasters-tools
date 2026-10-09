import { useEffect } from 'react';

// Boucle d'animation sur l'horloge murale : toutes les copies <use> du monde voient le même instant.
// `place` est appelée tout de suite, puis à chaque image (au plus une toutes les `frameMs` ms) tant que la page est visible ;
// pas de boucle si l'utilisateur préfère réduire les animations (ou si le navigateur n'a pas requestAnimationFrame).
export function useWallClockLoop(place: (nowSeconds: number) => void, deps: readonly unknown[], opts: { frameMs?: number } = {}): void {
  const frameMs = opts.frameMs ?? 33;
  useEffect(() => {
    place(Date.now() / 1000);
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || typeof window.requestAnimationFrame !== 'function') return;
    let frame = 0;
    let last = 0;
    const tick = (now: number): void => {
      frame = window.requestAnimationFrame(tick);
      if (document.visibilityState === 'hidden' || now - last < frameMs) return;
      last = now;
      place(Date.now() / 1000);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
