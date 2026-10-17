// Ouverture / fermeture de la vue Modifier d'un plateau, avec le même modèle d'historique que l'objet ouvert (use-opened-item) :
// une entrée `wmtArrange` est poussée à l'ouverture, le retour Android / navigateur ferme la vue ; ✓ et Échap retirent eux-mêmes l'entrée.
import { useEffect, useRef, useState } from 'react';
import { historyToken } from '../history-token';

export function useArrangeView(): { hostId: string | null; open(hostId: string): void; close(): void; reset(): void } {
  const [hostId, setHostId] = useState<string | null>(null);
  const ours = useRef(false);
  const token = useRef('');

  const open = (id: string): void => {
    setHostId(id);
    if (ours.current) return;
    token.current = historyToken();
    history.pushState({ ...(history.state ?? {}), wmtArrange: token.current }, '');
    ours.current = true;
  };
  // Fermeture par ✓, Échap ou l'appelant (sortie d'Aménager, changement de pièce) : l'entrée est retirée si elle est au-dessus de la pile.
  const close = (): void => {
    setHostId(null);
    if (!ours.current) return;
    ours.current = false;
    if (history.state?.wmtArrange === token.current) history.back();
  };

  useEffect(() => {
    // Notre entrée vient d'être retirée (retour) : on ferme sans toucher à l'historique.
    const onPop = () => {
      if (!ours.current) return;
      ours.current = false;
      setHostId(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return { hostId, open, close, reset: close };
}
