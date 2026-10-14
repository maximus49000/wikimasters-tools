import type { StandingKind } from '../library-types';

// Ce que chaque meuble offre aux animaux : le cerveau (brain.ts), l'orage (storm.ts) et le rendu (runner.ts) lisent cette table
// au lieu de tester les types un par un. `catSeat` : le chat dort sur les places `sleep` et se perche sur les `seat` ; `dogCouch` :
// le chien y monte (dort sur `sleep`, sinon sur `seat`) ; `catTop` : dessus où le chat se perche ; `catHide` : cachette dessous
// (point `hide`) ; `catScratch` : griffoir contre un flanc.
export type PetRole = 'catSeat' | 'dogCouch' | 'catTop' | 'catHide' | 'catScratch';

const ROLES: Record<PetRole, ReadonlySet<StandingKind>> = {
  catSeat: new Set(['chair', 'armchair', 'sofa', 'rocking-chair', 'club-chair', 'loveseat', 'daybed', 'egg-chair', 'peacock-chair', 'pouf', 'square-pouf', 'beanbag', 'bench']),
  dogCouch: new Set(['sofa', 'club-chair', 'loveseat', 'daybed', 'pouf', 'square-pouf', 'beanbag']),
  catTop: new Set(['shelf', 'desk', 'dresser', 'side-table', 'cat-tree']),
  catHide: new Set(['sofa', 'loveseat']),
  catScratch: new Set(['armchair']),
};

export const hasRole = (kind: StandingKind, role: PetRole): boolean => ROLES[role].has(kind);
