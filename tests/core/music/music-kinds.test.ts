import { describe, expect, it } from 'vitest';
import { musicKindOf } from '../../../src/core/music/music-kinds';

const kinds = (natures: string[], occupations: string[] = []) => ({ natures, occupations, genres: [] });

describe('musicKindOf', () => {
  it('reconnaît un morceau, un single, un album', () => {
    expect(musicKindOf(kinds(['Q7366']))).toBe('track');
    expect(musicKindOf(kinds(['Q134556']))).toBe('track');
    expect(musicKindOf(kinds(['Q482994']))).toBe('album');
    expect(musicKindOf(kinds(['Q208569']))).toBe('album');
  });

  it('reconnaît un groupe, et une personne musicienne ou chanteuse', () => {
    expect(musicKindOf(kinds(['Q215380']))).toBe('artist');
    expect(musicKindOf(kinds(['Q9212979', 'Q109288825']))).toBe('artist');
    expect(musicKindOf(kinds(['Q5741069']))).toBe('artist');
    expect(musicKindOf(kinds(['Q216337']))).toBe('artist');
    expect(musicKindOf(kinds(['Q5'], ['Q177220']))).toBe('artist');
    expect(musicKindOf(kinds(['Q5'], ['Q33999', 'Q639669']))).toBe('artist');
  });

  it("ignore les autres cartes, dont les personnes sans métier musical, ou sans donnée", () => {
    expect(musicKindOf(kinds(['Q5'], ['Q33999']))).toBeNull();
    expect(musicKindOf(kinds(['Q11424']))).toBeNull();
    expect(musicKindOf(undefined)).toBeNull();
  });

  it('donne la priorité à l\'œuvre quand plusieurs natures coexistent', () => {
    expect(musicKindOf(kinds(['Q482994', 'Q7366']))).toBe('album');
  });
});
