// src/core/library/city/event-place.ts
import { eventX, type CityEvent, type CityEventId } from './events';
import type { Facade } from './facades';
import { FAR_SHRINK, STREET_SCALE, type CityMetrics } from './metrics';

// Une voiture qui se range devant l'ambulance se décale de PULL_DY px vers le bord de la chaussée ;
// l'ambulance roule à AMB_DY px de sa file, du côté du marquage central. Les vélos roulent BIKE_TRACK_DY px sous la file.
export const PULL_DY = 7;
export const AMB_DY = 5;
export const BIKE_TRACK_DY = 2;
// Échelle des dessins du ciel (maquette validée).
export const SKY_SCALE: Partial<Record<CityEventId, number>> = { plane: 0.8, helicopter: 0.9, drone: 1, balloon: 1, 'banner-plane': 0.9, 'fest-balloons': 1 };

export type EventFrame = { width: number; height: number; metrics: CityMetrics; facades: Facade[] };
export type EventPlacement = { x: number; y: number; sx: number; sy: number };

const smooth = (x: number): number => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

// `ahead` > 0 : la voiture est devant l'ambulance. Elle commence à se ranger à 150 px, l'est tout à fait à 60 px,
// le reste pendant que l'ambulance passe (jusqu'à 20 px après), puis reprend sa place en 40 px. Au départ de l'ambulance,
// le rangement suit aussi la distance qu'elle a parcourue (90 px) : les voitures déjà proches du point d'entrée ne sautent
// pas de côté dès la première image.
export function pullOver(amb: CityEvent, xv: number, width: number, t: number): number {
  const ahead = (xv - eventX(amb, width, t)) * amb.dir;
  return smooth((150 - ahead) / 90) * (1 - smooth((-20 - ahead) / 40)) * smooth(((t - amb.start) * amb.speed) / 90);
}

// Fondu (s) d'apparition et de disparition des événements fixes (grue, cerf-volant, appartement).
export const FIXED_FADE_S = 2;

// Opacité d'un événement fixe à l'instant t : monte en FIXED_FADE_S au début, descend autant à la fin. Le feu d'artifice
// (qui a ses propres fusées) et les traversées (qui entrent et sortent hors champ) restent à 1.
export function fixedFade(e: CityEvent, t: number): number {
  if (e.layer !== 'fixed' || e.id === 'fireworks') return 1;
  return Math.min(1, Math.max(0, Math.min(t - e.start, e.end - t) / FIXED_FADE_S));
}

export const nearFacades = (f: EventFrame): Facade[] => f.facades.filter((b) => !b.far && b.x + b.w > 0 && b.x < f.width);

// Taille de la fenêtre pour laquelle le dessin de l'appartement est fait (ancienne grille 5 × 7).
const APT_W = 5;
const APT_H = 7;

// Fenêtre qui s'allume : un immeuble du premier plan (tirage `pick`), puis une de ses fenêtres de logement (tirage
// `variant` ; ni cage ni entresol), avec sa taille. Sans fenêtre : repli à la taille du dessin.
export function apartmentLamp(e: CityEvent, f: EventFrame): { x: number; y: number; w: number; h: number } {
  const near = nearFacades(f);
  const homeLamps = (b: Facade | undefined): Facade['lamps'] => (b ? b.lamps.filter((l) => l.home >= 0) : []);
  let lamps = homeLamps(near[Math.min(near.length - 1, Math.floor(e.pick * near.length))]);
  if (lamps.length === 0) {
    // Immeuble tiré sans fenêtre de logement (lot coupé au bord) : même tirage parmi ceux qui en ont.
    const lit = near.filter((b) => homeLamps(b).length > 0);
    lamps = homeLamps(lit[Math.min(lit.length - 1, Math.floor(e.pick * lit.length))]);
  }
  if (lamps.length === 0) return { x: e.x0, y: f.metrics.ground - 60 * f.metrics.unit, w: APT_W, h: APT_H };
  const lamp = lamps[Math.min(lamps.length - 1, Math.floor(e.variant * lamps.length))]!;
  return { x: lamp.x, y: lamp.y, w: lamp.w, h: lamp.h };
}

export function placeEvent(e: CityEvent, t: number, f: EventFrame): EventPlacement {
  const m = f.metrics;
  const x = eventX(e, f.width, t);
  switch (e.layer) {
    case 'sky': {
      const k = m.unit * (SKY_SCALE[e.id] ?? 1);
      return { x, y: e.y * f.height, sx: e.dir * k, sy: k };
    }
    case 'street': {
      const lane = e.track === 'far' ? 'far' : 'near';
      const k = m.unit * STREET_SCALE.vehicle * (lane === 'far' ? FAR_SHRINK : 1);
      let y = m.laneY[lane];
      if (e.track === 'bike') y += BIKE_TRACK_DY * m.unit;
      if (e.id === 'ambulance') y += (lane === 'near' ? -AMB_DY : AMB_DY) * m.unit;
      return { x, y, sx: e.dir * k, sy: k };
    }
    case 'sidewalk': {
      const k = m.unit * STREET_SCALE.person;
      return { x, y: m.walkY, sx: e.dir * k, sy: k };
    }
    case 'fixed':
      if (e.id === 'apartment') {
        // Le dessin (fait pour 5 × 7) est mis à l'échelle de la fenêtre.
        const lamp = apartmentLamp(e, f);
        return { x: lamp.x, y: lamp.y, sx: lamp.w / APT_W, sy: lamp.h / APT_H };
      }
      if (e.id === 'fireworks') return { x, y: 0, sx: m.unit, sy: m.unit };
      if (e.id === 'crane') return { x, y: m.ground, sx: m.unit, sy: m.unit };
      return { x, y: e.y * f.height, sx: m.unit, sy: m.unit };
    default: {
      const never: never = e.layer;
      return never;
    }
  }
}
