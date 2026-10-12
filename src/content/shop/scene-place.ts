import { shapeOf, signatureOf } from '../../core/library/figure/dress';
import type { FigureKey } from '../../core/library/figure/bake';
import { phaseIndexOf } from '../../core/library/figure/gait';
import type { ArmPose, Gait } from '../../core/library/figure/skeleton';
import { DOOR_WIDTH } from '../../core/library/city/doors';
import { entranceOpening, type Passage } from '../../core/library/city/doorway';
import { STREET_SCALE } from '../../core/library/city/metrics';
import { INSIDE_SCALE } from '../../core/library/city/shops/customers';
import type { BudgetSprite } from '../../core/library/city/shops/sprite-budget';
import type { PropId } from '../../core/library/city/shops/scene/moves';
import { trackAt, type ActorView } from '../../core/library/city/shops/scene/score';
import { sidewalkAt, type SidewalkView } from '../../core/library/city/shops/scene/sidewalk';
import { slotIndexAt, slotStart } from '../../core/library/city/shops/scene/slots';
import type { ActorTrack, Score } from '../../core/library/city/shops/scene/types';
import type { Horn } from '../../core/library/city/traffic/horns';
import { placeSill } from '../door-passage';
import type { FigureRegistry } from '../figure/figure-host';
import { figurePalette, hideFigure, poseFigure } from '../figure/ghibli-figure';
import { pictoLook } from './picto';
import { peekScore, pumpScore, slotGate } from './scene-scores';
import {
  HAND_L, STAFF_SCALE, anchorAt, free, headOf, hornHead, infoOf, partySize, placeSlots, runtimes, sceneBudgetOf, setIf, slotsOf, staffTrack, turnOn,
  type ShopRt, type Slot, type SlotAt,
} from './scene-read';

export { CARRIED, STAFF_SCALE, runtimes, workOf, type ShopRt } from './scene-read';

// Boucle de la scène Ghibli des commerces (G4b) : lit les partitions des créneaux N−1, N, N+1 et pose la réserve de nœuds
// rendue par ShopScene, sans re-rendu ni création de nœud. Un client visible reçoit un nœud libre de la réserve (tenue posée sur
// sa figure : data-sig / data-palette, puis poseFigure) et le garde tant qu'il est visible ; dans la vitrine, un client qui
// marche passe devant les immobiles (calque avant, +1 px). Objets, montures et pictos : emplacements partagés de la boutique,
// posés aux accroches du pantin. Klaxons : surcouche de tête, sans toucher aux partitions.

type Where = 'inside' | 'street' | 'door' | null;
type Entry = { inner: Element; street: Element; door: Element; inFig: Element | null; outFig: Element | null; sillFig: Element | null; actor: string | null; where: Where; front: boolean; seen: number };
type StaffNode = { id: string; clip: Element; body: Element; fig: Element | null };
type Look = { sig: string; pk: string };
type ShopState = {
  rt: ShopRt | null; entries: Entry[]; staff: StaffNode[]; back: Element; front: Element;
  props: Slot[]; worn: Slot[]; carry: Slot[]; pictos: Slot[];
  assign: Map<string, Entry>; admitted: Set<string>; refused: Set<string>; looks: Map<string, Look>; tick: number;
};
export type SceneNodes = { shops: { st: ShopState; rt: ShopRt }[]; muted: Set<string> };
// Emplacements par boutique : objets en main dans la vitrine, objets emportés sur le trottoir.
export const PROP_SLOTS = 3;
export const CARRY_SLOTS = 2;
// Ce que montrent les emplacements d'une boutique à cette image (rempli par les poses, appliqué à la fin).
type Shown = { props: SlotAt[]; worn: SlotAt[]; carry: SlotAt[]; pictos: SlotAt[] };
type Seen = { track: ActorTrack; v: ActorView; side: SidewalkView | null; carry: PropId | null; sc: Score };

const states = new WeakMap<Element, ShopState>();
const figOf = (holder: Element | null): Element | null => holder?.querySelector('[data-figure]') ?? null;

function stateOf(el: Element): ShopState | null {
  const got = states.get(el);
  if (got) return got;
  const win = el.querySelector(':scope > svg[data-scene]');
  const back = win?.querySelector(':scope > [data-scene-back]');
  const front = win?.querySelector(':scope > [data-scene-front]');
  if (!win || !back || !front) return null;
  const streets = el.querySelectorAll(':scope > [data-scene-street]');
  const doors = el.querySelectorAll(':scope > svg[data-scene-door]');
  const entries = [...back.querySelectorAll(':scope > [data-scene-actor]')].map((inner, i): Entry => ({
    inner, street: streets[i]!, door: doors[i]!, inFig: figOf(inner), outFig: figOf(streets[i]!), sillFig: figOf(doors[i]!), actor: null, where: null, front: false, seen: 0,
  }));
  const staff = [...win.querySelectorAll(':scope > svg[data-scene-staff]')].map((clip): StaffNode => {
    const body = clip.querySelector(':scope > [data-scene-fig]')!;
    return { id: clip.getAttribute('data-scene-staff')!, clip, body, fig: figOf(body) };
  });
  const st: ShopState = {
    rt: null, entries, staff, back, front,
    props: slotsOf(win, '[data-prop-slot]', 'data-scene-prop'), worn: slotsOf(win, '[data-worn-slot]', 'data-worn-yaw'),
    carry: slotsOf(el, '[data-carry-slot]', 'data-scene-prop'), pictos: slotsOf(win, '[data-picto-slot]', 'data-picto-glyph', '[data-picto-pop]'),
    assign: new Map(), admitted: new Set(), refused: new Set(), looks: new Map(), tick: 0,
  };
  states.set(el, st);
  return st;
}

// Nœuds de la scène sous `root` (une fois par jeu de nœuds) ; l'état de la boucle (affectations) survit aux re-rendus.
export function collectScene(root: Element): SceneNodes {
  const shops: SceneNodes['shops'] = [];
  for (const el of root.querySelectorAll('[data-scene-shop]')) {
    const rt = runtimes.get(el);
    const st = rt ? stateOf(el) : null;
    if (!rt || !st) continue;
    // Nouveau rendu (ciel, minute) : les tenues sont recalculées.
    if (st.rt !== rt) st.looks.clear();
    st.rt = rt;
    shops.push({ st, rt });
  }
  return { shops, muted: new Set() };
}

// Partis retirés par le plafond (ids d'acteurs `<parti>:<rang>` rendus par spriteBudget) : pour la minute, ils ne sont pas admis ;
// un parti déjà admis reste.
export function muteScene(nodes: SceneNodes, drop: ReadonlySet<string>): void {
  nodes.muted = new Set([...drop].filter((id) => id.includes(':')).map((id) => id.slice(0, id.lastIndexOf(':'))));
}
export const sceneBudget = (nodes: SceneNodes, t: number): BudgetSprite[] => sceneBudgetOf(nodes.shops, t);

function lookOf(st: ShopState, rt: ShopRt, track: ActorTrack, out: boolean, figures: FigureRegistry): Look {
  const k = `${track.id}|${out ? 1 : 0}`;
  let l = st.looks.get(k);
  if (!l) {
    const work = track.role === 'staff' ? rt.work : 'none';
    l = { sig: signatureOf(shapeOf(track.outfit, out && rt.umbrella, work)), pk: figures.addPalette(figurePalette(track.outfit, out ? rt.sky : rt.inSky, out && rt.rainy)) };
    st.looks.set(k, l);
  }
  return l;
}
// Habille une figure de la réserve (n'écrit qu'au changement d'acteur ou de palette ; React ne relit jamais ces attributs).
function wear(fig: Element | null, l: Look, figures: FigureRegistry): void {
  if (!fig || (fig.getAttribute('data-sig') === l.sig && fig.getAttribute('data-palette') === l.pk)) return;
  hideFigure(figures, fig);
  fig.setAttribute('data-sig', l.sig);
  fig.setAttribute('data-palette', l.pk);
}

function release(e: Entry, figures: FigureRegistry): void {
  for (const [node, fig] of [[e.inner, e.inFig], [e.street, e.outFig], [e.door, e.sillFig]] as const) {
    turnOn(node, false);
    hideFigure(figures, fig);
  }
  e.actor = null;
  e.where = null;
}

// Pose d'un pantin de la vitrine (employé ou client) ; objet en main (caché sous `clipY` : derrière le comptoir), monture portée
// et picto aux accroches de la pose.
function poseInside(fig: Element | null, v: ActorView, sig: string, head: number, x: number, y: number, k: number, clipY: number, out: Shown, figures: FigureRegistry): void {
  const pose = { yaw: v.yaw, gait: v.gait as Gait, phase: v.phase, head, arms: v.arms, lean: v.lean };
  poseFigure(figures, fig, pose);
  const key: FigureKey = { sig, ...pose };
  if (v.worn) {
    const [hx, hy] = anchorAt(key, 'head', x, y, k);
    out.worn.push({ id: String((((v.yaw + head) % 16) + 16) % 16), x: hx, y: hy, k });
  } else if (v.prop) {
    const [px, py] = anchorAt(key, HAND_L.has(v.prop) ? 'handL' : 'handR', x, y, k);
    if (py <= clipY) out.props.push({ id: v.prop, x: px, y: py, k });
  }
  const look = v.picto ? pictoLook(v.picto.age) : null;
  if (v.picto && look) {
    const [px, py] = anchorAt(key, 'headTop', x, y, k);
    out.pictos.push({ id: v.picto.id, x: px, y: py, k, pop: look });
  }
}

const REST_VIEW: ActorView = {
  id: '', role: 'staff', where: 'inside', x: 0, yaw: 4, gait: 'stand', phase: 0, arms: 'down', lean: 0, headYaw: 0, prop: null, worn: false, picto: null,
  party: null, outfit: undefined as never, scale: 1, enterAt: null, exitAt: null, arriveAt: null, dir: null,
};

function placeStaff(st: ShopState, rt: ShopRt, sc: Score | null, tIn: number, sec: number, t: number, horns: readonly Horn[], figures: FigureRegistry, out: Shown): void {
  const stage = rt.plan.stage;
  // Repos (mouvement réduit, partition pas encore prête) : les présents à leur poste, tournés vers la salle ; un seul en
  // mouvement réduit (comme StaffLayer).
  let resting: StaffNode[] | null = null;
  if (!sc) {
    const present = st.staff.filter((s) => rt.plan.staff.find((x) => x.id === s.id)?.spans.some(([a, b]) => sec >= a && sec < b));
    resting = rt.still ? present.slice(0, 1) : present.slice(0, stage.posts.length);
  }
  for (const s of st.staff) {
    const tr = sc ? staffTrack(sc, s.id) : undefined;
    let v: ActorView | null = tr ? trackAt(tr, tIn) : null;
    if (resting) {
      const i = resting.indexOf(s);
      v = i < 0 ? null : { ...REST_VIEW, x: stage.posts[i % stage.posts.length]!, yaw: stage.doorEdge === 'left' ? 5 : 3 };
    }
    const on = rt.open && v !== null && v.where === 'inside';
    turnOn(s.clip, on);
    if (!on || !v) {
      hideFigure(figures, s.fig);
      continue;
    }
    // Derrière le comptoir : rogné au plan de travail (un seul rectangle : le <svg> de l'employé), objet en main compris.
    const c = stage.counter;
    const behind = c !== null && v.x >= c.x0 - 0.5 && v.x <= c.x1 + 0.5;
    const clipY = Math.max(0, behind ? rt.worktop : rt.hSvg);
    setIf(s.clip, 'height', clipY.toFixed(2));
    setIf(s.body, 'transform', `translate(${v.x.toFixed(2)} ${rt.staffFloor.toFixed(2)}) scale(${STAFF_SCALE})`);
    const track = tr ?? ({ id: `staff:${s.id}`, role: 'staff', outfit: rt.plan.staff.find((x) => x.id === s.id)!.outfit } as ActorTrack);
    const look = lookOf(st, rt, track, false, figures);
    wear(s.fig, look, figures);
    const head = hornHead(horns, t, rt.winX + v.x, v.yaw, headOf(v.headYaw), !rt.still && free(v.arms));
    poseInside(s.fig, v, look.sig, head, v.x, rt.staffFloor, STAFF_SCALE, clipY, out, figures);
  }
}

function placeCustomer(st: ShopState, rt: ShopRt, e: Entry, a: Seen, t: number, horns: readonly Horn[], figures: FigureRegistry, out: Shown): void {
  const { v, side } = a;
  const where: Where = side === null ? 'inside' : side.stage === 'threshold' ? 'door' : 'street';
  if (e.where !== where) {
    turnOn(e.inner, where === 'inside');
    turnOn(e.street, where === 'street');
    turnOn(e.door, where === 'door');
    if (where !== 'inside') hideFigure(figures, e.inFig);
    if (where !== 'street') hideFigure(figures, e.outFig);
    if (where !== 'door') hideFigure(figures, e.sillFig);
    e.where = where;
  }
  if (where === 'inside') {
    // Qui marche passe devant les immobiles : calque avant, 1 px plus bas (le nœud reste dans la vitrine de sa boutique).
    const walking = v.gait === 'walk';
    if (walking !== e.front) {
      (walking ? st.front : st.back).appendChild(e.inner);
      e.front = walking;
    }
    const k = INSIDE_SCALE * v.scale;
    const y = rt.floor + (walking ? 1 : 0);
    setIf(e.inner, 'transform', `translate(${v.x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(3)})`);
    const look = lookOf(st, rt, a.track, false, figures);
    wear(e.inFig, look, figures);
    const head = hornHead(horns, t, rt.winX + v.x, v.yaw, headOf(v.headYaw), free(v.arms));
    poseInside(e.inFig, v, look.sig, head, v.x, y, k, rt.hSvg, out, figures);
    return;
  }
  // Trottoir et porte : à l'échelle de la rue (STREET_SCALE), comme placeCustomers.
  const s = side!;
  const m = rt.metrics;
  const k = m.unit * STREET_SCALE.person * v.scale;
  const fig = where === 'street' ? e.outFig : e.sillFig;
  const look = lookOf(st, rt, a.track, true, figures);
  wear(fig, look, figures);
  if (where === 'street') setIf(e.street, 'transform', `translate(${s.x.toFixed(1)} ${m.doorY.toFixed(1)}) scale(${k.toFixed(3)})`);
  else placeSill(e.door, s.x === rt.doorX ? rt.doorRect : entranceOpening(s.x - DOOR_WIDTH / 2, m), s as Passage, m, k, 1);
  const arms: ArmPose = s.gait === 'stand' ? 'down' : 'swing';
  const pose = { yaw: s.yaw, gait: s.gait, phase: s.gait === 'walk' ? phaseIndexOf(s.walked / k + s.depth * 8) : 0, head: hornHead(horns, t, s.x, s.yaw, 0, true), arms };
  poseFigure(figures, fig, pose);
  // Objet emporté : sur le trottoir seulement (le seuil le rognerait), à la main libre du parapluie.
  if (where === 'street' && v.where === 'street-out' && a.carry) {
    const [px, py] = anchorAt({ sig: look.sig, lean: 0, ...pose }, rt.umbrella ? 'handL' : 'handR', s.x, m.doorY, k);
    out.carry.push({ id: a.carry, x: px, y: py, k });
  }
}

// Clients visibles à `sec` (s du jour) dans les créneaux N−1, N, N+1 déjà calculés.
function visible(rt: ShopRt, n: number, scN: Score | null, sec: number): Seen[] {
  const p = rt.plan;
  const seen: Seen[] = [];
  for (let idx = Math.max(0, n - 1); idx <= n + 1; idx++) {
    const sc = idx === n ? scN : peekScore(p, idx, slotGate(p, idx, sec, rt.gate));
    if (!sc) continue;
    const tIn = sec - sc.start;
    for (const track of sc.tracks) {
      if (track.role !== 'customer') continue;
      const info = infoOf(track, rt);
      if (tIn < info.from || tIn > info.to) continue;
      const v = trackAt(track, tIn);
      const side = v.where === 'inside' || !info.plan ? null : sidewalkAt(info.plan, tIn);
      if (v.where === 'inside' || side) seen.push({ track, v, side, carry: info.carry, sc });
    }
  }
  return seen;
}

// Admission d'un parti à sa première vue : retenu par le plafond (muted) ou trop grand pour la réserve libre → jamais montré
// (ni apparition en pleine rue plus tard, ni parti coupé en deux).
function admit(st: ShopState, a: Seen, muted: ReadonlySet<string>): boolean {
  const party = a.track.party ?? a.track.id;
  if (st.admitted.has(party)) return true;
  if (st.refused.has(party)) return false;
  const room = st.entries.reduce((c, x) => c + (x.actor === null ? 1 : 0), 0);
  const ok = !muted.has(party) && room >= partySize(a.sc, party);
  const set = ok ? st.admitted : st.refused;
  if (set.size > 2048) set.clear();
  set.add(party);
  return ok;
}

function placeShop(st: ShopState, rt: ShopRt, muted: ReadonlySet<string>, t: number, horns: readonly Horn[], figures: FigureRegistry): void {
  const p = rt.plan;
  const sec = t + rt.offset;
  const out: Shown = { props: [], worn: [], carry: [], pictos: [] };
  const n = slotIndexAt(p.type, sec);
  const live = !rt.still && rt.open;
  const scN = live ? peekScore(p, n, slotGate(p, n, sec, rt.gate)) : null;
  placeStaff(st, rt, scN, sec - slotStart(p.type, n), sec, t, horns, figures, out);
  const seen = live ? visible(rt, n, scN, sec) : [];
  const tick = ++st.tick;
  for (const a of seen) {
    const e = st.assign.get(a.track.id);
    if (e) e.seen = tick;
  }
  for (const [id, e] of st.assign) {
    if (e.seen === tick) continue;
    release(e, figures);
    st.assign.delete(id);
  }
  for (const a of seen) {
    let e = st.assign.get(a.track.id);
    if (!e) {
      if (!admit(st, a, muted)) continue;
      e = st.entries.find((x) => x.actor === null);
      if (!e) continue;
      e.actor = a.track.id;
      e.seen = tick;
      st.assign.set(a.track.id, e);
    }
    placeCustomer(st, rt, e, a, t, horns, figures, out);
  }
  placeSlots(st.props, out.props);
  placeSlots(st.worn, out.worn);
  placeSlots(st.carry, out.carry);
  placeSlots(st.pictos, out.pictos);
}

// Pose de toute la scène à l'instant `t` (horloge murale, s) ; calcule au plus une partition manquante.
export function placeScene(nodes: SceneNodes, t: number, figures: FigureRegistry, horns: readonly Horn[]): void {
  const first = nodes.shops[0];
  if (!first) return;
  const live = nodes.shops.filter((s) => !s.rt.still && s.rt.open);
  if (live.length) pumpScore(live.map((s) => ({ plan: s.rt.plan, gate: s.rt.gate })), t + first.rt.offset);
  for (const s of nodes.shops) placeShop(s.st, s.rt, nodes.muted, t, horns, figures);
}
