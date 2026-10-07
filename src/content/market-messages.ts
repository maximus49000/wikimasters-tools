// Messages entre le script du monde MAIN (qui écoute fetch) et le script de contenu isolé.
export const MARKET_MESSAGE = 'wmt:market';
export const HELLO_MESSAGE = 'wmt:hello';
// Filtres (étiquette, rareté, recherche) que la page Collection envoie à son API.
export const COLLECTION_FILTER_MESSAGE = 'wmt:collection-filter';
// Cartes obtenues (ouverture d'un pack, achat) : la réponse du jeu, relayée telle quelle.
export const CARDS_MESSAGE = 'wmt:cards';
// Mes enchères (vente, mises, gagnées) : la réponse de `/api/marketplace?mine=1`, relayée telle quelle.
export const MINE_MESSAGE = 'wmt:mine';
// Une action d'échange ou de vente réussie (écriture vers /api/trades…) : la Collection va changer.
export const MOVEMENT_MESSAGE = 'wmt:movement';
// Une écriture réussie vers /api/marketplace (mise en vente, mise, retrait) : « mes enchères » a changé, à relire tout de suite.
export const MARKET_WRITE_MESSAGE = 'wmt:market-write';
