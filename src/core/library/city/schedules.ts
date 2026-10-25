import { mulberry32 } from '../scene-world';
import { festivityStartsOn } from './calendar';
import { DECOR_SCENE, type DecorTask, type HwKind } from './halloween';
import type { Dwelling, Room } from './households';
import type { DayDraw, SceneDay } from './scene-day';

const EARLY_RETIREES = 0.45; // probabilité, chaque jour, qu'un retraité soit debout vers 7 h

// Emplois du temps d'un jour de scène (port de `buildSchedule`, docs/superpowers/maquettes/vie-etages/src/04-emplois.js ;
// spec 2026-10-19 « vie au-dessus de la rue » §5.1 : imprévisible mais logique). Un emploi du temps est une liste de segments
// en minutes depuis minuit du jour de scène (0-1800, après minuit = 1440 + x), fonction pure du logement, du jour et du
// tirage du jour (`dayDraw`) : les horaires types de notes.md §Emploi du temps sont des tendances décalées par `draw.wake`
// (lever), `draw.back` (retour), `draw.evening` (dîner, télé) et `draw.bed` (coucher) ; une scène facultative n'existe que si
// `draw.optional` l'accorde. Les petits tirages internes (écart entre deux retours, heure d'une cigarette…) viennent de
// `mulberry32(draw.rng)`.
//
// Cohérence (absente de la maquette) : un membre ne joue jamais deux scènes à la fois ni pendant qu'il est dehors. Les scènes
// courtes (volets, rideaux, cuisine, cigarette, penché…) sont posées dans l'ordre et repoussées au premier moment libre
// (au plus SHIFT minutes, sinon un autre membre s'en charge ; à défaut, volets et rideaux bougent sans pantin, comme une scène
// écartée) ; les poses longues (table, télé, lecture, bureau, danse) remplissent ensuite les trous qui restent (on quitte la
// table pour fumer, puis on revient). Un indice `m` ≥ `hh.members.length` désigne un invité (dîner, fête), qui arrive et
// repart par la porte (`return` / `depart`).

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
type ActExtra = Partial<Pick<Act, 'seat' | 'party' | 'desk' | 'slot' | 'reverse' | 'event' | 'decor'>>;

const DAY_END = 1800;
// Retard maximal d'une scène courte quand son membre est occupé (minutes) ; pose longue gardée si ≥ MIN_POSE minutes.
const SHIFT = 30;
const MIN_POSE = 2;
// Probabilité qu'un étudiant ou un colocataire fume à l'heure prévue (ils fument selon leur emploi du temps, pas selon
// `hh.smoker`, réservé aux couples et aux personnes seules ; même valeur que OPTIONAL.smoke de scene-day.ts).
const ROUTINE_SMOKE = 0.85;
// Teinte de base d'un foyer (maquette : warm, warm, cream, orange), tirée de la graine du foyer.
const TONES: readonly LightTone[] = ['warm', 'warm', 'cream', 'orange'];
// Extinctions du coucher (minutes) : fenêtre autour de `bed`, écart tiré entre deux pièces, durée minimale d'une lumière.
const OFF = { before: 15, after: 40, gap: [1.5, 7], minLit: 3 } as const;
const SHUT_USERS = new Set(['couple', 'famille', 'retraite', 'solo']);
// Halloween : essais successifs d'un geste de décor après l'heure de tendance (minutes), chacun décalé de SHIFT au plus.
const DECOR_TRIES = [0, 40, 80, 120, 160] as const;

// Plan des feux pour la seconde passe : qui regarde (membres présents pendant tout le spectacle), si le foyer réagit.
type ShowPlan = { who: number[] };
type Composed = { segments: Segment[]; shutUser: boolean; bed: number; kidBed: number; gone: [number, number, number][] };

const pri = (tone: LightTone, base: LightTone): number => (tone === 'tv' ? 3 : tone === 'orange' && base !== 'orange' ? 2 : 1);

function compose(d: Dwelling, day: SceneDay, draw: DayDraw, plan: ShowPlan | null, decor: readonly DecorTask[]): Composed {
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
  const m2 = n > 1 ? 1 : 0;
  const sick = draw.presence === 'sick';
  const workday = !day.weekend && day.kind !== 'public-holiday';
  const off = !workday || sick; // matin de week-end (et journée à la maison du malade)
  const W = draw.wake, Bk = draw.back, E = draw.evening, Z = draw.bed;
  const show = day.show;
  const base = TONES[Math.floor(mulberry32(hh.seed)() * TONES.length)]!;
  // Le foyer qui regarde les feux veille jusqu'à la fin du spectacle.
  const late = (bed: number) => (plan && show ? Math.max(bed, show.end + 4) : bed);
  // Fête du Nouvel An (couple, coloc) ou fête de la coloc du samedi.
  const nyeParty = !!show && day.fests.includes('new-year') && (hh.type === 'couple' || hh.type === 'coloc');

  // ─── occupation des membres ───
  // Un indice hors du foyer qui n'est pas un invité (foyer plus petit que son type ne le prévoit) ne joue rien.
  let guestCount = 0;
  const real = (m: number | undefined): m is number => m !== undefined && m < n + guestCount;
  const busy: [number, number][][] = [];
  const own = (m: number) => (busy[m] ??= []);
  const gone: [number, number, number][] = [];
  const outAt: (number | undefined)[] = [];
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
  const push = (t0: number, dur: number, room: Room, where: Where, choreo: Choreo, m: number, x: ActExtra) => {
    own(m).push([t0, t0 + dur]);
    S.push({ k: 'act', t0, t1: t0 + dur, room, where, choreo, m, ...x });
  };
  // Scène courte jouée par `m` dès qu'il est libre ; renvoie l'heure réelle, ou null.
  const act = (t0: number, dur: number, room: Room, where: Where, choreo: Choreo, m: number | undefined, x: ActExtra = {}, maxShift = SHIFT): number | null => {
    if (!real(m)) return null;
    const s = slot(m, t0, dur, maxShift);
    if (s === null) return null;
    push(s, dur, room, where, choreo, m, x);
    return s;
  };
  // Scène courte du foyer : `m` d'abord, sinon un autre membre libre.
  const actAny = (t0: number, dur: number, room: Room, choreo: Choreo, m: number, x: ActExtra = {}): number | null => {
    for (const who of [m, ...ms.filter((i) => i !== m)]) {
      const s = act(t0, dur, room, 'in', choreo, who, x);
      if (s !== null) return s;
    }
    return null;
  };
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
    if (d.shutters) S.push({ k: 'shut', room, t, to, dur });
  };
  const curt = (room: Room, t: number, to: number, dur = 0.6) => S.push({ k: 'curt', room, t, to, dur });
  const win = (room: Room, t: number, to: number, dur = 0.25) => S.push({ k: 'win', room, t, to, dur });
  // Sortie et retour par la porte de l'immeuble (malade : personne ne sort). Dehors de (départ − montée) à (retour + montée).
  const leave = (t: number, m: number | undefined) => {
    if (!real(m) || (sick && m < n)) return;
    S.push({ k: 'depart', t, m });
    outAt[m] = t;
    own(m).push([t - d.climb, DAY_END]);
  };
  const arrive = (t: number, m: number | undefined): number => {
    if (!real(m) || (sick && m < n)) return t + d.climb;
    S.push({ k: 'return', t, m });
    const from = outAt[m];
    const list = own(m);
    const open = from === undefined ? -1 : list.findIndex(([a, b]) => a === from - d.climb && b === DAY_END);
    if (open >= 0) list[open] = [from! - d.climb, t + d.climb];
    else list.push([0, t + d.climb]); // invité : pas là avant son arrivée
    gone.push([m, from ?? 0, t]);
    outAt[m] = undefined;
    return t + d.climb;
  };
  // Invités : arrivent par la porte, repartent avant le coucher.
  const guest = (tIn: number, tOut: number): number => {
    const m = n + guestCount++;
    arrive(tIn, m);
    leave(tOut, m);
    return m;
  };

  // ─── chorégraphies composées ───
  const openShutters = (room: Room, t: number, m: number, slow = false) => {
    const k = slow ? 1.5 : 1;
    lit(room, t - 0.3, t + 18);
    if (!d.shutters) return;
    const s = actAny(t, 3.4 * k, room, 'openShutters', m) ?? t;
    shut(room, s + 1.0 * k, 1, 1.3 * k);
    win(room, s + 2.35 * k, 1);
  };
  const quickShut = (room: Room, t: number, m: number, to: number) => {
    if (!d.shutters) return;
    const s = actAny(t, 1.1, room, 'armsUp', m) ?? t;
    shut(room, s + 0.3, to, 0.7);
  };
  const closeShutters = (room: Room, t: number, m: number) => {
    if (!d.shutters) return;
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
  const meal = (room: Room, t: number, dur: number, who: number[]) => {
    who.forEach((m, i) => fill(t + i * 0.5, t + dur - (i ? 0.6 : 0), room, 'table', m, { seat: i, party: who.length }));
    if (sick) {
      lit(K, t - 3, t + dur + 3);
      lit(L, t - 3, t + dur + 3);
    }
  };
  // Soirée au salon : télé (teinte `tv`) ou lecture à la lampe chaude.
  const evening = (t0: number, t1: number, who: number[]) => {
    const tv = opt.tv;
    lit(L, t0, t1, tv ? 'tv' : 'warm');
    who.forEach((m, i) => fill(t0 + 0.4 + i * 0.3, t1 - 0.8, L, tv ? 'tv' : 'read', m, { seat: i }));
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
  // Fête (orange) : invités arrivés par la porte, tout le monde danse, fumeurs qui se relaient au balcon toutes les 25 min.
  const party = (t0: number, t1: number, guests: number) => {
    S.push({ k: 'party', t0, t1 });
    lit(L, t0, t1, 'orange');
    win(L, t0 + 3, 1);
    const all = [...ms];
    for (let i = 0; i < guests; i++) all.push(guest(t0 - 15 + i * 9 + r() * 6, t1 - 20 + i * 4));
    if (d.balcony && !day.wet) {
      for (let k = 0; k * 25 + 24 < t1 - t0 - 20; k++) {
        smoke(t0 + 24 + k * 25, all[k % all.length]);
        act(t0 + 25 + k * 25, 4.5, L, 'balcony', 'leanRail', all[(k + 1) % all.length], { slot: 1 });
      }
    }
    all.forEach((m, i) => fill(t0 + 6 + i * 2, t1 - 2, L, 'dance', m, { slot: i }));
  };

  // ─── feux : on ouvre 2 min avant le début, on éteint le salon, on regarde jusqu'à la fin (seconde passe) ───
  if (plan && show && plan.who.length) {
    const a = show.start - 2, b = show.end + 1;
    const who = plan.who;
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

  let shutUser = true;
  let kidBed = Infinity; // enfants couchés (ils ne regardent plus les feux)
  let bed = 0; // extinction du salon (la famille et le retraité ne voient les feux que s'ils veillent encore)
  let firstBack = 0; // premier retour du soir (le sapin s'allume)
  switch (hh.type) {
    case 'couple': {
      const wake = (off ? 516 : 407) + W, out = wake + 52;
      // En semaine, on éteint en partant : cuisine et salon allumés jusqu'au second départ.
      lit(K, wake, off ? out + 3 : out + 16);
      if (!off) lit(L, wake + 1, out + 14);
      quickShut(K, wake + 0.4, 0, 1);
      act(wake + 1.6, 7, K, 'in', 'cook', 0);
      openShutters(L, wake + 8, 1);
      if (C) quickShut(C, wake + 14, 1, 1);
      openCurt(L, wake + 11.6, 1);
      meal(K, wake + 15, 22, ms);
      let back = (off ? 1092 : 1110) + Bk;
      if (!off) {
        win(L, out - 2, 0);
        leave(out, 0);
        leave(out + 14, 1);
      } else {
        if (opt.look) look(wake + 45, 9, 1);
        const lunch = 765 + W * 0.4 + r() * 25, outing = lunch + 70 + r() * 40;
        meal(K, lunch, 40, ms);
        win(L, outing - 4, 0);
        leave(outing, 0);
        leave(outing + 0.3, 1);
        back = Math.max(back, outing + 90);
      }
      const tA = arrive(back, 0);
      const tB = arrive(back + 35 + r() * 15, 1);
      firstBack = back;
      const dinner = Math.max(1227 + E * 0.5, tB + 28);
      const guests = draw.presence === 'guests' ? 1 + (r() < 0.5 ? 1 : 0) : 0;
      bed = late(Math.max(1385 + Z * 0.5, dinner + 72));
      lit(K, tA, dinner + 48 + r() * 10);
      act(tA + 0.15, 0.5, L, 'in', 'cross', 0);
      lit(L, tA + 0.3, bed + 2);
      drawCurt(L, tA + 1.0, 0);
      act(tB + 0.15, 0.5, L, 'in', 'cross', 1);
      act(Math.max(tB + 1, dinner - 27), 25, K, 'in', 'cook', 1);
      const table = [...ms];
      for (let i = 0; i < guests; i++) table.push(guest(dinner - 12 + i * 3, bed - 8 + i));
      meal(K, dinner, 42, table);
      const tvStart = dinner + 45;
      if (opt.smoke) smoke(tvStart + 3 + r() * 20, 0);
      if (nyeParty) {
        bed = Math.max(bed, 1590);
        party(1290, 1590, 2);
      } else evening(tvStart, bed - 0.5, table);
      closeShutters(L, bed, 1);
      if (C) {
        lit(C, bed + 1, bed + 25);
        act(bed + 4, 4, C, 'in', 'stand', 0);
        closeShutters(C, bed + 13, 0);
      }
      shut(K, bed + 4, 0);
      break;
    }
    case 'famille': {
      const kids = ms.filter((i) => hh.members[i]!.kid), adults = ms.filter((i) => !hh.members[i]!.kid);
      const wake = (off ? 498 : 395) + W * 0.6, out = wake + 60;
      lit(K, wake, off ? out + 15 : out + 30); // en semaine, jusqu'au départ du second parent
      if (!off) lit(L, wake + 9, out + 28);
      quickShut(K, wake + 0.4, 0, 1);
      act(wake + 1.6, 9, K, 'in', 'cook', 0);
      openShutters(L, wake + 9, 1);
      if (C) {
        lit(C, wake + 14, wake + 40);
        quickShut(C, wake + 20, 1, 1);
      }
      openCurt(L, wake + 12.8, 1);
      meal(K, wake + 18, 28, ms);
      if (opt.kidWindow) act(wake + 47, 4, L, 'lean', 'lean', kids[0]); // l'enfant regarde la rue avant de partir
      let back1 = (off ? 1080 : 1011) + Bk * 0.7;
      if (!off) {
        leave(out, kids[0]);
        leave(out + 0.25, 0);
        leave(out + 0.5, kids[1]);
        leave(out + 28, 1);
        win(L, out + 24, 0);
      } else {
        if (opt.look) look(wake + 70, 12, 1);
        if (opt.kidWindow) act(wake + 75, 25, L, 'lean', 'lean', kids[0]);
        const lunch = 756 + W * 0.5 + r() * 20, outing = lunch + 85 + r() * 30;
        meal(K, lunch, 45, ms);
        win(L, outing - 6, 0);
        leave(outing, 0);
        leave(outing + 0.2, kids[0]);
        leave(outing + 0.3, kids[1]);
        leave(outing + 0.4, 1);
        back1 = Math.max(back1, outing + 120);
      }
      const tA = arrive(back1, 0);
      arrive(back1 + 0.2, kids[0]);
      arrive(back1 + 0.4, kids[1]);
      firstBack = back1;
      const back2 = back1 + 105 + r() * 30, tB = arrive(back2, 1);
      const dinner = Math.max(1167 + E * 0.6, tB + 10);
      const guests = draw.presence === 'guests' ? 1 + (r() < 0.5 ? 1 : 0) : 0;
      kidBed = dinner + 65 + r() * 10;
      bed = late(Math.max(1355 + Z * 0.6, kidBed + 25));
      lit(K, tA, dinner + 95); // vaisselle et goûters du lendemain, puis la télé seule au salon
      if (C) {
        lit(C, tA + 4, kidBed + 12);
        fill(tA + 8, Math.min(tA + 63, dinner - 2), C, 'table', kids[0], { seat: 0, party: 1, desk: true }); // devoirs
      }
      act(tA + 0.2, 0.5, L, 'in', 'cross', 0);
      act(tB + 0.15, 0.5, L, 'in', 'cross', 1);
      lit(L, tB + 0.3, bed + 10);
      drawCurt(L, tB + 1.1, 1);
      const table = [...ms];
      for (let i = 0; i < guests; i++) table.push(guest(dinner - 12 + i * 3, bed - 8 + i));
      meal(K, dinner, 40, table);
      if (C) {
        act(kidBed, 3, C, 'in', 'stand', 1); // on couche les enfants
        closeShutters(C, kidBed + 3.5, 1);
      }
      evening(dinner + 48, bed - 2, [...adults, ...table.slice(n)]);
      closeShutters(L, bed, 0);
      shut(K, bed + 7, 0);
      break;
    }
    case 'retraite': {
      // Lever tiré chaque jour (aucune habitude figée) : un jour sur deux environ debout vers 7 h (6 h 45 - 7 h 25), sinon
      // vers 7 h 35 - 8 h en semaine, jusqu'à 9 h le week-end.
      const rw = mulberry32(draw.rng ^ 0x7e57);
      const early = rw() < EARLY_RETIREES;
      const wake = early ? 425 + W * 0.4 : 455 + W * 0.5 + rw() * (off ? 60 : 20);
      lit(K, wake, Math.max(546, wake + 40));
      openShutters(K, wake + 4, 0, true);
      openShutters(L, wake + 11, 0, true);
      if (C) shut(C, wake + 18, 1, 1.8);
      openCurt(L, wake + 16.5, 0);
      meal(K, wake + 22, 32, ms);
      lit(L, wake + 10.7, Math.max(wake + 54, 500)); // salon allumé après le petit-déjeuner (le lève-tôt y lit jusqu'à 8 h 20)
      // journée : arrosage, tapis, regarder la rue
      const tw = 643 + W * 0.8 + (r() - 0.5) * 20, tr = 675 + W * 0.9 + (r() - 0.5) * 20;
      if (opt.water) {
        if (d.balcony) {
          const s = act(tw, 4.2, L, 'balcony', 'water', 0);
          if (s !== null) { win(L, s - 0.1, 1); win(L, s + 4.2, 0); }
        } else {
          const s = act(tw, 2.6, K, 'lean', 'water', 0);
          if (s !== null) { win(K, s - 0.1, 1); win(K, s + 2.6, 0); }
        }
      }
      if (opt.rug) {
        const s = act(tr, 1.5, L, 'lean', 'shake', m2);
        if (s !== null) { win(L, s - 0.1, 1); win(L, s + 1.5, 0); }
      }
      let lookEnd = 0; // fin du regard sur la rue de l'après-midi
      if (opt.look) {
        if (off) look(606 + W * 0.5, 15, m2);
        look(837 + W + (r() - 0.5) * 30, 7, 0);
        const s = look(984 + W * 0.5 + (r() - 0.5) * 30, 22, m2);
        if (s !== null) lookEnd = s + 22;
      }
      const dinner = 1140 + E * 0.3;
      const guests = draw.presence === 'guests' ? 1 + (r() < 0.5 ? 1 : 0) : 0;
      const tvStart = Math.max(1185 + E * 0.3, dinner + 38);
      bed = late(Math.max(1293 + Z * 0.3, tvStart + 40));
      const table = [...ms];
      for (let i = 0; i < guests; i++) table.push(guest(dinner - 12 + i * 3, bed - 8 + i));
      meal(K, dinner, 36, table);
      // Volets à la tombée de la nuit du lieu (coucher + 20 min), après le dernier regard sur la rue de l'après-midi (on ne
      // ferme pas la fenêtre de celui qui est penché ou au balcon), ou avant d'aller se coucher quand la nuit tombe plus tard
      // (été, jour polaire).
      const nightfall = Math.min(Math.max(day.sunset + 20, lookEnd + 1), bed - 5);
      // Cuisine allumée à 18 h, ou plus tôt si les volets se ferment avant (hiver) : il est chez lui (le retraité ne sort pas),
      // pas question de rester dans le noir derrière des volets clos.
      lit(K, Math.min(1080 + E * 0.3, nightfall), Math.max(dinner + 45, bed));
      closeShutters(K, nightfall, 0);
      closeShutters(L, nightfall + 1.6, 0);
      drawCurt(L, nightfall + 3.4, 0); // les rideaux ouverts le matin se tirent le soir
      if (C) shut(C, nightfall + 3.5, 0);
      evening(tvStart, bed, table);
      if (C) lit(C, bed - 3, bed + 24);
      firstBack = 1080;
      break;
    }
    case 'etudiant': {
      shutUser = false;
      const wake = (off ? 630 : 507) + W * 0.5;
      lit(L, wake, wake + 30, 'cool');
      openCurt(L, wake + 2, 0);
      act(wake + 6, 6, L, 'lean', 'lean', 0);
      win(L, wake + 5.9, 1);
      win(L, wake + 12, 0.35);
      if (!off) leave(wake + 32, 0);
      else leave(792 + W + r() * 30, 0);
      const night = !workday && !sick; // sorti le soir, rentré après minuit
      const back = night ? 1563 + Bk : (hh.late ? 1224 : 1176) + Bk * 0.5;
      const tA = arrive(back, 0);
      firstBack = back;
      win(L, tA + 0.3, 0);
      act(tA + 0.2, 0.4, L, 'in', 'cross', 0);
      if (!night) {
        bed = late(Math.max(1527 + Z, tA + 90));
        lit(L, tA, bed, 'cool');
        const guests = draw.presence === 'guests' ? 1 + (r() < 0.5 ? 1 : 0) : 0;
        if (guests) {
          const table = [...ms];
          for (let i = 0; i < guests; i++) table.push(guest(tA + 20 + i * 3, tA + 150 + i));
          meal(L, tA + 35, 45, table);
        }
        if (r() < ROUTINE_SMOKE) smoke(1260 + Z * 0.2, 0);
        if (r() < ROUTINE_SMOKE) smoke(1410 + Z * 0.2, 0);
        drawCurt(L, 1434 + Z * 0.2, 0);
        fill(tA + 2, bed - 3, L, 'table', 0, { seat: 0, party: 1, desk: true });
      } else {
        bed = tA + 69;
        lit(L, tA, bed, 'cool');
        drawCurt(L, tA + 1, 0);
        fill(tA + 1, tA + 26, L, 'table', 0, { seat: 0, party: 1, desk: true });
      }
      break;
    }
    case 'coloc': {
      shutUser = false;
      const wakes = [438, 468, 510].slice(0, n);
      const outs: number[] = [];
      wakes.forEach((w, i) => {
        const t = (off ? w + 132 : w) + W * 0.3 + (r() - 0.5) * 16;
        lit(i === 0 ? K : L, t, t + 35);
        if (i === 0) openCurt(L, t + 0.5, 0);
        act(t + 2, 8, K, 'in', 'cook', i);
        if (i === 1 && opt.look) look(t + 11, 5, 1);
        outs[i] = off ? 810 + i * 24 + W + r() * 20 : t + 38;
        leave(outs[i], i);
      });
      const party0 = nyeParty || opt.party;
      const close = party0 ? 1578 : 1446;
      const backs = [1089, 1170, 1260].slice(0, n);
      let lastBack = 0;
      backs.forEach((b, i) => {
        const back = b + Bk * 0.4 + (off ? 30 : 0) + (r() - 0.5) * 20;
        const tA = arrive(Math.max(back, outs[i]! + 60), i);
        if (i === 0) firstBack = tA;
        lastBack = Math.max(lastBack, tA);
        act(tA + 0.2, 0.5, L, 'in', 'cross', i);
        lit(i === 0 ? K : L, tA, late(close + i * 18 + Z * 0.3));
      });
      const dinner = Math.max(1230 + E * 0.3, firstBack + 30);
      const guests = draw.presence === 'guests' ? 1 + (r() < 0.5 ? 1 : 0) : 0;
      bed = late(close + Z * 0.3);
      const table = [...ms];
      for (let i = 0; i < guests; i++) table.push(guest(dinner - 12 + i * 3, Math.min(bed - 8 + i, 1500)));
      meal(K, dinner, 38, table);
      const after = dinner + 40;
      if (party0) {
        drawCurt(L, 1270, 0); // rideaux tirés avant l'arrivée des invités
        party(1290, 1578, 3);
      } else {
        evening(Math.max(1278 + E * 0.3, after + 2), Math.max(bed - 6, after + 40), table);
        if (r() < ROUTINE_SMOKE) {
          if (d.balcony && !day.wet) {
            const s = act(after + 2, 5, L, 'balcony', 'smoke', 0);
            act(after + 2.3, 4.6, L, 'balcony', 'smoke', 1, { slot: 1 });
            if (s !== null) { win(L, s - 0.1, 1); win(L, s + 5, 0); }
          } else smoke(after + 2, 0);
        }
        drawCurt(L, Math.max(1410 + Z * 0.3, lastBack + 2), 1);
      }
      break;
    }
    default: { // solo
      const wake = (off ? 564 : 423) + W * 0.7;
      lit(K, wake, wake + 50);
      openShutters(L, wake + 4, 0);
      openCurt(L, wake + 7.5, 0);
      quickShut(K, wake + 8.5, 0, 1);
      act(wake + 10, 8, K, 'in', 'cook', 0);
      fill(wake + 19, wake + 31, K, 'table', 0, { seat: 0, party: 1 });
      let back = (off ? 1140 : 1167) + Bk * 0.8;
      if (off) {
        if (opt.look) look(wake + 35, 8, 0);
        const lunch = 780 + W * 0.4 + r() * 20, outing = lunch + 85 + r() * 30;
        meal(K, lunch, 30, ms);
        win(L, outing - 6, 0);
        leave(outing, 0);
        back = Math.max(back, outing + 90);
      } else {
        lit(L, wake + 1, wake + 48); // salon allumé au lever, éteint en partant
        win(L, wake + 46, 0);
        leave(wake + 48, 0);
      }
      const tA = arrive(back, 0);
      firstBack = back;
      const dinner = Math.max(1206 + E * 0.4, tA + 8);
      const guests = draw.presence === 'guests' ? 1 + (r() < 0.5 ? 1 : 0) : 0;
      const tvStart = Math.max(1239 + E * 0.4, dinner + 24);
      bed = late(Math.max(1403 + Z * 0.4, tvStart + 40));
      lit(K, tA, dinner + 37);
      act(tA + 0.15, 0.5, L, 'in', 'cross', 0);
      lit(L, tA + 0.3, bed + 2);
      drawCurt(L, tA + 1.0, 0);
      const table = [...ms];
      for (let i = 0; i < guests; i++) table.push(guest(dinner - 12 + i * 3, bed - 8 + i));
      meal(K, dinner, 22, table);
      evening(tvStart, bed - 2, table);
      if (opt.smoke) smoke(tvStart + 20 + r() * 15, 0);
      closeShutters(L, bed, 0);
      shut(K, bed + 4, 0);
    }
  }

  // Sortis sans revenir dans la journée : dehors jusqu'à la fin du jour.
  outAt.forEach((t, m) => { if (t !== undefined) gone.push([m, t, DAY_END]); });

  // ─── malade : déjeuner à la maison, la rue regardée l'après-midi ───
  if (sick) {
    if (hh.type === 'retraite' || hh.type === 'etudiant' || hh.type === 'coloc') meal(K, 750 + r() * 30, 30, ms);
    look(900 + r() * 60, 8 + r() * 8, 0);
  }
  // ─── événements de la rue ───
  // Déménagement d'un commerce (shops/moving.ts : camion de 8 h-8 h 30 à 9 h 30-10 h) : les curieux regardent pendant qu'on porte
  // les meubles, entre 8 h 25 et 9 h 15 (une scène décalée de 30 min au plus quand le membre est occupé finit avant 10 h).
  if (day.moving && (hh.type === 'retraite' || (hh.type === 'etudiant' && off) || r() < 0.25)) {
    const t = 505 + r() * 50, dur = 6 + r() * 8;
    for (const m of ms) if (look(t, dur, m, L, { event: true }) !== null) break;
  }
  const [y, mo, dd] = day.iso.split('-').map(Number) as [number, number, number];
  if (day.fests.includes('music') && festivityStartsOn({ y, m: mo, d: dd }, 'music') && (bed > 1290 || (hh.type !== 'famille' && hh.type !== 'retraite'))) {
    const tLook = 1266 + r() * 24;
    const tDance = 1296 + r() * 24;
    win(L, 1260, 1);
    look(tLook, 20, 0, L, { event: true });
    ms.forEach((m, i) => act(tDance, 30, L, 'in', 'dance', m, { slot: i, event: true }));
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
    const who = [item.m, ...ms.filter((i) => i !== item.m && !hh.members[i]!.kid)];
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
  if (day.december && hh.sapin) S.push({ k: 'sapin', t0: Math.max(1008, Math.min(firstBack, bed - 30)), t1: Math.max(bed, 1100) });

  // ─── poses longues dans les trous ───
  for (const f of fills) {
    const list = own(f.m).slice().sort((p, q) => p[0] - q[0]);
    let a = f.a;
    for (const [x, y2] of [...list, [Infinity, Infinity] as [number, number]]) {
      if (y2 <= a) continue;
      const b = Math.min(x, f.b);
      if (b - a >= MIN_POSE) push(a, b - a, f.room, 'in', f.choreo, f.m, f.x);
      a = Math.max(a, y2);
      if (a >= f.b) break;
    }
  }

  // Lumières : une seule par pièce à la fois (télé, puis fête, puis lumière du foyer ; à égalité, la plus récente).
  for (const room of new Set(lits.map((l) => l.room))) {
    const mine = lits.filter((l) => l.room === room);
    const cuts = [...new Set(mine.flatMap((l) => [l.t0, l.t1]))].sort((p, q) => p - q);
    let prev: Extract<Segment, { k: 'lit' }> | null = null;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const p = cuts[i]!, q = cuts[i + 1]!;
      const on = mine.filter((l) => l.t0 <= p && l.t1 >= q);
      if (!on.length) { prev = null; continue; }
      const top = on.reduce((u, v) => (v.pri > u.pri || (v.pri === u.pri && v.t0 >= u.t0) ? v : u));
      if (prev && prev.t1 === p && prev.tone === top.tone) prev.t1 = q;
      else S.push((prev = { k: 'lit', room, t0: p, t1: q, tone: top.tone }));
    }
  }
  // Extinctions du coucher : les pièces encore allumées au coucher (dernière lumière finissant entre bed − 15 et bed + 40)
  // s'éteignent dans l'ordre tiré du jour (`draw.offOrder`), à quelques minutes d'écart, à partir de la première extinction
  // prévue ; une pièce où une scène est en cours ne s'éteint qu'à la fin de la scène.
  const lastLit = new Map<Room, Extract<Segment, { k: 'lit' }>>();
  for (const g of S) if (g.k === 'lit' && g.t1 >= bed - OFF.before && g.t1 <= bed + OFF.after && g.t1 > (lastLit.get(g.room)?.t1 ?? -1)) lastLit.set(g.room, g);
  if (lastLit.size) {
    const rooms = draw.offOrder.filter((room) => lastLit.has(room));
    let t = Math.min(...[...lastLit.values()].map((g) => g.t1));
    for (const room of rooms) {
      const g = lastLit.get(room)!;
      const later = S.some((x) => x.k === 'lit' && x.room === room && x.t0 >= g.t1);
      let end = Math.max(t, g.t0 + OFF.minLit);
      for (const a of S) if (a.k === 'act' && a.room === room && a.t0 < Math.max(end, g.t1) && a.t1 > end) end = a.t1;
      if (!later) g.t1 = end;
      t = end + OFF.gap[0] + r() * (OFF.gap[1] - OFF.gap[0]);
    }
  }
  return { segments: S, shutUser, bed, kidBed, gone };
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

// Emploi du temps d'un logement pour un jour de scène. Absent : aucun segment (volets fermés tout le jour pour qui les ferme).
// Jour de feux : une première passe donne le coucher et les sorties, la seconde pose les penchés avant le reste (la famille
// et le retraité ne regardent que s'ils veillent encore au début du spectacle ; seuls les membres présents regardent).
// `decor` : décors d'Halloween à poser ou retirer ce jour-là (halloween.ts, `decorTasks`).
export function buildSchedule(d: Dwelling, day: SceneDay, draw: DayDraw, decor: readonly DecorTask[] = []): Schedule {
  const shutUserOf = SHUT_USERS.has(d.hh.type);
  if (draw.presence === 'away') return { dwelling: d.id, segments: [], shutUser: shutUserOf, maxActors: 0 };
  let res = compose(d, day, draw, null, decor);
  const show = day.show;
  if (show) {
    const awake = (d.hh.type !== 'famille' && d.hh.type !== 'retraite') || res.bed > show.start;
    const a = show.start - 2, b = show.end + 1;
    // Adultes d'abord (trois places au balcon) ; les enfants déjà couchés ne regardent pas.
    const kid = (m: number) => d.hh.members[m]!.kid;
    const who = d.hh.members.map((_, i) => i)
      .filter((m) => !res.gone.some(([g, from, to]) => g === m && from - d.climb < b && to + d.climb > a))
      .filter((m) => !kid(m) || res.kidBed > show.start)
      .sort((p, q) => Number(kid(p)) - Number(kid(q)) || p - q);
    if (awake && who.length) res = compose(d, day, draw, { who }, decor);
  }
  const segments = clamp(res.segments);
  return { dwelling: d.id, segments, shutUser: res.shutUser, maxActors: maxActors(segments) };
}
