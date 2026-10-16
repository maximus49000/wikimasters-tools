// État du poste hi-fi de la pièce, déduit du lecteur (rien de mémorisé à part). Seuls les champs que la scène montre sont lus, en une
// chaîne : un passage du lecteur qui ne les change pas (sondage toutes les 5 s, nouvelles du SDK) ne redessine pas la pièce. Sans poste
// dans la pièce, aucun abonnement.
import { useMemo, useSyncExternalStore } from 'react';
import { activeHifi, hifiState, type HifiState } from '../../core/library/hifi';
import type { Layout } from '../../core/library/library-types';
import { noSubscribe } from '../ListenSection';
import { getPlayerSource } from '../music-registry';
import type { PlayerView } from '../player-source';

// Ce que la scène lit du lecteur : la carte en lecture et la piste (titre, artiste, lecture ou pause).
export type HifiPlayer = { slug: string | null; track: { title: string; artist: string; playing: boolean } | null };

const NONE = JSON.stringify([null, null]);
// Instantané primitif : React compare par valeur, rien n'est redessiné tant qu'il ne change pas.
export const hifiSnapshot = (view: PlayerView): string =>
  JSON.stringify([view.card?.slug ?? null, view.track ? [view.track.title, view.track.artist, view.track.playing] : null]);
const none = (): string => NONE;

function parse(snapshot: string): HifiPlayer {
  const [slug, t] = JSON.parse(snapshot) as [string | null, [string, string, boolean] | null];
  return { slug, track: t ? { title: t[0], artist: t[1], playing: t[2] } : null };
}

export function useHifiPlayer(layout: Layout): { state: HifiState; player: HifiPlayer } {
  const source = getPlayerSource();
  const on = source !== null && activeHifi(layout) !== null;
  const snapshot = useSyncExternalStore(on ? source.subscribe : noSubscribe, on ? () => hifiSnapshot(source.current()) : none);
  const player = useMemo(() => parse(snapshot), [snapshot]);
  const state = useMemo(
    () => hifiState(layout, { card: player.slug ? { slug: player.slug } : null, track: player.track }),
    [layout, player],
  );
  return { state, player };
}

export const useHifi = (layout: Layout): HifiState => useHifiPlayer(layout).state;
