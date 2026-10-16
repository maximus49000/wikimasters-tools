import { useEffect, useRef, useState } from 'react';
import type { Box } from '../../core/library/zoom-target';
import { reducedMotion } from '../ghibli-sky';
import { lockOrientation } from '../orientation-lock';
import { historyToken } from '../history-token';

export type OpenedPhase = 'opening' | 'open' | 'closing';
export type OpenedState = { placedId: string; from: Box | null; to: Box | null; phase: OpenedPhase };

// Vol (500 ms) + pivot (700 ms) ; fondu simple en mouvement réduit.
export const OPENED_MS = 1200;
export const OPENED_REDUCED_MS = 150;

// Couche de l'objet ouvert : ouverture, ouvert, fermeture. Même modèle d'historique que le zoom d'un meuble (clé wmtOpened) :
// le retour Android / navigateur ferme la couche ; ✕ et Échap retirent eux-mêmes l'entrée.
// onBeforeClose : appelé au retour ; s'il renvoie vrai (il vient de fermer ce qui couvrait la couche), la couche reste.
// restoreOrientation : rend l'orientation de la pièce à la fermeture.
// closeTarget : rectangle vers lequel le boîtier vole quand on le ferme sans en donner un (✕, Échap, retour) — devant le poste
// si son disque y est, sinon sa place d'origine ; null = fondu sur place.
export function useOpenedItem(opts: { onBeforeClose?: () => boolean; restoreOrientation: () => void; closeTarget?: () => Box | null }): {
  opened: OpenedState | null; open: (placedId: string, from: Box | null) => void; close: (to?: Box | null) => void;
  // Fermeture immédiate, sans animation (changement de pièce, sortie du plein écran, zoom remis à zéro). Rend vrai si l'entrée
  // d'historique de la couche est au-dessus de la pile : l'appelant la retire (history.go), avec celles d'en dessous s'il y a lieu.
  reset: () => boolean;
} {
  const [opened, setOpened] = useState<OpenedState | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const phase = useRef<OpenedPhase | null>(null);
  const timer = useRef(0);
  const ours = useRef(false);
  // Jeton propre à chaque ouverture (voir history-token) : une entrée plus ancienne portant `wmtOpened` n'est pas la nôtre.
  const token = useRef('');
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
      token.current = historyToken();
      history.pushState({ ...(history.state ?? {}), wmtOpened: token.current }, '');
      ours.current = true;
    }
  };
  const target = (): Box | null => optsRef.current.closeTarget?.() ?? null;
  const close = (to?: Box | null) => {
    if (phase.current === null || phase.current === 'closing') return;
    beginClose(to === undefined ? target() : to);
    if (ours.current) {
      ours.current = false;
      if (history.state?.wmtOpened === token.current) history.back();
    }
  };

  const reset = (): boolean => {
    window.clearTimeout(timer.current);
    // Une fermeture en cours a déjà rendu l'orientation.
    const shown = phase.current === 'opening' || phase.current === 'open';
    phase.current = null;
    setOpened(null);
    if (shown) optsRef.current.restoreOrientation();
    if (!ours.current) return false;
    ours.current = false;
    return history.state?.wmtOpened === token.current;
  };

  useEffect(() => {
    // Notre entrée vient d'être retirée (retour) : on ferme sans toucher à l'historique.
    const onPop = () => {
      if (!ours.current) return;
      if (optsRef.current.onBeforeClose?.()) {
        history.pushState({ ...(history.state ?? {}), wmtOpened: token.current }, '');
        return;
      }
      ours.current = false;
      if (phase.current !== 'closing') beginClose(target());
    };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); window.clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { opened, open, close, reset };
}
