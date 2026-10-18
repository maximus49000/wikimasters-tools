// État de la bulle d'un objet dans la vue Modifier (CardBubble) et de l'objet armé par ✥ Déplacer. Seul un objet placé (carte rangée ou
// posée, petit objet) ouvre une bulle : la carte en attente du mode ＋ n'est pas encore posée (elle se glisse directement). ✥ ferme la
// bulle et arme l'objet ; un glissé lâché (vert ou rouge) le désarme, comme une bulle ouverte sur un autre objet.
// `back` : le retour Android y range sa fermeture (vrai si une bulle était ouverte ou un objet armé).
// Carte avec une intention branchée : les versions de sa pochette ne sont cherchées qu'au premier appui sur 🖼️ (cover-versions : pas de
// requête Spotify à chaque bulle ouverte) ; une réponse sûre (même vide) est gardée pour la séance par format + carte ; une erreur ou un
// délai dépassé ne l'est pas (un nouvel appui réessaie).
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Layout, ShelfShape } from '../../core/library/library-types';
import { placedSlugs } from '../../core/library/room-grid';
import { coverVersions } from '../cover-versions';
import { SWAP_PLAYING_MESSAGE, applyItemChange, isBubbleItem, refusalOf, type BubbleItem, type CoverChoices, type ItemChange, type SwapProps } from './CardBubble';
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
  // Objet au poste hi-fi (sa lecture) : 🔄 refusé.
  playingId?: string | null;
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
  // Lance la recherche des versions (premier appui sur 🖼️, ou nouvel essai après une erreur).
  searchCovers(): void;
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

// Réponses sûres (même vides), par format + carte, pour la séance ; les incertaines (délai dépassé, relais en panne…) sont redemandées.
const coverCache = new Map<string, string[]>();
// Titre d'une carte absente de la Collection : son slug décodé (les adresses Wikipédia encodent les accents), tiret bas → espace.
function titleOfSlug(slug: string): string {
  let text = slug;
  try { text = decodeURIComponent(slug); } catch { /* slug mal encodé : tel quel */ }
  return text.replace(/_/g, ' ');
}
// Tests : oublie les versions gardées.
export const resetCoverChoices = (): void => coverCache.clear();

const itemIn = (layout: Layout, id: string | null): BubbleItem | null => {
  const p = id === null || id === PENDING_ID ? undefined : layout.find((q) => q.id === id);
  return isBubbleItem(p) ? p : null;
};

// `seen` : la disposition dessinée (déplacements en attente appliqués, carte en attente ＋) : les refus s'y jugent. `resetKey` : la bulle
// se ferme quand il change (autre niveau de la vue) ; l'objet armé reste (un glissé peut changer de niveau par le bord de l'écran).
export function useCardBubble(seen: Layout, { onItemEdit, onCardInfo, onItemCity, bubbleBack, sheetOpen = false, swap, playingId = null }: CardBubbleProps, resetKey: unknown = null): CardBubbleState {
  const [state, setState] = useState<{ id: string; message: string | null } | null>(null);
  const [armedId, setArmed] = useState<string | null>(null);
  // Objet disparu de la disposition (retiré, autre onglet) : plus de bulle, plus d'arme.
  const item = itemIn(seen, state?.id ?? null);
  const armed = itemIn(seen, armedId) ? armedId : null;
  const live = useRef({ seen, onItemEdit, onCardInfo, onItemCity, item, swap, playingId });
  live.current = { seen, onItemEdit, onCardInfo, onItemCity, item, swap, playingId };
  const taken = useMemo(() => placedSlugs(seen), [seen]);
  // Versions de la pochette : clé format + carte (un changement de format ou de carte demande une nouvelle recherche).
  const coverKey = item && item.kind !== 'small' && onItemEdit ? `${item.shape}\n${item.slug}` : null;
  // Recherches en cours ou réponses incertaines non vides (montrées sans être gardées), par clé.
  const [found, setFound] = useState<Record<string, CoverChoices>>({});
  const searchCovers = useCallback(() => {
    const cur = live.current.item;
    if (!cur || cur.kind === 'small' || !live.current.onItemEdit) return;
    const key = `${cur.shape}\n${cur.slug}`;
    if (coverCache.has(key)) return;
    setFound((f) => (f[key]?.state === 'loading' ? f : { ...f, [key]: { state: 'loading', urls: [] } }));
    const title = live.current.swap?.cards.find((c) => c.slug === cur.slug)?.title ?? titleOfSlug(cur.slug);
    const shape: ShelfShape = cur.shape;
    coverVersions({ slug: cur.slug, title }, shape).then(({ urls, sure }) => {
      if (sure) coverCache.set(key, urls);
      setFound((f) => ({ ...f, [key]: urls.length > 0 || sure ? { state: 'ready', urls } : { state: 'idle', urls: [] } }));
    });
  }, []);
  const known = coverKey ? coverCache.get(coverKey) : undefined;
  const covers: CoverChoices | null = !coverKey ? null
    : known ? { state: 'ready', urls: known }
    : found[coverKey] ?? { state: 'idle', urls: [] };
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
    const { seen: l, onItemEdit: edit, item: cur, playingId: playing } = live.current;
    if (!cur || !edit) return;
    // Refus jugé sur la disposition vue au moment du refus (l'écriture peut refuser plus tard, la disposition ayant changé).
    const refuse = () => setState((s) => (s && s.id === cur.id ? { id: cur.id, message: refusalOf(cur, c, live.current.seen) } : s));
    if ('swap' in c && cur.id === playing) {
      setState({ id: cur.id, message: SWAP_PLAYING_MESSAGE });
      return;
    }
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
    covers, searchCovers, ...(swap ? { swap } : {}), taken,
    open, close, arm, disarm, change, info, city, layerDown,
  };
}
