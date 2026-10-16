import { useEffect, useRef, useState } from 'react';
import type { ShelfLevel } from '../core/library/library-types';
import type { Box, ZoomTarget } from '../core/library/zoom-target';
import { ZOOM_MS, ZOOM_REDUCED_MS, type ZoomPhase } from './furniture-zoom';
import { reducedMotion } from './ghibli-sky';
import { historyToken } from './history-token';

export type ZoomState = { target: ZoomTarget; from: Box | null; phase: ZoomPhase; level: ShelfLevel | null };

// État du zoom sur un meuble : ouverture (500 ms), ouvert, fermeture (500 ms). Une entrée d'historique est posée à l'ouverture,
// pour que le retour Android (WebView.goBack) ou celui du navigateur ferme le zoom ; ← et Échap la retirent eux-mêmes.
// onBeforeClose : appelé au retour ; s'il renvoie vrai (il vient de fermer ce qui couvrait le zoom, la fiche), le zoom reste.
export function useFurnitureZoom(onBeforeClose?: () => boolean): { zoom: ZoomState | null; open: (target: ZoomTarget, from: Box | null) => void; close: () => void; reset: () => void; setLevel: (level: ShelfLevel | null) => void } {
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const beforeClose = useRef(onBeforeClose);
  beforeClose.current = onBeforeClose;
  const timer = useRef(0);
  const ours = useRef(false);
  const token = useRef('');
  const isOurs = () => history.state?.wmtZoom === token.current;
  const duration = () => (reducedMotion() ? ZOOM_REDUCED_MS : ZOOM_MS);
  const later = (fn: () => void) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(fn, duration()); };

  const finishClose = () => later(() => setZoom(null));
  const open = (target: ZoomTarget, from: Box | null) => {
    setZoom({ target, from, phase: 'opening', level: null });
    later(() => setZoom((z) => (z ? { ...z, phase: 'open' } : z)));
    token.current = historyToken();
    history.pushState({ ...(history.state ?? {}), wmtZoom: token.current }, '');
    ours.current = true;
  };
  // Second zoom : la tablette `level` (null : retour à la vue de face). Pas d'entrée d'historique en plus : le retour Android
  // passe par onBeforeClose, qui ramène à la vue de face.
  const setLevel = (level: ShelfLevel | null) => setZoom((z) => (z ? { ...z, level } : z));
  // ← / Échap / fond : retire notre entrée d'historique (le popstate qui suit est ignoré), puis anime la fermeture.
  const close = () => {
    setZoom((z) => (z && z.phase !== 'closing' ? { ...z, phase: 'closing' } : z));
    finishClose();
    if (ours.current) {
      ours.current = false;
      if (isOurs()) history.back();
    }
  };
  // Changement de pièce, sortie du plein écran : fermeture immédiate.
  const reset = () => {
    window.clearTimeout(timer.current);
    setZoom(null);
    if (ours.current) {
      ours.current = false;
      if (isOurs()) history.back();
    }
  };

  useEffect(() => {
    // Retour Android / navigateur : notre entrée vient d'être retirée, on ferme sans toucher à l'historique.
    const onPop = () => {
      if (!ours.current) return;
      // Notre entrée est encore là : c'est celle d'une couche posée par-dessus (objet ouvert) qui vient d'être retirée.
      if (isOurs()) return;
      // La fiche ouverte par-dessus se ferme d'abord : on repose notre entrée, le zoom reste ouvert.
      if (beforeClose.current?.()) {
        history.pushState({ ...(history.state ?? {}), wmtZoom: token.current }, '');
        return;
      }
      ours.current = false;
      setZoom((z) => (z && z.phase !== 'closing' ? { ...z, phase: 'closing' } : z));
      finishClose();
    };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); window.clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { zoom, open, close, reset, setLevel };
}
