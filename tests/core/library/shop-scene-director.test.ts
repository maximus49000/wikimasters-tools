import { describe, expect, it } from 'vitest';
import { direct } from '../../../src/core/library/city/shops/scene/director';
import { castFor } from '../../../src/core/library/city/shops/scene/cast';
import { MOVES, type MoveId } from '../../../src/core/library/city/shops/scene/moves';
import { SLOT_S, STEP, inScene } from '../../../src/core/library/city/shops/scene/slots';
import { PLACE, ghibliPostOf, stageFor } from '../../../src/core/library/city/shops/scene/stage';
import type { Segment } from '../../../src/core/library/city/shops/scene/types';
import { SHOP_TYPE_IDS, type ShopTypeId } from '../../../src/core/library/city/shops/catalog';
import { SHOP_FAMILY } from '../../../src/core/library/city/shops/gestures';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { outfitFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';

const slot = shopSlotsFor(720, 340, 9)[0]!;
const frame = shopFrame(slot, 238);
const rng = mulberry32(1);
const staff = [{ id: 'A', outfit: outfitFor('ordinary', rng), present: [0, 9999] as [number, number] }];
const NO_STREET = { rainFrom: null, paradeFrom: null, busAt: [] };
const wide = { ...frame, sign: { ...frame.sign, w: 62 }, window: { ...frame.window, w: 55 } };
const run = (type: ShopTypeId, index: number, gate = 1) => {
  const key = { seed: 9, slotId: slot.id, type, day: 20738, index };
  return direct({ key, frame, staff, parties: castFor({ ...key, gate, capacity: 4, dayMinutesAtStart: 480 }), street: NO_STREET });
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
  it('services d’un même employé : jamais deux ouverts en même temps (accueil → « a fini avec »)', () => {
    const two = [staff[0]!, { id: 'B', outfit: staff[0]!.outfit, present: [0, 9999] as [number, number] }];
    let services = 0;
    for (const type of ['bakery', 'bar', 'bookshop', 'restaurant'] as const) for (let i = 0; i < 40; i++) for (const crew of [staff, two]) {
      const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
      const sc = direct({ key, frame: wide, staff: crew, parties: castFor({ ...key, gate: 1, capacity: 6, dayMinutesAtStart: 480 }), street: NO_STREET });
      const labels = [...new Set(sc.log.map((l) => / — (\S+(?: [AB])?) (?:libre|→|indique)/.exec(l)?.[1]).filter((x): x is string => !!x))];
      for (const label of labels) {
        let open = 0;
        for (const l of sc.log) {
          if (l.includes(` — ${label} libre`) || l.includes(` — ${label} →`) || l.includes(` — ${label} indique`)) {
            expect(open, l).toBe(0);
            open++;
            services++;
          } else if (l.replace(/^\d+ s /, '').startsWith(`${label} a fini avec`)) {
            expect(open, l).toBe(1);
            open--;
          }
        }
        expect(open).toBe(0);
      }
    }
    expect(services).toBeGreaterThan(100);
  });
  it('boutique vide : l’employé a des activités variées, pas une seule boucle', () => {
    const sc = run('bakery', 3, 0);
    const moves = new Set(sc.tracks[0]!.segments.map((s) => s.move).filter((m) => m !== 'walk' && m !== 'turn' && m !== 'idle'));
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
  // Règle (contrôleur) : deux clients IMMOBILES ne se chevauchent jamais ; un client qui marche peut passer devant.
  const still = (segs: Segment[], t: number) => {
    const s = segs.find((g) => t >= g.t0 && t < g.t1);
    return s && s.move !== 'walk' ? s.x0 : null;
  };
  const w31 = { ...frame, sign: { ...frame.sign, w: 38 }, window: { ...frame.window, w: 31 } };
  it('vitrine étroite (31 px) : deux clients immobiles jamais à moins de 2 px', () => {
    for (const type of ['bakery', 'bar', 'bookshop', 'grocery', 'laundry'] as const) for (let i = 0; i < 40; i++) {
      const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
      const sc = direct({ key, frame: w31, staff, parties: castFor({ ...key, gate: 1, capacity: 4, dayMinutesAtStart: 480 }), street: NO_STREET });
      const cust = sc.tracks.filter((t) => t.role === 'customer');
      for (let t = 0; t < SLOT_S(type); t += 0.5) {
        const xs = cust.map((c) => still(c.segments, t)).filter((x): x is number => x !== null && x >= 0 && x <= 31).sort((a, b) => a - b);
        for (let k = 1; k < xs.length; k++) expect(xs[k]! - xs[k - 1]!, `${type} ${i} t=${t}`).toBeGreaterThan(2);
      }
    }
  });
  it('vitrine étroite (31 px) : la boulangerie et le bar accueillent plusieurs partis à la fois', () => {
    for (const type of ['bakery', 'bar'] as const) {
      let most = 0;
      for (let i = 0; i < 40; i++) {
        const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
        const sc = direct({ key, frame: w31, staff, parties: castFor({ ...key, gate: 1, capacity: 4, dayMinutesAtStart: 480 }), street: NO_STREET });
        for (let t = 0; t < SLOT_S(type); t += 1) {
          const inside = new Set(sc.tracks.filter((c) => c.role === 'customer' && c.segments.some((s) => t >= s.t0 && t < s.t1)).map((c) => c.party));
          most = Math.max(most, inside.size);
        }
      }
      expect(most, type).toBeGreaterThanOrEqual(2);
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
  it('poste principal = celui du dessin Ghibli', () => {
    const st = stageFor('bakery', wide);
    expect(st.posts[0]).toBeCloseTo(ghibliPostOf('bakery', 62, wide.door.x > wide.window.x ? 'left' : 'right'), 6);
    expect(st.doorEdge).toBe(wide.door.x > wide.window.x ? 'right' : 'left');
  });
  // Cadre de vitrine de largeur `w`, porte du local à gauche ou à droite (comme shopFrame).
  const frameOf = (w: number, door: 'left' | 'right') => {
    const x0 = 100;
    const win = { x: door === 'left' ? x0 + 7 : x0, y: frame.window.y, w, h: frame.window.h };
    return { sign: { ...frame.sign, x: x0, w: w + 7 }, window: win, door: { ...frame.door, x: door === 'left' ? x0 : x0 + w + 1 } };
  };
  const BROWSE = SHOP_TYPE_IDS.filter((t) => ['browse', 'till'].includes(SHOP_FAMILY[t]));
  const COUNTER = SHOP_TYPE_IDS.filter((t) => SHOP_FAMILY[t] === 'counter');
  it('rayons et caisses : au moins une place de flânerie, toutes largeurs, des deux côtés', () => {
    for (const type of BROWSE) for (let w = 31; w <= 63; w++) for (const door of ['left', 'right'] as const) {
      expect(stageFor(type, frameOf(w, door)).spots.length, `${type} ${w} ${door}`).toBeGreaterThanOrEqual(1);
    }
  });
  it('comptoirs d’au moins 45 px : une vraie file (2 places au moins), des deux côtés', () => {
    for (const type of COUNTER) for (let w = 45; w <= 63; w++) for (const door of ['left', 'right'] as const) {
      expect(stageFor(type, frameOf(w, door)).queue.length, `${type} ${w} ${door}`).toBeGreaterThanOrEqual(2);
    }
  });
  it('places immobiles : file espacée d’une silhouette, rien hors de la vitrine, rayons hors de la file', () => {
    for (const type of [...BROWSE, ...COUNTER]) for (let w = 31; w <= 63; w += 4) for (const door of ['left', 'right'] as const) {
      const st = stageFor(type, frameOf(w, door));
      for (let k = 1; k < st.queue.length; k++) expect(Math.abs(st.queue[k]! - st.queue[k - 1]!)).toBeGreaterThanOrEqual(PLACE - 1e-9);
      for (const x of [...st.queue, ...st.posts, ...st.spots, st.back, ...st.window]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(w);
      }
      for (const s of st.spots) for (const q of st.queue) expect(Math.abs(s - q)).toBeGreaterThanOrEqual(PLACE - 1e-9);
    }
  });
  it('tables, fauteuils et tabourets pour leurs familles', () => {
    expect(stageFor('restaurant', wide).tables.length).toBeGreaterThan(0);
    expect(stageFor('hairdresser', wide).chairs.length).toBeGreaterThan(0);
    expect(stageFor('bar', wide).spots.length).toBeGreaterThan(2);
  });
});
