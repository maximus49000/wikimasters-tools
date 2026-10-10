import { describe, expect, it } from 'vitest';
import { DARK } from '../../../src/core/library/city/events';
import { SANTA_DARK, SANTA_PERIOD_S, SANTA_WINDOW_S, santaOn, santaPassFor, santaPoseAt, santaRoof, santaWindowsIn } from '../../../src/core/library/city/santa';
import { WORLD_MARGIN } from '../../../src/core/library/scene-world';

const SEED = 4242;
const facades = [
  { x: 100, w: 40, h: 120, far: false, lamps: [{ x: 104, y: 60 }, { x: 114, y: 60 }, { x: 104, y: 74 }] },
  { x: 300, w: 20, h: 90, far: false, lamps: [] },
  { x: 500, w: 50, h: 100, far: true, lamps: [] },
];

describe('père Noël', () => {
  it('SANTA_DARK reste égal au seuil de nuit des événements', () => expect(SANTA_DARK).toBe(DARK));
  it('n’est actif que la nuit de la fête', () => {
    expect(santaOn(['christmas-eve'], 0.1)).toBe(true);
    expect(santaOn(['christmas-eve'], 0.3)).toBe(false);
    expect(santaOn([], 0)).toBe(false);
  });
  it('un passage par quart d’heure, dans sa tranche, déterministe', () => {
    for (let n = 1000; n < 1100; n++) {
      const a = santaPassFor(n, SEED);
      expect(santaPassFor(n, SEED)).toEqual(a);
      expect(a.start).toBeGreaterThanOrEqual(n * SANTA_PERIOD_S);
      expect(a.end).toBeLessThanOrEqual((n + 1) * SANTA_PERIOD_S);
      expect(a.end - a.start).toBe(SANTA_WINDOW_S);
    }
  });
  it('environ un passage sur trois livre', () => {
    let deliver = 0;
    for (let n = 0; n < 600; n++) if (santaPassFor(n, SEED).deliver) deliver++;
    expect(deliver / 600).toBeGreaterThan(0.25);
    expect(deliver / 600).toBeLessThan(0.42);
  });
  it('liste les fenêtres qui chevauchent un intervalle', () => {
    const t0 = 1000 * SANTA_PERIOD_S;
    const w = santaWindowsIn(t0, t0 + 1200, SEED);
    expect(w.length).toBeGreaterThanOrEqual(1);
    expect(w.length).toBeLessThanOrEqual(3);
    for (const x of w) expect(x.start < t0 + 1200 && t0 < x.end).toBe(true);
  });
  it('choisit un toit visible (immeuble proche assez large) ou aucun', () => {
    const roof = santaRoof(santaPassFor(1, SEED), facades, 200, 800);
    expect(roof).not.toBeNull();
    expect(roof!.cx).toBe(120); // seul candidat : x 100, w 40
    expect(roof!.y).toBe(80);
    expect(santaRoof(santaPassFor(1, SEED), [facades[1]!, facades[2]!], 200, 800)).toBeNull();
  });
  it('la fenêtre allumée est l’une des trois plus hautes de l’immeuble', () => {
    const roof = santaRoof(santaPassFor(1, SEED), facades, 200, 800)!;
    expect(facades[0]!.lamps).toContainEqual(roof.lamp);
  });
  const deliverPass = (() => { for (let n = 0; ; n++) { const p = santaPassFor(n, SEED); if (p.deliver) return p; } })();
  const roof = santaRoof(deliverPass, facades, 200, 800)!;
  const at = (p: number) => santaPoseAt(deliverPass, roof, deliverPass.start + p * SANTA_WINDOW_S, 800, 400);
  it('hors fenêtre : rien', () => {
    expect(santaPoseAt(deliverPass, roof, deliverPass.start - 1, 800, 400)).toBeNull();
    expect(santaPoseAt(deliverPass, roof, deliverPass.end, 800, 400)).toBeNull();
  });
  it('livraison : se pose sur le toit, disparaît, allume la fenêtre, repart', () => {
    expect(at(0.27)).toMatchObject({ landed: true, x: roof.cx, y: roof.y, santa: 'aboard', windowLit: false });
    expect(at(0.35)!.santa).toBe('walking');
    expect(at(0.5)).toMatchObject({ santa: 'hidden', windowLit: true, landed: true });
    expect(at(0.65)!.santa).toBe('walking');
    expect(at(0.72)).toMatchObject({ landed: true, santa: 'aboard', windowLit: false });
    expect(at(0.95)!.landed).toBe(false);
    expect(at(0.1)!.landed).toBe(false);
  });
  it('la livraison arrive de hors écran et repart hors écran', () => {
    const edge = deliverPass.dir > 0 ? -WORLD_MARGIN : 800 + WORLD_MARGIN;
    expect(at(0)!.x).toBe(edge);
    expect(Math.abs(at(0.999)!.x - (deliverPass.dir > 0 ? 800 + WORLD_MARGIN : -WORLD_MARGIN))).toBeLessThan(1);
  });
  it('sans toit, une livraison se rabat sur un passage simple', () => {
    const p = santaPoseAt(deliverPass, null, deliverPass.start + 0.5 * SANTA_WINDOW_S, 800, 400)!;
    expect(p).toMatchObject({ landed: false, santa: 'aboard', windowLit: false });
  });
  it('un passage simple traverse la scène de bord à bord', () => {
    const simple = (() => { for (let n = 0; ; n++) { const p = santaPassFor(n, SEED); if (!p.deliver) return p; } })();
    const a = santaPoseAt(simple, null, simple.start, 800, 400)!;
    const b = santaPoseAt(simple, null, simple.end - 0.01, 800, 400)!;
    expect(Math.sign(b.x - a.x)).toBe(simple.dir);
    expect(a.x).toBe(simple.dir > 0 ? -WORLD_MARGIN : 800 + WORLD_MARGIN);
    expect(b.x).toBeCloseTo(simple.dir > 0 ? 800 + WORLD_MARGIN : -WORLD_MARGIN, 0);
  });
});
