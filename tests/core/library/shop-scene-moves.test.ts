import { describe, expect, it } from 'vitest';
import { ARM_POSES } from '../../../src/core/library/figure/skeleton';
import { MOVES, keyAt, keyAtTime, type MoveId } from '../../../src/core/library/city/shops/scene/moves';

// Ids imposés par le plan (portés de la maquette du 2026-10-12) : chacun doit exister dans la bibliothèque.
const REQUIRED: readonly MoveId[] = [
  'greet', 'nod', 'wave-hello', 'wave-bye',
  'ask', 'point-item', 'chin-think', 'change-mind', 'ask-way', 'point-aisle',
  'fetch', 'hand-over', 'take-item', 'prepare',
  'pay-card', 'pay-cash', 'count-change', 'search-wallet', 'give-change', 'print-ticket',
  'wait', 'wait-impatient', 'beckon-wait', 'call-colleague', 'lean-counter', 'chat',
  'tidy-shelf', 'wipe-counter', 'look-window', 'phone-idle', 'yawn', 'stretch', 'read-idle', 'colleague-chat',
  'drop-coin', 'pick-coin', 'sneeze', 'phone-ring', 'child-tug', 'hold-child', 'child-point',
  'couple-look', 'toast', 'ask-bill',
  'recognize', 'hug-hello', 'let-pass',
  'show-table', 'hand-menu', 'read-menu', 'take-order', 'carry-plates', 'serve-plate', 'eat', 'clear-table', 'bring-bill',
  'weigh', 'wrap', 'cut-sample', 'taste', 'offer-frames', 'try-frames', 'look-mirror', 'hold-mirror', 'shampoo', 'cut-hair',
  'pick-stems', 'compose-bouquet', 'pour-wine', 'sniff-wine', 'tattoo', 'wince', 'explain-box', 'listen-nod', 'brew-coffee',
  'look-street', 'wait-rain', 'head-turn',
];

describe('bibliothèque de gestes', () => {
  const all = Object.values(MOVES);
  it('a au moins 80 gestes', () => expect(all.length).toBeGreaterThanOrEqual(80));
  it('contient tous les ids du plan, chacun sous sa propre clé', () => {
    for (const id of REQUIRED) {
      expect(MOVES[id], id).toBeDefined();
      expect(MOVES[id].id).toBe(id);
    }
    for (const [k, m] of Object.entries(MOVES)) expect(m.id).toBe(k);
  });
  it('poses clés valides et croissantes, durée positive', () => {
    for (const m of all) {
      expect(m.keys[0]!.at, m.id).toBe(0);
      for (let i = 1; i < m.keys.length; i++) expect(m.keys[i]!.at, m.id).toBeGreaterThan(m.keys[i - 1]!.at);
      for (const k of m.keys) {
        expect(ARM_POSES, m.id).toContain(k.arms);
        expect(k.at, m.id).toBeLessThanOrEqual(1);
        expect([0, 1, 2], m.id).toContain(k.lean);
        expect(Math.abs(k.headYaw), m.id).toBeLessThanOrEqual(Math.PI / 2);
      }
      expect(m.dur[0], m.id).toBeGreaterThan(0);
      expect(m.dur[1], m.id).toBeGreaterThanOrEqual(m.dur[0]);
      if (m.prop) {
        expect(m.prop.from, m.id).toBeGreaterThanOrEqual(0);
        expect(m.prop.from, m.id).toBeLessThan(m.prop.to);
        expect(m.prop.to, m.id).toBeLessThanOrEqual(1);
      }
      if (m.picto) {
        expect(m.picto.at, m.id).toBeGreaterThanOrEqual(0);
        expect(m.picto.at, m.id).toBeLessThanOrEqual(1);
      }
    }
  });
  it('durées réalistes : gestes unitaires 1-8 s, boucles 1-25 s', () => {
    for (const m of all) {
      expect(m.dur[0], m.id).toBeGreaterThanOrEqual(0.6);
      expect(m.dur[1], m.id).toBeLessThanOrEqual(m.loop ? 25 : 8);
    }
  });
  it('les boucles ont une période (2-4 poses clés, plus courte que la durée min)', () => {
    const loops = all.filter(m => m.loop);
    expect(loops.length).toBeGreaterThanOrEqual(8);
    for (const m of loops) {
      expect(m.period, m.id).toBeGreaterThan(0);
      expect(m.period!, m.id).toBeLessThanOrEqual(m.dur[0]);
      expect(m.keys.length, m.id).toBeGreaterThanOrEqual(2);
      expect(m.keys.length, m.id).toBeLessThanOrEqual(4);
    }
    for (const m of all.filter(m => !m.loop)) expect(m.period, m.id).toBeUndefined();
  });
  it('keyAt rend la pose clé courante, en boucle si loop', () => {
    const m = MOVES['wipe-counter']!;
    expect(m.loop).toBe(true);
    expect(keyAt(m, 0).arms).toBe(m.keys[0]!.arms);
    expect(keyAt(m, 0.999).arms).toBeDefined();
    expect(keyAt(m, 0.999)).toBe(m.keys[m.keys.length - 1]);
    // Une pose clé tient jusqu'à la suivante (sprites discrets, pas d'interpolation).
    const h = MOVES['hand-over'];
    expect(keyAt(h, h.keys[1]!.at - 1e-6)).toBe(h.keys[0]);
    expect(keyAt(h, h.keys[1]!.at)).toBe(h.keys[1]);
    expect(keyAt(h, 1)).toBe(h.keys[h.keys.length - 1]);
    expect(keyAt(h, -0.5)).toBe(h.keys[0]);
  });
  it('keyAtTime : fraction du geste hors boucle, fraction de la période en boucle', () => {
    const h = MOVES['hand-over'];
    expect(keyAtTime(h, 0, 4)).toBe(h.keys[0]);
    expect(keyAtTime(h, 4, 4)).toBe(h.keys[h.keys.length - 1]);
    expect(keyAtTime(h, 4 * h.keys[1]!.at, 4)).toBe(h.keys[1]);
    const w = MOVES['wipe-counter'];
    const p = w.period!;
    expect(keyAtTime(w, 0, 20)).toBe(w.keys[0]);
    expect(keyAtTime(w, p, 20)).toBe(w.keys[0]);
    // Au milieu de la plage de la 2e pose, au 3e cycle (les bornes exactes dépendent des arrondis flottants du modulo).
    expect(keyAtTime(w, 2 * p + p * (w.keys[1]!.at + w.keys[2]!.at) / 2, 20)).toBe(w.keys[1]);
    expect(keyAtTime(w, -0.01, 20)).toBe(w.keys[w.keys.length - 1]);
  });
  it("les objets ne tombent pas du ciel : seuls les gestes de prise ou de remise d'un objet déjà tenu portent un prop", () => {
    const withProp = all.filter(m => m.prop);
    expect(withProp.length).toBeGreaterThanOrEqual(10);
    // Une prise (`take`, `pick`, `shelve`, `work`) précède ou ouvre la tenue de l'objet, sauf dans une remise (objet déjà en main).
    for (const m of withProp) {
      const first = m.keys.find(k => k.at >= m.prop!.from) ?? m.keys[m.keys.length - 1]!;
      const grab = m.keys.some(k => k.at <= m.prop!.from && ['take', 'pick', 'shelve', 'work', 'reach', 'pour', 'weigh', 'wrap-1', 'wrap-2', 'notepad', 'plates'].includes(k.arms));
      expect(grab || m.prop!.from === 0, m.id).toBe(true);
      expect(first, m.id).toBeDefined();
    }
  });
  it('les gestes main-au-visage se distinguent par la tête, le penché ou le rythme', () => {
    const face = ['chin-think', 'yawn', 'taste', 'sniff-wine', 'sneeze'] as const;
    const sig = (id: MoveId) => MOVES[id].keys.map(k => `${k.arms}|${k.lean}|${k.headYaw.toFixed(2)}`).join(';') + `|${MOVES[id].keys.length}`;
    const seen = new Set(face.map(sig));
    expect(seen.size).toBe(face.length);
  });
  it("accroupi : `pick` n'apparaît qu'avec l'allure crouch", () => {
    for (const m of all) for (const k of m.keys) if (k.arms === 'pick') expect(k.gait, m.id).toBe('crouch');
  });
});
