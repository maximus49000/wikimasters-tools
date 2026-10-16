// État du poste hi-fi de la pièce, déduit du lecteur (rien de mémorisé à part) : relu à chaque changement du lecteur, seulement si la
// pièce a un poste (sans poste, aucun abonnement : la pièce n'est pas redessinée à chaque nouvelle de la lecture).
import { useMemo, useSyncExternalStore } from 'react';
import { activeHifi, hifiState, type HifiState } from '../../core/library/hifi';
import type { Layout } from '../../core/library/library-types';
import { noPlayer, noSubscribe } from '../ListenSection';
import { getPlayerSource } from '../music-registry';
import type { PlayerView } from '../player-source';

export function useHifiPlayer(layout: Layout): { state: HifiState; view: PlayerView } {
  const source = getPlayerSource();
  const on = source !== null && activeHifi(layout) !== null;
  const view = useSyncExternalStore(on ? source.subscribe : noSubscribe, on ? source.current : noPlayer);
  const state = useMemo(() => hifiState(layout, view), [layout, view]);
  return { state, view };
}

export const useHifi = (layout: Layout): HifiState => useHifiPlayer(layout).state;
