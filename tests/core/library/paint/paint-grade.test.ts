import { describe, expect, it } from 'vitest';
import { DUSK, gradeFor, gradeValues, IDENTITY, NIGHT } from '../../../../src/core/library/paint/grade';

const brightness = (g: number[]) => g[0]! + g[6]! + g[12]!;

describe('étalonnage', () => {
  it('plein jour sans nuages : identité', () => {
    expect(gradeFor(1, 0, false)).toEqual(IDENTITY);
  });
  it('pleine nuit : matrice de nuit', () => {
    gradeFor(0, 0, false).forEach((v, i) => expect(v).toBeCloseTo(NIGHT[i]!, 6));
  });
  it('crépuscule en plein jour : matrice dorée', () => {
    gradeFor(1, 1, false).forEach((v, i) => expect(v).toBeCloseTo(DUSK[i]!, 6));
  });
  it('plus sombre la nuit, plus sombre sous un ciel couvert', () => {
    expect(brightness(gradeFor(0.2, 0, false))).toBeLessThan(brightness(gradeFor(0.8, 0, false)));
    expect(brightness(gradeFor(1, 0, true))).toBeLessThan(brightness(gradeFor(1, 0, false)));
  });
  it('alpha intact', () => {
    const g = gradeFor(0.3, 0.6, true);
    expect(g.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });
  it('valeurs formatées pour feColorMatrix', () => {
    expect(gradeValues(IDENTITY)).toBe('1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
  });
});
