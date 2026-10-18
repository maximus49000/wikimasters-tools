// État de la bulle d'un objet dans la vue Modifier (CardBubble) et de l'objet armé par ✥ Déplacer. Seul un objet placé (carte rangée ou
// posée, petit objet) ouvre une bulle : la carte en attente du mode ＋ n'est pas encore posée (elle se glisse directement). ✥ ferme la
// bulle et arme l'objet ; un glissé lâché (vert ou rouge) le désarme, comme une bulle ouverte sur un autre objet.
// `back` : le retour Android y range sa fermeture (vrai si une bulle était ouverte ou un objet armé).
// Carte avec une intention branchée : les versions de sa pochette sont cherchées dès l'ouverture de la bulle (cover-versions), pour griser
// 🖼️ quand il n'y en a aucune ; une réponse non vide est gardée pour la séance (même carte, même format : pas de nouvelle requête).
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Layout, ShelfShape } from '../../core/library/library-types';
import { placedSlugs } from '../../core/library/room-grid';
import { coverVersions } from '../cover-versions';
import { applyItemChange, isBubbleItem, refusalOf, type BubbleItem, type CoverChoices, type ItemChange, type SwapProps } from './CardBubble';
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
  // Cartes de la Collection : 🔄 Changer de carte (absentes : pas de 🔄) et titre de la carte pour chercher ses pochettes.
  swap?: SwapProps;
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
  // Versions de la pochette de la carte de la bulle (null : pas une carte, ou pas d'intention branchée).
  covers: CoverChoices | null;
  swap?: SwapProps;
  // Cartes déjà dans la pièce (vue) : absentes de la réglette 🔄.
  taken: Set<string>;
  open(id: string): void;
  close(): void;
  arm(): void;
  disarm(): void;
  change(change: ItemChange): void;
  info(): void;
  city(): void;
  // Appui sur le calque de la vue : ferme la bulle ; dans le vide (pas sur un objet), désarme aussi l'objet armé.
  layerDown(e: ReactPointerEvent): void;
};

// Éléments d'un objet dans les vues (plateau, tablette zoomée, meuble entier) : un appui dessus n'est pas « dans le vide ».
const OBJECT_SELECTOR = '[data-arrange-item],[data-board-card],[data-board-small],[data-zoom-card],[data-zoom-small]';

// Versions trouvées, par carte et format, pour la séance (une réponse vide est redemandée : délai dépassé, relais en panne…).
const coverCache = new Map<string, string[]>();
// Tests : oublie les versions gardées.
export const resetCoverChoices = (): void => coverCache.clear();

const itemIn = (layout: Layout, id: string | null): BubbleItem | null => {
  const p = id === null || id === PENDING_ID ? undefined : layout.find((q) => q.id === id);
  return isBubbleItem(p) ? p : null;
};

// `seen` : la disposition dessinée (déplacements en attente appliqués, carte en attente ＋) : les refus s'y jugent. `resetKey` : la bulle
// se ferme quand il change (autre niveau de la vue) ; l'objet armé reste (un glissé peut changer de niveau par le bord de l'écran).
export function useCardBubble(seen: Layout, { onItemEdit, onCardInfo, onItemCity, bubbleBack, sheetOpen = false, swap }: CardBubbleProps, resetKey: unknown = null): CardBubbleState {
  const [state, setState] = useState<{ id: string; message: string | null } | null>(null);
  const [armedId, setArmed] = useState<string | null>(null);
  // Objet disparu de la disposition (retiré, autre onglet) : plus de bulle, plus d'arme.
  const item = itemIn(seen, state?.id ?? null);
  const armed = itemIn(seen, armedId) ? armedId : null;
  const live = useRef({ seen, onItemEdit, onCardInfo, onItemCity, item, swap });
  live.current = { seen, onItemEdit, onCardInfo, onItemCity, item, swap };
  const taken = useMemo(() => placedSlugs(seen), [seen]);
  // Versions de la pochette : clé carte + format (un changement de format ou de carte relance la recherche).
  const coverKey = item && item.kind !== 'small' && onItemEdit ? `${item.shape}\n${item.slug}` : null;
  const [found, setFound] = useState<{ key: string; urls: string[] | null } | null>(null);
  useEffect(() => {
    if (!coverKey) return;
    const known = coverCache.get(coverKey);
    if (known) {
      setFound({ key: coverKey, urls: known });
      return;
    }
    setFound({ key: coverKey, urls: null });
    const cut = coverKey.indexOf('\n');
    const [shape, slug] = [coverKey.slice(0, cut) as ShelfShape, coverKey.slice(cut + 1)];
    const title = live.current.swap?.cards.find((c) => c.slug === slug)?.title ?? slug.replace(/_/g, ' ');
    let current = true;
    const done = (urls: string[]) => {
      if (urls.length > 0) coverCache.set(coverKey, urls);
      if (current) setFound({ key: coverKey, urls });
    };
    coverVersions({ slug, title }, shape).then(done, () => done([]));
    return () => { current = false; };
  }, [coverKey]);
  const covers: CoverChoices | null = !coverKey ? null
    : found?.key === coverKey && found.urls !== null ? { loading: false, urls: found.urls }
    : { loading: true, urls: [] };
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
    const refuse = () => setState((s) => (s && s.id === cur.id ? { id: cur.id, message: refusalOf(cur, c, l) } : s));
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
  const layerDown = useCallback((e: ReactPointerEvent) => {
    setState(null);
    const target = e.target as Element | null;
    if (!target?.closest?.(OBJECT_SELECTOR)) setArmed(null);
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
    covers, ...(swap ? { swap } : {}), taken,
    open, close, arm, disarm, change, info, city, layerDown,
  };
}
