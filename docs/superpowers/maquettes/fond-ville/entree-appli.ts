// Entrée du bundle « appli » : le vrai code du peintre de la Ville (src/core/library), exposé en global pour la maquette.
// Bundlé deux fois par build.mjs : tel quel (AVANT, décor actuel complet) et avec hill-painter remplacé par un stub (RUE :
// premier plan seul, fond transparent, pour composer le fond corrigé de la maquette dessous).
export { cityPaintPlan, hillCrestY, hillTopY, HILL_ROWS, FAR_HAZE, FAR_ROOF_H, leftOf, LEFT_GAP, silhouetteTop } from '../../../../src/core/library/paint/city-plan';
export { paintCityTile, tileCount, TILE, tileItems } from '../../../../src/core/library/paint/city-painter';
export { cityFacades, FAR_WINDOW, GROUND_FLOOR } from '../../../../src/core/library/city/facades';
export { cityMetrics } from '../../../../src/core/library/city/metrics';
export { hashString, mulberry32 } from '../../../../src/core/library/scene-world';
export { SUN, COOL, INK, TAU, shade, light, ink, fillRect, disc, poly, pick } from '../../../../src/core/library/paint/cel';
export { hexRgb, mixRgb, rgba } from '../../../../src/core/library/paint/color';
export { gradeFor, NIGHT, DUSK } from '../../../../src/core/library/paint/grade';
export { windowsLitFraction, nightness, windowLit } from '../../../../src/core/library/city/window-lights';
export { lampLit, lampsFor } from '../../../../src/core/library/city/lamps';
export { publicHolidays, dayContext, festivitiesOn } from '../../../../src/core/library/city/calendar';
export { roofLineY, roofSpan } from '../../../../src/core/library/paint/snow-painter';
export { skylinePoints, cityTopY } from '../../../../src/core/library/paint/sky-clip';
