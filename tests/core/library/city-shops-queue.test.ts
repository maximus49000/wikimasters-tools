import { describe, expect, it } from 'vitest';
import { THRESHOLD_S } from '../../../src/core/library/city/doorway';
import { WALK_PACE } from '../../../src/core/library/city/metrics';
import { ADVANCE_S, nightclubDoor, queueAt, queueArrivals, queueScene, queueWalkSpeed, type ArrivalLayout, type QueueArrival, type QueueScene } from '../../../src/core/library/city/shops/queue';
import { TURN_S } from '../../../src/core/library/figure/gait';
import { WORLD_MARGIN } from '../../../src/core/library/scene-world';

const MIN = (h: number, m = 0): number => h * 60 + m;

describe('file de la boîte de nuit', () => {
  it('est vide quand la boîte est fermée', () => {
    for (const t of [0, 17, 400]) expect(queueAt(7, 'slot-a', t, MIN(0, 30), false)).toEqual([]);
  });

  it('a au plus 6 membres, des ids uniques et des slots consécutifs depuis 0', () => {
    for (let t = 0; t < 1200; t += 7) {
      const q = queueAt(3, 'slot-a', t, MIN(0, 45), true);
      expect(q.length).toBeLessThanOrEqual(6);
      expect(new Set(q.map((m) => m.id)).size).toBe(q.length);
      q.forEach((m, i) => expect(m.slot).toBe(i));
      for (const m of q) {
        expect(m.fade).toBeGreaterThanOrEqual(0);
        expect(m.fade).toBeLessThanOrEqual(1);
        expect(m.entersAt).toBeGreaterThan(t);
      }
    }
  });

  it('est déterministe', () => {
    expect(queueAt(9, 's', 123.4, MIN(1), true)).toEqual(queueAt(9, 's', 123.4, MIN(1), true));
  });

  it('garde l’identité d’une personne qui avance, et fait entrer le slot 0 toutes les 15 à 30 s', () => {
    const entries: number[] = [];
    let last = queueAt(5, 's', 0, MIN(1), true);
    for (let t = 0.5; t < 600; t += 0.5) {
      const q = queueAt(5, 's', t, MIN(1), true);
      if (q[0]!.id !== last[0]!.id) {
        entries.push(t);
        // l'ancien slot 1 est le nouveau slot 0
        expect(last[1]?.id).toBe(q[0]!.id);
      }
      last = q;
    }
    expect(entries.length).toBeGreaterThan(10);
    for (let i = 1; i < entries.length; i++) {
      const gap = entries[i]! - entries[i - 1]!;
      expect(gap).toBeGreaterThanOrEqual(14.5);
      expect(gap).toBeLessThanOrEqual(30.5);
    }
  });

  it('n’est jamais vide pendant l’ouverture, et compte 6 personnes au plus fort (0 h-2 h)', () => {
    for (const minutes of [MIN(23), MIN(23, 30), MIN(0), MIN(1), MIN(2, 30), MIN(4, 59)])
      for (let t = 0; t < 900; t += 13) expect(queueAt(4, 's', t, minutes, true).length, `${minutes} ${t}`).toBeGreaterThan(0);
    for (const minutes of [MIN(0, 5), MIN(1), MIN(1, 55)])
      for (let t = 0; t < 900; t += 13) expect(queueAt(4, 's', t, minutes, true)).toHaveLength(6);
  });

  it('reste continue à travers plusieurs fins de cycle de 64 entrées (ids, slots, instants d’entrée)', () => {
    const cycles = new Set<string>();
    let last = queueAt(11, 'club', 0, MIN(1), true);
    // ≈ 64 × 22,5 s ≈ 24 min par cycle : 6 500 s en traversent au moins trois.
    for (let t = 0.5; t < 6500; t += 0.5) {
      const q = queueAt(11, 'club', t, MIN(1), true);
      expect(q).toHaveLength(6);
      for (const m of q) cycles.add(m.id.split(':')[0]!);
      q.forEach((m, i) => {
        expect(m.slot).toBe(i);
        if (i > 0) expect(m.entersAt).toBeGreaterThan(q[i - 1]!.entersAt);
      });
      if (q[0]!.id === last[0]!.id) {
        // Personne n'est entré : même file, mêmes instants.
        expect(q.map((m) => m.id)).toEqual(last.map((m) => m.id));
        expect(q.map((m) => m.entersAt)).toEqual(last.map((m) => m.entersAt));
      } else {
        // Une seule entrée : tout le monde avance d'un cran, la tête est entrée à son instant prévu.
        expect(q.slice(0, 5).map((m) => m.id)).toEqual(last.slice(1).map((m) => m.id));
        expect(last[0]!.entersAt).toBeLessThanOrEqual(t);
        expect(last[0]!.entersAt).toBeGreaterThan(t - 0.5);
      }
      last = q;
    }
    expect(cycles.size).toBeGreaterThanOrEqual(4);
  });

  it('ne dépend pas de l’ordre des appels (débuts de cycle gardés en mémoire)', () => {
    const cold = queueAt(81, 'ordre', 4000, MIN(1), true);
    queueAt(81, 'ordre', 9000, MIN(1), true);
    queueAt(81, 'ordre', 10, MIN(1), true);
    expect(queueAt(81, 'ordre', 4000, MIN(1), true)).toEqual(cold);
  });

  it('diffère d’un local à l’autre', () => {
    const a = queueAt(3, 'shop-1', 300, MIN(1), true);
    const b = queueAt(3, 'shop-2', 300, MIN(1), true);
    expect(a.map((m) => m.entersAt)).not.toEqual(b.map((m) => m.entersAt));
  });

  it('est plus longue entre 0 h et 2 h qu’à 23 h 15', () => {
    const maxLen = (minutes: number): number => {
      let best = 0;
      for (let t = 0; t < 600; t += 5) best = Math.max(best, queueAt(2, 's', t, minutes, true).length);
      return best;
    };
    expect(maxLen(MIN(1))).toBeGreaterThan(maxLen(MIN(23, 15)));
  });
});

describe('cordon et videurs', () => {
  it('2 videurs seulement de 30 min avant l’ouverture à la fermeture', () => {
    expect(nightclubDoor(false, MIN(22, 29)).bouncers).toBe(0);
    expect(nightclubDoor(false, MIN(22, 30)).bouncers).toBe(2);
    expect(nightclubDoor(false, MIN(22, 59))).toEqual({ cordon: true, bouncers: 2 });
    expect(nightclubDoor(true, MIN(23))).toEqual({ cordon: true, bouncers: 2 });
    expect(nightclubDoor(true, MIN(4, 59)).bouncers).toBe(2);
    expect(nightclubDoor(false, MIN(5))).toEqual({ cordon: false, bouncers: 0 });
    expect(nightclubDoor(false, MIN(14))).toEqual({ cordon: false, bouncers: 0 });
  });
});

describe('arrivées de la file (queueArrivals)', () => {
  const T1 = 1;
  const layoutOf = (over: Partial<ArrivalLayout> = {}): ArrivalLayout => ({ doorX: 400, away: 1, startPx: 9, pitchPx: 6.5, max: 4, width: 720, doorXs: [], ...over });
  const visible = (t: number, max: number): string[] => queueAt(T1, 'club', t, MIN(1), true).slice(0, max).map((m) => m.id);
  // Premier instant (pas de 0,01 s) où quelqu'un rejoint la partie visible de la file après t0 : son id et l'instant J.
  const nextJoin = (t0: number, max: number): { id: string; at: number } => {
    let last = visible(t0, max);
    for (let t = t0 + 0.01; t < t0 + 200; t += 0.01) {
      const now = visible(t, max);
      const id = now.find((x) => !last.includes(x));
      if (id) return { id, at: t };
      last = now;
    }
    throw new Error('aucune arrivée');
  };

  it('depuis le bord du monde : hors champ dist/vitesse secondes avant J, à sa place à J, jamais dans la file pendant le trajet', () => {
    const L = layoutOf();
    const { id, at } = nextJoin(300, L.max);
    const speed = queueWalkSpeed(T1, 'club', id);
    expect(speed).toBeGreaterThanOrEqual(16 * WALK_PACE - 1e-9);
    expect(speed).toBeLessThanOrEqual(24 * WALK_PACE + 1e-9);
    const joinX = L.doorX + L.away * (L.startPx + L.max * L.pitchPx);
    const edge = L.width + WORLD_MARGIN;
    const D = (edge - joinX) / speed;
    const find = (t: number) => queueArrivals(T1, 'club', t, MIN(1), true, L).find((a) => a.id === id);
    expect(find(at - D - 0.05)).toBeUndefined();
    const start = find(at - D + 0.02)!;
    expect(start.fromDoor).toBe(false);
    expect(start.passage.stage).toBe('street');
    expect(start.passage.x).toBeGreaterThan(L.width + WORLD_MARGIN - 1);
    expect(start.passage.yaw).toBe(8); // vers la porte (−x)
    const end = find(at - 0.02)!;
    expect(Math.abs(end.passage.x - joinX)).toBeLessThan(0.5);
    expect(end.joinAt).toBeCloseTo(at, 1);
    expect(find(at + 0.02)).toBeUndefined();
    for (let t = at - D + 0.1; t < at - 0.02; t += 1) {
      expect(find(t)).toBeDefined();
      expect(visible(t, L.max)).not.toContain(id);
    }
  });

  it('bord trop loin (> MAX_TRIP_PX) : sort de l’entrée d’immeuble la plus proche du côté de la file, par le seuil puis un demi-tour', () => {
    const L = layoutOf({ width: 3000, doorXs: [100, 700, 900] });
    const { id, at } = nextJoin(300, L.max);
    const speed = queueWalkSpeed(T1, 'club', id);
    const joinX = L.doorX + L.away * (L.startPx + L.max * L.pitchPx);
    const D = (700 - joinX) / speed + THRESHOLD_S + TURN_S;
    const find = (t: number) => queueArrivals(T1, 'club', t, MIN(1), true, L).find((a) => a.id === id);
    expect(find(at - D - 0.05)).toBeUndefined();
    const sill = find(at - D + 0.05)!;
    expect(sill.fromDoor).toBe(true);
    expect(sill.fromX).toBe(700);
    expect(sill.passage.stage).toBe('threshold');
    expect(sill.passage.x).toBe(700);
    expect(find(at - D + THRESHOLD_S + 0.1)!.passage.stage).toBe('turn');
    expect(Math.abs(find(at - 0.02)!.passage.x - joinX)).toBeLessThan(0.5);
  });

  it('rien quand la boîte est fermée ; plusieurs personnes en route quand le trajet est long', () => {
    expect(queueArrivals(T1, 'club', 300, MIN(1), false, layoutOf())).toEqual([]);
    const far = queueArrivals(T1, 'club', 300, MIN(1), true, layoutOf({ doorX: 50, width: 560 }));
    expect(far.length).toBeGreaterThan(0);
    expect(new Set(far.map((a) => a.id)).size).toBe(far.length);
  });
});

describe('file visible et arrivées à travers un changement de minute (queueScene)', () => {
  const SEED2 = 6;
  const W2 = 720;
  const L = { doorX: 400, away: 1 as const, startPx: 9, pitchPx: 6.5, max: 6, width: W2, doorXs: [] as number[] };
  const placeOf = (pos: number, lay: ArrivalLayout = L): number => lay.doorX + lay.away * (lay.startPx + pos * lay.pitchPx);
  const lengthAt = (minutes: number): number => queueAt(SEED2, 'club', 100, minutes, true).length;
  // Première minute de la nuit où la longueur cible passe de `from` à une valeur plus petite (shrink) ou plus grande (grow).
  const boundary = (shrink: boolean): number => {
    for (let m = 23 * 60; m < 23 * 60 + 360; m++) {
      const a = lengthAt(m % 1440);
      const b = lengthAt((m + 1) % 1440);
      if (shrink ? b < a : b > a) return m % 1440;
    }
    throw new Error('pas de changement');
  };
  type Seen = { members: Map<string, number>; arrivals: Map<string, QueueArrival>; entered: string | null };
  const seen = (s: QueueScene): Seen => ({ members: new Map(s.members.map((m) => [m.id, m.pos])), arrivals: new Map(s.arrivals.map((a) => [a.id, a])), entered: s.entered?.id ?? null });
  // Personne n'apparaît ni ne disparaît sur place, d'une image (dt) à la suivante.
  const expectContinuous = (sceneAt: (t: number) => QueueScene, from: number, to: number, dt: number, lay: ArrivalLayout = L): void => {
    let a = seen(sceneAt(from));
    for (let t = from + dt; t < to; t += dt) {
      const b = seen(sceneAt(t));
      for (const [id, pos] of a.members) {
        if (b.members.has(id)) expect(Math.abs(b.members.get(id)! - pos), `${id} @${t}`).toBeLessThanOrEqual(dt / ADVANCE_S + 1e-6);
        else expect(b.entered, `${id} disparaît de la file @${t}`).toBe(id);
      }
      for (const [id, x] of a.arrivals) {
        const step = x.speed * dt + 1e-6;
        if (b.arrivals.has(id)) expect(Math.abs(b.arrivals.get(id)!.passage.x - x.passage.x), `${id} @${t}`).toBeLessThanOrEqual(step);
        else {
          expect(b.members.has(id), `${id} disparaît en route @${t}`).toBe(true);
          expect(Math.abs(placeOf(b.members.get(id)!, lay) - x.passage.x), `${id} rejoint sa place @${t}`).toBeLessThanOrEqual(step + 1);
        }
      }
      for (const id of b.members.keys()) if (!a.members.has(id)) expect(a.arrivals.has(id), `${id} apparaît dans la file @${t}`).toBe(true);
      for (const [id, x] of b.arrivals) {
        if (a.arrivals.has(id)) continue;
        expect(x.fromDoor ? x.passage.stage === 'threshold' : x.passage.x >= lay.width + WORLD_MARGIN - x.speed * dt - 1e-6, `${id} apparaît en pleine rue @${t}`).toBe(true);
      }
      a = b;
    }
  };

  it('sans changement de minute : même file que queueAt (places, avancée)', () => {
    // (t < ADVANCE_S : queueAt fait « avancer » la file depuis l'origine du cycle ; la scène, elle, la montre posée.)
    for (let t = 2; t < 300; t += 3.7) {
      const s = queueScene(SEED2, 'club', t, MIN(1), true, L);
      const q = queueAt(SEED2, 'club', t, MIN(1), true).slice(0, L.max);
      expect(s.members.map((m) => m.id)).toEqual(q.map((m) => m.id));
      s.members.forEach((m, i) => expect(m.pos).toBeCloseTo(i + 1 - q[i]!.fade, 9));
    }
  });

  it.each([true, false])('la longueur cible change à la minute (diminue : %s) : personne ne disparaît ni n’apparaît sur place', (shrink) => {
    const m0 = boundary(shrink);
    const m1 = (m0 + 1) % 1440;
    for (const tb of [131.3, 157.9, 203.2]) {
      const sceneAt = (t: number): QueueScene => (t < tb ? queueScene(SEED2, 'club', t, m0, true, L) : queueScene(SEED2, 'club', t, m1, true, L, { minutes: m0, open: true, since: tb }));
      expectContinuous(sceneAt, tb - 30, tb + 150, 0.1);
      // La file finit à la nouvelle longueur, sans que personne ne soit reparti : elle se vide (ou se remplit) par la porte et les arrivées.
      expect(queueScene(SEED2, 'club', tb + 200, m1, true, L, { minutes: m0, open: true, since: tb }).members).toHaveLength(lengthAt(m1));
    }
  });

  it('ouverture (fermée la minute d’avant) : la file se forme à pied, personne n’y est posé d’un coup', () => {
    const tb = 140.2;
    const m1 = MIN(23);
    const sceneAt = (t: number): QueueScene => (t < tb ? queueScene(SEED2, 'club', t, MIN(22, 59), false, L) : queueScene(SEED2, 'club', t, m1, true, L, { minutes: MIN(22, 59), open: false, since: tb }));
    expect(sceneAt(tb).members).toEqual([]);
    expectContinuous(sceneAt, tb - 5, tb + 120, 0.1);
    expect(sceneAt(tb + 120).members.length).toBeGreaterThan(0);
  });
  it('trajets de plus d’une minute : la minute suivante (même longueur) garde le plan mêlé ; il s’efface sans saut quand il ne compte plus', () => {
    const far: ArrivalLayout = { ...L, width: 1400 };
    for (const shrink of [true, false]) {
      const m0 = boundary(shrink);
      const m1 = (m0 + 1) % 1440;
      expect(lengthAt((m1 + 1) % 1440)).toBe(lengthAt(m1));
      const tb = 171.6;
      const prev = { minutes: m0, open: true, since: tb };
      // Règle de la vue : la minute d'avant (prev) n'est remplacée que si la longueur cible (ou l'ouverture) change ; la minute m1 + 1 le garde.
      const sceneAt = (t: number): QueueScene =>
        t < tb ? queueScene(SEED2, 'club', t, m0, true, far) : queueScene(SEED2, 'club', t, t < tb + 60 ? m1 : (m1 + 1) % 1440, true, far, prev);
      expectContinuous(sceneAt, tb - 10, tb + 480, 0.25, far);
    }
  });
});
