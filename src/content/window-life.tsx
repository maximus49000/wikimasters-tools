import { memo, useId, useMemo, useRef, type ReactElement } from 'react';
import type { FacadeWindow, Home, Level } from '../core/library/city/facade-layout';
import type { Facade } from '../core/library/city/facades';
import { cullAnimated, homeState, type Actor, type HomeState } from '../core/library/city/home-state';
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
import { GhibliFigure, hideFigure, poseFigure, type Held } from './figure/ghibli-figure';
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
// l'ordre de `paintWindow` / `paintLeaner` (07a-facade.js) et de `paintBalcony` (07b-balcon-toit.js) de la maquette, en
// trois passes sur tous les logements :
// 1. dedans, coupé aux vitres du logement (un <clipPath> SVG par logement) : meubles des poses (table, bureau, télé, plan
//    de cuisson), sapin, pantins dans la pièce ;
// 2. devant la vitre : rideaux et voilage, menuiserie redessinée (au-dessus des pantins et des rideaux, comme le décor),
//    battant de la fenêtre ouvert, volets (persiennes repliables haussmanniennes, volets battants du faubourg) ;
// 3. dehors : penchés à l'appui (coupés sous les hanches, second <clipPath> par logement), occupants du balcon, puis le
//    garde-corps redessiné par-dessus eux (ordre de `paintBalcony` : occupants, puis rambarde).
// Perfs Android (contraintes du chantier) : tous les nœuds sont montés pour la journée (remontés seulement quand la largeur
// ou le jour change ; la bascule humide / sec ajoute au plus quelques nœuds) ; la boucle de l'horloge murale (modèle :
// GullsLayer) relit l'état des logements (`homeState`, pur), borne les chorégraphies animées (`cullAnimated`), choisit les
// poses (`windowPose`) et n'écrit un attribut que s'il change ; pas de clip-path CSS, pas de SMIL, aucune transition.
// Pantins : toujours le pantin 2D (`flat`), un par membre du foyer (ou invité) qui joue une scène dans la journée, monté
// deux fois (dedans, dehors) pour l'ordre de dessin ; silhouette unie #1A1422 la nuit. Mouvement réduit : une pose fixe
// par minute (`windowPose(…, reduced)`), rien ne marche.

// Image de la boucle (ms) : la marche (cycle de 0,9 s en 12 phases) à 15 images par seconde suffit derrière une vitre.
const FRAME_MS = 66;
// Relecture complète de tous les logements (minutes) ; entre deux, seuls ceux qui ont une scène, une télé ou un sapin.
const FULL_EVERY = 0.5 / 60;
// Persiennes métalliques des immeubles haussmanniens (notes.md §Couleurs), une par immeuble.
const PERSIENNES = ['#C4CCC8', '#B8C0B4', '#CCC4AC'] as const;
// Opacité d'un pantin dedans (maquette, `alphaIn`) : pièce allumée (derrière un rideau tiré : ombre), fenêtre ouverte, de
// jour derrière la vitre fermée (sous le reflet), la nuit dans une pièce éteinte (rien).
const ALPHA = { lit: 0.95, behindCurtain: 0.28, open: 0.9, day: 0.3 } as const;
// Penché : buste plus grand que nature (sort du plan de la façade), hanches à l'appui (maquette : × 1,08, pieds à + 0,5 h).
const LEAN_K = 1.08;
// Cadre du penché autour de la vitre (maquette `paintLeaner`) : 2,5 px de chaque côté, 6 px au-dessus, 0,5 px sous l'appui.
const LEAN_CLIP = { side: 2.5, above: 6, below: 0.5 } as const;
// Une nuit « noire » (silhouettes, vitres de nuit) au-delà de cette obscurité (maquette : dark > 0,2).
const NIGHT_AT = 0.2;
// Cycle du fumeur (s), comme window-choreo.ts : bouffée pendant les 30 % du début, volute ensuite.
const SMOKE_CYCLE_S = 11;
const SMOKE_UP = 0.3;
// Accessoires tenus par chorégraphie, et meubles des poses.
const HELD: Partial<Record<Choreo, HandProp>> = {
  smoke: 'cigarette', water: 'watering-can', shake: 'rug', cook: 'spoon', read: 'book', table: 'cup',
};
// Accessoires tenus dehors (penché, balcon) ; les autres (cuillère, livre, tasse) se tiennent dans la pièce : chacun n'est
// monté que sur le pantin du côté où il sert.
const OUTSIDE_HELD: ReadonlySet<HandProp> = new Set(['cigarette', 'watering-can', 'rug']);
const STAND = { yaw: 4, gait: 'stand', phase: 0, head: 0, arms: 'down', lean: 0 } as const;

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

type WinM = { win: FacadeWindow; room: Room; shutters: ShutterKind | null; color: string; curtain: Home['curtain']; sash: boolean; props: InteriorKind[]; sapin: boolean };
type FigM = { key: string; m: number; outfit: Outfit; props: HandProp[] };
type DwM = {
  d: Dwelling; uid: string; x: number; wall: string; wins: WinM[]; byRoom: Map<Room, WinM>; figs: FigM[];
  balcony: { win: FacadeWindow; bal: Balcony; rail: string } | null; joinery: string;
};
type Model = { dws: DwM[]; init: Map<string, HomeState> };

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
        : d.shutters === 'persienne' && win.kind !== 'mezz' ? 'persienne' : null;
      const props = new Set<InteriorKind>();
      for (const a of acts) if (a.room === room) { const k = interiorOf(a.choreo, !!a.desk); if (k) props.add(k); }
      wins.push({
        win, room, shutters, color: shutters === 'battant' ? layout!.shutters! : persienne,
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
    const figs = [...members.entries()].sort((a, b) => a[0] - b[0]).map(([m, props]): FigM => ({ key: `${d.id}/${m}`, m, outfit: windowOutfit(d, m), props: [...props] }));
    const salon = byRoom.get('salon');
    const bal = salon && salonLevel ? balconyOf(salon.win, salonLevel, layout?.x) : null;
    const filant = (salonLevel as Level | null)?.balcony === 'filant';
    dws.push({
      d, uid: `${prefix}-${d.id.replace(/[^0-9a-z]/gi, '-')}`,
      x: wins.reduce((s, w) => s + w.win.x + w.win.w / 2, 0) / wins.length,
      wall: layout?.wall ?? '#EDE2C8', wins, byRoom, figs,
      balcony: d.balcony && salon && bal ? { win: salon.win, bal, rail: railPath(salon.win, bal, filant, layout ? layout.x + layout.w - 1 : Infinity) } : null,
      joinery: wins.map((w) => joineryPath(w.win)).join(''),
    });
  }
  return { dws, init: lifeStates(life, minutes) };
}

// ---------- Rendu (monté pour la journée) ----------

type Look = { night: boolean; dark: number; sky: Sky };

const FigNode = memo(function FigNode({ fm, side, look }: { fm: FigM; side: 'in' | 'out'; look: Look }): ReactElement {
  const held: Held[] = fm.props.filter((k) => OUTSIDE_HELD.has(k) === (side === 'out')).map((k) => ({
    anchor: k === 'rug' ? 'hands' : 'handR',
    node: (
      <g data-wl-held={k} display="none">
        <g data-wl-unscale="">
          <HeldProp kind={k} at={[0, 0]} phase={-1} night={look.night} dark={look.dark} />
        </g>
      </g>
    ),
  }));
  return (
    <g data-wl-fig={fm.key} data-side={side} data-anim="0" display="none">
      <GhibliFigure outfit={fm.outfit} sky={look.sky} rainy={false} umbrella={false} initial={STAND} hidden flat silhouette={look.night} held={held} />
    </g>
  );
});

const DwInside = memo(function DwInside({ dm, st, look }: { dm: DwM; st: HomeState | undefined; look: Look }): ReactElement {
  return (
    <g data-wl-in={dm.d.id} clipPath={`url(#${dm.uid}-in)`}>
      {dm.wins.map((w) => (
        <g key={w.room} data-wl-room={`${dm.d.id}/${w.room}`}>
          {w.props.map((k) => (
            <g key={k} data-wl-prop={k} opacity={0}>
              <InteriorProp win={w.win} kind={k} tone={st?.tone[w.room] ?? 'warm'} flicker={0} dark={look.dark} />
            </g>
          ))}
          {w.sapin && (
            <g data-wl-sapin="" opacity={0}>
              <Sapin win={w.win} night={look.night} blink={0} />
            </g>
          )}
        </g>
      ))}
      {dm.figs.map((fm) => <FigNode key={fm.key} fm={fm} side="in" look={look} />)}
    </g>
  );
});

const DwFront = memo(function DwFront({ dm, st, look, lights }: { dm: DwM; st: HomeState | undefined; look: Look; lights: boolean }): ReactElement {
  return (
    <g data-wl-front={dm.d.id}>
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

const DwOutside = memo(function DwOutside({ dm, look }: { dm: DwM; look: Look }): ReactElement {
  return (
    <g data-wl-out={dm.d.id}>
      {dm.figs.map((fm) => <FigNode key={fm.key} fm={fm} side="out" look={look} />)}
      {dm.balcony && <path data-wl-rail="" d={dm.balcony.rail} fill="none" stroke={INK} strokeWidth={0.5} opacity={0} />}
    </g>
  );
});

// ---------- Nœuds relus par la boucle ----------

type FigRefs = { wrap: Element; fig: Element | null; held: { kind: HandProp; g: Element; unscale: Element | null; puff: Element | null; pour: Element | null }[] };
type WinRefs = {
  props: { kind: InteriorKind; g: Element; screen: Element | null }[]; sapin: Element | null; bulbs: Element[];
  panels: Element[]; curtDay: Element[]; curtNight: Element[]; folds: Element[]; voile: (Element | null)[];
  sash: Element | null; leaves: Element[]; slatsDark: Element[]; slatsLit: Element[];
};
type Refs = { figs: Map<string, { in: FigRefs; out: FigRefs }>; wins: Map<string, WinRefs>; rails: Map<string, Element> };

function collectRefs(root: Element, model: Model): Refs {
  // Un seul parcours par sorte de nœud (jsdom et WebView : pas de recherche par logement dans tout le calque).
  const figOf = (wrap: Element): FigRefs => ({
    wrap, fig: wrap.querySelector('[data-figure]'),
    held: [...wrap.querySelectorAll('[data-wl-held]')].map((g) => ({ kind: g.getAttribute('data-wl-held') as HandProp, g, unscale: g.querySelector('[data-wl-unscale]'), puff: g.querySelector('[data-puff]'), pour: g.querySelector('[data-pour]') })),
  });
  const figs = new Map<string, { in: FigRefs; out: FigRefs }>();
  const half = new Map<string, FigRefs>();
  for (const wrap of root.querySelectorAll('[data-wl-fig]')) {
    const key = wrap.getAttribute('data-wl-fig')!;
    const side = wrap.getAttribute('data-side');
    const r = figOf(wrap);
    const other = half.get(key);
    if (!other) half.set(key, r);
    else figs.set(key, side === 'in' ? { in: r, out: other } : { in: other, out: r });
  }
  const rails = new Map<string, Element>();
  for (const rail of root.querySelectorAll('[data-wl-rail]')) rails.set(rail.parentElement!.getAttribute('data-wl-out')!, rail);
  const byAttr = (attr: string): Map<string, Element> => new Map([...root.querySelectorAll(`[${attr}]`)].map((e) => [e.getAttribute(attr)!, e]));
  const rooms = byAttr('data-wl-room');
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
        sapin: room?.querySelector('[data-wl-sapin]') ?? null,
        bulbs: all(room, '[data-bulb]'),
        panels: all(front, '[data-curtain-panel]'),
        curtDay: all(front, '[data-curtain-day]'),
        curtNight: all(front, '[data-curtain-night]'),
        folds: all(front, '[data-curtain-folds]'),
        voile: ['[data-voile-lit]', '[data-voile-day]', '[data-voile-night]', '[data-voile-lines]'].map((sel) => front?.querySelector(sel) ?? null),
        sash: front2?.querySelector('[data-sash-leaf]') ?? null,
        leaves: all(front2, '[data-shutter-leaf]'),
        slatsDark: all(front2, '[data-slats-dark]'),
        slatsLit: all(front2, '[data-slats-lit]'),
      });
    }
  }
  return { figs, wins, rails };
}

// Écriture d'un attribut seulement s'il change : valeur gardée par nœud (relue sur le nœud au premier passage, après un
// rendu React qui a pu la réécrire).
function writer(): (el: Element | null | undefined, name: string, value: string) => void {
  const seen = new WeakMap<Element, Map<string, string>>();
  return (el, name, value) => {
    if (!el) return;
    let m = seen.get(el);
    if (!m) seen.set(el, (m = new Map()));
    const was = m.has(name) ? m.get(name) : el.getAttribute(name);
    if (was !== value) el.setAttribute(name, value);
    m.set(name, value);
  };
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
  const darkV = gloom ? 1 : nightness(sky.daylight);
  const lights = gloom || nightness(sky.daylight) > 0;
  const night = nightness(sky.daylight) > NIGHT_AT;
  const dark = Math.round(darkV * 20) / 20;
  // Teinte des pantins au huitième de jour près (palier de figurePalette) : pas de re-rendu à chaque minute.
  const dayStep = Math.round(sky.daylight * 8) / 8;
  const look = useMemo<Look>(() => ({ night, dark, sky: { ...sky, daylight: dayStep } }), [night, dark, dayStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const refs = useRef<{ model: Model; el: Element; refs: Refs } | null>(null);
  const clock = useRef<{ m: number; base: number } | null>(null);
  // États par logement (index du modèle), dernière relecture complète, logements à relire à chaque image.
  const states = useRef<{ model: Model | null; st: (HomeState | null)[]; active: boolean[]; full: number }>({ model: null, st: [], active: [], full: -Infinity });
  const shownSide = useRef(new Map<string, 'in' | 'out' | null>());

  const place = useMemo(() => {
    const set = writer();
    let done = false;
    return (now: number): void => {
      const el = root.current;
      if (!el) return;
      if (still && done) return;
      done = true;
      if (!refs.current || refs.current.model !== model || refs.current.el !== el) {
        refs.current = { model, el, refs: collectRefs(el, model) };
        shownSide.current = new Map();
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
      const touched: number[] = [];
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
        S.active[i] = st.actors.length > 0 || st.sapin || dm.wins.some((w) => st.tone[w.room] === 'tv' && st.lit[w.room]);
        touched.push(i);
      });
      if (full && cr && cr.since !== null && !carried) carry.current = null;
      // Poses de l'instant ; une pose fixe atteinte (ou hors champ) ne prend pas de place dans la borne des animées.
      const placed = new Map<number, Map<number, Placed>>();
      for (const i of touched) {
        const st = S.st[i]!;
        const dm = model.dws[i]!;
        const byM = new Map<number, Placed>();
        for (const a of st.actors) {
          const pose = windowPose(a, dm.d, still);
          if (!pose || pose.still) a.animated = false;
          if (pose && !byM.has(a.m)) byM.set(a.m, { a, pose });
        }
        placed.set(i, byM);
      }
      cullAnimated(model.dws.flatMap((dm, i) => (S.st[i] && placed.has(i) ? [{ st: S.st[i]!, x: dm.x }] : [])), width / 2);
      for (const i of touched) paint(model.dws[i]!, S.st[i]!, placed.get(i)!, R, now);
    };

    // Écritures d'un logement relu : fenêtres (volets, battant, rideaux, meubles, sapin), pantins, garde-corps.
    function paint(dm: DwM, st: HomeState, byM: Map<number, Placed>, R: Refs, now: number): void {
      const tSec = still ? 0 : now;
      const alphaOf = (room: Room): number => {
        const lit = lights && !!st.lit[room];
        if (lit) return (st.curt[room] ?? 0) > 0.6 ? ALPHA.behindCurtain : ALPHA.lit;
        if ((st.win[room] ?? 0) > 0.4) return ALPHA.open;
        return night ? 0 : ALPHA.day;
      };
      for (const w of dm.wins) {
        const W = R.wins.get(`${dm.d.id}/${w.room}`);
        if (!W) continue;
        const lit = lights && !!st.lit[w.room];
        const shut = st.shut[w.room] ?? 1;
        if (w.shutters) {
          const tr = shutterTransform(shut, w.shutters);
          const sl = shutterLit(w.shutters, shut, lit);
          for (const leaf of W.leaves) set(leaf, 'transform', tr);
          for (const s of W.slatsDark) set(s, 'opacity', String(1 - sl));
          for (const s of W.slatsLit) set(s, 'opacity', String(sl));
        }
        if (W.sash) set(W.sash, 'transform', `scale(${n2(st.win[w.room] ?? 0)} 1)`);
        if (w.curtain && W.panels.length === 2) {
          const c = curtainAttrs(w.win.w, st.curt[w.room] ?? 0, lit, night);
          set(W.panels[0], 'transform', `translate(${n2(w.win.x)} ${n2(w.win.y)}) scale(${c.sx} 1)`);
          set(W.panels[1], 'transform', `translate(${n2(w.win.x + w.win.w)} ${n2(w.win.y)}) scale(${-c.sx} 1)`);
          for (const e of W.curtDay) set(e, 'opacity', String(c.day));
          for (const e of W.curtNight) set(e, 'opacity', String(1 - c.day));
          for (const e of W.folds) set(e, 'opacity', String(c.folds));
          const [vl, vd, vn, li] = W.voile;
          set(vl, 'opacity', String(c.voileLit));
          set(vd, 'opacity', String(c.voileDay));
          set(vn, 'opacity', String(c.voileNight));
          set(li, 'opacity', String(c.lines));
        }
        const alpha = alphaOf(w.room);
        for (const p of W.props) {
          const on = [...byM.values()].some(({ a }) => a.room === w.room && !a.culled && interiorOf(a.choreo, a.desk) === p.kind);
          set(p.g, 'opacity', on ? n2(lit ? 1 : alpha) : '0');
          if (p.screen) set(p.screen, 'opacity', String(on && lit ? tvGlow(st.tone[w.room] ?? 'warm', tSec) : 0));
        }
        if (W.sapin) {
          set(W.sapin, 'opacity', st.sapin ? (lit ? '1' : night ? '0' : '0.6') : '0');
          W.bulbs.forEach((b, k) => set(b, 'opacity', String(bulbOn(tSec, k))));
        }
      }
      let onBalcony = false;
      for (const fm of dm.figs) {
        const F = R.figs.get(fm.key);
        if (!F) continue;
        const pl = byM.get(fm.m);
        const wm = pl ? dm.byRoom.get(pl.a.room) : undefined;
        let side: 'in' | 'out' | null = null;
        if (pl && wm && !pl.a.culled) {
          const { a, pose } = pl;
          const { win } = wm;
          const k = (figureHeight(win) * pose.size) / standHeight();
          const x = win.x + win.w / 2 + pose.dx * win.w;
          const bal = pose.where === 'balcony' && dm.balcony ? dm.balcony.bal : null;
          let tr: string;
          let scale = k;
          if (pose.where === 'in') {
            const alpha = alphaOf(a.room);
            if (alpha > 0) {
              side = 'in';
              tr = `translate(${n2(x)} ${n2(floorOf(win))}) scale(${k.toFixed(4)})`;
              set(F.in.wrap, 'opacity', alpha.toFixed(2));
            } else tr = '';
          } else if (bal) {
            side = 'out';
            onBalcony = true;
            tr = `translate(${n2(x)} ${n2(bal.by - 0.4)}) scale(${k.toFixed(4)})`;
            set(F.out.wrap, 'clip-path', 'none');
          } else {
            side = 'out';
            scale = k * LEAN_K;
            const hh = figureHeight(win) * pose.size * LEAN_K;
            tr = `translate(${n2(x)} ${n2(win.y + win.h + hh * 0.5)}) scale(${scale.toFixed(4)})`;
            set(F.out.wrap, 'clip-path', `url(#${dm.uid}-lean)`);
          }
          if (side) {
            const T = side === 'in' ? F.in : F.out;
            set(T.wrap, 'transform', tr);
            set(T.wrap, 'data-anim', a.animated && !a.culled ? '1' : '0');
            poseFigure(reg, T.fig, pose);
            for (const h of T.held) {
              const has = pose.props.includes(h.kind);
              set(h.g, 'display', has ? 'inline' : 'none');
              if (!has) continue;
              set(h.unscale, 'transform', `scale(${(1 / scale).toFixed(3)})`);
              if (h.puff) {
                const cyc = ((((a.t * 60) / SMOKE_CYCLE_S + a.slot) % 1) + 1) % 1;
                const pa = puffAttrs(still || pose.arms === 'smoke-up' ? -1 : (cyc - SMOKE_UP) / (1 - SMOKE_UP));
                set(h.puff, 'transform', pa.transform);
                set(h.puff, 'opacity', String(pa.opacity));
              }
              if (h.pour) set(h.pour, 'opacity', pose.arms === 'water' ? '1' : '0');
            }
          }
        }
        const was = shownSide.current.get(fm.key) ?? null;
        set(F.in.wrap, 'display', side === 'in' ? 'inline' : 'none');
        set(F.out.wrap, 'display', side === 'out' ? 'inline' : 'none');
        if (side !== 'in') set(F.in.wrap, 'data-anim', '0');
        if (side !== 'out') set(F.out.wrap, 'data-anim', '0');
        if (was !== side) {
          if (was === 'in' || (was === null && side !== 'in')) hideFigure(reg, F.in.fig);
          if (was === 'out' || (was === null && side !== 'out')) hideFigure(reg, F.out.fig);
          shownSide.current.set(fm.key, side);
        }
      }
      const rail = R.rails.get(dm.d.id);
      if (rail) set(rail, 'opacity', onBalcony ? '1' : '0');
    }
  }, [model, life, still, minutes, night, lights, width, reg]);
  useWallClockLoop(place, [place], { frameMs: FRAME_MS });

  return (
    <g data-window-life="" key={`${width}|${life.day.iso}`} ref={root}>
      <defs>
        {model.dws.map((dm) => (
          <g key={dm.d.id}>
            <clipPath id={`${dm.uid}-in`}>
              {dm.wins.map((w) => <rect key={w.room} x={w.win.x} y={w.win.y} width={w.win.w} height={w.win.h} />)}
            </clipPath>
            <clipPath id={`${dm.uid}-lean`}>
              {dm.wins.map((w) => <rect key={w.room} x={w.win.x - LEAN_CLIP.side} y={w.win.y - LEAN_CLIP.above} width={w.win.w + 2 * LEAN_CLIP.side} height={w.win.h + LEAN_CLIP.above + LEAN_CLIP.below} />)}
            </clipPath>
          </g>
        ))}
      </defs>
      <g data-wl-pass="inside">
        {model.dws.map((dm) => <DwInside key={dm.d.id} dm={dm} st={model.init.get(dm.d.id)} look={look} />)}
      </g>
      <g data-wl-pass="front">
        {model.dws.map((dm) => <DwFront key={dm.d.id} dm={dm} st={model.init.get(dm.d.id)} look={look} lights={lights} />)}
      </g>
      <g data-wl-pass="outside">
        {model.dws.map((dm) => <DwOutside key={dm.d.id} dm={dm} look={look} />)}
      </g>
    </g>
  );
}
