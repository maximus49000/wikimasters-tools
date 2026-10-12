// Plafond global des figurants animés des commerces (vague 1b-iv-b, spec §6) : au plus SHOP_SPRITE_CAP sprites pour 720 px de
// scène, pour rester dans le budget de la 1a. Fonction pure : on lui donne les sprites de la scène par classe, elle rend ceux à
// retirer. Ordre de retrait : d'abord les clients de terrasse, puis les clients de l'intérieur, chaque fois les plus éloignés du
// centre de la vue. Jamais retirés (classe `keep`) : le personnel (derrière la vitrine, à la porte, en route, serveur de
// terrasse), l'équipe du chantier, les déménageurs et leur camion, les videurs et la file de la boîte de nuit — ils portent
// l'histoire du commerce (un local ouvert n'est jamais vide, la file avance). Passants, habitants et véhicules relèvent du
// budget de la 1a et ne passent pas par ici.
// G4b (Ghibli seulement) : 52 par 720 px (les scènes des commerces sont plus peuplées) ; les clients d'un même parti (`party`)
// partent ensemble, jamais un parti dont un membre est servi (`served`) dans le tiers central de la vue.

export const SHOP_SPRITE_CAP = 40;
export const GHIBLI_SHOP_SPRITE_CAP = 52;
// Largeur de référence du plafond (même référence que les budgets de la 1a : par 720 px de monde).
export const CAP_WIDTH = 720;

export type SpriteClass = 'keep' | 'customer' | 'terrace';
// `x` : position dans le monde (px) ; `weight` : nombre de silhouettes représentées (1 par défaut, une file entière pour la boîte).
// `party` : parti du client (retiré entier ; absent : seul) ; `served` : en pleine interaction (servi, à la caisse…).
export type BudgetSprite = { id: string; kind: SpriteClass; x: number; weight?: number; party?: string; served?: boolean };

// Plafond pour une scène de `width` px : `base` (SHOP_SPRITE_CAP, ou GHIBLI_SHOP_SPRITE_CAP en Ghibli) par 720 px, jamais moins.
export const capFor = (width: number, base = SHOP_SPRITE_CAP): number => Math.round(base * Math.max(1, width / CAP_WIDTH));

// Ids à retirer pour que le total tienne sous `cap` (ou, si la classe `keep` le dépasse seule, tout ce qui peut l'être).
// Retrait par parti entier (le plus loin du centre d'abord, distance de son membre le plus proche) ; un parti dont un membre
// est servi dans le tiers central de la vue (|x − centre| ≤ centre / 3, la vue faisant 2 × centre) reste.
export function spriteBudget(sprites: readonly BudgetSprite[], centre: number, cap = SHOP_SPRITE_CAP): Set<string> {
  const drop = new Set<string>();
  let total = 0;
  for (const s of sprites) total += s.weight ?? 1;
  if (total <= cap) return drop;
  type Group = { key: string; members: BudgetSprite[]; far: number; kept: boolean };
  const groupsOf = (kind: SpriteClass): Group[] => {
    const byKey = new Map<string, Group>();
    for (const s of sprites) {
      if (s.kind !== kind) continue;
      const key = s.party ?? s.id;
      const g = byKey.get(key) ?? { key, members: [], far: Infinity, kept: false };
      g.members.push(s);
      g.far = Math.min(g.far, Math.abs(s.x - centre));
      if (s.served && Math.abs(s.x - centre) <= centre / 3) g.kept = true;
      byKey.set(key, g);
    }
    return [...byKey.values()].filter((g) => !g.kept).sort((a, b) => b.far - a.far || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  };
  for (const g of [...groupsOf('terrace'), ...groupsOf('customer')]) {
    if (total <= cap) break;
    for (const s of g.members) {
      drop.add(s.id);
      total -= s.weight ?? 1;
    }
  }
  return drop;
}
