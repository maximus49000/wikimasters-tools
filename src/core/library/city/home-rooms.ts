import type { Dwelling, HouseholdType, Room } from './households';
import type { HouseholdDays, PersonDay } from './person-day';

// Pièces occupées par chaque habitant et repas du foyer (règles : notes « lever des habitants », § `buildSchedule`).
// Chaque minute d'un membre éveillé au logement tombe dans exactement une pièce ; jamais de pièce pendant un intervalle
// `out`. Priorité des activités : coucher, lever, petit-déjeuner, dîner, déjeuner, goûter, devoirs, soirée ; le reste du
// temps passé au logement est « home » au salon.
//
// Choix (à confirmer) :
// - Un repas n'est pris que par qui est au logement depuis au moins 10 min à l'heure du repas (pas de repas à l'arrivée).
// - Dîner : seuls comptent les adultes revenus au plus tard 60 min après l'heure de base et sans sortie du soir commencée
//   avant base + 30 ; le dîner est au moins 10 min après le retour du dernier d'entre eux.
// - Jour qui finit après minuit (sortie du soir ou coucher tardif) : les RoomSpan vont jusqu'au coucher, sauf si la sortie
//   rentre après minuit ; le retour est alors représenté le lendemain (chambre 10 min, 'night').
// - La nounou a l'indice NANNY_M ; les invités gardent les indices fournis (au-delà des membres).

export type RoomSpan = { m: number; room: Room; a: number; b: number; what: 'wake' | 'breakfast' | 'home' | 'lunch' | 'snack' | 'homework' | 'dinner' | 'evening' | 'bedtime' | 'night' };
// breakfast : début du petit-déjeuner de chaque membre (−1 : pas de petit-déjeuner au logement).
export type HouseholdMeals = { breakfast: number[]; lunch: number | null; snack: number | null; dinner: number | null; kidsDinner: number | null };

export const NANNY_M = 99;

const MEAL = {
  dinner: { famille: 1167, retraite: 1140, couple: 1227, solo: 1206, coloc: 1230, etudiant: 1230 } satisfies Record<HouseholdType, number>,
  dinnerJitter: 20, lunch: 750, lunchJitter: 15, kidsDinnerMax: 1170, kidAge: 11,
  wake: 8, breakfast: 20, lunchLen: 30, snackFrom: 960, snackLen: 20, homework: 45, dinnerLen: 40, kidsDinnerLen: 30,
  night: 10, bedtime: 15, settle: 10, dineWindow: 60, dineOuting: 30, lateBack: 1380, eveningFrom: 1200,
} as const;
const HORIZON = 2000;

const WHAT = ['absent', 'wake', 'breakfast', 'home', 'lunch', 'snack', 'homework', 'dinner', 'evening', 'bedtime', 'night'] as const;
const ROOM_OF: Record<RoomSpan['what'], Room> = {
  wake: 'chambre', breakfast: 'cuisine', home: 'salon', lunch: 'cuisine', snack: 'cuisine', homework: 'chambre',
  dinner: 'cuisine', evening: 'salon', bedtime: 'chambre', night: 'chambre',
};
const code = (w: RoomSpan['what']): number => WHAT.indexOf(w);
const HOME = code('home');


type Cells = Uint8Array;
const int5 = (r: () => number, lo: number, hi: number): number => Math.round((lo + r() * (hi - lo)) / 5) * 5;
const isKid = (d: Dwelling, m: number): boolean => d.hh.members[m]!.who.status === 'enfant';
const isYoung = (d: Dwelling, m: number): boolean => isKid(d, m) && d.hh.members[m]!.who.age < MEAL.kidAge;

// Minutes où le membre est éveillé et au logement.
function presence(hd: HouseholdDays, p: PersonDay): Cells {
  const c = new Uint8Array(HORIZON);
  if (hd.away.state === 'away') return c;
  const end = p.outing && p.outing.ret > 1440 ? 1440 : Math.round(p.bed);
  for (let t = Math.max(0, Math.round(p.wake)); t < Math.min(HORIZON, end); t++) c[t] = 1;
  for (const [a, b] of p.out) for (let t = Math.max(0, Math.round(a)); t < Math.min(HORIZON, Math.round(b)); t++) c[t] = 0;
  return c;
}
const freeFor = (c: Cells, a: number, b: number): boolean => { for (let t = a; t < b; t++) if (!c[t]) return false; return true; };

export function householdMeals(d: Dwelling, hd: HouseholdDays, rng: () => number): HouseholdMeals {
  const hh = d.hh;
  const cells = hd.people.map((p) => presence(hd, p));
  const breakfast = hd.people.map((p, m) => (cells[m]![Math.round(p.wake)] ? Math.round(p.wake) + MEAL.wake : -1));

  const base = MEAL.dinner[hh.type] + int5(rng, -MEAL.dinnerJitter, MEAL.dinnerJitter);
  const lunchAt = MEAL.lunch + int5(rng, -MEAL.lunchJitter, MEAL.lunchJitter);
  const lunch = hd.people.some((_, m) => cells[m]![lunchAt]) ? lunchAt : null;

  // Dîner : après le retour du dernier adulte qui dîne.
  let back = 0;
  hd.people.forEach((p, m) => {
    if (isKid(d, m)) return;
    const dep = p.outing?.dep ?? Infinity;
    if (dep < base + MEAL.dineOuting) return;
    const b = Math.max(0, ...p.out.filter(([a, e]) => a < dep && e <= MEAL.lateBack).map(([, e]) => Math.round(e)));
    if (b <= base + MEAL.dineWindow) back = Math.max(back, b);
  });
  const T = Math.max(base, back + MEAL.settle);
  const dinner = hd.people.some((_, m) => cells[m]![T]) ? T : null;

  // Goûter : dès que des enfants sont au logement après 16 h.
  let snack: number | null = null;
  for (let t = MEAL.snackFrom; t < 1200 && snack === null; t++) if (hd.people.some((_, m) => isKid(d, m) && cells[m]![t])) snack = t;

  let kidsDinner: number | null = null;
  if (dinner !== null && hd.people.some((_, m) => isYoung(d, m))) {
    const kidBack = Math.max(0, ...hd.people.flatMap((p, m) => (isYoung(d, m) ? p.out.filter(([, e]) => e <= MEAL.kidsDinnerMax).map(([, e]) => Math.round(e)) : [])));
    kidsDinner = Math.min(MEAL.kidsDinnerMax, Math.max(Math.min(dinner, MEAL.kidsDinnerMax), kidBack + MEAL.settle));
  }
  return { breakfast, lunch, snack, dinner, kidsDinner };
}

export function roomTimeline(d: Dwelling, hd: HouseholdDays, meals: HouseholdMeals, guests: readonly { m: number; a: number; b: number }[]): RoomSpan[] {
  const n = d.hh.members.length;
  const pick = (r: Room): Room => (d.rooms.includes(r) ? r : 'salon');

  // Une grille de minutes par personne : 0 = absent, sinon code de l'activité (« home » avant peinture).
  const grids = new Map<number, Uint8Array>();
  const free = new Map<number, Cells>();
  const add = (m: number, cells: Cells): void => { free.set(m, cells); grids.set(m, Uint8Array.from(cells, (v) => (v ? HOME : 0))); };
  // Peint sur les minutes encore « home » (priorité décroissante par ordre d'appel).
  const paint = (m: number, a: number, b: number, w: RoomSpan['what']): void => {
    const g = grids.get(m)!;
    for (let t = Math.max(0, Math.floor(a)); t < Math.min(HORIZON, b); t++) if (g[t] === HOME) g[t] = code(w);
  };
  // Un repas n'est pris que par qui est au logement depuis au moins 10 min à l'heure du repas.
  const eats = (m: number, t: number): boolean => freeFor(free.get(m)!, Math.max(0, t - MEAL.settle), t + 1);

  hd.people.forEach((p, m) => add(m, presence(hd, p)));
  if (hd.nanny) {
    const c = new Uint8Array(HORIZON);
    for (const v of hd.nanny.visits) for (let t = Math.max(0, Math.round(v.arrive)); t < Math.min(HORIZON, Math.round(v.leave)); t++) c[t] = 1;
    add(NANNY_M, c);
  }
  const guestCells = new Map<number, Cells>();
  for (const g of guests) {
    const c = guestCells.get(g.m) ?? new Uint8Array(HORIZON);
    for (let t = Math.max(0, Math.round(g.a)); t < Math.min(HORIZON, Math.round(g.b)); t++) c[t] = 1;
    guestCells.set(g.m, c);
  }
  for (const [m, c] of guestCells) add(m, c);
  const memberIds = hd.people.map((p) => p.m);
  const guestIds = [...guestCells.keys()];
  const dinnerEnd = meals.dinner === null ? MEAL.eveningFrom : meals.dinner + MEAL.dinnerLen;

  // 1. Coucher.
  hd.people.forEach((p, m) => paint(m, Math.round(p.bed) - MEAL.bedtime, Math.round(p.bed), 'bedtime'));
  // 2. Lever et petit-déjeuner (seulement si le lever est au logement).
  hd.people.forEach((p, m) => {
    const b = meals.breakfast[m] ?? -1;
    if (b < 0) return;
    paint(m, b - MEAL.wake, b, 'wake');
    paint(m, b, b + MEAL.breakfast, 'breakfast');
  });
  // 3. Dîner : adultes et grands à l'heure du dîner, petits à l'heure des enfants (sinon avec les grands).
  if (meals.dinner !== null) {
    const T = meals.dinner;
    for (const m of [...memberIds, ...guestIds]) {
      const young = m < n && isYoung(d, m);
      // Le dîner des petits finit avant leur coucher (qui commence 15 min avant `bed`).
      const kd = young && meals.kidsDinner !== null ? Math.min(meals.kidsDinner, Math.round(hd.people[m]!.bed) - MEAL.bedtime - MEAL.kidsDinnerLen) : -1;
      if (kd >= 0 && eats(m, kd)) {
        paint(m, kd, kd + MEAL.kidsDinnerLen, 'dinner');
        if (hd.nanny) paint(NANNY_M, kd, kd + MEAL.kidsDinnerLen, 'dinner'); // la nounou mange avec eux
        continue;
      }
      if (eats(m, T)) paint(m, T, T + MEAL.dinnerLen, 'dinner');
    }
  }
  // 4. Déjeuner.
  if (meals.lunch !== null) for (const m of memberIds) if (eats(m, meals.lunch)) paint(m, meals.lunch, meals.lunch + MEAL.lunchLen, 'lunch');
  // 5. Goûter des enfants (avec la nounou), puis devoirs en chambre pour les écoliers.
  // Chaque enfant goûte dès son arrivée (à partir de 16 h), la nounou avec lui ; puis devoirs (la nounou reste avec eux).
  if (meals.snack !== null) {
    hd.people.forEach((p, m) => {
      if (!isKid(d, m)) return;
      let s = -1;
      for (let t = MEAL.snackFrom; t < 1200 && s < 0; t++) if (free.get(m)![t]) s = t;
      if (s < 0) return;
      paint(m, s, s + MEAL.snackLen, 'snack');
      if (hd.nanny) paint(NANNY_M, s, s + MEAL.snackLen, 'snack');
      if (p.school) {
        paint(m, s + MEAL.snackLen, s + MEAL.snackLen + MEAL.homework, 'homework');
        if (hd.nanny) paint(NANNY_M, s + MEAL.snackLen, s + MEAL.snackLen + MEAL.homework, 'homework');
      }
    });
  }
  // 6. Soirée au salon, du dîner jusqu'au coucher.
  for (const m of [...memberIds, ...guestIds]) paint(m, dinnerEnd, HORIZON, 'evening');

  // Retour de nuit (sortie de la veille) : 10 min en chambre, sur les minutes sans autre activité.
  const nights = new Map<number, Uint8Array>();
  hd.people.forEach((p, m) => {
    if (hd.away.state !== 'home') return;
    const b = p.blocks.find((x) => x.k === 'outing' && x.a === 0 && x.b > 0);
    if (!b) return;
    const g = grids.get(m)!;
    const night = new Uint8Array(HORIZON);
    const outCell = new Uint8Array(HORIZON);
    for (const [x, y] of p.out) for (let t = Math.max(0, Math.round(x)); t < Math.min(HORIZON, Math.round(y)); t++) outCell[t] = 1;
    const end = Math.round(b.b);
    for (let t = end; t < end + MEAL.night; t++) if (!g[t] && !outCell[t] && t < Math.round(p.wake)) night[t] = code('night');
    nights.set(m, night);
  });

  const spans: RoomSpan[] = [];
  for (const [m, g] of grids) {
    const night = nights.get(m);
    let start = 0, cur = 0;
    for (let t = 0; t <= HORIZON; t++) {
      const c = t < HORIZON ? (g[t] || night?.[t] || 0) : 0;
      if (c === cur) continue;
      if (cur) { const what = WHAT[cur] as RoomSpan['what']; spans.push({ m, room: pick(ROOM_OF[what]), a: start, b: t, what }); }
      cur = c; start = t;
    }
  }
  return spans.sort((p, q) => p.m - q.m || p.a - q.a);
}
