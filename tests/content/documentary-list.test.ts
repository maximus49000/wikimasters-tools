import { describe, expect, it } from 'vitest';
import { isPossible, shownList } from '../../src/content/documentary-list';
import type { DocCandidate } from '../../src/core/documentary/types';

const cand = (id: string): DocCandidate => ({ source: 'youtube', id, title: id, channel: 'C', durationSec: 3000, language: 'fr', description: '', url: `https://www.youtube.com/watch?v=${id}` });
const good = [cand('BON1'), cand('BON2')];
const possible = [cand('PEUT')];

describe('shownList', () => {
  it('ne montre que les proposées tant que le lien est fermé', () => {
    expect(shownList(good, possible, false).map((c) => c.id)).toEqual(['BON1', 'BON2']);
  });
  it('ajoute les possibles à la suite quand le lien est ouvert', () => {
    expect(shownList(good, possible, true).map((c) => c.id)).toEqual(['BON1', 'BON2', 'PEUT']);
  });
  it('sans vidéo proposée, ouvre directement les possibles', () => {
    expect(shownList([], possible, true).map((c) => c.id)).toEqual(['PEUT']);
    expect(shownList([], possible, false)).toEqual([]);
  });
});

describe('isPossible', () => {
  it('reconnaît une vidéo possible, pas une proposée', () => {
    expect(isPossible(cand('PEUT'), good, possible)).toBe(true);
    expect(isPossible(cand('BON1'), good, possible)).toBe(false);
    expect(isPossible(cand('BON1'), good, [cand('BON1')])).toBe(false);
  });
});
