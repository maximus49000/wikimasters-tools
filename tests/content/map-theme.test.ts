import { describe, expect, it } from 'vitest';
import { isDarkColor } from '../../src/content/map-theme';

describe('isDarkColor', () => {
  it('reconnaît un fond sombre', () => {
    expect(isDarkColor('rgb(13, 17, 23)')).toBe(true);
    expect(isDarkColor('rgba(13, 17, 23, 1)')).toBe(true);
  });

  it('reconnaît un fond clair', () => {
    expect(isDarkColor('rgb(255, 255, 255)')).toBe(false);
  });

  it('renvoie null pour un fond transparent ou illisible', () => {
    expect(isDarkColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(isDarkColor('transparent')).toBeNull();
    expect(isDarkColor('')).toBeNull();
  });
});
