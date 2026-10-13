import { useEffect, useRef, useState } from 'react';
import type { Box, ZoomTarget } from '../core/library/zoom-target';
import { ZOOM_MS, ZOOM_REDUCED_MS, type ZoomPhase } from './furniture-zoom';
import { reducedMotion } from './ghibli-sky';

export type ZoomState = { target: ZoomTarget; from: Box | null; phase: ZoomPhase };

// État du zoom sur un meuble : ouverture (500 ms), ouvert, fermeture (500 ms). Une entrée d'historique est posée à l'ouverture,
// pour que le retour Android (WebView.goBack) ou celui du navigateur ferme le zoom ; ← et Échap la retirent eux-mêmes.
export function useFurnitureZoom(): { zoom: ZoomState | null; open: (target: ZoomTarget, from: Box | null) => void; close: () => void; reset: () => void } {
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const timer = useRef(0);
  const ours = useRef(false);
  const duration = () => (reducedMotion() ? ZOOM_REDUCED_MS : ZOOM_MS);
  const later = (fn: () => void) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(fn, duration()); };

  const finishClose = () => later(() => setZoom(null));
  const open = (target: ZoomTarget, from: Box | null) => {
    setZoom({ target, from, phase: 'opening' });
    later(() => setZoom((z) => (z ? { ...z, phase: 'open' } : z)));
    history.pushState({ ...(history.state ?? {}), wmtZoom: true }, '');
    ours.current = true;
  };
  // ← / Échap / fond : retire notre entrée d'historique (le popstate qui suit est ignoré), puis anime la fermeture.
  const close = () => {
    setZoom((z) => (z && z.phase !== 'closing' ? { ...z, phase: 'closing' } : z));
    finishClose();
    if (ours.current) {
      ours.current = false;
      if (history.state?.wmtZoom) history.back();
    }
  };
  // Changement de pièce, sortie du plein écran : fermeture immédiate.
  const reset = () => {
    window.clearTimeout(timer.current);
    setZoom(null);
    if (ours.current) {
      ours.current = false;
      if (history.state?.wmtZoom) history.back();
    }
  };

  useEffect(() => {
    // Retour Android / navigateur : notre entrée vient d'être retirée, on ferme sans toucher à l'historique.
    const onPop = () => {
      if (!ours.current) return;
      ours.current = false;
      setZoom((z) => (z && z.phase !== 'closing' ? { ...z, phase: 'closing' } : z));
      finishClose();
    };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); window.clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { zoom, open, close, reset };
}
