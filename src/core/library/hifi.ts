// État du poste hi-fi, déduit du lecteur : rien de mémorisé.
import type { Layout, Placed } from './library-types';
import { openingOf } from './opened-item';

// Vue minimale du lecteur (PlayerView de src/content la satisfait structurellement ; core n'importe pas content).
export type PlayingView = { card: { slug: string } | null; track: { playing: boolean } | null };

export type HifiState = { hifiId: string | null; atHifi: string | null; spinning: boolean };

// Seul le premier poste posé (ordre du layout) sert.
export function activeHifi(layout: Layout): Placed | null {
  return layout.find((p) => p.kind === 'small' && p.item === 'hifi') ?? null;
}

export function hifiState(layout: Layout, view: PlayingView): HifiState {
  const hifi = activeHifi(layout);
  const slug = view.card?.slug;
  if (!hifi || !slug) return { hifiId: hifi?.id ?? null, atHifi: null, spinning: false };
  const at = layout.find((p) => 'slug' in p && p.slug === slug && openingOf(p) !== null) ?? null;
  const atHifi = at ? at.id : null;
  return { hifiId: hifi.id, atHifi, spinning: atHifi !== null && view.track?.playing === true };
}

// Emplacements d'origine vidés tant que l'objet est au poste.
export function hiddenAtHome(state: HifiState): ReadonlySet<string> {
  return state.hifiId !== null && state.atHifi !== null ? new Set([state.atHifi]) : new Set();
}
