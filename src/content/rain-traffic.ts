// src/content/rain-traffic.ts
// Pont entre la circulation et la pluie : chaque voie publie à chaque image la place de ses véhicules (sol sous les roues,
// toit, phares), la pluie la relit dans sa propre boucle (gouttes sur les toits, gerbes des roues, flaques traversées, reflets
// des feux). Un objet par pièce, fourni par RoomView ; aucun rendu React en jeu (tableaux réécrits en place).
import { createContext, useContext } from 'react';
import type { RainCar } from '../core/library/weather/rain-drops';

export type RainTraffic = {
  lanes: Record<'near' | 'far', { cars: RainCar[]; n: number; at: number }>;
  /** Véhicules publiés il y a moins de STALE_MS (voie démontée ou boucle arrêtée : plus rien), réunis dans `out`. */
  read(nowMs: number, out: RainCar[]): RainCar[];
};

const STALE_MS = 500;

export function createRainTraffic(): RainTraffic {
  const lanes: RainTraffic['lanes'] = { near: { cars: [], n: 0, at: -Infinity }, far: { cars: [], n: 0, at: -Infinity } };
  return {
    lanes,
    read(nowMs, out) {
      out.length = 0;
      for (const lane of [lanes.far, lanes.near]) {
        if (nowMs - lane.at > STALE_MS) continue;
        for (let i = 0; i < lane.n; i++) out.push(lane.cars[i]!);
      }
      return out;
    },
  };
}

/** Case réutilisée de la voie pour le i-ème véhicule de l'image (aucune allocation une fois chaud). */
export function rainCarSlot(lane: { cars: RainCar[] }, i: number): RainCar {
  let c = lane.cars[i];
  if (!c) lane.cars[i] = c = { id: '', x: 0, y: 0, half: 0, roof: 0, v: 0, dir: 1, head: { x: 0, y: 0 }, tail: { x: 0, y: 0 }, lit: false, far: false };
  return c;
}

export const RainTrafficContext = createContext<RainTraffic | null>(null);
export const useRainTraffic = (): RainTraffic | null => useContext(RainTrafficContext);
