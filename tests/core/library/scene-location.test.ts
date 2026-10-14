import { describe, expect, it } from 'vitest';
import { GEO, OFF, isSceneCity, isValidTimeZone, parseLocation, toSceneCity } from '../../../src/core/library/scene-location';

const TOKYO = { name: 'Tokyo', admin: 'Tokyo', country: 'Japon', lat: 35.69, lon: 139.69, tz: 'Asia/Tokyo' };
const city = (over: Record<string, unknown>) => JSON.stringify({ mode: 'city', city: { ...TOKYO, ...over } });

describe('lieu de la scène : lecture', () => {
  it('migration : ancienne clé « off » → désactivé ; absente ou « on » → géolocalisation', () => {
    expect(parseLocation(null, 'off')).toEqual({ mode: 'off' });
    expect(parseLocation(null, null)).toEqual({ mode: 'geo' });
    expect(parseLocation(null, 'on')).toEqual({ mode: 'geo' });
  });

  it('la nouvelle clé l’emporte sur l’ancienne', () => {
    expect(parseLocation('{"mode":"geo"}', 'off')).toBe(GEO);
  });

  it('relit les trois modes', () => {
    expect(parseLocation('{"mode":"geo"}', null)).toBe(GEO);
    expect(parseLocation('{"mode":"off"}', null)).toBe(OFF);
    expect(parseLocation(JSON.stringify({ mode: 'city', city: TOKYO }), null)).toEqual({ mode: 'city', city: TOKYO });
  });

  it('valeur cassée → géolocalisation, sans erreur', () => {
    for (const raw of [
      '{', 'null', '42', '"city"', '{"mode":"plage"}', '{"mode":"city"}',
      city({ tz: 'Mars/Olympus' }), city({ tz: undefined }), city({ lat: 95 }), city({ lon: -181 }), city({ lat: Number.NaN }),
      city({ name: '' }), city({ country: 3 }), city({ admin: 7 }),
    ]) expect(parseLocation(raw, 'off'), raw).toBe(GEO);
  });

  it('ne garde que les champs de la ville (population et champs inconnus écartés), région facultative', () => {
    expect(toSceneCity({ ...TOKYO, population: 9_000_000 })).toEqual(TOKYO);
    const { admin: _admin, ...noAdmin } = TOKYO;
    expect(toSceneCity(noAdmin)).toEqual(noAdmin);
    expect(parseLocation(JSON.stringify({ mode: 'city', city: { ...TOKYO, extra: 1 } }), null)).toEqual({ mode: 'city', city: TOKYO });
  });

  it('reconnaît un fuseau IANA valide', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isSceneCity(TOKYO)).toBe(true);
    expect(isSceneCity({ ...TOKYO, tz: 'Nulle/Part' })).toBe(false);
  });
});
