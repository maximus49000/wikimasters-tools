import { describe, expect, it } from 'vitest';
import { SIGNATURES } from '../../../src/core/library/city/shops/scene/signatures';
import { MOVES, type MoveId } from '../../../src/core/library/city/shops/scene/moves';
import { direct } from '../../../src/core/library/city/shops/scene/director';
import { castFor } from '../../../src/core/library/city/shops/scene/cast';
import { SLOT_S } from '../../../src/core/library/city/shops/scene/slots';
import type { Segment } from '../../../src/core/library/city/shops/scene/types';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { outfitFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';

const TYPES = ['butcher', 'cheese', 'optician', 'hairdresser', 'florist', 'wine', 'tattoo', 'pharmacy', 'cafe'] as const;
const EXPECT: Record<(typeof TYPES)[number], string> = { butcher: 'weigh', cheese: 'taste', optician: 'try-frames', hairdresser: 'cut-hair', florist: 'compose-bouquet', wine: 'sniff-wine', tattoo: 'tattoo', pharmacy: 'explain-box', cafe: 'brew-coffee' };

describe('étapes signature', () => {
  it('chaque étape référence des gestes existants', () => {
    for (const steps of Object.values(SIGNATURES)) for (const s of steps!) {
      if (s.staff) expect(MOVES[s.staff]).toBeDefined();
      if (s.customer) expect(MOVES[s.customer]).toBeDefined();
    }
  });
  it('chaque métier joue sa signature dans la partition', () => {
    const slot = shopSlotsFor(720, 340, 9)[0]!;
    const frame = shopFrame(slot, 238);
    const staff = [{ id: 'A', outfit: outfitFor('ordinary', mulberry32(3)), present: [0, 9999] as [number, number] }];
    for (const type of TYPES) {
      let seen = false;
      for (let i = 0; i < 40 && !seen; i++) {
        const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
        const sc = direct({ key, frame, staff, parties: castFor({ ...key, gate: 1, capacity: 3, dayMinutesAtStart: 900 }), street: { rainFrom: null, paradeFrom: null, busAt: [] } });
        seen = sc.tracks.some((t) => t.segments.some((s) => s.move === EXPECT[type]));
      }
      expect(seen, type).toBe(true);
    }
  });
});

// ---- Contrôles supplémentaires (tâche 6) ----
const slot = shopSlotsFor(720, 340, 9)[0]!;
const frame = shopFrame(slot, 238);
const wide = { ...frame, window: { ...frame.window, w: 90 } };
const crew = [{ id: 'A', outfit: outfitFor('ordinary', mulberry32(3)), present: [0, 9999] as [number, number] }];
const NO_STREET = { rainFrom: null, paradeFrom: null, busAt: [] };
const score = (type: (typeof TYPES)[number], i: number, fr = frame, capacity = 3) => {
  const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
  return direct({ key, frame: fr, staff: crew, parties: castFor({ ...key, gate: 1, capacity, dayMinutesAtStart: 900 }), street: NO_STREET });
};
// Segments d'un rôle, sans les attentes ni les demi-tours (les temps d'un service partent au pas suivant : une attente s'intercale).
const FILL: ReadonlySet<string> = new Set(['idle', 'turn', 'sit', 'wait']);
const segs = (sc: ReturnType<typeof score>, role: 'staff' | 'customer') => sc.tracks.filter((t) => t.role === role).flatMap((t) => t.segments.filter((s) => !FILL.has(s.move)));
const acts = (tr: { segments: Segment[] }) => tr.segments.filter((s) => !FILL.has(s.move) && s.move !== 'walk');
const mv = (ss: Segment[]) => new Set(ss.map((s) => s.move));

describe('étapes signature : détails', () => {
  it('le picto annoncé par une étape est celui du geste, et l’objet annoncé est tenu par ce geste', () => {
    for (const steps of Object.values(SIGNATURES)) for (const s of steps!) {
      if (s.picto) expect([MOVES[s.staff!]?.picto?.id, MOVES[s.customer!]?.picto?.id]).toContain(s.picto);
      // L'objet annoncé est tenu par l'un des gestes, sauf la monture portée sur le visage (convention `frames`).
      if (s.prop && s.prop !== 'frames') expect((s.staff && MOVES[s.staff].prop) || (s.customer && MOVES[s.customer].prop), `${s.staff}/${s.customer}`).toBeTruthy();
    }
  });
  it('les dix métiers sont au tableau, le restaurant renvoyant à table.ts', () => {
    for (const t of [...TYPES, 'restaurant'] as const) expect(SIGNATURES[t], t).toBeDefined();
    expect(SIGNATURES.restaurant).toHaveLength(0);
  });
  it('aucun objet ne sort de nulle part dans les neuf métiers (un geste qui commence objet en main suit une prise)', () => {
    const POCKET: ReadonlySet<string> = new Set(['drop-coin', 'take-order', 'read-idle']);
    for (const type of TYPES) for (let i = 0; i < 25; i++) for (const tr of score(type, i).tracks) tr.segments.forEach((s, k) => {
      const m = s.move in MOVES ? MOVES[s.move as MoveId] : null;
      if (!m?.prop || m.prop.from > 0 || POCKET.has(s.move)) return;
      expect(k, `${type} ${i} ${tr.id} ${s.move}`).toBeGreaterThan(0);
      expect(tr.segments[k - 1]!.prop, `${type} ${i} ${tr.id} ${s.move} après ${tr.segments[k - 1]!.move}`).not.toBeNull();
    });
  });
  it('tout le monde sort avant la fin du créneau, employé au poste à la fin', () => {
    for (const type of TYPES) for (let i = 0; i < 25; i++) {
      const sc = score(type, i, wide, 4);
      for (const t of sc.tracks) {
        if (t.role === 'customer' && t.enter !== null) expect(t.exit!, `${type} ${i}`).toBeLessThanOrEqual(SLOT_S(type));
        for (const s of t.segments) expect(s.t1).toBeLessThanOrEqual(SLOT_S(type) + 1e-6);
      }
    }
  });
  // Combien de créneaux (sur 20) jouent la séquence complète attendue : la plupart, pas un seul.
  const countOk = (f: (i: number) => boolean, n = 20): number => Array.from({ length: n }, (_, i) => f(i)).filter(Boolean).length;
  it('boucher : la pièce est posée, pesée, emballée ; le paquet est remis', () => {
    expect(countOk((i) => {
      const ss = segs(score('butcher', i), 'staff').filter((s) => s.move !== 'walk').map((s) => s.move);
      const w = ss.indexOf('weigh');
      return w > 0 && ss[w - 1] === 'put-down' && ss[w + 1] === 'wrap' && ss.slice(w).includes('hand-over');
    })).toBeGreaterThanOrEqual(12);
  });
  it('fromager : l’éclat est coupé, tendu, pris et goûté (traits de joie possibles)', () => {
    let tasted = 0;
    for (let i = 0; i < 20; i++) {
      const sc = score('cheese', i);
      const cust = segs(sc, 'customer');
      const t = cust.find((s) => s.move === 'taste');
      if (!t) continue;
      tasted++;
      expect(t.prop).toBe('sample');
      const st = segs(sc, 'staff').map((s) => s.move);
      expect(st.indexOf('cut-sample')).toBeGreaterThanOrEqual(0);
      expect(st.indexOf('cut-sample')).toBeLessThan(st.indexOf('wrap'));
    }
    expect(tasted).toBeGreaterThan(0);
  });
  it('opticien : la monture est prise avant d’être essayée ; portée (prop `frames`) devant le miroir ; reposée ensuite', () => {
    let tried = 0;
    for (let i = 0; i < 30; i++) {
      for (const tr of score('optician', i, wide).tracks.filter((t) => t.role === 'customer')) {
        const ss = acts(tr);
        ss.forEach((s, k) => {
          if (s.move !== 'try-frames') return;
          expect(ss[k - 1]!.move).toBe('take-item');
          expect(ss[k - 1]!.prop).toBe('frames');
          // Essai écourté par la fermeture : le client repose la monture en partant (put-down libre), rien d'autre.
          if (ss[k + 1]?.move !== 'look-mirror') return void expect(ss[k + 1]?.move).toBe('put-down');
          tried++;
          expect(ss[k + 1]!.prop).toBe('frames');
          expect(ss[k + 2]!.move).toBe('put-down');
          expect(ss[k + 2]!.prop).toBe('frames');
        });
        // Entre deux gestes, la monture portée reste sur le nez (prop `frames` de l'attente).
        tr.segments.forEach((s, k) => { if (s.move === 'look-mirror') expect(tr.segments[k - 1]!.prop, `${i} avant le miroir`).toBe('frames'); });
      }
    }
    expect(tried).toBeGreaterThan(0);
  });
  it('fleuriste : va aux seaux, choisit, revient composer, emballe ; le bouquet est remis', () => {
    expect(countOk((i) => {
      const ss = segs(score('florist', i), 'staff');
      const c = ss.findIndex((s) => s.move === 'compose-bouquet');
      if (c < 0) return false;
      const before = ss.slice(0, c).map((s) => s.move);
      const pick = before.indexOf('pick-stems');
      // Marche vers les seaux, deux choix de tiges, marche de retour, composition, emballage ; le bouquet est remis à la fin.
      return pick > 0 && before[pick - 1] === 'walk' && before.filter((m) => m === 'pick-stems').length === 2 && before.slice(pick).includes('walk')
        && ss[c]!.prop === 'bouquet' && ss[c + 1]!.move === 'wrap' && ss[c + 1]!.prop === 'bouquet' && ss.slice(c).some((s) => s.move === 'hand-over' && s.prop === 'bouquet');
    })).toBeGreaterThanOrEqual(12);
  });
  it('caviste : verse, tend ; le client sent, goûte (joie), repose le verre ; parfois une seconde bouteille', () => {
    let second = 0;
    expect(countOk((i) => {
      const sc = score('wine', i, wide);
      const cust = segs(sc, 'customer').filter((s) => s.move !== 'walk').map((s) => s.move);
      const k = cust.indexOf('sniff-wine');
      const staff = segs(sc, 'staff').map((s) => s.move);
      if (staff.filter((m) => m === 'pour-wine').length >= 2 && staff.includes('fetch')) second++;
      return k > 0 && cust[k - 1] === 'take-item' && cust[k + 1] === 'sip-wine' && cust[k + 2] === 'put-down' && staff.includes('pour-wine');
    }, 30)).toBeGreaterThanOrEqual(15);
    expect(second).toBeGreaterThan(0);
  });
  it('pharmacien : la boîte est posée puis expliquée, le client hoche la tête', () => {
    expect(countOk((i) => {
      const sc = score('pharmacy', i);
      const st = segs(sc, 'staff').filter((s) => s.move !== 'walk').map((s) => s.move);
      const e = st.indexOf('explain-box');
      return e > 0 && st[e - 1] === 'put-down' && mv(segs(sc, 'customer')).has('listen-nod');
    })).toBeGreaterThanOrEqual(12);
  });
  it('barista : va à la machine, prépare, revient et tend la tasse', () => {
    expect(countOk((i) => {
      const ss = segs(score('cafe', i), 'staff');
      const b = ss.findIndex((s) => s.move === 'brew-coffee');
      if (b < 1) return false;
      const next = ss.slice(b + 1).find((s) => s.move !== 'walk');
      return ss[b - 1]!.move === 'walk' && ss[b]!.prop === 'cup' && next?.move === 'hand-over' && next.prop === 'cup';
    })).toBeGreaterThanOrEqual(12);
  });
  it('coiffeur : installation (`after-you`, plus de `show-table`), shampoing client renversé, ciseaux, miroir tenu puis reposé', () => {
    let full = 0;
    for (let i = 0; i < 30; i++) {
      const sc = score('hairdresser', i, wide, 4);
      const st = segs(sc, 'staff');
      const sm = st.map((s) => s.move);
      expect(sm).not.toContain('show-table');
      if (!sm.includes('cut-hair')) continue;
      full++;
      expect(sm).toContain('after-you');
      expect(sm.indexOf('shampoo')).toBeLessThan(sm.indexOf('cut-hair'));
      expect(sm.indexOf('cut-hair')).toBeLessThan(sm.indexOf('hold-mirror'));
      const h = st.findIndex((s) => s.move === 'hold-mirror');
      const after = st.slice(h + 1).find((s) => s.move !== 'walk');
      expect(after?.move).toBe('put-down');
      expect(after?.prop).toBe('mirror');
      const cust = segs(sc, 'customer').map((s) => s.move);
      expect(cust).toContain('lie-back');
      expect(cust).toContain('look-mirror');
    }
    expect(full).toBeGreaterThanOrEqual(15);
  });
  it('tatoueur : longue séance (plusieurs passes), grimace du client, miroir à la fin', () => {
    let full = 0;
    let winced = 0;
    for (let i = 0; i < 30; i++) {
      const sc = score('tattoo', i, wide, 4);
      const sm = segs(sc, 'staff').map((s) => s.move);
      if (!sm.includes('tattoo')) continue;
      full++;
      // Première séance : au moins deux passes avant le miroir.
      const mirror = sm.indexOf('hold-mirror');
      expect(mirror).toBeGreaterThan(0);
      expect(sm.slice(0, mirror).filter((m) => m === 'tattoo').length).toBeGreaterThanOrEqual(2);
      if (mv(segs(sc, 'customer')).has('wince')) winced++;
    }
    expect(full).toBeGreaterThanOrEqual(15);
    expect(winced).toBeGreaterThan(0);
  });
  it('fauteuils : aucune passe plus courte que le minimum de son geste (hors coupure de fermeture)', () => {
    for (const type of ['hairdresser', 'tattoo'] as const) for (let i = 0; i < 30; i++) {
      const sc = score(type, i, wide, 4);
      for (const tr of sc.tracks.filter((t) => t.role === 'staff')) for (const s of tr.segments) {
        // Les gestes de passe seulement : `chat` et `wipe-counter` servent aussi de boutique vide, interruptible.
        if (!['shampoo', 'cut-hair', 'tattoo'].includes(s.move) || s.t1 >= sc.length - 30) continue;
        expect(s.t1 - s.t0, `${type} ${i} ${s.move} à ${s.t0.toFixed(1)} s`).toBeGreaterThanOrEqual(MOVES[s.move as MoveId].dur[0] - 1e-6);
      }
    }
  });
  it('rien ne disparaît : un objet tenu en fin de segment est encore tenu au suivant, ou le geste l’a remis, posé ou consommé', () => {
    // Remise / pose / consommation : fenêtre d'objet qui se ferme avant la fin du geste, ou geste de remise sans fenêtre propre.
    const GIVES: ReadonlySet<string> = new Set(['put-down', 'hand-over', 'taste', 'read-idle']);
    for (const type of TYPES) for (let i = 0; i < 20; i++) for (const tr of score(type, i, wide, 4).tracks) tr.segments.forEach((s, k) => {
      if (k === 0 || !tr.segments[k - 1]!.prop || s.prop) return;
      const prev = tr.segments[k - 1]!;
      const pm = prev.move in MOVES ? MOVES[prev.move as MoveId] : null;
      expect((pm?.prop && pm.prop.to < 1) || GIVES.has(prev.move), `${type} ${i} ${tr.id} ${prev.move}(${prev.prop}) → ${s.move}`).toBe(true);
    });
  });
  it('durées (spec §5) : vente rapide 30-60 s, conseil 2-4 min — médianes des services journalisés', () => {
    const median = (type: (typeof TYPES)[number], n: number): number => {
      const durs: number[] = [];
      for (let i = 0; i < n; i++) {
        const open = new Map<string, number>();
        for (const l of score(type, i, wide, 4).log) {
          const [, t, txt] = /^(\d+) s (.*)$/.exec(l)!;
          const a = /— (\S+) libre → accueille/.exec(txt!);
          if (a) open.set(a[1]!, +t!);
          const b = /^(\S+) a fini avec/.exec(txt!);
          if (b && open.has(b[1]!)) { durs.push(+t! - open.get(b[1]!)!); open.delete(b[1]!); }
        }
      }
      durs.sort((a, b) => a - b);
      expect(durs.length, type).toBeGreaterThan(10);
      return durs[Math.floor(durs.length / 2)]!;
    };
    for (const type of ['butcher', 'cheese', 'florist', 'pharmacy', 'cafe'] as const) {
      const m = median(type, 20);
      expect(m, type).toBeGreaterThanOrEqual(25);
      expect(m, type).toBeLessThanOrEqual(65);
    }
    for (const type of ['optician', 'wine'] as const) {
      const m = median(type, 30);
      expect(m, type).toBeGreaterThanOrEqual(110);
      expect(m, type).toBeLessThanOrEqual(240);
    }
  });
  it('déterminisme : même créneau, même partition', () => {
    for (const type of ['butcher', 'optician', 'hairdresser'] as const) expect(JSON.stringify(score(type, 2))).toBe(JSON.stringify(score(type, 2)));
  });
});
