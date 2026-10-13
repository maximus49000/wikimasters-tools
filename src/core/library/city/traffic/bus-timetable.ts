// Horaires des bus de la scène (revue du 2026-10-13 : « personne n'attend le bus toute la nuit »). Les bus ne sont plus tirés
// au hasard dans la circulation : ils passent à l'arrêt selon une grille fixe, propre à chaque sens, comme un vrai réseau :
// - service de 6 h 50 (8 h le dimanche et les jours fériés) au dernier passage de 0 h 30 ;
// - peu de bus au petit matin, montée en charge jusqu'aux heures de pointe (7 h 30 - 9 h 30, 16 h 30 - 19 h en semaine),
//   fréquence de journée entre les deux, puis on espace le soir (15 min) et la nuit (30 min) ;
// - le samedi n'a pas de pointe du matin ; le dimanche roule à 20 min toute la journée.
// Les passages d'après minuit (jusqu'à 0 h 30) prolongent le service de la veille. Les voyageurs (bus-stop.ts) ne viennent
// attendre que si un bus passe bientôt, et repartent à pied après le dernier.
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

// Passages d'un jour de service à l'arrêt d'un sens, en minutes depuis le minuit de ce jour (jusqu'à LAST_BUS).
export function serviceDepartures(seed: number, day: number, side: StopSide, kind: ServiceKind): number[] {
  // Décalage propre au sens et au jour (les deux sens ne passent pas en même temps), au plus le premier intervalle.
  const r = mulberry32(seed ^ hashString(`bus-timetable-${side}`) ^ Math.imul(day, 2654435761));
  const out: number[] = [];
  let m = FIRST_BUS[kind] + Math.floor(r() * 6);
  while (m <= LAST_BUS) {
    out.push(m);
    m += headwayAt(m, kind);
  }
  if (out[out.length - 1] !== LAST_BUS && out[out.length - 1]! < LAST_BUS - 10) out.push(LAST_BUS);
  return out;
}

export const serviceKindOf = (weekday: number, holiday: boolean): ServiceKind => (holiday || weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'week');

// Voie du bus pour l'arrêt d'un sens (le bus du premier plan sert l'arrêt d'en face, celui du fond le trottoir des immeubles).
const TRACK: Readonly<Record<StopSide, 'near' | 'far'>> = { near: 'near', far: 'far' };
// Le bus entre par le bord un peu avant son heure à l'arrêt (le temps de rouler jusqu'au poteau).
export const LEAD_S = 12;

// Bus attendus autour de la minute de la scène (de 5 minutes avant à `ahead` minutes après), en arrivées planifiées du
// moteur. `today` / `yesterday` : genre de service du jour et de la veille (les passages d'après minuit sont ceux de la veille).
export function busArrivals(o: { seed: number; day: number; nowS: number; minutes: number; today: ServiceKind; yesterday: ServiceKind; ahead?: number }): ScheduledArrival[] {
  const ahead = o.ahead ?? 45;
  const out: ScheduledArrival[] = [];
  for (const side of ['near', 'far'] as const) {
    for (const [d, kind, shift] of [[o.day - 1, o.yesterday, -1440], [o.day, o.today, 0]] as const) {
      serviceDepartures(o.seed, d, side, kind).forEach((dep, i) => {
        const m = dep + shift; // minutes depuis le minuit de la scène
        if (m < o.minutes - 5 || m > o.minutes + ahead) return;
        // Les lignes de la pièce se succèdent à l'arrêt (rang tiré par le sens, puis une ligne après l'autre).
        out.push({ key: `bus-${d}-${side}-${i}`, kind: 'bus', track: TRACK[side], start: o.nowS + (m - o.minutes) * 60 - LEAD_S, line: i + (side === 'far' ? 1 : 0) });
      });
    }
  }
  return out;
}
