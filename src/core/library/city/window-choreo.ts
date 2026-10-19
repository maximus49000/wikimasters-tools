import { facingYaw, phaseIndexOf, YAW_FRONT } from '../figure/gait';
import { STRIDE, type ArmPose, type Gait } from '../figure/skeleton';
import type { Actor } from './home-state';
import type { Dwelling, Room } from './households';
import type { Where } from './schedules';

// Chorégraphies des pantins de fenêtre (port de `choreo` et `balconyInOut` de docs/superpowers/maquettes/vie-etages/src/
// 06-pantins.js ; spec 2026-10-19 « vie au-dessus de la rue » §5.2). La maquette mélangeait des poses en angles ; ici chaque
// instant choisit une pose clé du moteur des pantins (`figure/skeleton.ts` : allure, geste des bras, penché), la même
// cinématique que les passants de la rue. Fonction pure de l'acteur (`p` : avancement 0-1, `t` : minutes écoulées) et du
// logement (taille du membre) : rien de caché, rien de tiré.
//
// Rien n'apparaît sur place : toute scène intérieure commence par une entrée et finit par une sortie en marchant (IN_OUT_S
// secondes, au plus 30 % d'une scène courte) ; le balcon se gagne par la porte-fenêtre en traversant le plan de la vitre.

export type HandProp = 'cigarette' | 'watering-can' | 'rug' | 'spoon' | 'book' | 'cup';
// Même forme que `PoseIn` (yaw, gait, phase, head, arms, lean) ; dx : décalage horizontal dans la pièce, en largeurs de
// fenêtre (0 = centré, négatif à gauche ; la marche d'entrée vient d'une fenêtre voisine) ; size : taille relative à
// l'adulte (0,66 × hauteur d'étage) ; still : pose fixe atteinte (hors de la borne des chorégraphies animées).
export type WindowPose = {
  yaw: number; gait: Gait; phase: number; head: number; arms: ArmPose; lean: number;
  dx: number; room: Room; where: Where; size: number; props: HandProp[]; still: boolean;
};

// Gestes des bras ajoutés au moteur pour les fenêtres (ordre de la planche).
export const WINDOW_ARM_POSES: readonly ArmPose[] = ['shutters', 'curtain', 'sill', 'rail', 'smoke-up', 'smoke-down', 'water', 'shake-1', 'shake-2', 'cook-1', 'cook-2', 'table', 'tv', 'dance-1', 'dance-2'];

// Entrée / sortie en marchant (s) et part maximale d'une scène qu'elles occupent.
export const IN_OUT_S = 11;
const IN_OUT_MAX = 0.3;
// Alternance des variantes `-1` / `-2` des gestes animés (s) ; cycle du fumeur (s) ; cycle de marche (s, maquette 0,9).
const ALT_S = 0.6;
const SMOKE_CYCLE_S = 11;
const WALK_CYCLE_S = 0.9;
// Au-delà de cette distance au centre de la fenêtre, le pantin est dans la pièce voisine : rien à dessiner.
const OUT_OF_VIEW = 1.4;
// Place au balcon par créneau (maquette : 0,3 + 0,55 × slot) ; seuil de la vitre (côté intérieur).
const BALCONY_SLOT0 = 0.3;
const BALCONY_STEP = 0.55;
const GLASS_DX = 0.05;
// Penché du moteur (niveaux × LEAN_DEG) : appui de fenêtre, garde-corps et tapis à 2, cuisine à 1.
const LEAN_SILL = 2;
const LEAN_COOK = 1;

type Step = Pick<WindowPose, 'yaw' | 'gait' | 'phase' | 'head' | 'arms' | 'lean' | 'dx' | 'props' | 'still'> & { where?: Where };

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mod = (a: number, n: number): number => ((a % n) + n) % n;
// Phase de marche depuis le temps écoulé (un cycle par WALK_CYCLE_S : la distance parcourue derrière une vitre n'a pas d'échelle).
const walkPhase = (s: number): number => phaseIndexOf((s / WALK_CYCLE_S) * STRIDE);
// Variante `-1` / `-2` d'un geste animé, décalée par `slot` (deux danseurs ne lèvent pas le même bras au même instant).
const alt = (s: number, slot = 0): '1' | '2' => (mod(Math.floor(s / ALT_S) + slot, 2) === 0 ? '1' : '2');
// Tête tournée d'un cran selon le créneau (variété entre voisins sans rien qui bouge : une pose `still` ne change pas d'une
// image à l'autre, le calque ne la réécrit pas).
const headOf = (slot: number): number => (slot % 2 ? 1 : -1);
// Hors champ (entrée / sortie en mouvement réduit) : au-delà de OUT_OF_VIEW, `windowPose` renvoie null.
const OUT: Step = { yaw: YAW_FRONT, gait: 'stand', phase: 0, head: 0, arms: 'down', lean: 0, dx: 9, props: [], still: true };

const fixed = (arms: ArmPose, x: Partial<Step> = {}): Step => ({ yaw: YAW_FRONT, gait: 'stand', phase: 0, head: 0, arms, lean: 0, dx: 0, props: [], still: false, ...x });
// Marche de `from` à `to` (en largeurs de fenêtre) à l'avancement q ∈ [0, 1], de profil dans le sens du déplacement.
const walk = (s: number, q: number, from: number, to: number, where?: Where): Step =>
  ({ yaw: facingYaw(to > from ? 1 : -1), gait: 'walk', phase: walkPhase(s), head: 0, arms: 'swing', lean: 0, dx: lerp(from, to, q), props: [], still: false, ...(where ? { where } : {}) });

// Sortie sur le balcon par la porte-fenêtre : marche dedans jusqu'au seuil, traversée du plan de la vitre (dedans → dehors)
// jusqu'au créneau, et retour par le même chemin en fin de scène ; null entre les deux (le geste du balcon prend la suite).
function balconyInOut(p: number, s: number, tIn: number, tOut: number, slot: number): Step | null {
  const target = BALCONY_SLOT0 + slot * BALCONY_STEP;
  if (p < tIn * 0.55) return walk(s, p / (tIn * 0.55), -1.5, GLASS_DX, 'in');
  if (p < tIn) return walk(s, (p - tIn * 0.55) / (tIn * 0.45), GLASS_DX, target, 'balcony');
  if (p > 1 - tOut * 0.45) return walk(s, (p - 1 + tOut * 0.45) / (tOut * 0.45), GLASS_DX, -1.5, 'in');
  if (p > 1 - tOut) return walk(s, (p - 1 + tOut) / (tOut * 0.55), target, GLASS_DX, 'balcony');
  return null;
}

// Pose à l'instant de l'acteur. `reduced` (mouvement réduit) : pose clé centrale de la chorégraphie, immobile, sans
// dépendance au temps écoulé ; l'entrée et la sortie sont hors champ.
function step(a: Actor, reduced: boolean): Step {
  const { p, slot } = a;
  const s = a.t * 60;
  // Durée de la scène (s) : lue dans t / p ; à p = 0 (tout début) l'entrée occupe sa part maximale.
  const durS = p > 0 ? (a.t / p) * 60 : IN_OUT_S / IN_OUT_MAX;
  const tIn = Math.min(IN_OUT_MAX, IN_OUT_S / durS);
  const tOut = tIn;
  const bal = a.where === 'balcony';
  const balDx = BALCONY_SLOT0 + slot * BALCONY_STEP;
  // Variante `-1` / `-2` d'un geste animé (la première en mouvement réduit).
  const v = (name: 'cook' | 'shake' | 'dance', off = 0): ArmPose => `${name}-${reduced ? '1' : alt(s, off)}`;
  // Marche d'entrée depuis `from` vers la place `at`, de sortie vers `to` ; sinon null (le corps de la scène).
  const inOut = (at: number, from = -1.5, to = 1.5): Step | null => {
    if (p < tIn) return reduced ? OUT : walk(s, p / tIn, from, at);
    if (p > 1 - tOut) return reduced ? OUT : walk(s, (p - 1 + tOut) / tOut, at, to);
    return null;
  };
  // Même chose avec des seuils propres à la scène (volets, rideaux).
  const walkIf = (cond: boolean, q: number, from: number, to: number): Step | null => (cond ? (reduced ? OUT : walk(s, q, from, to)) : null);
  const balcony = (): Step | null => (bal ? (reduced ? inOut(balDx) : balconyInOut(p, s, tIn, tOut, slot)) : inOut(0));
  switch (a.choreo) {
    case 'cross':
      return reduced ? fixed('down', { yaw: facingYaw(1), dx: lerp(-1.6, 1.6, p), still: true }) : walk(s, p, -1.6, 1.6);
    case 'tv':
    case 'read': {
      const dx = 0.22 + a.seat * 0.16;
      return inOut(dx, -1.4, 1.4) ?? fixed(a.choreo === 'tv' ? 'tv' : 'read', { yaw: facingYaw(-1), gait: 'seated', dx, props: a.choreo === 'read' ? ['book'] : [], still: true });
    }
    case 'table': {
      // Seul : au bureau ou au bout de la table, tourné vers la droite ; à plusieurs : face à face, par paires.
      const i = a.seat, n = a.party, side = i % 2 ? 1 : -1;
      const dx = n === 1 ? (a.desk ? -0.12 : -0.2) : side * (0.24 + Math.floor(i / 2) * 0.1);
      return inOut(dx, -1.4, 1.4) ?? fixed('table', { yaw: facingYaw(n === 1 || side < 0 ? 1 : -1), gait: 'seated', dx, props: ['cup'], still: true });
    }
    case 'cook':
      return inOut(-0.22, 1.4, 1.4) ?? fixed(v('cook'), { yaw: facingYaw(1), lean: LEAN_COOK, dx: -0.22, props: ['spoon'], still: reduced });
    case 'armsUp':
      // Volets de la cuisine, scène courte : 20 % d'entrée et de sortie, bras levés au milieu.
      return walkIf(p < 0.2, p / 0.2, -1.5, 0) ?? walkIf(p > 0.8, (p - 0.8) / 0.2, 0, 1.5) ?? fixed(!reduced && (p < 0.25 || p > 0.75) ? 'down' : 'shutters', { still: reduced });
    case 'stand':
      return inOut(0.1, -1.4, 1.4) ?? fixed('down', { dx: 0.1, still: true });
    case 'openShutters':
      // Marche, debout, bras levés aux vantaux (qui s'ouvrent), main au battant, puis penché à l'appui 20 s avant de repartir.
      if (reduced) return walkIf(p < 0.12 || p >= 0.9, 0, 0, 0) ?? fixed('shutters', { still: true });
      if (p < 0.12) return walk(s, p / 0.12, -1.5, 0);
      if (p < 0.19) return fixed('down');
      if (p < 0.66) return fixed('shutters');
      if (p < 0.735) return fixed('reach');
      if (p < 0.9) return fixed('sill', { lean: LEAN_SILL, where: 'lean', still: true });
      return walk(s, (p - 0.9) / 0.1, 0, 1.5);
    case 'closeShutters':
      if (reduced) return walkIf(p < 0.14 || p >= 0.82, 0, 0, 0) ?? fixed('shutters', { still: true });
      if (p < 0.14) return walk(s, p / 0.14, 1.5, 0);
      if (p < 0.22) return fixed('down');
      if (p < 0.375) return fixed('reach');
      if (p < 0.82) return fixed('shutters');
      return walk(s, (p - 0.82) / 0.18, 0, -1.5);
    case 'drawCurtains': {
      // Traverse la fenêtre en tirant le rideau d'un bord à l'autre (sens inverse pour le second rideau).
      const rev = a.reverse ? -1 : 1;
      if (reduced) return walkIf(p < 0.22 || p >= 0.75, 0, 0, 0) ?? fixed('curtain', { still: true });
      if (p < 0.22) return walk(s, p / 0.22, -1.5 * rev, -0.45 * rev);
      if (p < 0.75) return fixed('curtain', { dx: lerp(-0.45, 0.45, (p - 0.22) / 0.53) * rev });
      return walk(s, (p - 0.75) / 0.25, 0.45 * rev, 1.5 * rev);
    }
    case 'lean':
      return inOut(0) ?? fixed('sill', { lean: LEAN_SILL, where: 'lean', head: headOf(slot), still: true });
    case 'leanRail':
      return balcony() ?? fixed('rail', { lean: LEAN_SILL, dx: bal ? balDx : 0, where: bal ? 'balcony' : 'lean', head: headOf(slot), still: true });
    case 'smoke': {
      const out = balcony();
      if (out) return out;
      // Cycle de 11 s : main à la bouche pendant les 30 % du début (bouffée), bras baissé le reste du temps.
      const up = !reduced && mod(s / SMOKE_CYCLE_S + slot, 1) < 0.3;
      return fixed(up ? 'smoke-up' : 'smoke-down', { lean: bal ? 0 : LEAN_SILL, dx: bal ? balDx : 0, where: bal ? 'balcony' : 'lean', props: ['cigarette'], still: reduced });
    }
    case 'water': {
      const out = bal ? (reduced ? inOut(0.5) : balconyInOut(p, s, tIn, tOut, 0)) : inOut(0);
      if (out) return out;
      if (reduced) return fixed('water', { yaw: facingYaw(1), lean: LEAN_SILL, dx: bal ? 0.5 : 0, where: bal ? 'balcony' : 'lean', props: ['watering-can'], still: true });
      // Trois pots l'un après l'autre : on se redresse entre deux (bras baissés), on verse penché au-dessus du pot.
      const q = (p - tIn) / (1 - tIn - tOut), pot = Math.min(2, Math.floor(q * 3)), ph = (q * 3) % 1;
      const pouring = ph > 0.1 && ph < 0.85;
      return fixed(pouring ? 'water' : 'down', { yaw: facingYaw(1), lean: pouring ? LEAN_SILL : 0, dx: bal ? [0.1, 0.5, 0.9][pot]! : 0, where: bal ? 'balcony' : 'lean', props: ['watering-can'] });
    }
    case 'shake':
      return inOut(0) ?? fixed(v('shake'), { lean: LEAN_SILL, where: 'lean', props: ['rug'], still: reduced });
    case 'dance': {
      const home = -0.4 + slot * 0.3;
      return inOut(home) ?? fixed(v('dance', slot), { dx: reduced ? home : home + Math.sin(s / 2.3 + slot) * 0.08, still: reduced });
    }
  }
}

// Taille relative du membre `m` du foyer ; un invité (m au-delà des membres) a la taille d'un adulte.
const sizeOf = (a: Actor, d: Dwelling): number => d.hh.members[a.m]?.size ?? 1;

// Pose du pantin d'un acteur à l'instant de l'acteur ; null quand il est hors champ (dans la pièce voisine). `reduced` :
// mouvement réduit, pose clé centrale immobile (voir `step`).
export function windowPose(a: Actor, d: Dwelling, reduced = false): WindowPose | null {
  const st = step(a, reduced);
  if (Math.abs(st.dx) >= OUT_OF_VIEW) return null;
  const { where, ...rest } = st;
  return { ...rest, room: a.room, where: where ?? a.where, size: sizeOf(a, d) };
}
