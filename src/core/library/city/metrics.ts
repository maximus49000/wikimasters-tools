// Repère de la scène Ville : le monde fait `height` px de haut ; le dessin a été pensé pour 340 px (`unit` = échelle).
// `curb` : bord du trottoir côté rue ; `farSide` : haut du trottoir d'en face (en bas de l'image).
export type CityMetrics = { ground: number; curb: number; walkY: number; doorY: number; laneY: { far: number; near: number }; farSide: number; unit: number };

// Sol de la rue (fraction de la hauteur) : assez haut pour que la plus petite fenêtre posée en bas du mur montre les deux files.
export const CITY_GROUND = 0.7;
// Les véhicules de la file du fond paraissent un peu plus petits.
export const FAR_SHRINK = 0.9;

// Proportions des éléments de la rue, appliquées au dessin (retour utilisateur : entrées et passants trop grands
// par rapport aux immeubles). Passant ≈ 22 px (sprite de 40 × 0,55), entrée 12 × 23 px (sprite 22 × 27 réduit),
// voiture ≈ 34 × 18 px, lampadaire ≈ 68 px ; les immeubles sont étirés de 1,6 (voir facades.ts).
export const STREET_SCALE = { person: 0.55, entranceX: 12 / 22, entranceY: 0.85, vehicle: 0.85, lamp: 0.85 } as const;
// Pas de marche : les vitesses tirées (px/s) sont ralenties pour des passants plus petits.
export const WALK_PACE = 0.7;

// Largeur du cadre de l'entrée telle que dessinée : sprite de 22 px × STREET_SCALE.entranceX = 12 px.
export const DOOR_WIDTH = 12;
// Marge entre l'entrée et les bords de son immeuble (auvent, interphone et plaque débordent un peu du cadre).
export const DOOR_MARGIN = 4;

export function cityMetrics(height: number): CityMetrics {
  const ground = height * CITY_GROUND;
  const sidewalk = height * 0.06;
  const curb = ground + sidewalk;
  const farSide = height * 0.94;
  const road = farSide - curb;
  return {
    ground,
    curb,
    walkY: ground + sidewalk * 0.7,
    doorY: ground + sidewalk * 0.1,
    laneY: { far: curb + road * 0.4, near: curb + road * 0.9 },
    farSide,
    unit: height / 340,
  };
}
