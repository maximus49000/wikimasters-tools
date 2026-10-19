import type { Dwelling, Room } from './households';
import type { Choreo, LightTone, Schedule, Segment, Where } from './schedules';

// État d'un logement à la minute (port de `trackValue`, `homeState`, `ANIMATED`, `PRIO`, `cullAnimated` de
// docs/superpowers/maquettes/vie-etages/src/05-etat.js, en minutes ; spec 2026-10-19 « vie au-dessus de la rue » §5.1).
// Fonction pure de l'emploi du temps du jour, de celui de la veille et de la minute : la veille fournit la soirée qui déborde
// après minuit (un segment de la veille compte à `m + 1440`) et la position des volets, rideaux et fenêtres à 0 h
// (continuité). La chorégraphie (pose, déplacement, accessoires) est calculée en aval à partir de `choreo`, `p` et `t`.

// p : avancement dans la scène (0-1) ; t : minutes écoulées depuis son début ; culled : écartée par la borne (pose fixe à la
// place du mouvement ; la lumière et les volets du logement ne changent pas).
export type Actor = {
  dwelling: string; room: Room; where: Where; m: number; choreo: Choreo; p: number; t: number;
  seat: number; party: number; desk: boolean; slot: number; reverse: boolean;
  animated: boolean; prio: number; culled: boolean;
};
// shut / curt / win : 0 fermé → 1 ouvert (persiennes ou battants, rideaux tirés à 1, fenêtre ouverte à 1).
export type HomeState = {
  lit: Partial<Record<Room, boolean>>; tone: Partial<Record<Room, LightTone>>;
  shut: Partial<Record<Room, number>>; curt: Partial<Record<Room, number>>; win: Partial<Record<Room, number>>;
  actors: Actor[]; sapin: boolean; party: boolean; dim: boolean;
};

// Chorégraphies animées à la fois, sur toute la ville (les poses fixes ne sont pas bornées).
export const MAX_ANIM = 8;
const DAY = 1440;
// Rideaux tirés avant toute la piste : chaque foyer les tire le soir (même le foyer absent, parti un lundi après les avoir
// tirés le dimanche soir), contrairement à la maquette qui partait de rideaux ouverts.
const CURT_INIT = 1;
const ANIMATED: ReadonlySet<Choreo> = new Set(['openShutters', 'closeShutters', 'armsUp', 'drawCurtains', 'cross', 'water', 'shake', 'smoke', 'dance', 'cook']);
// Priorités de la borne : événement 5 > traversée, rideaux 4 > volets, arrosage, tapis, fumeur 3 > penché, balcon, danse 2 >
// cuisine 1 (et poses fixes).
const EVENT_PRIO = 5;
const PRIO: Partial<Record<Choreo, number>> = {
  cross: 4, drawCurtains: 4, openShutters: 3, closeShutters: 3, armsUp: 3, water: 3, shake: 3, smoke: 3, lean: 2, leanRail: 2, dance: 2, cook: 1,
};

const sat = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number): number => v * v * (3 - 2 * v);

// Piste de valeur : `init` avant le premier événement, puis glissement adouci vers `to` de chaque événement (triés par `t`).
// (La maquette repartait de la fin du même jour ; ici la continuité vient des événements de la veille, décalés de −1440.)
export function trackValue(evts: readonly { t: number; to: number; dur: number }[], m: number, init: number): number {
  let v = init;
  for (const e of evts) {
    if (m < e.t) break;
    v = v + (e.to - v) * smooth(sat((m - e.t) / e.dur));
  }
  return v;
}

type Track = Extract<Segment, { k: 'shut' | 'curt' | 'win' }>;
type Span = Exclude<Segment, Track | { k: 'return' | 'depart' }>;

export function homeState(d: Dwelling, today: Schedule, yesterday: Schedule | null, m: number): HomeState {
  const st: HomeState = { lit: {}, tone: {}, shut: {}, curt: {}, win: {}, actors: [], sapin: false, party: false, dim: false };
  // Segments du jour à `m`, puis ceux de la veille à `m + 1440` ; décalage −1440 pour les pistes de la veille.
  const days: [Schedule, number][] = yesterday ? [[yesterday, -DAY], [today, 0]] : [[today, 0]];
  // Volets fermés la nuit pour qui les ferme (valeur avant toute la piste, celle de la veille si elle est connue) ; sans
  // volets : toujours ouverts.
  const shutInit = d.shutters !== null && days[0]![0].shutUser ? 0 : 1;
  const tracks = (k: Track['k'], room: Room) => {
    const out: { t: number; to: number; dur: number }[] = [];
    for (const [s, off] of days) for (const g of s.segments) if (g.k === k && g.room === room) out.push({ t: g.t + off, to: g.to, dur: g.dur });
    return out.sort((a, b) => a.t - b.t);
  };
  for (const room of d.rooms) {
    st.shut[room] = d.shutters === null ? 1 : trackValue(tracks('shut', room), m, shutInit);
    st.curt[room] = trackValue(tracks('curt', room), m, CURT_INIT);
    st.win[room] = trackValue(tracks('win', room), m, 0);
    st.lit[room] = false;
  }
  for (const [s, off] of days) {
    const T = m - off; // minute dans le repère de cet emploi du temps
    for (const g of s.segments as readonly Segment[]) {
      if (!('t0' in g) || T < g.t0 || T >= g.t1) continue;
      const span = g as Span;
      if (span.k === 'lit') {
        st.lit[span.room] = true;
        st.tone[span.room] = span.tone;
      } else if (span.k === 'sapin') st.sapin = true;
      else if (span.k === 'party') st.party = true;
      else if (span.k === 'dim') st.dim = true;
      else if (span.k === 'act') {
        const animated = ANIMATED.has(span.choreo);
        st.actors.push({
          dwelling: d.id, room: span.room, where: span.where, m: span.m, choreo: span.choreo,
          p: (T - span.t0) / (span.t1 - span.t0), t: T - span.t0,
          seat: span.seat ?? 0, party: span.party ?? 1, desk: !!span.desk, slot: span.slot ?? 0, reverse: !!span.reverse,
          animated, prio: span.event ? EVENT_PRIO : (PRIO[span.choreo] ?? 1), culled: false,
        });
      }
    }
  }
  // Feux : on éteint le salon (et les chambres) pour mieux voir ; la cuisine reste allumée.
  if (st.dim) {
    for (const room of d.rooms) {
      if (room === 'cuisine') continue;
      st.lit[room] = false;
      delete st.tone[room];
    }
  }
  return st;
}

// Borne des chorégraphies animées : les MAX_ANIM premières par priorité, puis par proximité du centre de l'écran (`x` :
// abscisse du logement), restent animées ; les autres sont marquées `culled` (pose fixe), sans toucher à la lumière, aux
// volets, aux rideaux ni aux fenêtres. Chaque appel recalcule toutes les marques.
export function cullAnimated(items: readonly { st: HomeState; x: number }[], center: number): { animated: number; shown: number } {
  const all: { a: Actor; d: number }[] = [];
  for (const { st, x } of items) {
    for (const a of st.actors) {
      a.culled = false;
      if (a.animated) all.push({ a, d: Math.abs(x - center) });
    }
  }
  all.sort((p, q) => q.a.prio - p.a.prio || p.d - q.d);
  all.forEach((e, i) => { if (i >= MAX_ANIM) e.a.culled = true; });
  return { animated: all.length, shown: Math.min(all.length, MAX_ANIM) };
}

// Part des fenêtres de logement allumées (allumage logique, sans condition de nuit) : une pièce allumée compte autant de
// fenêtres qu'elle a de travées.
export function litShare(items: readonly { d: Dwelling; today: Schedule; yesterday: Schedule | null }[], m: number): number {
  let lit = 0, total = 0;
  for (const { d, today, yesterday } of items) {
    const st = homeState(d, today, yesterday, m);
    for (const room of d.roomOfWindow.values()) {
      total++;
      if (st.lit[room]) lit++;
    }
  }
  return total ? lit / total : 0;
}
