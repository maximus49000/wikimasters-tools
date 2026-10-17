// Ouverture / fermeture de la vue Modifier d'un plateau, avec le même modèle d'historique que l'objet ouvert (use-opened-item) :
// une entrée `wmtArrange` est poussée à l'ouverture, le retour Android / navigateur ferme la vue ; ✓ et Échap retirent eux-mêmes l'entrée.
// `onBeforeClose` : appelé au retour ; s'il renvoie vrai (il vient de dézoomer la vue d'une étagère au meuble entier), l'entrée est
// reposée et la vue reste (même mécanisme que use-furniture-zoom). open / close / reset sont stables (useCallback).
import { useCallback, useEffect, useRef, useState } from 'react';
import { historyToken } from '../history-token';

export function useArrangeView(onBeforeClose?: () => boolean): { hostId: string | null; open(hostId: string): void; close(): void; reset(): void } {
  const [hostId, setHostId] = useState<string | null>(null);
  const ours = useRef(false);
  const token = useRef('');
  const beforeClose = useRef(onBeforeClose);
  beforeClose.current = onBeforeClose;

  const open = useCallback((id: string): void => {
    setHostId(id);
    if (ours.current) return;
    token.current = historyToken();
    history.pushState({ ...(history.state ?? {}), wmtArrange: token.current }, '');
    ours.current = true;
  }, []);
  // Fermeture par ✓, Échap ou l'appelant (sortie d'Aménager, changement de pièce) : l'entrée est retirée si elle est au-dessus de la pile.
  const close = useCallback((): void => {
    setHostId(null);
    if (!ours.current) return;
    ours.current = false;
    if (history.state?.wmtArrange === token.current) history.back();
  }, []);

  useEffect(() => {
    // Notre entrée vient d'être retirée (retour) : le zoom d'une étagère revient d'abord au meuble entier (entrée reposée), sinon on
    // ferme sans toucher à l'historique.
    const onPop = () => {
      if (!ours.current) return;
      if (beforeClose.current?.()) {
        history.pushState({ ...(history.state ?? {}), wmtArrange: token.current }, '');
        return;
      }
      ours.current = false;
      setHostId(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return { hostId, open, close, reset: close };
}
