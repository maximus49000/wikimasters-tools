import { describe, expect, it } from 'vitest';
import { petBoxesOf, shapeOf } from '../../../src/core/library/light/pet-boxes';
import type { Layout } from '../../../src/core/library/library-types';
import type { PetFrame } from '../../../src/core/library/pets/runner';

const geom = { wallH: 340, floorH: 170 };
const frame = (over: Partial<PetFrame> = {}): PetFrame => ({
  id: 'p1', species: 'cat', coat: 'orange', name: 'Minou', pose: 'walk', facing: 'r', behind: 0, top: false,
  on: null, pos: { x: 300, y: 425 }, depthY: 425, ...over,
});
const height = (bs: { z1: number }[]): number => Math.max(...bs.map((b) => b.z1));
const span = (bs: { x0: number; x1: number }[]): [number, number] => [Math.min(...bs.map((b) => b.x0)), Math.max(...bs.map((b) => b.x1))];

describe('shapeOf', () => {
  it('range les poses par silhouette', () => {
    expect(shapeOf('walk')).toBe('stand');
    expect(shapeOf('sit')).toBe('sit');
    expect(shapeOf('sleep')).toBe('lie');
    expect(shapeOf('hide')).toBe('none');
  });
});

describe('petBoxesOf', () => {
  it('donne des boîtes au nom de l’animal, posées sur le sol à la profondeur de ses pieds', () => {
    const boxes = petBoxesOf([frame()], [], geom);
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    expect(boxes.every((b) => b.owner === 'p1' && b.z0 >= 0)).toBe(true);
    // depthY 425 → d = (425 − 340) / (170 / 680) = 340
    for (const b of boxes) {
      expect(b.d0).toBeGreaterThan(300);
      expect(b.d1).toBeLessThan(380);
    }
  });
  it('« cachée » ne donne rien', () => {
    expect(petBoxesOf([frame({ pose: 'hide' })], [], geom)).toEqual([]);
  });
  it('couché est plus bas qu’assis, qui est plus bas que debout (chat)', () => {
    const stand = height(petBoxesOf([frame({ pose: 'walk' })], [], geom));
    const sit = height(petBoxesOf([frame({ pose: 'sit' })], [], geom));
    const lie = height(petBoxesOf([frame({ pose: 'sleep' })], [], geom));
    expect(lie).toBeLessThan(sit);
    expect(sit).toBeLessThan(stand);
  });
  it('le chat et le chien ont une queue (boîte fine à l’arrière), le robot non', () => {
    const tailBack = (species: PetFrame['species']): number => {
      const boxes = petBoxesOf([frame({ species, pose: 'walk' })], [], geom);
      const [min] = span(boxes);
      return 300 - min; // débord vers l'arrière
    };
    expect(tailBack('cat')).toBeGreaterThan(20);
    expect(tailBack('dog')).toBeGreaterThan(20);
    expect(tailBack('robot')).toBeLessThanOrEqual(14);
  });
  it('le robot est plus bas que le chat debout avec la tête, sans queue ni tête', () => {
    const robot = petBoxesOf([frame({ species: 'robot', pose: 'standby' })], [], geom);
    expect(height(robot)).toBeGreaterThanOrEqual(26); // le dos porte le chat (RIDE_LIFT = 26)
    const [a, b] = span(robot);
    expect(b - a).toBeGreaterThan(26); // large (28) plutôt que haut (châssis de 26, antenne exclue)
  });
  it('se retourne avec le sens du regard', () => {
    const r = span(petBoxesOf([frame({ facing: 'r' })], [], geom));
    const l = span(petBoxesOf([frame({ facing: 'l' })], [], geom));
    expect(300 - l[0]).toBeCloseTo(r[1] - 300, 5);
    expect(300 - l[1]).toBeCloseTo(r[0] - 300, 5);
  });
  it('un animal levé (dos du robot) monte de la différence depthY − pos.y', () => {
    const ground = petBoxesOf([frame({ pose: 'sleep' })], [], geom);
    const ridden = petBoxesOf([frame({ pose: 'sleep', pos: { x: 300, y: 399 }, depthY: 425.1 })], [], geom);
    expect(Math.min(...ridden.map((b) => b.z0)) - Math.min(...ground.map((b) => b.z0))).toBeCloseTo(26.1, 1);
    expect(ridden[0]!.d1).toBeCloseTo(ground[0]!.d1, 0);
  });
  it('perché sur un bureau : posé sur le plateau, au milieu du bureau', () => {
    const layout: Layout = [{ id: 'd', kind: 'desk', col: 2, row: 11 }];
    const deskH = (510 / 18) * 4;
    const boxes = petBoxesOf([frame({ top: true, on: 'd', pose: 'sit', pos: { x: 100, y: 400 }, depthY: 400 })], layout, geom);
    expect(Math.min(...boxes.map((b) => b.z0))).toBeCloseTo(deskH, 1);
  });
  it('un support introuvable retombe au sol', () => {
    const boxes = petBoxesOf([frame({ top: true, on: 'absent', pose: 'sit' })], [], geom);
    expect(Math.min(...boxes.map((b) => b.z0))).toBe(0);
  });
});
