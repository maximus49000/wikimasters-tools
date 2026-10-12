import { describe, expect, it } from 'vitest';
import { PODIUM_H, WORLD_MARGIN, actorX, actorsFor, citySkyline, hashString, mulberry32, type Actor } from '../../../src/core/library/scene-world';
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

  it('la ville n’a plus que des nuages toujours présents (la population est dans city/)', () => {
    const actors = actorsFor('city', 1440, HEIGHT, 3);
    expect(actors.length).toBeGreaterThan(0);
    expect(actors.every((a) => a.kind === 'cloud' && a.u < 0)).toBe(true);
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

  const near = (w: number, s: number) => citySkyline(w, HEIGHT, s).filter((b) => !b.far);

  it('enchaîne des lots sans chevauchement, simples de 40 à 70 u ou jumeaux sur un socle commun', () => {
    for (let s = 1; s <= 30; s++) {
      const list = near(1440, s);
      for (let i = 1; i < list.length; i++) expect(list[i]!.x).toBeGreaterThanOrEqual(list[i - 1]!.x + list[i - 1]!.w - 1e-9);
      for (const b of list) {
        if (!b.podium) expect(b.w >= 40 && b.w < 70).toBe(true);
        else expect(b.w >= 26 && b.w < 44).toBe(true);
      }
    }
  });

  it('donne le même socle aux deux tours d’un jumeau, qui le couvrent exactement', () => {
    const list = Array.from({ length: 20 }, (_, s) => near(1440, s + 1)).flat();
    const twins = list.filter((b) => b.podium);
    expect(twins.length).toBeGreaterThan(0);
    const byPodium = new Map<object, typeof twins>();
    for (const b of twins) byPodium.set(b.podium!, [...(byPodium.get(b.podium!) ?? []), b]);
    for (const [p, towers] of byPodium) {
      const pod = p as NonNullable<(typeof twins)[0]['podium']>;
      expect(towers).toHaveLength(2);
      expect(pod.h).toBe(PODIUM_H);
      expect(towers[0]!.x).toBeCloseTo(pod.x, 9);
      expect(towers[1]!.x + towers[1]!.w).toBeCloseTo(pod.x + pod.w, 9);
      expect(towers[1]!.x - (towers[0]!.x + towers[0]!.w)).toBeLessThan(8);
      expect(Math.abs(towers[0]!.h - towers[1]!.h)).toBeGreaterThanOrEqual(12.5 - 1e-9);
      expect(Math.min(towers[0]!.h, towers[1]!.h)).toBeGreaterThanOrEqual(45);
    }
  });

  it('colle environ 45 % des lots à leur voisin et garde ~40 % de jumeaux', () => {
    let lots = 0, touching = 0, twins = 0;
    for (let s = 1; s <= 60; s++) {
      const list = near(2000, s);
      let prevEnd: number | null = null;
      for (let i = 0; i < list.length; i++) {
        const b = list[i]!;
        if (b.podium && list[i - 1]?.podium === b.podium) continue; // 2e tour du même lot
        const end = b.podium ? b.podium.x + b.podium.w : b.x + b.w;
        lots++;
        if (b.podium) twins++;
        if (prevEnd !== null && Math.abs(b.x - prevEnd) < 1e-9) touching++;
        prevEnd = end;
      }
    }
    expect(twins / lots).toBeGreaterThan(0.33);
    expect(twins / lots).toBeLessThan(0.47);
    expect(touching / lots).toBeGreaterThan(0.38);
    expect(touching / lots).toBeLessThan(0.52);
  });

  it('ne change pas le rang du fond', () => {
    // Empreinte du rang du fond figée avant la modification (graine 5, 720 px).
    const far = citySkyline(720, HEIGHT, 5).filter((b) => b.far).map((b) => [b.x, b.w, b.h].map((v) => v.toFixed(3)).join(','));
    expect(far).toMatchSnapshot();
  });

  it('les lampes ont un seuil entre 0 et 1', () => {
    for (const b of citySkyline(720, HEIGHT, 5)) for (const lamp of b.lamps) expect(lamp.u >= 0 && lamp.u < 1).toBe(true);
  });
});
