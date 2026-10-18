import { PODIUM_H, citySkyline, hashString, mulberry32, type Lamp, type Podium } from '../scene-world';
import { BUILDING_STRETCH, DOOR_WIDTH, GROUND_FLOOR, cityMetrics } from './metrics';
import { frontLots } from './lots';
import { shopSlotsFor } from './shops/slots';

// Mise en page des façades parisiennes (port de docs/superpowers/maquettes/facades-parisiennes/maquette.html, avec les
// écarts de la spec §5.1) : type d'immeuble, toit, travées à l'aplomb de la porte, étages, fenêtres, logements, cage
// d'escalier, lucarnes, cheminées. Pure et déterministe : un générateur par immeuble, tiré du x du lot entier.

export type WindowKind = 'std' | 'french' | 'top' | 'stair' | 'mezz' | 'dormer';
// Fenêtre d'immeuble : `Lamp` (x, y = coin haut gauche ; u = seuil du logement ; blue = télé de la pièce principale) + taille.
// home : index dans les logements de la façade (−1 : cage, entresol) ; key : clé stable du logement (−1 sinon) ;
// main : pièce principale du logement ; box : jardinière (faubourg) ; level : index dans `levels` (−1 : lucarne).
export type FacadeWindow = Lamp & { w: number; h: number; kind: WindowKind; level: number; bay: number; home: number; key: number; main: boolean; box: boolean };
export type HomeTone = 'warm' | 'cream' | 'orange' | 'tv';
// level : index dans `levels` (−1 : lucarne) ; props : un par travée de `bays` ; main : travée (élément de `bays`) de la pièce principale.
export type Home = { key: number; level: number; bays: number[]; u: number; tone: HomeTone; curtain: { color: string; style: 'side' | 'voile' } | null; props: ('lamp' | 'plant' | 'shelf' | null)[]; main: number };
export type Level = { y: number; h: number; level: 'mezz' | 'noble' | 'std' | 'top'; balcony: 'filant' | 'balconnet' | 'none' };
export type Roof = { kind: 'mansard'; h: number; terrasson: 4; zinc: string } | { kind: 'zinc'; h: 11; zinc: string } | { kind: 'tile'; h: 12; tile: string };
// Boîte de la lucarne (coin haut gauche) ; fronton et capucine : cadre (la vitre est la fenêtre `dormer`) ; œil-de-bœuf : disque cerclé.
export type Dormer = { type: 'fronton-tri' | 'fronton-cintre' | 'oeil' | 'capucine' | 'tabatiere'; bay: number; cx: number; y: number; w: number; h: number };
// Souche : [top, base] ; pots au-dessus, de top − 2,3 à top (toujours ≥ haut de l'immeuble).
export type Chimney = { x: number; top: number; base: number };
export type FacadeInput = { x: number; w: number; h: number; base: number; span: { x0: number; x1: number }; doorCx: number | null; podium: boolean };
export type FacadeLayout = {
  x: number; w: number; top: number; eave: number; base: number; kind: 'haussmann' | 'faubourg'; roof: Roof; bays: number[]; winW: number;
  doorCx: number | null; doorBay: number | null; stairBay: number | null; levels: Level[]; windows: FacadeWindow[]; homes: Home[];
  dormers: Dormer[]; chimneys: Chimney[]; wall: string; shutters: string | null; stairFloors: number;
};
export type PodiumLayout = { bays: number[]; windows: FacadeWindow[]; homes: Home[] };

// Seuils ramenés aux gabarits du moteur (spec §5.1 : la maquette, w ≥ 56 et h ≥ 120 à 78 %, donnait ≈ 10 % d'haussmanniens).
// Avec ces valeurs, 70 à 80 % des immeubles du premier plan sont haussmanniens (graines 1 à 20, test de proportion).
export const HAUSSMANN = { minW: 26, minH: 80, p: 0.85 };
// Entresol (11 px, jamais allumé) au-dessus des boutiques des plus hauts haussmanniens sans socle.
export const ENTRESOL = { minH: 130, p: 0.6, h: 11 } as const;
// Étage jamais plus bas (lisible au téléphone).
export const MIN_FLOOR = 10;
// Centre des travées de bord : à 10 px des bords (l'entrée des habitants est centrée à 10 px du bord de son lot).
const EDGE = 10;
// Partie visible minimale d'un immeuble pour recevoir une mise en page (lot coupé au bord du monde).
const MIN_SPAN = 12;
// Tour de jumeaux la plus étroite : en deçà (tour coupée au bord du monde), la porte du socle n'est pas à son aplomb.
const MIN_DOOR_SPAN = 26;

const STONES = ['#EDE2C8', '#E8DCC0', '#F0E6D0', '#E4D6BA', '#EAD5B0', '#F2E8D4'];
const PLASTERS = ['#F6E2B4', '#EEC79A', '#CFE0B8', '#E0C8A0', '#F4D89C', '#E6BCD0'];
const ZINCS = ['#8290A2', '#98A4B4', '#7A8AA0'];
const TILES = ['#C86A40', '#B4523A'];
const SHUTTERS = ['#8FA88C', '#6A7A9A', '#B8705A', '#7A8A6A'];
const CURTAINS = ['#F4E6D0', '#C85A3A', '#5A7AA8', '#E8C890', '#8A5A8E'];

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const half = (v: number): number => Math.round(v * 2) / 2;

// Logements d'un étage : travées voisines par 2 ou 3 (2→[2], 3→[3], 4→[2,2], 5→[2,3] ou [3,2]).
export function splitBays(bays: readonly number[], rng: () => number): number[][] {
  const n = bays.length;
  if (n <= 3) return [bays.slice()];
  if (n === 4) return [bays.slice(0, 2), bays.slice(2)];
  return rng() < 0.5 ? [bays.slice(0, 2), bays.slice(2)] : [bays.slice(0, 3), bays.slice(3)];
}

// Centres des travées sur [x0, x1] : 2 à 5, travées de bord à 10 px des bords (sur la porte quand elle est à ce bord),
// les autres au pas régulier. Partie visible étroite (lot coupé, sans porte) : marges ramenées à un quart de la largeur
// (avec une porte, la partie visible fait au moins MIN_DOOR_SPAN px et la marge reste 10 px, comme celle de la porte).
function baysOn(x0: number, x1: number, doorCx: number | null, pitchTarget: number): { bays: number[]; winW: number } {
  const ws = x1 - x0;
  const n = clamp(Math.round((ws - 6) / pitchTarget), 2, 5);
  const edge = doorCx !== null ? EDGE : Math.min(EDGE, ws / 4);
  const doorLeft = doorCx !== null && doorCx < (x0 + x1) / 2;
  const c0 = doorCx !== null && doorLeft ? doorCx : x0 + edge;
  const c1 = doorCx !== null && !doorLeft ? doorCx : x1 - edge;
  const step = (c1 - c0) / (n - 1);
  const bays = Array.from({ length: n }, (_, i) => (i === 0 ? c0 : i === n - 1 ? c1 : c0 + step * i));
  const winW = Math.max(3.5, Math.min(clamp(half((ws / n) * 0.42), 5, 8), step - 3));
  return { bays, winW };
}

// Contour du toit (seule source pour le peintre et la neige).
function outlineOf(roof: Roof, x: number, w: number, top: number, eave: number): [number, number][] {
  if (roof.kind === 'mansard') return [[x - 1.5, eave], [x + 2.5, top + 4], [x + 5, top + 0.5], [x + w - 5, top + 0.5], [x + w - 2.5, top + 4], [x + w + 1.5, eave]];
  return [[x - 2, eave], [x + 0.42 * w, top + 0.5], [x + w + 2, eave]];
}

export function roofOutline(l: FacadeLayout): [number, number][] {
  return outlineOf(l.roof, l.x, l.w, l.top, l.eave);
}

// Hauteur du contour en x (interpolation sur la ligne brisée, bornée à ses extrémités).
function heightOn(outline: readonly [number, number][], x: number): number {
  if (x <= outline[0]![0]) return outline[0]![1];
  for (let i = 1; i < outline.length; i++) {
    const [x1, y1] = outline[i]!;
    const [x0, y0] = outline[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return outline.at(-1)![1];
}

// Lucarnes : jamais une par travée, type selon le toit, jamais une rangée identique (règles de la maquette).
// Mansarde : fronton (type principal de l'immeuble) sur 50 % des travées, œil-de-bœuf sur 20 %, au-dessus de la cage rien
// ou un œil-de-bœuf, au moins un fronton, tabatière sur le terrasson (50 %). Toit simple : une capucine au plus, près du
// faîtage, posée sur le versant ; une tabatière ailleurs (60 %).
export function dormersFor(roof: Roof, bays: readonly number[], stairBay: number | null, winW: number, top: number, outline: readonly [number, number][], rng: () => number): Dormer[] {
  const n = bays.length;
  const eave = top + roof.h;
  const out: Dormer[] = [];
  if (roof.kind === 'mansard') {
    const main = rng() < 0.6 ? 'fronton-tri' : 'fronton-cintre';
    const brisisTop = top + roof.terrasson;
    const brisis = roof.h - roof.terrasson;
    const fronton = (i: number): Dormer => ({ type: main, bay: i, cx: bays[i]!, y: brisisTop + 2, w: winW + 1, h: brisis - 3 });
    // Œil-de-bœuf : disque de rayon 2,6 cerclé (3,6 hors tout), centré à mi-brisis.
    const oeil = (i: number): Dormer => ({ type: 'oeil', bay: i, cx: bays[i]!, y: brisisTop + brisis * 0.5 - 3.6, w: 7.2, h: 7.2 });
    for (let i = 0; i < n; i++) {
      if (i === stairBay) {
        if (rng() < 0.5) out.push(oeil(i));
        continue;
      }
      const r = rng();
      if (r < 0.5) out.push(fronton(i));
      else if (r < 0.7) out.push(oeil(i));
    }
    if (!out.some((d) => d.type !== 'oeil')) {
      // Au moins un fronton, sur la travée habitable du milieu (remplace l'œil-de-bœuf qui y serait).
      const live = bays.map((_, i) => i).filter((i) => i !== stairBay);
      const i = live[Math.floor(live.length / 2)]!;
      const at = out.findIndex((d) => d.bay === i);
      if (at >= 0) out.splice(at, 1);
      out.push(fronton(i));
      out.sort((a, b) => a.bay - b.bay);
    }
    if (new Set(out.map((d) => d.bay)).size === n) {
      // Jamais une par travée : on retire celle d'une travée tirée, sauf le seul fronton.
      const frontons = out.filter((d) => d.type !== 'oeil');
      const cands = out.filter((d) => d.type === 'oeil' || frontons.length > 1);
      out.splice(out.indexOf(cands[Math.floor(rng() * cands.length)]!), 1);
    }
    if (rng() < 0.5) {
      const i = Math.floor(rng() * n);
      out.push({ type: 'tabatiere', bay: i, cx: bays[i]! + 3, y: top + 1, w: 5, h: 2.6 });
    }
  } else {
    const mid = clamp(Math.round(0.42 * n - 0.5), 0, n - 1);
    const i = clamp(mid + (rng() < 0.5 ? 0 : 1), 0, n - 1);
    if (rng() < 0.7) {
      const cx = bays[i]!;
      // Le haut dépasse le versant d'1 px ; posée assez bas pour garder 5 px sous l'égout.
      const y = Math.min(Math.max(top + 3, heightOn(outline, cx) - 1), eave - 6);
      out.push({ type: 'capucine', bay: i, cx, y, w: winW - 1, h: Math.max(5, Math.min(roof.h - 5, eave - y - 1)) });
    }
    if (rng() < 0.6) {
      const j = (i + 1 + Math.floor(rng() * (n - 1))) % n;
      // Posée sur le versant (la maquette la mettait à top + 2, en l'air loin du faîtage).
      const y = Math.min(Math.max(top + 2, heightOn(outline, bays[j]!) + 1), eave - 3.6);
      out.push({ type: 'tabatiere', bay: j, cx: bays[j]!, y, w: 5, h: 2.6 });
    }
  }
  return out;
}

type Draw = () => number;

// Tirages d'un logement (ordre de la maquette : teinte, seuil, rideaux, objets) puis de sa pièce principale.
function drawHome(rng: Draw, key: number, level: number, bays: number[]): Home {
  const r = rng();
  const u = rng();
  const tone: HomeTone = r < 0.12 ? 'tv' : r < 0.5 ? 'warm' : r < 0.78 ? 'cream' : 'orange';
  const curtain = rng() < 0.75 ? { color: pick(CURTAINS, rng), style: (rng() < 0.4 ? 'voile' : 'side') as 'voile' | 'side' } : null;
  const props = bays.map(() => (rng() < 0.45 ? pick(['lamp', 'plant', 'shelf', 'lamp'] as const, rng) : null));
  const main = bays[Math.floor(rng() * bays.length)]!;
  return { key, level, bays, u, tone, curtain, props, main };
}

// Fenêtre allumable d'un logement (seuil, clé, pièce principale, télé).
function homeWindow(rect: { x: number; y: number; w: number; h: number }, kind: WindowKind, level: number, bay: number, home: Home, index: number): FacadeWindow {
  const main = home.main === bay;
  return { ...rect, kind, level, bay, home: index, key: home.key, u: home.u, main, blue: main && home.tone === 'tv', box: false };
}

export function facadeLayout(b: FacadeInput, ground: number, seed: number): FacadeLayout {
  const x8 = Math.round(b.x * 8);
  const rng = mulberry32(seed ^ hashString('facade') ^ x8);
  const kind = b.w >= HAUSSMANN.minW && b.h >= HAUSSMANN.minH && rng() < HAUSSMANN.p ? 'haussmann' : 'faubourg';
  const top = ground - b.h;
  // Toit : mansarde zinc (brisis + terrasson) pour l'haussmannien ; zinc ou tuile à faible pente pour le faubourg.
  const roof: Roof = kind === 'haussmann'
    ? { kind: 'mansard', h: clamp(Math.round(b.h * 0.12), 14, 20), zinc: pick(ZINCS, rng), terrasson: 4 }
    : rng() < 0.55 ? { kind: 'zinc', h: 11, zinc: pick(ZINCS, rng) } : { kind: 'tile', h: 12, tile: pick(TILES, rng) };
  const eave = top + roof.h;
  const { bays, winW } = baysOn(b.span.x0, b.span.x1, b.doorCx, kind === 'haussmann' ? 17 : 15);
  const nBays = bays.length;
  const entresol = kind === 'haussmann' && !b.podium && b.h >= ENTRESOL.minH && rng() < ENTRESOL.p ? ENTRESOL.h : 0;
  // Étages : hauteur propre à l'immeuble ; étage noble ×1,25, dernier étage ×0,85 ; jamais sous MIN_FLOOR.
  const avail = b.base - eave - entresol;
  let n = avail < 2 * MIN_FLOOR ? 1 : clamp(Math.round(avail / (kind === 'haussmann' ? 17 : 14.5)), 1, 7);
  let floors: number[];
  for (;;) {
    const weights = Array.from({ length: n }, (_, i) => (kind === 'haussmann' && n >= 3 && i === 0 ? 1.25 : n >= 3 && i === n - 1 ? 0.85 : 1));
    const sum = weights.reduce((a, v) => a + v, 0);
    floors = weights.map((wgt) => (avail * wgt) / sum);
    if (Math.min(...floors) >= MIN_FLOOR || n === 1) break;
    n--;
  }
  const floorsBottom = b.base - entresol;
  let y = floorsBottom;
  const levels: Level[] = floors.map((fh, i) => {
    y -= fh;
    const level = kind === 'haussmann' && n >= 3 && i === 0 ? 'noble' : i === n - 1 && n >= 3 ? 'top' : 'std';
    const balcony = level === 'noble' ? 'filant' : level === 'top' && kind === 'haussmann' && n >= 4 ? 'filant' : kind === 'haussmann' && rng() < 0.6 ? 'balconnet' : 'none';
    return { y, h: fh, level, balcony };
  });
  if (entresol) levels.unshift({ y: floorsBottom, h: entresol, level: 'mezz', balcony: 'none' });
  // Porte de l'immeuble (travée de bord, à son aplomb) et cage d'escalier au-dessus ; lot trop coupé : ni l'une ni l'autre.
  const doorBay = b.doorCx === null ? null : bays.indexOf(b.doorCx);
  const stairBay = doorBay !== null && nBays >= 3 && rng() < 0.65 ? doorBay : null;
  const shutters = kind === 'faubourg' ? pick(SHUTTERS, rng) : null;

  // Logements : par étage (hors entresol), les travées hors cage en groupes de 2 ou 3, allumés ensemble.
  const homes: Home[] = [];
  const liveBays = bays.map((_, i) => i).filter((i) => i !== stairBay);
  levels.forEach((lv, li) => {
    if (lv.level === 'mezz') return;
    for (const g of splitBays(liveBays, rng)) homes.push(drawHome(rng, hashString(`${x8}:${li}:${g[0]}`), li, g));
  });
  const homeOf = new Map<string, number>();
  homes.forEach((h, i) => h.bays.forEach((bay) => homeOf.set(`${h.level}:${bay}`, i)));

  // Fenêtres par étage et par travée.
  const windows: FacadeWindow[] = [];
  levels.forEach((lv, li) => {
    for (let i = 0; i < nBays; i++) {
      const cx = bays[i]!;
      if (i === stairBay && lv.level !== 'mezz') {
        // Cage : petite fenêtre à mi-étage (palier intermédiaire), jamais allumée par la courbe des logements.
        const sw = Math.max(3, winW - 2.5);
        const sh = clamp(lv.h * 0.4, 4, 7);
        windows.push({ x: cx - sw / 2, y: lv.y + lv.h * 0.78 - sh / 2, w: sw, h: sh, kind: 'stair', level: li, bay: i, home: -1, key: -1, u: 1, blue: false, main: false, box: false });
        continue;
      }
      const french = lv.level === 'noble' || lv.balcony === 'filant';
      const wh = lv.level === 'mezz' ? clamp(lv.h * 0.5, 4, 6) : french ? lv.h * 0.72 : lv.level === 'top' ? lv.h * 0.56 : lv.h * 0.62;
      const wy = french ? lv.y + lv.h - wh - 0.5 : lv.y + (lv.h - wh) * 0.42;
      const rect = { x: cx - winW / 2, y: wy, w: winW, h: wh };
      if (lv.level === 'mezz') {
        windows.push({ ...rect, kind: 'mezz', level: li, bay: i, home: -1, key: -1, u: 1, blue: false, main: false, box: false });
        continue;
      }
      const hi = homeOf.get(`${li}:${i}`)!;
      windows.push(homeWindow(rect, french ? 'french' : lv.level === 'top' ? 'top' : 'std', li, i, homes[hi]!, hi));
    }
  });

  const outline = outlineOf(roof, b.x, b.w, top, eave);
  const dormers = dormersFor(roof, bays, stairBay, winW, top, outline, rng);
  // Cheminées en brique sur les murs mitoyens, 1 ou 2 selon la largeur, dans la boîte de l'immeuble (pots compris).
  const chimneyXs = [b.x + 4 + rng() * 3];
  if (b.w > 70 || rng() < 0.3) chimneyXs.push(b.x + b.w - 8 - rng() * 3);
  const chimneys = chimneyXs.map((cx): Chimney => {
    if (roof.kind === 'mansard') return { x: cx, top: top + 2.3, base: top + 4 + 3 };
    const cTop = Math.max(top + 2.3, heightOn(outline, cx + 2) - 6);
    // Près du faîtage d'une tour étroite, le versant passe au-dessus des pots : souche d'au moins 1,5 px.
    return { x: cx, top: cTop, base: Math.max(heightOn(outline, cx + 2), cTop + 1.5) };
  });
  const wall = kind === 'haussmann' ? pick(STONES, rng) : pick(PLASTERS, rng);

  // Lucarnes habitées (fronton, capucine) : chambre sous les toits, logement d'une fenêtre ; la fenêtre porte la vitre.
  for (const d of dormers) {
    if (d.type === 'oeil' || d.type === 'tabatiere') continue;
    const home = drawHome(rng, hashString(`${x8}:-1:${d.bay}`), -1, [d.bay]);
    homes.push(home);
    windows.push(homeWindow({ x: d.cx - d.w / 2, y: d.y + 1, w: d.w, h: d.h - 2 }, 'dormer', -1, d.bay, home, homes.length - 1));
  }
  // Jardinières : 35 % des fenêtres standard de faubourg.
  if (kind === 'faubourg') for (const w of windows) if (w.kind === 'std') w.box = rng() < 0.35;

  const stairFloors = levels.filter((lv) => lv.level !== 'mezz').length;
  return { x: b.x, w: b.w, top, eave, base: b.base, kind, roof, bays, winW, doorCx: b.doorCx, doorBay, stairBay, levels, windows, homes, dormers, chimneys, wall, shutters, stairFloors };
}

// Étage du socle des jumeaux : une rangée de fenêtres standard centrée dans la bande de 14 px, travées à l'aplomb de la porte.
// `span` : partie visible du socle (socle coupé au bord du monde : travées réparties sur elle seule, comme pour les tours) ;
// le générateur reste tiré du x du socle entier.
export function podiumLayout(p: Podium, ground: number, seed: number, doorCx: number | null, span: { x0: number; x1: number } = { x0: p.x, x1: p.x + p.w }): PodiumLayout {
  const x8 = Math.round(p.x * 8);
  const rng = mulberry32(seed ^ hashString('podium-floor') ^ x8);
  const { bays, winW } = baysOn(span.x0, span.x1, doorCx, 17);
  const band = PODIUM_H - GROUND_FLOOR;
  const wh = band * 0.62;
  const wy = ground - PODIUM_H + (band - wh) / 2;
  const homes = splitBays(bays.map((_, i) => i), rng).map((g) => drawHome(rng, hashString(`${x8}:p:${g[0]}`), 0, g));
  const windows: FacadeWindow[] = [];
  homes.forEach((home, hi) => {
    for (const i of home.bays) windows.push(homeWindow({ x: bays[i]! - winW / 2, y: wy, w: winW, h: wh }, 'std', 0, i, home, hi));
  });
  windows.sort((a, b) => a.bay - b.bay);
  return { bays, windows, homes };
}

// Entrées de la mise en page des socles visibles (clé = id du socle) : partie visible et porte du lot (celle du local,
// même source que `doorsFor`), si son centre tombe dans la partie visible. Socle de moins de MIN_SPAN px visibles : absent.
export function podiumInputs(width: number, height: number, seed: number): Map<number, { span: { x0: number; x1: number }; doorCx: number | null }> {
  const slots = shopSlotsFor(width, height, seed);
  const out = new Map<number, { span: { x0: number; x1: number }; doorCx: number | null }>();
  for (const lot of frontLots(width, height, seed)) {
    if (!lot.podium) continue;
    const span = { x0: Math.max(lot.x, 0), x1: Math.min(lot.x + lot.w, width) };
    if (span.x1 - span.x0 < MIN_SPAN) continue;
    const slot = slots.find((s) => s.residentDoorX >= lot.x && s.residentDoorX <= lot.x + lot.w);
    const cx = slot ? slot.residentDoorX + DOOR_WIDTH / 2 : null;
    out.set(lot.podium.id, { span, doorCx: cx !== null && cx >= span.x0 && cx <= span.x1 ? cx : null });
  }
  return out;
}

// Entrées de la mise en page, une par immeuble du premier plan, dans l'ordre de `citySkyline` (`index` = rang dans sa sortie).
// Immeubles dont la partie visible fait moins de MIN_SPAN px (au-delà du bord du monde) : pas de mise en page.
export function facadeInputs(width: number, height: number, seed: number): (FacadeInput & { index: number })[] {
  const { ground } = cityMetrics(height);
  const slots = shopSlotsFor(width, height, seed);
  // Porte d'un immeuble : celle du local de son lot, si son centre tombe dans l'immeuble (jumeau : la tour du côté de la porte).
  const doorOf = new Map<number, number>();
  for (const lot of frontLots(width, height, seed)) {
    const slot = slots.find((s) => s.residentDoorX >= lot.x && s.residentDoorX <= lot.x + lot.w);
    if (!slot) continue;
    const tower = slot.doorSide === 'left' ? lot.towers[0]! : lot.towers.at(-1)!;
    const cx = slot.residentDoorX + DOOR_WIDTH / 2;
    const visible = Math.min(tower.x + tower.w, width) - Math.max(tower.x, 0);
    if (cx >= tower.x && cx <= tower.x + tower.w && visible >= MIN_DOOR_SPAN) doorOf.set(tower.x, cx);
  }
  const out: (FacadeInput & { index: number })[] = [];
  citySkyline(width, height, seed).forEach((b, index) => {
    if (b.far) return;
    const span = { x0: Math.max(b.x, 0), x1: Math.min(b.x + b.w, width) };
    if (span.x1 - span.x0 < MIN_SPAN) return;
    const podium = !!b.podium;
    out.push({ index, x: b.x, w: b.w, h: b.h * BUILDING_STRETCH, base: ground - (podium ? PODIUM_H : GROUND_FLOOR), span, doorCx: doorOf.get(b.x) ?? null, podium });
  });
  return out;
}
