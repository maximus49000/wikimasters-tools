// Cars scolaires (spec véhicules §4) : 2 à 4 passages par créneau d'école (aller le matin, sortie l'après-midi ou à midi le
// mercredi), à des minutes tirées dans le créneau (graine de la pièce + jour), voie tirée. Ce sont des arrivées planifiées
// du moteur : elles entrent par le bord à leur heure.
import { hashString, mulberry32 } from '../../scene-world';
import type { ScheduledArrival } from './engine';

export function schoolBusArrivals(o: { seed: number; day: number; nowS: number; minutes: number; windows: readonly (readonly [number, number])[] }): ScheduledArrival[] {
  const out: ScheduledArrival[] = [];
  o.windows.forEach(([a, b], w) => {
    const r = mulberry32(o.seed ^ hashString(`school-bus-${o.day}-${w}`));
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const minute = a + r() * (b - a);
      out.push({ key: `school-${o.day}-${w}-${i}`, kind: 'school-bus', track: r() < 0.5 ? 'near' : 'far', start: o.nowS + (minute - o.minutes) * 60 });
    }
  });
  return out;
}
