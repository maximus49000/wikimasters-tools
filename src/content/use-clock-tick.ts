import { useEffect, useState } from 'react';

// Date relue chaque seconde tant que `active` (une horloge est dans la pièce affichée) et que la page est visible ; sinon figée (aucun minuteur).
export function useClockTick(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const start = () => { if (timer === undefined && document.visibilityState !== 'hidden') timer = window.setInterval(() => setNow(new Date()), 1000); };
    const stop = () => { if (timer !== undefined) window.clearInterval(timer); timer = undefined; };
    const onVis = () => { if (document.visibilityState === 'hidden') stop(); else { setNow(new Date()); start(); } };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [active]);
  return now;
}
