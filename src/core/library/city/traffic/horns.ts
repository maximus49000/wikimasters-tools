import type { Agent, TrafficWorld } from './engine';

// Klaxons (G4b, spec §3.5) : un conducteur impatient (patience < IMPATIENT s) arrêté juste derrière un véhicule arrêté depuis
// plus de HORN_WAIT s klaxonne une fois, puis pas avant HORN_GAP s. Le monde garde les coups de klaxon des HORN_WINDOW
// dernières secondes ({ t, x } : temps du moteur, x du monde ; `by` : id du conducteur). Sortie seulement : lu après le pas,
// rien ici ne change la conduite (aucun tirage, aucune écriture sur les véhicules). Le rendu (tâche 10) fait tourner la
// tête des acteurs proches.
export type Horn = { t: number; x: number; by: string };
export type HornClock = { stuck: number; last: number };

const IMPATIENT = 3.5; // s (patience tirée de 2 à 7 s, temperament.ts)
const HORN_WAIT = 4;
const HORN_GAP = 12;
const HORN_WINDOW = 10;
const STOPPED = 1; // px/s (× unit) : en dessous, le véhicule est arrêté
const CLOSE = 40; // px (× unit) : juste derrière

export function stepHorns(w: TrafficWorld, t: number, dt: number, xOf: (a: Agent) => number): void {
  const u = w.unit;
  for (const track of ['near', 'far'] as const) {
    const list = w.agents.filter((a) => a.track === track).sort((p, q) => q.s - p.s);
    // En tête de file (personne devant) : il n'attend derrière personne, son attente repart de zéro.
    const head = list[0] ? w.hornClock.get(list[0].id) : undefined;
    if (head) head.stuck = 0;
    for (let i = 1; i < list.length; i++) {
      const me = list[i]!;
      if (me.h.patience >= IMPATIENT || me.kind === 'ambulance') continue;
      const lead = list[i - 1]!;
      const clock = w.hornClock.get(me.id) ?? { stuck: 0, last: -Infinity };
      // Un véhicule de devant qui dépasse roule : il n'est pas arrêté.
      const leadStopped = lead.v < STOPPED * u && lead.passing === null && !lead.pulled;
      const stuck = me.passing === null && !me.pulled && leadStopped && me.v < STOPPED * u && lead.s - lead.half - (me.s + me.half) < CLOSE * u;
      clock.stuck = stuck ? clock.stuck + dt : 0;
      if (clock.stuck > HORN_WAIT && t - clock.last >= HORN_GAP - 1e-9) {
        clock.last = t;
        w.horns.push({ t, x: xOf(me), by: me.id });
      }
      w.hornClock.set(me.id, clock);
    }
  }
  // Conducteurs sortis : on oublie leur horloge (à chaque pas).
  if (w.hornClock.size > 0) {
    const alive = new Set(w.agents.map((a) => a.id));
    for (const id of w.hornClock.keys()) if (!alive.has(id)) w.hornClock.delete(id);
  }
  while (w.horns.length > 0 && w.horns[0]!.t <= t - HORN_WINDOW) w.horns.shift();
}
