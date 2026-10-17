import type { BoxFormat } from '../core/game/platform-boxes';
import { updateLayout } from '../core/library/library-book';
import type { LibraryState, ShelfShape } from '../core/library/library-types';
import { setStoredBox } from '../core/library/room-grid';
import { getGameBoxService } from './game-box-registry';
import type { GameBox } from './game-box-service';
import type { ItemContent } from './model3d-art';
import { usableImage } from './image-probe';
import { madeBackFace } from './opened-item/game-outside';

// Décor propre à un jeu rangé ou posé, lu dans le service des boîtes (boîte déjà connue seulement) : jaquette, image du dos et bandeau de sa console.
// Jaquette : celle de la boîte (la même que sur la boîte ouverte), à la place de l'image de la carte `url` ; une jaquette qui ne se charge
// pas laisse l'image de la carte. Le bandeau n'est « imprimé » que si la couverture dessinée est le scan TheGamesDB (il porte le sien).
// Tranche : dessinée comme la vraie (style et format de la console, titre, logo du jeu, studio).
// Dos : le scan, sinon un dos fabriqué (le même que celui de la boîte retournée).
// Boîte inconnue : rien (le jeu garde l'image de sa carte, son bandeau rouge d'origine, le dos son aplat, la tranche son titre).
export function gameBoxContent(shape: ShelfShape, slug: string, url?: string): Pick<ItemContent, 'url' | 'backUrl' | 'back' | 'band' | 'printed' | 'spine'> {
  if (shape !== 'game') return {};
  const box = getGameBoxService()?.peek(slug);
  if (!box) return {};
  const front = box.frontUrl && usableImage(box.frontUrl) ? box.frontUrl : undefined;
  const cover = front ?? url;
  const spine = { style: box.style, format: box.format, title: box.title, ...(box.logoUrl ? { logoUrl: box.logoUrl } : {}), ...(box.studio ? { studio: box.studio } : {}), console: box.platformName };
  return {
    ...(front ? { url: front } : {}),
    band: box.style.band,
    spine,
    ...(box.tgdbId !== undefined && cover !== undefined && cover === box.frontUrl ? { printed: true } : {}),
    ...(box.backUrl ? { backUrl: box.backUrl } : { back: madeBackFace(box) }),
  };
}

// Jaquette d'un jeu : celle de sa boîte connue, sinon l'image de la carte (`own`).
export const gameCoverUrl = (shape: ShelfShape, slug: string, own?: string): string | undefined => gameBoxContent(shape, slug, own).url ?? own;

// Format de boîte à réécrire : un jeu rangé ou posé (présentoir) dont la boîte connue (format ou couleur du boîtier) diffère de ce qui est enregistré.
export type BoxChange = { roomId: string; id: string; format: BoxFormat; plastic: string };

export function boxChanges(state: LibraryState, peek: (slug: string) => GameBox | null | undefined): BoxChange[] {
  return state.rooms.flatMap((room) => room.layout.flatMap((p): BoxChange[] => {
    if ((p.kind !== 'stored' && p.kind !== 'posed') || p.shape !== 'game') return [];
    const box = peek(p.slug);
    if (!box || (box.format === p.box && box.style.plastic === p.caseColor)) return [];
    return [{ roomId: room.id, id: p.id, format: box.format, plastic: box.style.plastic }];
  }));
}

// Toutes les réécritures en une seule fois (ne déplace rien, voir setStoredBox).
export const applyBoxChanges = (state: LibraryState, changes: BoxChange[]): LibraryState =>
  changes.reduce((s, c) => updateLayout(s, c.roomId, (layout) => setStoredBox(layout, c.id, c.format, c.plastic)), state);
