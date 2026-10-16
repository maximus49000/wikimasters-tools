import { describe, expect, it } from 'vitest';
import { BOX_FORMATS, formatOfPlatformName, formatOfTgdbPlatform, type BoxFormat } from '../../../src/core/game/platform-boxes';

describe('formatOfTgdbPlatform', () => {
  it('associe les ids TheGamesDB aux formats', () => {
    expect(formatOfTgdbPlatform(4971)).toBe('switch');
    expect(formatOfTgdbPlatform(4919)).toBe('bluray');
    expect(formatOfTgdbPlatform(38)).toBe('dvd');
    expect(formatOfTgdbPlatform(1)).toBe('dvd');
    expect(formatOfTgdbPlatform(2)).toBe('gamecube');
    expect(formatOfTgdbPlatform(4912)).toBe('ds');
    expect(formatOfTgdbPlatform(13)).toBe('psp');
    expect(formatOfTgdbPlatform(39)).toBe('vita');
    expect(formatOfTgdbPlatform(10)).toBe('cd-jewel');
  });
  it('retombe sur generic', () => {
    expect(formatOfTgdbPlatform(6)).toBe('generic');
    expect(formatOfTgdbPlatform(4916)).toBe('generic');
    expect(formatOfTgdbPlatform(41)).toBe('generic');
    expect(formatOfTgdbPlatform(999999)).toBe('generic');
  });
});

describe('formatOfPlatformName', () => {
  it('reconnaît les noms IGDB/Steam', () => {
    expect(formatOfPlatformName('Nintendo Switch')).toBe('switch');
    expect(formatOfPlatformName('PlayStation 4')).toBe('bluray');
    expect(formatOfPlatformName('PlayStation 5')).toBe('bluray');
    expect(formatOfPlatformName('PC (Microsoft Windows)')).toBe('dvd');
    expect(formatOfPlatformName('Xbox One')).toBe('bluray');
    expect(formatOfPlatformName('Xbox 360')).toBe('dvd');
    expect(formatOfPlatformName('Xbox')).toBe('dvd');
    expect(formatOfPlatformName('PlayStation 2')).toBe('dvd');
    expect(formatOfPlatformName('PlayStation')).toBe('cd-jewel');
    expect(formatOfPlatformName('PlayStation Portable')).toBe('psp');
    expect(formatOfPlatformName('PlayStation Vita')).toBe('vita');
    expect(formatOfPlatformName('Wii U')).toBe('dvd');
    expect(formatOfPlatformName('Nintendo 3DS')).toBe('ds');
    expect(formatOfPlatformName('Nintendo GameCube')).toBe('gamecube');
    expect(formatOfPlatformName('Dreamcast')).toBe('cd-jewel');
  });
  it('retombe sur generic', () => {
    expect(formatOfPlatformName('Super Nintendo Entertainment System')).toBe('generic');
    expect(formatOfPlatformName('')).toBe('generic');
  });
});

describe('BOX_FORMATS', () => {
  it('chaque support tient dans la boîte', () => {
    for (const f of Object.keys(BOX_FORMATS) as BoxFormat[]) {
      const b = BOX_FORMATS[f];
      const s = b.support;
      const sw = s.kind === 'disc' ? s.d : s.w;
      const sh = s.kind === 'disc' ? s.d : s.h;
      expect(sw, f).toBeLessThanOrEqual(b.w);
      expect(sh, f).toBeLessThanOrEqual(b.h);
    }
  });
});
