import { DOOR_MARGIN, DOOR_WIDTH } from '../city/doors';
import { lampsFor } from '../city/lamps';
import type { CityPaintPlan } from './city-plan';
import { fondRng } from './fond-time';

// Verdure de la rue principale (port de la maquette fond-ville, `03b-rue-verte.js` `streetVerdure`) : alignement d'arbres en
// fosse à grille en fonte à la bordure (platanes, tilleuls, marronniers, cerisiers ; un arbre tous les 70-110 px, décision du
// 2026-10-20 ; quelques jeunes au tuteur, quelques fosses vides), bacs de trottoir devant une vitrine, parterre au pied d'un
// immeuble sans commerce, grimpante sur l'arête d'une façade, pots devant une porte, herbe entre les pavés.
// Emplacements interdits : entrées d'immeuble (± DOOR_MARGIN, + 2), 8 px à chaque bout d'un local (porte du commerce),
// lampadaires (± 9, `lampsFor`), arbres du plan (± r + 6), mobilier (± 3), les autres éléments posés (± 3), hors de l'image.
// Le couloir des passants (doorY → walkY) reste libre : fosses à la bordure (curb − 1,4), bacs et parterres collés à la
// façade (ground + 0,3 … + 0,5). Pur et déterministe ; ses tirages (`fondRng(seed, 'rue-…')`) ne touchent aucun autre tirage.

export type RueSpecies = 'platane' | 'tilleul' | 'marronnier' | 'cerisier';
export type RuePit = { kind: 'pit'; x: number; x0: number; x1: number; y: number; empty: boolean; young: boolean; species: RueSpecies; h: number; r: number; lean: number; flowers: boolean; flowerSeed: number };
export type RueBox = { kind: 'bac' | 'parterre'; x0: number; x1: number; y: number; w: number; h: number; tall?: boolean; hedge?: boolean; flowerSeed: number };
export type RueClimber = { kind: 'grimpante'; x: number; top: number; bottom: number; plant: 'glycine' | 'vigne'; flowerSeed: number };
export type RuePots = { kind: 'pots'; x: number; both: boolean; flowerSeed: number };
export type RueGrass = { kind: 'herbe'; x: number; y: number; n: number };
export type RueItem = RuePit | RueBox | RueClimber | RuePots | RueGrass;

const SPECIES: readonly RueSpecies[] = ['platane', 'platane', 'tilleul', 'marronnier', 'tilleul', 'cerisier'];
type Kind = 'door' | 'lamp' | 'tree' | 'furn' | 'shopdoor';

export function streetVerdure(plan: Omit<CityPaintPlan, 'rue'>, width: number): RueItem[] {
  const { seed, curb, ground, unit: u } = plan;
  const out: RueItem[] = [];
  const near = plan.buildings.filter((b) => !b.far);
  const lamps = lampsFor(width, seed).map((l) => l.x);
  const doors = plan.doors.map((d) => ({ x0: d.x - DOOR_MARGIN, x1: d.x + DOOR_WIDTH + DOOR_MARGIN }));
  // Locaux = spans bloqués qui ne sont pas une entrée (la maquette comparait `d.x0 + 4` au début du span, qui vaut `d.x0` :
  // les entrées restaient comptées comme locaux ; ici on les écarte vraiment).
  const shops = plan.blocked.filter((s) => !doors.some((d) => Math.abs(d.x0 - s.x0) < 0.5));
  const busy = (x0: number, x1: number, kinds: readonly Kind[]): boolean =>
    x0 < 0 ||
    x1 > width ||
    (kinds.includes('door') && doors.some((d) => x1 > d.x0 - 2 && x0 < d.x1 + 2)) ||
    (kinds.includes('lamp') && lamps.some((l) => x1 > l - 9 && x0 < l + 9)) ||
    (kinds.includes('tree') && plan.trees.some((t) => x1 > t.x - t.r - 6 && x0 < t.x + t.r + 6)) ||
    (kinds.includes('furn') && plan.furniture.some((f) => x1 > f.x - 3 && x0 < f.x + f.w + 3)) ||
    (kinds.includes('shopdoor') && shops.some((s) => (x1 > s.x0 - 2 && x0 < s.x0 + 8) || (x1 > s.x1 - 8 && x0 < s.x1 + 2))) ||
    out.some((v) => 'x0' in v && x1 > v.x0 - 3 && x0 < v.x1 + 3);

  // 1. Alignement d'arbres en fosse à la bordure : 7 essais décalés de ± 7 px autour de chaque pas.
  const rng = fondRng(seed, 'rue-arbres');
  for (let x = 30 + rng() * 50; x < width - 20; x += 70 + rng() * 40) {
    for (let k = 0; k < 7; k++) {
      const px = x + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 7;
      if (busy(px - 6, px + 6, ['door', 'lamp', 'tree', 'furn', 'shopdoor'])) continue;
      const roll = rng();
      const young = roll < 0.14;
      const empty = roll >= 0.14 && roll < 0.22;
      const species = SPECIES[Math.floor(rng() * SPECIES.length)]!;
      const h = (young ? 13 : 34 + rng() * 18) * u;
      const r = (young ? 4 + rng() * 1.5 : 16 + rng() * 8) * u;
      const lean = (rng() - 0.5) * 2;
      out.push({ kind: 'pit', x: px, x0: px - 5, x1: px + 5, y: curb - 1.4, empty, young, species, h, r, lean, flowers: !empty && rng() < 0.45, flowerSeed: rng() * 1000 });
      break;
    }
  }

  // 2. Bacs de trottoir devant une vitrine (jamais devant la porte du local), 40 % des locaux d'au moins 30 px.
  const rb = fondRng(seed, 'rue-bacs');
  for (const s of shops) {
    if (rb() > 0.4 || s.x1 - s.x0 < 30) continue;
    const n = 1 + Math.floor(rb() * 2);
    const left = rb() < 0.5;
    for (let i = 0; i < n; i++) {
      const w = 6 + rb() * 3;
      const bx = left ? s.x0 + 9 + i * (w + 3) : s.x1 - 9 - w - i * (w + 3);
      // Hauteur, bac haut et fleurs tirés seulement pour un bac posé (même suite de tirages que la maquette).
      if (!busy(bx, bx + w, ['door', 'furn'])) out.push({ kind: 'bac', x0: bx, x1: bx + w, y: ground + 0.5, w, h: 3 + rb(), tall: rb() < 0.3, flowerSeed: rb() * 1000 });
    }
  }
  // 3. Parterre au pied d'un immeuble sans commerce (50 %), haie basse ou fleurs.
  for (const b of near) {
    if (b.x < 0 || b.x + b.w > width) continue;
    const inShop = plan.blocked.some((s) => s.x1 - s.x0 > 20 && b.x + b.w / 2 > s.x0 && b.x + b.w / 2 < s.x1);
    if (inShop || rb() > 0.5) continue;
    const w = Math.min(22, b.w * 0.45);
    const bx = b.x + (rb() < 0.5 ? 2 : b.w - w - 2);
    if (!busy(bx, bx + w, ['door', 'furn', 'tree'])) out.push({ kind: 'parterre', x0: bx, x1: bx + w, y: ground + 0.3, w, h: 3.5, flowerSeed: rb() * 1000, hedge: rb() < 0.5 });
  }

  // 4. Grimpantes sur l'arête d'une façade (15 %), du sol à 6-36 px au-dessus du rez-de-chaussée.
  const rg = fondRng(seed, 'rue-grimpantes');
  for (const b of near) {
    if (b.x < 0 || b.x + b.w > width || rg() >= 0.15) continue;
    const left = rg() < 0.5;
    const top = Math.max(b.top + b.look.roofH + 8, ground - 30 - (6 + rg() * 30));
    out.push({ kind: 'grimpante', x: left ? b.x + 1.5 : b.x + b.w - 1.5, top, bottom: ground, plant: rg() < 0.5 ? 'glycine' : 'vigne', flowerSeed: rg() * 1000 });
  }
  // 5. Pots devant une porte (30 %), d'un côté ou des deux.
  const rp = fondRng(seed, 'rue-pots');
  for (const d of plan.doors) if (rp() < 0.3) out.push({ kind: 'pots', x: d.x, both: rp() < 0.5, flowerSeed: rp() * 1000 });
  // 6. Herbe entre les pavés au bord de la chaussée, une touffe tous les 30-75 px.
  const rh = fondRng(seed, 'rue-herbe');
  for (let x = 10 + rh() * 30; x < width; x += 30 + rh() * 45) out.push({ kind: 'herbe', x, y: curb + 0.8 + rh() * 1.6, n: 2 + Math.floor(rh() * 3) });
  return out;
}
