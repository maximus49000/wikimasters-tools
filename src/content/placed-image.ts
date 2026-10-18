// Image d'un objet placé (carte rangée ou posée) : la pochette choisie pour CET objet (bulle, « Choisir la pochette ») tant qu'elle se
// charge, sinon l'image de la carte (`imageOf`). La fiche de la carte, la Collection et le site gardent l'image de la carte.
import type { ShelfShape } from '../core/library/library-types';
import { localImage } from './cover-cache';
import { gameBoxContent } from './game-box-content';
import { usableImage } from './image-probe';
import type { ItemContent } from './model3d-art';

type WithCover = { slug: string; cover?: string };

// La pochette choisie (copie locale si elle est prête), undefined si aucune ou si elle ne se charge pas.
const chosenOf = (p: WithCover): string | undefined => (p.cover && usableImage(p.cover) ? localImage(p.cover) : undefined);

export function imageOfPlaced(p: WithCover, imageOf: (slug: string) => string | undefined): string | undefined {
  return chosenOf(p) ?? imageOf(p.slug);
}

// Couverture d'une boîte dessinée en 3D : la pochette choisie passe devant la jaquette d'une boîte de jeu connue (un scan TheGamesDB :
// son bandeau est déjà imprimé) ; sans elle, l'image de la carte, remplacée par la jaquette de la boîte connue (gameBoxContent).
export function placedBoxContent(p: WithCover & { shape: ShelfShape }, imageOf: (slug: string) => string | undefined): Pick<ItemContent, 'url' | 'backUrl' | 'back' | 'band' | 'printed' | 'spine'> {
  const chosen = chosenOf(p);
  if (!chosen) {
    const url = imageOf(p.slug);
    return { url, ...gameBoxContent(p.shape, p.slug, url) };
  }
  return { ...gameBoxContent(p.shape, p.slug, chosen), url: chosen, ...(p.shape === 'game' ? { printed: true } : {}) };
}
