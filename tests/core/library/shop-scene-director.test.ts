import { describe, expect, it } from 'vitest';
import { direct } from '../../../src/core/library/city/shops/scene/director';
import { castFor } from '../../../src/core/library/city/shops/scene/cast';
import { MOVES, type MoveId } from '../../../src/core/library/city/shops/scene/moves';
import { SLOT_S, STEP, inScene } from '../../../src/core/library/city/shops/scene/slots';
import { PLACE, ghibliPostOf, stageFor } from '../../../src/core/library/city/shops/scene/stage';
import type { Segment } from '../../../src/core/library/city/shops/scene/types';
import { SHOP_TYPE_IDS, type ShopTypeId } from '../../../src/core/library/city/shops/catalog';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { outfitFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';

const slot = shopSlotsFor(720, 340, 9)[0]!;
const frame = shopFrame(slot, 238);
const rng = mulberry32(1);
const staff = [{ id: 'A', outfit: outfitFor('ordinary', rng), present: [0, 9999] as [number, number] }];
const NO_STREET = { rainFrom: null, paradeFrom: null, busAt: [] };
const run = (type: ShopTypeId, index: number, gate = 1) => {
  const key = { seed: 9, slotId: slot.id, type, day: 20738, index };
  return direct({ key, frame, staff, parties: castFor({ ...key, gate, capacity: 4, dayMinutesAtStart: 480 }), street: NO_STREET });
};
const posAt = (segs: { t0: number; t1: number; x0: number; x1: number }[], t: number) => {
  const s = segs.find((g) => t >= g.t0 && t < g.t1);
  return s ? s.x0 + (s.x1 - s.x0) * ((t - s.t0) / Math.max(1e-9, s.t1 - s.t0)) : null;
};

describe('metteur en scène', () => {
  it('même graine → même partition', () => expect(run('bakery', 7)).toEqual(run('bakery', 7)));
  it('tout client entré ressort avant la fin du créneau', () => {
    for (let i = 0; i < 100; i++) for (const tr of run('bakery', i).tracks) if (tr.role === 'customer' && tr.enter !== null) {
      expect(tr.exit).not.toBeNull();
      expect(tr.exit!).toBeLessThanOrEqual(SLOT_S('bakery'));
    }
  });
  it('segments contigus, sans téléportation', () => {
    for (let i = 0; i < 40; i++) for (const tr of run('bookshop', i).tracks) {
      for (let k = 1; k < tr.segments.length; k++) {
        expect(tr.segments[k]!.t0).toBeCloseTo(tr.segments[k - 1]!.t1, 6);
        expect(Math.abs(tr.segments[k]!.x0 - tr.segments[k - 1]!.x1)).toBeLessThan(1e-6);
      }
      for (const s of tr.segments) expect(Math.abs(s.x1 - s.x0) / Math.max(STEP, s.t1 - s.t0)).toBeLessThan(12);
    }
  });
  it('un employé ne sert qu’un parti à la fois', () => {
    for (let i = 0; i < 60; i++) {
      const sc = run('bakery', i);
      const serving = sc.log.filter((l) => l.includes('→ accueille'));
      expect(serving.length).toBeLessThanOrEqual(sc.tracks.filter((t) => t.role === 'customer').length);
      const st = sc.tracks.find((t) => t.role === 'staff')!;
      for (let k = 1; k < st.segments.length; k++) expect(st.segments[k]!.t0).toBeGreaterThanOrEqual(st.segments[k - 1]!.t0);
    }
  });
  it('boutique vide : l’employé a des activités variées, pas une seule boucle', () => {
    const sc = run('bakery', 3, 0);
    const moves = new Set(sc.tracks[0]!.segments.map((s) => s.move));
    expect(moves.size).toBeGreaterThanOrEqual(3);
  });
  it('pictos rares', () => {
    for (let i = 0; i < 60; i++) {
      const sc = run('bar', i);
      for (const tr of sc.tracks) {
        const ts = tr.segments.filter((s) => s.picto).map((s) => s.t0);
        for (let k = 1; k < ts.length; k++) expect(ts[k]! - ts[k - 1]!).toBeGreaterThanOrEqual(8);
      }
    }
  });
  it("le rideau qui baisse (staff absent en fin) : personne n'entre sans employé", () => {
    const key = { seed: 9, slotId: slot.id, type: 'bakery' as const, day: 20738, index: 5 };
    const sc = direct({ key, frame, staff: [{ ...staff[0]!, present: [0, 60] }], parties: castFor({ ...key, gate: 1, capacity: 4, dayMinutesAtStart: 480 }), street: NO_STREET });
    for (const tr of sc.tracks) if (tr.role === 'customer' && tr.enter !== null) expect(tr.enter).toBeLessThan(60);
  });
  it('vitrine étroite : pas de chevauchement de clients', () => {
    const narrow = { ...frame, window: { ...frame.window, w: 30 } };
    const key = { seed: 9, slotId: slot.id, type: 'bakery' as const, day: 20738, index: 9 };
    const sc = direct({ key, frame: narrow, staff, parties: castFor({ ...key, gate: 1, capacity: 1, dayMinutesAtStart: 480 }), street: NO_STREET });
    const cust = sc.tracks.filter((t) => t.role === 'customer');
    for (let t = 0; t < SLOT_S('bakery'); t += 1) {
      const xs = cust.map((c) => posAt(c.segments, t)).filter((x): x is number => x !== null && x >= 0 && x <= 30).sort((a, b) => a - b);
      for (let k = 1; k < xs.length; k++) expect(xs[k]! - xs[k - 1]!).toBeGreaterThan(2);
    }
  });

  // ---- Compléments (invariants de la spec §3.4) ----
  const narrow = { ...frame, window: { ...frame.window, w: 30 } };
  it('vitrine étroite, forte affluence : jamais deux silhouettes l’une sur l’autre', () => {
    for (let i = 0; i < 40; i++) {
      const key = { seed: 9, slotId: slot.id, type: 'bakery' as const, day: 20738, index: i };
      const sc = direct({ key, frame: narrow, staff, parties: castFor({ ...key, gate: 1, capacity: 4, dayMinutesAtStart: 480 }), street: NO_STREET });
      const cust = sc.tracks.filter((t) => t.role === 'customer');
      for (let t = 0; t < SLOT_S('bakery'); t += 0.5) {
        const xs = cust.map((c) => posAt(c.segments, t)).filter((x): x is number => x !== null && x >= 0 && x <= 30).sort((a, b) => a - b);
        for (let k = 1; k < xs.length; k++) expect(xs[k]! - xs[k - 1]!).toBeGreaterThan(2);
      }
    }
  });
  it('aucun type de la scène ne plante, et chaque partition respecte le créneau', () => {
    for (const type of SHOP_TYPE_IDS.filter(inScene)) for (let i = 0; i < 6; i++) {
      const sc = run(type, i);
      const L = SLOT_S(type);
      expect(sc.length).toBe(L);
      for (const tr of sc.tracks) {
        for (const s of tr.segments) expect(s.t1).toBeLessThanOrEqual(L + 1e-6);
        if (tr.role === 'customer' && tr.enter !== null) expect(tr.exit!).toBeLessThanOrEqual(L);
      }
    }
  });
  it('un objet n’apparaît jamais de nulle part : un geste qui commence objet en main suit une prise', () => {
    const POCKET: ReadonlySet<string> = new Set(['drop-coin', 'take-order', 'read-idle']);
    for (const type of ['bakery', 'bookshop', 'bar', 'grocery', 'laundry', 'restaurant', 'hairdresser'] as const) for (let i = 0; i < 30; i++) {
      for (const tr of run(type, i).tracks) tr.segments.forEach((s: Segment, k) => {
        const m = s.move in MOVES ? MOVES[s.move as MoveId] : null;
        if (!m?.prop || m.prop.from > 0 || POCKET.has(s.move)) return;
        expect(k, `${type} ${tr.id} ${s.move}`).toBeGreaterThan(0);
        expect(tr.segments[k - 1]!.prop, `${type} ${tr.id} ${s.move} après ${tr.segments[k - 1]!.move}`).not.toBeNull();
      });
    }
  });
  it('boutique au repos aux bornes : employé au poste au début et à la fin', () => {
    const st = stageFor('bakery', frame);
    for (let i = 0; i < 30; i++) {
      const tr = run('bakery', i).tracks.find((t) => t.role === 'staff')!;
      expect(tr.segments[0]!.t0).toBe(0);
      expect(tr.segments[0]!.x0).toBeCloseTo(st.posts[0]!, 6);
      expect(tr.segments[tr.segments.length - 1]!.t1).toBeCloseTo(SLOT_S('bakery'), 6);
      expect(tr.segments[tr.segments.length - 1]!.x1).toBeCloseTo(st.posts[0]!, 6);
    }
  });
  it('l’accueil est journalisé et suivi d’un service', () => {
    const logs = Array.from({ length: 30 }, (_, i) => run('bakery', i).log).flat();
    expect(logs.some((l) => l.includes('→ accueille'))).toBe(true);
    expect(logs.every((l) => /^\d+ s /.test(l))).toBe(true);
  });
  it('les caractères changent la scène (pas deux créneaux identiques)', () => {
    const shapes = new Set(Array.from({ length: 20 }, (_, i) => run('bakery', i).tracks.map((t) => t.segments.map((s) => s.move).join(',')).join('|')));
    expect(shapes.size).toBeGreaterThan(15);
  });
  it("employé qui prend son poste en cours de créneau : il sort de l'arrière-boutique, personne n'entre avant", () => {
    for (let i = 0; i < 30; i++) {
      const key = { seed: 9, slotId: slot.id, type: 'bakery' as const, day: 20738, index: i };
      const sc = direct({ key, frame, staff: [{ ...staff[0]!, present: [100, 9999] }], parties: castFor({ ...key, gate: 1, capacity: 4, dayMinutesAtStart: 480 }), street: NO_STREET });
      const st = sc.tracks.find((t) => t.role === 'staff')!;
      expect(st.enter).toBe(100);
      expect(st.segments[0]!.t0).toBe(100);
      for (const tr of sc.tracks) if (tr.role === 'customer' && tr.enter !== null) expect(tr.enter).toBeGreaterThanOrEqual(95);
    }
  });
});

describe('géométrie intérieure', () => {
  const wide = { ...frame, sign: { ...frame.sign, w: 62 }, window: { ...frame.window, w: 55 } };
  it('poste principal = celui du dessin Ghibli', () => {
    const st = stageFor('bakery', wide);
    expect(st.posts[0]).toBeCloseTo(ghibliPostOf('bakery', 62, wide.door.x > wide.window.x ? 'left' : 'right'), 6);
    expect(st.doorEdge).toBe(wide.door.x > wide.window.x ? 'right' : 'left');
  });
  it('file côté porte, places espacées d’une silhouette, dans la vitrine', () => {
    const st = stageFor('bakery', wide);
    expect(st.queue.length).toBeGreaterThan(1);
    for (let k = 1; k < st.queue.length; k++) expect(Math.abs(st.queue[k]! - st.queue[k - 1]!)).toBeGreaterThanOrEqual(PLACE - 1e-9);
    for (const x of [...st.queue, ...st.posts, ...st.spots, st.back, ...st.window]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(55);
    }
    // La tête de file est la plus proche du comptoir, la queue la plus proche de la porte.
    const doorX = st.doorEdge === 'left' ? 0 : 55;
    expect(Math.abs(st.queue[st.queue.length - 1]! - doorX)).toBeLessThan(Math.abs(st.queue[0]! - doorX));
  });
  it('vitrine étroite : pas de file intérieure ; tables et fauteuils pour leurs familles', () => {
    expect(stageFor('bakery', { ...frame, window: { ...frame.window, w: 30 } }).queue).toEqual([]);
    expect(stageFor('restaurant', wide).tables.length).toBeGreaterThan(0);
    expect(stageFor('hairdresser', wide).chairs.length).toBeGreaterThan(0);
    expect(stageFor('bar', wide).spots.length).toBeGreaterThan(2);
  });
});
