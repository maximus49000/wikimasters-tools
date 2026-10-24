import { DOOR_MARGIN, DOOR_WIDTH } from '../city/doors';
import { STAGE_HALF, stageXs } from '../city/install';
import { cityMetrics } from '../city/metrics';
import { lampsFor } from '../city/lamps';
import { shopFrame, shopSlotsFor } from '../city/shops/slots';
import { CROSS_HALF, streetFixtures } from '../city/traffic/engine';
import type { CityPaintPlan } from './city-plan';
import { fondRng } from './fond-time';

// Verdure de la rue principale (port de la maquette fond-ville, `03b-rue-verte.js` `streetVerdure`) : alignement d'arbres en
// fosse à la bordure en « boulevard » (maquette rue-arbres-naturels, notes §1, variante A, 2026-10-24 : pas constant de
// PIT_PITCH px, place sautée devant un obstacle, une essence par tronçon, même âge ; une place sur dix replantée : jeune au
// tuteur ou fosse vide), bacs de trottoir devant une vitrine, parterre au pied d'un
// immeuble sans commerce, grimpante sur l'arête d'une façade, pots devant une porte, herbe entre les pavés.
// Emplacements interdits : scènes de la Fête de la musique, passage piéton et arrêt de bus du trottoir des immeubles (fosses
// seulement, voir PIT_*_CLEAR), entrées d'immeuble (± DOOR_MARGIN, + 2 ; fosses : ± DOOR_MARGIN contre la grille), porte vitrée de chaque local (± 4 ; celle que peint la
// façade, `shopFrame`) — une fosse peut donc se trouver devant une vitrine, jamais devant une porte —, lampadaires (± 9,
// `lampsFor`), mobilier (± 3, seulement pour les bacs et parterres, collés à la façade comme lui),
// les autres éléments posés (± 3 ; les fosses, à la bordure, ne gênent pas les parterres, contre la façade), hors de l'image.
// Le couloir des passants (doorY → walkY) reste libre : carré de terre des fosses entre walkY + 0,6 et curb − 0,4, bacs et parterres collés à la
// façade, posés debout contre le mur : leur bas (face avant) est à `doorY − 0,1`, la ligne des pieds des habitants, clients et
// équipes qui longent la façade (seule leur ombre portée, peinture au sol, déborde dans le couloir).
// Pur et déterministe ; ses tirages (`fondRng(seed, 'rue-…')`) ne touchent aucun autre tirage.

// Essences de la maquette V5 (le marronnier n'est plus planté dans la rue ; la colline garde le sien).
export type RueSpecies = 'platane' | 'tilleul' | 'robinier' | 'frene' | 'cerisier';
// Finition du pied (notes §2) : grille en fonte ajourée (adulte), couvre-sol (jeune au tuteur), terre nue (fosse vide).
export type RueFinish = 'grille' | 'herbe' | 'terre';
// `y` = pied du fût (pitFootY, centre du carré de terre en perspective) ; `section` = index du tronçon (coupé au passage
// piéton et à l'arrêt de bus du trottoir des immeubles) ; `slot` = numéro de la place (rueSlots).
export type RuePit = { kind: 'pit'; x: number; x0: number; x1: number; y: number; empty: boolean; young: boolean; species: RueSpecies; section: number; slot: number; finish: RueFinish; h: number; r: number; lean: number; flowers: boolean; flowerSeed: number };
export type RueBox = { kind: 'bac' | 'parterre'; x0: number; x1: number; y: number; w: number; h: number; tall?: boolean; hedge?: boolean; flowerSeed: number };
export type RueClimber = { kind: 'grimpante'; x: number; top: number; bottom: number; plant: 'glycine' | 'vigne'; flowerSeed: number };
export type RuePots = { kind: 'pots'; x: number; both: boolean; flowerSeed: number };
export type RueGrass = { kind: 'herbe'; x: number; y: number; n: number };
export type RueItem = RuePit | RueBox | RueClimber | RuePots | RueGrass;

// Largeur minimale d'un parterre (rétréci pour tenir entre le bord de la façade et l'entrée).
export const PARTERRE_MIN = 8;
// Écart entre le bas d'un bac ou d'un parterre et la ligne des pieds le long des façades (doorY).
export const BOX_CLEARANCE = 0.1;
// Dégagement de part et d'autre de la porte vitrée d'un local.
export const SHOP_DOOR_MARGIN = 4;
// Demi-largeur de la fosse (carré de terre de 14 px et sa bordure de pierre ; 5 avant la maquette V5).
export const PIT_HALF = 7;
// Alignement en boulevard : une place tous les PIT_PITCH px à partir d'une phase tirée (PIT_PHASE + rng × PIT_PHASE_SPREAD),
// centre libre cherché à ± PIT_SEARCH px (au pixel, gauche puis droite à distance égale), sinon la place reste vide : les
// voisins ne bougent pas. Une place est aussi sautée (la plus à droite cède) si sa fosse serait à moins de PIT_MIN_GAP px de la
// fosse précédente : sans cela l'écart pouvait descendre à 20 px et les couronnes fondaient.
// Recherche à ± 20 au lieu des ± 12 de la maquette : dans une rue de locaux (une porte tous les 30 px) ± 12 sautait plus
// d'une place sur deux.
export const PIT_PITCH = 60;
export const PIT_PHASE = 30;
export const PIT_PHASE_SPREAD = 20;
export const PIT_SEARCH = 20;
export const PIT_MIN_GAP = 34;
// Une place sur PIT_REPLANT replantée (compteur, décalage tiré) : jeune au tuteur, ou fosse vide (PIT_EMPTY_SHARE du tirage).
export const PIT_REPLANT = 10;
export const PIT_EMPTY_SHARE = 0.25;
// Bords de l'image : la fosse reste à 2 px au moins.
export const PIT_EDGE = 2;
// Tronçon « court » (robinier ou cerisier) : moins de 6 places.
export const SECTION_SHORT = 6 * PIT_PITCH;
// Carré de terre (notes §2) : PIT_DEPTH px de profondeur, bas à curb − 0,4, haut à 252,6 à 340 px de haut (walkY = 252,28 :
// le couloir des passants reste libre) ; pied du fût au centre en perspective (52 % de la profondeur : 255,4 ≈ curb − 3).
export const PIT_DEPTH = 5.4;
export const pitTopY = (curb: number, unit: number): number => curb - (0.4 + PIT_DEPTH) * unit;
export const pitFootY = (curb: number, unit: number): number => pitTopY(curb, unit) + PIT_DEPTH * 0.52 * unit;
// Places de l'alignement (centres nominaux) : même phase quelle que soit la largeur.
export function rueSlots(seed: number, width: number): number[] {
  const out: number[] = [];
  for (let x = PIT_PHASE + fondRng(seed, 'rue-arbres')() * PIT_PHASE_SPREAD; x < width; x += PIT_PITCH) out.push(x);
  return out;
}
// Tronçons : coupés au passage piéton et à l'arrêt de bus du trottoir des immeubles ; index = nombre de coupes à gauche.
export function rueCuts(width: number, seed: number, unit: number): number[] {
  const f = streetFixtures(width, seed, unit);
  return [f.lightX, f.busStop.far].sort((a, b) => a - b);
}
// Sûr pour une fosse déplacée de ± PIT_SEARCH : les zones dégagées du passage piéton et de l'arrêt de bus (PIT_*_CLEAR + PIT_HALF)
// sont plus larges que la recherche, donc la fosse reste du même côté de chaque coupe que sa place.
export const sectionOf = (cuts: readonly number[], x: number): number => cuts.filter((c) => c < x).length;
// Une essence par tronçon (notes §5) : le plus long (tronçon principal) en platane ou tilleul ; un tronçon court en robinier
// ou cerisier (alternés, le premier tiré) ; un autre tronçon long dans l'essence (platane / tilleul) que le principal n'a pas
// prise, ou en frêne une fois sur trois s'il porte une scène de la Fête (placette).
export const PLACETTE_FRENE = 1 / 3;
export function sectionSpecies(width: number, seed: number, unit: number): RueSpecies[] {
  const bounds = [0, ...rueCuts(width, seed, unit), width];
  const spans = bounds.slice(1).map((b, i) => [bounds[i]!, b] as const);
  const rs = fondRng(seed, 'rue-essences');
  const main: RueSpecies = rs() < 0.6 ? 'platane' : 'tilleul';
  const other: RueSpecies = main === 'platane' ? 'tilleul' : 'platane';
  let short = rs() < 0.5 ? 0 : 1;
  const longest = spans.reduce((best, s, i) => (s[1] - s[0] > spans[best]![1] - spans[best]![0] ? i : best), 0);
  const stages = stageXs(width, seed);
  return spans.map(([a, b], i): RueSpecies => {
    const roll = rs();
    if (i === longest) return main;
    if (b - a < SECTION_SHORT) return (['cerisier', 'robinier'] as const)[short++ % 2]!;
    return stages.some((x) => x > a && x < b) && roll < PLACETTE_FRENE ? 'frene' : other;
  });
}
// Abords sans arbre (unités, de part et d'autre du centre ; la grille de la fosse, ± PIT_HALF, reste dehors) : emprise d'une
// scène de la Fête de la musique (plancher ± STAGE_HALF, + 4 de marge : placette fixe, rien ne disparaît le jour J), passage
// piéton et poteau du feu (± CROSS_HALF + 3 pour le poteau, + 3), arrêt de bus du trottoir des immeubles (voyageurs à ± 23).
export const PIT_STAGE_CLEAR = STAGE_HALF + 4;
export const PIT_CROSSING_CLEAR = CROSS_HALF + 6;
export const PIT_BUS_STOP_CLEAR = 26;
type Kind = 'door' | 'lamp' | 'furn' | 'shopdoor';

export function streetVerdure(plan: Omit<CityPaintPlan, 'rue'>, width: number, skipSlots: ReadonlySet<number> = new Set()): RueItem[] {
  const { seed, curb, ground, unit: u } = plan;
  // Pied des bacs et parterres : juste au-dessus de la ligne de marche le long des façades (doorY).
  const wallFoot = cityMetrics(plan.height).doorY - BOX_CLEARANCE;
  const out: RueItem[] = [];
  const near = plan.buildings.filter((b) => !b.far);
  const lamps = lampsFor(width, seed).map((l) => l.x);
  const doors = plan.doors.map((d) => ({ x0: d.x - DOOR_MARGIN, x1: d.x + DOOR_WIDTH + DOOR_MARGIN }));
  // Locaux (mêmes spans que ceux de `plan.blocked` hors entrées ; la maquette, qui comparait `d.x0 + 4` au début du span,
  // comptait aussi les entrées comme locaux) et porte vitrée de chacun, à l'endroit où la façade la peint (`shopFrame`). La
  // maquette gardait libres les 8 px de chaque bout du local faute de connaître le côté de la porte.
  const slots = shopSlotsFor(width, plan.height, seed);
  const shops = slots.map((s) => ({ x0: s.x, x1: s.x + s.w }));
  const shopDoors = slots.map((s) => {
    const d = shopFrame(s, ground).door;
    return { x0: d.x - SHOP_DOOR_MARGIN, x1: d.x + d.w + SHOP_DOOR_MARGIN };
  });
  // `wall` : élément posé contre la façade (bac, parterre) ; les fosses, à la bordure, ne le gênent pas (bacs compris depuis
  // l'alignement en boulevard : plus nombreuses, les fosses ne retirent plus les bacs de la façade).
  const busy = (x0: number, x1: number, kinds: readonly Kind[], wall = false): boolean =>
    x0 < 0 ||
    x1 > width ||
    (kinds.includes('door') && doors.some((d) => x1 > d.x0 - 2 && x0 < d.x1 + 2)) ||
    (kinds.includes('lamp') && lamps.some((l) => x1 > l - 9 && x0 < l + 9)) ||
    (kinds.includes('furn') && plan.furniture.some((f) => x1 > f.x - 3 && x0 < f.x + f.w + 3)) ||
    (kinds.includes('shopdoor') && shopDoors.some((d) => x1 > d.x0 && x0 < d.x1)) ||
    out.some((v) => 'x0' in v && !(wall && v.kind === 'pit') && x1 > v.x0 - 3 && x0 < v.x1 + 3);

  // 1. Alignement d'arbres en fosse à la bordure, en boulevard : à chaque place (rueSlots), le centre libre le plus proche à
  // ± PIT_SEARCH px près, au pixel (gauche puis droite à distance égale) ; rien de libre → place sautée, les voisins restent
  // sur leur pas. Entrées mesurées sur la fosse réelle (± PIT_HALF) contre leur span élargi de 4 px ; porte vitrée d'un
  // local : seul le fût (centre) à 4 px au moins de la porte (la fosse peut passer devant, la porte reste dégagée ; règle
  // élargie le 2026-10-24 pour garder la densité demandée par l'utilisateur) ;
  // lampadaires sur ± 6 (± 9 autour du lampadaire). Pas de règle du mobilier pour les fosses : bancs, boîtes aux
  // lettres, vélos et pigeons ont le pied entre ground et ground + 7 u, affiches au mur (paintFurniture), tous côté façade,
  // loin de la bordure où sont les fosses.
  // Scènes, passage piéton et arrêt de bus du trottoir des immeubles : emplacements fixes (même tirage que la fête et le
  // trafic), dessinés devant les arbres ; aucun fût ni houppier centré dans leur emprise.
  // Tirages par place (`rue-arbres` + numéro) : une place sautée ou une rue plus large ne change pas les autres arbres.
  // Même âge : fût 42 ± 3, rayon 20 ± 1,5 (jeune : 13 et 4,5).
  const fixtures = streetFixtures(width, seed, u);
  const clear: readonly { x: number; half: number }[] = [
    ...stageXs(width, seed).map((x) => ({ x, half: PIT_STAGE_CLEAR * u })),
    { x: fixtures.lightX, half: PIT_CROSSING_CLEAR * u },
    { x: fixtures.busStop.far, half: PIT_BUS_STOP_CLEAR * u },
  ];
  const pitBusy = (px: number): boolean =>
    px - PIT_HALF < PIT_EDGE ||
    px + PIT_HALF > width - PIT_EDGE ||
    clear.some((c) => Math.abs(px - c.x) < c.half + PIT_HALF) ||
    busy(px - 6, px + 6, ['lamp']) ||
    shopDoors.some((d) => px > d.x0 && px < d.x1) ||
    doors.some((d) => px + PIT_HALF > d.x0 && px - PIT_HALF < d.x1);
  const cuts = rueCuts(width, seed, u);
  const species = sectionSpecies(width, seed, u);
  const footY = pitFootY(curb, u);
  const replant = Math.floor(fondRng(seed, 'rue-arbres', 'replant')() * PIT_REPLANT);
  // `skipSlots` : places forcées vides (prise des tests, sans effet sur le tirage des autres places).
  let lastPit = -Infinity;
  rueSlots(seed, width).forEach((x, slot) => {
    if (skipSlots.has(slot)) return;
    let px: number | null = null;
    for (let k = 0; k <= 2 * PIT_SEARCH && px === null; k++) {
      const c = x + (k % 2 ? -1 : 1) * Math.ceil(k / 2);
      if (!pitBusy(c)) px = c;
    }
    if (px === null || px - lastPit < PIT_MIN_GAP) return;
    lastPit = px;
    const rng = fondRng(seed, 'rue-arbres', String(slot));
    const again = slot % PIT_REPLANT === replant;
    const empty = again && rng() < PIT_EMPTY_SHARE;
    const young = again && !empty;
    const h = (young ? 13 : 42 + (rng() - 0.5) * 6) * u;
    const r = (young ? 4.5 : 20 + (rng() - 0.5) * 3) * u;
    const lean = (rng() - 0.5) * 2;
    const section = sectionOf(cuts, px);
    const finish: RueFinish = empty ? 'terre' : young ? 'herbe' : 'grille';
    out.push({ kind: 'pit', x: px, x0: px - PIT_HALF, x1: px + PIT_HALF, y: footY, empty, young, species: species[section]!, section, slot, finish, h, r, lean, flowers: !empty && rng() < 0.45, flowerSeed: rng() * 1000 });
  });

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
      if (busy(bx, bx + w, ['door', 'furn', 'shopdoor'], true)) continue;
      const h = 3 + rb();
      out.push({ kind: 'bac', x0: bx, x1: bx + w, y: wallFoot - h, w, h, tall: rb() < 0.3, flowerSeed: rb() * 1000 });
    }
  }
  // 3. Parterre au pied d'un immeuble sans commerce (50 %), haie basse ou fleurs. Le bout opposé à l'entrée de l'immeuble
  // d'abord, puis l'autre ; si l'entrée, un mobilier ou un arbre gêne encore, le parterre rétrécit au pixel jusqu'à
  // PARTERRE_MIN px pour tenir entre le bord de la façade et l'obstacle (entrée ± sa marge) (la maquette, à largeur fixe de 12-22 px,
  // ne trouvait jamais la place : l'entrée occupe le milieu des immeubles étroits). Tirages de la maquette (50 %, côté, fleurs,
  // haie), mais par immeuble ; le côté tiré ne sert plus qu'à départager un immeuble sans entrée.
  for (const b of near) {
    if (b.x < 0 || b.x + b.w > width) continue;
    const inShop = plan.blocked.some((s) => s.x1 - s.x0 > 20 && b.x + b.w / 2 > s.x0 && b.x + b.w / 2 < s.x1);
    // Tirages propres à l'immeuble (sa position) : agrandir la pièce, qui change les locaux et donc les tirages des bacs, ne
    // déplace pas les parterres des premières tranches.
    const rq = fondRng(seed, 'rue-parterre', String(Math.round(b.x * 8)));
    if (inShop || rq() > 0.5) continue;
    const w0 = Math.min(22, b.w * 0.45);
    const leftFirst = rq() < 0.5;
    const door = plan.doors.find((d) => d.x + DOOR_WIDTH / 2 > b.x && d.x + DOOR_WIDTH / 2 < b.x + b.w);
    // Entrée dans la moitié gauche → le bout droit d'abord, et inversement.
    const ends: readonly boolean[] = door ? (door.x + DOOR_WIDTH / 2 < b.x + b.w / 2 ? [false, true] : [true, false]) : leftFirst ? [true, false] : [false, true];
    const widths: number[] = [];
    for (let w = w0; w > PARTERRE_MIN; w--) widths.push(w);
    if (w0 >= PARTERRE_MIN) widths.push(PARTERRE_MIN);
    // Pleine largeur : à 2 px du bord, entrée ± (marge + 2) comme la maquette ; rétréci : contre le bord de la façade, et
    // contre l'entrée ± sa marge seulement.
    const fits = (bx: number, w: number, full: boolean): boolean =>
      full ? !busy(bx, bx + w, ['door', 'furn'], true) : !busy(bx, bx + w, ['furn'], true) && !doors.some((d) => bx + w > d.x0 && bx < d.x1);
    let spot: { bx: number; w: number } | null = null;
    for (const left of ends) {
      for (const w of widths) {
        const full = w === w0;
        const inset = full ? 2 : 0;
        const bx = left ? b.x + inset : b.x + b.w - w - inset;
        if (!fits(bx, w, full)) continue;
        spot = { bx, w };
        break;
      }
      if (spot) break;
    }
    if (spot) out.push({ kind: 'parterre', x0: spot.bx, x1: spot.bx + spot.w, y: wallFoot - 3.5, w: spot.w, h: 3.5, flowerSeed: rq() * 1000, hedge: rq() < 0.5 });
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
