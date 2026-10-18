// État de la bulle d'une carte dans la vue Modifier (CardBubble) : la carte ouverte, le message d'un refus, les changements. Seule une
// carte placée (rangée ou posée) l'ouvre : la carte en attente du mode ＋ n'est pas encore dans la disposition reçue, un petit objet
// n'en a pas (le toucher ferme la bulle ouverte). `back` : le retour Android y range sa fermeture (vrai si une bulle était ouverte).
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Layout } from '../../core/library/library-types';
import { applyCardChange, refusalOf, type BubbleCard, type CardChange } from './CardBubble';
import { PENDING_ID } from './use-pending-card';

export type CardBubbleProps = {
  // Intention de changement (appliquée par l'appelant à la disposition du moment) ; absente : pas de bulle.
  onCardEdit?(id: string, change: CardChange): Promise<unknown> | void;
  // ⓘ : la fiche de la carte.
  onCardInfo?(slug: string): void;
  // Le retour Android y range la fermeture de la bulle (vrai : une bulle était ouverte et vient de se fermer).
  bubbleBack?: MutableRefObject<(() => boolean) | null>;
};
export type CardBubbleState = {
  card: BubbleCard | null;
  message: string | null;
  open(id: string): void;
  close(): void;
  change(change: CardChange): void;
  info(): void;
};

const cardIn = (layout: Layout, id: string | null): BubbleCard | null => {
  const p = id === null || id === PENDING_ID ? undefined : layout.find((q) => q.id === id);
  return p && (p.kind === 'stored' || p.kind === 'posed') ? p : null;
};

// `resetKey` : la bulle se ferme quand il change (autre niveau de la vue).
export function useCardBubble(layout: Layout, { onCardEdit, onCardInfo, bubbleBack }: CardBubbleProps, resetKey: unknown = null): CardBubbleState {
  const [state, setState] = useState<{ id: string; message: string | null } | null>(null);
  // Carte disparue de la disposition (retirée, autre onglet) : plus de bulle.
  const card = cardIn(layout, state?.id ?? null);
  const live = useRef({ layout, onCardEdit, onCardInfo, card });
  live.current = { layout, onCardEdit, onCardInfo, card };
  const close = useCallback(() => setState(null), []);
  const open = useCallback((id: string) => {
    const { layout: l, onCardEdit: edit } = live.current;
    setState(edit && cardIn(l, id) ? { id, message: null } : null);
  }, []);
  const change = useCallback((c: CardChange) => {
    const { layout: l, onCardEdit: edit, card: cur } = live.current;
    if (!cur || !edit) return;
    const next = applyCardChange(l, cur.id, c);
    if (!next) {
      setState({ id: cur.id, message: refusalOf(cur, c) });
      return;
    }
    if ('remove' in c) setState(null);
    else setState({ id: cur.id, message: null });
    if (next !== l) void edit(cur.id, c);
  }, []);
  const info = useCallback(() => {
    const { card: cur, onCardInfo: show } = live.current;
    if (cur) show?.(cur.slug);
  }, []);
  useEffect(() => { setState(null); }, [resetKey]);
  const isOpen = card !== null;
  useEffect(() => {
    if (!bubbleBack) return;
    bubbleBack.current = () => {
      if (!isOpen) return false;
      setState(null);
      return true;
    };
    return () => { bubbleBack.current = null; };
  }, [bubbleBack, isOpen]);
  return { card, message: card ? state?.message ?? null : null, open, close, change, info };
}
