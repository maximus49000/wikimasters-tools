// Fond plein cadre de chaque rareté : un fichier du site lui-même (l'extension s'exécute sur ses pages,
// donc l'URL relative se résout). Une rareté absente de cette liste garde le dégradé de repli.
// À compléter à partir du HTML des cartes du jeu (`<img src="/_next/image?url=%2F…png">`).
const BACKGROUNDS: Record<string, string> = {
  L: '/legendaire.png',
  UR: '/ultra_rare.png',
  SR: '/super_rare.png',
  R: '/rare.png',
  PC: '/peu_commun.png',
  C: '/commun.png',
};

export const rarityBackground = (rarity: string | null): string | null =>
  (rarity && BACKGROUNDS[rarity]) || null;

// Les variables et classes de rareté sont celles du site : `--color-rarity-l`, `glow-l`.
export const rarityKey = (rarity: string): string => rarity.toLowerCase();
