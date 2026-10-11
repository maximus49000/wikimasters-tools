// Passage piéton à feu à bouton-poussoir (demandes de l'utilisateur, 2026-10-11). Le feu reste vert pour les voitures tant
// que personne n'attend. Un piéton qui arrive au bord de la chaussée appuie sur le bouton : après un court délai, le feu
// passe à l'orange puis au rouge, mais jamais avant MIN_GREEN s de vert (sinon, aux heures de pointe, il serait toujours
// rouge). Pendant le rouge (après une seconde de rouge pour tous), les piétons qui attendent traversent, chacun après son
// temps de réaction ; celui qui arrive trop tard pour finir avant le vert rappuie et attend le cycle suivant. Les piétons
// arrivent à pied par un trottoir depuis un bord du monde et repartent par l'autre trottoir vers un bord : personne
// n'apparaît sur place. État porté par le monde de la circulation (engine.ts), avancé à chaque pas.
import { hashString, mulberry32 } from '../../scene-world';

export const MIN_GREEN = 25; // s de vert au moins entre deux rouges
export const PRESS_DELAY = 3; // s entre l'appui et l'orange
export const AMBER = 3;
export const ALL_RED = 1; // rouge pour tous avant que les piétons s'engagent
export const RED_WALK = 13; // durée du rouge des voitures
export type LightColor = 'green' | 'amber' | 'red';
export type PushLight = { x: number; color: LightColor; since: number; pressedAt: number | null; log: { t: number; color: LightColor }[] };

export type Walker = {
  id: string;
  down: boolean; // du trottoir des immeubles vers celui d'en face
  fromEdge: number;
  toEdge: number;
  xc: number;
  speed: number; // px/s
  react: number;
  u: number; // tirage (tenue)
  stage: 'approach' | 'wait' | 'cross' | 'leave';
  x: number;
  cy: number; // avancée de la traversée, 0 (trottoir de départ) à 1
  walked: number; // distance parcourue (px), pour le pas
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Couleur du feu (voitures) à l'instant t, d'après le journal des changements (pour la perception avec retard).
export function lightColorAt(l: PushLight, t: number): LightColor {
  for (let i = l.log.length - 1; i >= 0; i--) if (l.log[i]!.t <= t) return l.log[i]!.color;
  return l.log.length > 0 ? l.log[0]!.color : l.color;
}

function setColor(l: PushLight, color: LightColor, t: number): void {
  l.color = color;
  l.since = t;
  l.log.push({ t, color });
  while (l.log.length > 8 && l.log[1]!.t < t - 10) l.log.shift();
}

// Avance le feu d'un pas : appui → orange (après PRESS_DELAY et MIN_GREEN de vert) → rouge (RED_WALK) → vert.
export function stepLight(l: PushLight, t: number): void {
  if (l.color === 'green') {
    if (l.pressedAt !== null && t >= l.pressedAt + PRESS_DELAY && t >= l.since + MIN_GREEN) setColor(l, 'amber', t);
  } else if (l.color === 'amber') {
    if (t >= l.since + AMBER) setColor(l, 'red', t);
  } else if (t >= l.since + RED_WALK) {
    setColor(l, 'green', t);
    l.pressedAt = null;
  }
}

// Nouveau piéton (tirages par son numéro) arrivant par un bord du monde.
export function newWalker(seed: number, n: number, width: number, margin: number, lightX: number, crossHalf: number, unit: number): Walker {
  const r = mulberry32(seed ^ hashString(`walker-${n}`));
  const fromLeft = r() < 0.5;
  const fromEdge = fromLeft ? -margin : width + margin;
  return {
    id: `wk-${n}`,
    down: r() < 0.55,
    fromEdge,
    toEdge: r() < 0.5 ? -margin : width + margin,
    xc: lightX + lerp(-crossHalf + 5, crossHalf - 5, r()) * unit,
    speed: lerp(9, 13, r()) * unit,
    react: lerp(0.3, 1.4, r()),
    u: r(),
    stage: 'approach',
    x: fromEdge,
    cy: 0,
    walked: 0,
  };
}

// Avance un piéton d'un pas ; `crossPx` : largeur de la chaussée à traverser (px). Retourne false quand il est sorti.
export function stepWalker(w: Walker, l: PushLight, t: number, dt: number, crossPx: number): boolean {
  if (w.stage === 'approach') {
    const d = Math.min(w.speed * dt, Math.abs(w.xc - w.x));
    w.x += Math.sign(w.xc - w.x) * d;
    w.walked += d;
    if (Math.abs(w.xc - w.x) < 1e-6) w.stage = 'wait';
    return true;
  }
  if (w.stage === 'wait') {
    const crossTime = crossPx / w.speed;
    const redLeft = l.color === 'red' ? l.since + RED_WALK - t : 0;
    const canGo = l.color === 'red' && t >= l.since + ALL_RED + w.react && redLeft > crossTime + 1;
    if (canGo) w.stage = 'cross';
    // Appuie sur le bouton (feu vert pour les voitures, ou rouge trop avancé pour traverser à temps).
    else if (l.pressedAt === null && (l.color === 'green' || (l.color === 'red' && redLeft <= crossTime + 1))) l.pressedAt = t;
    return true;
  }
  if (w.stage === 'cross') {
    const d = w.speed * dt;
    w.cy = Math.min(1, w.cy + d / crossPx);
    w.walked += d;
    if (w.cy >= 1) w.stage = 'leave';
    return true;
  }
  const d = Math.min(w.speed * dt, Math.abs(w.toEdge - w.x));
  w.x += Math.sign(w.toEdge - w.x) * d;
  w.walked += d;
  return Math.abs(w.toEdge - w.x) > 1e-6;
}
