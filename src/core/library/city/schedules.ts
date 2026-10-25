import { mulberry32 } from '../scene-world';
import { festivityStartsOn } from './calendar';
import { DECOR_SCENE, type DecorTask, type HwKind } from './halloween';
import { householdMeals, NANNY_M, roomTimeline, type HouseholdMeals, type RoomSpan } from './home-rooms';
import type { Dwelling, Room } from './households';
import type { HouseholdDays } from './person-day';
import { dayRng } from './person-traits';
import type { DayDraw, SceneDay } from './scene-day';
import type { Visit } from './visitors';

// Emplois du temps d'un jour de scène (spec 2026-10-19 « vie au-dessus de la rue » §5.1 ; plan 2026-10-25 « journées des
// habitants », tâche 10). Un emploi du temps est une liste de segments en minutes depuis minuit du jour de scène (0-1800,
// après minuit = 1440 + x), fonction pure du logement, du jour, du tirage du jour (`dayDraw`), des journées de chaque
// habitant (`householdDays`) et des visites (`dayVisits`). Les segments ne sont plus composés par type de foyer : ils
// viennent des pièces occupées par chacun (`roomTimeline`) :
// - `lit` : union, par pièce, des pièces occupées (teinte du foyer ; télé au salon le soir ; fête en orange), plus la pièce
//   d'une scène le temps de la scène ; une lumière ne s'allume que si quelqu'un est là ;
// - `depart` / `return` : bornes des intervalles `out` de chaque membre (indice `m`), arrivée et départ des visites qui
//   entrent (indice `n + k`, k = rang parmi les visites `inside`, nounou comprise) ; une sortie rentrée après minuit est
//   rendue le lendemain (retour de nuit) ;
// - scènes (`act`) posées dans le temps libre de leur membre : jamais quand il dort, est dehors, monte ou descend
//   l'escalier, ni autour de son habillage et de son déshabillage (`dressAt`, `undressAt` ± 1,5 min).
// Les petits tirages internes (heure d'une cigarette, d'un regard sur la rue…) viennent de `mulberry32(draw.rng)`.
//
// Cohérence : un membre ne joue jamais deux scènes à la fois. Les scènes courtes (volets, rideaux, cuisine, cigarette,
// penché…) sont posées dans l'ordre et repoussées au premier moment libre (au plus SHIFT minutes, sinon un autre membre s'en
// charge ; à défaut, volets et rideaux bougent sans pantin, comme une scène écartée) ; les poses longues (table, télé,
// lecture, bureau, danse) remplissent ensuite les trous qui restent dans la pièce où la personne se trouve.
//
// Choix (à confirmer) :
// - Volets : le premier présent du matin ouvre (salon, cuisine), le dernier levé ouvre la chambre ; le premier couché ferme
//   la chambre, le dernier couché le salon et la cuisine ; le retraité ferme à la tombée de la nuit ; avant un départ en
//   vacances, on ferme tout et on tire les rideaux.
// - Fête (coloc le samedi, Nouvel An) : les membres présents seulement (aucun invité sans visite).
// - Enfants : ni télé ni lecture le soir (ils sont au salon sans pose) ; un adulte se tient dans la chambre à leur coucher.

export type LightTone = 'warm' | 'cream' | 'orange' | 'tv' | 'cool';
export type Where = 'in' | 'lean' | 'balcony';
export type Choreo = 'cook' | 'openShutters' | 'closeShutters' | 'armsUp' | 'drawCurtains' | 'table' | 'tv' | 'read' | 'lean' | 'leanRail'
  | 'water' | 'shake' | 'smoke' | 'cross' | 'stand' | 'dance' | 'decorLean' | 'decorBalcony';
export type Segment =
  | { k: 'lit'; room: Room; t0: number; t1: number; tone: LightTone }
  | { k: 'shut' | 'curt' | 'win'; room: Room; t: number; to: number; dur: number }
  | { k: 'act'; t0: number; t1: number; room: Room; where: Where; choreo: Choreo; m: number; seat?: number; party?: number; desk?: boolean; slot?: number; reverse?: boolean; event?: boolean; from?: number; decor?: SceneDecor }
  | { k: 'return' | 'depart'; t: number; m: number }
  | { k: 'sapin' | 'party' | 'dim'; t0: number; t1: number };
// Décor d'Halloween d'une scène `decorLean` / `decorBalcony` (city/halloween.ts) : `dx`, sa place en largeurs de la fenêtre
// du geste ; `reverse` de la scène : on le retire au lieu de le poser.
export type SceneDecor = { id: string; kind: HwKind; dx: number };
// shutUser : volets fermés la nuit (valeur au début du jour) ; maxActors : scènes `act` simultanées au plus fort du jour.
export type Schedule = { dwelling: string; segments: Segment[]; shutUser: boolean; maxActors: number };

type Act = Extract<Segment, { k: 'act' }>;
type Lit = Extract<Segment, { k: 'lit' }>;
type ActExtra = Partial<Pick<Act, 'seat' | 'party' | 'desk' | 'slot' | 'reverse' | 'event' | 'decor'>>;
type Iv = [number, number];

const DAY_END = 1800;
// Retard maximal d'une scène courte quand son membre est occupé (minutes) ; pose longue gardée si ≥ MIN_POSE minutes.
const SHIFT = 30;
const MIN_POSE = 2;
// Probabilité qu'un étudiant ou un colocataire fume à l'heure prévue (ils fument selon leur emploi du temps, pas selon
// `hh.smoker`, réservé aux couples et aux personnes seules ; même valeur que OPTIONAL.smoke de scene-day.ts).
const ROUTINE_SMOKE = 0.85;
// Teinte de base d'un foyer (maquette : warm, warm, cream, orange), tirée de la graine du foyer.
const TONES: readonly LightTone[] = ['warm', 'warm', 'cream', 'orange'];
// Extinctions du coucher (minutes) : fenêtre autour du coucher, écart tiré entre deux pièces, durée minimale d'une lumière.
const OFF = { before: 15, after: 40, gap: [1.5, 7], minLit: 3 } as const;
const SHUT_USERS = new Set(['couple', 'famille', 'retraite', 'solo']);
// Halloween : essais successifs d'un geste de décor après l'heure de tendance (minutes), chacun décalé de SHIFT au plus.
const DECOR_TRIES = [0, 40, 80, 120, 160] as const;
// Trou sans scène autour de l'habillage et du déshabillage (minutes, de part et d'autre).
const DRESS_GAP = 1.5;
// Une lumière reste au plus 10 min allumée après que le dernier éveillé s'est couché (extinctions du coucher).
const LIGHT_GRACE = 10;
// Fête de la coloc ou du Nouvel An (minutes) ; rideaux du soir tirés au coucher du soleil, entre 17 h et 21 h.
const PARTY = [1290, 1578] as const;
const CURTAINS = [1020, 1260] as const;
// Durée du dîner (home-rooms.ts, `MEAL.dinnerLen`).
const DINNER_LEN = 40;

const pri = (tone: LightTone, base: LightTone): number => (tone === 'tv' ? 3 : tone === 'orange' && base !== 'orange' ? 2 : 1);

function mergeIv(list: readonly Iv[]): Iv[] {
  const s = list.filter(([a, b]) => b > a).map(([a, b]): Iv => [a, b]).sort((p, q) => p[0] - q[0]);
  const out: Iv[] = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]);
    else out.push(x);
  }
  return out;
}

// Groupes de pièces occupées qui se chevauchent (une table, une soirée), dans l'ordre d'arrivée.
function clusters(list: readonly RoomSpan[]): RoomSpan[][] {
  const out: RoomSpan[][] = [];
  let end = -Infinity;
  for (const s of [...list].sort((p, q) => p.a - q.a || p.m - q.m)) {
    if (s.a < end) out[out.length - 1]!.push(s);
    else out.push([s]);
    end = Math.max(s.a < end ? end : -Infinity, s.b);
  }
  return out;
}

// Repas du foyer d'un jour (même flux que les tests de home-rooms et de visitors).
export const mealsOf = (d: Dwelling, hd: HouseholdDays): HouseholdMeals => householdMeals(d, hd, dayRng(d.hh.seed, 0, hd.iso, 'repas'));

function compose(d: Dwelling, day: SceneDay, draw: DayDraw, hd: HouseholdDays, visits: readonly Visit[], decor: readonly DecorTask[], mealsIn?: HouseholdMeals): Segment[] {
  const hh = d.hh;
  const r = mulberry32(draw.rng);
  const opt = draw.optional;
  const S: Segment[] = [];
  const lits: { room: Room; t0: number; t1: number; tone: LightTone; pri: number }[] = [];
  const has = (room: Room) => d.rooms.includes(room);
  const K: Room = has('cuisine') ? 'cuisine' : 'salon';
  const L: Room = 'salon';
  const C: Room | null = has('chambre') ? 'chambre' : null;
  const n = hh.members.length;
  const ms = hh.members.map((_, i) => i);
  const shutUser = SHUT_USERS.has(hh.type);
  const cool = hh.type === 'etudiant' || hh.type === 'coloc';
  const base: LightTone = cool ? 'cool' : TONES[Math.floor(mulberry32(hh.seed)() * TONES.length)]!;
  const workday = !day.weekend && day.kind !== 'public-holiday';
  const show = day.show;
  const isKid = (m: number) => m < n && hh.members[m]!.kid;
  const isStudent = (m: number) => m < n && hh.members[m]!.who.status === 'etudiant';
  const adults = ms.filter((m) => !isKid(m));

  // ─── qui est là : pièces occupées (membres, nounou, visiteurs entrés) ───
  const meals = mealsIn ?? mealsOf(d, hd);
  const inside = visits.filter((v) => v.inside);
  const total = n + inside.length;
  const guests = inside.map((v, k) => ({ m: n + k, a: v.arrive, b: v.leave, nanny: v.kind === 'nounou' }));
  const nannies = guests.filter((g) => g.nanny).map((g) => g.m);
  const nannyAt = (t: number) => guests.find((g) => g.nanny && t >= Math.floor(g.a) && t < g.b)?.m;
  // Invités du dîner arrivés moins de 10 min avant (le second, à dîner − 9) : à table quand même, comme le premier.
  const diners = new Set(inside.flatMap((v, k) => (v.kind === 'diner' ? [n + k] : [])));
  const T = meals.dinner;
  const spans: RoomSpan[] = roomTimeline(d, hd, meals, guests.filter((g) => !g.nanny)).flatMap((s): RoomSpan[] => {
    if (s.m === NANNY_M) {
      const m = nannyAt(s.a);
      return m === undefined ? [] : [{ ...s, m }];
    }
    if (T === null || !diners.has(s.m) || (s.what !== 'home' && s.what !== 'evening') || s.b <= T || s.a >= T + DINNER_LEN) return [s];
    const a = Math.max(s.a, T), b = Math.min(s.b, T + DINNER_LEN);
    return [
      ...(s.a < a ? [{ ...s, b: a }] : []),
      { ...s, a, b, room: K, what: 'dinner' as const },
      ...(b < s.b ? [{ ...s, a: b }] : []),
    ];
  });
  const spansOf = new Map<number, RoomSpan[]>();
  for (const s of spans) (spansOf.get(s.m) ?? spansOf.set(s.m, []).get(s.m)!).push(s);
  const avail = new Map<number, Iv[]>();
  for (const [m, list] of spansOf) avail.set(m, mergeIv(list.filter((s) => s.what !== 'night').map((s): Iv => [s.a, s.b])));
  const availOf = (m: number): Iv[] => avail.get(m) ?? [];
  const presentOver = (m: number, a: number, b: number) => availOf(m).some(([x, y]) => x <= a && y >= b);
  // Premier instant ≥ t où `m` est éveillé au logement, ou null.
  const nextPresent = (m: number, t: number): number | null => {
    for (const [x, y] of availOf(m)) if (y > t) return Math.max(x, t);
    return null;
  };
  // Coucher (début du passage en chambre) de chaque membre, ou null s'il ne se couche pas au logement ce jour-là.
  const bedtimeOf = (m: number): RoomSpan | null => {
    const list = (spansOf.get(m) ?? []).filter((s) => s.what !== 'night');
    const last = list[list.length - 1];
    return last && last.what === 'bedtime' ? last : null;
  };

  // ─── occupation des membres : dehors, endormi, escalier, habillage ───
  const real = (m: number | undefined): m is number => m !== undefined && m >= 0 && m < total;
  const busy: Iv[][] = [];
  const own = (m: number) => (busy[m] ??= []);
  for (let m = 0; m < total; m++) {
    let t = 0;
    for (const [x, y] of availOf(m)) {
      if (x > t) own(m).push([t, x]);
      t = Math.max(t, y);
    }
    own(m).push([t, DAY_END + 1]);
  }
  hd.people.forEach((p, m) => {
    for (const [a, b] of p.out) own(m).push([a - d.climb, a], [b, b + d.climb]);
    for (const x of [p.dressAt, p.undressAt]) own(m).push([x - DRESS_GAP, x + DRESS_GAP]);
  });
  for (const g of guests) own(g.m).push([g.a, g.a + d.climb], [g.b - d.climb, g.b]);

  const slot = (m: number, t: number, dur: number, maxShift: number): number | null => {
    let s = t;
    for (let guard = 0; guard < 64; guard++) {
      if (s - t > maxShift || s < 0 || s + dur > DAY_END) return null;
      const hit = own(m).find(([a, b]) => s < b && s + dur > a);
      if (!hit) return s;
      s = hit[1];
    }
    return null;
  };
  // Au balcon, chacun sa place (`slot`) : la place demandée si elle est libre, sinon la première libre (au-delà des places
  // du garde-corps, l'occupant reste dans l'embrasure, window-choreo.ts).
  const onBalcony: Act[] = [];
  const push = (t0: number, dur: number, room: Room, where: Where, choreo: Choreo, m: number, x: ActExtra) => {
    own(m).push([t0, t0 + dur]);
    let extra = x;
    if (where === 'balcony') {
      const used = new Set(onBalcony.filter((b) => b.t0 < t0 + dur && b.t1 > t0).map((b) => b.slot ?? 0));
      let slot = x.slot ?? 0;
      if (used.has(slot)) for (slot = 0; used.has(slot); slot++);
      extra = { ...x, slot };
    }
    const g: Act = { k: 'act', t0, t1: t0 + dur, room, where, choreo, m, ...extra };
    S.push(g);
    if (where === 'balcony') onBalcony.push(g);
  };
  // Scène courte jouée par `m` dès qu'il est libre ; renvoie l'heure réelle, ou null.
  const act = (t0: number, dur: number, room: Room, where: Where, choreo: Choreo, m: number | undefined, x: ActExtra = {}, maxShift = SHIFT): number | null => {
    if (!real(m)) return null;
    const s = slot(m, t0, dur, maxShift);
    if (s === null) return null;
    push(s, dur, room, where, choreo, m, x);
    return s;
  };
  // Scène courte jouée par le premier de la liste qui peut.
  const actFirst = (who: readonly number[], t0: number, dur: number, room: Room, where: Where, choreo: Choreo, x: ActExtra = {}): number | null => {
    for (const m of who) {
      const s = act(t0, dur, room, where, choreo, m, x);
      if (s !== null) return s;
    }
    return null;
  };
  // Scène courte du foyer : `m` d'abord, sinon un autre membre libre.
  const actAny = (t0: number, dur: number, room: Room, choreo: Choreo, m: number, x: ActExtra = {}): number | null =>
    actFirst([m, ...ms.filter((i) => i !== m)], t0, dur, room, 'in', choreo, x);
  // Pose longue : posée à la fin, dans les trous du membre.
  const fills: { a: number; b: number; room: Room; choreo: Choreo; m: number; x: ActExtra }[] = [];
  const fill = (a: number, b: number, room: Room, choreo: Choreo, m: number | undefined, x: ActExtra = {}) => {
    if (real(m) && b - a >= MIN_POSE) fills.push({ a, b, room, choreo, m, x });
  };

  // ─── segments ───
  const lit = (room: Room, t0: number, t1: number, tone: LightTone = base) => {
    if (t1 > t0) lits.push({ room, t0, t1, tone, pri: pri(tone, base) });
  };
  const shut = (room: Room, t: number, to: number, dur = 1.2) => {
    if (d.shutters && shutUser) S.push({ k: 'shut', room, t, to, dur });
  };
  const curt = (room: Room, t: number, to: number, dur = 0.6) => S.push({ k: 'curt', room, t, to, dur });
  const win = (room: Room, t: number, to: number, dur = 0.25) => S.push({ k: 'win', room, t, to, dur });

  // ─── chorégraphies composées ───
  const shutters = !!d.shutters && shutUser;
  const openShutters = (room: Room, t: number, m: number, slow = false) => {
    if (!shutters) return;
    const k = slow ? 1.5 : 1;
    const s = actAny(t, 3.4 * k, room, 'openShutters', m) ?? t;
    shut(room, s + 1.0 * k, 1, 1.3 * k);
    win(room, s + 2.35 * k, 1);
  };
  const quickShut = (room: Room, t: number, m: number, to: number) => {
    if (!shutters) return;
    const s = actAny(t, 1.1, room, 'armsUp', m) ?? t;
    shut(room, s + 0.3, to, 0.7);
  };
  const closeShutters = (room: Room, t: number, m: number) => {
    if (!shutters) return;
    const s = actAny(t, 1.6, room, 'closeShutters', m) ?? t;
    win(room, s + 0.35, 0);
    shut(room, s + 0.6, 0, 0.9);
  };
  const drawCurt = (room: Room, t: number, m: number) => {
    const s = actAny(t, 1.0, room, 'drawCurtains', m) ?? t;
    curt(room, s + 0.3, 1, 0.5);
  };
  const openCurt = (room: Room, t: number, m: number) => {
    const s = actAny(t, 0.8, room, 'drawCurtains', m, { reverse: true }) ?? t;
    curt(room, s + 0.2, 0, 0.4);
  };
  // Cigarette au balcon (pas sous la pluie) ou à la fenêtre de la cuisine.
  const smoke = (t: number, m: number | undefined, x: ActExtra = {}) => {
    if (d.balcony && !day.wet) {
      const s = act(t, 4.6, L, 'balcony', 'smoke', m, x);
      if (s !== null) {
        win(L, s - 0.1, 1);
        win(L, s + 4.6, 0);
      }
    } else {
      const s = act(t, 3.6, K, 'lean', 'smoke', m, x);
      if (s !== null) {
        win(K, s - 0.1, 1);
        win(K, s + 3.6, 0);
      }
    }
  };
  // Cigarette à l'heure prévue, ou dès le retour du fumeur s'il n'est pas là, avant son coucher.
  const smokeAround = (t: number, m: number) => {
    const at = nextPresent(m, t);
    const bed = bedtimeOf(m)?.a ?? DAY_END;
    if (at !== null && at < bed - 6) smoke(at, m);
  };
  // Regarder la rue : au balcon du salon, ou penché à la fenêtre (toujours à la fenêtre sous la pluie).
  const look = (t: number, dur: number, m: number | undefined, room: Room = L, x: ActExtra = {}): number | null => {
    const out = d.balcony && room === L && !day.wet;
    const s = act(t, dur, room, out ? 'balcony' : 'lean', out ? 'leanRail' : 'lean', m, x);
    if (s !== null) {
      win(room, s - 0.1, 1);
      win(room, s + dur, 0);
    }
    return s;
  };

  // ─── départs et retours par la porte ───
  hd.people.forEach((p, m) => {
    for (const [a, b] of p.out) {
      if (a > 0 && a <= DAY_END) S.push({ k: 'depart', t: a, m });
      if (b > 0 && b <= 1440) S.push({ k: 'return', t: b, m }); // rentré après minuit : retour de nuit du lendemain (1440 pile : ce soir)
    }
  });
  for (const g of guests) {
    S.push({ k: 'return', t: g.a, m: g.m });
    S.push({ k: 'depart', t: g.b, m: g.m });
  }

  // ─── feux : on ouvre 2 min avant le début, on éteint le salon, on regarde jusqu'à la fin (présents et libres) ───
  if (show) {
    const a = show.start - 2, b = show.end + 1;
    // Adultes d'abord (trois places au balcon) ; les enfants déjà couchés ne regardent pas.
    const who = ms.filter((m) => presentOver(m, a, b) && !own(m).some(([x, y]) => a < y && b > x))
      .sort((p, q) => Number(isKid(p)) - Number(isKid(q)) || p - q);
    if (who.length) {
      if (d.balcony && !day.wet) {
        who.slice(0, 3).forEach((m, i) => act(a + 0.4 * i, b - a - 0.4 * i, L, 'balcony', 'leanRail', m, { slot: i, event: true }, 0));
        win(L, a - 0.2, 1);
        win(L, b, 0);
      } else {
        act(a, b - a, L, 'lean', 'lean', who[0], { slot: 0, event: true }, 0);
        win(L, a - 0.2, 1);
        win(L, b, 0);
        if (who[1] !== undefined) {
          act(a + 0.4, b - a - 0.4, K, 'lean', 'lean', who[1], { slot: K === L ? 1 : 0, event: true }, 0);
          if (K !== L) {
            win(K, a + 0.2, 1);
            win(K, b + 0.2, 0);
          }
        }
      }
      S.push({ k: 'dim', t0: show.start - 1, t1: b });
    }
  }

  // ─── matin : le premier présent ouvre le salon et la cuisine, le dernier levé ouvre la chambre ───
  const firstSpan = (m: number) => spansOf.get(m)?.find((s) => s.what !== 'night');
  const morning = ms.flatMap((m) => {
    const s = firstSpan(m);
    return s && s.what !== 'bedtime' && s.a < Math.min(day.sunset, 1200) ? [{ m, s }] : [];
  });
  if (morning.length) {
    const { m: F, s } = morning.reduce((u, v) => (v.s.a < u.s.a ? v : u));
    const woke = s.what === 'wake';
    const bf = spansOf.get(F)!.find((x) => x.what === 'breakfast');
    openShutters(L, s.a + (woke ? 3 : 2), F, hh.type === 'retraite');
    if (K !== L) quickShut(K, (woke && bf ? bf.a : s.a + 6) + 0.4, F, 1);
    openCurt(L, woke && bf ? bf.b + 1 : s.a + 8, F);
    const risers = morning.filter((x) => x.s.what === 'wake');
    if (C && risers.length) {
      const last = risers.reduce((u, v) => (v.s.a > u.s.a ? v : u));
      quickShut(C, last.s.a + 1.5, last.m, 1);
    }
  }
  // Petit-déjeuner : un adulte présent prépare le premier.
  const breakfasts = meals.breakfast.flatMap((t, m) => (t >= 0 ? [{ t, m }] : []));
  if (breakfasts.length) {
    const t = Math.min(...breakfasts.map((x) => x.t));
    const cooks = [...breakfasts.filter((x) => !isKid(x.m)).sort((p, q) => p.t - q.t).map((x) => x.m), ...adults];
    actFirst(cooks, t + 1.6, 7, K, 'in', 'cook');
  }
  // Retour (sauf retour de nuit, avant le lever) : on traverse le salon.
  hd.people.forEach((p, m) => {
    for (const [, b] of p.out) if (b > 0 && b <= 1440 && b >= p.wake) act(b + d.climb + 0.15, 0.5, L, 'in', 'cross', m);
  });
  // Départ en vacances : volets fermés, rideaux tirés avant de partir.
  if (hd.away.state === 'leaves' && hd.away.at !== undefined) {
    const at = hd.away.at;
    const by = ms.find((m) => presentOver(m, at - 12, at - 2)) ?? 0;
    drawCurt(L, at - 12, by);
    closeShutters(L, at - 10, by);
    if (K !== L) closeShutters(K, at - 8, by);
    if (C) closeShutters(C, at - 6, by);
  }

  // ─── retraités : arrosage, tapis, regarder la rue, volets à la tombée de la nuit ───
  const olds = ms.filter((m) => hh.members[m]!.who.status === 'retraite');
  let lookEnd = 0; // fin du regard sur la rue de l'après-midi
  if (hh.type === 'retraite') {
    const tw = 643 + (r() - 0.5) * 20, tr = 675 + (r() - 0.5) * 20;
    if (opt.water) {
      for (const m of olds) {
        const s = d.balcony ? act(tw, 4.2, L, 'balcony', 'water', m) : act(tw, 2.6, K, 'lean', 'water', m);
        if (s === null) continue;
        const room = d.balcony ? L : K, dur = d.balcony ? 4.2 : 2.6;
        win(room, s - 0.1, 1);
        win(room, s + dur, 0);
        break;
      }
    }
    if (opt.rug) {
      for (const m of [...olds].reverse()) {
        const s = act(tr, 1.5, L, 'lean', 'shake', m);
        if (s === null) continue;
        win(L, s - 0.1, 1);
        win(L, s + 1.5, 0);
        break;
      }
    }
    if (opt.look) {
      const m2 = n > 1 ? 1 : 0;
      if (!workday) look(606 + (r() - 0.5) * 20, 15, m2);
      look(837 + (r() - 0.5) * 30, 7, 0);
      const s = look(984 + (r() - 0.5) * 30, 22, m2);
      if (s !== null) lookEnd = s + 22;
    }
  }
  const lastBed = ms.map(bedtimeOf).reduce<RoomSpan | null>((u, v) => (v && (!u || v.a > u.a) ? v : u), null);
  let eveningShut = false, curtains = false;
  if (hh.type === 'retraite' && lastBed) {
    // Volets à la tombée de la nuit du lieu (coucher + 20 min), après le dernier regard sur la rue de l'après-midi (on ne
    // ferme pas la fenêtre de celui qui est penché ou au balcon), ou avant d'aller se coucher quand la nuit tombe plus tard
    // (été, jour polaire). Par un présent ; personne : au retour du premier.
    const nightfall = Math.min(Math.max(day.sunset + 20, lookEnd + 1), lastBed.a - 5);
    const first = ms.map((m) => ({ m, t: nextPresent(m, nightfall) })).filter((x): x is { m: number; t: number } => x.t !== null)
      .sort((p, q) => p.t - q.t || p.m - q.m)[0] ?? { m: lastBed.m, t: nightfall };
    const t = first.t > nightfall ? first.t + d.climb + 1 : nightfall; // rentré après : en arrivant
    closeShutters(K, t, first.m);
    if (K !== L) closeShutters(L, t + 1.6, first.m);
    drawCurt(L, t + 3.4, first.m); // les rideaux ouverts le matin se tirent le soir
    if (C) shut(C, t + 3.5, 0);
    eveningShut = curtains = true;
  }
  // Rideaux du salon tirés au coucher du soleil (entre 17 h et 21 h), par le premier présent à cette heure ou rentré après.
  if (!curtains && lastBed) {
    const T = Math.max(CURTAINS[0], Math.min(day.sunset, CURTAINS[1]));
    const at = ms.map((m) => ({ m, t: nextPresent(m, T) })).filter((x): x is { m: number; t: number } => x.t !== null && x.t < lastBed.a)
      .sort((p, q) => p.t - q.t)[0];
    if (at) drawCurt(L, at.t + 1, at.m);
  }
  // Dîner (et dîner des petits) préparé par un adulte présent, la nounou pour les petits.
  const cooksAt = (t: number, first: readonly number[] = []) =>
    [...first, ...adults.filter((m) => presentOver(m, t, t + 5)), ...adults].filter((m, i, all) => all.indexOf(m) === i);
  if (meals.dinner !== null) actFirst(cooksAt(meals.dinner - 27), meals.dinner - 27, 25, K, 'in', 'cook');
  if (meals.kidsDinner !== null && meals.dinner !== null && meals.kidsDinner < meals.dinner - 30) {
    const t = meals.kidsDinner - 20;
    actFirst(cooksAt(t, nannies.filter((m) => presentOver(m, t, t + 5))), t, 18, K, 'in', 'cook');
  }
  // Coucher des enfants : un adulte (ou la nounou) se tient dans la chambre.
  const sleepRoom: Room = C ?? L;
  const firstBeds = ms.map(bedtimeOf).filter((s): s is RoomSpan => !!s && s.a >= 900).sort((p, q) => p.a - q.a);
  let stander: number | null = null;
  for (const s of firstBeds) {
    if (!isKid(s.m)) continue;
    for (const m of [...adults, ...nannies].filter((x) => presentOver(x, s.a, s.a + 3))) {
      if (act(s.a, 3, sleepRoom, 'in', 'stand', m) === null) continue;
      if (s === firstBeds[0]) stander = m;
      break;
    }
  }
  // Volets : le premier couché ferme la chambre, le dernier couché le salon et la cuisine.
  if (!eveningShut && firstBeds.length && C) {
    const s = firstBeds[0]!;
    closeShutters(C, s.a + (isKid(s.m) ? 3.5 : 2), isKid(s.m) ? stander ?? adults[0] ?? s.m : s.m);
  }
  if (!eveningShut && lastBed) {
    closeShutters(L, lastBed.a - 4, lastBed.m);
    if (K !== L) shut(K, lastBed.a - 1, 0);
    if (C && !firstBeds.length) closeShutters(C, lastBed.a + 3, lastBed.m);
  }

  // ─── scènes facultatives, dans le temps libre de qui est concerné ───
  const afterDinner = (meals.dinner ?? 1200) + 40;
  if (cool) {
    for (const m of ms) {
      if (r() < ROUTINE_SMOKE) smokeAround(afterDinner + 2 + r() * 20, m);
      if (isStudent(m) && r() < ROUTINE_SMOKE) smokeAround(1410 + r() * 10, m);
    }
  } else if (opt.smoke && adults.length) smokeAround(afterDinner + 8 + r() * 20, adults[0]!);
  if (opt.kidWindow) {
    const homes = spans.filter((s) => isKid(s.m) && s.what === 'home' && s.b - s.a >= 10 && s.a < 1260);
    const s = homes[Math.floor(r() * homes.length)];
    if (s) act(s.a + 1 + r() * (s.b - s.a - 6), 4, L, 'lean', 'lean', s.m);
  }
  if (opt.look && hh.type !== 'retraite') {
    const homes = spans.filter((s) => s.m < n && (s.what === 'home' || s.what === 'evening') && s.b - s.a >= 20 && s.b > 540 && s.a < 1290);
    const s = homes[Math.floor(r() * homes.length)];
    if (s) {
      const a = Math.max(s.a, 540), b = Math.min(s.b, 1290);
      const dur = 6 + r() * 8;
      if (b - a > dur + 2) look(a + 1 + r() * (b - a - dur - 2), dur, s.m);
    }
  }
  // Fête (orange) : membres présents au salon, tout le monde danse, fumeurs qui se relaient au balcon toutes les 25 min.
  const nyeParty = !!show && day.fests.includes('new-year') && (hh.type === 'couple' || hh.type === 'coloc');
  let party: Iv | null = null;
  if (opt.party || nyeParty) {
    const salon = mergeIv(spans.filter((s) => s.m < n && s.room === L).map((s): Iv => [Math.max(s.a, PARTY[0]), Math.min(s.b, PARTY[1])]));
    if (salon.length) party = [salon[0]![0], salon[salon.length - 1]![1]];
  }
  if (party && party[1] - party[0] >= 30) {
    const [t0, t1] = party;
    S.push({ k: 'party', t0, t1 });
    for (const s of spans) if (s.room === L) lit(L, Math.max(s.a, t0), Math.min(s.b, t1), 'orange');
    win(L, t0 + 3, 1);
    const all = ms.filter((m) => availOf(m).some(([x, y]) => x < t1 && y > t0));
    if (all.length) drawCurt(L, t0 - 15, all[0]!); // rideaux tirés avant la fête
    if (d.balcony && !day.wet && all.length) {
      for (let k = 0; k * 25 + 24 < t1 - t0 - 20; k++) {
        smoke(t0 + 24 + k * 25, all[k % all.length]);
        act(t0 + 25 + k * 25, 4.5, L, 'balcony', 'leanRail', all[(k + 1) % all.length], { slot: 1 });
      }
    }
    all.forEach((m, i) => fill(t0 + 6 + i * 2, t1 - 2, L, 'dance', m, { slot: i }));
  } else party = null;

  // ─── événements de la rue ───
  // Déménagement d'un commerce (shops/moving.ts : camion de 8 h-8 h 30 à 9 h 30-10 h) : les curieux regardent pendant qu'on porte
  // les meubles, entre 8 h 25 et 9 h 15 (une scène décalée de 30 min au plus quand le membre est occupé finit avant 10 h).
  if (day.moving && (hh.type === 'retraite' || (hh.type === 'etudiant' && !workday) || r() < 0.25)) {
    const t = 505 + r() * 50, dur = 6 + r() * 8;
    for (const m of ms) if (look(t, dur, m, L, { event: true }) !== null) break;
  }
  const [y, mo, dd] = day.iso.split('-').map(Number) as [number, number, number];
  if (day.fests.includes('music') && festivityStartsOn({ y, m: mo, d: dd }, 'music')) {
    const here = ms.filter((m) => presentOver(m, 1266, 1330));
    if (here.length) {
      const tLook = 1266 + r() * 24;
      const tDance = 1296 + r() * 24;
      win(L, 1260, 1);
      look(tLook, 20, here[0], L, { event: true });
      here.forEach((m, i) => act(tDance, 30, L, 'in', 'dance', m, { slot: i, event: true }));
    }
  }
  // ─── Halloween : poses et retraits du jour, par le membre prévu sinon un autre adulte, au premier moment libre après l'heure
  // de tendance ; la fenêtre (porte-fenêtre du balcon) s'ouvre le temps du geste. Personne de libre : le décor change d'état
  // sans geste (halloween.ts, `decorSwitch`). ───
  for (const { item, removing, at } of decor) {
    const balcony = item.gesture === 'balcony';
    const room: Room = balcony ? L : item.room;
    if (!has(room)) continue;
    const { dur } = DECOR_SCENE[item.gesture];
    const x: ActExtra = { decor: { id: item.id, kind: item.kind, dx: item.dx }, ...(removing ? { reverse: true } : {}) };
    const who = [item.m, ...adults.filter((i) => i !== item.m)];
    let s: number | null = null;
    for (const shift of DECOR_TRIES) {
      for (const m of who) {
        s = act(at + shift, dur, room, balcony ? 'balcony' : 'lean', balcony ? 'decorBalcony' : 'decorLean', m, x);
        if (s !== null) break;
      }
      if (s !== null) break;
    }
    if (s !== null) {
      win(room, s - 0.1, 1);
      win(room, s + dur, 0);
    }
  }
  // Sapin allumé le soir tant que quelqu'un du foyer est là.
  if (day.december && hh.sapin) {
    for (const [a, b] of mergeIv(ms.flatMap(availOf))) if (b > 1008) S.push({ k: 'sapin', t0: Math.max(a, 1008), t1: b });
  }

  // ─── poses longues : là où chacun se trouve (table aux repas, devoirs, bureau de l'étudiant, télé ou lecture, danse) ───
  for (const what of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
    for (const table of clusters(spans.filter((s) => s.what === what))) {
      table.forEach((s, i) => fill(s.a + i * 0.5, s.b - (i ? 0.6 : 0), s.room, 'table', s.m, { seat: i, party: table.length }));
    }
  }
  // Devoirs : au bureau seul, à table à plusieurs (frères et sœurs, la nounou avec eux).
  for (const group of clusters(spans.filter((s) => s.what === 'homework'))) {
    group.forEach((s, i) => fill(s.a + 1 + i * 0.5, s.b - 1, s.room, 'table', s.m, group.length > 1 ? { seat: i, party: group.length } : { seat: 0, party: 1, desk: true }));
  }
  for (const s of spans) {
    if (isStudent(s.m) && (s.what === 'home' || s.what === 'evening')) fill(s.a + 1, s.b - 1, s.room, 'table', s.m, { seat: 0, party: 1, desk: true });
  }
  const tv = opt.tv && !party;
  for (const group of clusters(spans.filter((s) => s.what === 'evening' && s.room === L && !isKid(s.m) && !isStudent(s.m)))) {
    group.forEach((s, i) => fill(s.a + 0.4 + i * 0.3, s.b - 0.8, L, tv ? 'tv' : 'read', s.m, { seat: i }));
  }
  for (const f of fills) {
    const list = own(f.m).slice().sort((p, q) => p[0] - q[0]);
    let a = f.a;
    for (const [x, y2] of [...list, [Infinity, Infinity] as Iv]) {
      if (y2 <= a) continue;
      const b = Math.min(x, f.b);
      if (b - a >= MIN_POSE) push(a, b - a, f.room, 'in', f.choreo, f.m, f.x);
      a = Math.max(a, y2);
      if (a >= f.b) break;
    }
  }

  // ─── lumières : les pièces occupées (télé ou lampe de lecture au salon le soir), la pièce d'une scène ───
  for (const s of spans) {
    const evening = s.room === L && s.what === 'evening' && !isKid(s.m) && !isStudent(s.m) && !party;
    lit(s.room, s.a, s.b, evening ? (opt.tv ? 'tv' : 'warm') : base);
  }
  for (const g of S) if (g.k === 'act') lit(g.room, g.t0, g.t1);
  // Une seule par pièce à la fois (télé, puis fête, puis lumière du foyer ; à égalité, la plus récente).
  for (const room of new Set(lits.map((l) => l.room))) {
    // Balayage : les lumières en cours (`on`) entre deux coupures consécutives.
    const mine = lits.filter((l) => l.room === room).sort((p, q) => p.t0 - q.t0);
    const cuts = [...new Set(mine.flatMap((l) => [l.t0, l.t1]))].sort((p, q) => p - q);
    let prev: Lit | null = null;
    let on: typeof mine = [];
    let next = 0;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const p = cuts[i]!, q = cuts[i + 1]!;
      while (next < mine.length && mine[next]!.t0 <= p) on.push(mine[next++]!);
      on = on.filter((l) => l.t1 >= q);
      if (!on.length) { prev = null; continue; }
      const top = on.reduce((u, v) => (v.pri > u.pri || (v.pri === u.pri && v.t0 >= u.t0) ? v : u));
      if (prev && prev.t1 === p && prev.tone === top.tone) prev.t1 = q;
      else S.push((prev = { k: 'lit', room, t0: p, t1: q, tone: top.tone }));
    }
  }
  // Extinctions du coucher : les pièces encore allumées quand le dernier éveillé va se coucher (dernière lumière finissant
  // entre son coucher − 15 et + 40) s'éteignent dans l'ordre tiré du jour (`draw.offOrder`), à quelques minutes d'écart, à
  // partir de la première extinction prévue ; une lumière n'est jamais éteinte avant que sa pièce soit vide, ni plus de
  // LIGHT_GRACE minutes après que tout le monde dort ; une pièce où une scène est en cours ne s'éteint qu'à la fin de la scène.
  const asleep = Math.max(0, ...ms.flatMap((m) => availOf(m).map(([, b]) => b)));
  if (lastBed && lastBed.b >= asleep) {
    const bed = lastBed.a;
    const lastLit = new Map<Room, Lit>();
    for (const g of S) if (g.k === 'lit' && g.t1 >= bed - OFF.before && g.t1 <= bed + OFF.after && g.t1 > (lastLit.get(g.room)?.t1 ?? -1)) lastLit.set(g.room, g);
    if (lastLit.size) {
      const rooms = draw.offOrder.filter((room) => lastLit.has(room));
      let t = Math.min(...[...lastLit.values()].map((g) => g.t1));
      for (const room of rooms) {
        const g = lastLit.get(room)!;
        const later = S.some((x) => x.k === 'lit' && x.room === room && x.t0 >= g.t1);
        let end = Math.max(g.t1, Math.min(Math.max(t, g.t0 + OFF.minLit), asleep + LIGHT_GRACE));
        for (const a of S) if (a.k === 'act' && a.room === room && a.t0 < end && a.t1 > end) end = a.t1;
        if (!later) g.t1 = end;
        t = end + OFF.gap[0] + r() * (OFF.gap[1] - OFF.gap[0]);
      }
    }
  }
  return S;
}

// Bornes du jour : une scène hors de [0, 1800] est rognée, une scène vide retirée.
function clamp(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const g of segments) {
    if ('t0' in g) {
      const t0 = Math.max(0, g.t0), t1 = Math.min(DAY_END, g.t1);
      if (t1 > t0) out.push({ ...g, t0, t1 });
    } else if ('dur' in g) {
      if (g.dur > 0 && g.t >= 0 && g.t + g.dur <= DAY_END) out.push(g);
    } else if (g.t >= 0 && g.t <= DAY_END) out.push(g);
  }
  return out.sort((a, b) => ('t' in a ? a.t : a.t0) - ('t' in b ? b.t : b.t0));
}

function maxActors(segments: Segment[]): number {
  const marks: [number, number][] = [];
  for (const g of segments) if (g.k === 'act') marks.push([g.t0, 1], [g.t1, -1]);
  marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, max = 0;
  for (const [, v] of marks) max = Math.max(max, (cur += v));
  return max;
}

// Emploi du temps d'un logement pour un jour de scène, d'après les journées de chacun (`hd`) et les visites du jour.
// Parti (semaine de vacances) : aucun segment (volets fermés tout le jour pour qui les ferme). `decor` : décors
// d'Halloween à poser ou retirer ce jour-là (halloween.ts, `decorTasks`). Calculé une fois par jour et par logement
// (dwelling-day.ts, cache de la vie de la scène), jamais par image.
export function buildSchedule(d: Dwelling, day: SceneDay, draw: DayDraw, hd: HouseholdDays, visits: readonly Visit[], decor: readonly DecorTask[] = [], meals?: HouseholdMeals): Schedule {
  const shutUser = SHUT_USERS.has(d.hh.type);
  if (hd.away.state === 'away') return { dwelling: d.id, segments: [], shutUser, maxActors: 0 };
  const segments = clamp(compose(d, day, draw, hd, visits, decor, meals));
  return { dwelling: d.id, segments, shutUser, maxActors: maxActors(segments) };
}
