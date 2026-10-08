import { describe, expect, it } from 'vitest';
import { WORLD_MARGIN, actorX, actorsFor, citySkyline, hashString, mulberry32, type Actor } from '../../../src/core/library/scene-world';
import { SCENE_IDS } from '../../../src/core/library/library-types';

const WIDTH = 720;
const HEIGHT = 340;

describe('générateur à graine', () => {
  it('donne la même suite pour la même graine', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(hashString('city')).toBe(hashString('city'));
    expect(hashString('city')).not.toBe(hashString('sea'));
  });
});

describe('actorX — continuité entre fenêtres', () => {
  const walker: Actor = { id: 'w', kind: 'walker', y: 250, speed: 30, phase: 0, u: 0.1, scale: 1 };

  it('avance à vitesse constante et boucle', () => {
    expect(actorX(walker, WIDTH, 0)).toBeCloseTo(-WORLD_MARGIN, 5);
    expect(actorX(walker, WIDTH, 10) - actorX(walker, WIDTH, 0)).toBeCloseTo(300, 5);
    const loop = (WIDTH + 2 * WORLD_MARGIN) / 30;
    expect(actorX(walker, WIDTH, loop)).toBeCloseTo(actorX(walker, WIDTH, 0), 5);
  });

  it('le délai entre deux points est distance ÷ vitesse', () => {
    const xA = 120;
    const xB = 470;
    const tA = (xA + WORLD_MARGIN) / walker.speed;
    const tB = (xB + WORLD_MARGIN) / walker.speed;
    expect(actorX(walker, WIDTH, tA)).toBeCloseTo(xA, 5);
    expect(actorX(walker, WIDTH, tB)).toBeCloseTo(xB, 5);
    expect(tB - tA).toBeCloseTo((xB - xA) / walker.speed, 5);
  });

  it('un acteur qui va vers la gauche entre par la droite', () => {
    const back: Actor = { ...walker, speed: -30 };
    expect(actorX(back, WIDTH, 0)).toBeCloseTo(WIDTH + WORLD_MARGIN, 5);
    expect(actorX(back, WIDTH, 5)).toBeCloseTo(WIDTH + WORLD_MARGIN - 150, 5);
  });
});

describe('actorsFor', () => {
  it('est déterministe et proportionnel à la largeur', () => {
    const small = actorsFor('city', 720, HEIGHT, 7);
    expect(actorsFor('city', 720, HEIGHT, 7)).toEqual(small);
    expect(actorsFor('city', 2880, HEIGHT, 7).length).toBeGreaterThan(small.length);
  });

  it('chaque scène a des acteurs, tous dans la hauteur, identifiants uniques', () => {
    for (const scene of SCENE_IDS) {
      const actors = actorsFor(scene, 1440, HEIGHT, 3);
      expect(actors.length).toBeGreaterThan(0);
      expect(new Set(actors.map((a) => a.id)).size).toBe(actors.length);
      for (const a of actors) {
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeLessThanOrEqual(HEIGHT);
        expect(a.speed).not.toBe(0);
      }
    }
  });

  it('la ville a des passants et des voitures liés à l’activité, des nuages toujours présents', () => {
    const actors = actorsFor('city', 1440, HEIGHT, 3);
    expect(actors.some((a) => a.kind === 'walker' && a.u >= 0)).toBe(true);
    expect(actors.some((a) => a.kind === 'car' && a.u >= 0)).toBe(true);
    expect(actors.filter((a) => a.kind === 'cloud').every((a) => a.u < 0)).toBe(true);
  });

  it('l’espace n’a ni nuage ni passant', () => {
    const kinds = new Set(actorsFor('space', 1440, HEIGHT, 3).map((a) => a.kind));
    expect(kinds.has('cloud')).toBe(false);
    expect(kinds.has('walker')).toBe(false);
  });
});

describe('citySkyline', () => {
  it('est déterministe, couvre la largeur, et la première bande ne change pas quand la pièce grandit à droite', () => {
    const a = citySkyline(720, HEIGHT, 5);
    expect(citySkyline(720, HEIGHT, 5)).toEqual(a);
    const wide = citySkyline(1080, HEIGHT, 5);
    const firstChunk = (list: typeof a) => list.filter((b) => b.x < 360);
    expect(firstChunk(wide)).toEqual(firstChunk(a));
    expect(Math.max(...a.map((b) => b.x + b.w))).toBeGreaterThanOrEqual(720);
  });

  it('les lampes ont un seuil entre 0 et 1', () => {
    for (const b of citySkyline(720, HEIGHT, 5)) for (const lamp of b.lamps) expect(lamp.u >= 0 && lamp.u < 1).toBe(true);
  });
});
