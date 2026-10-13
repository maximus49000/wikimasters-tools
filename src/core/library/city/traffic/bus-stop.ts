// Voyageurs des arrêts de bus (spec véhicules §6, livraison V4). Deux arrêts par pièce, un par sens : celui de la voie du
// premier plan (vers la droite) sur le trottoir d'en face, celui de la voie du fond sur le trottoir des immeubles. Personne
// n'apparaît ni ne disparaît sur place (consigne « humains naturels ») :
// - les voyageurs arrivent à pied par un bord du monde, selon l'affluence, et attendent au poteau (5 au plus) ;
// - quand un bus marque l'arrêt, ceux qui attendent marchent jusqu'à sa porte avant et montent (petite marche vers la
//   chaussée, derrière la caisse : `step` de 0 à 1) ; ceux qui arrivent tout près pendant l'arrêt montent aussi ;
// - 0 à 3 voyageurs descendent, l'un après l'autre (marche de 1 à 0), puis repartent à pied vers un bord ;
// - le bus attend que les montées et les descentes soient finies (`hold`) ;
// - bus à horaires : chaque voyageur vient pour UNE ligne (celle d'un bus attendu dans le quart d'heure) ; il laisse passer
//   les bus des autres lignes et attend le sien (revue du 2026-10-13).
// Route fermée : plus personne ne vient attendre (aucun bus ne passera). État porté par le monde de la circulation, avancé à
// chaque pas (engine.ts), pur et déterministe.
import { hashString, mulberry32 } from '../../scene-world';

export type StopSide = 'near' | 'far'; // voie servie
export type RiderStage = 'arrive' | 'wait' | 'board' | 'step' | 'inside' | 'alight' | 'leave';
export type Rider = {
  id: string;
  side: StopSide;
  u: number; // tirage (tenue)
  speed: number; // px/s
  stage: RiderStage;
  x: number;
  target: number; // x visé (place au poteau, porte, bord)
  walked: number; // distance parcourue (px), pour le pas
  step: number; // 0 : sur le trottoir ; 1 : dans le bus
  at: number; // instant de début de la descente (inside)
  bus: string | null; // bus emprunté
  line: string | null; // ligne attendue (numéro) ; null : il prend le premier bus (sans horaires)
};
export type StopCrowd = { riders: Rider[]; serial: number; nextAt: Record<StopSide, number>; rng: () => number; served: Set<string> };
// Ce que le monde fournit : bus arrêté à l'arrêt de chaque côté (porte avant en x du monde), affluence, bords, unité.
export type StopEnv = {
  stopX: Readonly<Record<StopSide, number>>;
  buses: Readonly<Record<StopSide, { id: string; door: number; line?: string } | null>>;
  crowd: number;
  closed: boolean;
  width: number;
  margin: number;
  unit: number;
  // Bus à horaires (bus-timetable.ts) : prochain bus de chaque ligne attendue à l'arrêt de chaque sens (numéro, délai en s),
  // liste vide si aucun n'est attendu (nuit, fin de service). Absent : les voyageurs viennent au hasard de l'affluence et
  // prennent le premier bus, comme avant les horaires.
  nextBus?: Readonly<Record<StopSide, readonly { line: string; in: number }[]>>;
};

export const STOP_WAIT_MAX = 5;
const STEP_S = 0.8; // durée de la marche (montée ou descente)
const ALIGHT_GAP_S = 1.3;
const REACH = 70; // distance (unités) d'où un voyageur qui arrive court encore prendre le bus
// Bus à horaires : on ne vient attendre que dans le quart d'heure qui précède le passage ; personne ne vient si aucun bus
// n'est attendu, et ceux qui attendent repartent à pied (dernier bus passé).
export const COME_BEFORE_S = 15 * 60;
// Places au poteau (unités) : de part et d'autre, sans se chevaucher.
const SPOTS = [-6, 7, -15, 15, -23] as const;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function createStopCrowd(seed: number, t: number): StopCrowd {
  const rng = mulberry32(seed ^ hashString('bus-stop'));
  return { riders: [], serial: 0, nextAt: { near: t + rng() * 20, far: t + rng() * 20 }, rng, served: new Set() };
}

function newRider(c: StopCrowd, side: StopSide, x: number, stage: RiderStage, unit: number): Rider {
  const r = mulberry32(hashString(`rider-${c.serial}`) ^ Math.floor(c.rng() * 1e9));
  return { id: `bs-${c.serial++}`, side, u: r(), speed: lerp(9, 12.5, r()) * unit, stage, x, target: x, walked: 0, step: 0, at: 0, bus: null, line: null };
}

const freeSpot = (c: StopCrowd, side: StopSide, stopX: number, unit: number): number => {
  const taken = c.riders.filter((p) => p.side === side && (p.stage === 'arrive' || p.stage === 'wait')).map((p) => p.target);
  const spot = SPOTS.find((s) => !taken.some((x) => Math.abs(x - (stopX + s * unit)) < 1)) ?? SPOTS[0];
  return stopX + spot * unit;
};

// Marche vers la cible ; vrai quand elle est atteinte.
function walk(p: Rider, dt: number): boolean {
  const d = p.target - p.x;
  const s = Math.min(Math.abs(d), p.speed * dt);
  p.x += Math.sign(d) * s;
  p.walked += s;
  return Math.abs(p.target - p.x) < 0.5;
}

// Avance les arrêts d'un pas ; retourne vrai si la liste des voyageurs ou leur couche (trottoir / marche) a changé, et les
// bus à retenir (montées ou descentes en cours).
export function stepStops(c: StopCrowd, env: StopEnv, t: number, dt: number): { changed: boolean; hold: Set<string> } {
  let changed = false;
  const hold = new Set<string>();
  const u = env.unit;
  for (const side of ['near', 'far'] as const) {
    // Arrivées : tirées selon l'affluence, depuis un bord ; avec horaires, pour une ligne dont le bus passe bientôt.
    const timed = env.nextBus?.[side];
    if (timed) {
      // Plus de bus de sa ligne avant longtemps : ceux qui l'attendent renoncent et repartent vers un bord.
      for (const p of c.riders) {
        if (p.side !== side || (p.stage !== 'arrive' && p.stage !== 'wait')) continue;
        if (p.line !== null && timed.some((n) => n.line === p.line)) continue;
        p.stage = 'leave';
        p.target = p.x < env.width / 2 ? -env.margin : env.width + env.margin;
        changed = true;
      }
    }
    const soon = timed ? timed.filter((n) => n.in <= COME_BEFORE_S) : null;
    if (!env.closed && env.crowd > 0.02 && (soon === null || soon.length > 0) && t >= c.nextAt[side]) {
      c.nextAt[side] = t + Math.max(4, -Math.log(1 - c.rng() * 0.98) * (34 / env.crowd));
      const waiting = c.riders.filter((p) => p.side === side && (p.stage === 'arrive' || p.stage === 'wait')).length;
      if (waiting < STOP_WAIT_MAX) {
        const fromLeft = c.rng() < 0.5;
        const p = newRider(c, side, fromLeft ? -env.margin : env.width + env.margin, 'arrive', u);
        p.target = freeSpot(c, side, env.stopX[side], u);
        if (soon) p.line = soon[Math.floor(c.rng() * soon.length)]!.line;
        c.riders.push(p);
        changed = true;
      }
    }
    const bus = env.buses[side];
    if (bus && !c.served.has(bus.id)) {
      // Bus qui vient de marquer l'arrêt : 0 à 3 voyageurs descendront, l'un après l'autre.
      c.served.add(bus.id);
      const n = Math.floor(c.rng() * 4);
      for (let i = 0; i < n; i++) {
        const p = newRider(c, side, bus.door, 'inside', u);
        p.step = 1;
        p.at = t + 0.8 + i * ALIGHT_GAP_S;
        p.bus = bus.id;
        c.riders.push(p);
      }
    }
    for (const p of c.riders) {
      if (p.side !== side) continue;
      const mine = !bus?.line || p.line === null || p.line === bus.line;
      if (bus && mine && (p.stage === 'wait' || (p.stage === 'arrive' && Math.abs(p.x - bus.door) < REACH * u))) {
        // Monte : marche jusqu'à la porte avant (ceux qui arrivent de loin attendront le suivant ; ceux d'une autre ligne
        // laissent passer ce bus).
        p.stage = 'board';
        p.target = bus.door;
        p.bus = bus.id;
      }
      if (p.stage === 'board' && p.bus !== bus?.id) {
        // Le bus est reparti sans lui (ne devrait pas arriver : il est retenu) : il attend le suivant.
        p.stage = 'arrive';
        p.target = freeSpot(c, side, env.stopX[side], u);
      }
    }
  }
  const out: Rider[] = [];
  for (const p of c.riders) {
    switch (p.stage) {
      case 'arrive':
        if (walk(p, dt)) p.stage = 'wait';
        break;
      case 'board':
        hold.add(p.bus!);
        if (walk(p, dt)) {
          p.stage = 'step';
          changed = true;
        }
        break;
      case 'step':
        hold.add(p.bus!);
        p.step = Math.min(1, p.step + dt / STEP_S);
        if (p.step >= 1) {
          changed = true;
          continue; // monté : retiré
        }
        break;
      case 'inside':
        hold.add(p.bus!);
        if (t >= p.at) {
          p.stage = 'alight';
          changed = true;
        }
        break;
      case 'alight':
        hold.add(p.bus!);
        p.step = Math.max(0, p.step - dt / STEP_S);
        if (p.step <= 0) {
          p.stage = 'leave';
          p.target = c.rng() < 0.5 ? -env.margin : env.width + env.margin;
          changed = true;
        }
        break;
      case 'leave':
        if (walk(p, dt)) {
          changed = true;
          continue; // sorti par le bord
        }
        break;
      default:
        break;
    }
    out.push(p);
  }
  c.riders = out;
  // Bus servis : on oublie ceux qui ne sont plus à l'arrêt.
  for (const id of c.served) if (env.buses.near?.id !== id && env.buses.far?.id !== id && !hold.has(id)) c.served.delete(id);
  return { changed, hold };
}
