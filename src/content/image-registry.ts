import type { ImageService } from '../core/images/image-service';

// Le service d'images est créé une fois par la surcouche ; les aperçus de carte et la fiche native le lisent ici.
let service: ImageService | null = null;

export const setImageService = (next: ImageService | null): void => {
  service = next;
};
export const getImageService = (): ImageService | null => service;
