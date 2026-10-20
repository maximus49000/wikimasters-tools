import type { Sky } from '../core/library/sky';

// Position d'un astre (soleil ou lune) selon sa fraction de course (0 = lever, 1 = coucher), dans le repère du monde :
// repli des ciels sans lieu ni date (aperçus).
export const celestialPlace = (frac: number, width: number, height: number): { x: number; y: number } => ({
  x: width * (0.04 + 0.92 * frac),
  y: height * 0.7 - Math.sin(Math.PI * frac) * height * 0.55,
});

type Place = { x: number; y: number };
// Place du soleil (null s'il est couché) : sa position réelle quand le ciel la donne (hauteur et azimut au lieu exact),
// sinon sa fraction de course.
export const sunPlace = (sky: Sky, width: number, height: number): Place | null =>
  sky.sunFrac === null ? null : sky.sunAt ? { x: width * sky.sunAt.x, y: height * sky.sunAt.y } : celestialPlace(sky.sunFrac, width, height);
export const moonPlace = (sky: Sky, width: number, height: number): Place | null =>
  sky.moonFrac === null ? null : sky.moonAt ? { x: width * sky.moonAt.x, y: height * sky.moonAt.y } : celestialPlace(sky.moonFrac, width, height);
