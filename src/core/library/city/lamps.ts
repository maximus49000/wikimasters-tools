import { mulberry32 } from '../scene-world';

export type Lamp = { id: string; x: number; offJitter: number };
const SPACING = 170;
const MORNING_ON = 360; // 6 h

// Un lampadaire tous les ~170 px ; chacun s'éteint entre 23 h 45 et 0 h 15 (`offJitter` en minutes, de −15 à +15).
export function lampsFor(width: number, seed: number): Lamp[] {
  const rng = mulberry32(seed ^ 0x1a3b5);
  const out: Lamp[] = [];
  for (let i = 0, x = 60 + rng() * 40; x < width; i++, x += SPACING + (rng() - 0.5) * 50) {
    out.push({ id: `lamp-${i}`, x: Math.round(x), offJitter: Math.round(rng() * 30 - 15) });
  }
  return out;
}

// Allumé quand il fait sombre, jusqu'à son heure d'extinction vers minuit ; éteint ensuite, puis rallumé vers 6 h (même
// décalage, de 5 h 45 à 6 h 15) jusqu'au lever du jour.
// `forcedNight` : mode d'heure « Toujours la nuit » (minute 0) — les lampadaires restent allumés pour que la nuit reste lisible.
export function lampLit(lamp: Lamp, minutes: number, daylight: number, forcedNight = false): boolean {
  if (daylight >= 0.45) return false;
  if (forcedNight) return true;
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m >= 720) return m < 1440 + lamp.offJitter;
  if (m >= MORNING_ON + lamp.offJitter) return true;
  return lamp.offJitter > 0 && m < lamp.offJitter;
}
