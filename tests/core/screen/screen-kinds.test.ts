import { describe, expect, it } from 'vitest';
import { personRoles, screenKindOf } from '../../../src/core/screen/screen-kinds';

const kinds = (natures: string[], occupations: string[] = []) => ({ natures, occupations, genres: [] });

describe('screenKindOf', () => {
  it('reconnaît un film et une série', () => {
    expect(screenKindOf(kinds(['Q11424']))).toBe('film');
    expect(screenKindOf(kinds(['Q24862']))).toBe('film');
    expect(screenKindOf(kinds(['Q20650540']))).toBe('film');
    expect(screenKindOf(kinds(['Q29168811']))).toBe('film');
    expect(screenKindOf(kinds(['Q5398426']))).toBe('series');
  });

  it('reconnaît un acteur et un réalisateur (humain) mais pas un autre métier', () => {
    expect(screenKindOf(kinds(['Q5'], ['Q33999']))).toBe('person');
    expect(screenKindOf(kinds(['Q5'], ['Q2526255']))).toBe('person');
    expect(screenKindOf(kinds(['Q5'], ['Q177220']))).toBeNull();
    expect(screenKindOf(kinds(['Q515'], ['Q33999']))).toBeNull();
  });

  it('rend null sans information ou pour une carte sans rapport', () => {
    expect(screenKindOf(undefined)).toBeNull();
    expect(screenKindOf(kinds(['Q482994']))).toBeNull();
  });

  it("préfère l'œuvre quand la nature est un film", () => {
    expect(screenKindOf(kinds(['Q11424', 'Q5'], ['Q33999']))).toBe('film');
  });
});

describe('personRoles', () => {
  it('distingue acteur, réalisateur, ou les deux', () => {
    expect(personRoles(kinds(['Q5'], ['Q33999']))).toEqual({ acting: true, directing: false });
    expect(personRoles(kinds(['Q5'], ['Q2526255']))).toEqual({ acting: false, directing: true });
    expect(personRoles(kinds(['Q5'], ['Q10800557', 'Q2059704']))).toEqual({ acting: true, directing: true });
    expect(personRoles(undefined)).toEqual({ acting: false, directing: false });
  });
});
