import type { Platform, PlatformSetting } from '../core/music/platform';
import type { MusicService } from './music-service';
import type { PlayerSource } from './player-source';

// Le service musique est créé une fois par la surcouche ; les fiches de carte (CardPopup) le lisent ici.
let service: MusicService | null = null;

export const setMusicService = (next: MusicService | null): void => {
  service = next;
};
export const getMusicService = (): MusicService | null => service;

// Source du mini-lecteur : la section « Écouter » y lit la piste en cours (pause sur sa ligne).
let player: PlayerSource | null = null;

export const setPlayerSource = (next: PlayerSource | null): void => {
  player = next;
};
export const getPlayerSource = (): PlayerSource | null => player;

// Les plateformes d'écoute fournies par cette installation et celle qui est choisie : le réglage « Lecteur » en fait un sélecteur dès qu'il y en a deux.
export type PlatformChoice = { available: readonly Platform[]; setting: PlatformSetting };
let platformChoice: PlatformChoice | null = null;

export const setPlatformChoice = (next: PlatformChoice | null): void => {
  platformChoice = next;
};
export const getPlatformChoice = (): PlatformChoice | null => platformChoice;
