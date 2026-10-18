// Carte en attente de la vue Modifier ＋ : la carte touchée dans la réglette est ajoutée à la disposition DESSINÉE (jamais au dépôt) sous
// un id provisoire, à la première place libre du meuble ; les glissés de cette carte déplacent l'attente (au lieu de demander une
// écriture) ; ✓ demande l'ajout (`onAdd`, une intention : l'appelant l'applique à la disposition du moment avec un id neuf), ✕ l'oublie.
// Les mêmes glissés que pour les objets posés (use-top-drag, use-board-drag) servent donc à la carte en attente.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KnownCard } from '../../core/collection/collection-book';
import type { Category } from '../../core/kinds/kinds-category';
import type { Layout, ShelfLevel, ShelfShape } from '../../core/library/library-types';
import { boardItems, firstFreeBoard, forceOnBoard, moveToBoard, moveToTop, placedSlugs, poseCard, storeCard } from '../../core/library/room-grid';
import { suggestShape } from '../../core/library/shape-suggest';
import { firstFreeTopSpot } from '../../core/library/surface';

export type AddCard = { slug: string; shape: ShelfShape };
// Place d'une carte ajoutée : sur un plateau (bureau, dessus d'étagère, coin avant gauche en cm, trépied) ou sur une tablette (rang).
export type AddAt = { hostId: string; x: number; z: number } | { shelfId: string; level: ShelfLevel; order: number };
export type AddProps = {
  // Cartes de la Collection (la réglette montre celles qui ne sont pas encore dans la pièce).
  cards: KnownCard[];
  // Catégorie d'une carte : sa forme conseillée (musique → CD, film → DVD…).
  categoryOf(slug: string): Category;
  // Carte déjà choisie (tiroir « Ajouter une carte ») : en attente dès l'ouverture.
  initial?: AddCard | null;
  onAdd(card: AddCard, at: AddAt): Promise<unknown> | void;
};
export const PENDING_ID = '__pending__';
export const NO_ROOM_MESSAGE = 'Plus de place sur ce meuble.';
// La place de la carte en attente ne tient plus (un autre objet y est arrivé) : elle ne bouge pas seule, ✓ est refusé.
export const BLOCKED_MESSAGE = 'Plus de place ici : glissez la carte à une place libre.';
// ✓ refusé ou en échec (écriture rejetée, ou disposition inchangée) : la carte reste en attente, à sa place.
export const REFUSED_MESSAGE = 'Impossible de poser la carte ici.';
// Carte du tiroir déjà dans la pièce (posée ou rangée entre-temps) : rien n'attend.
export const ALREADY_MESSAGE = 'Cette carte est déjà dans la pièce.';

// La disposition avec la carte en attente à `at` ; null si elle n'y tient pas (ou si la carte est déjà dans la pièce).
export function withPendingCard(layout: Layout, card: AddCard, at: AddAt): Layout | null {
  return 'hostId' in at
    ? poseCard(layout, at.hostId, card.shape, card.slug, PENDING_ID, at.x, at.z)
    : storeCard(layout, at.shelfId, at.level, at.order, card.shape, card.slug, PENDING_ID);
}
// Pose de force (sans vérifier la place) : la carte en attente reste là où on l'a mise même si la disposition reçue l'y gêne ; null si
// le meuble n'existe plus ou si la carte est déjà dans la pièce.
export function forcePendingCard(layout: Layout, card: AddCard, at: AddAt): Layout | null {
  if (placedSlugs(layout).has(card.slug)) return null;
  if ('hostId' in at) return layout.some((p) => p.id === at.hostId) ? [...layout, { id: PENDING_ID, kind: 'posed', shape: card.shape, hostId: at.hostId, x: at.x, z: at.z, slug: card.slug }] : null;
  return forceOnBoard([...layout, { id: PENDING_ID, kind: 'stored', shape: card.shape, shelfId: at.shelfId, level: at.level, order: 0, slug: card.slug }], PENDING_ID, at.shelfId, at.level, at.order);
}
// Première place libre sur les meubles `ids` : les tablettes d'abord (étagère, à la suite des objets), puis les plateaux ; null si rien ne tient.
export function firstPlaceFor(layout: Layout, ids: string[], card: AddCard): AddAt | null {
  for (const id of ids) {
    if (layout.find((p) => p.id === id)?.kind !== 'shelf') continue;
    const b = firstFreeBoard(layout, id, { id: PENDING_ID, shape: card.shape });
    if (b) return { shelfId: id, ...b };
  }
  for (const id of ids) {
    const s = firstFreeTopSpot(layout, id, { shape: card.shape });
    if (s) return { hostId: id, ...s };
  }
  return null;
}
// Place de la carte en attente lue dans la disposition dessinée (attribut de test et de mise au point).
export function pendingAtOf(view: Layout): string | null {
  const p = view.find((q) => q.id === PENDING_ID);
  if (p?.kind === 'posed') return `${p.x},${p.z}`;
  if (p?.kind === 'stored') return `${p.shelfId}:${p.level}:${p.order}`;
  return null;
}

// Sur une tablette, la carte en attente n'est pas dans la disposition reçue : `at.order` est un rang de la disposition reçue. Quand un
// AUTRE objet bouge (intention envoyée à l'appelant), elle garde sa place visible : rang recalculé dans la disposition dessinée après le
// déplacement, et accroche à un voisin immédiat qui ne bouge pas (`anchor` : juste après / juste avant lui) ; elle reste ainsi à la même
// place avant l'écriture (disposition reçue sans le déplacement, objet tenu dessiné à sa nouvelle place) comme après.
export type Anchor = { id: string; after: boolean };
// Place de la carte en attente dans `layout` : son rang suit le voisin d'accroche (s'il est encore sur sa tablette).
export function resolveAt(layout: Layout, at: AddAt, anchor?: Anchor): AddAt {
  if (!anchor || 'hostId' in at) return at;
  const i = boardItems(layout, at.shelfId, at.level, PENDING_ID).findIndex((p) => p.id === anchor.id);
  return i < 0 ? at : { ...at, order: i + (anchor.after ? 1 : 0) };
}
// Un autre objet (`movedId`) bouge ; `next` : la disposition dessinée après son déplacement (carte en attente comprise). Place de la
// carte en attente (son rang dans `next`, qui est aussi son rang dans la disposition reçue après l'écriture) et voisin d'accroche ;
// null si elle n'est pas sur une tablette de `next`.
export function followPending(next: Layout, at: AddAt, movedId: string): { at: AddAt; anchor?: Anchor } | null {
  if ('hostId' in at) return null;
  const items = boardItems(next, at.shelfId, at.level);
  const i = items.findIndex((p) => p.id === PENDING_ID);
  if (i < 0) return null;
  const left = items[i - 1];
  const right = items[i + 1];
  const anchor = left && left.id !== movedId ? { id: left.id, after: true } : right && right.id !== movedId ? { id: right.id, after: false } : undefined;
  return { at: { ...at, order: i }, ...(anchor && { anchor }) };
}
// Rang de `id` sur sa tablette de `next`, carte en attente exclue : le rang à demander à l'appelant (la disposition reçue ne l'a pas).
export function realOrderOf(next: Layout, id: string, shelfId: string, level: ShelfLevel): number | null {
  const i = boardItems(next, shelfId, level, PENDING_ID).findIndex((p) => p.id === id);
  return i < 0 ? null : i;
}

// `sent` : ✓ demandé et écriture terminée sans erreur ; la disposition reçue dit ensuite si la carte est arrivée dans la pièce.
type Pending = { card: AddCard; at: AddAt; anchor?: Anchor; sent?: boolean; sending?: boolean };
type Moves = {
  onMove?(id: string, x: number, z: number): Promise<unknown> | void;
  onTop?(id: string, hostId: string, x: number, z: number): Promise<unknown> | void;
  onBoard?(id: string, shelfId: string, level: ShelfLevel, order: number): Promise<unknown> | void;
};

export function usePendingCard({ layout, ids, add, enabled }: { layout: Layout; ids: string[]; add?: AddProps; enabled: boolean }) {
  // Carte du tiroir : en attente à la première place libre ; rien ne tient (ou elle est déjà dans la pièce) → la vue s'ouvre sans carte
  // en attente, mais le dit.
  const [opening] = useState((): { state: Pending | null; message: string | null } => {
    const card = enabled ? add?.initial : null;
    if (!card) return { state: null, message: null };
    if (placedSlugs(layout).has(card.slug)) return { state: null, message: ALREADY_MESSAGE };
    const at = firstPlaceFor(layout, ids, card);
    return at ? { state: { card, at }, message: null } : { state: null, message: NO_ROOM_MESSAGE };
  });
  const [message, setMessage] = useState<string | null>(opening.message);
  const [state, setState] = useState<Pending | null>(opening.state);

  // Dessinée à sa place, toujours (elle ne bouge jamais seule) : si la disposition reçue l'y gêne, posée de force et « bloquée » (rouge,
  // message, ✓ refusé) jusqu'à ce qu'on la glisse à une place libre ; plus rien dès que la carte est dans la pièce (✓ abouti).
  const { view, blocked, at: atNow } = useMemo((): { view: Layout; blocked: boolean; at: AddAt | null } => {
    if (!state || placedSlugs(layout).has(state.card.slug)) return { view: layout, blocked: false, at: null };
    const at = resolveAt(layout, state.at, state.anchor);
    const here = withPendingCard(layout, state.card, at);
    if (here) return { view: here, blocked: false, at };
    const forced = forcePendingCard(layout, state.card, at);
    return forced ? { view: forced, blocked: true, at } : { view: layout, blocked: false, at };
  }, [layout, state]);
  const shown = view !== layout;
  const live = useRef({ layout, ids, add, state, view, atNow });
  live.current = { layout, ids, add, state, view, atNow };
  // Écriture terminée : carte arrivée dans la pièce → l'attente tombe ; sinon (refusée, disposition inchangée) elle reste, avec le message.
  useEffect(() => {
    if (!state?.sent) return;
    if (placedSlugs(layout).has(state.card.slug)) {
      setState(null);
      return;
    }
    setMessage(REFUSED_MESSAGE);
    setState({ card: state.card, at: state.at });
  }, [state, layout]);

  // Toucher une carte de la réglette : elle devient la carte en attente (à la place de l'ancienne si elle y tient, sinon à la première libre).
  const pick = useCallback((slug: string): void => {
    const { layout: l, ids: hosts, add: a, atNow: here } = live.current;
    if (!a) return;
    const card: AddCard = { slug, shape: suggestShape(a.categoryOf(slug)).shelf };
    const at = here && withPendingCard(l, card, here) ? here : firstPlaceFor(l, hosts, card);
    if (!at) return setMessage(NO_ROOM_MESSAGE);
    setMessage(null);
    setState({ card, at });
  }, []);
  const cancel = useCallback((): void => { setState(null); setMessage(null); }, []);
  // ✓ : l'ajout est demandé une fois, à la place dessinée (refusé si elle ne tient pas) ; la carte reste dessinée jusqu'à la disposition
  // qui la contient ; écriture rejetée ou sans effet → elle reste en attente à sa place, avec le message.
  const commit = useCallback((): boolean => {
    const { layout: l, add: a, state: s, atNow } = live.current;
    if (!a || !s) return false;
    // Déjà dans la pièce (✓ précédent abouti) : plus rien n'attend.
    if (placedSlugs(l).has(s.card.slug)) {
      setState(null);
      return false;
    }
    if (s.sending || s.sent) return true;
    const at = atNow ?? s.at;
    if (!withPendingCard(l, s.card, at)) {
      setMessage(BLOCKED_MESSAGE);
      return true;
    }
    // Rang figé pendant l'écriture (plus d'accroche) : c'est celui qui est demandé.
    const sending: Pending = { card: s.card, at, sending: true };
    setState(sending);
    setMessage(null);
    const settle = (ok: boolean) => (): void => {
      if (!ok) setMessage(REFUSED_MESSAGE);
      setState((cur) => (cur === sending ? (ok ? { card: s.card, at, sent: true } : { card: s.card, at }) : cur));
    };
    let r: Promise<unknown> | void;
    try {
      r = a.onAdd(s.card, at);
    } catch (err) {
      console.warn('[Ma Pièce] ajout de carte refusé', err);
      settle(false)();
      return true;
    }
    if (r && typeof r.then === 'function') r.then(settle(true), (err: unknown) => { console.warn('[Ma Pièce] ajout de carte refusé', err); settle(false)(); });
    else settle(true)();
    return true;
  }, []);

  // Glissés : ceux de la carte en attente la déplacent (écriture immédiate, rien au dépôt), les autres passent à l'appelant.
  const moveTo = (at: AddAt): Promise<void> => {
    setState((cur) => (cur && !cur.sending ? { card: cur.card, at } : cur));
    setMessage(null);
    return Promise.resolve();
  };
  // Un autre objet bouge alors que la carte en attente est sur une tablette : elle garde sa place dans `next` (la disposition dessinée
  // après ce déplacement : rang + voisin d'accroche). Renvoie `next` (null : pas de carte sur une tablette, écriture en cours, refus).
  const follow = (id: string, apply: (v: Layout) => Layout | null): Layout | null => {
    const { state: s, view: v, atNow: here } = live.current;
    if (!s || s.sending || s.sent || !here || 'hostId' in here || !v.some((p) => p.id === PENDING_ID)) return null;
    const next = apply(v);
    const kept = next && followPending(next, here, id);
    if (kept) setState((cur) => (cur === s ? { card: s.card, ...kept } : cur));
    return next;
  };
  const wrap = (m: Moves): Required<Moves> => ({
    onMove: (id, x, z) => {
      const s = live.current.state;
      return id === PENDING_ID && s && 'hostId' in s.at ? moveTo({ hostId: s.at.hostId, x, z }) : m.onMove?.(id, x, z);
    },
    onTop: (id, hostId, x, z) => {
      if (id === PENDING_ID) return moveTo({ hostId, x, z });
      follow(id, (v) => moveToTop(v, id, hostId, x, z));
      return m.onTop?.(id, hostId, x, z);
    },
    // `order` est lu sur la disposition dessinée (carte en attente comprise) : l'appelant reçoit le rang sans elle.
    onBoard: (id, shelfId, level, order) => {
      if (id === PENDING_ID) return moveTo({ shelfId, level, order });
      const next = follow(id, (v) => moveToBoard(v, id, shelfId, level, order));
      const real = next ? realOrderOf(next, id, shelfId, level) : null;
      return m.onBoard?.(id, shelfId, level, real ?? order);
    },
  });

  // Note : la carte bloquée l'emporte sur les autres messages.
  const note = shown && blocked ? BLOCKED_MESSAGE : message;
  return { view, shown, blocked: shown && blocked, slug: shown ? state!.card.slug : null, message: note, pick, cancel, commit, wrap };
}
