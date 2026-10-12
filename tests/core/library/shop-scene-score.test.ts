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
  it('clé stable', () => expect(scoreKey({ seed: 1, slotId: 's', type: 'bakery', day: 2, index: 3 })).toBe('1|s|bakery|2|3'));
});

// Partition fabriquée : un employé (pas d'entrée ni de sortie) et un client.
const seg = (s: Partial<Segment> & Pick<Segment, 't0' | 't1' | 'move'>): Segment => ({ x0: 0, x1: 0, yaw0: 0, yaw1: 0, prop: null, picto: null, seed: 1, ...s });
const make = (staff: Segment[], client: Segment[], o: { enter?: number | null; exit?: number | null; scale?: number } = {}): Score => ({
  key: 'k', start: 0, length: 240, log: [],
  tracks: [
    { id: 'staff:a', role: 'staff', outfit: {} as never, scale: 1, party: null, enter: null, exit: null, segments: staff },
    { id: 'p:0', role: 'customer', outfit: {} as never, scale: o.scale ?? 1, party: 'p', enter: o.enter === undefined ? 0 : o.enter, exit: o.exit === undefined ? 240 : o.exit, segments: client },
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
          if (s.move === 'sit') sitting = true;
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
    for (const m of ['nod', 'look-mirror', 'eat']) expect(gestures).toContain(m);
  });
});
