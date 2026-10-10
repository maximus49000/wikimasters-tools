import { describe, expect, it } from 'vitest';
import { formatNotes, isNewerRelease, latestTag } from '../../scripts/release-notes.mjs';

describe('latestTag', () => {
  it('choisit le livrable précédent du canal, le plus grand numéro', () => {
    expect(latestTag(['android-9', 'android-10', 'android-2', 'android-x', 'autre-99', ''], 'android-')).toBe('android-10');
  });

  it('ne rend rien sans livrable précédent', () => {
    expect(latestTag([''], 'preprod-')).toBeUndefined();
  });
});

describe('formatNotes', () => {
  it('range les nouveautés et les corrections, sans préfixe technique', () => {
    expect(formatNotes(['feat: un bouton Toile', 'fix(android): le bouton marche', 'test: couverture', 'docs: plan'])).toBe(
      'Nouveautés\n• Un bouton Toile\n\nCorrections\n• Le bouton marche',
    );
  });

  it('ne rend rien quand il n\'y a que des changements internes', () => {
    expect(formatNotes(['test: x', 'chore: y', 'Merge pull request #1'])).toBe('');
  });

  it('raccourcit les sujets trop longs', () => {
    expect(formatNotes([`feat: ${'a'.repeat(300)}`]).split('\n')[1]).toHaveLength(162);
  });
});

describe('isNewerRelease', () => {
  it('exige un numéro supérieur au dernier livrable du canal', () => {
    expect(isNewerRelease(660, ['android-659', 'android-12'], 'android-')).toBe(true);
    expect(isNewerRelease('659', ['android-659'], 'android-')).toBe(false);
    expect(isNewerRelease(600, ['android-659'], 'android-')).toBe(false);
  });

  it('accepte le premier livrable', () => {
    expect(isNewerRelease(1, [''], 'android-')).toBe(true);
  });
});
