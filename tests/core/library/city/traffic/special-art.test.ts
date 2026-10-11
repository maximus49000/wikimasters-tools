import { describe, expect, it } from 'vitest';
import { SCRIPTED_IDS, SPECIAL_IDS, specialArt, specialExtent, specialKey, specialLook, type SpecialSpec } from '../../../../../src/core/library/city/traffic/special-art';
import { fallbackLine } from '../../../../../src/core/library/city/traffic/bus-lines';

const spec = (id: SpecialSpec['id'], seed = 3): SpecialSpec => ({ id, seed, ...(id === 'bus' ? { line: fallbackLine(seed) } : {}) });

describe('véhicules à part', () => {
  it.each(SPECIAL_IDS)('%s : roues au sol, un conducteur, déterministe, encombrement ≥ demi-longueur', (id) => {
    const a = specialArt(spec(id));
    expect(a.wheels.length).toBeGreaterThanOrEqual(2);
    for (const w of a.wheels) expect(w.r).toBeGreaterThan(1.5);
    expect(a.seats.filter((s) => s.role === 'driver')).toHaveLength(1);
    expect(specialArt(spec(id))).toBe(a);
    expect(specialExtent(spec(id))).toBeGreaterThanOrEqual(a.len / 2);
    expect(a.body.some((o) => o.k === 'piece')).toBe(true);
    expect(a.x0).toBeLessThan(0);
    expect(a.x1).toBeGreaterThan(0);
    expect(a.top).toBeLessThan(-10);
    expect(specialLook(spec(id)).arch).toBe(id);
  });
  it('bus : passagers derrière les vitres, une percée par vitre, girouette', () => {
    const a = specialArt(spec('bus'));
    expect(a.seats.filter((s) => s.role === 'rear').length).toBeGreaterThanOrEqual(5);
    expect(a.body.filter((o) => o.k === 'hole').length).toBeGreaterThanOrEqual(6);
    expect(a.body.some((o) => o.k === 'text' && o.text.startsWith(fallbackLine(3).ref))).toBe(true);
    for (const s of a.seats) {
      expect(s.x).toBeGreaterThanOrEqual(a.cabin!.x - 1);
      expect(s.x).toBeLessThanOrEqual(a.cabin!.x + a.cabin!.w + 1);
    }
  });
  it('bus : couleur de la ligne dans la clé', () => {
    const l = fallbackLine(3);
    expect(specialKey({ id: 'bus', seed: 3, line: l })).not.toBe(specialKey({ id: 'bus', seed: 3, line: { ...l, colour: '#123456' } }));
  });
  it('car scolaire : deux enfants par vitre', () => {
    const a = specialArt(spec('school-bus'));
    expect(a.seats.filter((s) => s.child).length).toBe(12);
  });
  it('services : gyrophares (police, ambulance, benne) ; taxi : lumineux fixe ; tram sans pot', () => {
    expect(specialArt(spec('police')).beacons.length).toBeGreaterThan(0);
    expect(specialArt(spec('ambulance')).beacons.length).toBe(2);
    expect(specialArt(spec('garbage')).beacons.length).toBeGreaterThan(0);
    expect(specialArt(spec('taxi')).beacons[0]!.off).toBeNull();
    expect(specialArt(spec('tram')).exhaust).toBeNull();
    expect(specialArt(spec('bus')).exhaust).not.toBeNull();
  });
  it('deux-roues : pilote en selle, par-dessus la machine ; benne : éboueurs debout', () => {
    for (const id of ['vespa', 'mobylette', 'triporteur', 'sidecar'] as const) expect(specialArt(spec(id)).seats[0]).toMatchObject({ role: 'driver', gait: 'mount' });
    for (const id of ['vespa', 'mobylette', 'triporteur'] as const) expect(specialArt(spec(id)).seats[0]!.over).toBe(true);
    expect(specialArt(spec('sidecar')).seats.length).toBe(2);
    expect(specialArt(spec('garbage')).seats.filter((s) => s.gait === 'stand' && s.over)).toHaveLength(2);
  });
  it('étiquette du Type H dans la clé et la peinture', () => {
    const s: SpecialSpec = { id: 'type-h', seed: 1, label: 'FLEURS' };
    expect(specialKey(s)).toContain('FLEURS');
    expect(specialArt(s).body.some((o) => o.k === 'text' && o.text === 'FLEURS')).toBe(true);
  });
});

describe('véhicules scénarisés (V5)', () => {
  it('aux cotes du sprite classique', () => {
    const wx = (id: SpecialSpec['id']): number[] => specialArt({ id, seed: 1 }).wheels.map((w) => w.x);
    expect(wx('crew-van')).toEqual([-14, 15]);
    expect(wx('flatbed')).toEqual([-33, -22, 36]);
    expect(wx('lift')).toEqual([-20, 22]);
    expect(wx('moving-truck')).toEqual([-20, 22]);
    expect(wx('army-truck')).toEqual([-20, -10, 17]);
    expect(wx('fire-truck')).toEqual([-34, -14, 30]);
    expect(wx('tank')).toHaveLength(6);
    const van = specialArt({ id: 'crew-van', seed: 1 });
    expect(van.x0).toBeGreaterThanOrEqual(-26.5);
    expect(van.x1).toBeLessThanOrEqual(27.5);
  });
  it('teinte d’armée dans la clé et la peinture', () => {
    expect(specialKey({ id: 'army-jeep', seed: 1, paint: '#4B5320' })).not.toBe(specialKey({ id: 'army-jeep', seed: 1, paint: '#B49A6A' }));
    expect(specialArt({ id: 'army-jeep', seed: 1, paint: '#B49A6A' }).body.some((o) => o.k === 'piece' && o.color === '#B49A6A')).toBe(true);
  });
  it('uniformes : tenue imposée aux occupants du défilé, pas à ceux des équipes', () => {
    for (const id of ['army-jeep', 'army-truck', 'tank', 'fire-truck', 'garde-moto'] as const) for (const s of specialArt({ id, seed: 2 }).seats) expect(s.outfit).toBeDefined();
    expect(specialArt({ id: 'crew-van', seed: 2 }).seats[0]!.outfit).toBeUndefined();
  });
  it('chef de bord debout (jeep, char), motard en selle par-dessus la machine, gyrophares pompiers et nacelle', () => {
    expect(specialArt({ id: 'army-jeep', seed: 1 }).seats.some((s) => s.gait === 'stand')).toBe(true);
    expect(specialArt({ id: 'tank', seed: 1 }).seats[0]).toMatchObject({ gait: 'stand' });
    expect(specialArt({ id: 'garde-moto', seed: 1 }).seats[0]).toMatchObject({ gait: 'mount', over: true });
    expect(specialArt({ id: 'fire-truck', seed: 1 }).beacons).toHaveLength(2);
    expect(specialArt({ id: 'lift', seed: 1 }).beacons).toHaveLength(1);
  });
  it.each(SCRIPTED_IDS)('%s : dans SPECIAL_IDS', (id) => expect(SPECIAL_IDS).toContain(id));
});
