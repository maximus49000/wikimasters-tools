// Repère de la scène Ville : le monde fait `height` px de haut ; le dessin a été pensé pour 340 px (`unit` = échelle).
export type CityMetrics = { ground: number; walkY: number; doorY: number; laneY: { far: number; near: number }; unit: number };

// Proportions des éléments de la rue, appliquées au dessin (retour utilisateur : entrées et passants trop grands
// par rapport aux immeubles). Passant ≈ 22 px (sprite de 40 × 0,55), entrée 12 × 23 px (sprite 22 × 27 réduit),
// voiture ≈ 34 × 18 px, lampadaire ≈ 68 px ; les immeubles sont étirés de 1,6 (voir facades.ts).
export const STREET_SCALE = { person: 0.55, entranceX: 12 / 22, entranceY: 0.85, vehicle: 0.85, lamp: 0.85 } as const;
// Pas de marche : les vitesses tirées (px/s) sont ralenties pour des passants plus petits.
export const WALK_PACE = 0.7;

export function cityMetrics(height: number): CityMetrics {
  const ground = height * 0.78;
  const sidewalk = height * 0.07;
  const road = height - ground - sidewalk;
  return {
    ground,
    walkY: ground + sidewalk * 0.7,
    doorY: ground + sidewalk * 0.1,
    laneY: { far: ground + sidewalk + road * 0.42, near: ground + sidewalk + road * 0.85 },
    unit: height / 340,
  };
}
