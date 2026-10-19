import { memo, useEffect, useId, useMemo, useRef, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { FacadeWindow, Home, Level } from '../core/library/city/facade-layout';
import type { Facade } from '../core/library/city/facades';
import { MAX_ANIM, homeState, type Actor, type HomeState } from '../core/library/city/home-state';
import type { Dwelling, Room } from '../core/library/city/households';
import { outfitFor, type Outfit } from '../core/library/city/people';
import type { Choreo, Segment } from '../core/library/city/schedules';
import { windowPose, type HandProp, type WindowPose } from '../core/library/city/window-choreo';
import { nightness } from '../core/library/city/window-lights';
import { anchorsOf } from '../core/library/figure/bake';
import { shapeOf, signatureOf } from '../core/library/figure/dress';
import { INK } from '../core/library/paint/cel';
import { hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { GhibliFigure, hideFigure, poseFigure } from './figure/ghibli-figure';
import { useFigureRegistry, type FigureRegistry } from './figure/figure-host';
import { BAR_STEP, balconyOf, joineryPath, type Balcony } from './ghibli-window-art';
import { lifeStates, sceneMinute, type SceneLife } from './use-scene-life';
import { useWallClockLoop } from './use-wallclock-loop';
import {
  Curtains, HeldProp, InteriorProp, Sapin, Sash, Shutters, bulbOn, curtainAttrs, figureHeight, floorOf, puffAttrs, shutterLit, shutterTransform, tvGlow,
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
// Délai (s) sans changement avant de recuire une façade montrée vivante pendant qu'un pantin la faisait bouger.
const BAKE_SETTLE_S = 1;
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
      // Volets battants : fenêtres courantes loin des bords du mur (maquette) ; persiennes : toutes, sauf l'entresol.
      const shutters = d.shutters === 'battant'
        ? (win.kind === 'std' && layout && win.x - 2.6 > layout.x + 1 && win.x + win.w + 2.6 < layout.x + layout.w - 1 ? 'battant' : null)
        : d.shutters === 'persienne' && win.kind !== 'mezz' && closes(room) ? 'persienne' : null;
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

// Pantin d'un membre, monté deux fois : `still` (pose fixe dans la pièce : dans la façade cuite, sous les rideaux) et
// `live` (marche, geste, penché, balcon : dessiné au-dessus de la façade cuite) ; la boucle montre l'un ou l'autre et pose
// le <clipPath> du nœud vivant (vitre de la pièce, cadre du penché, aucun au balcon).
const FigNode = memo(function FigNode({ fm, look, slot }: { fm: FigM; look: Look; slot: 'still' | 'live' }): ReactElement {
  const fig = (
    <g data-wl-pos="">
      <GhibliFigure outfit={fm.outfit} sky={look.sky} rainy={false} umbrella={false} initial={STAND} hidden flat silhouette={look.night} />
    </g>
  );
  // Groupe coupé par le <clipPath> rectangulaire de sa vitre (ou du cadre du penché ; aucun au balcon), posé par la boucle.
  return (
    <g data-wl-fig={fm.key} data-slot={slot} data-anim="0" display="none">
      {fig}
    </g>
  );
});

// Dedans, vivant : le sapin (sa guirlande clignote, il n'est pas cuit).
const DwInside = memo(function DwInside({ dm, look }: { dm: DwM; look: Look }): ReactElement {
  return (
    <g data-wl-in={dm.d.id}>
      {dm.wins.map((w) =>
        w.sapin ? (
          <g key={w.room} data-wl-sapin={`${dm.d.id}/${w.room}`} display="none" clipPath={`url(#${dm.uid}-${w.room}-in)`}>
            <Sapin win={w.win} night={look.night} blink={0} />
          </g>
        ) : null,
      )}
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
      {dm.figs.map((fm) => <FigNode key={fm.key} fm={fm} look={look} slot="live" />)}
      {dm.held.map((k) => (
        <g key={k} data-wl-held={k} display="none">
          <g data-wl-pos="">
            <HeldProp kind={k} at={[0, 0]} phase={-1} night={look.night} dark={look.dark} />
          </g>
        </g>
      ))}
      {dm.balcony && <path data-wl-rail="" d={dm.balcony.rail} fill="none" stroke={INK} strokeWidth={0.5} opacity={0} />}
    </g>
  );
});

// ---------- Nœuds relus par la boucle ----------

type FigRefs = { wrap: Element; pos: Element | null; fig: Element | null; img: Element | null };
type HeldRefs = { kind: HandProp; g: Element; pos: Element | null; puff: Element | null; pour: Element | null };
type WinRefs = {
  props: { kind: InteriorKind; g: Element; screen: Element | null }[]; sapin: Element | null; bulbs: Element[];
  panels: Element[]; curtDay: Element[]; curtNight: Element[]; folds: Element[]; voile: (Element | null)[];
  sash: Element | null; sashGroup: Element | null; shutters: Element | null; leaves: Element[]; slatsDark: Element[]; slatsLit: Element[];
};
type Refs = { figs: Map<string, { still: FigRefs | null; live: FigRefs | null }>; held: Map<string, HeldRefs[]>; wins: Map<string, WinRefs>; rails: Map<string, Element>; fronts: Map<number, { live: Element; img: Element }> };

function collectRefs(page: Element, offstage: Element | null, model: Model): Refs {
  // Nœuds de la page et des façades vivantes hors du document.
  const root = { querySelectorAll: (sel: string): Element[] => [...page.querySelectorAll(sel), ...(offstage ? offstage.querySelectorAll(sel) : [])] };
  // Un seul parcours par sorte de nœud (jsdom et WebView : pas de recherche par logement dans tout le calque).
  const figs = new Map<string, { still: FigRefs | null; live: FigRefs | null }>();
  for (const wrap of root.querySelectorAll('[data-wl-fig]')) {
    const key = wrap.getAttribute('data-wl-fig')!;
    const e = figs.get(key) ?? { still: null, live: null };
    e[wrap.getAttribute('data-slot') === 'still' ? 'still' : 'live'] = { wrap, pos: wrap.querySelector('[data-wl-pos]'), fig: wrap.querySelector('[data-figure]'), img: wrap.querySelector('[data-figure] > image') };
    figs.set(key, e);
  }
  const held = new Map<string, HeldRefs[]>();
  for (const g of root.querySelectorAll('[data-wl-held]')) {
    const id = g.parentElement!.getAttribute('data-wl-out')!;
    const list = held.get(id) ?? [];
    list.push({ kind: g.getAttribute('data-wl-held') as HandProp, g, pos: g.querySelector('[data-wl-pos]'), puff: g.querySelector('[data-puff]'), pour: g.querySelector('[data-pour]') });
    held.set(id, list);
  }
  const rails = new Map<string, Element>();
  for (const rail of root.querySelectorAll('[data-wl-rail]')) rails.set(rail.parentElement!.getAttribute('data-wl-out')!, rail);
  const byAttr = (attr: string): Map<string, Element> => new Map([...root.querySelectorAll(`[${attr}]`)].map((e) => [e.getAttribute(attr)!, e]));
  const rooms = byAttr('data-wl-room');
  const sapins = byAttr('data-wl-sapin');
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
        props: all(room, '[data-wl-prop]').map((g) => ({ kind: g.getAttribute('data-wl-prop') as InteriorKind, g, screen: g.querySelector('[data-screen]') })),
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
type Baked = { at: number; change: number; live: boolean; version: number; url: string | null };
// Cuisson possible : image, canvas et blobs réels (pas jsdom).
const canBake = (): boolean =>
  typeof document !== 'undefined' && typeof Image !== 'undefined' && typeof URL.createObjectURL === 'function' && !(typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'));
function bakeFront(live: Element, img: SVGImageElement, box: readonly [number, number, number, number], b: Baked, onReady: (url: string) => void): void {
  // Sans canvas réel (jsdom) : rien, le groupe vivant reste montré.
  if (!canBake()) return;
  const [x, y, w, h] = box;
  const ctm = img.getScreenCTM?.();
  const k = Math.min(BAKE_SCALE.max, Math.max(BAKE_SCALE.min, ctm ? Math.abs(ctm.a) * (window.devicePixelRatio || 1) : BAKE_SCALE.fallback));
  const inner = new XMLSerializer().serializeToString(live).replace(/ display="none"/, '');
  const W = Math.max(1, Math.ceil(w * k)), H = Math.max(1, Math.ceil(h * k));
  const svg = `<svg xmlns="${SVG_NS}" viewBox="${x} ${y} ${w} ${h}" width="${W}" height="${H}">${inner}</svg>`;
  const version = ++b.version;
  // Source SVG en blob, libérée sitôt dessinée : le document SVG décodé ne reste pas vivant en mémoire (une image SVG gardée
  // en cache coûte à chaque image de la page, mesuré).
  const src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const pic = new Image();
  const done = (): void => {
    URL.revokeObjectURL(src);
    pic.onload = pic.onerror = null;
    pic.removeAttribute('src');
  };
  pic.onerror = done;
  pic.onload = () => {
    const ok = version === b.version;
    const canvas = ok ? document.createElement('canvas') : null;
    const ctx = canvas ? ((canvas.width = W), (canvas.height = H), canvas.getContext('2d')) : null;
    if (ctx) ctx.drawImage(pic, 0, 0, W, H);
    done();
    if (!canvas || !ctx) return;
    canvas.toBlob((blob) => {
      if (!blob || version !== b.version) return;
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

type Placed = { a: Actor; pose: WindowPose };
type Carry = { life: SceneLife; since: number | null };

export function WindowLifeLayer({ facades, life, sky, minutes, still, width, gloom = false }: { facades: Facade[]; life: SceneLife; sky: Sky; minutes: number; still: boolean; width: number; gloom?: boolean }): ReactElement {
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
  const refs = useRef<{ model: Model; el: Element; refs: Refs } | null>(null);
  const clock = useRef<{ m: number; base: number } | null>(null);
  // États par logement (index du modèle), dernière relecture complète, logements à relire à chaque image.
  const states = useRef<{ model: Model | null; st: (HomeState | null)[]; active: boolean[]; full: number }>({ model: null, st: [], active: [], full: -Infinity });
  // Façades cuites (par logement), gardées d'un rendu à l'autre ; vidées (et leurs blobs libérés) au remontage.
  const bakes = useRef(new Map<number, Baked>());
  // Admission des scènes dans la borne (clé : sceneKey) et dernière minute où chacune a été vue.
  const admission = useRef({ model: null as Model | null, seen: new Map<string, boolean>(), stamp: new Map<string, number>() });

  const place = useMemo(() => {
    const set = writer();
    // Tableaux réutilisés d'une image à l'autre (pas d'allocation par image hors des états des logements).
    const touched: number[] = [];
    const placed: Map<number, Placed>[] = [];
    const heldBy = new Map<HeldRefs, boolean>();
    // Façades à recuire après ce rendu React (palier de lumière : voiles et étoffes de nuit réécrits par React).
    const rebake = new Set(model.facades.map((fm) => fm.fi));
    const facChanged = new Map<number, { busy: boolean }>();
    const S = (): typeof states.current => states.current;
    const forget = set.forget;
    const index = new Map(model.dws.map((dm, i) => [dm, i]));
    // Nœud éteint (opacité nulle) : retiré du rendu (display none) plutôt que peint transparent.
    const vis = (el: Element | null | undefined, o: number): void => {
      if (!el) return;
      set(el, 'display', o > 0 ? 'inline' : 'none');
      if (o > 0) set(el, 'opacity', n2(o));
    };
    let done = false;
    return (now: number): void => {
      const el = root.current;
      if (!el) return;
      if (still && done) return;
      done = true;
      if (!refs.current || refs.current.model !== model || refs.current.el !== el) {
        refs.current = { model, el, refs: collectRefs(el, offstage, model) };
        dropBakes(bakes.current);
      }
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
      const cr = carry.current;
      if (cr && cr.since === null) cr.since = m;
      let carried = false;
      touched.length = 0;
      model.dws.forEach((dm, i) => {
        if (!full && !S.active[i]) return;
        const d = dm.d;
        const st = homeState(d, life.today.get(d.id)!, life.yesterday.get(d.id) ?? null, m);
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
      // Seules les chorégraphies animées (liste de home-state) sont bornées ; la borne ne bloque que les nouvelles
      // admissions, par priorité puis proximité du centre de l'écran (règle de cullAnimated).
      const A = admission.current;
      if (A.model !== model) {
        A.model = model;
        A.seen.clear();
      }
      let live = 0;
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
          } else if (ok && bounded) live++;
          A.stamp.set(key, m);
          a.culled = ok === false;
          const pose = windowPose(a, dm.d, still);
          // Compte des animées affichées : scène bornée admise dont la pose bouge.
          a.animated = bounded && !!pose && !pose.still;
          if (pose && !byM.has(a.m)) byM.set(a.m, { a, pose });
          // Relu à chaque image seulement s'il bouge (marche, geste) ou va entrer dans le champ ; une pose fixe attend la
          // relecture complète (la fin de la scène est vue au plus FULL_EVERY plus tard).
          if (!pose || !pose.still) moving = true;
        }
        S.active[i] = moving;
      }
      if (fresh.length) {
        fresh.sort((p, q) => q.a.prio - p.a.prio || p.dist - q.dist);
        for (const f of fresh) {
          const ok = live < MAX_ANIM;
          if (ok) live++;
          A.seen.set(f.key, ok);
          f.a.culled = !ok;
          if (!ok) f.a.animated = false;
        }
      }
      // Scènes finies (plus vues depuis une relecture complète) : oubliées.
      if (full) for (const [k, t] of A.stamp) if (t !== m) { A.stamp.delete(k); A.seen.delete(k); }
      facChanged.clear();
      for (const i of touched) paint(model.dws[i]!, S.st[i]!, placed[i]!, R, now, full);
      for (const fm of model.facades) {
        const c = facChanged.get(fm.fi);
        const b = bakes.current.get(fm.fi);
        if (c || rebake.has(fm.fi) || !b || b.change > b.at || (!offstage && b.live)) bake(fm, R, !!c, c?.busy ?? false, now);
      }
    };

    // Façade cuite (voir bakeFront) : recuite quand elle a changé ; pendant qu'un pantin la fait bouger (rideau tiré à la
    // main, volets poussés), le groupe vivant est montré à la place, et l'image est recuite une seconde après le dernier
    // changement. Un rendu React (palier de lumière) recrée la boucle : tout est recuit une fois.
    function bake(fm: FacM, R: Refs, changed: boolean, busy: boolean, now: number): void {
      const F = R.fronts.get(fm.fi);
      if (!F) return;
      let b = bakes.current.get(fm.fi);
      if (!b) bakes.current.set(fm.fi, (b = { at: -Infinity, change: now, live: true, version: 0, url: null }));
      if (changed || rebake.has(fm.fi)) {
        b.change = now;
        rebake.delete(fm.fi);
      }
      if (b.change <= b.at) return;
      // Façade vivante hors du document : recuite au fil de ses changements, au plus toutes les BAKE_BUSY_S secondes
      // pendant qu'un pantin la fait bouger (rideau tiré à la main).
      if (offstage) {
        if (busy && now - b.at < BAKE_BUSY_S && !still) return;
      } else {
        const showLive = (): void => {
          if (b!.live) return;
          set(F.live, 'display', 'inline');
          set(F.img, 'display', 'none');
          b!.live = true;
        };
        if (changed && busy && !still) return showLive();
        if (b.live && b.url !== null && now - b.change < BAKE_SETTLE_S && !still) return;
        showLive();
      }
      b.at = now;
      const bb = b;
      bakeFront(F.live, F.img as SVGImageElement, fm.box, bb, (url) => {
        if (bb.url) URL.revokeObjectURL(bb.url);
        bb.url = url;
        F.img.setAttribute('href', url);
        // Écritures hors de la boucle : le cache des écritures n'est pas tenu, on écrit directement.
        if (!offstage) F.live.setAttribute('display', 'none');
        F.img.setAttribute('display', 'inline');
        forget(F.live, 'display');
        forget(F.img, 'display');
        bb.live = false;
      });
    }

    // Écritures d'un logement relu : fenêtres (volets, battant, rideaux, meubles, sapin), pantins, garde-corps.
    function paint(dm: DwM, st: HomeState, byM: Map<number, Placed>, R: Refs, now: number, full: boolean): void {
      const tSec = still ? 0 : now;
      const alphaOf = (room: Room): number => {
        const lit = lights && !!st.lit[room];
        if (lit) return (st.curt[room] ?? 0) > 0.6 ? ALPHA.behindCurtain : ALPHA.lit;
        if ((st.win[room] ?? 0) > 0.4) return ALPHA.open;
        return night ? 0 : ALPHA.day;
      };
      let frontWrites = 0;
      // Fenêtres (volets, battant, rideaux, meubles, sapin) : à la relecture complète, ou à chaque image quand un pantin les
      // manœuvre (volets, rideaux) ; elles ne bougent pas autrement entre deux relectures.
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
        const alpha = alphaOf(w.room);
        for (const p of W.props) {
          // Le meuble d'une scène écartée par la borne reste dessiné : seul le pantin ne l'est pas.
          let on = false;
          for (const { a } of byM.values()) if (a.room === w.room && interiorOf(a.choreo, a.desk) === p.kind) on = true;
          vis(p.g, on ? (lit ? 1 : alpha) : 0);
          // Écran fixe (pas de scintillement) : il est cuit avec la façade.
          if (p.screen && on) vis(p.screen, lit ? tvGlow(st.tone[w.room] ?? 'warm', 0) : 0);
        }
        frontWrites += set.writes() - w0;
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
        const pair = R.figs.get(fm.key);
        if (!pair) continue;
        const pl = byM.get(fm.m);
        const wm = pl ? dm.byRoom.get(pl.a.room) : undefined;
        let which: 'still' | 'live' | null = null;
        if (pl && wm && !pl.a.culled) {
          const { a, pose } = pl;
          const { win } = wm;
          const k = (figureHeight(win) * pose.size) / standHeight();
          const x = win.x + win.w / 2 + pose.dx * win.w;
          const bal = pose.where === 'balcony' && dm.balcony ? dm.balcony.bal : null;
          let fy = 0;
          let scale = k;
          let clip = 'none';
          let alpha = 1;
          if (pose.where === 'in') {
            // Dedans : vu à travers la vitre (rien derrière des volets plus fermés qu'ouverts) ; en pose fixe, cuit avec la
            // façade (sous les rideaux), sinon vivant par-dessus.
            alpha = wm.shutters && (st.shut[a.room] ?? 1) < 0.5 ? 0 : alphaOf(a.room);
            if (alpha > 0) which = pose.still && pair.still ? 'still' : 'live';
            fy = floorOf(win);
            clip = `url(#${dm.uid}-${a.room}-${which === 'still' ? 'b' : 'in'})`;
          } else if (bal) {
            which = 'live';
            onBalcony = true;
            fy = bal.by - 0.4;
          } else {
            which = 'live';
            scale = k * LEAN_K;
            fy = win.y + win.h + figureHeight(win) * pose.size * LEAN_K * 0.5;
            clip = `url(#${dm.uid}-${a.room}-lean)`;
          }
          const F = which ? pair[which] : null;
          if (F) {
            const w0 = set.writes();
            const href0 = F.img?.getAttribute('href');
            const op = alpha.toFixed(2);
            // Opacité posée sur l'<image> elle-même (une seule image : le moteur de rendu la fond dans le dessin) et non sur
            // un groupe (qui demanderait un calque intermédiaire par pantin à chaque image de la rue).
            set(F.img, 'opacity', op);
            set(F.wrap, 'data-alpha', op);
            set(F.pos, 'transform', `translate(${n2(x)} ${n2(fy)}) scale(${scale.toFixed(4)})`);
            set(F.wrap, 'data-where', pose.where === 'in' ? 'in' : bal ? 'balcony' : 'lean');
            set(F.wrap, 'clip-path', clip);
            // Allure voulue (l'image peut garder la pose précédente le temps que le registre peigne la nouvelle).
            set(F.wrap, 'data-gait', pose.gait);
            set(F.wrap, 'data-anim', a.animated && !a.culled ? '1' : '0');
            set(F.wrap, 'display', 'inline');
            poseFigure(reg, F.fig, pose);
            if (which === 'still' && (set.writes() !== w0 || F.img?.getAttribute('href') !== href0)) frontWrites++;
            // Accessoires tenus : un par sorte et par logement, posé à la main du premier pantin qui le tient.
            if (held && pose.props.length) {
              for (const h of held) {
                if (heldBy.get(h) || !pose.props.includes(h.kind)) continue;
                heldBy.set(h, true);
                const an = anchorsOf({ sig: fm.sig, yaw: pose.yaw, gait: pose.gait, phase: pose.phase, head: pose.head, arms: pose.arms, lean: pose.lean });
                const hx = h.kind === 'rug' ? (an.handR[0] + an.handL[0]) / 2 : an.handR[0];
                const hy = h.kind === 'rug' ? (an.handR[1] + an.handL[1]) / 2 : an.handR[1];
                set(h.pos, 'transform', `translate(${n2(x + hx * scale)} ${n2(fy + hy * scale)})`);
                set(h.g, 'clip-path', which === 'still' ? `url(#${dm.uid}-${a.room}-in)` : clip);
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
          } else which = null;
        }
        // Le nœud qui ne sert pas : caché (et son sprite rendu au registre).
        for (const slot of ['still', 'live'] as const) {
          const F = pair[slot];
          if (!F || slot === which) continue;
          const w0 = set.writes();
          set(F.wrap, 'display', 'none');
          set(F.wrap, 'data-anim', '0');
          if (set.writes() !== w0) {
            hideFigure(reg, F.fig);
            if (slot === 'still') frontWrites++;
          }
        }
      }
      if (held) for (const h of held) set(h.g, 'display', heldBy.get(h) ? 'inline' : 'none');
      if (frontWrites > 0) {
        const c = facChanged.get(dm.d.facade);
        facChanged.set(dm.d.facade, { busy: (c?.busy ?? false) || !!S().active[index.get(dm) ?? -1] });
      }
      const rail = R.rails.get(dm.d.id);
      if (rail) vis(rail, onBalcony ? 1 : 0);
    }
  }, [model, life, still, minutes, night, lights, width, reg, offstage]);
  useWallClockLoop(place, [place], { frameMs: FRAME_MS });
  useEffect(() => () => dropBakes(bakes.current), []);

  return (
    <g data-window-life="" key={`${width}|${life.day.iso}`} ref={root}>
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
        {model.facades.map((fm) => <FacadeFront key={fm.fi} fm={fm} init={model.init} look={look} lights={lights} offstage={offstage} />)}
      </g>
      <g data-wl-pass="outside">
        {model.dws.map((dm) => <DwOutside key={dm.d.id} dm={dm} look={look} />)}
      </g>
    </g>
  );
}
