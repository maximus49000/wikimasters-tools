import type { ScreenService } from './screen-service';

// Le service est créé une fois par la surcouche ; les fiches de carte (CardPopup) le lisent ici.
let service: ScreenService | null = null;

export const setScreenService = (next: ScreenService | null): void => {
  service = next;
};
export const getScreenService = (): ScreenService | null => service;
