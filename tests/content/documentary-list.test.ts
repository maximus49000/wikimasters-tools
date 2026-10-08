import { describe, expect, it } from 'vitest';
import { allVideos, isPossible } from '../../src/content/documentary-list';
import type { DocCandidate } from '../../src/core/documentary/types';

const cand = (id: string): DocCandidate => ({ source: 'youtube', id, title: id, channel: 'C', durationSec: 3000, language: 'fr', description: '', url: `https://www.youtube.com/watch?v=${id}` });
const good = [cand('BON1'), cand('BON2')];
const possible = [cand('PEUT')];

describe('allVideos', () => {
  it('met les proposées d’abord, puis les possibles', () => {
    expect(allVideos(good, possible).map((c) => c.id)).toEqual(['BON1', 'BON2', 'PEUT']);
  });
  it('sans doublon et sans proposée', () => {
    expect(allVideos(good, [cand('BON1'), cand('PEUT')]).map((c) => c.id)).toEqual(['BON1', 'BON2', 'PEUT']);
    expect(allVideos([], possible).map((c) => c.id)).toEqual(['PEUT']);
  });
});

describe('isPossible', () => {
  it('reconnaît une vidéo possible, pas une proposée', () => {
    expect(isPossible(cand('PEUT'), good, possible)).toBe(true);
    expect(isPossible(cand('BON1'), good, possible)).toBe(false);
    expect(isPossible(cand('BON1'), good, [cand('BON1')])).toBe(false);
  });
});
