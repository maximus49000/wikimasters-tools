import { describe, expect, it } from 'vitest';
import { advance, agentView, createTraffic, warmTraffic, xOfS, type Agent, type TrafficEnv, type TrafficWorld } from '../../../../../src/core/library/city/traffic/engine';
import { carExtent } from '../../../../../src/core/library/city/traffic/car-art';
import { temperamentOf } from '../../../../../src/core/library/city/traffic/temperament';
import { mulberry32 } from '../../../../../src/core/library/scene-world';

const env = (d: number, extra: Partial<TrafficEnv> = {}): TrafficEnv => ({ demand: { near: d, far: d, bike: d * 0.4 }, closed: false, arrivals: [], deliveries: [], crowd: 0.6, crossPx: 90, ...extra });
const T0 = 1_800_000_000;
const world = (width = 1080, seed = 1, e: TrafficEnv = env(1)): TrafficWorld => warmTraffic({ width, seed, unit: 1, startS: T0 }, e);
const finite = (a: Agent): boolean => [a.s, a.v, a.cmd, a.lat, a.dist].every(Number.isFinite);
// Chevauchement entre deux véhicules consécutifs d'une voie (hors dépassement en cours).
function overlaps(w: TrafficWorld): string[] {
  const bad: string[] = [];
  for (const track of ['near', 'far', 'bike'] as const) {
    const list = w.agents.filter((a) => a.track === track).sort((p, q) => q.s - p.s);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]!;
      const b = list[i]!;
      if (b.passing === a.id || a.passing === b.id || a.pulled || b.pulled || a.kind === 'ambulance' || b.kind === 'ambulance') continue;
      if (b.s + b.half > a.s - a.half + 0.01) bad.push(`${b.id}→${a.id}`);
    }
  }
  return bad;
}

describe('caractère', () => {
  it('plages et déterminisme', () => {
    for (let i = 0; i < 200; i++) {
      const h = temperamentOf(mulberry32(i));
      expect(h.react).toBeGreaterThanOrEqual(0.3);
      expect(h.react).toBeLessThanOrEqual(1.6);
      expect(h.a).toBeGreaterThan(0);
      expect(h.b).toBeGreaterThan(0);
    }
    expect(temperamentOf(mulberry32(7))).toEqual(temperamentOf(mulberry32(7)));
  });
});

describe('moteur de circulation', () => {
  it('démarrage à chaud : rue déjà peuplée, déterministe', () => {
    const a = world();
    const b = world();
    expect(a.agents.length).toBeGreaterThan(4);
    expect(a.agents.map((x) => [x.id, x.s.toFixed(3)])).toEqual(b.agents.map((x) => [x.id, x.s.toFixed(3)]));
  });
  it('aucun chevauchement ni valeur non finie sur 30 min, à faible et forte demande', () => {
    for (const d of [0.3, 1]) {
      const w = world(1080, 3, env(d));
      for (let t = T0; t < T0 + 1800; t += 5) {
        advance(w, t, env(d));
        expect(overlaps(w)).toEqual([]);
        expect(w.agents.every(finite)).toBe(true);
      }
    }
  });
  it('pas de boucle : chaque véhicule entre d’un côté et sort de l’autre', () => {
    const w = world();
    const first = w.agents.filter((a) => a.track === 'near')[0]!;
    const id = first.id;
    for (let t = T0; t < T0 + 120 && w.agents.some((a) => a.id === id); t += 1) advance(w, t, env(1));
    expect(w.agents.some((a) => a.id === id)).toBe(false);
  });
  it('les conducteurs ne roulent pas tous pareil (vitesses et décalages variés)', () => {
    const w = world();
    const lats = new Set(w.agents.filter((a) => a.track !== 'bike').map((a) => a.lat.toFixed(2)));
    expect(lats.size).toBeGreaterThan(3);
  });
  it('route fermée : plus aucune entrée', () => {
    const w = world();
    const closed = env(1, { closed: true });
    for (let t = T0; t < T0 + 200; t += 2) advance(w, t, closed);
    expect(w.agents.filter((a) => a.track !== 'bike' || true).length).toBe(0);
  });
  it('feu rouge : arrêt avant la ligne, puis redémarrage au vert', () => {
    const w = createTraffic({ width: 2000, seed: 5, unit: 1, startS: T0 });
    const e = env(1, { crowd: 1 });
    let sawStop = false;
    for (let t = w.t; t < T0 + 300; t += 0.5) {
      advance(w, t, e);
      if (w.light.color === 'red') {
        for (const a of w.agents.filter((x) => x.track === 'near')) {
          const front = xOfS(w, 'near', a.s) + a.half;
          const line = w.light.x - 20;
          // Arrêté avant la ligne, à sa marge de sécurité ; personne n'est arrêté au-delà.
          if (a.v < 0.5 && front <= line + 0.5 && front > line - 20) sawStop = true;
          // Arrêté au-delà de la ligne : seulement s'il fait la queue derrière un autre véhicule (bus à l'arrêt, livraison…).
          if (a.v < 0.5 && a.stop === null && !a.pulled && front > line + 1 && front < line + 40) {
            const ahead = w.agents.filter((o) => o.track === 'near' && o.s > a.s).map((o) => o.s - o.half - (a.s + a.half));
            expect(Math.min(...ahead, Infinity)).toBeLessThan(30);
          }
        }
      }
      expect(overlaps(w)).toEqual([]);
    }
    expect(sawStop).toBe(true);
  });
  it('le bus marque l’arrêt et repart ; une ambulance fait ranger les voitures', () => {
    const arrivals = [
      { key: 'bus-1', kind: 'bus' as const, track: 'near' as const, start: T0 + 1, half: 36 },
      { key: 'amb-1', kind: 'ambulance' as const, track: 'far' as const, start: T0 + 40, half: 21 },
    ];
    const e = env(0.8, { arrivals });
    const w = world(1080, 9, e);
    let busStopped = false;
    let pulled = false;
    for (let t = T0; t < T0 + 120; t += 0.5) {
      advance(w, t, e);
      const bus = w.agents.find((a) => a.event === 'bus-1');
      if (bus && bus.stop === 'bus') busStopped = true;
      if (w.agents.some((a) => a.pulled)) pulled = true;
      expect(w.agents.every(finite)).toBe(true);
    }
    expect(busStopped).toBe(true);
    expect(pulled).toBe(true);
    expect(w.agents.some((a) => a.event === 'bus-1')).toBe(false); // reparti et sorti
  });
  it('affichage interpolé entre deux pas', () => {
    const w = world();
    const a = w.agents[0]!;
    const v0 = agentView(w, a, w.t - 0.1).x;
    const v1 = agentView(w, a, w.t).x;
    expect(Number.isFinite(v0) && Number.isFinite(v1)).toBe(true);
  });
});

describe('voitures générées', () => {
  it('chaque voiture a sa fiche ; 10 voitures d’affilée (toutes voies) sans type répété ; longueur tirée de la fiche', () => {
    // Moteur à froid, observé dès le départ : chaque voiture créée est vue (au démarrage à chaud, celles déjà sorties
    // laisseraient des trous dans la suite).
    const w = createTraffic({ width: 1080, seed: 5, unit: 1, startS: T0 });
    const cars: Agent[] = [];
    const seen = new Set<string>();
    const t0 = w.t;
    for (let t = t0; t < t0 + 900 && cars.length < 40; t += 0.5) {
      advance(w, t, env(1));
      for (const a of w.agents)
        if (a.kind === 'car' && !seen.has(a.id)) {
          seen.add(a.id);
          cars.push(a);
        }
    }
    cars.sort((p, q) => Number(p.id.slice(3)) - Number(q.id.slice(3)));
    expect(cars.length).toBeGreaterThan(20);
    for (const a of cars) {
      expect(a.car).toBeDefined();
      const far = a.track === 'far' ? 0.9 : 1;
      expect(a.half).toBeCloseTo(carExtent(a.car!) * 0.85 * far, 5);
    }
    // Ordre de création = ordre de la suite : le rang de la fiche (seed) croît avec le numéro d'agent.
    for (let i = 0; i + 10 <= cars.length; i++) expect(new Set(cars.slice(i, i + 10).map((a) => a.car!.arch)).size).toBe(10);
  });
  it('tangage et inertie : bornés, finis, nez qui plonge au freinage', () => {
    const w = world(1080, 8, env(1));
    let plunged = false;
    for (let t = T0; t < T0 + 1800; t += 2) {
      advance(w, t, env(1));
      for (const a of w.agents) {
        expect(Number.isFinite(a.pitch) && Number.isFinite(a.lean)).toBe(true);
        expect(Math.abs(a.pitch)).toBeLessThanOrEqual(0.06);
        expect(Math.abs(a.lean)).toBeLessThanOrEqual(1.5);
        if (a.cmd < -20 && a.pitch > 0.01) plunged = true;
      }
    }
    expect(plunged).toBe(true);
  });
});
