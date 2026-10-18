import { shapeOf, signatureOf } from '../../core/library/figure/dress';
import type { FigureKey } from '../../core/library/figure/bake';
import { phaseIndexOf } from '../../core/library/figure/gait';
import { LIMB, type ArmPose, type Gait } from '../../core/library/figure/skeleton';
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
import { citizenPalette, hideFigure, poseFigure, shopIdentity } from '../figure/ghibli-figure';
import { pictoLook } from './picto';
import { peekScore, pumpScore, slotGate, slotRef } from './scene-scores';
import {
  HAND_L, STAFF_SCALE, anchorAt, free, headOf, hornHead, infoOf, partySize, placeSlots, pooledSlotsOf, runtimes, setIf, slotsOf, staffTrack, turnOn,
  type ShopRt, type Slot, type SlotAt,
} from './scene-read';

export { CARRIED, STAFF_SCALE, runtimes, workOf, type ShopRt } from './scene-read';

// Boucle de la scène Ghibli des commerces (G4b) : lit les partitions des créneaux N−1, N, N+1 et pose la réserve de nœuds
// rendue par ShopScene, sans re-rendu ni création de nœud. Un parti est admis à sa première vue s'il tient entier dans la
// réserve libre (ses nœuds lui sont réservés jusqu'au départ de son dernier membre) ; chaque client garde son nœud tant qu'il est
// visible (tenue posée sur la figure : data-sig / data-palette, puis poseFigure) ; dans la vitrine, qui marche passe devant
// les immobiles (calque avant, +1 px). Rideau baissé : plus d'admission, les partis admis finissent leur visite (la vitrine est
// alors cachée, le rideau la couvre) et repartent dans la rue. Objets, montures, pictos : emplacements partagés de la boutique.
// Klaxons : surcouche de tête. L'état de la boucle est gardé par boutique (id du local) : un remontage ne le perd pas.

type Where = 'inside' | 'street' | 'door' | null;
type Entry = { inner: Element; street: Element; door: Element; inFig: Element | null; outFig: Element | null; sillFig: Element | null; actor: string | null; party: string | null; where: Where; front: boolean; seen: number };
type StaffNode = { id: string; clip: Element; body: Element; fig: Element | null };
type Look = { sig: string; pk: string };
// Ce que montrent les emplacements d'une boutique à cette image (rempli par les poses, appliqué à la fin).
type Shown = { props: SlotAt[]; worn: SlotAt[]; carry: SlotAt[]; pictos: SlotAt[] };
// `dt` : piste d'un créneau de la veille (> 0) ou du lendemain (< 0), lue autour de minuit (slotRef).
type Seen = { track: ActorTrack; v: ActorView; side: SidewalkView | null; carry: PropId | null; sc: Score; dt: number };
type ShopState = {
  el: Element | null; rt: ShopRt | null; win: Element | null; entries: Entry[]; staff: StaffNode[]; back: Element | null; front: Element | null;
  props: Slot[]; worn: Slot[]; carry: Slot[]; pictos: Slot[];
  assign: Map<string, Entry>; admitted: Set<string>; refused: Set<string>; partyTick: Map<string, number>; muted: ReadonlySet<string>;
  looks: Map<string, Look>; tick: number; seen: Seen[]; out: Shown;
  // Nœuds hérités pas encore remis à neuf (nouvel état lié à des nœuds déjà montés : lendemain, autre graine ; remontage).
  fresh: boolean;
};
export type SceneNodes = { shops: { st: ShopState; rt: ShopRt }[] };
// Emplacements par boutique : un objet en main par acteur de la vitrine (chaque client de la réserve et chaque employé du jour),
// un objet emporté par client de la réserve sur le trottoir — jamais d'objet qui manque faute de place (bar, café : dix verres
// et tasses à la fois). Emplacements vides (<g> sans enfant) tant qu'ils ne servent pas ; le dessin est cloné à la demande.
export const propSlotsFor = (pool: number, staff: number): number => pool + staff;
export const carrySlotsFor = (pool: number): number => pool;
// Hanches d'un pantin assis au-dessus de ses pieds (skeleton : jambe repliée).
const SEAT_HIP = LIMB.shin + LIMB.ankle + 0.6;

// État de la boucle par local, graine et jour (affectations, partis admis ou refusés ; les ids de partis ne portent ni la graine
// ni le jour) : survit aux re-rendus ET aux remontages ; un autre jour ou une autre ville repart d'un état neuf.
const states = new Map<string, ShopState>();
const stateKey = (rt: ShopRt): string => `${rt.plan.env.seed}|${rt.plan.env.day}|${rt.plan.id}`;
const STATES_MAX = 256;
const NO_MUTED: ReadonlySet<string> = new Set();
const figOf = (holder: Element | null): Element | null => holder?.querySelector('[data-figure]') ?? null;
const newState = (): ShopState => ({
  el: null, rt: null, win: null, entries: [], staff: [], back: null, front: null, props: [], worn: [], carry: [], pictos: [],
  assign: new Map(), admitted: new Set(), refused: new Set(), partyTick: new Map(), muted: NO_MUTED, looks: new Map(), tick: 0, seen: [],
  out: { props: [], worn: [], carry: [], pictos: [] }, fresh: true,
});

// (Re)lie l'état d'un local à ses nœuds. Nouveaux nœuds (remontage) : mêmes affectations par rang de nœud, tant que la réserve
// garde sa taille (sinon les affectations repartent ; les partis admis gardent leur admission et reprennent des nœuds libres).
function bind(st: ShopState, el: Element): boolean {
  const win = el.querySelector(':scope > svg[data-scene]');
  const back = win?.querySelector(':scope > [data-scene-back]');
  const front = win?.querySelector(':scope > [data-scene-front]');
  if (!win || !back || !front) return false;
  if (st.el !== el) {
    // Emplacements hérités d'un autre état (lendemain sur les mêmes nœuds) : copies d'objets retirées, pictos et montures cachés.
    for (const n of el.querySelectorAll('[data-prop-slot], [data-carry-slot]')) n.replaceChildren();
    for (const n of el.querySelectorAll('[data-picto-glyph], [data-worn-yaw]')) n.setAttribute('display', 'none');
    const streets = el.querySelectorAll(':scope > [data-scene-street]');
    const doors = el.querySelectorAll(':scope > svg[data-scene-door]');
    const inners = [...back.querySelectorAll(':scope > [data-scene-actor]')];
    const keep = inners.length === st.entries.length;
    st.entries = inners.map((inner, i): Entry => {
      const old = keep ? st.entries[i]! : null;
      if (old?.actor) inner.setAttribute('data-actor', old.actor);
      return { inner, street: streets[i]!, door: doors[i]!, inFig: figOf(inner), outFig: figOf(streets[i]!), sillFig: figOf(doors[i]!), actor: old?.actor ?? null, party: old?.party ?? null, where: null, front: false, seen: old?.seen ?? 0 };
    });
    st.assign = new Map(st.entries.filter((e) => e.actor !== null).map((e) => [e.actor!, e]));
    st.staff = [...win.querySelectorAll(':scope > svg[data-scene-staff]')].map((clip): StaffNode => {
      const body = clip.querySelector(':scope > [data-scene-fig]')!;
      return { id: clip.getAttribute('data-scene-staff')!, clip, body, fig: figOf(body) };
    });
    st.el = el;
    st.fresh = true;
    st.win = win;
    st.back = back;
    st.front = front;
  }
  // Emplacements relus à chaque collecte : un objet nouvellement vu s'y ajoute par re-rendu (sans remontage).
  st.props = pooledSlotsOf(win, '[data-prop-slot]', '[data-prop-pool]', 'data-scene-prop', st.props);
  st.worn = slotsOf(win, '[data-worn-slot]', 'data-worn-yaw');
  st.carry = pooledSlotsOf(el, '[data-carry-slot]', '[data-carry-pool]', 'data-scene-prop', st.carry);
  st.pictos = slotsOf(el, '[data-picto-slot]', 'data-picto-glyph', '[data-picto-pop]');
  return true;
}

// Nœuds de la scène sous `root` (une fois par jeu de nœuds).
export function collectScene(root: Element): SceneNodes {
  const shops: SceneNodes['shops'] = [];
  for (const el of root.querySelectorAll('[data-scene-shop]')) {
    const rt = runtimes.get(el);
    if (!rt) continue;
    const key = stateKey(rt);
    let st = states.get(key);
    if (!st) {
      // Les états des autres jours ou graines du même local montés sur ces nœuds, ou sur des nœuds démontés, sont oubliés (pas
      // ceux du même id dans une autre vue encore montée) ; le nouvel état remet à neuf les nœuds qu'il hérite (`fresh`).
      for (const [k, old] of states) if (old.el === el || (k.endsWith(`|${rt.plan.id}`) && old.el !== null && !old.el.isConnected)) states.delete(k);
      if (states.size >= STATES_MAX) states.delete(states.keys().next().value!);
      states.set(key, (st = newState()));
    }
    if (!bind(st, el)) continue;
    // Nouveau rendu (ciel, minute) : les tenues sont recalculées.
    if (st.rt !== rt) st.looks.clear();
    st.rt = rt;
    shops.push({ st, rt });
  }
  return { shops };
}

// Partis retirés par le plafond (ids d'acteurs `<parti>:<rang>` rendus par spriteBudget) : gardés par chaque boutique jusqu'au
// plafond suivant (la pose du rendu les applique aussi) ; ils ne sont pas admis, un parti déjà admis reste.
export function muteScene(nodes: SceneNodes, drop: ReadonlySet<string>): void {
  const muted = new Set([...drop].filter((id) => id.includes(':')).map((id) => id.slice(0, id.lastIndexOf(':'))));
  for (const { st } of nodes.shops) st.muted = muted;
}

function lookOf(st: ShopState, rt: ShopRt, track: ActorTrack, out: boolean, figures: FigureRegistry): Look {
  const k = `${track.id}|${out ? 1 : 0}`;
  let l = st.looks.get(k);
  if (!l) {
    const work = track.role === 'staff' ? rt.work : 'none';
    // Habitant 3D : client par son id (enfant d'un parti parent-enfant : corps d'enfant), employé par sa tenue (la même
    // personne que dans la rue et à la terrasse) ; humeur de fond, d'où le visage de chaque geste (payer → content).
    const who = track.role === 'staff' ? shopIdentity(track.outfit, undefined, 'adult') : shopIdentity(track.outfit, track.id, track.child ? 'child' : undefined);
    const umbrella = out && rt.umbrella;
    l = { sig: signatureOf(shapeOf(track.outfit, umbrella, work)), pk: figures.addPalette(citizenPalette(figures, track.outfit, out ? rt.sky : rt.inSky, out && rt.rainy, umbrella, work, who)) };
    st.looks.set(k, l);
  }
  return l;
}
// Habille une figure de la réserve. Autre silhouette, ou figure cachée : remise à neuf. Même silhouette, autre palette (ciel au
// huitième) : la palette change, l'image affichée reste jusqu'à ce que le nouveau sprite soit peint (contrat de poseFigure).
function wear(fig: Element | null, l: Look, figures: FigureRegistry): void {
  if (!fig) return;
  const sig = fig.getAttribute('data-sig');
  if (sig === l.sig && fig.getAttribute('data-palette') === l.pk) return;
  if (sig !== l.sig || !fig.hasAttribute('data-key')) {
    hideFigure(figures, fig);
    fig.setAttribute('data-sig', l.sig);
  }
  fig.setAttribute('data-palette', l.pk);
}

function release(e: Entry, figures: FigureRegistry): void {
  for (const [node, fig] of [[e.inner, e.inFig], [e.street, e.outFig], [e.door, e.sillFig]] as const) {
    turnOn(node, false);
    hideFigure(figures, fig);
  }
  e.inner.removeAttribute('data-actor');
  e.actor = null;
  e.where = null;
}

// Pose d'un pantin de la vitrine (employé ou client) ; objet en main (caché sous `clipY` : derrière le comptoir), monture portée
// et picto aux accroches de la pose (le picto vit hors de la vitrine, dans le repère du monde : décalé de son origine).
function poseInside(fig: Element | null, v: ActorView, sig: string, head: number, x: number, y: number, k: number, clipY: number, rt: ShopRt, out: Shown, figures: FigureRegistry): void {
  const pose = { yaw: v.yaw, gait: v.gait as Gait, phase: v.phase, head, arms: v.arms, lean: v.lean };
  poseFigure(figures, fig, pose);
  const key: FigureKey = { sig, ...pose };
  if (v.worn) {
    const [hx, hy] = anchorAt(key, 'head', x, y, k, fig);
    out.worn.push({ id: String((((v.yaw + head) % 16) + 16) % 16), x: hx, y: hy, k });
  } else if (v.prop) {
    const [px, py] = anchorAt(key, HAND_L.has(v.prop) ? 'handL' : 'handR', x, y, k, fig);
    if (py <= clipY) out.props.push({ id: v.prop, x: px, y: py, k });
  }
  const look = v.picto ? pictoLook(v.picto.age) : null;
  if (v.picto && look) {
    const [px, py] = anchorAt(key, 'headTop', x, y, k, fig);
    out.pictos.push({ id: v.picto.id, x: px + rt.winX, y: py + rt.winY, k, pop: look });
  }
}

const REST_VIEW: ActorView = {
  id: '', role: 'staff', where: 'inside', x: 0, yaw: 4, gait: 'stand', phase: 0, arms: 'down', lean: 0, headYaw: 0, prop: null, worn: false, picto: null,
  party: null, outfit: undefined as never, scale: 1, enterAt: null, exitAt: null, arriveAt: null, dir: null,
};
const presentAt = (rt: ShopRt, id: string, sec: number): boolean => rt.staffById.get(id)?.spans.some(([a, b]) => sec >= a && sec < b) ?? false;

function placeStaff(st: ShopState, rt: ShopRt, sc: Score | null, tIn: number, sec: number, t: number, horns: readonly Horn[], figures: FigureRegistry, out: Shown): void {
  const stage = rt.plan.stage;
  // Repos (mouvement réduit, partition pas encore prête) : les présents à leur poste, tournés vers la salle ; un seul en
  // mouvement réduit (comme StaffLayer). Rideau baissé : personne (la vitrine est couverte).
  const max = rt.still ? 1 : stage.posts.length;
  let rank = 0;
  for (const s of st.staff) {
    let v: ActorView | null = null;
    let tr: ActorTrack | undefined;
    if (!rt.open) v = null;
    else if (sc) {
      tr = staffTrack(sc, s.id);
      v = tr ? trackAt(tr, tIn) : null;
    } else if (rank < max && presentAt(rt, s.id, sec)) {
      v = { ...REST_VIEW, x: stage.posts[rank % stage.posts.length]!, yaw: stage.doorEdge === 'left' ? 5 : 3 };
      rank++;
    }
    const on = v !== null && v.where === 'inside';
    turnOn(s.clip, on);
    if (!on || !v) {
      hideFigure(figures, s.fig);
      continue;
    }
    // Derrière le comptoir PEINT : rogné au plan de travail (un seul rectangle : le <svg> de l'employé), objet en main compris.
    // Pas de comptoir dessiné (friperie, librairie…) : personne n'est rogné, sinon il perdrait les jambes sans rien devant.
    const c = stage.counter;
    const behind = c !== null && c.drawn && v.x >= c.x0 - 0.5 && v.x <= c.x1 + 0.5;
    const clipY = Math.max(0, behind ? rt.worktop : rt.hSvg);
    setIf(s.clip, 'height', clipY.toFixed(2));
    setIf(s.body, 'transform', `translate(${v.x.toFixed(2)} ${rt.staffFloor.toFixed(2)}) scale(${STAFF_SCALE})`);
    const track = tr ?? ({ id: `staff:${s.id}`, role: 'staff', outfit: rt.staffById.get(s.id)!.outfit } as ActorTrack);
    const look = lookOf(st, rt, track, false, figures);
    wear(s.fig, look, figures);
    const head = hornHead(horns, t, rt.winX + v.x, v.yaw, headOf(v.headYaw), !rt.still && free(v.arms));
    poseInside(s.fig, v, look.sig, head, v.x, rt.staffFloor, STAFF_SCALE, clipY, rt, out, figures);
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
      (walking ? st.front! : st.back!).appendChild(e.inner);
      e.front = walking;
    }
    const k = INSIDE_SCALE * v.scale;
    // Assis : les hanches sur le siège peint (la hauteur d'assise du pantin est celle du squelette assis).
    const y = v.gait === 'seated' ? rt.floorLine - rt.seatH + SEAT_HIP * k : rt.floor + (walking ? 1 : 0);
    setIf(e.inner, 'transform', `translate(${v.x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(3)})`);
    const look = lookOf(st, rt, a.track, false, figures);
    wear(e.inFig, look, figures);
    const head = hornHead(horns, t, rt.winX + v.x, v.yaw, headOf(v.headYaw), free(v.arms));
    poseInside(e.inFig, v, look.sig, head, v.x, y, k, rt.hSvg, rt, out, figures);
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
    const [px, py] = anchorAt({ sig: look.sig, lean: 0, ...pose }, rt.umbrella ? 'handL' : 'handR', s.x, m.doorY, k, fig);
    out.carry.push({ id: a.carry, x: px, y: py, k });
  }
}

// Clients visibles à `sec` (s du jour) dans les créneaux N−1, N, N+1 déjà calculés (rangés dans `into`, réutilisé) ; au premier
// créneau du jour, N−1 est le dernier de la veille (ses clients finissent leur visite et repartent).
function visible(rt: ShopRt, n: number, sec: number, into: Seen[]): Seen[] {
  into.length = 0;
  for (let idx = n - 1; idx <= n + 1; idx++) {
    const { plan: p, index, dt } = slotRef(rt.plan, idx);
    const sc = peekScore(p, index, slotGate(p, index, rt.gate, rt.open));
    if (!sc) continue;
    const tIn = sec + dt - sc.start;
    for (const track of sc.tracks) {
      if (track.role !== 'customer') continue;
      const info = infoOf(track, rt, sc);
      if (tIn < info.from || tIn > info.to) continue;
      const v = trackAt(track, tIn);
      const side = v.where === 'inside' || !info.plan ? null : sidewalkAt(info.plan, tIn);
      if (v.where === 'inside' || side) into.push({ track, v, side, carry: info.carry, sc, dt });
    }
  }
  return into;
}

// Parti (ou acteur) d'une piste pour l'admission : ceux de la veille (`~`) et du lendemain (`+`) sont marqués, les ids ne portant
// pas le jour.
const dayMark = (dt: number): string => (dt > 0 ? '~' : dt < 0 ? '+' : '');
const partyKey = (track: ActorTrack, dt: number): string => dayMark(dt) + (track.party ?? track.id);
const freeCount = (st: ShopState): number => st.entries.reduce((c, x) => c + (x.party === null ? 1 : 0), 0);
// Admission d'un parti à sa première vue : rideau levé, pas retenu par le plafond et la réserve libre le tient entier ; ses
// nœuds lui sont réservés. Refusé, il ne sera jamais montré (ni apparition en pleine rue, ni parti coupé en deux).
function admit(st: ShopState, rt: ShopRt, party: string, size: number): boolean {
  if (st.admitted.has(party)) return true;
  if (st.refused.has(party)) return false;
  const ok = rt.open && !st.muted.has(party) && freeCount(st) >= size;
  const set = ok ? st.admitted : st.refused;
  if (set.size > 2048) set.clear();
  set.add(party);
  if (ok) {
    let left = size;
    for (const e of st.entries) {
      if (left === 0) break;
      if (e.party !== null) continue;
      e.party = party;
      left--;
    }
  }
  return ok;
}

function placeShop(st: ShopState, rt: ShopRt, t: number, horns: readonly Horn[], figures: FigureRegistry): void {
  const p = rt.plan;
  const sec = t + rt.offset;
  const out = st.out;
  out.props.length = out.worn.length = out.carry.length = out.pictos.length = 0;
  const n = slotIndexAt(p.type, sec);
  // Nœuds hérités (lendemain : le nouvel état reprend les nœuds de la veille) : ceux qui ne sont à personne sont cachés.
  if (st.fresh) {
    st.fresh = false;
    for (const e of st.entries) if (e.actor === null) release(e, figures);
  }
  // Rideau baissé : la vitrine (employés, clients dedans) est cachée — le rideau roulant la couvre —, les clients admis continuent.
  setIf(st.win, 'visibility', rt.open ? 'visible' : 'hidden');
  const { plan: pn, index: iN, dt: dN } = slotRef(p, n);
  const scN = rt.still ? null : peekScore(pn, iN, slotGate(pn, iN, rt.gate, rt.open));
  placeStaff(st, rt, scN, sec + dN - slotStart(p.type, iN), sec, t, horns, figures, out);
  st.seen.length = 0;
  const seen = rt.still ? st.seen : visible(rt, n, sec, st.seen);
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
    const party = partyKey(a.track, a.dt);
    let e = st.assign.get(a.track.id);
    if (!e) {
      if (!admit(st, rt, party, partySize(a.sc, a.track.party ?? a.track.id))) continue;
      // Nœud réservé au parti (sinon, après un remontage qui a changé la réserve, un nœud libre).
      e = st.entries.find((x) => x.party === party && x.actor === null) ?? st.entries.find((x) => x.party === null);
      if (!e) continue;
      e.party = party;
      e.actor = a.track.id;
      e.seen = tick;
      e.inner.setAttribute('data-actor', a.track.id);
      st.assign.set(a.track.id, e);
    }
    st.partyTick.set(party, tick);
    placeCustomer(st, rt, e, a, t, horns, figures, out);
  }
  // Réservations rendues quand plus aucun membre du parti n'est visible.
  for (const e of st.entries) {
    if (e.party === null || st.partyTick.get(e.party) === tick) continue;
    st.partyTick.delete(e.party);
    e.party = null;
  }
  placeSlots(st.props, out.props);
  placeSlots(st.worn, out.worn);
  placeSlots(st.carry, out.carry);
  placeSlots(st.pictos, out.pictos);
}

// Pose de toute la scène à l'instant `t` (horloge murale, s) ; calcule au plus une partition manquante (boutiques ouvertes).
export function placeScene(nodes: SceneNodes, t: number, figures: FigureRegistry, horns: readonly Horn[]): void {
  const first = nodes.shops[0];
  if (!first) return;
  const live = nodes.shops.filter((s) => !s.rt.still && s.rt.open);
  if (live.length) pumpScore(live.map((s) => ({ plan: s.rt.plan, gate: s.rt.gate })), t + first.rt.offset);
  for (const s of nodes.shops) placeShop(s.st, s.rt, t, horns, figures);
}

// Clients de la scène pour spriteBudget : chaque client visible dans la minute qui vient compte 1, avec son parti. Parti déjà
// admis : `keep` (on ne le retire plus) ; refusé : absent (jamais montré) ; à venir : `customer`, retirable, `served` s'il est en
// plein geste dans la vitrine à sa première apparition dans la minute.
export function sceneBudget(nodes: SceneNodes, t: number): BudgetSprite[] {
  const out: BudgetSprite[] = [];
  for (const { st, rt } of nodes.shops) {
    if (rt.still) continue;
    const p = rt.plan;
    const sec = t + rt.offset;
    const n = slotIndexAt(p.type, sec);
    for (let idx = n - 1; idx <= n + 1; idx++) {
      const { plan: q, index, dt } = slotRef(p, idx);
      const sc = peekScore(q, index, slotGate(q, index, rt.gate, rt.open));
      if (!sc) continue;
      const tIn = sec + dt - sc.start;
      for (const track of sc.tracks) {
        if (track.role !== 'customer') continue;
        const party = partyKey(track, dt);
        const admitted = st.admitted.has(party);
        if (st.refused.has(party) || (!admitted && !rt.open)) continue;
        const info = infoOf(track, rt, sc);
        if (info.to < tIn || info.from > tIn + 60) continue;
        const v = trackAt(track, Math.max(tIn, info.from));
        const inside = v.where === 'inside';
        out.push({ id: dayMark(dt) + track.id, kind: admitted ? 'keep' : 'customer', x: inside ? rt.winX + v.x : rt.doorX, party, served: inside && v.gait !== 'walk' && !free(v.arms) });
      }
    }
  }
  return out;
}

// Partis admis et refusés d'un local (lecture pour les tests) ; `forgetScenes` efface l'état de la boucle (tests).
export const sceneParties = (id: string, seed?: number, day?: number): { admitted: ReadonlySet<string>; refused: ReadonlySet<string> } | null => {
  const st = seed !== undefined && day !== undefined ? states.get(`${seed}|${day}|${id}`) : [...states.entries()].reverse().find(([k]) => k.endsWith(`|${id}`))?.[1];
  return st ? { admitted: st.admitted, refused: st.refused } : null;
};
export const forgetScenes = (): void => states.clear();
