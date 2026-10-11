import { useMemo, useReducer, useRef, type ReactElement } from 'react';
import type { YMD } from '../core/library/city/calendar';
import { DOOR_DARK, THRESHOLD_S, doorDarkOpacity, entranceOpening, type Passage } from '../core/library/city/doorway';
import { DOOR_WIDTH, STREET_SCALE, type CityMetrics } from '../core/library/city/metrics';
import { outfitFor, type Outfit } from '../core/library/city/people';
import { SHOP_DEFS } from '../core/library/city/shops/catalog';
import { BOUNCER_STAGGER_S, bouncerArriveOf, bouncerLeaveOf, clearAt, clubWalkAt, clubWalkEnd, walkOffOf, type BouncerPost, type ClubCtx, type ClubPose, type ClubWalk } from '../core/library/city/shops/club-walks';
import { isOpenAt } from '../core/library/city/shops/hours';
import { ADVANCE_S, nightclubDoor, queueAt, queueScene, queueWalkSpeed, targetLength, type ArrivalLayout, type QueueArrival, type QueuePrev } from '../core/library/city/shops/queue';
import type { ShopFrame, ShopSlot } from '../core/library/city/shops/slots';
import type { ShopView } from '../core/library/city/shops/view';
import { hashString, mulberry32 } from '../core/library/scene-world';
import { TURN_S, YAW_BACK, facingYaw, phaseIndexOf, turnYaw } from '../core/library/figure/gait';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';
import { placeSill, sillBox, sillFigTransform } from './door-passage';
import { useFigureRegistry } from './figure/figure-host';
import { GhibliFigure, poseFigure, type PoseIn } from './figure/ghibli-figure';
import { useWallClockLoop } from './use-wallclock-loop';

// Boîte de nuit (vague 1b-iv-b) : cordon (deux potelets et une corde) devant la porte, deux videurs en costume noir, bras
// croisés, de part et d'autre, et une file de 0 à 6 personnes (queue.ts) alignée le long de la façade, du côté de la vitrine,
// tournée vers la porte. La file avance avec une petite boucle d'animation propre (positions écrites sur `transform`) ;
// elle ne re-rend que quand sa composition change (entrée, arrivée, passage d'un seuil). Aucun id SVG. Personne n'apparaît ni ne
// disparaît sur place : qui va rejoindre la file vient à pied du bord du monde (ou d'une entrée d'immeuble, queueArrivals) ;
// qui entre marche jusqu'à la porte, fait demi-tour et passe le seuil.

const OPEN_MIN = 23 * 60; // ouverture (catalog.ts) : sert à savoir si ce soir est un soir d'ouverture
const QUEUE_START = 9; // px (à unit = 1) de la porte à la première personne (juste derrière le videur)
const QUEUE_PITCH = 6.5; // px entre deux personnes de la file, quand la façade le permet…
export const MIN_PITCH = 4.4; // … resserrés jusque-là sinon (en dessous, les silhouettes se confondent : on en montre moins)
const MAX_QUEUE = 6;
const BOUNCER_DX = 5.5; // px de la porte à chaque videur
const CORDON_FROM = 7; // premier potelet, px de la porte ; le second au niveau de la 3e personne (au plus à l'entrée des habitants)
const QUEUE_FRAME_MS = 50;
const STILL_QUEUE = 3; // mouvement réduit : 3 personnes immobiles
const REF_POS = 100; // origine de la phase de marche (croît quand la place diminue)
// Une seule personne entre à la fois (entrées espacées de 15 s au moins) : on la cherche parmi les têtes de file d'il y a 10 s.
const ENTER_LOOKBACK_S = 10;
const ARRIVE_DOWN = 10; // px (à unit = 1) de trottoir pour passer de la ligne des portes à celle de la file, en sortant d'un immeuble
const NO_DOORS: readonly number[] = [];
const BOUNCER_SCALE = 1.05; // videurs un peu plus grands que les passants
const LEAVE_STAGGER_S = 0.25; // à la fermeture, la file se défait de la dernière à la première, à ce pas
// Trajets scriptés en cours : arrivée des videurs (sortie par la porte) ou fermeture (file à pied, videurs qui rentrent) ; `end` : fin du dernier.
type Transition = { kind: 'opening' | 'closing'; walks: ClubWalk[]; end: number };
type FigurePose = PoseIn;

export type QueueFrame = {
  // `pos` : place dans la file (0 = devant la porte), fractionnaire pendant l'avancée d'un cran (la dernière venue arrive en
  // place `longueur` à pied, puis avance d'un cran avec les autres) ; jamais de fondu.
  members: { id: string; outfitKey: string; pos: number }[];
  // Celle qui vient d'entrer : `c` secondes depuis son instant d'entrée (marche jusqu'à la porte, demi-tour, seuil) ; `p` = c / durée.
  ghost: { id: string; outfitKey: string; c: number; p: number } | null;
  // Celles qui viennent rejoindre la file (queueArrivals) : aucune sans `arrive`.
  arrivals: QueueArrival[];
};

// `t` : secondes relatives à la session (voir queueAt), jamais une heure Unix. `max` : nombre de personnes que la façade peut
// montrer (queueLayout) ; les suivantes attendent hors de la vue (et ne partent vers la file que pour y arriver à temps).
// `enterS` : durée de l'entrée d'une personne (entryScript, à sa vitesse de marche) ; `arrive` : géométrie des arrivées, file et
// arrivées tirées alors d'un même plan (queueScene), continu à travers un changement de minute (`prev`) ; sans `arrive`, file de
// queueAt seule (aucune arrivée).
export function queueFrame(seed: number, slotId: string, t: number, minutes: number, isOpen: boolean, max = MAX_QUEUE, enterS: (id: string) => number = () => ADVANCE_S, arrive?: Omit<ArrivalLayout, 'max'>, prev?: QueuePrev): QueueFrame {
  const shown = Math.max(0, max);
  if (arrive) {
    const s = queueScene(seed, slotId, t, minutes, isOpen, { ...arrive, max: shown }, prev);
    const g = s.entered;
    const total = g ? Math.min(ENTER_LOOKBACK_S, enterS(g.id)) : 0;
    const ghost = g && t - g.at < total ? { id: g.id, outfitKey: g.outfitKey, c: t - g.at, p: (t - g.at) / total } : null;
    return { members: s.members.map((m) => ({ id: m.id, outfitKey: m.outfitKey, pos: m.pos })), ghost, arrivals: s.arrivals };
  }
  const q = queueAt(seed, slotId, t, minutes, isOpen).slice(0, shown);
  const members = q.map((m, i) => ({ id: m.id, outfitKey: m.outfitKey, pos: i + (1 - m.fade) }));
  const head = queueAt(seed, slotId, t - ENTER_LOOKBACK_S, minutes, isOpen)[0];
  let ghost: QueueFrame['ghost'] = null;
  if (head && head.entersAt <= t && head.id !== q[0]?.id) {
    const total = Math.min(ENTER_LOOKBACK_S, enterS(head.id));
    const c = t - head.entersAt;
    if (c < total) ghost = { id: head.id, outfitKey: head.outfitKey, c, p: c / total };
  }
  return { members, ghost, arrivals: [] };
}

// Entrée d'une personne : marche à sa vitesse (queueWalkSpeed) de la place 0 à la porte (`walkS`), demi-tour sur place jusqu'à
// `turnEnd`, seuil de dos jusqu'à `end` (s depuis son instant d'entrée). Plus longue que l'avancée d'un cran (ADVANCE_S) : la
// suivante peut déjà s'avancer pendant qu'elle se tourne, le rythme des entrées ne change pas.
export type EntryScript = { walkDist: number; walkS: number; turnEnd: number; end: number };
export function entryScript(seed: number, slotId: string, entrantId: string, metrics: CityMetrics): EntryScript {
  const walkDist = Math.hypot(QUEUE_START * metrics.unit, metrics.doorY - queueLineY(metrics));
  const walkS = walkDist / queueWalkSpeed(seed, slotId, entrantId);
  return { walkDist, walkS, turnEnd: walkS + TURN_S, end: walkS + TURN_S + THRESHOLD_S };
}
// Ligne des pieds de la file : entre celle des portes et celle des passants.
export const queueLineY = (m: CityMetrics): number => m.doorY + (m.walkY - m.doorY) * 0.3;

// Géométrie de la file : elle s'étire du côté de la vitrine (les gens regardent la porte), jusqu'à l'entrée des habitants de
// l'immeuble au plus (`reach`, en positions de file). Une façade étroite montre moins de monde (`max`, de 1 à 6) plutôt qu'un
// paquet de silhouettes : jamais moins de MIN_PITCH entre deux personnes, la dernière ne dépasse pas l'entrée des habitants.
export type QueueLayout = { doorX: number; away: 1 | -1; pitch: number; max: number; reach: number };
export function queueLayout(slot: ShopSlot, frame: ShopFrame, unit: number): QueueLayout {
  const doorX = frame.door.x + frame.door.w / 2;
  const away: 1 | -1 = frame.window.x + frame.window.w / 2 < doorX ? -1 : 1;
  const run = (away < 0 ? doorX - (slot.residentDoorX + DOOR_WIDTH) : slot.residentDoorX - doorX) / unit;
  // Entrée des habitants de l'autre côté de la porte (ne se produit pas avec les locaux actuels) : aucune limite.
  if (run <= 0) return { doorX, away, pitch: QUEUE_PITCH, max: MAX_QUEUE, reach: Infinity };
  const room = Math.max(0, run - QUEUE_START);
  const max = Math.min(MAX_QUEUE, Math.floor(room / MIN_PITCH + 1e-9) + 1);
  const pitch = max > 1 ? Math.min(QUEUE_PITCH, room / (max - 1)) : QUEUE_PITCH;
  return { doorX, away, pitch, max, reach: room / pitch };
}

// Cordon et videurs : seulement les soirs d'ouverture (de 22 h 30 à la fermeture), jamais pendant un chantier ou un déménagement.
export function clubDoorAt(view: ShopView, date: YMD, minutes: number): { open: boolean } | null {
  if (view.sign?.type !== 'nightclub' || view.phase === 'works' || view.works || view.moving) return null;
  const open = view.phase === 'open';
  if (!open && !isOpenAt(SHOP_DEFS.nightclub, date, OPEN_MIN)) return null;
  return nightclubDoor(open, minutes).cordon ? { open } : null;
}

const STILL_FRAME = (slotId: string, max: number): QueueFrame => ({
  members: Array.from({ length: Math.min(STILL_QUEUE, max) }, (_, i) => ({ id: `still-${i}`, outfitKey: `queue-${hashString(`${slotId}/still/${i}`) % 12}`, pos: i })),
  ghost: null,
  arrivals: [],
});
const EMPTY_FRAME: QueueFrame = { members: [], ghost: null, arrivals: [] };

// Videur : costume noir, bras croisés sur la poitrine.
const BOUNCER_SUIT = '#141418';
function bouncerOutfit(seed: number, slotId: string, i: number): Outfit {
  const o = outfitFor('suit', mulberry32(seed ^ hashString(`${slotId}/bouncer/${i}`)));
  return { ...o, top: 'suit', topColor: BOUNCER_SUIT, bottom: 'pants', bottomColor: BOUNCER_SUIT, hair: i === 0 ? 'bald' : 'short', accessory: 'none' };
}
// Dessin classique : bras croisés posés sur le passant (le pantin, lui, croise les bras : ArmPose 'crossed').
function CrossedArms({ outfit, sky }: { outfit: Outfit; sky: Sky }): ReactElement {
  return (
    <g data-crossed-arms="">
      <rect x={-5.6} y={-23.5} width={11.2} height={3.4} rx={1.6} fill={tone('#202026', sky)} />
      <circle cx={-4.6} cy={-21.8} r={1.2} fill={tone(outfit.skin, sky)} />
      <circle cx={4.6} cy={-21.8} r={1.2} fill={tone(outfit.skin, sky)} />
    </g>
  );
}
function CordonSprite({ x0, x1, y, k, sky }: { x0: number; x1: number; y: number; k: number; sky: Sky }): ReactElement {
  const post = (x: number): ReactElement => (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)})`}>
      <ellipse cx={0} cy={0} rx={2.2} ry={0.7} fill={tone('#B8973A', sky)} />
      <rect x={-0.6} y={-13} width={1.2} height={13} fill={tone('#D4B04A', sky)} />
      <circle cx={0} cy={-13.4} r={1} fill={tone('#E8C860', sky)} />
    </g>
  );
  const top = y - 12.6 * k;
  const mid = (x0 + x1) / 2;
  return (
    <g data-cordon="">
      <path d={`M${x0.toFixed(1)} ${top.toFixed(1)} Q${mid.toFixed(1)} ${(top + 4 * k).toFixed(1)} ${x1.toFixed(1)} ${top.toFixed(1)}`} stroke={tone('#A0182E', sky)} strokeWidth={1.1 * k} fill="none" />
      {post(x0)}
      {post(x1)}
    </g>
  );
}

type ClubProps = {
  view: ShopView;
  frame: ShopFrame;
  metrics: CityMetrics;
  minutes: number;
  date: YMD;
  reduced: boolean;
  sky: Sky;
  seed: number;
  // Début de la session (s, horloge murale) : la file avance en temps relatif à la session (contrat de queueAt).
  sessionT0: number;
  // Art Ghibli : pantins, marchant vers la porte ; sinon dessin classique (mêmes trajets).
  ghibli?: boolean;
  // Largeur du monde et centres des entrées d'immeubles : départs des arrivées (bord du monde, ou entrée la plus proche).
  width: number;
  doorXs?: readonly number[];
};

export function NightclubDoor({ view, frame, metrics, minutes, date, reduced, sky, seed, sessionT0, ghibli = false, width, doorXs = NO_DOORS }: ClubProps): ReactElement | null {
  const id = view.slot.id;
  const door = clubDoorAt(view, date, minutes);
  const isOpen = door?.open ?? false;
  const root = useRef<SVGGElement | null>(null);
  const shown = useRef('');
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const u = metrics.unit;
  const k = u * STREET_SCALE.person;
  const { doorX, away, pitch, max, reach } = queueLayout(view.slot, frame, u);
  const y = queueLineY(metrics);
  const figures = useFigureRegistry();
  // Dernière place connue de chaque membre : qui avance d'un cran d'une image à l'autre marche, sinon il attend.
  const lastPos = useRef(new Map<string, number>());
  // Minute (et ouverture) montrée, et celle d'avant avec l'instant de session du changement : la file reste continue quand sa
  // longueur cible change à la minute (queueScene). Effet de bord idempotent pendant le rendu (même valeur, rien ne change).
  const clock = useRef<{ minutes: number; open: boolean; prev?: QueuePrev } | null>(null);
  // Arrivée des videurs (sortie par la porte du club) ou fermeture (la file se défait à pied, les videurs rentrent) : trajets
  // scriptés (club-walks.ts), tirés au rendu qui voit la boîte apparaître ou disparaître.
  const life = useRef<{ present: boolean; trans: Transition | null } | null>(null);
  const slotX = (pos: number): number => doorX + away * (QUEUE_START + pos * pitch) * u;
  const posOf = (m: QueueFrame['members'][number]): number => m.pos;
  // Ghibli : pantin sans miroir (tourné par `yaw`) ; classique : miroir, le sprite regarde vers +x.
  const flip = ghibli ? 1 : -away;
  const tf = (x: number, yy: number): string => `translate(${x.toFixed(1)} ${yy.toFixed(1)}) scale(${(flip * k).toFixed(3)} ${k.toFixed(3)})`;
  const memberTransform = (pos: number): string => tf(slotX(pos), y);
  const face = facingYaw(-away as 1 | -1); // vers la porte
  const memberPose = (pos: number, walking: boolean): FigurePose => ({ yaw: face, gait: walking ? 'walk' : 'stand', phase: walking ? phaseIndexOf(((REF_POS - pos) * pitch * u) / k) : 0, head: 0 });
  // Personne qui entre (entryScript) : de la place 0 à la porte (ses pieds passent de la ligne de la file à celle des portes,
  // sans saut) à sa vitesse de marche, demi-tour sur place à petits pas, puis seuil de dos, dans l'ombre de l'ouverture.
  type Ghost = NonNullable<QueueFrame['ghost']>;
  const entry = (gid: string): EntryScript => entryScript(seed, id, gid, metrics);
  const inSill = (g: Ghost): boolean => g.c >= entry(g.id).turnEnd;
  const ghostWalkTransform = (g: Ghost): string => {
    const w = Math.min(1, g.c / entry(g.id).walkS);
    return tf(slotX(0) + (doorX - slotX(0)) * w, y + (metrics.doorY - y) * w);
  };
  const ghostWalkPose = (g: Ghost): FigurePose => {
    const e = entry(g.id);
    return g.c < e.walkS
      ? { yaw: face, gait: 'walk', phase: phaseIndexOf((e.walkDist * (g.c / e.walkS)) / k), head: 0 }
      : { yaw: turnYaw(face, YAW_BACK, Math.min(1, (g.c - e.walkS) / TURN_S)), gait: 'step', phase: phaseIndexOf(e.walkDist / k), head: 0 };
  };
  const ghostPassage = (g: Ghost): Passage => ({ stage: 'threshold', x: doorX, depth: Math.min(1, Math.max(0, (g.c - entry(g.id).turnEnd) / THRESHOLD_S)), yaw: YAW_BACK, gait: 'walk', walked: 0 });
  const ghostSillPose = (g: Ghost): FigurePose => ({ yaw: YAW_BACK, gait: 'walk', phase: phaseIndexOf(entry(g.id).walkDist / k + ghostPassage(g).depth * 8), head: 0 });
  // Arrivée (queueArrivals) : seuil d'une entrée d'immeuble (<svg> rogné, comme les habitants), demi-tour, puis trottoir ; en
  // sortant d'un immeuble, ses pieds descendent de la ligne des portes à celle de la file sur les ARRIVE_DOWN premiers px.
  const arrivalY = (a: QueueArrival): number => (a.fromDoor ? metrics.doorY + (y - metrics.doorY) * Math.min(1, a.passage.walked / (ARRIVE_DOWN * u)) : y);
  const arrivalTransform = (a: QueueArrival): string => tf(a.passage.x, arrivalY(a));
  const arrivalPose = (a: QueueArrival): FigurePose => ({ yaw: a.passage.yaw, gait: a.passage.gait, phase: phaseIndexOf(a.passage.walked / k + (a.passage.stage === 'threshold' ? (1 - a.passage.depth) * 8 : 0)), head: 0 });
  const arrivalDoor = (a: QueueArrival): ReturnType<typeof entranceOpening> => entranceOpening(a.fromX - DOOR_WIDTH / 2, metrics);
  // Un seuil change le nœud (rue ↔ <svg> de la porte) : une recomposition à chaque seuil, comme aux entrées et aux arrivées.
  const signature = (f: QueueFrame): string =>
    `${f.members.map((m) => m.id).join(',')}|${f.ghost?.id ?? ''}${f.ghost && inSill(f.ghost) ? '+' : ''}|${f.arrivals.map((a) => a.id + (a.passage.stage === 'threshold' ? '+' : '')).join(',')}`;
  // Cache des tenues (effet de bord idempotent pendant le rendu : une même clé donne toujours la même tenue).
  const outfits = useMemo(() => new Map<string, Outfit>(), [seed, id]);
  const outfitOf = (key: string): Outfit => {
    let o = outfits.get(key);
    if (!o) {
      o = outfitFor(hashString(key) % 5 === 0 ? 'suit' : 'ordinary', mulberry32(seed ^ hashString(`${id}/${key}`)));
      outfits.set(key, o);
    }
    return o;
  };
  const arrive: Omit<ArrivalLayout, 'max'> = { doorX, away, startPx: QUEUE_START * u, pitchPx: pitch * u, width, doorXs };
  const frameAt = (now: number): QueueFrame =>
    reduced ? (isOpen ? STILL_FRAME(id, max) : EMPTY_FRAME) : queueFrame(seed, id, now - sessionT0, minutes, isOpen, max, (gid) => entry(gid).end, arrive, clock.current?.prev);
  // Videurs : poste, orientation (Ghibli : de trois quarts vers la rue ; classique : sens du dessin d'avant), porte du club.
  const kb = k * BOUNCER_SCALE;
  const posts: BouncerPost[] = [0, 1].map((i) => {
    const side = i === 0 ? away : (-away as 1 | -1);
    return { i, x: doorX + side * BOUNCER_DX * u, y: metrics.doorY + 1, yaw: (ghibli ? side < 0 : side > 0) ? 2 : 6, doorX, doorY: metrics.doorY, rect: frame.door, k: kb };
  });
  const ends = (walks: ClubWalk[]): number => Math.max(...walks.map(clubWalkEnd));
  const openingAt = (t0: number): Transition => {
    const walks = posts.map((b, i) => bouncerArriveOf(b, t0 + i * BOUNCER_STAGGER_S));
    return { kind: 'opening', walks, end: ends(walks) };
  };
  // Fermeture à `tc` : la file telle qu'elle était (minute d'avant, `clock` pas encore mis à jour) se défait à pied — la
  // dernière d'abord ; qui était en route repart d'où il venait ; qui entrait finit d'entrer. Les videurs rentrent l'un après
  // l'autre une fois le cordon dégagé. Le cordon, lui, reste jusqu'au bout puis disparaît avec la scène (décor).
  const closingAt = (tc: number): Transition => {
    const old = clock.current ?? { minutes, open: isOpen };
    const f0 = queueFrame(seed, id, tc, old.minutes, old.open, max, (gid) => entry(gid).end, arrive, old.prev);
    const ctx: ClubCtx = { width, doorXs, metrics, k, lineY: y };
    const n = f0.members.length;
    const walks: ClubWalk[] = f0.members.map((m, i) =>
      walkOffOf({ id: m.id, outfitKey: m.outfitKey, x: slotX(m.pos), y, yaw: face, speed: queueWalkSpeed(seed, id, m.id), away }, tc + (n - 1 - i) * LEAVE_STAGGER_S, ctx),
    );
    for (const a of f0.arrivals) {
      const who = { id: a.id, outfitKey: a.outfitKey, yaw: a.passage.yaw, speed: a.speed, away };
      walks.push(
        a.passage.stage === 'street'
          ? walkOffOf({ ...who, x: a.passage.x, y: arrivalY(a), end: { x: a.fromX, door: a.fromDoor } }, tc, ctx)
          : walkOffOf({ ...who, x: a.fromX, y: metrics.doorY, atDoor: a.passage.stage === 'threshold' ? a.passage.depth : 0 }, tc, ctx),
      );
    }
    const g = f0.ghost;
    if (g) {
      const e = entry(g.id);
      walks.push({
        id: g.id,
        outfitKey: g.outfitKey,
        start: tc - g.c,
        k,
        segs: [
          { k: 'walk', from: slotX(0), to: doorX, y0: y, y1: metrics.doorY, dur: e.walkS },
          { k: 'turn', x: doorX, y: metrics.doorY, from: face, to: YAW_BACK, dur: TURN_S },
          { k: 'door', rect: frame.door, x: doorX, from: 0, to: 1, yaw: YAW_BACK, dur: THRESHOLD_S },
        ],
      });
    }
    const clear = clearAt(walks, slotX(Math.min(2.3, reach)) + away * 2 * u, away, tc);
    const b0 = bouncerLeaveOf(posts[0]!, tc, clear + 0.3);
    const b1 = bouncerLeaveOf(posts[1]!, tc, clubWalkEnd(b0) - THRESHOLD_S / 2);
    walks.push(b0, b1);
    return { kind: 'closing', walks, end: ends(walks) };
  };
  const nowT = Date.now() / 1000 - sessionT0;
  const present = door !== null;
  if (!life.current) life.current = { present, trans: null };
  else if (life.current.present !== present) life.current = { present, trans: reduced ? null : present ? openingAt(nowT) : closingAt(nowT) };
  else if (life.current.trans && nowT > life.current.trans.end) life.current = { present, trans: null };
  // Après la fermeture éventuelle (elle lit la minute d'avant) : minute montrée, et la dernière minute d'une autre longueur
  // visible (ou d'une autre ouverture). Une minute de même longueur garde `prev` : sinon le plan mêlé du dernier changement serait
  // oublié une minute plus tard, alors que des trajets de plus d'une minute en dépendent encore (queueScene l'oublie seule).
  const shownLength = (m: number): number => Math.min(targetLength(m), max);
  if (!clock.current) clock.current = { minutes, open: isOpen };
  else if (clock.current.open !== isOpen || shownLength(clock.current.minutes) !== shownLength(minutes))
    clock.current = { minutes, open: isOpen, prev: { minutes: clock.current.minutes, open: clock.current.open, since: nowT } };
  else if (clock.current.minutes !== minutes) clock.current = { ...clock.current, minutes };
  const isBouncer = (w: ClubWalk): boolean => w.id.startsWith('bouncer-');
  const scaleOf = (w: ClubWalk): number => (isBouncer(w) ? kb : k);
  // Classique : le dessin regarde vers +x, retourné quand la personne regarde vers −x.
  const sgnOf = (yaw: number): number => (ghibli ? 1 : Math.cos((yaw * Math.PI) / 8) < -1e-6 ? -1 : 1);
  const walkStreetT = (w: ClubWalk, v: { x: number; y: number; pose: ClubPose }): string => {
    const s = scaleOf(w);
    return `translate(${v.x.toFixed(1)} ${v.y.toFixed(1)}) scale(${(sgnOf(v.pose.yaw) * s).toFixed(3)} ${s.toFixed(3)})`;
  };
  // Boucle : marche des personnes (transform, pose) ; un re-rendu seulement quand la file change de composition.
  const place = useMemo(
    () =>
      (now: number): void => {
        const el = root.current;
        if (!el || reduced) return;
        // Trajets scriptés (arrivée des videurs, fermeture) : un re-rendu quand un nœud change de nature (rue ↔ seuil), apparaît,
        // disparaît, ou quand tout est fini.
        const tr = life.current?.trans;
        if (tr) {
          const t = now - sessionT0;
          if (t > tr.end) {
            refresh();
            return;
          }
          for (const w of tr.walks) {
            const v = clubWalkAt(w, t);
            const node = el.querySelector(`[data-club-walk="${w.id}"]`);
            if ((v?.where ?? null) !== (node ? (node.tagName === 'svg' ? 'door' : 'street') : null)) {
              refresh();
              return;
            }
            if (!v || !node) continue;
            if (v.where === 'street') node.setAttribute('transform', walkStreetT(w, v));
            else placeSill(node, v.rect, v.passage, metrics, scaleOf(w), sgnOf(v.pose.yaw));
            if (ghibli) poseFigure(figures, node.querySelector('[data-figure]'), v.pose);
          }
          if (tr.kind === 'closing') return;
        }
        if (!isOpen) return;
        const f = frameAt(now);
        if (signature(f) !== shown.current) {
          refresh();
          return;
        }
        for (const m of f.members) {
          const node = el.querySelector(`[data-queue-id="${m.id}"]`);
          if (!node) continue;
          const pos = posOf(m);
          node.setAttribute('transform', memberTransform(pos));
          const before = lastPos.current.get(m.id);
          lastPos.current.set(m.id, pos);
          if (ghibli) poseFigure(figures, node.querySelector('[data-figure]'), memberPose(pos, before !== undefined && pos < before - 1e-6));
        }
        for (const a of f.arrivals) {
          const node = el.querySelector(`[data-queue-id="${a.id}"]`);
          if (!node) continue;
          if (a.passage.stage !== 'threshold') node.setAttribute('transform', arrivalTransform(a));
          else if (node.tagName === 'svg') placeSill(node, arrivalDoor(a), a.passage, metrics, k, flip);
          else continue;
          if (ghibli) poseFigure(figures, node.querySelector('[data-figure]'), arrivalPose(a));
        }
        if (f.ghost) {
          const node = el.querySelector(`[data-queue-id="${f.ghost.id}"]`);
          if (!node) return;
          if (!inSill(f.ghost)) {
            node.setAttribute('transform', ghostWalkTransform(f.ghost));
            if (ghibli) poseFigure(figures, node.querySelector('[data-figure]'), ghostWalkPose(f.ghost));
          } else if (node.tagName === 'svg') {
            // Le nœud de rue est encore là tant que React n'a pas mis le <svg> du seuil à sa place (recomposition au seuil).
            placeSill(node, frame.door, ghostPassage(f.ghost), metrics, k, flip);
            if (ghibli) poseFigure(figures, node.querySelector('[data-figure]'), ghostSillPose(f.ghost));
          }
        }
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reduced, isOpen, seed, id, minutes, sessionT0, doorX, away, pitch, max, y, k, ghibli, figures, frame, metrics, width, doorXs],
  );
  useWallClockLoop(place, [place], { frameMs: QUEUE_FRAME_MS });
  const tr = life.current.trans;
  if (!door && !tr) return null;
  const bouncers = [0, 1].map((i) => bouncerOutfit(seed, id, i));
  const person = (o: Outfit, pose: FigurePose): ReactElement => (ghibli ? <GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={pose} /> : <PersonSprite outfit={o} sky={sky} rainy={false} umbrella={false} />);
  // Trajet scripté au rendu : sur le trottoir, ou dans le seuil d'une porte (club ou immeuble, <svg> rogné avec l'ombre).
  const renderWalk = (w: ClubWalk): ReactElement | null => {
    const v = clubWalkAt(w, nowT);
    if (!v) return null;
    const b = isBouncer(w) ? Number(w.id.slice(8)) : -1;
    const o = b >= 0 ? bouncers[b]! : outfitOf(w.outfitKey);
    const attrs = b >= 0 ? { 'data-bouncer': '' } : { 'data-queue-id': w.id, 'data-queue-leaving': '' };
    const fig = (
      <>
        {person(o, v.pose)}
        {!ghibli && v.pose.arms === 'crossed' && <CrossedArms outfit={o} sky={sky} />}
      </>
    );
    if (v.where === 'street')
      return (
        <g key={w.id} data-club-walk={w.id} {...attrs} transform={walkStreetT(w, v)}>
          {fig}
        </g>
      );
    const s = scaleOf(w);
    const { clip, dark } = sillBox(v.rect, v.passage.depth, metrics, s);
    return (
      <svg key={w.id} data-club-walk={w.id} {...attrs} data-club-door="" x={clip.x.toFixed(2)} y={clip.y.toFixed(2)} width={clip.w.toFixed(2)} height={clip.h.toFixed(2)} overflow="hidden">
        <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity={doorDarkOpacity(v.passage.depth).toFixed(2)} />
        <g data-door-fig="" transform={sillFigTransform(v.passage, clip, metrics, s, sgnOf(v.pose.yaw))} opacity={(1 - v.passage.depth).toFixed(2)}>
          {fig}
        </g>
      </svg>
    );
  };
  const cordon = <CordonSprite x0={doorX + away * CORDON_FROM * u} x1={slotX(Math.min(2.3, reach))} y={y + 2 * u} k={k} sky={sky} />;
  if (!door || tr?.kind === 'closing')
    return (
      <g data-nightclub={id} data-club-open="false" data-club-closing="" ref={root}>
        {tr!.walks.filter((w) => !isBouncer(w)).map(renderWalk)}
        {tr!.walks.filter(isBouncer).map(renderWalk)}
        {cordon}
      </g>
    );
  const f = frameAt(Date.now() / 1000);
  // Effet de bord idempotent pendant le rendu : la boucle compare la composition de la file à celle qui est affichée. Les
  // dernières places des personnes sorties de la file (entrées) sont oubliées.
  shown.current = signature(f);
  for (const mid of lastPos.current.keys()) if (!f.members.some((m) => m.id === mid)) lastPos.current.delete(mid);
  // Pose au rendu : qui avançait à la dernière image garde sa marche (sinon la recomposition le figerait en plein pas) ; qui
  // vient d'arriver (aucune place connue) marche s'il est entre deux places.
  const renderPose = (m: QueueFrame['members'][number]): FigurePose => {
    const before = lastPos.current.get(m.id);
    const pos = posOf(m);
    return memberPose(pos, before !== undefined ? pos < before - 1e-6 : pos % 1 > 1e-6);
  };
  return (
    <g data-nightclub={id} data-club-open={isOpen ? 'true' : 'false'} data-queue-max={isOpen ? (reduced ? Math.min(STILL_QUEUE, max) : max) : 0} ref={root}>
      {/* Arrivées : derrière la file (elles viennent de l'autre bout, côté vitrine). */}
      {f.arrivals.map((a) => {
        if (a.passage.stage !== 'threshold')
          return (
            <g key={a.id} data-queue-id={a.id} data-queue-arriving="" transform={arrivalTransform(a)}>
              {person(outfitOf(a.outfitKey), arrivalPose(a))}
            </g>
          );
        const { clip, dark } = sillBox(arrivalDoor(a), a.passage.depth, metrics, k);
        return (
          <svg key={a.id} data-queue-id={a.id} data-club-arrival="" x={clip.x.toFixed(2)} y={clip.y.toFixed(2)} width={clip.w.toFixed(2)} height={clip.h.toFixed(2)} overflow="hidden">
            <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity={doorDarkOpacity(a.passage.depth).toFixed(2)} />
            <g data-door-fig="" data-queue-arriving="" transform={sillFigTransform(a.passage, clip, metrics, k, flip)} opacity={(1 - a.passage.depth).toFixed(2)}>
              {person(outfitOf(a.outfitKey), arrivalPose(a))}
            </g>
          </svg>
        );
      })}
      {f.ghost && !inSill(f.ghost) && (
        <g key={f.ghost.id} data-queue-id={f.ghost.id} data-queue-entering="" transform={ghostWalkTransform(f.ghost)}>
          {person(outfitOf(f.ghost.outfitKey), ghostWalkPose(f.ghost))}
        </g>
      )}
      {f.ghost && inSill(f.ghost) && (() => {
        const ps = ghostPassage(f.ghost);
        const { clip, dark } = sillBox(frame.door, ps.depth, metrics, k);
        return (
          <svg key={f.ghost.id} data-queue-id={f.ghost.id} data-club-door="" x={clip.x.toFixed(2)} y={clip.y.toFixed(2)} width={clip.w.toFixed(2)} height={clip.h.toFixed(2)} overflow="hidden">
            <rect data-door-dark="" x={dark.x.toFixed(2)} y={dark.y.toFixed(2)} width={dark.w.toFixed(2)} height={dark.h.toFixed(2)} fill={DOOR_DARK} opacity={doorDarkOpacity(ps.depth).toFixed(2)} />
            <g data-door-fig="" data-queue-entering="" transform={sillFigTransform(ps, clip, metrics, k, flip)} opacity={(1 - ps.depth).toFixed(2)}>
              {person(outfitOf(f.ghost.outfitKey), ghostSillPose(f.ghost))}
            </g>
          </svg>
        );
      })()}
      {/* De la dernière à la première : celle qui est devant la porte est dessinée par-dessus. */}
      {[...f.members].reverse().map((m) => (
        <g key={m.id} data-queue-id={m.id} data-queue-member="" transform={memberTransform(posOf(m))}>
          {person(outfitOf(m.outfitKey), renderPose(m))}
        </g>
      ))}
      {tr?.kind === 'opening' ? tr.walks.map(renderWalk) : bouncers.map((o, i) => {
        const side = i === 0 ? away : (-away as 1 | -1);
        // Ghibli : pantin bras croisés, de trois quarts vers la rue (yaw 2 à gauche de la porte, 6 à droite), sans miroir.
        const pose: FigurePose = { yaw: posts[i]!.yaw, gait: 'stand', phase: 0, head: 0, arms: 'crossed' };
        return (
          <g key={i} data-bouncer="" transform={`translate(${(doorX + side * BOUNCER_DX * u).toFixed(1)} ${(metrics.doorY + 1).toFixed(1)}) scale(${((ghibli ? 1 : side) * kb).toFixed(3)} ${kb.toFixed(3)})`}>
            {ghibli ? (
              <GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={pose} />
            ) : (
              <>
                <PersonSprite outfit={o} sky={sky} rainy={false} umbrella={false} />
                <CrossedArms outfit={o} sky={sky} />
              </>
            )}
          </g>
        );
      })}
      {cordon}
    </g>
  );
}
