import type { LibraryState } from '../core/library/library-types';

// La pièce d'accueil s'applique à la première ouverture de la Collection après le démarrage, une seule fois :
// ensuite le joueur navigue librement. Tant que l'état n'est pas chargé, on attend sans consommer le passage.
export function createLaunchGate() {
  let done = false;
  return {
    take(state: LibraryState | null): string | null {
      if (done || state === null) return null;
      done = true;
      return state.homeRoomId;
    },
  };
}
