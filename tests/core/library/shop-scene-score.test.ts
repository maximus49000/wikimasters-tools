import { describe, expect, it } from 'vitest';
import { ScoreCache, actorsAt, scoreKey } from '../../../src/core/library/city/shops/scene/score';
import type { Score, Segment } from '../../../src/core/library/city/shops/scene/types';
import { direct } from '../../../src/core/library/city/shops/scene/director';
import { castFor } from '../../../src/core/library/city/shops/scene/cast';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { outfitFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';
import { INSIDE_SCALE } from '../../../src/core/library/city/shops/customers';
import { phaseIndexOf } from '../../../src/core/library/figure/gait';
import { MOVES, type MoveId } from '../../../src/core/library/city/shops/scene/moves';
import { begin, type Actor, type World } from '../../../src/core/library/city/shops/scene/engine';

const score = { key: 'k', start: 0, length: 240, log: [], tracks: [{ id: 'p:0', role: 'customer', outfit: {} as never, scale: 1, party: 'p', enter: 10, exit: 50, segments: [
  { t0: 10, t1: 20, move: 'walk', x0: 0, x1: 10, yaw0: 0, yaw1: 0, prop: null, picto: null, seed: 1 },
  { t0: 20, t1: 50, move: 'wait', x0: 10, x1: 10, yaw0: 2, yaw1: 2, prop: null, picto: 'question', seed: 1 },
] }] } as unknown as Score;

describe('lecture des partitions', () => {
  it('interpole la marche', () => {
    const [a] = actorsAt(score, 15);
    expect(a!.where).toBe('inside');
    expect(a!.x).toBeCloseTo(5);
    expect(a!.gait).toBe('walk');
  });
  it('dans la rue avant l’entrée et après la sortie', () => {
    expect(actorsAt(score, 5)[0]!.where).toBe('street-in');
    expect(actorsAt(score, 60)[0]!.where).toBe('street-out');
  });
  it('picto avec son âge', () => expect(actorsAt(score, 20.5)[0]!.picto).toEqual({ id: 'question', age: 0.5 }));
  it('cache LRU : même objet pour la même clé, borne respectée', () => {
    const c = new ScoreCache(2);
    let made = 0;
    const mk = () => (made++, score);
    c.get('a', mk); c.get('a', mk); c.get('b', mk); c.get('c', mk);
    expect(made).toBe(3);
    expect(c.size()).toBe(2);
  });
  it('cache LRU : la clé relue survit, la moins récemment lue est oubliée (pas un FIFO)', () => {
    const c = new ScoreCache(2);
    const made: string[] = [];
    const mk = (k: string) => () => (made.push(k), score);
    c.get('a', mk('a')); c.get('b', mk('b')); c.get('a', mk('a')); c.get('c', mk('c'));
    c.get('a', mk('a'));
    expect(made).toEqual(['a', 'b', 'c']);
    c.get('b', mk('b'));
    expect(made).toEqual(['a', 'b', 'c', 'b']);
  });
  it('clé stable', () => expect(scoreKey({ seed: 1, slotId: 's', type: 'bakery', day: 2, index: 3 })).toBe('1|s|bakery|2|3'));
});

// Partition fabriquée : un employé (pas d'entrée ni de sortie) et un client.
const seg = (s: Partial<Segment> & Pick<Segment, 't0' | 't1' | 'move'>): Segment => ({ x0: 0, x1: 0, yaw0: 0, yaw1: 0, prop: null, picto: null, seed: 1, ...s });
const make = (staff: Segment[], client: Segment[], o: { enter?: number | null; exit?: number | null; scale?: number; arriveAt?: number; dir?: 1 | -1 } = {}): Score => ({
  key: 'k', start: 0, length: 240, log: [],
  tracks: [
    { id: 'staff:a', role: 'staff', outfit: {} as never, scale: 1, party: null, enter: null, exit: null, arriveAt: null, dir: null, segments: staff },
    { id: 'p:0', role: 'customer', outfit: {} as never, scale: o.scale ?? 1, party: 'p', enter: o.enter === undefined ? 0 : o.enter, exit: o.exit === undefined ? 240 : o.exit, arriveAt: o.arriveAt ?? 0, dir: o.dir ?? 1, segments: client },
  ],
});

describe('lecture des partitions : poses, allure, objets', () => {
  it('poses du geste par keyAtTime ; marche, demi-tour, station debout', () => {
    const sc = make([seg({ t0: 0, t1: 240, move: 'idle' })], [
      seg({ t0: 0, t1: 2, move: 'greet' }), seg({ t0: 2, t1: 2.45, move: 'turn', yaw0: 0, yaw1: 4 }), seg({ t0: 2.45, t1: 10, move: 'walk', x0: 0, x1: 20, yaw0: 4, yaw1: 4 }),
    ]);
    const [s, c] = actorsAt(sc, 0.1);
    expect(s).toMatchObject({ role: 'staff', where: 'inside', gait: 'stand', arms: 'down' });
    expect(c).toMatchObject({ gait: 'stand', arms: 'wave', lean: 0 });
    expect(actorsAt(sc, 1)[1]).toMatchObject({ arms: 'down', lean: 1 });
    expect(actorsAt(sc, 2.2)[1]).toMatchObject({ gait: 'step', arms: 'down' });
    expect(actorsAt(sc, 5)[1]).toMatchObject({ gait: 'walk', arms: 'swing', yaw: 4 });
  });
  it('demi-tour : l’orientation passe par le plus court chemin sur l’anneau des 16 crans', () => {
    const sc = make([], [seg({ t0: 0, t1: 1, move: 'turn', yaw0: 14, yaw1: 2 })]);
    expect(actorsAt(sc, 0)[1]!.yaw).toBe(14);
    expect(actorsAt(sc, 0.5)[1]!.yaw).toBe(0);
    expect(actorsAt(sc, 1)[1]!.yaw).toBe(2);
  });
  it('phase de marche : distance / (INSIDE_SCALE × taille), continue d’un segment de marche au suivant', () => {
    const sc = make([], [seg({ t0: 0, t1: 4, move: 'walk', x0: 0, x1: 8 }), seg({ t0: 4, t1: 8, move: 'walk', x0: 8, x1: 16 })], { scale: 0.8 });
    const k = INSIDE_SCALE * 0.8;
    expect(actorsAt(sc, 3)[1]!.phase).toBe(phaseIndexOf(6 / k));
    expect(actorsAt(sc, 6)[1]!.phase).toBe(phaseIndexOf(12 / k));
  });
  it('assis : allure assise pour un geste sans allure, accroupi conservé', () => {
    const sc = make([], [seg({ t0: 0, t1: 2, move: 'nod', seated: true }), seg({ t0: 2, t1: 5, move: 'pick-coin', seated: true }), seg({ t0: 5, t1: 8, move: 'nod' })]);
    expect(actorsAt(sc, 1)[1]!.gait).toBe('seated');
    expect(actorsAt(sc, 2 + 0.3 * 3)[1]!.gait).toBe('crouch');
    expect(actorsAt(sc, 6)[1]!.gait).toBe('stand');
  });
  it('picto : au moment du geste où il prend, pendant 1 s', () => {
    // chin-think : picto `question` à 0,2 du geste.
    const sc = make([], [seg({ t0: 10, t1: 15, move: 'chin-think', picto: 'question' })]);
    expect(actorsAt(sc, 10.5)[1]!.picto).toBeNull();
    expect(actorsAt(sc, 11.25)[1]!.picto).toEqual({ id: 'question', age: 0.25 });
    expect(actorsAt(sc, 12.5)[1]!.picto).toBeNull();
  });
  it('monture portée hors de la fenêtre d’objet après l’essayage, en main dedans, jamais portée par l’employé', () => {
    const sc = make([seg({ t0: 0, t1: 2, move: 'offer-frames', prop: 'frames' })], [
      seg({ t0: 0, t1: 2, move: 'take-item', prop: 'frames' }), seg({ t0: 2, t1: 6, move: 'try-frames', prop: 'frames' }),
      seg({ t0: 6, t1: 9, move: 'look-mirror', prop: 'frames' }), seg({ t0: 9, t1: 11, move: 'put-down', prop: 'frames' }),
    ]);
    expect(actorsAt(sc, 0.1)[0]).toMatchObject({ prop: 'frames', worn: false });
    expect(actorsAt(sc, 0.1)[1]).toMatchObject({ prop: 'frames', worn: false });
    expect(actorsAt(sc, 2 + 0.2 * 4)[1]!.worn).toBe(false);
    expect(actorsAt(sc, 2 + 0.5 * 4)[1]!.worn).toBe(true);
    expect(actorsAt(sc, 7)[1]).toMatchObject({ prop: 'frames', worn: true });
    expect(actorsAt(sc, 9.5)[1]!.worn).toBe(false);
    expect(actorsAt(sc, 10.5)[1]!.worn).toBe(false);
  });
  it('rue : rebroussé à la porte (sans entrée) ; employé hors scène avant son arrivée', () => {
    const sc = make([seg({ t0: 100, t1: 240, move: 'idle' })], [], { enter: null, exit: 30 });
    sc.tracks[0]!.enter = 100;
    expect(actorsAt(sc, 10)[1]!.where).toBe('street-in');
    expect(actorsAt(sc, 40)[1]!.where).toBe('street-out');
    expect(actorsAt(sc, 50)[0]!.where).toBe('none');
    expect(actorsAt(sc, 150)[0]!.where).toBe('inside');
    expect(actorsAt(sc, 150)[1]).toMatchObject({ enterAt: null, exitAt: 30, party: 'p' });
  });
  it('contrat de la rue : arrivée à la porte et sens de marche, pour qui entre, rebrousse chemin ou passe', () => {
    // Entre : arrive à la porte à 20 s (venant de la gauche), attend jusqu'à 25 s, entre, ressort à 60 s.
    const enters = make([], [seg({ t0: 25, t1: 60, move: 'idle' })], { arriveAt: 20, dir: 1, enter: 25, exit: 60 });
    expect(actorsAt(enters, 10)[1]).toMatchObject({ where: 'street-in', arriveAt: 20, dir: 1, enterAt: 25 });
    expect(actorsAt(enters, 22)[1]!.where).toBe('street-in');
    expect(actorsAt(enters, 30)[1]!.where).toBe('inside');
    expect(actorsAt(enters, 70)[1]).toMatchObject({ where: 'street-out', arriveAt: 20, dir: 1, exitAt: 60 });
    // Rebrousse chemin : attend devant la porte de 20 à 50 s, repart d'où il vient.
    const back = make([], [], { arriveAt: 20, dir: -1, enter: null, exit: 50 });
    expect(actorsAt(back, 30)[1]).toMatchObject({ where: 'street-in', arriveAt: 20, dir: -1, enterAt: null, exitAt: 50 });
    expect(actorsAt(back, 55)[1]!.where).toBe('street-out');
    // Passe : arrivée à la porte à 20 s, continue dans le même sens.
    const past = make([], [], { arriveAt: 20, dir: 1, enter: null, exit: null });
    for (const t of [5, 20, 80]) expect(actorsAt(past, t)[1]).toMatchObject({ where: 'street-in', arriveAt: 20, dir: 1, enterAt: null, exitAt: null });
    // Employé : ni arrivée ni sens.
    expect(actorsAt(past, 5)[0]).toMatchObject({ arriveAt: null, dir: null });
  });
  it('employé : sur le plancher seulement quand un segment couvre l’instant (plusieurs passages possibles)', () => {
    const sc = make([seg({ t0: 10, t1: 30, move: 'idle' }), seg({ t0: 80, t1: 120, move: 'idle' })], []);
    sc.tracks[0]!.enter = 10;
    sc.tracks[0]!.exit = 120;
    expect(actorsAt(sc, 5)[0]!.where).toBe('none');
    expect(actorsAt(sc, 20)[0]!.where).toBe('inside');
    expect(actorsAt(sc, 50)[0]!.where).toBe('none');
    expect(actorsAt(sc, 100)[0]!.where).toBe('inside');
    expect(actorsAt(sc, 130)[0]!.where).toBe('none');
  });
});

// Le metteur en scène marque `seated` tout le temps où le client occupe un siège (fauteuil, chaise d'attente, table).
describe('assis au fauteuil et à table', () => {
  const slot = shopSlotsFor(720, 340, 9)[0]!;
  const frame = { ...shopFrame(slot, 238), window: { ...shopFrame(slot, 238).window, w: 90 } };
  const rng = mulberry32(2);
  const two = [
    { id: 'A', outfit: outfitFor('ordinary', rng), present: [0, 9999] as [number, number] },
    { id: 'B', outfit: outfitFor('ordinary', rng), present: [0, 9999] as [number, number] },
  ];
  const NO_STREET = { rainFrom: null, paradeFrom: null, busAt: [] };
  it('entre l’assise et le lever, chaque segment est assis ; les gestes sans allure y sont lus assis', () => {
    const gestures = new Set<string>();
    for (const type of ['hairdresser', 'tattoo', 'restaurant'] as const) for (let i = 0; i < 12; i++) {
      const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
      const sc = direct({ key, frame, staff: two, parties: castFor({ ...key, gate: 1, capacity: 6, dayMinutesAtStart: 750 }), street: NO_STREET });
      for (const t of sc.tracks.filter((u) => u.role === 'customer')) {
        let sitting = false;
        t.segments.forEach((s, j) => {
          // Il se lève pour marcher : la marche, et le demi-tour qui la précède, se font debout.
          const up = s.move === 'walk' || (s.move === 'turn' && t.segments[j + 1]?.move === 'walk');
          // Assis dès le premier segment : `sit`, ou un geste à pose assise (menu, repas, bac, grimace), même sans `sit` avant.
          if (s.move === 'sit' || seatedKey(s.move)) sitting = true;
          if (up) sitting = false;
          if (sitting) expect(s.seated, `${type} ${i} ${t.id} ${s.move} @${s.t0}`).toBe(true);
          if (up) expect(s.seated).toBeUndefined();
          if (!sitting || s.move === 'pick-coin') return;
          const mid = (s.t0 + s.t1) / 2;
          expect(actorsAt(sc, mid).find((v) => v.id === t.id)!.gait, `${type} ${s.move}`).toBe('seated');
          gestures.add(s.move);
        });
      }
    }
    for (const m of ['nod', 'look-mirror', 'eat', 'read-menu', 'lie-back']) expect(gestures).toContain(m);
  });
  it('un geste à pose assise sans `sit` avant assoit l’acteur dès son premier segment, la marche le relève', () => {
    const w = { t: 0, closing: 999, pictos: [], rng: () => 0.5 } as unknown as World;
    const a = {
      id: 'p:0', track: { id: 'p:0', role: 'customer', outfit: {} as never, scale: 1, party: 'p', enter: 0, exit: null, arriveAt: 0, dir: 1, segments: [] },
      x: 10, yaw: 0, carried: null, free: 0, rest: 0, pending: [], chain: true, fill: 'idle', soft: null, lastFill: false, seated: false,
      pictoAt: -99, pictoT0: -99, active: true, deadline: 999, staff: null, party: null, member: 0,
    } as unknown as Actor;
    begin(w, a, { move: 'nod' });
    begin(w, a, { move: 'lie-back' });
    begin(w, a, { move: 'nod' });
    begin(w, a, { move: 'walk', to: 30 });
    expect(a.track.segments.map((g) => [g.move, g.seated ?? false])).toEqual([['nod', false], ['lie-back', true], ['nod', true], ['walk', false]]);
  });
});

const seatedKey = (m: string): boolean => m in MOVES && MOVES[m as MoveId].keys.some((k) => k.gait === 'seated');

describe('partitions du metteur en scène : rue et employés', () => {
  const slot = shopSlotsFor(720, 340, 9)[0]!;
  const frame = { ...shopFrame(slot, 238), window: { ...shopFrame(slot, 238).window, w: 90 } };
  const rng = mulberry32(2);
  const two = [
    { id: 'A', outfit: outfitFor('ordinary', rng), present: [0, 9999] as [number, number] },
    { id: 'B', outfit: outfitFor('ordinary', rng), present: [0, 9999] as [number, number] },
  ];
  const NO_STREET = { rainFrom: null, paradeFrom: null, busAt: [] };
  // `late` : un seul employé, qui prend son poste à 120 s (les premiers arrivés, personne pour servir, passent leur chemin).
  const late = [{ id: 'A', outfit: two[0]!.outfit, present: [120, 9999] as [number, number] }];
  const run = (type: 'bakery' | 'hairdresser', i: number, capacity = 6, staff = two) => {
    const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
    const parties = castFor({ ...key, gate: 1, capacity, dayMinutesAtStart: 750 });
    return { parties, sc: direct({ key, frame, staff, parties, street: NO_STREET }) };
  };
  it('chaque piste de client porte l’arrivée à la porte et le sens de son parti ; entrée et sortie après l’arrivée', () => {
    const kinds = new Set<string>();
    for (const type of ['bakery', 'hairdresser'] as const) for (let i = 0; i < 30; i++) {
      const { parties, sc } = run(type, i, type === 'bakery' ? 8 : 6, i % 3 === 0 ? late : two);
      for (const t of sc.tracks) {
        if (t.role === 'staff') {
          expect([t.arriveAt, t.dir]).toEqual([null, null]);
          continue;
        }
        const p = parties.find((q) => q.id === t.party)!;
        expect([t.arriveAt, t.dir]).toEqual([p.arriveAt, p.dir]);
        if (t.enter !== null) expect(t.enter).toBeGreaterThanOrEqual(p.arriveAt - 1e-9);
        if (t.exit !== null) expect(t.exit).toBeGreaterThanOrEqual(p.arriveAt - 1e-9);
        kinds.add(t.enter !== null ? 'entre' : t.exit !== null ? 'rebrousse' : 'passe');
      }
    }
    expect([...kinds].sort()).toEqual(['entre', 'passe', 'rebrousse']);
  });
  it('employé : un seul passage sur le plancher (renfort appelé une fois), segments contigus entre entrée et sortie', () => {
    let recalled = 0;
    for (let i = 0; i < 60; i++) for (const t of run('bakery', i, 8).sc.tracks.filter((u) => u.role === 'staff')) {
      const g = t.segments;
      if (!g.length) continue;
      for (let j = 1; j < g.length; j++) expect(Math.abs(g[j]!.t0 - g[j - 1]!.t1)).toBeLessThan(1e-6);
      if (t.enter !== null) expect(g[0]!.t0).toBeCloseTo(t.enter, 6);
      if (t.exit !== null) expect(g[g.length - 1]!.t1).toBeCloseTo(t.exit, 6);
      if (t.enter !== null && t.exit !== null) recalled++;
    }
    expect(recalled).toBeGreaterThan(0);
  });
});
