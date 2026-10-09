const DEG = Math.PI / 180;
export const ELEV_MIN = 6 * DEG;
export const ELEV_MAX = 62 * DEG;
// Écart horizontal (en hauteurs de mur) qui donne une inclinaison de 45° du rayon.
const AZIMUTH_SPAN = 3;
const MAX_SLOPE = 1.5;

// Élévation du soleil (radians) d'après sa course (0 = lever, 1 = coucher) ; 0 s'il est couché.
export function sunElevation(sunFrac: number | null): number {
  if (sunFrac === null) return 0;
  const f = Math.min(1, Math.max(0, sunFrac));
  return ELEV_MIN + (ELEV_MAX - ELEV_MIN) * Math.sin(Math.PI * f);
}

// Décalage latéral (px par unité de profondeur) du rayon d'une fenêtre : la lumière va à l'opposé du soleil,
// d'autant plus que le soleil est loin de la fenêtre dans le panorama partagé.
export function beamSlope(sunX: number, windowCx: number, wallH: number): number {
  const raw = (windowCx - sunX) / (AZIMUTH_SPAN * wallH);
  return Math.min(MAX_SLOPE, Math.max(-MAX_SLOPE, raw));
}
