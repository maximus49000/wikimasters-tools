import { memo, useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { FacadeWindow, Home, Level } from '../core/library/city/facade-layout';
import type { Facade } from '../core/library/city/facades';
import { MAX_ANIM, homeState, type Actor, type HomeState } from '../core/library/city/home-state';
import type { Dwelling, Room } from '../core/library/city/households';
import { outfitFor, type Outfit } from '../core/library/city/people';
import type { Choreo, Schedule, Segment, Where } from '../core/library/city/schedules';
import { IN_OUT_S, windowPose, type HandProp, type WindowPose } from '../core/library/city/window-choreo';
import { nightness } from '../core/library/city/window-lights';
import { anchorsOf } from '../core/library/figure/bake';
import { shapeOf, signatureOf } from '../core/library/figure/dress';
import { INK } from '../core/library/paint/cel';
import { hashString, mulberry32 } from '../core/library/scene-world';
import { mixHex, type Sky } from '../core/library/sky';
import { GhibliFigure, figurePalette, hideFigure, poseFigure } from './figure/ghibli-figure';
import { useFigureRegistry, type FigureRegistry, type Palette } from './figure/figure-host';
import { BAR_STEP, balconyOf, joineryPath, type Balcony } from './ghibli-window-art';
import { lifeStates, sceneMinute, type SceneLife } from './use-scene-life';
import { useWallClockLoop } from './use-wallclock-loop';
import {
  Curtains, HeldProp, InteriorProp, Sapin, Sash, Shutters, TvScreen, bulbOn, curtainAttrs, figureHeight, floorOf, puffAttrs, shutterLit, shutterTransform, tvGlow, windowShutters,
  type InteriorKind, type ShutterKind,
} from './window-life-art';

// Calque de la vie derrière les fenêtres (spec 2026-10-19 « vie au-dessus de la rue » §5.1-5.2, tâche 9) : les logements
// vivants (use-scene-life.ts) mis en scène au-dessus des fenêtres du décor (GhibliWindows) et sous le ciel animé. Port de
// l'ordre de `paintWindow` / `paintLeaner` (07a-facade.js) et de `paintBalcony` (07b-balcon-toit.js) de la maquette :
// 1. façade d'un immeuble, CUITE en une image (voir bakeFront) : par logement, meubles des poses (table, bureau, télé,
//    plan de cuisson) et pantins en pose fixe, coupés à leur vitre, puis rideaux et voilage, menuiserie redessinée,
//    battant de la fenêtre ouvert, volets (persiennes repliables haussmanniennes, volets battants du faubourg). Le groupe
//    vivant, où la boucle écrit, est monté hors du document (portail) et recopié dans l'image quand il change ;
// 2. sapin (guirlande qui clignote) et pantins qui bougent dans la pièce (marche, geste), coupés à leur vitre ;
// 3. dehors : penchés à l'appui (coupés sous les hanches), occupants du balcon, puis le garde-corps redessiné par-dessus
//    eux (ordre de `paintBalcony` : occupants, puis rambarde) ; accessoires tenus.
// Perfs Android (contraintes du chantier ; mesure CPU × 4 dans le rapport de la tâche) : tous les nœuds sont montés pour la
// journée (remontés seulement quand la largeur ou le jour change ; la bascule humide / sec ajoute au plus quelques nœuds) ;
// la page ne porte que les images cuites et les nœuds vivants (cachés en display none quand ils ne servent pas) ; la
// boucle de l'horloge murale (modèle : GullsLayer) relit l'état des logements (`homeState`, pur ; tous toutes les 2 s, à
// chaque image ceux dont un pantin bouge), admet une fois par scène les chorégraphies animées dans la borne (MAX_ANIM,
// priorités de `cullAnimated`), choisit les poses (`windowPose`) et n'écrit un attribut que s'il change ; <clipPath> SVG
// rectangulaires (pas de clip-path CSS), pas de SMIL, aucune transition.
// Pantins : toujours le pantin 2D (`flat`), un par membre du foyer (ou invité) qui joue une scène dans la journée, monté
// deux fois (pose fixe dans la façade cuite, vivant au-dessus) ; silhouette unie #1A1422 la nuit. Mouvement réduit : une
// pose fixe par minute (`windowPose(…, reduced)`), rien ne marche.

// Image de la boucle (ms) : la marche (cycle de 0,9 s en 12 phases) à 10 images par seconde suffit derrière une vitre.
const FRAME_MS = 100;
// Relecture complète de tous les logements (minutes : 2 s) ; entre deux, seuls ceux dont un pantin bouge (télé et sapin
// changent à la relecture complète).
const FULL_EVERY = 2 / 60;
// Persiennes métalliques des immeubles haussmanniens (notes.md §Couleurs), une par immeuble.
const PERSIENNES = ['#C4CCC8', '#B8C0B4', '#CCC4AC'] as const;
// Opacité d'un pantin dedans (maquette, `alphaIn`) : pièce allumée (derrière un rideau tiré : ombre), fenêtre ouverte, de
// jour derrière la vitre fermée (sous le reflet), la nuit dans une pièce éteinte (rien).
const ALPHA = { lit: 1, behindCurtain: 0.28, open: 0.9, day: 0.3 } as const;
// Penché : buste plus grand que nature (sort du plan de la façade), hanches à l'appui (maquette : × 1,08, pieds à + 0,5 h).
const LEAN_K = 1.08;
// Cadre du penché autour de la vitre (maquette `paintLeaner`) : 2,5 px de chaque côté, 6 px au-dessus, 0,5 px sous l'appui.
const LEAN_CLIP = { side: 2.5, above: 6, below: 0.5 } as const;
// Intervalle (s) des cuissons d'une façade qu'un pantin fait bouger (façade vivante hors du document).
const BAKE_BUSY_S = 0.25;
// Une nuit « noire » (silhouettes, vitres de nuit) au-delà de cette obscurité (maquette : dark > 0,2).
const NIGHT_AT = 0.2;
// Cycle du fumeur (s), comme window-choreo.ts : bouffée pendant les 30 % du début, volute ensuite.
const SMOKE_CYCLE_S = 11;
const SMOKE_UP = 0.3;
// Accessoires tenus par chorégraphie, et meubles des poses.
const HELD: Partial<Record<Choreo, HandProp>> = {
  smoke: 'cigarette', water: 'watering-can', shake: 'rug', cook: 'spoon', read: 'book', table: 'cup',
};
// Chorégraphies qui manœuvrent volets, rideaux ou fenêtre (écrits à chaque image pendant la scène).
const HANDS: ReadonlySet<Choreo> = new Set(['openShutters', 'closeShutters', 'armsUp', 'drawCurtains']);
const STAND = { yaw: 4, gait: 'stand', phase: 0, head: 0, arms: 'down', lean: 0 } as const;

// Clé d'une scène : logement, membre, chorégraphie et minute de début (dans le repère du jour ; une scène de la veille
// garde la même clé après minuit), arrondie au 1/64 de minute contre le bruit du calcul.
const sceneKey = (id: string, a: Actor, m: number): string => `${id}|${a.m}|${a.choreo}|${Math.round((m - a.t) * 64)}`;
const step20 = (v: number): number => Math.round(v * 20) / 20;
const n2 = (v: number): string => (Math.round(v * 100) / 100).toString();

// Hauteur d'un pantin debout (sommet du crâne), en unités du sprite : sert à le mettre à la taille de sa fenêtre.
let standH = 0;
function standHeight(): number {
  if (!standH) {
    const o: Outfit = { skin: '#F2C9A0', hair: 'short', hairColor: '#3B2A1E', hatColor: '#000000', top: 'tee', topColor: '#C85A3A', bottom: 'pants', bottomColor: '#2E3A4A', accessory: 'none', accessoryColor: '#000000' };
    standH = -anchorsOf({ sig: signatureOf(shapeOf(o, false)), ...STAND }).headTop[1];
  }
  return standH;
}

// Tenue d'intérieur d'un membre du foyer (couleurs du foyer, coupe tirée de sa graine) ; invité (m au-delà des membres) :
// tenue d'un passant ordinaire tirée de la clé du logement et de m, sans chapeau ni sac. Tirages déterministes.
const pick = <T,>(list: readonly T[], r: () => number): T => list[Math.floor(r() * list.length)]!;
export function windowOutfit(d: Dwelling, m: number): Outfit {
  const mem = d.hh.members[m];
  if (!mem) {
    const o = outfitFor('ordinary', mulberry32(d.key ^ hashString('window-guest') ^ Math.imul(m + 1, 2654435761)));
    return { ...o, hair: o.hair === 'cap' || o.hair === 'beanie' ? 'short' : o.hair, accessory: 'none' };
  }
  const r = mulberry32(d.hh.seed ^ hashString('window-member') ^ m);
  const old = d.hh.type === 'retraite';
  return {
    skin: mem.skin,
    hair: pick(mem.kid ? (['short', 'long', 'bun'] as const) : (['short', 'long', 'bun', 'short', 'bald'] as const), r),
    hairColor: old ? '#9A9A9A' : pick(['#3B2A1E', '#111111', '#6B3A1E', '#8A5A2B', '#C9A24A'] as const, r),
    hatColor: '#000000',
    top: pick(['tee', 'sweater', 'shirt'] as const, r),
    topColor: mem.shirt,
    bottom: pick(mem.kid ? (['pants', 'shorts', 'skirt'] as const) : (['pants', 'jeans', 'skirt', 'pants'] as const), r),
    bottomColor: mem.pants,
    accessory: 'none',
    accessoryColor: '#000000',
  };
}

// ---------- Modèle de la journée (nœuds à monter) ----------

type WinM = { key: string; win: FacadeWindow; room: Room; shutters: ShutterKind | null; color: string; curtain: Home['curtain']; sash: boolean; props: InteriorKind[]; sapin: boolean };
type FigM = { key: string; m: number; outfit: Outfit; sig: string; props: HandProp[] };
type DwM = {
  d: Dwelling; uid: string; x: number; wall: string; wins: WinM[]; byRoom: Map<Room, WinM>; figs: FigM[];
  balcony: { win: FacadeWindow; bal: Balcony; rail: string } | null; joinery: string; held: HandProp[];
  box: [number, number, number, number]; // cadre de la façade cuite (vitres + vantaux rabattus et battant biaisé)
  starts: number[]; // débuts des scènes, triés, en minutes du jour (ceux de la veille décalés de −1440)
  leanRoom: Room; // fenêtre de la réaction à la sirène
};
// Immeuble : ses logements et le cadre de sa façade cuite (union de ceux des logements).
type FacM = { fi: number; dws: DwM[]; box: [number, number, number, number] };
type Model = { dws: DwM[]; facades: FacM[]; init: Map<string, HomeState> };

const interiorOf = (choreo: string, desk: boolean): InteriorKind | null => (choreo === 'tv' ? 'tv' : choreo === 'table' ? (desk ? 'desk' : 'table') : choreo === 'cook' ? 'stove' : null);

// Garde-corps redessiné devant les occupants du balcon : lisse et barreaux (pas de `paintBalcony`) sur la portée de la
// porte-fenêtre du salon et des places du balcon (filant), ou sur le balconnet entier.
function railPath(win: FacadeWindow, bal: Balcony, filant: boolean, xMax: number): string {
  const a0 = filant ? win.x - win.w * 0.5 : win.x - 1.2;
  const a1 = Math.min(xMax, filant ? win.x + win.w * 2.2 : win.x + win.w + 1.2);
  const top = bal.by - bal.rh;
  let d = `M${n2(a0)} ${n2(top + 0.35)}H${n2(a1)}`;
  const first = bal.x0 - Math.floor((bal.x0 - a0) / BAR_STEP) * BAR_STEP;
  for (let k = first; k < a1; k += BAR_STEP) d += `M${n2(k + 0.22)} ${n2(top)}V${n2(bal.by)}`;
  return d;
}

// Cadre de la façade cuite : vitres du logement, avec une largeur de fenêtre de chaque côté (volet battant rabattu,
// battant de la fenêtre ouvert en biais) et 4 px en haut et en bas (biais du battant), arrondi au pixel.
function frontBox(wins: readonly { win: FacadeWindow }[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { win } of wins) {
    x0 = Math.min(x0, win.x - win.w);
    x1 = Math.max(x1, win.x + 2 * win.w);
    y0 = Math.min(y0, win.y - 4);
    y1 = Math.max(y1, win.y + win.h + 4);
  }
  x0 = Math.floor(x0);
  y0 = Math.floor(y0);
  return [x0, y0, Math.ceil(x1) - x0, Math.ceil(y1) - y0];
}

// Débuts des scènes d'un logement (jour, et veille décalée de −1440 pour la soirée qui déborde), triés.
function startsOf(life: SceneLife, id: string): number[] {
  const out: number[] = [];
  for (const g of life.today.get(id)?.segments ?? []) if (g.k === 'act') out.push(g.t0);
  for (const g of life.yesterday.get(id)?.segments ?? []) if (g.k === 'act' && g.t0 >= 1440) out.push(g.t0 - 1440);
  return out.sort((a, b) => a - b);
}

function buildModel(facades: readonly Facade[], lives: readonly SceneLife[], minutes: number, prefix: string): Model {
  const life = lives[0]!;
  const dws: DwM[] = [];
  for (const d of life.dwellings) {
    const f = facades[d.facade];
    if (!f) continue;
    const layout = f.layout;
    const tower = layout?.windows.length ?? 0;
    const home = f.homes[d.home];
    const segs: Segment[] = [];
    for (const l of lives) segs.push(...(l.today.get(d.id)?.segments ?? []), ...(l.yesterday.get(d.id)?.segments ?? []));
    const acts = segs.filter((g): g is Extract<Segment, { k: 'act' }> => g.k === 'act');
    const persienne = layout ? PERSIENNES[Math.floor(mulberry32(hashString('persienne') ^ Math.round(layout.x * 8))() * PERSIENNES.length)]! : PERSIENNES[0];
    // Persiennes repliées toute la journée (jamais fermées ces deux jours) : invisibles, pas montées.
    const shutUser = lives.some((l) => l.today.get(d.id)?.shutUser || l.yesterday.get(d.id)?.shutUser);
    const closes = (room: Room): boolean => shutUser || segs.some((g) => g.k === 'shut' && g.room === room);
    const wins: WinM[] = [];
    let salonLevel: Level | null = null;
    f.lamps.forEach((win, j) => {
      if (win.home !== d.home || win.kind === 'stair') return;
      const room = d.roomOfWindow.get(win.bay);
      if (!room) return;
      const level = j < tower && win.level >= 0 ? (layout!.levels[win.level] ?? null) : null;
      if (room === 'salon') salonLevel = level;
      const shutters = windowShutters(d.shutters, win, layout, closes(room));
      const props = new Set<InteriorKind>();
      for (const a of acts) if (a.room === room) { const k = interiorOf(a.choreo, !!a.desk); if (k) props.add(k); }
      wins.push({
        key: `${d.id}/${room}`, win, room, shutters, color: shutters === 'battant' ? layout!.shutters! : persienne,
        curtain: home?.curtain ?? null,
        sash: segs.some((g) => g.k === 'win' && g.room === room),
        props: [...props],
        sapin: room === 'salon' && segs.some((g) => g.k === 'sapin'),
      });
    });
    if (wins.length === 0) continue;
    const byRoom = new Map(wins.map((w) => [w.room, w]));
    // Fenêtre où l'on se penche au passage d'une sirène (salon, sinon la première) : son battant est monté même sans scène prévue.
    const leanWin = byRoom.get('salon') ?? wins[0]!;
    leanWin.sash = true;
    const members = new Map<number, Set<HandProp>>();
    for (const a of acts) {
      if (!byRoom.has(a.room)) continue;
      const s = members.get(a.m) ?? new Set<HandProp>();
      const h = HELD[a.choreo];
      if (h) s.add(h);
      members.set(a.m, s);
    }
    const figs = [...members.entries()].sort((a, b) => a[0] - b[0]).map(([m, props]): FigM => {
      const outfit = windowOutfit(d, m);
      return { key: `${d.id}/${m}`, m, outfit, sig: signatureOf(shapeOf(outfit, false)), props: [...props] };
    });
    const salon = byRoom.get('salon');
    const bal = salon && salonLevel ? balconyOf(salon.win, salonLevel, layout?.x) : null;
    const filant = (salonLevel as Level | null)?.balcony === 'filant';
    dws.push({
      d, uid: `${prefix}-${d.id.replace(/[^0-9a-z]/gi, '-')}`,
      x: wins.reduce((s, w) => s + w.win.x + w.win.w / 2, 0) / wins.length,
      wall: layout?.wall ?? '#EDE2C8', wins, byRoom, figs,
      balcony: d.balcony && salon && bal ? { win: salon.win, bal, rail: railPath(salon.win, bal, filant, layout ? layout.x + layout.w - 1 : Infinity) } : null,
      joinery: wins.map((w) => joineryPath(w.win)).join(''),
      held: [...new Set(figs.flatMap((f) => f.props))],
      box: frontBox(wins),
      starts: lives[0] ? startsOf(lives[0], d.id) : [],
      leanRoom: leanWin.room,
    });
  }
  const byFacade = new Map<number, DwM[]>();
  for (const dm of dws) byFacade.set(dm.d.facade, [...(byFacade.get(dm.d.facade) ?? []), dm]);
  const facadesM = [...byFacade.entries()].map(([fi, list]): FacM => {
    const x0 = Math.min(...list.map((d) => d.box[0])), y0 = Math.min(...list.map((d) => d.box[1]));
    const x1 = Math.max(...list.map((d) => d.box[0] + d.box[2])), y1 = Math.max(...list.map((d) => d.box[1] + d.box[3]));
    return { fi, dws: list, box: [x0, y0, x1 - x0, y1 - y0] };
  });
  return { dws, facades: facadesM, init: lifeStates(life, minutes) };
}

// ---------- Rendu (monté pour la journée) ----------

type Look = { night: boolean; dark: number; sky: Sky };

// Pantin d'un membre, monté quatre fois pour l'ordre de dessin (la boucle n'en montre qu'un, ou deux le temps qu'une image
// cuite arrive) :
// - `still` : pose fixe dans la pièce, dans la façade cuite, sous les rideaux ;
// - `shade` : pose fixe derrière un rideau tiré, dans la façade cuite, par-dessus le rideau à 0,28 (son ombre à travers le
//   tissu) ;
// - `in` : en mouvement dans la pièce, dans la page sous la façade cuite (les rideaux ouverts le cachent quand il passe
//   derrière) ;
// - `out` : penché, au balcon, ou en mouvement derrière un rideau tiré (ombre à 0,28), dans la page sur la façade cuite.
// Coupé par le <clipPath> rectangulaire de sa vitre (ou du cadre du penché ; aucun au balcon), posé par la boucle.
// La nuit, `out` porte deux palettes : la silhouette unie (contre-jour devant une pièce allumée, `data-pk-backlit`) et le
// pantin en couleurs teintées par l'ambiance de nuit (au balcon d'une pièce éteinte : rien ne l'éclaire par-derrière,
// `data-pk-dim`, assombries par `dimPalette`, maquette « pantin sombre sur le balcon d'une pièce éteinte ») ; la boucle choisit
// (`data-palette`). Les
// penchés à la fenêtre gardent la silhouette : en couleurs, chaque tenue serait cuite à chaque palier de la nuit, sur
// toute la ville (temps du test de la borne × 1,6).
type Slot = 'still' | 'shade' | 'in' | 'out';
const BAKED_SLOTS: readonly Slot[] = ['still', 'shade'];
const SLOTS: readonly Slot[] = ['still', 'shade', 'in', 'out'];
// Pantin au balcon d'une pièce éteinte : la teinte de nuit du moteur (`tone`, 55 % vers #0B1030) le laissait encore vif ;
// chaque couleur est tirée de 60 % de plus vers un bleu-gris sombre #1E2240 — lisible (peau, chemise, pantalon distincts), mais
// nettement plus sombre que de jour, entre la silhouette unie #1A1422 et la couleur (maquette 14 juillet 22 h 30).
const DIM_NIGHT = '#1E2240';
const DIM_MIX = 0.6;
const dimPalette = (p: Palette): Palette => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, k.startsWith('f') ? mixHex(v, DIM_NIGHT, DIM_MIX) : v]));
const FigNode = memo(function FigNode({ fm, look, slot }: { fm: FigM; look: Look; slot: Slot }): ReactElement {
  const reg = useFigureRegistry();
  const two = slot === 'out' && look.night;
  const pks = two
    ? { 'data-pk-backlit': reg.addPalette(figurePalette(fm.outfit, look.sky, false, undefined, { silhouette: true })), 'data-pk-dim': reg.addPalette(dimPalette(figurePalette(fm.outfit, look.sky, false))) }
    : {};
  return (
    <g data-wl-fig={fm.key} data-slot={slot} data-anim="0" display="none" {...pks}>
      <g data-wl-pos="">
        <GhibliFigure outfit={fm.outfit} sky={look.sky} rainy={false} umbrella={false} initial={STAND} hidden flat silhouette={look.night} />
      </g>
    </g>
  );
});

// Accessoires tenus d'un logement : ceux du dehors (cigarette, arrosoir, tapis) par-dessus la façade cuite, ceux de la pièce
// (cuillère, livre, tasse) dessous (les rideaux de l'image passent devant).
const OUTSIDE_HELD: ReadonlySet<HandProp> = new Set(['cigarette', 'watering-can', 'rug']);
function heldNodes(dm: DwM, look: Look, outside: boolean): ReactElement[] {
  return dm.held.filter((k) => OUTSIDE_HELD.has(k) === outside).map((k) => (
    <g key={k} data-wl-held={k} display="none">
      <g data-wl-pos="">
        <HeldProp kind={k} at={[0, 0]} phase={-1} night={look.night} dark={look.dark} />
      </g>
    </g>
  ));
}

// Dedans, vivant, sous la façade cuite (ses rideaux et sa menuiserie passent devant) : meubles des pièces où un pantin
// bouge (dessinés avant lui, comme la maquette), sapin (la guirlande clignote), écran des télés allumées (il scintille),
// pantins en mouvement dans la pièce, accessoires tenus dans la pièce.
const DwInside = memo(function DwInside({ dm, look }: { dm: DwM; look: Look }): ReactElement {
  return (
    <g data-wl-in={dm.d.id}>
      {dm.wins.map((w) => (
        <g key={w.room}>
          {w.props.map((k) => (
            <g key={k} data-wl-lprop={`${w.key}/${k}`} display="none" clipPath={`url(#${dm.uid}-${w.room}-in)`}>
              <InteriorProp win={w.win} kind={k} tone="warm" flicker={0} dark={look.dark} />
            </g>
          ))}
          {w.sapin && (
            <g data-wl-sapin={w.key} display="none" clipPath={`url(#${dm.uid}-${w.room}-in)`}>
              <Sapin win={w.win} night={look.night} blink={0} />
            </g>
          )}
          {w.props.includes('tv') && (
            <g data-wl-tv={w.key} display="none" clipPath={`url(#${dm.uid}-${w.room}-in)`}>
              <TvScreen win={w.win} glow={0} dark={look.dark} />
            </g>
          )}
        </g>
      ))}
      {dm.figs.map((fm) => <FigNode key={fm.key} fm={fm} look={look} slot="in" />)}
      {heldNodes(dm, look, false)}
    </g>
  );
});

const DwFront = memo(function DwFront({ dm, st, look, lights }: { dm: DwM; st: HomeState | undefined; look: Look; lights: boolean }): ReactElement {
  return (
    <g data-wl-front={dm.d.id}>
      {/* Dans la façade cuite : coupes des vitres (définies ici pour être recopiées avec elle), meubles des poses et
          pantins en pose fixe, sous les rideaux. */}
      <defs>
        {dm.wins.map((w) => (
          <clipPath key={w.room} id={`${dm.uid}-${w.room}-b`}>
            <rect x={w.win.x} y={w.win.y} width={w.win.w} height={w.win.h} />
          </clipPath>
        ))}
      </defs>
      {dm.wins.map((w) => (
        <g key={w.room} data-wl-room={`${dm.d.id}/${w.room}`}>
          {w.props.map((k) => (
            <g key={k} data-wl-prop={k} display="none" clipPath={`url(#${dm.uid}-${w.room}-b)`}>
              <InteriorProp win={w.win} kind={k} tone={st?.tone[w.room] ?? 'warm'} flicker={0} dark={look.dark} />
            </g>
          ))}
        </g>
      ))}
      {dm.figs.map((fm) => <FigNode key={fm.key} fm={fm} look={look} slot="still" />)}
      {dm.wins.map((w) => {
        const lit = lights && !!st?.lit[w.room];
        return (
          <g key={w.room} data-wl-win={`${dm.d.id}/${w.room}`}>
            {w.curtain && <Curtains win={w.win} style={w.curtain.style} color={w.curtain.color} drawn={st?.curt[w.room] ?? 0} lit={lit} wall={dm.wall} night={look.night} />}
          </g>
        );
      })}
      {dm.figs.map((fm) => <FigNode key={fm.key} fm={fm} look={look} slot="shade" />)}
      <path d={dm.joinery} fill="none" stroke={INK} strokeWidth={0.55} />
      {dm.wins.map((w) => (
        <g key={w.room} data-wl-win2={`${dm.d.id}/${w.room}`}>
          {w.sash && <Sash win={w.win} open={st?.win[w.room] ?? 0} night={look.night} dark={look.dark} />}
          {w.shutters && <Shutters win={w.win} kind={w.shutters} color={w.color} open={st?.shut[w.room] ?? 1} litBehind={lights && !!st?.lit[w.room]} dark={look.dark} />}
        </g>
      ))}
    </g>
  );
});

// Façades d'un immeuble : groupe vivant (celui des logements) et son image cuite (voir bakeFront).
// `offstage` : conteneur SVG hors du document où monter le groupe vivant (seule l'image cuite est dans la page : des
// milliers de nœuds cachés dans la page coûtent encore à chaque image, mesuré) ; null (pas de canvas pour cuire : jsdom),
// le groupe vivant est dans la page.
const FacadeFront = memo(function FacadeFront({ fm, init, look, lights, offstage }: { fm: FacM; init: Map<string, HomeState>; look: Look; lights: boolean; offstage: Element | null }): ReactElement {
  const live = (
    <g data-wl-live={fm.fi}>
      {fm.dws.map((dm) => <DwFront key={dm.d.id} dm={dm} st={init.get(dm.d.id)} look={look} lights={lights} />)}
    </g>
  );
  return (
    <g data-wl-facade={fm.fi}>
      {offstage ? createPortal(live, offstage) : live}
      <image data-wl-baked="" x={fm.box[0]} y={fm.box[1]} width={fm.box[2]} height={fm.box[3]} preserveAspectRatio="none" display="none" />
    </g>
  );
});

const DwOutside = memo(function DwOutside({ dm, look }: { dm: DwM; look: Look }): ReactElement {
  return (
    <g data-wl-out={dm.d.id}>
      {dm.figs.map((fm) => <FigNode key={fm.key} fm={fm} look={look} slot="out" />)}
      {heldNodes(dm, look, true)}
      {dm.balcony && <path data-wl-rail="" d={dm.balcony.rail} fill="none" stroke={INK} strokeWidth={0.5} opacity={0} />}
    </g>
  );
});

// ---------- Nœuds relus par la boucle ----------

type FigRefs = { wrap: Element; pos: Element | null; fig: Element | null; img: Element | null };
type HeldRefs = { kind: HandProp; g: Element; pos: Element | null; puff: Element | null; pour: Element | null };
type WinRefs = {
  props: { kind: InteriorKind; g: Element; live: Element | null; screen: Element | null; screenGlow: Element | null }[]; sapin: Element | null; bulbs: Element[]; tv: Element | null; tvGlow: Element | null;
  panels: Element[]; curtDay: Element[]; curtNight: Element[]; folds: Element[]; voile: (Element | null)[];
  sash: Element | null; sashGroup: Element | null; shutters: Element | null; leaves: Element[]; slatsDark: Element[]; slatsLit: Element[];
};
type FigSet = Record<Slot, FigRefs | null>;
type Refs = { figs: Map<string, FigSet>; held: Map<string, HeldRefs[]>; wins: Map<string, WinRefs>; rails: Map<string, Element>; fronts: Map<number, { live: Element; img: Element }> };

function collectRefs(page: Element, offstage: Element | null, model: Model): Refs {
  // Nœuds de la page et des façades vivantes hors du document.
  const root = { querySelectorAll: (sel: string): Element[] => [...page.querySelectorAll(sel), ...(offstage ? offstage.querySelectorAll(sel) : [])] };
  // Un seul parcours par sorte de nœud (jsdom et WebView : pas de recherche par logement dans tout le calque).
  const figs = new Map<string, FigSet>();
  for (const wrap of root.querySelectorAll('[data-wl-fig]')) {
    const key = wrap.getAttribute('data-wl-fig')!;
    const e = figs.get(key) ?? { still: null, shade: null, in: null, out: null };
    e[wrap.getAttribute('data-slot') as Slot] = { wrap, pos: wrap.querySelector('[data-wl-pos]'), fig: wrap.querySelector('[data-figure]'), img: wrap.querySelector('[data-figure] > image') };
    figs.set(key, e);
  }
  const held = new Map<string, HeldRefs[]>();
  for (const g of root.querySelectorAll('[data-wl-held]')) {
    const id = g.parentElement!.getAttribute('data-wl-out') ?? g.parentElement!.getAttribute('data-wl-in')!;
    const list = held.get(id) ?? [];
    list.push({ kind: g.getAttribute('data-wl-held') as HandProp, g, pos: g.querySelector('[data-wl-pos]'), puff: g.querySelector('[data-puff]'), pour: g.querySelector('[data-pour]') });
    held.set(id, list);
  }
  const rails = new Map<string, Element>();
  for (const rail of root.querySelectorAll('[data-wl-rail]')) rails.set(rail.parentElement!.getAttribute('data-wl-out')!, rail);
  const byAttr = (attr: string): Map<string, Element> => new Map([...root.querySelectorAll(`[${attr}]`)].map((e) => [e.getAttribute(attr)!, e]));
  const rooms = byAttr('data-wl-room');
  const sapins = byAttr('data-wl-sapin');
  const tvs = byAttr('data-wl-tv');
  const lprops = byAttr('data-wl-lprop');
  const fronts = byAttr('data-wl-win');
  const fronts2 = byAttr('data-wl-win2');
  const wins = new Map<string, WinRefs>();
  for (const dm of model.dws) {
    for (const w of dm.wins) {
      const k = `${dm.d.id}/${w.room}`;
      const room = rooms.get(k) ?? null;
      const front = fronts.get(k) ?? null;
      const front2 = fronts2.get(k) ?? null;
      const all = (el: Element | null, sel: string): Element[] => (el ? [...el.querySelectorAll(sel)] : []);
      wins.set(k, {
        props: all(room, '[data-wl-prop]').map((g) => ({ kind: g.getAttribute('data-wl-prop') as InteriorKind, g, live: lprops.get(`${k}/${g.getAttribute('data-wl-prop')}`) ?? null, screen: g.querySelector('[data-tv-screen]'), screenGlow: g.querySelector('[data-tv-screen] > [data-screen]') })),
        tv: tvs.get(k) ?? null,
        tvGlow: tvs.get(k)?.querySelector('[data-screen]') ?? null,
        sapin: sapins.get(k) ?? null,
        bulbs: all(sapins.get(k) ?? null, '[data-bulb]'),
        panels: all(front, '[data-curtain-panel]'),
        curtDay: all(front, '[data-curtain-day]'),
        curtNight: all(front, '[data-curtain-night]'),
        folds: all(front, '[data-curtain-folds]'),
        voile: ['[data-voile-lit]', '[data-voile-day]', '[data-voile-night]', '[data-voile-lines]'].map((sel) => front?.querySelector(sel) ?? null),
        sash: front2?.querySelector('[data-sash-leaf]') ?? null,
        sashGroup: front2?.querySelector('[data-sash]') ?? null,
        shutters: front2?.querySelector('[data-shutters]') ?? null,
        leaves: all(front2, '[data-shutter-leaf]'),
        slatsDark: all(front2, '[data-slats-dark]'),
        slatsLit: all(front2, '[data-slats-lit]'),
      });
    }
  }
  const frontsOf = new Map<number, { live: Element; img: Element }>();
  const lives = new Map(root.querySelectorAll('[data-wl-live]').map((g) => [g.getAttribute('data-wl-live'), g]));
  for (const g of page.querySelectorAll('[data-wl-facade]')) {
    const live = lives.get(g.getAttribute('data-wl-facade'));
    const img = g.querySelector(':scope > [data-wl-baked]');
    if (live && img) frontsOf.set(Number(g.getAttribute('data-wl-facade')), { live, img });
  }
  return { figs, held, wins, rails, fronts: frontsOf };
}

// Écriture d'un attribut seulement s'il change : valeur gardée par nœud (relue sur le nœud au premier passage, après un
// rendu React qui a pu la réécrire).
// `writes()` : nombre d'écritures faites (une façade a changé si le compte a bougé pendant qu'on l'écrivait).
type Writer = ((el: Element | null | undefined, name: string, value: string) => void) & { writes: () => number; forget: (el: Element, name: string) => void };
function writer(): Writer {
  const seen = new WeakMap<Element, Map<string, string>>();
  let count = 0;
  const set = ((el: Element | null | undefined, name: string, value: string): void => {
    if (!el) return;
    let m = seen.get(el);
    if (!m) seen.set(el, (m = new Map()));
    const was = m.has(name) ? m.get(name) : el.getAttribute(name);
    if (was !== value) {
      el.setAttribute(name, value);
      count++;
    }
    m.set(name, value);
  }) as Writer;
  set.writes = () => count;
  set.forget = (el: Element, name: string) => seen.get(el)?.delete(name);
  return set;
}

// Façade d'un logement (rideaux, menuiserie, battant, volets) cuite en une image matricielle : le moteur de rendu ne
// repeint plus ses dizaines de formes à chaque image de la rue, mais une seule image (mesure CPU × 4 : c'était le poste le
// plus lourd ; une image SVG ne suffit pas, elle est rejouée en vecteurs). Le groupe vivant reste monté : la boucle y écrit,
// le recopie (XMLSerializer → SVG → canvas à la résolution de l'écran → blob) quand il a changé, et le montre tant que
// l'image n'est pas prête (ou sans canvas : jsdom).
const SVG_NS = 'http://www.w3.org/2000/svg';
// Résolution de cuisson : pixels d'écran par unité de scène (bornée), relue sur l'image elle-même.
const BAKE_SCALE = { min: 1, max: 4, fallback: 2 } as const;
// Cuisson d'un immeuble : dernière cuisson lancée, dernier changement, groupe vivant montré (repli dans la page), version,
// blob affiché ; `shown` : pantins en pose fixe que montre l'image affichée (clés), `next` : ceux de la cuisson en cours.
// `fails` / `retry` : cuissons ratées de suite et heure (s) de la prochaine tentative.
type Baked = { at: number; change: number; live: boolean; version: number; url: string | null; shown: Set<string>; next: Set<string>; fails: number; retry: number };
// Cuisson ratée (image illisible, pas de canvas, blob vide) : nouvel essai après BAKE_RETRY_S, au plus BAKE_TRIES fois ; au-delà
// l'immeuble n'est plus attendu pour montrer le calque.
const BAKE_RETRY_S = 1;
const BAKE_TRIES = 2;
const NO_FALLBACK: ReadonlySet<number> = new Set();
// Cuisson possible : image, canvas et blobs réels (pas jsdom). Les tests forcent la cuisson (`bakeHooks.enabled`, avec
// Image, canvas et blobs simulés) et lisent le SVG cuit (`onSvg`).
export const bakeHooks: { enabled: boolean | null; onSvg: ((svg: string) => void) | null } = { enabled: null, onSvg: null };
const canBake = (): boolean =>
  bakeHooks.enabled ??
  (typeof document !== 'undefined' && typeof Image !== 'undefined' && typeof URL.createObjectURL === 'function' && !(typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')));
function bakeFront(live: Element, img: SVGImageElement, box: readonly [number, number, number, number], b: Baked, onReady: (url: string) => void, onFail: () => void): void {
  // Sans canvas réel (jsdom) : rien, le groupe vivant reste montré.
  if (!canBake()) return;
  const [x, y, w, h] = box;
  const ctm = img.getScreenCTM?.();
  const k = Math.min(BAKE_SCALE.max, Math.max(BAKE_SCALE.min, ctm ? Math.abs(ctm.a) * (window.devicePixelRatio || 1) : BAKE_SCALE.fallback));
  // Seule la racine peut porter un display="none" à ôter (groupe vivant dans la page, repli) ; ses enfants cachés le restent.
  let src0 = live;
  if (live.hasAttribute('display')) {
    src0 = live.cloneNode(true) as Element;
    src0.removeAttribute('display');
  }
  const inner = new XMLSerializer().serializeToString(src0);
  const W = Math.max(1, Math.ceil(w * k)), H = Math.max(1, Math.ceil(h * k));
  const svg = `<svg xmlns="${SVG_NS}" viewBox="${x} ${y} ${w} ${h}" width="${W}" height="${H}">${inner}</svg>`;
  const version = ++b.version;
  // Source SVG en blob, libérée sitôt dessinée : le document SVG décodé ne reste pas vivant en mémoire (une image SVG gardée
  // en cache coûte à chaque image de la page, mesuré).
  bakeHooks.onSvg?.(svg);
  const src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const pic = new Image();
  const done = (): void => {
    URL.revokeObjectURL(src);
    pic.onload = pic.onerror = null;
    pic.removeAttribute('src');
  };
  pic.onerror = () => {
    done();
    if (version === b.version) onFail();
  };
  pic.onload = () => {
    const ok = version === b.version;
    const canvas = ok ? document.createElement('canvas') : null;
    const ctx = canvas ? ((canvas.width = W), (canvas.height = H), canvas.getContext('2d')) : null;
    if (ctx) ctx.drawImage(pic, 0, 0, W, H);
    done();
    if (!canvas || !ctx) {
      if (ok) onFail();
      return;
    }
    canvas.toBlob((blob) => {
      if (version !== b.version) return;
      if (!blob) return onFail();
      onReady(URL.createObjectURL(blob));
    });
  };
  pic.src = src;
}

// Images cuites oubliées (remontage, démontage) : blobs libérés, cuissons en cours ignorées.
function dropBakes(map: Map<number, Baked>): void {
  for (const b of map.values()) {
    b.version++;
    if (b.url) URL.revokeObjectURL(b.url);
  }
  map.clear();
}

// ---------- Sirène (spec §5.1 : seule exception à la pureté) ----------
// Quand une ambulance du trafic entre dans la scène, SIREN_SHARE des foyers présents et éveillés vont à la fenêtre (ou au
// balcon) la regarder passer : SIREN_LOOK_S secondes, marche d'entrée et de sortie comprises (la scène commence et finit
// dans la pièce, comme toutes les autres). Tirage déterministe par (graine, ambulance, logement) ; l'état (réactions en
// cours) est gardé par le calque, le temps de la scène.
export const SIREN_LOOK_S = 72;
export const SIREN_SHARE = 0.45;
// Nuit profonde (minutes du jour) : personne ne se lève pour une sirène.
const SIREN_QUIET: readonly [number, number] = [30, 360];
// Temps de réaction tiré (s), avant de se mettre en marche vers la fenêtre.
const SIREN_DELAY_S = 8;
// Volets assez ouverts pour se pencher (sinon on ne les ouvre pas pour une sirène).
const SIREN_SHUT_MIN = 0.9;

type Sched = { segments: readonly Segment[] };
// Membre chez lui à la minute T du jour : ni sorti (de son départ moins la montée de l'escalier à son retour plus la montée).
function memberHome(today: Sched, mem: number, T: number, climb: number): boolean {
  let home = true;
  const evts = today.segments.filter((g): g is Extract<Segment, { k: 'return' | 'depart' }> => (g.k === 'return' || g.k === 'depart') && g.m === mem).sort((a, b) => a.t - b.t);
  for (const g of evts) {
    if (g.k === 'depart' && T >= g.t - climb) home = false;
    else if (g.k === 'return' && T >= g.t + climb) home = true;
  }
  return home;
}

// Foyer présent et éveillé à la minute m : un de ses membres est chez lui, entre la première lumière du jour (lever) et la
// dernière (coucher), ou dans la soirée de la veille qui déborde après minuit ; jamais en nuit profonde. Un foyer parti
// (aucune lumière) ne l'est jamais.
export function sirenPresent(d: Dwelling, today: Sched, yesterday: Sched | null, m: number): boolean {
  const md = ((m % 1440) + 1440) % 1440;
  if (md >= SIREN_QUIET[0] && md < SIREN_QUIET[1]) return false;
  let first = Infinity, last = -Infinity;
  for (const g of today.segments) if (g.k === 'lit') { first = Math.min(first, g.t0); last = Math.max(last, g.t1); }
  let awake = m >= first && m < last;
  if (!awake && yesterday) for (const g of yesterday.segments) if (g.k === 'lit' && g.t1 > 1440 && m + 1440 >= g.t0 && m + 1440 < g.t1) awake = true;
  return awake && d.hh.members.some((_, x) => memberHome(today, x, m, d.climb));
}

// `from` : place du membre assis qui se lève (absente : il arrive de la pièce voisine).
// `opens` : la fenêtre était fermée, la réaction l'ouvre et la referme (déjà ouverte, on n'y touche pas).
export type SirenLook = { m: number; room: Room; where: Where; choreo: 'lean' | 'leanRail'; t0: number; t1: number; opens: boolean; from?: number };
// Réaction d'un logement à la sirène `key` entendue à la minute m, ou null. `members` : membres qui ont un pantin (le calque
// les monte pour la journée) ; `room` : pièce de la fenêtre où l'on se penche ; `balcony` : balcon devant le salon.
// Qui y va : un membre chez lui sans scène en cours (il arrive de la pièce voisine), sinon un membre assis dans cette pièce
// (télé, lecture, table) dont la scène dure au-delà de la réaction : il se lève, va à la fenêtre et revient s'asseoir (sa
// scène reprend telle quelle). Personne ne quitte une autre pièce où on le voit, ni un geste en cours.
export function sirenLook(d: Dwelling, today: Schedule, yesterday: Schedule | null, m: number, seed: number, key: string, o: { members: readonly number[]; room: Room; balcony: boolean; wet: boolean }): SirenLook | null {
  const rng = mulberry32(seed ^ hashString(key) ^ d.key);
  // Toujours deux tirages : la présence ne décale pas le reste.
  const r = rng(), delay = rng();
  if (r >= SIREN_SHARE || !sirenPresent(d, today, yesterday, m)) return null;
  const st = homeState(d, today, yesterday, m);
  // Quelqu'un est déjà dehors (penché, balcon) : il regarde déjà la rue.
  if (st.actors.some((a) => a.where !== 'in')) return null;
  if ((st.shut[o.room] ?? 1) < SIREN_SHUT_MIN) return null;
  const t0 = m + (delay * SIREN_DELAY_S) / 60;
  const t1 = t0 + SIREN_LOOK_S / 60;
  // Rien de prévu pour ce membre avant la fin de la réaction (sortie comprise) : aucune scène qui commence (elle serait cachée
  // par la réaction, puis il reparaîtrait au milieu sans marche d'entrée), aucun départ (il descendrait la cage encore penché).
  const busyUntil = t1 + IN_OUT_S / 60;
  const planned = (x: number): boolean =>
    today.segments.some((g) => (g.k === 'act' && g.m === x && g.t0 >= m && g.t0 < busyUntil) || (g.k === 'depart' && g.m === x && g.t - d.climb >= m && g.t - d.climb < t1)) ||
    !!yesterday?.segments.some((g) => g.k === 'act' && g.m === x && g.t0 - 1440 >= m && g.t0 - 1440 < busyUntil);
  const home = o.members.filter((x) => x < d.hh.members.length && memberHome(today, x, m, d.climb) && !planned(x));
  let mem = home.find((x) => !st.actors.some((a) => a.m === x));
  let from: number | undefined;
  if (mem === undefined) {
    for (const x of home) {
      const acts = st.actors.filter((a) => a.m === x);
      const a = acts[0];
      if (acts.length !== 1 || !a || a.room !== o.room || a.where !== 'in' || a.p <= 0) continue;
      const pose = windowPose(a, d);
      // Fin de sa scène (minutes) : t / p est sa durée.
      if (!pose || !pose.still || m - a.t + a.t / a.p < t1 + 0.5) continue;
      mem = x;
      from = pose.dx;
      break;
    }
  }
  if (mem === undefined) return null;
  const out = o.balcony && o.room === 'salon' && !o.wet;
  return { m: mem, room: o.room, where: out ? 'balcony' : 'lean', choreo: out ? 'leanRail' : 'lean', t0, t1, opens: (st.win[o.room] ?? 0) < 0.5, ...(from !== undefined ? { from } : {}) };
}

// Segments ajoutés à l'emploi du temps du jour pour une réaction : la scène (événement, priorité 5), la fenêtre ouverte à
// l'arrivée devant elle et refermée au départ si elle était fermée (balcon : la porte-fenêtre). Placés en tête : la scène de la réaction passe
// avant celle, en cours, du membre assis (le calque ne dessine que la première scène de chaque membre).
export function sirenSegments(s: SirenLook): Segment[] {
  const walk = IN_OUT_S / 60;
  const act: Segment = { k: 'act', t0: s.t0, t1: s.t1, room: s.room, where: s.where, choreo: s.choreo, m: s.m, slot: 0, event: true, ...(s.from !== undefined ? { from: s.from } : {}) };
  if (!s.opens) return [act];
  return [
    act,
    { k: 'win', room: s.room, t: s.t0 + walk * 0.7, to: 1, dur: 0.15 },
    { k: 'win', room: s.room, t: s.t1 - walk, to: 0, dur: 0.15 },
  ];
}

type Placed = { a: Actor; pose: WindowPose };
type Carry = { life: SceneLife; since: number | null };
// Réaction à la sirène en cours d'un logement : segments ajoutés et emploi du temps du jour complété (refait si celui-ci change).
type SirenRx = { look: SirenLook; extra: Segment[]; base: Schedule | null; merged: Schedule | null };
// Décision de l'instant pour un pantin : nœud voulu, et son double vivant tant que l'image cuite ne le montre pas.
type FigPlan = { fi: number; want: Slot | null; mirror: Slot | null };

// `sirens` : clés des ambulances dans la scène à l'instant (city-life.tsx, trafic) ; `seed` : graine de la ville (tirage des réactions).
export function WindowLifeLayer({ facades, life, sky, minutes, still, width, gloom = false, seed = 0, sirens }: { facades: Facade[]; life: SceneLife; sky: Sky; minutes: number; still: boolean; width: number; gloom?: boolean; seed?: number; sirens?: () => readonly string[] }): ReactElement {
  const reg = useFigureRegistry();
  const prefix = `wl${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const root = useRef<SVGGElement | null>(null);
  // Pluie qui commence (ou cesse) le même jour : l'ancien emploi du temps est gardé pour les scènes extérieures commencées
  // (balcon, penché) jusqu'à leur fin ; `since` : minute de la bascule, prise par la boucle.
  const carry = useRef<Carry | null>(null);
  const lastLife = useRef(life);
  if (lastLife.current !== life) {
    const prev = lastLife.current;
    carry.current = prev.day.iso === life.day.iso && prev.day.wet !== life.day.wet ? { life: prev, since: null } : null;
    lastLife.current = life;
  }
  const carryLife = carry.current?.life ?? null;
  // Nœuds de la journée : remontés quand la largeur, les façades ou le jour changent (clé du groupe), complétés à la bascule
  // humide (membres et accessoires des deux emplois du temps). L'état initial (minute du montage) donne les attributs de
  // départ ; la boucle les tient à jour ensuite.
  const model = useMemo(() => buildModel(facades, carryLife ? [life, carryLife] : [life], minutes, prefix), [facades, life, carryLife, prefix]); // eslint-disable-line react-hooks/exhaustive-deps
  // Allumage : nuit, ou ciel de mauvais temps (on allume en plein jour, comme les fenêtres du décor).
  const lights = gloom || nightness(sky.daylight) > 0;
  // Ambiance de nuit (voiles des dessins, silhouettes, vitres de nuit) au huitième de jour près, palier de la teinte des
  // pantins (figurePalette) : le calque n'est re-rendu qu'à ces paliers (huit fois par crépuscule), jamais à chaque minute.
  // Le mauvais temps n'assombrit pas les dessins : une façade de jour reste de jour sous un ciel couvert.
  const dayStep = Math.round(sky.daylight * 8) / 8;
  const dark = Math.round(nightness(dayStep) * 100) / 100;
  const night = dark > NIGHT_AT;
  const look = useMemo<Look>(() => ({ night, dark, sky: { ...sky, daylight: dayStep } }), [night, dark, dayStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Conteneur hors du document des façades vivantes (voir FacadeFront), un par calque monté.
  const offstage = useMemo(() => (canBake() ? document.createElementNS(SVG_NS, 'svg') : null), []);
  // Immeubles dont la cuisson a épuisé ses essais : groupe vivant remonté dans la page (comme le repli sans canvas), pour
  // garder volets, rideaux et pantins ; oubliés quand les façades changent.
  const [fallback, setFallback] = useState<{ facades: Facade[]; fis: ReadonlySet<number> } | null>(null);
  const inPage = fallback?.facades === facades ? fallback.fis : NO_FALLBACK;
  const refs = useRef<{ model: Model; el: Element; inPage: ReadonlySet<number>; refs: Refs } | null>(null);
  const clock = useRef<{ m: number; base: number } | null>(null);
  // États par logement (index du modèle), dernière relecture complète, logements à relire à chaque image.
  const states = useRef<{ model: Model | null; st: (HomeState | null)[]; active: boolean[]; full: number }>({ model: null, st: [], active: [], full: -Infinity });
  // Façades cuites (par immeuble), gardées d'un rendu à l'autre (l'image d'avant reste affichée jusqu'à la suivante) ;
  // vidées (et leurs blobs libérés) au remontage du groupe et au démontage.
  const bakes = useRef(new Map<number, Baked>());
  // Admission des scènes dans la borne (clé : sceneKey), vidée seulement au changement de jour ou de largeur (les clés
  // restent valables à la bascule humide) ; `active` : scènes bornées admises en cours (compteur de la borne).
  const admission = useRef({ key: '', seen: new Map<string, boolean>(), stamp: new Map<string, number>(), active: new Set<string>() });
  // Décision de l'instant par pantin (rejouée quand une image cuite arrive, voir `pageSlot`).
  const plans = useRef(new Map<string, FigPlan>());
  // Lueurs des télés allumées tenues vivantes (scintillement écrit à chaque image).
  const tvOn = useRef(new Map<Element, number>());
  // Dernier rendu React des façades (palier de lumière, allumage, modèle) : recuire seulement quand il a changé.
  const rendered = useRef<{ look: Look; lights: boolean; model: Model } | null>(null);
  // Calque montré : hors du document, seulement quand chaque immeuble a sa première image (pas d'éclair sans volets ni
  // rideaux au montage) ; dans la page (repli), tout de suite.
  const ready = useRef(false);
  // Sirène : ambulances déjà entendues (clés), réactions en cours par logement (voir sirenLook).
  const siren = useRef({ key: '', heard: new Set<string>(), live: new Map<string, SirenRx>() });

  const place = useMemo(() => {
    const set = writer();
    // Tableaux réutilisés d'une image à l'autre (pas d'allocation par image hors des états des logements).
    const touched: number[] = [];
    const placed: Map<number, Placed>[] = [];
    const heldBy = new Map<HeldRefs, boolean>();
    const livingRooms = new Set<Room>();
    // Meubles vivants qui attendent l'image cuite qui les montre (cachés à l'arrivée de l'image de leur immeuble).
    const waitingProps = new Set<Element>();
    // Façades réécrites par React depuis la dernière boucle : recuites une fois (et seulement elles).
    const prev = rendered.current;
    const rebake = new Set<number>(!prev || prev.look !== look || prev.lights !== lights || prev.model !== model ? model.facades.map((fm) => fm.fi) : []);
    rendered.current = { look, lights, model };
    const facChanged = new Map<number, { busy: boolean }>();
    const S = (): typeof states.current => states.current;
    const forget = set.forget;
    // Conteneur du groupe vivant d'un immeuble : hors du document (cuit), ou null s'il est dans la page (repli).
    const offOf = (fi: number): Element | null => (offstage && !inPage.has(fi) ? offstage : null);
    const index = new Map(model.dws.map((dm, i) => [dm, i]));
    // Nœud éteint (opacité nulle) : retiré du rendu (display none) plutôt que peint transparent.
    const vis = (el: Element | null | undefined, o: number): void => {
      if (!el) return;
      set(el, 'display', o > 0 ? 'inline' : 'none');
      if (o > 0) set(el, 'opacity', n2(o));
    };
    // Une scène de ce logement commence bientôt (avant la prochaine relecture complète) : relu à chaque image.
    const soon = (dm: DwM, m: number): boolean => {
      for (const t of dm.starts) {
        if (t > m + FULL_EVERY * 1.5) return false;
        if (t > m - 1 / 60) return true;
      }
      return false;
    };
    let done = false;
    return (now: number): void => {
      const el = root.current;
      if (!el) return;
      const tSec = still ? 0 : now;
      // Scintillement des télés (même en mouvement réduit : une valeur fixe).
      for (const [glow, phase] of tvOn.current) set(glow, 'opacity', String(tvGlow('tv', tSec + phase)));
      if (still && done) return;
      done = true;
      if (!refs.current || refs.current.model !== model || refs.current.el !== el || refs.current.inPage !== inPage) {
        if (refs.current && refs.current.el !== el) {
          dropBakes(bakes.current);
          plans.current.clear();
          tvOn.current.clear();
          ready.current = false;
        }
        // Groupe vivant remonté dans la page (repli) : nœuds neufs, tout relu et réécrit.
        if (refs.current && refs.current.inPage !== inPage) states.current.full = -Infinity;
        refs.current = { model, el, inPage, refs: collectRefs(el, offstage, model) };
      }
      if (offstage && !ready.current) set(el, 'display', 'none');
      const R = refs.current.refs;
      let m: number;
      if (still) m = minutes;
      else {
        const c = sceneMinute(clock.current, minutes, now);
        clock.current = c.clock;
        m = c.minutes + (now - Math.floor(now / 60) * 60) / 60;
      }
      const S = states.current;
      if (S.model !== model) {
        S.model = model;
        S.st = model.dws.map(() => null);
        S.active = model.dws.map(() => true);
        S.full = -Infinity;
      }
      const full = still || Math.abs(m - S.full) >= FULL_EVERY;
      if (full) S.full = m;
      // Sirène : une ambulance qui entre dans la scène fait réagir les foyers tirés (une fois par ambulance) ; réactions
      // finies oubliées à la relecture complète. Remis à zéro au changement de jour ou de largeur.
      const SR = siren.current;
      const skey = `${width}|${life.day.iso}`;
      if (SR.key !== skey) {
        SR.key = skey;
        SR.heard.clear();
        SR.live.clear();
      }
      if (sirens && !still) {
        for (const key of sirens()) {
          if (SR.heard.has(key)) continue;
          SR.heard.add(key);
          model.dws.forEach((dm, i) => {
            const id = dm.d.id;
            if (SR.live.has(id)) return;
            const look = sirenLook(dm.d, life.today.get(id)!, life.yesterday.get(id) ?? null, m, seed, key, { members: dm.figs.map((f) => f.m), room: dm.leanRoom, balcony: !!dm.balcony, wet: life.day.wet });
            if (!look) return;
            SR.live.set(id, { look, extra: sirenSegments(look), base: null, merged: null });
            S.active[i] = true;
          });
        }
      }
      if (full) for (const [id, rx] of SR.live) if (m > rx.look.t1 + 1) SR.live.delete(id);
      // Emploi du temps du jour d'un logement, complété de sa réaction à la sirène en cours.
      const todayOf = (id: string): Schedule => {
        const base = life.today.get(id)!;
        const rx = SR.live.get(id);
        if (!rx) return base;
        if (rx.base !== base) {
          rx.base = base;
          rx.merged = { ...base, segments: [...rx.extra, ...base.segments] };
        }
        return rx.merged!;
      };
      const cr = carry.current;
      if (cr && cr.since === null) cr.since = m;
      let carried = false;
      touched.length = 0;
      model.dws.forEach((dm, i) => {
        if (!full && !S.active[i]) return;
        const d = dm.d;
        const st = homeState(d, todayOf(d.id), life.yesterday.get(d.id) ?? null, m);
        if (cr && cr.since !== null) {
          const old = cr.life.today.get(d.id);
          if (old) {
            const keep = homeState(d, old, cr.life.yesterday.get(d.id) ?? null, m).actors.filter((a) => a.where !== 'in' && m - a.t < cr.since!);
            if (keep.length) {
              carried = true;
              st.actors = [...keep, ...st.actors.filter((a) => !keep.some((k) => k.m === a.m))];
            }
          }
        }
        S.st[i] = st;
        touched.push(i);
      });
      if (full && cr && cr.since !== null && !carried) carry.current = null;
      // Poses de l'instant, puis admission des scènes nouvelles dans la borne des chorégraphies animées : décidée UNE fois
      // par scène (logement, membre, début) et gardée jusqu'à sa fin ; une scène admise reste dessinée jusqu'à sa sortie,
      // une scène écartée reste cachée jusqu'à sa fin (pose fixe comprise) : rien n'apparaît ni ne disparaît sur place.
      // Seules les chorégraphies animées (liste de home-state) sont bornées ; la borne compte toutes les scènes admises en
      // cours et ne bloque que les nouvelles, par priorité puis proximité du centre de l'écran (règle de cullAnimated).
      const A = admission.current;
      const akey = `${width}|${life.day.iso}`;
      if (A.key !== akey) {
        A.key = akey;
        A.seen.clear();
        A.stamp.clear();
        A.active.clear();
      }
      const fresh: { a: Actor; key: string; dist: number }[] = [];
      for (const i of touched) {
        const st = S.st[i]!;
        const dm = model.dws[i]!;
        const byM = placed[i] ?? (placed[i] = new Map<number, Placed>());
        byM.clear();
        let moving = false;
        for (const a of st.actors) {
          const key = sceneKey(dm.d.id, a, m);
          const bounded = a.animated;
          let ok = A.seen.get(key);
          if (ok === undefined) {
            if (bounded) fresh.push({ a, key, dist: Math.abs(dm.x - width / 2) });
            else A.seen.set(key, (ok = true));
          }
          A.stamp.set(key, m);
          a.culled = ok === false;
          const pose = windowPose(a, dm.d, still);
          // Compte des animées affichées : scène bornée admise dont la pose bouge.
          a.animated = bounded && ok !== false && !!pose && !pose.still;
          if (pose && !byM.has(a.m)) byM.set(a.m, { a, pose });
          // Relu à chaque image s'il bouge (marche, geste) ou va entrer dans le champ ; une pose fixe attend la relecture
          // complète (la fin de la scène est vue au plus FULL_EVERY plus tard).
          if (!pose || !pose.still) moving = true;
        }
        S.active[i] = moving || soon(dm, m);
      }
      if (fresh.length) {
        fresh.sort((p, q) => q.a.prio - p.a.prio || p.dist - q.dist);
        for (const f of fresh) {
          const ok = A.active.size < MAX_ANIM;
          A.seen.set(f.key, ok);
          if (ok) A.active.add(f.key);
          f.a.culled = !ok;
          if (!ok) f.a.animated = false;
        }
      }
      // Scènes finies (plus vues depuis une relecture complète) : oubliées, et sorties de la borne.
      if (full) {
        for (const [k, t] of A.stamp) {
          if (t === m) continue;
          A.stamp.delete(k);
          A.seen.delete(k);
          A.active.delete(k);
        }
      }
      facChanged.clear();
      for (const i of touched) paint(model.dws[i]!, S.st[i]!, placed[i]!, R, tSec, full);
      for (const fm of model.facades) {
        const c = facChanged.get(fm.fi);
        const b = bakes.current.get(fm.fi);
        if (c || rebake.has(fm.fi) || !b || b.change > b.at || (!offOf(fm.fi) && b.live)) bake(fm, R, !!c, c?.busy ?? false, now);
      }
    };

    // Nœud de la page à montrer pour un pantin : son nœud vivant (`in`, `out`), ou, tant que l'image cuite ne le montre pas
    // encore en pose fixe, son double vivant ; rien tant que l'image le montre encore en pose fixe alors qu'il bouge déjà
    // (il ne paraît jamais deux fois ni ne disparaît entre deux images). Dans la page (repli, sans cuisson) : les nœuds
    // en pose fixe sont visibles tout de suite.
    function pageSlot(key: string, plan: FigPlan): Slot | null {
      if (!plan.want) return null;
      const baked = BAKED_SLOTS.includes(plan.want);
      if (!offOf(plan.fi)) return baked ? null : plan.want;
      const shown = bakes.current.get(plan.fi)?.shown.has(key) ?? false;
      if (baked) return shown ? null : plan.mirror;
      return shown ? null : plan.want;
    }
    function showPage(F: FigSet, slot: Slot | null, direct: boolean): void {
      for (const s of ['in', 'out'] as const) {
        const N = F[s];
        if (!N) continue;
        const on = s === slot;
        const was = N.wrap.getAttribute('display') !== 'none';
        if (direct) {
          N.wrap.setAttribute('display', on ? 'inline' : 'none');
          forget(N.wrap, 'display');
        } else set(N.wrap, 'display', on ? 'inline' : 'none');
        if (!on) set(N.wrap, 'data-anim', '0');
        if (was && !on) hideFigure(reg, N.fig);
      }
    }

    // Façade cuite (voir bakeFront) : recuite quand elle a changé, au plus toutes les BAKE_BUSY_S s pendant qu'un pantin la
    // fait bouger ; l'image d'avant reste affichée jusqu'à la nouvelle. À l'arrivée de l'image, les pantins qui changeaient
    // de pose fixe à vivant (ou l'inverse) basculent en même temps qu'elle.
    function bake(fm: FacM, R: Refs, changed: boolean, busy: boolean, now: number): void {
      const F = R.fronts.get(fm.fi);
      if (!F) return;
      let b = bakes.current.get(fm.fi);
      if (!b) {
        b = { at: -Infinity, change: now, live: true, version: 0, url: null, shown: new Set(), next: new Set(), fails: 0, retry: 0 };
        bakes.current.set(fm.fi, b);
      }
      if (changed || rebake.has(fm.fi)) {
        b.change = now;
        rebake.delete(fm.fi);
      }
      if (inPage.has(fm.fi)) {
        // Essais épuisés, groupe vivant dans la page : montré à la place de l'image (plus de cuisson).
        set(F.live, 'display', 'inline');
        set(F.img, 'display', 'none');
        b.live = true;
        return;
      }
      if (b.change <= b.at || now < b.retry) return;
      if (offstage) {
        if (busy && now - b.at < BAKE_BUSY_S && !still) return;
      } else {
        // Repli dans la page (sans canvas) : le groupe vivant est montré.
        if (!b.live) {
          set(F.live, 'display', 'inline');
          set(F.img, 'display', 'none');
          b.live = true;
        }
      }
      b.at = now;
      // Pantins en pose fixe que montrera cette image.
      const next = new Set<string>();
      for (const dm of fm.dws) {
        for (const f of dm.figs) {
          const N = R.figs.get(f.key);
          if (BAKED_SLOTS.some((s) => N?.[s]?.wrap.getAttribute('display') === 'inline')) next.add(f.key);
        }
      }
      b.next = next;
      const bb = b;
      bakeFront(F.live, F.img as SVGImageElement, fm.box, bb, (url) => {
        if (bb.url) URL.revokeObjectURL(bb.url);
        bb.url = url;
        bb.shown = bb.next;
        F.img.setAttribute('href', url);
        // Écritures hors de la boucle : le cache des écritures n'est pas tenu, on écrit directement.
        if (!offstage) F.live.setAttribute('display', 'none');
        F.img.setAttribute('display', 'inline');
        forget(F.live, 'display');
        forget(F.img, 'display');
        bb.live = false;
        // Meubles vivants de cet immeuble qui attendaient cette image.
        for (const e of [...waitingProps]) {
          if (fm.dws.some((dm) => e.closest(`[data-wl-in="${dm.d.id}"]`))) {
            e.setAttribute('display', 'none');
            forget(e, 'display');
            waitingProps.delete(e);
          }
        }
        // Pantins de cet immeuble qui attendaient cette image.
        for (const dm of fm.dws) {
          for (const f of dm.figs) {
            const plan = plans.current.get(f.key);
            const N = R.figs.get(f.key);
            if (plan && N) showPage(N, pageSlot(f.key, plan), true);
          }
        }
        bb.fails = 0;
        showWhenBaked();
      }, () => {
        // Ratée : nouvel essai un peu plus tard (la façade est marquée changée), puis on n'attend plus cet immeuble.
        bb.fails++;
        if (bb.fails <= BAKE_TRIES) {
          bb.change = Math.max(bb.change, bb.at + 1e-6);
          bb.retry = now + BAKE_RETRY_S;
        } else if (offstage) setFallback((f) => ({ facades, fis: new Set([...(f?.facades === facades ? f.fis : []), fm.fi]) }));
        showWhenBaked();
      });
    }
    // Calque montré quand chaque immeuble a sa première image (ou a épuisé ses essais).
    function showWhenBaked(): void {
      const el = root.current;
      if (el && !ready.current && model.facades.every((x) => { const b = bakes.current.get(x.fi); return !!b && (!!b.url || b.fails > BAKE_TRIES); })) {
        ready.current = true;
        el.setAttribute('display', 'inline');
        forget(el, 'display');
      }
    }

    // Écritures d'un logement relu : fenêtres (volets, battant, rideaux, meubles, télé, sapin), pantins, garde-corps.
    function paint(dm: DwM, st: HomeState, byM: Map<number, Placed>, R: Refs, tSec: number, full: boolean): void {
      const alphaOf = (room: Room): number => {
        const lit = lights && !!st.lit[room];
        // Derrière un rideau tiré (seulement si la fenêtre a des rideaux : sans eux, la piste du salon ne cache rien).
        if (lit) return dm.byRoom.get(room)?.curtain && (st.curt[room] ?? 0) > 0.6 ? ALPHA.behindCurtain : ALPHA.lit;
        if ((st.win[room] ?? 0) > 0.4) return ALPHA.open;
        return night ? 0 : ALPHA.day;
      };
      let frontWrites = 0;
      // Fenêtres (volets, battant, rideaux, meubles, télé, sapin) : à la relecture complète, ou à chaque image quand un pantin
      // les manœuvre (volets, rideaux) ; elles ne bougent pas autrement entre deux relectures.
      let hands = full;
      if (!hands) for (const { a } of byM.values()) if (HANDS.has(a.choreo)) hands = true;
      if (hands) for (const w of dm.wins) {
        const w0 = set.writes();
        const W = R.wins.get(w.key);
        if (!W) continue;
        const lit = lights && !!st.lit[w.room];
        // Positions arrondies au vingtième : une façade cuite n'est recuite qu'à chaque pas visible (un volet qui s'ouvre en
        // 1,2 min : 20 cuissons, pas une par seconde).
        const shut = step20(st.shut[w.room] ?? 1);
        if (w.shutters) {
          // Persienne repliée dans l'embrasure : rien à dessiner.
          vis(W.shutters, w.shutters === 'persienne' && shut >= 0.98 ? 0 : 1);
          const tr = shutterTransform(shut, w.shutters);
          const sl = shutterLit(w.shutters, shut, lit);
          for (const leaf of W.leaves) set(leaf, 'transform', tr);
          for (const e of W.slatsDark) vis(e, 1 - sl);
          for (const e of W.slatsLit) vis(e, sl);
        }
        if (W.sash) {
          const o = step20(st.win[w.room] ?? 0);
          vis(W.sashGroup, o > 0.01 ? 1 : 0);
          set(W.sash, 'transform', `scale(${n2(o)} 1)`);
        }
        if (w.curtain && W.panels.length === 2) {
          const c = curtainAttrs(w.win.w, step20(st.curt[w.room] ?? 0), lit, night);
          set(W.panels[0], 'transform', `translate(${n2(w.win.x)} ${n2(w.win.y)}) scale(${c.sx} 1)`);
          set(W.panels[1], 'transform', `translate(${n2(w.win.x + w.win.w)} ${n2(w.win.y)}) scale(${-c.sx} 1)`);
          for (const e of W.curtDay) vis(e, c.day);
          for (const e of W.curtNight) vis(e, 1 - c.day);
          for (const e of W.folds) vis(e, c.folds);
          const [vl, vd, vn, li] = W.voile;
          vis(vl, c.voileLit);
          vis(vd, c.voileDay);
          vis(vn, c.voileNight);
          vis(li, c.lines);
        }
        frontWrites += set.writes() - w0;
      }
      // Pièces où un pantin bouge (nœud vivant sous l'image) : leurs meubles passent dans la page, sous lui (le cuisinier
      // devant son plan de cuisson, le marcheur devant la table) ; ailleurs ils restent cuits.
      livingRooms.clear();
      for (const { a, pose } of byM.values()) {
        if (a.culled || pose.where !== 'in' || pose.still) continue;
        const shadow = !!dm.byRoom.get(a.room)?.curtain && (st.curt[a.room] ?? 0) > 0.6 && lights && !!st.lit[a.room];
        if (!shadow) livingRooms.add(a.room);
      }
      // Meubles, télé, sapin : à chaque relecture du logement (quelques nœuds).
      for (const w of dm.wins) {
        const w0 = set.writes();
        const W = R.wins.get(w.key);
        if (!W) continue;
        const lit = lights && !!st.lit[w.room];
        const alpha = alphaOf(w.room);
        const living = livingRooms.has(w.room);
        let tvLive = false;
        let pageW = 0;
        for (const p of W.props) {
          // Le meuble d'une scène écartée par la borne reste dessiné : seul le pantin ne l'est pas.
          let on = false;
          for (const { a } of byM.values()) if (a.room === w.room && interiorOf(a.choreo, a.desk) === p.kind) on = true;
          // Membre assis levé pour la sirène : sa scène continue (télé, table), son meuble reste dessiné.
          if (!on) for (const a of st.actors) if (a.room === w.room && byM.get(a.m)?.a.from !== undefined && interiorOf(a.choreo, a.desk) === p.kind) on = true;
          vis(p.g, on && !living ? (lit ? 1 : alpha) : 0);
          const x0 = set.writes();
          // Meuble rendu à l'image cuite : le vivant reste montré jusqu'à l'image qui le contient (rideau d'attente).
          const handBack = !!offOf(dm.d.facade) && on && !living && p.live?.getAttribute('display') === 'inline';
          if (handBack) waitingProps.add(p.live!);
          else {
            waitingProps.delete(p.live!);
            vis(p.live, on && living ? (lit ? 1 : alpha) : 0);
          }
          pageW += set.writes() - x0;
          if (p.kind !== 'tv') continue;
          // Télé allumée : son écran sort de l'image cuite (trou à sa place) et scintille dans la page, dessous (rideaux,
          // volets et menuiserie de l'image passent devant) ; sinon écran éteint, cuit.
          tvLive = on && lit && st.tone[w.room] === 'tv';
          vis(p.screen, tvLive ? 0 : 1);
          if (!tvLive) set(p.screenGlow, 'opacity', '0');
        }
        // Seules les écritures de la façade cuite la font recuire (pas celles des meubles vivants de la page).
        frontWrites += set.writes() - w0 - pageW;
        if (W.tv) {
          vis(W.tv, tvLive ? 1 : 0);
          if (W.tvGlow) {
            if (tvLive) tvOn.current.set(W.tvGlow, (hashString(w.key) % 1000) / 100);
            else tvOn.current.delete(W.tvGlow);
          }
        }
        if (W.sapin) {
          const o = st.sapin ? (lit ? 1 : night ? 0 : 0.6) : 0;
          vis(W.sapin, o);
          if (o > 0) for (let k = 0; k < W.bulbs.length; k++) vis(W.bulbs[k], bulbOn(tSec, k));
        }
      }
      let onBalcony = false;
      const held = R.held.get(dm.d.id);
      if (held) for (const h of held) heldBy.set(h, false);
      for (const fm of dm.figs) {
        const N = R.figs.get(fm.key);
        if (!N) continue;
        const pl = byM.get(fm.m);
        const wm = pl ? dm.byRoom.get(pl.a.room) : undefined;
        let want: Slot | null = null;
        if (pl && wm && !pl.a.culled) {
          const { a, pose } = pl;
          const { win } = wm;
          const k = (figureHeight(win) * pose.size) / standHeight();
          const x = win.x + win.w / 2 + pose.dx * win.w;
          const bal = pose.where === 'balcony' && dm.balcony ? dm.balcony.bal : null;
          let fy = 0;
          let scale = k;
          let alpha = 1;
          let pageClip = 'none';
          // Au balcon : à contre-jour seulement devant une pièce allumée (voir `Slot`).
          let backlit = true;
          if (pose.where === 'in') {
            // Dedans, vu à travers la vitre (rien derrière des volets plus fermés qu'ouverts). Rideau tiré : son ombre à
            // travers le tissu (à 0,28, par-dessus le rideau) ; sinon sous les rideaux (cuit en pose fixe, vivant sous
            // l'image cuite quand il bouge).
            const base = wm.shutters && (st.shut[a.room] ?? 1) < 0.5 ? 0 : alphaOf(a.room);
            // L'ombre à travers le tissu n'existe que pièce allumée (maquette) ; éteinte, le rideau tiré le cache.
            const drawn = !!wm.curtain && (st.curt[a.room] ?? 0) > 0.6 && lights && !!st.lit[a.room];
            if (base > 0) {
              alpha = drawn ? ALPHA.behindCurtain : base;
              want = drawn ? (pose.still ? 'shade' : 'out') : pose.still ? 'still' : 'in';
            }
            fy = floorOf(win);
            pageClip = `url(#${dm.uid}-${a.room}-in)`;
          } else if (bal) {
            want = 'out';
            onBalcony = true;
            backlit = lights && !!st.lit[a.room];
            fy = bal.by - 0.4;
          } else {
            want = 'out';
            scale = k * LEAN_K;
            fy = win.y + win.h + figureHeight(win) * pose.size * LEAN_K * 0.5;
            pageClip = `url(#${dm.uid}-${a.room}-lean)`;
          }
          if (want) {
            const mirror: Slot | null = want === 'still' ? 'in' : want === 'shade' ? 'out' : null;
            const op = alpha.toFixed(2);
            const tr = `translate(${n2(x)} ${n2(fy)}) scale(${scale.toFixed(4)})`;
            const where = pose.where === 'in' ? 'in' : bal ? 'balcony' : 'lean';
            // Nœud voulu, et son double vivant tant que l'image ne le montre pas.
            for (const s of mirror ? [want, mirror] : [want]) {
              const F = N[s];
              if (!F) continue;
              const baked = BAKED_SLOTS.includes(s);
              const w0 = set.writes();
              const href0 = baked ? F.img?.getAttribute('href') : null;
              // Opacité posée sur l'<image> elle-même (une seule image : le moteur de rendu la fond dans le dessin).
              set(F.img, 'opacity', op);
              set(F.wrap, 'data-alpha', op);
              set(F.pos, 'transform', tr);
              set(F.wrap, 'data-where', where);
              set(F.wrap, 'data-room', wm.key);
              set(F.wrap, 'clip-path', baked ? `url(#${dm.uid}-${a.room}-b)` : pageClip);
              // Allure voulue (l'image peut garder la pose précédente le temps que le registre peigne la nouvelle).
              set(F.wrap, 'data-gait', pose.gait);
              set(F.wrap, 'data-anim', a.animated && !a.culled ? '1' : '0');
              if (baked) set(F.wrap, 'display', 'inline');
              const pk = s === 'out' ? F.wrap.getAttribute(backlit ? 'data-pk-backlit' : 'data-pk-dim') : null;
              if (pk) set(F.fig, 'data-palette', pk);
              poseFigure(reg, F.fig, pose);
              if (baked && (set.writes() !== w0 || F.img?.getAttribute('href') !== href0)) frontWrites++;
            }
            // Accessoires tenus : un par sorte et par logement, posé à la main du premier pantin qui le tient.
            if (held && pose.props.length) {
              for (const h of held) {
                if (heldBy.get(h) || !pose.props.includes(h.kind)) continue;
                heldBy.set(h, true);
                const an = anchorsOf({ sig: fm.sig, yaw: pose.yaw, gait: pose.gait, phase: pose.phase, head: pose.head, arms: pose.arms, lean: pose.lean });
                const hx = h.kind === 'rug' ? (an.handR[0] + an.handL[0]) / 2 : an.handR[0];
                const hy = h.kind === 'rug' ? (an.handR[1] + an.handL[1]) / 2 : an.handR[1];
                set(h.pos, 'transform', `translate(${n2(x + hx * scale)} ${n2(fy + hy * scale)})`);
                set(h.g, 'clip-path', pageClip);
                set(h.g, 'opacity', op);
                if (h.puff) {
                  const cyc = ((((a.t * 60) / SMOKE_CYCLE_S + a.slot) % 1) + 1) % 1;
                  const pa = puffAttrs(still || pose.arms === 'smoke-up' ? -1 : (cyc - SMOKE_UP) / (1 - SMOKE_UP));
                  set(h.puff, 'transform', pa.transform);
                  vis(h.puff, pa.opacity);
                }
                if (h.pour) vis(h.pour, pose.arms === 'water' ? 1 : 0);
              }
            }
            const plan = { fi: dm.d.facade, want, mirror };
            plans.current.set(fm.key, plan);
          }
        }
        if (!want) plans.current.set(fm.key, { fi: dm.d.facade, want: null, mirror: null });
        // Nœuds en pose fixe (cuits) qui ne servent pas : cachés (la façade sera recuite sans eux).
        for (const s of BAKED_SLOTS) {
          const F = N[s];
          if (!F || s === want) continue;
          const w0 = set.writes();
          set(F.wrap, 'display', 'none');
          set(F.wrap, 'data-anim', '0');
          if (set.writes() !== w0) {
            hideFigure(reg, F.fig);
            frontWrites++;
          }
        }
        showPage(N, pageSlot(fm.key, plans.current.get(fm.key)!), false);
      }
      if (held) for (const h of held) set(h.g, 'display', heldBy.get(h) ? 'inline' : 'none');
      if (frontWrites > 0) {
        const c = facChanged.get(dm.d.facade);
        facChanged.set(dm.d.facade, { busy: (c?.busy ?? false) || !!S().active[index.get(dm) ?? -1] });
      }
      const rail = R.rails.get(dm.d.id);
      if (rail) vis(rail, onBalcony ? 1 : 0);
    }
  }, [model, life, still, minutes, night, lights, width, reg, offstage, look, inPage, facades, seed, sirens]);
  useWallClockLoop(place, [place], { frameMs: FRAME_MS });
  useEffect(() => () => dropBakes(bakes.current), []);

  return (
    <g data-window-life="" key={width} ref={root} display={offstage && !ready.current ? 'none' : undefined}>
      <defs>
        {model.dws.map((dm) => (
          <g key={dm.d.id}>
            {/* Un rectangle par <clipPath> (chemin rapide du moteur de rendu : coupe rectangulaire, sans masque). */}
            {dm.wins.map((w) => (
              <g key={w.room}>
                <clipPath id={`${dm.uid}-${w.room}-in`}>
                  <rect x={w.win.x} y={w.win.y} width={w.win.w} height={w.win.h} />
                </clipPath>
                <clipPath id={`${dm.uid}-${w.room}-lean`}>
                  <rect x={w.win.x - LEAN_CLIP.side} y={w.win.y - LEAN_CLIP.above} width={w.win.w + 2 * LEAN_CLIP.side} height={w.win.h + LEAN_CLIP.above + LEAN_CLIP.below} />
                </clipPath>
              </g>
            ))}
          </g>
        ))}
      </defs>
      <g data-wl-pass="inside">
        {model.dws.map((dm) => <DwInside key={dm.d.id} dm={dm} look={look} />)}
      </g>
      <g data-wl-pass="front">
        {model.facades.map((fm) => <FacadeFront key={fm.fi} fm={fm} init={model.init} look={look} lights={lights} offstage={inPage.has(fm.fi) ? null : offstage} />)}
      </g>
      <g data-wl-pass="outside">
        {model.dws.map((dm) => <DwOutside key={dm.d.id} dm={dm} look={look} />)}
      </g>
    </g>
  );
}
