import type { MusicService } from './music-service';

// Le service musique est créé une fois par la surcouche ; les fiches de carte (CardPopup) le lisent ici.
let service: MusicService | null = null;

export const setMusicService = (next: MusicService | null): void => {
  service = next;
};
export const getMusicService = (): MusicService | null => service;
