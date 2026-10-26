import { hashString, mulberry32 } from '../scene-world';
import { cellRng, type Box } from './brush';
import { INK, TAU, disc, fillRect, groundShadow, inkRect, light, shade } from './cel';
import { GROUND_FLOOR } from '../city/facades';
import { HILL_ROWS, LEFT_GAP, leftOf, type CityPaintPlan, type Furniture, type HillHouse, type Landmark, type Look, type PaintBuilding, type PaintPodium, type PlanDoor, type Tree } from './city-plan';
import { paintDayWindow, paintFacade } from './facade-painter';
import { paintParisRoof } from './roof-painter';
import { paintEntrance } from './shop/entrance';
import { hexRgb, rgba, type Rgb } from './color';
import { paintFarWall } from './hill-painter';
import { fondStates, fondTile, paintFond } from './fond-painter';
import { isTree, treeOfItem, type FondHouse } from './fond-plan';
import { DEFAULT_MOMENT, laundryK, shutterK, slotHours, type FondMoment } from './fond-time';
import type { PaintCtx } from './paint-ctx';
import type { RueItem } from './rue-verte-plan';
import { paintRueVerdure, rueMomentKey, rueSpan } from './rue-verte-painter';

// Peintre de la ville (vague Ghibli, décor cellulo) : une tranche de TILE px du monde, en coordonnées du monde (l'appelant
// décale le canvas). Aplats francs, un ton d'ombre à bord net, un rehaut, trait encré. Chaque immeuble, arbre et meuble a
// son propre générateur : peint depuis deux tranches, il est identique.
export const TILE = 360;
// À incrémenter à chaque changement du dessin : invalide le cache des tranches.
export const PAINT_VERSION = 16;

const LEAVES = ['#2A6A2E', '#52A23C', '#A8DC58'].map(hexRgb);
const BARK = hexRgb('#9A8468');
const SIDEWALK = hexRgb('#E6D4AE');
const COBBLE = hexRgb('#B49E7A');
const BENCH = hexRgb('#C48A54');
const MAILBOX = hexRgb('#F6C820');
const POSTERS = ['#E85A3A', '#3A7EC8', '#F0C030', '#8A58B8'].map(hexRgb);

export const tileCount = (width: number): number => Math.max(1, Math.ceil(width / TILE));
// Corniche du socle des jumeaux : débord de chaque côté, hauteur au-dessus de `p.top`, hauteur totale, ombre dessous.
export const CORNICE = { over: 1.5, up: 0.8, h: 3, drop: 2.5 } as const;

// `fondHouses` : maisons du fond vivant hors du plan de la colline (rang de crête, maisons de l'échappée) : la neige posée les couvre.
// `rue` : verdure de la rue principale dont le dessin touche la tranche (fosses, bacs, parterres, grimpantes, pots, herbe).
export type TileItems = { buildings: PaintBuilding[]; podiums: PaintPodium[]; trees: Tree[]; houses: HillHouse[]; landmarks: Landmark[]; furniture: Furniture[]; doors: PlanDoor[]; fondHouses: FondHouse[]; rue: RueItem[] };

export function tileItems(plan: CityPaintPlan, tile: number): TileItems {
  const x0 = tile * TILE - 2;
  const x1 = (tile + 1) * TILE + 2;
  return {
    buildings: plan.buildings.filter((b) => b.x < x1 && b.x + b.w > x0),
    // Le socle déborde de sa corniche de chaque côté.
    podiums: plan.podiums.filter((p) => p.x - CORNICE.over < x1 && p.x + p.w + CORNICE.over > x0),
    trees: plan.trees.filter((t) => t.x - t.r < x1 && t.x + t.r > x0),
    houses: plan.hill.houses.filter((h) => h.x - 2 < x1 && h.x + h.w + (h.trees ? h.trees.r * 2 : 0) + 2 > x0),
    landmarks: plan.hill.landmarks.filter((l) => l.x - 3 < x1 && l.x + l.w + 3 > x0),
    furniture: plan.furniture.filter((f) => f.x - 10 < x1 && f.x + f.w + 10 > x0),
    doors: plan.doors.filter((d) => d.cx - 13 * d.s < x1 && d.cx + 13 * d.s > x0),
    fondHouses: [...plan.fond.crestHouses, ...plan.fond.escapes.flatMap((e) => e.houses)].filter((h) => h.x - 2 < x1 && h.x + h.w + 2 > x0),
    rue: plan.rue.filter((v) => {
      const [a, b] = rueSpan(v);
      return a < x1 && b > x0;
    }),
  };
}

// Signature du fond vivant de la tranche : ce que le plan y pose (il dépend de toute la largeur : échappées par bande,
// comblement) ; deux plans de même signature peignent le même fond dans la tranche.
function fondSig(plan: CityPaintPlan, tile: number): number {
  const x0 = tile * TILE - 2;
  const x1 = (tile + 1) * TILE + 2;
  const parts: string[] = [];
  const box = (b: readonly number[] | undefined, k: string): void => {
    if (b && b[2]! >= x0 && b[0]! <= x1) parts.push(`${k}${b.map((v) => v.toFixed(1)).join(':')}`);
  };
  for (const list of [...plan.fond.rowVerdure, plan.fond.crestVerdure]) for (const v of list) box(v.b, v.kind);
  for (const e of plan.fond.escapes) if (e.span[1] >= x0 && e.span[0] <= x1) parts.push(`e${e.x.toFixed(1)}:${e.x1.toFixed(1)}`);
  for (const h of plan.fond.crestHouses) if (h.x + h.w + 2 >= x0 && h.x - 2 <= x1) parts.push(`c${h.x.toFixed(1)}`);
  for (const c of [...plan.fond.chapels, ...plan.fond.reservoirs]) if (c.x + 14 >= x0 && c.x - 10 <= x1) parts.push(`k${c.x.toFixed(1)}`);
  return hashString(parts.join(','));
}

// États lents du mur du fond dans la tranche (volets, linge) au début de la tranche de 10 min.
function farStates(plan: CityPaintPlan, buildings: readonly PaintBuilding[], D: FondMoment): string {
  const T = slotHours(D.minutes);
  const out: number[] = [];
  for (const b of buildings) {
    if (!b.far || !b.life) continue;
    if (b.look.shutters) for (const w of b.life.wins) out.push(Math.round(shutterK(T, D, w) * 20));
    if (b.life.laundryFloor !== null) out.push(Math.round(laundryK(T, D, String(Math.round(b.x * 8)), true, plan.seed) * 3));
  }
  return out.join('');
}

// Clé des états lents de la tranche (date, neige, poses de la tranche de 10 min, flaques et feuilles mortes de la rue) : elle
// ne change que si l'image change.
export function momentKey(plan: CityPaintPlan, tile: number, D: FondMoment): string {
  const x0 = tile * TILE;
  const x1 = Math.min(plan.width, (tile + 1) * TILE);
  const it = tileItems(plan, tile);
  const states = fondStates(plan, x0, x1, D) + '/' + farStates(plan, it.buildings, D);
  return `${D.date}|${D.meteo.snow ? 'neige' : ''}|${hashString(states).toString(36)}|${rueMomentKey(plan, it.rue, D, x0, x1)}`;
}

// `moment` : instant du fond vivant (date, météo, heure) ; sans lui, la clé ne porte que le dessin du plan (neige posée).
export function tileKey(plan: CityPaintPlan, tile: number, moment?: FondMoment): string {
  const it = tileItems(plan, tile);
  return [
    PAINT_VERSION,
    plan.seed,
    plan.height,
    tile,
    Math.min(TILE, plan.width - tile * TILE),
    // Sans l'id : celui d'un immeuble du fond (index dans les façades) change quand la pièce grandit.
    // Travées de la mise en page et fenêtres du socle : elles suivent la partie visible et la porte d'un lot coupé au bord.
    it.buildings.map((b) => `${b.far ? `f${b.top.toFixed(1)}` : ''}@${b.x.toFixed(1)}${b.layout ? `:${b.layout.bays.map((c) => c.toFixed(1)).join(';')}` : ''}`).join(','),
    it.podiums.map((p) => `${p.x.toFixed(1)}:${p.wins.map((w) => w.x.toFixed(1)).join(';')}`).join(','),
    it.trees.map((t) => `${t.x.toFixed(1)}:${t.r.toFixed(1)}`).join(','),
    it.houses.map((h) => `${h.row}${h.x.toFixed(1)}`).join(','),
    it.landmarks.map((l) => `${l.kind}${l.x.toFixed(1)}`).join(','),
    it.furniture.map((f) => `${f.kind}${f.x.toFixed(1)}`).join(','),
    it.doors.map((d) => `${d.variant}${d.x.toFixed(1)}`).join(','),
    hashString(JSON.stringify(it.rue)).toString(36),
    fondSig(plan, tile).toString(36),
    ...(moment ? [momentKey(plan, tile, moment)] : []),
  ].join('|');
}

const rngOf = (plan: CityPaintPlan, salt: string, x: number) => mulberry32(plan.seed ^ hashString(salt) ^ Math.round(x * 8));

// Immeuble : le fond garde son peintre (hill-painter) ; le premier plan est peint d'après sa mise en page, façade puis toit.
export function paintBuilding(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding, moment: FondMoment = DEFAULT_MOMENT): void {
  if (b.far) return paintFarWall(ctx, plan, b, leftOf(plan, b), moment);
  paintFacade(ctx, plan, b);
  paintParisRoof(ctx, plan, b);
}

function paintStreet(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number): void {
  const u = plan.unit;
  const { ground, curb, farSide, height } = plan;
  const a = x0 - 8;
  const w = x1 - x0 + 16;
  // Trottoir : aplat, joints de dalles (grille globale), bordure rehaut / ombre / trait.
  fillRect(ctx, SIDEWALK, a, ground, w, curb - ground);
  ctx.strokeStyle = rgba(shade(SIDEWALK, 0.25), 1);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  const slab = 17 * u;
  for (let j = Math.floor(a / slab); j * slab < a + w; j++) {
    ctx.moveTo(j * slab, ground);
    ctx.lineTo(j * slab, curb);
  }
  ctx.stroke();
  fillRect(ctx, light(SIDEWALK, 0.5), a, curb - 2.4 * u, w, 1.2 * u);
  fillRect(ctx, shade(SIDEWALK, 0.5), a, curb - 1.2 * u, w, 1.4 * u);
  fillRect(ctx, INK, a, curb - 0.4, w, 0.7);
  // Chaussée : pavés en aplats, trois tons, grille globale (tirage par case : raccord des tranches).
  const tones = [COBBLE, shade(COBBLE, 0.18), light(COBBLE, 0.18)];
  fillRect(ctx, shade(COBBLE, 0.45), a, curb, w, farSide - curb);
  let y = curb + 0.4;
  for (let k = 0; y < farSide; k++) {
    const rh = (2.2 + k * 0.12) * u;
    const cw = rh * 2.1;
    const off = ((k * 7) % 5) * cw * 0.2;
    const j0 = Math.floor((a - off) / cw) - 1;
    const j1 = Math.ceil((a + w - off) / cw) + 1;
    for (let j = j0; j <= j1; j++) {
      const r = cellRng(plan.seed, 'cobble', k, j);
      const cx = off + j * cw + cw / 2;
      const cy = y + rh / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw / 2 - 0.4, rh / 2 - 0.3, 0, 0, TAU);
      ctx.fillStyle = rgba(tones[Math.floor(r() * 3)]!, 1);
      ctx.fill();
    }
    y += rh + 0.4;
  }
  // Ombre nette du trottoir sur la chaussée, bandes d'usure, marquage de voie.
  fillRect(ctx, 'rgba(50,40,90,0.3)', a, curb, w, 2.2);
  for (const ly of [curb + (farSide - curb) * 0.4, curb + (farSide - curb) * 0.9]) fillRect(ctx, 'rgba(50,40,60,0.12)', a, ly - 5 * u, w, 10 * u);
  const period = 26 * u;
  ctx.fillStyle = '#F6F0DC';
  for (let j = Math.floor(a / period); j * period < a + w; j++) ctx.fillRect(j * period, plan.laneMark - 0.8 * u, 14 * u, 1.6 * u);
  // Plaque d'égout et grille d'avaloir : une par bande de 400 px, tirées par case.
  const band = 400;
  for (let i = Math.floor(a / band) - 1; i * band < a + w; i++) {
    const r = cellRng(plan.seed, 'ghibli-drain', i, 0);
    const mx = i * band + 40 + r() * (band - 80);
    const my = curb + (farSide - curb) * (0.25 + r() * 0.5);
    ctx.fillStyle = '#3A3430';
    ctx.beginPath();
    ctx.ellipse(mx, my, 5 * u, 2.4 * u, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#8A8070';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(mx, my, 3.6 * u, 1.6 * u, 0, 0, TAU);
    ctx.stroke();
    const gx = i * band + 60 + r() * (band - 120);
    fillRect(ctx, '#2A2420', gx, curb + 1, 8 * u, 2.4 * u);
    ctx.fillStyle = '#8A8070';
    for (let k = 0; k < 4; k++) ctx.fillRect(gx + (1 + k * 2) * u, curb + 1.3, 0.6 * u, 1.8 * u);
  }
  // Trottoir d'en face.
  fillRect(ctx, shade(SIDEWALK, 0.12), a, farSide, w, height - farSide);
  fillRect(ctx, INK, a, farSide, w, 0.8);
  fillRect(ctx, 'rgba(50,40,90,0.3)', a, farSide + 0.8, w, 1.6);
}

function paintFurniture(ctx: PaintCtx, plan: CityPaintPlan, f: Furniture): void {
  const u = plan.unit;
  const { ground } = plan;
  const { x, w } = f;
  if (f.kind === 'bench') {
    const y = ground + 7 * u;
    groundShadow(ctx, x, y, 8 * u, w, 0.22);
    fillRect(ctx, '#3A3A4A', x + 1 * u, y - 7 * u, 1.2 * u, 5 * u);
    fillRect(ctx, '#3A3A4A', x + 14 * u, y - 7 * u, 1.2 * u, 5 * u);
    fillRect(ctx, BENCH, x, y - 13 * u, w, 5.6 * u);
    fillRect(ctx, shade(BENCH, 0.35), x, y - 11.2 * u, w, 0.8 * u);
    fillRect(ctx, shade(BENCH, 0.35), x, y - 9.4 * u, w, 0.8 * u);
    fillRect(ctx, shade(BENCH, 0.35), x + 11 * u, y - 13 * u, 5 * u, 5.6 * u);
    inkRect(ctx, x, y - 13 * u, w, 5.6 * u, 0.6);
    return;
  }
  if (f.kind === 'mailbox') {
    const y = ground + 4 * u;
    groundShadow(ctx, x, y, 10 * u, w, 0.22);
    fillRect(ctx, MAILBOX, x, y - 12 * u, w, 8 * u);
    fillRect(ctx, shade(MAILBOX, 0.35), x + 4 * u, y - 12 * u, 2 * u, 8 * u);
    fillRect(ctx, '#3A3A4A', x + 1.5 * u, y - 4 * u, 3 * u, 2.5 * u);
    fillRect(ctx, INK, x + 1 * u, y - 10 * u, 3.2 * u, 0.8 * u);
    inkRect(ctx, x, y - 12 * u, w, 8 * u, 0.6);
    return;
  }
  if (f.kind === 'bike') {
    const y = ground + 4 * u;
    const bx = x + 3 * u;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(bx, y - 3 * u, 3 * u, 0, TAU);
    ctx.moveTo(bx + 13 * u, y - 3 * u);
    ctx.arc(bx + 10 * u, y - 3 * u, 3 * u, 0, TAU);
    ctx.moveTo(bx, y - 3 * u);
    ctx.lineTo(bx + 4 * u, y - 8 * u);
    ctx.lineTo(bx + 8 * u, y - 8 * u);
    ctx.lineTo(bx + 10 * u, y - 3 * u);
    ctx.moveTo(bx + 4 * u, y - 8 * u);
    ctx.lineTo(bx + 5 * u, y - 3 * u);
    ctx.lineTo(bx + 8 * u, y - 8 * u);
    ctx.stroke();
    fillRect(ctx, f.tone < 0.5 ? '#D84A3A' : '#3A7EC8', bx + 3 * u, y - 9.2 * u, 2.6 * u, 1.2 * u);
    return;
  }
  if (f.kind === 'poster') {
    const y = ground - 22 * u;
    const c = POSTERS[Math.floor(f.tone * POSTERS.length)]!;
    fillRect(ctx, c, x, y, w, 11 * u);
    inkRect(ctx, x, y, w, 11 * u, 0.5);
    fillRect(ctx, '#FFFFFF', x + 1.5 * u, y + 2 * u, 5 * u, 1.2 * u);
    fillRect(ctx, '#FFFFFF', x + 1.5 * u, y + 4.5 * u, 5 * u, 1.2 * u);
    fillRect(ctx, '#FFFFFF', x + 2 * u, y + 7 * u, 4 * u, 2.4 * u);
    return;
  }
  // Pigeon sur le trottoir.
  const y = ground + 2.5 * u + f.tone * 4 * u;
  ctx.fillStyle = f.tone < 0.5 ? '#8A8AA0' : '#A89AA0';
  ctx.beginPath();
  ctx.ellipse(x + 2 * u, y, 1.9 * u, 1.2 * u, 0, 0, TAU);
  ctx.fill();
  disc(ctx, '#5A5A74', x + 3.7 * u, y - 1 * u, 0.8 * u);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.ellipse(x + 2 * u, y, 1.9 * u, 1.2 * u, 0, 0, TAU);
  ctx.stroke();
}

// Le socle tient lieu d'immeuble pour le peintre des fenêtres (mur = sa pierre, logements de son étage, sans mise en page de
// façade : ni volets ni jardinières) ; l'allure ne sert pas.
function podiumHost(p: PaintPodium): PaintBuilding {
  const look: Look = { wall: p.stone, roof: p.stone, roofKind: 'zinc', roofH: 0, shutters: null, boxes: false, balconyRow: null, ivy: null, chimney: null, antenna: false, pipe: false, laundry: false };
  return { id: p.id, x: p.x, w: p.w, top: p.top, far: false, wins: p.wins, lit: [], look, podiumTop: null, layout: null, homes: p.layout?.homes ?? [] };
}

// Socle commun des jumeaux (maquette batiments-larges/rue.html) : pierre de taille claire d'un seul tenant sous les deux
// tours, assises fines, corniche saillante à `p.top` (rehaut dessus, ombre nette dessous), rangée de fenêtres de l'étage
// peintes comme celles des façades (encadrement, vitre de jour, rideaux du logement, appui), bandeau au-dessus du
// rez-de-chaussée (les locaux et entrées sont peints par-dessus).
export function paintPodium(ctx: PaintCtx, plan: CityPaintPlan, p: PaintPodium): void {
  const { x, w, top, stone } = p;
  const { ground } = plan;
  const h = ground - top;
  fillRect(ctx, stone, x, top, w, h);
  fillRect(ctx, shade(stone, 0.28), x + w * 0.72, top, w * 0.28, h);
  fillRect(ctx, light(stone, 0.45), x, top, 1.6, h);
  fillRect(ctx, shade(stone, 0.18), x, ground - 3, w, 3);
  // Assises de pierre de taille, de la corniche au bandeau du rez-de-chaussée.
  const band = ground - GROUND_FLOOR - 1;
  ctx.strokeStyle = rgba(shade(stone, 0.24), 0.9);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let y = top + CORNICE.h + 3; y < band - 1; y += 4.5) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
  }
  ctx.stroke();
  fillRect(ctx, shade(stone, 0.3), x, band, w, 1);
  inkRect(ctx, x, top, w, h, 0.9);
  // Ombre nette de la corniche, puis les fenêtres de l'étage (celles de la mise en page du socle).
  fillRect(ctx, shade(stone, 0.42), x, top + CORNICE.h - CORNICE.up, w, CORNICE.drop);
  if (p.layout) {
    const host = podiumHost(p);
    for (const win of p.layout.windows) paintDayWindow(ctx, host, win);
  }
  // Corniche en débord : rehaut dessus, face à l'ombre légère, trait.
  const cx = x - CORNICE.over;
  const cw = w + 2 * CORNICE.over;
  const cy = top - CORNICE.up;
  fillRect(ctx, light(stone, 0.5), cx, cy, cw, CORNICE.h);
  fillRect(ctx, shade(stone, 0.22), cx, cy + CORNICE.h - 1, cw, 1);
  fillRect(ctx, shade(stone, 0.42), cx + cw * 0.72, cy + 1.4, cw * 0.28, CORNICE.h - 1.4);
  inkRect(ctx, cx, cy, cw, CORNICE.h, 0.7);
}

// Partie de la tranche à peindre (PR 3b, colline au vent : les houppiers de la colline sont peints à part pour bouger au vent,
// le reste est figé dans la tranche) :
// - 'all' : la tranche complète, flux d'appels identique à celui d'avant la PR (mouvement réduit, graphisme classique) ;
// - 'base' : tout, sauf le houppier (feuilles sèches, masses, rehauts, neige du feuillage) des arbres des trois groupes de la
//   colline (fûts, charpentières, rameaux et gui restent : ils ne bougent pas) ;
// - { canopy: g } : le houppier des arbres du groupe g seul (ni sol, ni maisons, ni ville) ;
// - { after: g } : ce que 'base' peint APRÈS le dernier élément (arbre ou autre) de la liste du groupe g, dans l'ordre de 'all'
//   (maisons et rangs suivants, mur du fond, immeubles, rue, verdure de la rue) : l'écran qui recouvre le feuillage de g (seul
//   l'alpha sert). Limite acceptée : dans un même groupe, un feuillage passe devant les fûts et petits éléments peints après
//   lui dans la liste (2 px d'écart au plus avec l'ordre exact).
// Groupes : 0 = arbres de la crête, 1 = arbres du rang de verdure 0, 2 = arbres du rang 1 et des échappées. Les arbres de
// jardin des maisons (bouquets) sont peints avec leur maison : ils ne bougent pas.
export type HillPart = 'all' | 'base' | { canopy: 0 | 1 | 2 } | { after: 0 | 1 | 2 };

// Boîte monde (px CSS) des houppiers du groupe `group` dont le dessin touche la tranche : touffes pleines (lobes, rehauts,
// neige, feuilles sèches : r × 1,4 + 1,6 autour de chaque touffe, la marge de la boîte du modèle), élargie de 3 px de chaque
// côté et de 2 px en haut et en bas, rognée à la tranche en x ; null si le groupe n'a aucun arbre (à touffes) dans la tranche.
// Indépendante du jour : un arbre nu l'hiver garde sa boîte (son flux { canopy } est alors vide).
export function hillCanopyBox(plan: CityPaintPlan, tile: number, group: 0 | 1 | 2): { x: number; y: number; w: number; h: number } | null {
  const tx0 = tile * TILE;
  const tx1 = Math.min(plan.width, (tile + 1) * TILE);
  const it = fondTile(plan, tx0, tx1);
  const list = group === 0 ? it.crest : group === 1 ? it.rows[0] : [...it.rows[1], ...it.escapes.flatMap((e) => e.verdure)];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const v of list) {
    if (!isTree(v)) continue;
    const tree = treeOfItem(v);
    if (!tree) continue;
    for (const tf of tree.m.tufts) {
      const r = tf.rr * 1.4 + 1.6;
      x0 = Math.min(x0, tf.x - r);
      x1 = Math.max(x1, tf.x + r);
      y0 = Math.min(y0, tf.y - r);
      y1 = Math.max(y1, tf.y + r);
    }
  }
  if (x0 > x1) return null;
  const a = Math.max(tx0, x0 - 3);
  const b = Math.min(tx1, x1 + 3);
  if (b <= a) return null;
  return { x: a, y: y0 - 2, w: b - a, h: y1 - y0 + 4 };
}

// `moment` : date, météo et heure du fond vivant (poses lentes lues au début de la tranche de 10 min) ; `part` : voir HillPart.
export function paintCityTile(ctx: PaintCtx, plan: CityPaintPlan, tile: number, moment: FondMoment = DEFAULT_MOMENT, part: HillPart = 'all'): void {
  const it = tileItems(plan, tile);
  const x0 = tile * TILE;
  const x1 = Math.min(plan.width, (tile + 1) * TILE);
  paintFond(ctx, plan, x0, x1, moment, it.landmarks, part);
  // Houppiers seuls : rien de la ville.
  if (typeof part === 'object' && 'canopy' in part) return;
  for (const b of it.buildings) if (b.far) paintBuilding(ctx, plan, b, moment);
  for (const b of it.buildings) if (!b.far) paintBuilding(ctx, plan, b);
  for (const p of it.podiums) paintPodium(ctx, plan, p);
  paintStreet(ctx, plan, x0, x1);
  // Entrées d'immeuble (G4a) : en pierre, sur le trottoir, avant les arbres.
  for (const d of it.doors) paintEntrance(ctx, d.cx, d.base, d.s, d.variant, plan.seed ^ Math.round(d.x * 8));
  // Plus d'ancien platane peint dans la tranche (2026-10-24, demande de l'utilisateur : il ne ressemblait pas aux arbres de
  // la rue) : `plan.trees` reste dans le plan (tirages inchangés) mais n'est plus dessiné ; les fosses peuvent s'y planter.
  for (const f of it.furniture) paintFurniture(ctx, plan, f);
  // Verdure de la rue (PR 3) : par-dessus le premier plan ; ses arbres sont dans le calque animé au-dessus des tranches.
  paintRueVerdure(ctx, plan, it.rue, moment, x0, x1);
}

export type { Box };
// Voisin de gauche : défini dans city-plan.ts (partagé avec le peintre des façades).
export { LEFT_GAP, leftOf };
