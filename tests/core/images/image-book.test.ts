import { describe, expect, it } from 'vitest';
import { addCandidates, markArtChecked, rejectCurrent, setFound } from '../../../src/core/images/image-book';

describe('image-book', () => {
  it('mémorise le moment où la pochette officielle a été cherchée sans rien trouver', () => {
    expect(setFound({}, 'A', ['u1'], false, 5_000).A).toEqual({ url: 'u1', candidates: ['u1'], rejected: [], artCheckedAt: 5_000 });
    // Pochette trouvée : elle est gardée pour toujours, inutile de dater une recherche.
    expect(setFound({}, 'A', ['u1'], true, 5_000).A).toEqual({ url: 'u1', candidates: ['u1'], rejected: [], art: true });
  });
  it("date une recherche de pochette sans toucher à l'image de la carte", () => {
    expect(markArtChecked(setFound({}, 'A', ['u1']), 'A', 7_000).A).toEqual({ url: 'u1', candidates: ['u1'], rejected: [], artCheckedAt: 7_000 });
    expect(markArtChecked({}, 'B', 1)).toEqual({});
  });
  it('affiche le premier candidat', () => {
    expect(setFound({}, 'A', ['u1', 'u2']).A).toEqual({ url: 'u1', candidates: ['u1', 'u2'], rejected: [] });
  });
  it('mémorise « rien trouvé » avec url null', () => {
    expect(setFound({}, 'A', []).A?.url).toBeNull();
  });
  it('« Mauvaise image » écarte l’image affichée et passe à la suivante', () => {
    const next = rejectCurrent(setFound({}, 'A', ['u1', 'u2']), 'A');
    expect(next.A).toEqual({ url: 'u2', candidates: ['u1', 'u2'], rejected: ['u1'] });
  });
  it('plus de candidat : url null, les écartés restent écartés', () => {
    const next = rejectCurrent(rejectCurrent(setFound({}, 'A', ['u1']), 'A'), 'A');
    expect(next.A?.url).toBeNull();
    expect(addCandidates(next, 'A', ['u1', 'u3']).A).toMatchObject({ url: 'u3', rejected: ['u1'] });
  });
});
