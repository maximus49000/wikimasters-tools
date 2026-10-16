import type { GameBoxService } from './game-box-service';

// Le service des boîtes est créé une fois par la surcouche ; la scène et la fiche le lisent ici.
let service: GameBoxService | null = null;

export const setGameBoxService = (next: GameBoxService | null): void => {
  service = next;
};
export const getGameBoxService = (): GameBoxService | null => service;
