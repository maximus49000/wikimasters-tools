// tests/core/citizens/emotion.test.ts — émotions sans three.js (scènes) : table des gestes, humeur de fond.
import { describe, expect, it } from 'vitest';
import { emotionFor, moodOf } from '../../../src/core/citizens/emotion';
import { emotionFor as fromFace } from '../../../src/core/citizens/face';
import { citizenSeed, kindOfProfile } from '../../../src/core/citizens/identity';

describe('emotion (sans three.js)', () => {
  it('face.ts ré-exporte la même table', () => {
    expect(fromFace).toBe(emotionFor);
    expect(emotionFor('pay-card', 'neutre')).toBe('content');
  });
  it('humeur de fond : stable par graine, seulement neutre ou content, les deux présentes', () => {
    const moods = Array.from({ length: 400 }, (_, i) => moodOf(citizenSeed(`c-${i}`)));
    expect(new Set(moods)).toEqual(new Set(['neutre', 'content']));
    for (let i = 0; i < 20; i++) expect(moodOf(i)).toBe(moodOf(i));
    const content = moods.filter((m) => m === 'content').length / moods.length;
    expect(content).toBeGreaterThan(0.25);
    expect(content).toBeLessThan(0.55);
  });
  it('identité : graine stable par id ; profil enfant → corps d’enfant, sinon tirage', () => {
    expect(citizenSeed('ped-3')).toBe(citizenSeed('ped-3'));
    expect(citizenSeed('ped-3')).not.toBe(citizenSeed('ped-4'));
    expect(kindOfProfile('child')).toBe('child');
    for (const p of ['suit', 'jogger', 'ordinary', 'stroller', 'worker'] as const) expect(kindOfProfile(p)).toBeUndefined();
  });
});
