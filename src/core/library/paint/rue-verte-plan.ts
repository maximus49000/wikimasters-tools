import { DOOR_MARGIN, DOOR_WIDTH } from '../city/doors';
import { STAGE_HALF, stageXs } from '../city/install';
import { cityMetrics } from '../city/metrics';
import { lampsFor } from '../city/lamps';
import { shopFrame, shopSlotsFor } from '../city/shops/slots';
import { CROSS_HALF, streetFixtures } from '../city/traffic/engine';
import type { CityPaintPlan } from './city-plan';
import { fondRng } from './fond-time';

// Verdure de la rue principale (port de la maquette fond-ville, `03b-rue-verte.js` `streetVerdure`) : alignement d'arbres en
// fosse à grille en fonte à la bordure (platanes, tilleuls, marronniers, cerisiers ; un arbre tous les 48-72 px, densifié le
// 2026-10-24 à la demande de l'utilisateur, au lieu de 70-110 ; quelques jeunes au tuteur, quelques fosses vides), bacs de trottoir devant une vitrine, parterre au pied d'un
// immeuble sans commerce, grimpante sur l'arête d'une façade, pots devant une porte, herbe entre les pavés.
// Emplacements interdits : scènes de la Fête de la musique, passage piéton et arrêt de bus du trottoir des immeubles (fosses
// seulement, voir PIT_*_CLEAR), entrées d'immeuble (± DOOR_MARGIN, + 2 ; fosses : ± DOOR_MARGIN contre la grille), porte vitrée de chaque local (± 4 ; celle que peint la
// façade, `shopFrame`) — une fosse peut donc se trouver devant une vitrine, jamais devant une porte —, lampadaires (± 9,
// `lampsFor`), arbres du plan (± r + 6), mobilier (± 3, seulement pour les bacs et parterres, collés à la façade comme lui),
// les autres éléments posés (± 3 ; les fosses, à la bordure, ne gênent pas les parterres, contre la façade), hors de l'image.
// Le couloir des passants (doorY → walkY) reste libre : fosses à la bordure (curb − 1,4), bacs et parterres collés à la
// façade, posés debout contre le mur : leur bas (face avant) est à `doorY − 0,1`, la ligne des pieds des habitants, clients et
// équipes qui longent la façade (seule leur ombre portée, peinture au sol, déborde dans le couloir).
// Pur et déterministe ; ses tirages (`fondRng(seed, 'rue-…')`) ne touchent aucun autre tirage.

export type RueSpecies = 'platane' | 'tilleul' | 'marronnier' | 'cerisier';
export type RuePit = { kind: 'pit'; x: number; x0: number; x1: number; y: number; empty: boolean; young: boolean; species: RueSpecies; h: number; r: number; lean: number; flowers: boolean; flowerSeed: number };
export type RueBox = { kind: 'bac' | 'parterre'; x0: number; x1: number; y: number; w: number; h: number; tall?: boolean; hedge?: boolean; flowerSeed: number };
export type RueClimber = { kind: 'grimpante'; x: number; top: number; bottom: number; plant: 'glycine' | 'vigne'; flowerSeed: number };
export type RuePots = { kind: 'pots'; x: number; both: boolean; flowerSeed: number };
export type RueGrass = { kind: 'herbe'; x: number; y: number; n: number };
export type RueItem = RuePit | RueBox | RueClimber | RuePots | RueGrass;

const SPECIES: readonly RueSpecies[] = ['platane', 'platane', 'tilleul', 'marronnier', 'tilleul', 'cerisier'];
// Largeur minimale d'un parterre (rétréci pour tenir entre le bord de la façade et l'entrée).
export const PARTERRE_MIN = 8;
// Écart entre le bas d'un bac ou d'un parterre et la ligne des pieds le long des façades (doorY).
export const BOX_CLEARANCE = 0.1;
// Dégagement de part et d'autre de la porte vitrée d'un local.
export const SHOP_DOOR_MARGIN = 4;
// Demi-largeur de la fosse (grille et bordure de pierre).
export const PIT_HALF = 5;
// Recherche d'un centre libre autour de chaque pas des arbres (au pixel, de part et d'autre).
export const PIT_SEARCH = 21;
// Écart minimal entre deux fosses voisines (centre à centre) : deux fûts jamais collés quand la recherche décale un pas.
export const PIT_MIN_GAP = 34;
// Pas de l'alignement : PIT_STEP + rng() × PIT_STEP_SPREAD px.
export const PIT_STEP = 48;
export const PIT_STEP_SPREAD = 24;
// Abords sans arbre (unités, de part et d'autre du centre ; la grille de la fosse, ± PIT_HALF, reste dehors) : emprise d'une
// scène de la Fête de la musique (plancher ± STAGE_HALF, + 4 de marge : placette fixe, rien ne disparaît le jour J), passage
// piéton et poteau du feu (± CROSS_HALF + 3 pour le poteau, + 3), arrêt de bus du trottoir des immeubles (voyageurs à ± 23).
export const PIT_STAGE_CLEAR = STAGE_HALF + 4;
export const PIT_CROSSING_CLEAR = CROSS_HALF + 6;
export const PIT_BUS_STOP_CLEAR = 26;
type Kind = 'door' | 'lamp' | 'tree' | 'furn' | 'shopdoor';

export function streetVerdure(plan: Omit<CityPaintPlan, 'rue'>, width: number): RueItem[] {
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
  // `wall` : élément posé contre la façade (parterre) ; les fosses, à la bordure, ne le gênent pas.
  const busy = (x0: number, x1: number, kinds: readonly Kind[], wall = false): boolean =>
    x0 < 0 ||
    x1 > width ||
    (kinds.includes('door') && doors.some((d) => x1 > d.x0 - 2 && x0 < d.x1 + 2)) ||
    (kinds.includes('lamp') && lamps.some((l) => x1 > l - 9 && x0 < l + 9)) ||
    (kinds.includes('tree') && plan.trees.some((t) => x1 > t.x - t.r - 6 && x0 < t.x + t.r + 6)) ||
    (kinds.includes('furn') && plan.furniture.some((f) => x1 > f.x - 3 && x0 < f.x + f.w + 3)) ||
    (kinds.includes('shopdoor') && shopDoors.some((d) => x1 > d.x0 && x0 < d.x1)) ||
    out.some((v) => 'x0' in v && !(wall && v.kind === 'pit') && x1 > v.x0 - 3 && x0 < v.x1 + 3);

  // 1. Alignement d'arbres en fosse à la bordure : autour de chaque pas, le centre libre le plus proche à ± PIT_SEARCH px
  // près, au pixel (gauche puis droite à distance égale ; la maquette n'essayait que 7 positions à ± 7 px, trop peu dans
  // une rue pleine d'entrées). Entrées et portes de local mesurées sur la grille réelle (± PIT_HALF) contre leur span
  // élargi de 4 px ; lampadaires et arbres du plan sur ± 6. Pas de règle du mobilier pour les fosses : bancs, boîtes aux
  // lettres, vélos et pigeons ont le pied entre ground et ground + 7 u, affiches au mur (paintFurniture), tous côté façade,
  // loin de la bordure où sont les fosses.
  // Scènes, passage piéton et arrêt de bus du trottoir des immeubles : emplacements fixes (même tirage que la fête et le
  // trafic), dessinés devant les arbres ; aucun fût ni houppier centré dans leur emprise.
  const fixtures = streetFixtures(width, seed, u);
  const clear: readonly { x: number; half: number }[] = [
    ...stageXs(width, seed).map((x) => ({ x, half: PIT_STAGE_CLEAR * u })),
    { x: fixtures.lightX, half: PIT_CROSSING_CLEAR * u },
    { x: fixtures.busStop.far, half: PIT_BUS_STOP_CLEAR * u },
  ];
  const pitBusy = (px: number): boolean =>
    clear.some((c) => Math.abs(px - c.x) < c.half + PIT_HALF) ||
    busy(px - 6, px + 6, ['lamp', 'tree']) ||
    busy(px - PIT_HALF, px + PIT_HALF, ['shopdoor']) ||
    doors.some((d) => px + PIT_HALF > d.x0 && px - PIT_HALF < d.x1) ||
    out.some((v) => v.kind === 'pit' && Math.abs(v.x - px) < PIT_MIN_GAP);
  const rng = fondRng(seed, 'rue-arbres');
  for (let x = 30 + rng() * 50; x < width - 20; x += PIT_STEP + rng() * PIT_STEP_SPREAD) {
    for (let k = 0; k <= 2 * PIT_SEARCH; k++) {
      const px = x + (k % 2 ? -1 : 1) * Math.ceil(k / 2);
      if (pitBusy(px)) continue;
      const roll = rng();
      const young = roll < 0.12;
      const empty = roll >= 0.12 && roll < 0.16;
      const species = SPECIES[Math.floor(rng() * SPECIES.length)]!;
      const h = (young ? 13 : 34 + rng() * 18) * u;
      const r = (young ? 4 + rng() * 1.5 : 16 + rng() * 8) * u;
      const lean = (rng() - 0.5) * 2;
      out.push({ kind: 'pit', x: px, x0: px - PIT_HALF, x1: px + PIT_HALF, y: curb - 1.4, empty, young, species, h, r, lean, flowers: !empty && rng() < 0.45, flowerSeed: rng() * 1000 });
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
      if (busy(bx, bx + w, ['door', 'furn', 'shopdoor'])) continue;
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
      full ? !busy(bx, bx + w, ['door', 'furn', 'tree'], true) : !busy(bx, bx + w, ['furn', 'tree'], true) && !doors.some((d) => bx + w > d.x0 && bx < d.x1);
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
