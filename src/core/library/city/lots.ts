import { citySkyline, type Building, type Podium } from '../scene-world';

// Lot du premier plan : un immeuble simple, ou les deux tours d'un jumeau et leur socle commun (un seul local, une entrée).
export type FrontLot = { x: number; w: number; podium: Podium | null; towers: Building[] };

export function frontLots(width: number, height: number, seed: number): FrontLot[] {
  const out: FrontLot[] = [];
  for (const b of citySkyline(width, height, seed)) {
    if (b.far) continue;
    const last = out.at(-1);
    if (b.podium && last?.podium === b.podium) {
      last.towers.push(b);
      continue;
    }
    out.push(b.podium ? { x: b.podium.x, w: b.podium.w, podium: b.podium, towers: [b] } : { x: b.x, w: b.w, podium: null, towers: [b] });
  }
  return out.filter((l) => l.x + l.w > 0 && l.x < width);
}
