import { describe, expect, it } from 'vitest';
import { direct } from '../../../src/core/library/city/shops/scene/director';
import { castFor } from '../../../src/core/library/city/shops/scene/cast';
import { SLOT_S, inScene } from '../../../src/core/library/city/shops/scene/slots';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { outfitFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';
import { SHOP_TYPE_IDS, type ShopTypeId } from '../../../src/core/library/city/shops/catalog';
import { payActs } from '../../../src/core/library/city/shops/scene/behaviors/service';
import type { PartyRt, World } from '../../../src/core/library/city/shops/scene/engine';

const slot = shopSlotsFor(720, 340, 9)[0]!;
const frame = { ...shopFrame(slot, 238), window: { ...shopFrame(slot, 238).window, w: 90 } };
const rng = mulberry32(2);
const two = [
  { id: 'A', outfit: outfitFor('ordinary', rng), present: [0, 9999] as [number, number] },
  { id: 'B', outfit: outfitFor('ordinary', rng), present: [0, 9999] as [number, number] },
];
const NO_STREET = { rainFrom: null, paradeFrom: null, busAt: [] };
const logs = (type: ShopTypeId, n: number, capacity = 6) => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
    out.push(...direct({ key, frame, staff: two, parties: castFor({ ...key, gate: 1, capacity, dayMinutesAtStart: 750 }), street: NO_STREET }).log);
  }
  return out.join('\n');
};

describe('situations à plusieurs', () => {
  it('boulangerie bondée : jongle, renfort, reconnaissance', () => {
    const l = logs('bakery', 300);
    for (const w of ["« j'arrive »", 'appelle', 'reconnaît', 'cède son tour', 'renonce']) expect(l).toContain(w);
  });
  it('bar : les amis trinquent et demandent la note', () => {
    const l = logs('bar', 200, 7);
    expect(l).toContain('trinquent');
    expect(l).toContain('note');
  });
  it('restaurant : enchaînement complet dans l’ordre', () => {
    const l = logs('restaurant', 60);
    const order = ['place', 'commande', 'sert', 'débarrasse', 'note'].map((w) => l.indexOf(w));
    for (const i of order) expect(i).toBeGreaterThanOrEqual(0);
    for (let k = 1; k < order.length; k++) expect(order[k]!).toBeGreaterThan(order[k - 1]!);
  });
  it('les membres d’un groupe restent ensemble', () => {
    for (let i = 0; i < 100; i++) {
      const key = { seed: 9, slotId: slot.id, type: 'cafe' as const, day: 20738, index: i };
      const sc = direct({ key, frame, staff: two, parties: castFor({ ...key, gate: 1, capacity: 6, dayMinutesAtStart: 750 }), street: NO_STREET });
      const byParty = new Map<string, typeof sc.tracks>();
      for (const t of sc.tracks) if (t.party) byParty.set(t.party, [...(byParty.get(t.party) ?? []), t]);
      for (const ms of byParty.values()) if (ms.length > 1) for (const m of ms) {
        expect(m.enter).not.toBeNull();
        expect(Math.abs(m.enter! - ms[0]!.enter!)).toBeLessThan(6);
      }
    }
  });
  it('tout le monde sort avant la fin, même au restaurant et chez le tatoueur', () => {
    for (const type of ['restaurant', 'tattoo', 'hairdresser'] as const) for (let i = 0; i < 40; i++) {
      const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
      const sc = direct({ key, frame, staff: two, parties: castFor({ ...key, gate: 1, capacity: 4, dayMinutesAtStart: 750 }), street: NO_STREET });
      for (const t of sc.tracks) if (t.role === 'customer' && t.enter !== null) expect(t.exit!).toBeLessThanOrEqual(SLOT_S(type));
    }
  });
});

// ---- Contrôles supplémentaires (tâche 5) ----
const score = (type: ShopTypeId, i: number, capacity = 6, crew = two, fr = frame) => {
  const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
  return direct({ key, frame: fr, staff: crew, parties: castFor({ ...key, gate: 1, capacity, dayMinutesAtStart: 750 }), street: NO_STREET });
};
const movesOf = (sc: ReturnType<typeof score>, role: 'staff' | 'customer') => new Set(sc.tracks.filter((t) => t.role === role).flatMap((t) => t.segments.map((s) => s.move)));

describe('situations à plusieurs : détails', () => {
  it('jongle : l’employé occupé fait signe « j’arrive » au suivant (pas seulement au bavard)', () => {
    const l = logs('bakery', 120);
    expect(l).toMatch(/fait signe « j'arrive » à Client/);
  });
  it('indécis : décide vite ou renonce quand la file s’allonge derrière lui', () => {
    const l = logs('bakery', 300);
    expect(l).toContain('voit la file grossir… et renonce');
    expect(l).toContain('voit la file grossir… et se décide');
  });
  it('connaissances : reconnaissance, bavardage, l’un laisse passer l’autre', () => {
    let let_ = 0;
    for (let i = 0; i < 300; i++) {
      const sc = score('bakery', i);
      if (sc.log.some((l) => l.includes('cède son tour'))) let_ += sc.tracks.some((t) => t.segments.some((s) => s.move === 'let-pass')) ? 1 : 0;
    }
    expect(let_).toBeGreaterThan(0);
  });
  it('renfort ailleurs qu’au comptoir : le collègue en réserve est appelé au restaurant ou au bar', () => {
    const l = logs('restaurant', 60) + logs('bar', 100, 7);
    expect(l).toContain('appelle un collègue');
  });
  it('groupes : jamais deux membres au même x, l’enfant est plus petit et montre, le parent le retient', () => {
    let child = 0;
    for (const type of ['bakery', 'cafe', 'bookshop'] as const) for (let i = 0; i < 80; i++) {
      const sc = score(type, i);
      for (const t of sc.tracks) if (t.role === 'customer') for (const u of sc.tracks) if (u !== t && u.party === t.party) {
        for (const s of t.segments) if (s.move !== 'walk') {
          const o = u.segments.find((g) => g.move !== 'walk' && g.t0 < s.t1 && g.t1 > s.t0 && g.x0 === g.x1 && s.x0 === s.x1);
          if (o) expect(Math.abs(o.x0 - s.x0), `${type} ${i} ${t.id}`).toBeGreaterThan(0.5);
        }
      }
      const kids = sc.tracks.filter((t) => t.role === 'customer' && t.scale < 0.75);
      if (kids.some((k) => k.segments.some((s) => s.move === 'child-point'))) child++;
    }
    expect(child).toBeGreaterThan(0);
    const l = logs('bakery', 200);
    expect(l).toContain('le parent le retient');
  });
  it('paiement : ce qui est tenu est posé d’abord, la pièce tombée est une pièce (pas le verre)', () => {
    const party = { p: { character: 'ordinary' }, desc: 'Client', incidents: new Set(['drop-coin']), actors: [{ carried: 'glass' }] } as unknown as PartyRt;
    const { acts } = payActs({ rng: () => 0.9 } as unknown as World, party);
    expect(acts[0]!.move).toBe('put-down');
    expect(acts.find((x) => x.move === 'drop-coin')!.as).toBe('coin');
    // Dans la scène : la pièce qui tombe est dessinée comme une pièce, jamais un verre ou une tasse encore en main.
    for (const type of ['bar', 'cafe', 'bakery'] as const) for (let i = 0; i < 60; i++) for (const t of score(type, i, 7).tracks) {
      t.segments.forEach((s, k) => {
        if (s.move !== 'drop-coin') return;
        expect(s.prop, `${type} ${i}`).toBe('coin');
        expect(['glass', 'cup'], `${type} ${i} avant ${t.segments[k - 1]!.move}`).not.toContain(t.segments[k - 1]!.prop);
      });
    }
  });
  it('restaurant : la chorégraphie complète est jouée (placement, menus, carnet, cuisine, assiettes, repas, débarrassage, note)', () => {
    const staffMoves = new Set<string>();
    const custMoves = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const sc = score('restaurant', i);
      for (const m of movesOf(sc, 'staff')) staffMoves.add(m);
      for (const m of movesOf(sc, 'customer')) custMoves.add(m);
    }
    for (const m of ['show-table', 'hand-menu', 'take-order', 'carry-plates', 'serve-plate', 'clear-table', 'bring-bill']) expect(staffMoves, m).toContain(m);
    for (const m of ['read-menu', 'eat', 'sit']) expect(custMoves, m).toContain(m);
  });
  it('restaurant : le serveur passe en cuisine (arrière-boutique) entre la commande et le service', () => {
    const sc = score('restaurant', 3);
    const st = sc.tracks.filter((t) => t.role === 'staff');
    const fetchPlates = st.flatMap((t) => t.segments.filter((s) => s.move === 'carry-plates'));
    expect(fetchPlates.length).toBeGreaterThan(0);
  });
  it('restaurant : 3 ou 4 tables dans une large vitrine, aucun parti attablé ne chevauche un autre', () => {
    for (let i = 0; i < 30; i++) {
      const sc = score('restaurant', i);
      const cust = sc.tracks.filter((t) => t.role === 'customer');
      for (let t = 0; t < 600; t += 1) {
        const at = cust.map((c) => ({ p: c.party, s: c.segments.find((g) => t >= g.t0 && t < g.t1) })).filter((o) => o.s && o.s.move === 'sit');
        for (const a of at) for (const b of at) if (a.p !== b.p) expect(Math.abs(a.s!.x0 - b.s!.x0), `${i} t=${t}`).toBeGreaterThan(2);
      }
    }
  });
  it('fauteuils : installation, étape générique `prepare`, attente assise sur la chaise d’attente', () => {
    let waited = 0;
    for (const type of ['hairdresser', 'tattoo'] as const) for (let i = 0; i < 30; i++) {
      const sc = score(type, i, 4);
      expect(sc.log.some((l) => l.includes('installe'))).toBe(true);
      expect(movesOf(sc, 'staff')).toContain('prepare');
      if (sc.log.some((l) => l.includes('attend son tour'))) waited++;
    }
    expect(waited).toBeGreaterThan(0);
  });
  it('à la porte : la vraie raison du demi-tour est journalisée', () => {
    const l = [logs('bakery', 200), logs('restaurant', 60), logs('hairdresser', 40, 4)].join('\n');
    const reasons = [...l.matchAll(/renonce à la porte — ([^\n]+)/g)].map((m) => m[1]!);
    expect(reasons).toContain('personne pour servir');
    for (const r of reasons) expect(['la boutique va fermer', 'personne pour servir', "quelqu'un sort", 'trop de monde', 'pas de place pour eux']).toContain(r);
  });
  it('fauteuils et restaurant : un employé ne mène jamais deux services à la fois', () => {
    for (const type of ['restaurant', 'hairdresser', 'tattoo'] as const) for (let i = 0; i < 20; i++) {
      const sc = score(type, i, 4);
      for (const label of [...new Set(sc.log.map((l) => / — (\S+(?: [AB])?) (?:libre|→|indique)/.exec(l)?.[1]).filter((x): x is string => !!x))]) {
        let open = 0;
        for (const l of sc.log) {
          if (l.includes(` — ${label} libre`) || l.includes(` — ${label} →`) || l.includes(` — ${label} indique`)) expect(open++, `${type} ${i} ${l}`).toBe(0);
          else if (l.replace(/^\d+ s /, '').startsWith(`${label} a fini avec`)) expect(open--, `${type} ${i} ${l}`).toBe(1);
        }
      }
    }
  });
});

describe('vitrines minuscules', () => {
  it('9 à 20 px : aucun type ne plante, tout client entré ressort avant la fin', () => {
    for (const type of SHOP_TYPE_IDS.filter(inScene)) for (const w of [9, 14, 20]) for (let i = 0; i < 3; i++) {
      const fr = { ...frame, sign: { ...frame.sign, w: w + 7 }, window: { ...frame.window, w } };
      const sc = score(type, i, 6, two, fr);
      for (const t of sc.tracks) if (t.role === 'customer' && t.enter !== null) expect(t.exit!).toBeLessThanOrEqual(sc.length);
    }
  });
});
