import { describe, expect, it } from 'vitest';
import { BOX_FORMATS, caseStyleOfPlatformName, consoleLabelOf, caseStyleOfTgdbPlatform, formatOfPlatformName, formatOfTgdbPlatform, type BoxFormat } from '../../../src/core/game/platform-boxes';

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
    for (const id of [4980, 12, 4920, 4981]) expect(formatOfTgdbPlatform(id)).toBe('bluray');
    for (const id of [15, 9, 11, 14]) expect(formatOfTgdbPlatform(id)).toBe('dvd');
    for (const id of [17, 16]) expect(formatOfTgdbPlatform(id)).toBe('cd-jewel');
    expect(formatOfTgdbPlatform(8)).toBe('ds');
  });
  it('retombe sur generic', () => {
    expect(formatOfTgdbPlatform(4916)).toBe('generic');
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
    expect(formatOfPlatformName('')).toBe('generic');
    for (const n of ['PC Engine', 'NEC PC-8801', 'Windows Phone', 'PlayStation VR', 'PlayStation Now']) expect(formatOfPlatformName(n), n).toBe('generic');
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

describe('styles par console', () => {
  it('couleur propre à la console (TheGamesDB)', () => {
    expect(caseStyleOfTgdbPlatform(4920).plastic).toBe('#107C10');
    expect(caseStyleOfTgdbPlatform(9).plastic).toBe('#F2F2F0');
    expect(caseStyleOfTgdbPlatform(4919).plastic).toBe('#1F4C9E');
    expect(caseStyleOfTgdbPlatform(4971).band?.label).toBe('NINTENDO SWITCH');
    expect(caseStyleOfTgdbPlatform(4980).band?.label).toBe('PS5');
    expect(caseStyleOfTgdbPlatform(999999)).toEqual({ plastic: BOX_FORMATS.generic.plastic, band: BOX_FORMATS.generic.band });
  });
  it('couleur propre à la console (nom)', () => {
    expect(caseStyleOfPlatformName('Xbox One').plastic).toBe('#107C10');
    expect(caseStyleOfPlatformName('Xbox One').band?.label).toBe('XBOX ONE');
    expect(caseStyleOfPlatformName('Wii U').band?.label).toBe('Wii U');
    expect(caseStyleOfPlatformName('PlayStation 4').band?.label).toBe('PS4');
  });
});

describe('consoleLabelOf', () => {
  it('nom court de la console, imprimé sur la fiche de la boîte ouverte', () => {
    expect(consoleLabelOf('Sony Playstation 4')).toBe('PS4');
    expect(consoleLabelOf('Nintendo Switch')).toBe('Switch');
    expect(consoleLabelOf('Microsoft Xbox One')).toBe('Xbox One');
    expect(consoleLabelOf('Nintendo 3DS')).toBe('3DS');
    expect(consoleLabelOf('Sony Playstation Portable')).toBe('PSP');
    expect(consoleLabelOf('PC (Microsoft Windows)')).toBe('PC');
    expect(consoleLabelOf('Neo Geo')).toBe('Neo Geo');
  });
});

describe('consoles à cartouche (boîtes en carton ou clapet, cartouche dedans)', () => {
  it('ids TheGamesDB : SNES, N64, NES, Game Boy (Color), GBA, Mega Drive', () => {
    expect(formatOfTgdbPlatform(6)).toBe('snes');
    expect(formatOfTgdbPlatform(3)).toBe('n64');
    expect(formatOfTgdbPlatform(7)).toBe('nes');
    expect(formatOfTgdbPlatform(4)).toBe('gb');
    expect(formatOfTgdbPlatform(41)).toBe('gb');
    expect(formatOfTgdbPlatform(5)).toBe('gba');
    expect(formatOfTgdbPlatform(18)).toBe('genesis');
  });

  it('noms IGDB/Steam : la plus précise d’abord (Super Nintendo avant NES, Advance avant Game Boy)', () => {
    expect(formatOfPlatformName('Super Nintendo Entertainment System')).toBe('snes');
    expect(formatOfPlatformName('Super Nintendo (SNES)')).toBe('snes');
    expect(formatOfPlatformName('Super Famicom')).toBe('snes');
    expect(formatOfPlatformName('Nintendo Entertainment System')).toBe('nes');
    expect(formatOfPlatformName('Nintendo Entertainment System (NES)')).toBe('nes');
    expect(formatOfPlatformName('Nintendo 64')).toBe('n64');
    expect(formatOfPlatformName('Game Boy Advance')).toBe('gba');
    expect(formatOfPlatformName('Nintendo Game Boy Advance')).toBe('gba');
    expect(formatOfPlatformName('Game Boy Color')).toBe('gb');
    expect(formatOfPlatformName('Game Boy')).toBe('gb');
    expect(formatOfPlatformName('Sega Mega Drive/Genesis')).toBe('genesis');
    expect(formatOfPlatformName('Sega Genesis')).toBe('genesis');
  });

  it('SNES et N64 en largeur, comme leurs scans (WWF Super WrestleMania 974×720, Powerpuff Girls N64 986×720)', () => {
    const ratio = (f: BoxFormat) => BOX_FORMATS[f].w / BOX_FORMATS[f].h;
    expect(ratio('snes')).toBeGreaterThan(1.3);
    expect(ratio('n64')).toBeGreaterThan(1.3);
    expect(ratio('gba')).toBeGreaterThan(1);
    expect(ratio('nes')).toBeLessThan(1);
    expect(ratio('genesis')).toBeLessThan(1);
    for (const f of ['snes', 'n64', 'nes', 'gb', 'gba', 'genesis'] as BoxFormat[]) {
      const t = BOX_FORMATS[f];
      expect(t.support.kind).toBe('cart');
      if (t.support.kind === 'cart') {
        expect(t.support.w).toBeLessThan(t.w);
        expect(t.support.h).toBeLessThan(t.h);
      }
    }
  });

  it('abréviations seules (« PS4 », « PSP », « NDS ») : mots entiers, pas des caractères de contrôle', () => {
    expect(formatOfPlatformName('PS4')).toBe('bluray');
    expect(formatOfPlatformName('PSP')).toBe('psp');
    expect(formatOfPlatformName('PSX')).toBe('cd-jewel');
    expect(formatOfPlatformName('NDS')).toBe('ds');
    expect(formatOfPlatformName('N64')).toBe('n64');
    expect(formatOfPlatformName('GBA')).toBe('gba');
  });

  it('noms courts sur le dos et la fiche', () => {
    expect(consoleLabelOf('Super Nintendo (SNES)')).toBe('Super Nintendo');
    expect(consoleLabelOf('Nintendo 64')).toBe('N64');
    expect(consoleLabelOf('Nintendo Game Boy Advance')).toBe('GBA');
    expect(consoleLabelOf('Nintendo Game Boy Color')).toBe('Game Boy Color');
    expect(consoleLabelOf('Nintendo Entertainment System (NES)')).toBe('NES');
    expect(consoleLabelOf('Sega Genesis')).toBe('Mega Drive');
  });
});
