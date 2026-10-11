// Caractère d'un conducteur (spec véhicules §1) : tiré une fois par véhicule, il règle sa conduite. Unités : px et s pour
// une pièce de référence (unit = 1, hauteur 340) ; le moteur multiplie distances, vitesses et accélérations par `unit`.
// Pas de conduite de robots : temps de réaction propre (il réagit à ce qu'il a vu il y a `react` s), vitesse voulue qui
// flotte, accélération douce et longue ou vive, freinage anticipé très tôt (petit `b`) ou tardif, distance de sécurité,
// place dans la voie et ondulation, patience avant de dépasser un véhicule arrêté.
export type Temperament = {
  react: number;
  want: number;
  a: number;
  b: number;
  T: number;
  s0: number;
  lane: number;
  sway: number;
  swayF: number;
  wobble: number;
  patience: number;
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function temperamentOf(rng: () => number): Temperament {
  const style = rng();
  const early = rng() < 0.35;
  return {
    react: lerp(0.3, 1.6, rng()),
    want: lerp(0.82, 1.15, rng()),
    a: style < 0.3 ? lerp(7, 13, rng()) : style < 0.8 ? lerp(13, 24, rng()) : lerp(24, 38, rng()),
    b: early ? lerp(12, 22, rng()) : lerp(26, 55, rng()),
    T: lerp(0.6, 1.9, rng()),
    s0: lerp(6, 16, rng()),
    lane: lerp(-1, 1, rng()),
    sway: lerp(0.1, 0.5, rng()),
    swayF: lerp(0.006, 0.02, rng()),
    wobble: lerp(0, 0.05, rng()),
    patience: lerp(2, 7, rng()),
  };
}
