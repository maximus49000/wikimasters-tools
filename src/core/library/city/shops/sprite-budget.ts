// Plafond global des figurants animés des commerces (vague 1b-iv-b, spec §6) : au plus SHOP_SPRITE_CAP sprites pour 720 px de
// scène, pour rester dans le budget de la 1a. Fonction pure : on lui donne les sprites de la scène par classe, elle rend ceux à
// retirer. Ordre de retrait : d'abord les clients de terrasse, puis les clients de l'intérieur, chaque fois les plus éloignés du
// centre de la vue. Jamais retirés (classe `keep`) : le personnel (derrière la vitrine, à la porte, en route, serveur de
// terrasse), l'équipe du chantier, les déménageurs et leur camion, les videurs et la file de la boîte de nuit — ils portent
// l'histoire du commerce (un local ouvert n'est jamais vide, la file avance). Passants, habitants et véhicules relèvent du
// budget de la 1a et ne passent pas par ici.

export const SHOP_SPRITE_CAP = 40;
// Largeur de référence du plafond (même référence que les budgets de la 1a : par 720 px de monde).
export const CAP_WIDTH = 720;

export type SpriteClass = 'keep' | 'customer' | 'terrace';
// `x` : position dans le monde (px) ; `weight` : nombre de silhouettes représentées (1 par défaut, une file entière pour la boîte).
export type BudgetSprite = { id: string; kind: SpriteClass; x: number; weight?: number };

// Plafond pour une scène de `width` px : SHOP_SPRITE_CAP par 720 px, jamais moins que SHOP_SPRITE_CAP.
export const capFor = (width: number): number => Math.round(SHOP_SPRITE_CAP * Math.max(1, width / CAP_WIDTH));

// Ids à retirer pour que le total tienne sous `cap` (ou, si la classe `keep` le dépasse seule, tout ce qui peut l'être).
export function spriteBudget(sprites: readonly BudgetSprite[], centre: number, cap = SHOP_SPRITE_CAP): Set<string> {
  const drop = new Set<string>();
  let total = 0;
  for (const s of sprites) total += s.weight ?? 1;
  if (total <= cap) return drop;
  const farthestFirst = (kind: SpriteClass): BudgetSprite[] =>
    sprites.filter((s) => s.kind === kind).sort((a, b) => Math.abs(b.x - centre) - Math.abs(a.x - centre) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const s of [...farthestFirst('terrace'), ...farthestFirst('customer')]) {
    if (total <= cap) break;
    drop.add(s.id);
    total -= s.weight ?? 1;
  }
  return drop;
}
