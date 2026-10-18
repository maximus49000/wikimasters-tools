// État de la bulle d'un objet dans la vue Modifier (CardBubble) et de l'objet armé par ✥ Déplacer. Seul un objet placé (carte rangée ou
// posée, petit objet) ouvre une bulle : la carte en attente du mode ＋ n'est pas encore posée (elle se glisse directement). ✥ ferme la
// bulle et arme l'objet ; un glissé lâché (vert ou rouge) le désarme, comme une bulle ouverte sur un autre objet.
// `back` : le retour Android y range sa fermeture (vrai si une bulle était ouverte ou un objet armé).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Layout } from '../../core/library/library-types';
import { applyItemChange, isBubbleItem, refusalOf, type BubbleItem, type ItemChange } from './CardBubble';
import { PENDING_ID } from './use-pending-card';

export type CardBubbleProps = {
  // Intention de changement (appliquée par l'appelant à la disposition du moment) ; rend la promesse de l'écriture : `false` (ou un
  // rejet) dit que l'écriture a été refusée. Absente : la bulle ne propose que ✥ (et ✕).
  onItemEdit?(id: string, change: ItemChange): Promise<unknown> | unknown;
  // ⓘ : la fiche de la carte.
  onCardInfo?(slug: string): void;
  // Ville d'une horloge (le choix de la pièce).
  onItemCity?(id: string): void;
  // Le retour Android y range la fermeture de la bulle (vrai : une bulle était ouverte, ou un objet armé, et vient de se fermer).
  bubbleBack?: { current: (() => boolean) | null };
  // Une fiche ou un choix est ouvert par-dessus la vue : Échap le ferme lui seul (la bulle reste).
  sheetOpen?: boolean;
};
export type CardBubbleState = {
  item: BubbleItem | null;
  message: string | null;
  // Objet armé par ✥ : seul lui se saisit.
  armed: string | null;
  canEdit: boolean;
  canInfo: boolean;
  canCity: boolean;
  sheetOpen: boolean;
  open(id: string): void;
  close(): void;
  arm(): void;
  disarm(): void;
  change(change: ItemChange): void;
  info(): void;
  city(): void;
};

const itemIn = (layout: Layout, id: string | null): BubbleItem | null => {
  const p = id === null || id === PENDING_ID ? undefined : layout.find((q) => q.id === id);
  return isBubbleItem(p) ? p : null;
};

// `seen` : la disposition dessinée (déplacements en attente appliqués, carte en attente ＋) : les refus s'y jugent. `resetKey` : la bulle
// se ferme quand il change (autre niveau de la vue) ; l'objet armé reste (un glissé peut changer de niveau par le bord de l'écran).
export function useCardBubble(seen: Layout, { onItemEdit, onCardInfo, onItemCity, bubbleBack, sheetOpen = false }: CardBubbleProps, resetKey: unknown = null): CardBubbleState {
  const [state, setState] = useState<{ id: string; message: string | null } | null>(null);
  const [armedId, setArmed] = useState<string | null>(null);
  // Objet disparu de la disposition (retiré, autre onglet) : plus de bulle, plus d'arme.
  const item = itemIn(seen, state?.id ?? null);
  const armed = itemIn(seen, armedId) ? armedId : null;
  const live = useRef({ seen, onItemEdit, onCardInfo, onItemCity, item });
  live.current = { seen, onItemEdit, onCardInfo, onItemCity, item };
  const close = useCallback(() => setState(null), []);
  const disarm = useCallback(() => setArmed(null), []);
  const open = useCallback((id: string) => {
    setArmed(null);
    setState(itemIn(live.current.seen, id) ? { id, message: null } : null);
  }, []);
  const arm = useCallback(() => {
    const cur = live.current.item;
    if (!cur) return;
    setState(null);
    setArmed(cur.id);
  }, []);
  const change = useCallback((c: ItemChange) => {
    const { seen: l, onItemEdit: edit, item: cur } = live.current;
    if (!cur || !edit) return;
    const refuse = () => setState((s) => (s && s.id === cur.id ? { id: cur.id, message: refusalOf(cur, c) } : s));
    const next = applyItemChange(l, cur.id, c);
    if (!next) {
      refuse();
      return;
    }
    setState('remove' in c ? null : { id: cur.id, message: null });
    if (next === l) return;
    // L'écriture peut encore refuser (la disposition reçue a changé entre-temps) : le message s'affiche alors dans la bulle.
    let done: unknown;
    try { done = edit(cur.id, c); } catch { refuse(); return; }
    if (done === false) refuse();
    else if (done && typeof (done as Promise<unknown>).then === 'function') (done as Promise<unknown>).then((ok) => { if (ok === false) refuse(); }, refuse);
  }, []);
  const info = useCallback(() => {
    const { item: cur, onCardInfo: show } = live.current;
    if (cur && cur.kind !== 'small') show?.(cur.slug);
  }, []);
  const city = useCallback(() => {
    const { item: cur, onItemCity: pick } = live.current;
    if (cur) pick?.(cur.id);
  }, []);
  useEffect(() => { setState(null); }, [resetKey]);
  const busy = item !== null || armed !== null;
  useEffect(() => {
    if (!bubbleBack) return;
    bubbleBack.current = () => {
      if (!busy) return false;
      setState(null);
      setArmed(null);
      return true;
    };
    return () => { bubbleBack.current = null; };
  }, [bubbleBack, busy]);
  return {
    item, message: item ? state?.message ?? null : null, armed, canEdit: onItemEdit !== undefined, canInfo: onCardInfo !== undefined, canCity: onItemCity !== undefined, sheetOpen,
    open, close, arm, disarm, change, info, city,
  };
}
