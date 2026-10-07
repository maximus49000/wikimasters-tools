import { describe, expect, it } from 'vitest';
import { ENTRIES } from '../../../src/core/whats-new/entries';
import { THEMES } from '../../../src/core/whats-new/types';

describe('catalogue des fiches', () => {
  it('a des identifiants uniques et des champs renseignés', () => {
    const ids = ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const themes = new Set(THEMES.map((t) => t.id));
    for (const e of ENTRIES) {
      expect(e.title.trim(), e.id).not.toBe('');
      expect(e.summary.trim(), e.id).not.toBe('');
      expect(e.glyph.trim(), e.id).not.toBe('');
      expect(themes.has(e.theme), e.id).toBe(true);
      expect(e.steps.length, e.id).toBeGreaterThan(0);
      for (const s of e.steps) {
        expect(s.title.trim(), e.id).not.toBe('');
        expect(s.text.trim(), e.id).not.toBe('');
        if (s.target !== null) expect(s.target.trim(), e.id).not.toBe('');
      }
    }
  });

  it('une seule fiche est annoncée au premier lancement (celle de WikiHow)', () => {
    expect(ENTRIES.filter((e) => e.fresh).map((e) => e.id)).toEqual(['wikihow']);
  });
});
