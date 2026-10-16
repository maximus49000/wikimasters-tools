import { useEffect, useRef, useState } from 'react';
import type { Box } from '../../core/library/zoom-target';
import { reducedMotion } from '../ghibli-sky';
import { lockOrientation } from '../orientation-lock';

export type OpenedPhase = 'opening' | 'open' | 'closing';
export type OpenedState = { placedId: string; from: Box | null; to: Box | null; phase: OpenedPhase };

// Vol (500 ms) + pivot (700 ms) ; fondu simple en mouvement réduit.
export const OPENED_MS = 1200;
export const OPENED_REDUCED_MS = 150;

// Couche de l'objet ouvert : ouverture, ouvert, fermeture. Même modèle d'historique que le zoom d'un meuble (clé wmtOpened) :
// le retour Android / navigateur ferme la couche ; ✕ et Échap retirent eux-mêmes l'entrée.
// onBeforeClose : appelé au retour ; s'il renvoie vrai (il vient de fermer ce qui couvrait la couche), la couche reste.
// restoreOrientation : rend l'orientation de la pièce à la fermeture.
export function useOpenedItem(opts: { onBeforeClose?: () => boolean; restoreOrientation: () => void }): {
  opened: OpenedState | null; open: (placedId: string, from: Box | null) => void; close: (to: Box | null) => void;
} {
  const [opened, setOpened] = useState<OpenedState | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const phase = useRef<OpenedPhase | null>(null);
  const timer = useRef(0);
  const ours = useRef(false);
  const later = (fn: () => void) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(fn, reducedMotion() ? OPENED_REDUCED_MS : OPENED_MS); };

  const beginClose = (to: Box | null) => {
    phase.current = 'closing';
    setOpened((o) => (o ? { ...o, to, phase: 'closing' } : o));
    optsRef.current.restoreOrientation();
    later(() => { phase.current = null; setOpened(null); });
  };
  const open = (placedId: string, from: Box | null) => {
    // Double tap : rien pendant une ouverture ou une fermeture en cours.
    if (phase.current === 'opening' || phase.current === 'closing') return;
    phase.current = 'opening';
    setOpened({ placedId, from, to: null, phase: 'opening' });
    later(() => { phase.current = 'open'; setOpened((o) => (o ? { ...o, phase: 'open' } : o)); });
    lockOrientation('landscape');
    if (!ours.current) {
      history.pushState({ ...(history.state ?? {}), wmtOpened: true }, '');
      ours.current = true;
    }
  };
  const close = (to: Box | null) => {
    if (phase.current === null || phase.current === 'closing') return;
    beginClose(to);
    if (ours.current) {
      ours.current = false;
      if (history.state?.wmtOpened) history.back();
    }
  };

  useEffect(() => {
    // Notre entrée vient d'être retirée (retour) : on ferme sans toucher à l'historique.
    const onPop = () => {
      if (!ours.current) return;
      if (optsRef.current.onBeforeClose?.()) {
        history.pushState({ ...(history.state ?? {}), wmtOpened: true }, '');
        return;
      }
      ours.current = false;
      if (phase.current !== 'closing') beginClose(null);
    };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); window.clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { opened, open, close };
}
