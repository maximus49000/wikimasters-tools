import { describe, expect, it } from 'vitest';
import { STYLE_IDS } from '../../../src/core/library/library-types';
import { STYLE_LABELS, decorOf, paletteOf } from '../../../src/core/library/styles';

describe('styles', () => {
  it('chaque style a une palette complète et distincte de Scandinave', () => {
    const base = paletteOf('scandinave');
    for (const id of STYLE_IDS) {
      const palette = paletteOf(id);
      for (const key of Object.keys(base) as (keyof typeof base)[]) {
        expect(palette[key], `${id}.${key}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      if (id !== 'scandinave') expect(palette.wall, id).not.toBe(base.wall);
    }
  });

  it('chaque style a un nom et un décor ; seul Néon a un halo', () => {
    for (const id of STYLE_IDS) {
      expect(STYLE_LABELS[id], id).not.toBe('');
      expect(decorOf(id).accent, id).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(STYLE_IDS.filter((id) => decorOf(id).glow !== undefined)).toEqual(['neon']);
    expect(decorOf('steampunk')).toMatchObject({ wall: 'brass', floor: 'plates' });
  });
});
