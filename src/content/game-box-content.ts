import type { BoxFormat } from '../core/game/platform-boxes';
import { updateLayout } from '../core/library/library-book';
import type { LibraryState, ShelfShape } from '../core/library/library-types';
import { setStoredBox } from '../core/library/room-grid';
import { getGameBoxService } from './game-box-registry';
import type { GameBox } from './game-box-service';
import type { ItemContent } from './model3d-art';

// Décor propre à un jeu rangé, lu dans le service des boîtes (boîte déjà connue seulement) : image du dos et bandeau de sa console.
// `url` : l'image réellement dessinée sur la couverture (le bandeau n'est « imprimé » que si c'est le scan TheGamesDB).
// Boîte inconnue : rien (le jeu garde son bandeau rouge d'origine, le dos son aplat).
export function gameBoxContent(shape: ShelfShape, slug: string, url?: string): Pick<ItemContent, 'backUrl' | 'band' | 'printed'> {
  if (shape !== 'game') return {};
  const box = getGameBoxService()?.peek(slug);
  if (!box) return {};
  // Version TheGamesDB : la couverture montrée est son scan, bandeau compris.
  return { band: box.style.band, ...(box.tgdbId !== undefined && url !== undefined && url === box.frontUrl ? { printed: true } : {}), ...(box.backUrl ? { backUrl: box.backUrl } : {}) };
}

// Format de boîte à réécrire : un jeu rangé dont la boîte connue (format ou couleur du boîtier) diffère de ce qui est enregistré.
export type BoxChange = { roomId: string; id: string; format: BoxFormat; plastic: string };

export function boxChanges(state: LibraryState, peek: (slug: string) => GameBox | null | undefined): BoxChange[] {
  return state.rooms.flatMap((room) => room.layout.flatMap((p): BoxChange[] => {
    if (p.kind !== 'stored' || p.shape !== 'game') return [];
    const box = peek(p.slug);
    if (!box || (box.format === p.box && box.style.plastic === p.caseColor)) return [];
    return [{ roomId: room.id, id: p.id, format: box.format, plastic: box.style.plastic }];
  }));
}

// Toutes les réécritures en une seule fois (ne déplace rien, voir setStoredBox).
export const applyBoxChanges = (state: LibraryState, changes: BoxChange[]): LibraryState =>
  changes.reduce((s, c) => updateLayout(s, c.roomId, (layout) => setStoredBox(layout, c.id, c.format, c.plastic)), state);
