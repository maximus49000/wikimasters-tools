// Horaires des bus de la scène (revue du 2026-10-13 : « personne n'attend le bus toute la nuit »). Les bus ne sont plus tirés
// au hasard dans la circulation : ils passent à l'arrêt selon une grille fixe, propre à chaque sens, comme un vrai réseau :
// - service de 6 h 50 (8 h le dimanche et les jours fériés) au dernier passage de 0 h 30 ;
// - peu de bus au petit matin, montée en charge jusqu'aux heures de pointe (7 h 30 - 9 h 30, 16 h 30 - 19 h en semaine),
//   fréquence de journée entre les deux, puis on espace le soir (15 min) et la nuit (30 min) ;
// - le samedi n'a pas de pointe du matin ; le dimanche roule à 20 min toute la journée.
// Les passages d'après minuit (jusqu'à 0 h 30) prolongent le service de la veille. Les voyageurs (bus-stop.ts) ne viennent
// attendre que si un bus passe bientôt, et repartent à pied après le dernier.
// Revue du 2026-10-13 (« le panneau annonce le 15 à un arrêt du 3, du 6 et du 9 ») : chaque ligne de la plaque de l'arrêt a
// sa propre grille, à sa fréquence (LINE_FACTOR), et seules ces lignes passent : le 15 et le 16 peuvent arriver à une
// minute d'écart, le panneau les annonce sur des rangées distinctes.
import { hashString, mulberry32 } from '../../scene-world';
import type { ScheduledArrival } from './engine';
import type { StopSide } from './bus-stop';

export type ServiceKind = 'week' | 'saturday' | 'sunday';
// Premier passage (minutes depuis minuit) et fin de service (minutes, au-delà de minuit : 1470 = 0 h 30 le lendemain).
export const FIRST_BUS: Readonly<Record<ServiceKind, number>> = { week: 410, saturday: 410, sunday: 480 };
export const LAST_BUS = 1470;

// Intervalle entre deux bus (minutes) à la minute `m` (410 → 1470) d'un jour de service.
export function headwayAt(m: number, kind: ServiceKind): number {
  if (kind === 'sunday') return m < 1260 ? 20 : 30;
  if (m < 450) return 20; // petit matin
  if (m < 570) return kind === 'week' ? 8 : 15; // pointe du matin (pas le samedi)
  if (m < 990) return 12; // journée
  if (m < 1140) return kind === 'week' ? 8 : 12; // pointe du soir
  if (m < 1260) return 15; // soirée
  return 30; // fin de service
}

// Lignes desservant l'arrêt (celles de sa plaque, au plus 3) et fréquence de chacune : intervalle de la grille du réseau
// multiplié par ce facteur (la première ligne est la plus fréquente), plafonné à une heure.
export const STOP_LINES_MAX = 3;
export const LINE_FACTOR = [1.6, 2.1, 2.7] as const;
const HEADWAY_MAX = 60;
export const lineHeadwayAt = (m: number, kind: ServiceKind, line: number): number =>
  Math.min(HEADWAY_MAX, Math.round(headwayAt(m, kind) * (LINE_FACTOR[line] ?? LINE_FACTOR[LINE_FACTOR.length - 1]!)));

// Passages d'une ligne (rang `line` sur la plaque) un jour de service à l'arrêt d'un sens, en minutes depuis le minuit de ce
// jour (jusqu'à LAST_BUS).
export function serviceDepartures(seed: number, day: number, side: StopSide, kind: ServiceKind, line = 0): number[] {
  // Décalage propre au sens, à la ligne et au jour (les lignes et les sens ne passent pas ensemble), au plus 6 min.
  const r = mulberry32(seed ^ hashString(`bus-timetable-${side}${line > 0 ? `-${line}` : ''}`) ^ Math.imul(day, 2654435761));
  const out: number[] = [];
  let m = FIRST_BUS[kind] + Math.floor(r() * 6);
  while (m <= LAST_BUS) {
    out.push(m);
    m += lineHeadwayAt(m, kind, line);
  }
  // Dernier passage de 0 h 30 : assuré par la première ligne (les autres finissent sur leur grille).
  if (line === 0 && out[out.length - 1] !== LAST_BUS && out[out.length - 1]! < LAST_BUS - 10) out.push(LAST_BUS);
  return out;
}

export const serviceKindOf = (weekday: number, holiday: boolean): ServiceKind => (holiday || weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'week');

// Voie du bus pour l'arrêt d'un sens (le bus du premier plan sert l'arrêt d'en face, celui du fond le trottoir des immeubles).
const TRACK: Readonly<Record<StopSide, 'near' | 'far'>> = { near: 'near', far: 'far' };
// Le bus entre par le bord un peu avant son heure à l'arrêt (le temps de rouler jusqu'au poteau).
export const LEAD_S = 12;

// Bus attendus autour de la minute de la scène (de 5 minutes avant à `ahead` minutes après), en arrivées planifiées du
// moteur. `today` / `yesterday` : genre de service du jour et de la veille (les passages d'après minuit sont ceux de la veille).
// `lines` : nombre de lignes de la plaque (1 à STOP_LINES_MAX) ; chaque arrivée porte le rang de sa ligne (`line`).
export function busArrivals(o: { seed: number; day: number; nowS: number; minutes: number; today: ServiceKind; yesterday: ServiceKind; ahead?: number; lines?: number }): ScheduledArrival[] {
  const ahead = o.ahead ?? 45;
  const lines = Math.max(1, Math.min(STOP_LINES_MAX, o.lines ?? STOP_LINES_MAX));
  const out: ScheduledArrival[] = [];
  for (const side of ['near', 'far'] as const) {
    for (let line = 0; line < lines; line++) {
      for (const [d, kind, shift] of [[o.day - 1, o.yesterday, -1440], [o.day, o.today, 0]] as const) {
        serviceDepartures(o.seed, d, side, kind, line).forEach((dep, i) => {
          const m = dep + shift; // minutes depuis le minuit de la scène
          if (m < o.minutes - 5 || m > o.minutes + ahead) return;
          out.push({ key: `bus-${d}-${side}-${line}-${i}`, kind: 'bus', track: TRACK[side], start: o.nowS + (m - o.minutes) * 60 - LEAD_S, line });
        });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
