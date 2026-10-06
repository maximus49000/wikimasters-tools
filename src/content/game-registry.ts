import type { GameService } from './game-service';

// Le service est créé une fois par la surcouche ; les fiches de carte le lisent ici.
let service: GameService | null = null;

export const setGameService = (next: GameService | null): void => {
  service = next;
};
export const getGameService = (): GameService | null => service;
