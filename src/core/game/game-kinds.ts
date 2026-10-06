import type { CardKinds } from '../kinds/wikidata-kinds';

const VIDEO_GAME = 'Q7889';

// Une carte dont la nature Wikidata est « jeu vidéo ». Une carte avec un identifiant Steam compte aussi (voir game-service).
export const isVideoGame = (kinds: CardKinds | undefined): boolean => kinds?.natures.includes(VIDEO_GAME) ?? false;
