// Repère de la scène Ville : le monde fait `height` px de haut ; le dessin a été pensé pour 340 px (`unit` = échelle).
export type CityMetrics = { ground: number; walkY: number; doorY: number; laneY: { far: number; near: number }; unit: number };

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
