import { describe, expect, it } from 'vitest';
import { LIGHT_SCALE, buildLightMap, type LightInput } from '../../../src/core/library/light/light-map';
import { buildSurfaceMap, SURF } from '../../../src/core/library/light/surfaces';
import type { Box, LampSource } from '../../../src/core/library/light/occluders';

const base: LightInput = {
  width: 600, height: 510, wallH: 340,
  windows: [{ x: 100, y: 60, w: 60, h: 100 }],
  sunX: 130, sunFrac: 0.5, daylight: 1, twilight: 0, cloud: 0, precip: 0, hidden: 0,
};
const at = (m: { w: number; rgba: Uint8ClampedArray }, x: number, y: number): number[] => {
  const i = (Math.floor(y / LIGHT_SCALE) * m.w + Math.floor(x / LIGHT_SCALE)) * 4;
  return [m.rgba[i]!, m.rgba[i + 1]!, m.rgba[i + 2]!, m.rgba[i + 3]!];
};

describe('buildLightMap', () => {
  it('ne grise pas la vue à travers le verre, même la nuit', () => {
    const m = buildLightMap({ ...base, daylight: 0, sunFrac: null, sunX: null });
    expect(at(m, 130, 110)[3]).toBe(0);
    expect(at(m, 130, 200)[3]!).toBeGreaterThan(0);
  });
  it('donne le même résultat avec le cache de lumière du ciel', () => {
    const a = buildLightMap(base);
    const b = buildLightMap({ ...base, windows: [...base.windows] });
    expect(Array.from(b.rgba)).toEqual(Array.from(a.rgba));
  });
  it('a la taille de la pièce réduite et 4 octets par pixel', () => {
    const m = buildLightMap(base);
    expect(m.w).toBe(Math.ceil(600 / LIGHT_SCALE));
    expect(m.h).toBe(Math.ceil(510 / LIGHT_SCALE));
    expect(m.rgba).toHaveLength(m.w * m.h * 4);
  });
  it('est plus sombre loin de la fenêtre que près d’elle (sur le mur)', () => {
    const m = buildLightMap({ ...base, sunFrac: null, sunX: null });
    expect(at(m, 130, 120)[3]!).toBeLessThan(at(m, 560, 120)[3]!);
  });
  it('est plus sombre la nuit que le jour', () => {
    const day = buildLightMap({ ...base, sunFrac: null, sunX: null });
    const night = buildLightMap({ ...base, sunFrac: null, sunX: null, daylight: 0 });
    expect(at(night, 300, 120)[3]!).toBeGreaterThan(at(day, 300, 120)[3]!);
  });
  it('pose un rayon chaud sur le sol quand le soleil est levé, pas sans soleil', () => {
    // le rayon tombe sur le sol (y > 340) ; « chaud » = rouge − bleu nettement plus haut que sans soleil
    const withSun = buildLightMap({ ...base, sunFrac: 0.3 });
    const noSun = buildLightMap({ ...base, sunFrac: null, sunX: null });
    let warm = false;
    for (let y = 345; y < 510 && !warm; y += LIGHT_SCALE) for (let x = 0; x < 600; x += LIGHT_SCALE) {
      const [r, , b] = at(withSun, x, y);
      const [r0, , b0] = at(noSun, x, y);
      if (r! - b! > r0! - b0! + 15) { warm = true; break; }
    }
    expect(warm).toBe(true);
    const warmCount = (m: { rgba: Uint8ClampedArray }) => { let n = 0; for (let i = 0; i < m.rgba.length; i += 4) if (m.rgba[i]! - m.rgba[i + 2]! > 0) n++; return n; };
    const noSunFrac = buildLightMap({ ...base, sunFrac: null });
    const noSunX = buildLightMap({ ...base, sunX: null, sunFrac: 0.3 });
    expect(warmCount(noSun)).toBe(0);
    expect(Array.from(noSunFrac.rgba)).toEqual(Array.from(noSun.rgba));
    expect(Array.from(noSunX.rgba)).toEqual(Array.from(noSun.rgba));
  });
  it('le rayon n’assombrit jamais', () => {
    const withSun = buildLightMap({ ...base, sunFrac: 0.3 });
    const noSun = buildLightMap({ ...base, sunFrac: null, sunX: null });
    for (let i = 3; i < withSun.rgba.length; i += 4) expect(withSun.rgba[i]!).toBeLessThanOrEqual(noSun.rgba[i]!);
  });
  it('un soleil masqué supprime le rayon', () => {
    const warmCount = (m: { rgba: Uint8ClampedArray }) => { let n = 0; for (let i = 0; i < m.rgba.length; i += 4) if (m.rgba[i]! - m.rgba[i + 2]! > 20) n++; return n; };
    const clear = buildLightMap({ ...base, sunFrac: 0.3 });
    const hidden = buildLightMap({ ...base, sunFrac: 0.3, hidden: 1 });
    expect(warmCount(clear)).toBeGreaterThan(0);
    expect(warmCount(hidden)).toBe(0);
  });
  it('est déterministe', () => {
    expect(Array.from(buildLightMap(base).rgba)).toEqual(Array.from(buildLightMap(base).rgba));
  });

  describe('ombres et lampes (8b)', () => {
    const warm = (m: { rgba: Uint8ClampedArray }, i: number): boolean => m.rgba[i * 4 + 3]! > 0 && m.rgba[i * 4]! - m.rgba[i * 4 + 2]! > 20;
    const geom = { wallH: 340, floorH: 170 };
    const sun = { ...base, sunFrac: 0.3 };
    // Une table large devant la tache de soleil (profondeur 144..224) : son ombre tombe dans la tache.
    const table: Box = { owner: 't', x0: 0, x1: 600, d0: 120, d1: 140, z0: 0, z1: 100 };
    const lamp: LampSource = { id: 'l', x: 560, d: 200, z: 80, box: 'l' };
    const yLamp = 340 + 200 * (170 / 680);

    it('sans boîtes ni lampes, la sortie est identique à 8a', () => {
      const a = buildLightMap(sun);
      const b = buildLightMap({ ...sun, boxes: [], lamps: [] });
      expect(Array.from(b.rgba)).toEqual(Array.from(a.rgba));
    });
    it('une table creuse la tache au sol derrière elle, son dessus est chaud, sa face avant non', () => {
      const free = buildLightMap(sun);
      const withTable = buildLightMap({ ...sun, boxes: [table] });
      const surf = buildSurfaceMap([table], 600, 510, geom, LIGHT_SCALE);
      let groundLost = 0; let topWarm = 0; let topN = 0; let frontWarm = 0;
      for (let n = 0; n < surf.w * surf.h; n++) {
        const k = surf.kind[n];
        if (k === SURF.ground && warm(free, n) && !warm(withTable, n)) groundLost++;
        if (k === SURF.top) { topN++; if (warm(withTable, n)) topWarm++; }
        if (k === SURF.front && warm(withTable, n)) frontWarm++;
      }
      expect(groundLost).toBeGreaterThan(0);
      expect(topN).toBeGreaterThan(0);
      expect(topWarm).toBeGreaterThan(0);
      expect(frontWarm).toBe(0);
    });
    it('est déterministe et stable avec des boîtes et des lampes', () => {
      const a = buildLightMap({ ...sun, boxes: [table], lamps: [lamp] });
      const b = buildLightMap({ ...sun, boxes: [{ ...table }], lamps: [{ ...lamp }] });
      expect(Array.from(b.rgba)).toEqual(Array.from(a.rgba));
    });
    it('une lampe la nuit éclaire et réchauffe près d’elle, pas loin', () => {
      const night = { ...base, daylight: 0, sunFrac: null, sunX: null };
      const off = buildLightMap(night);
      const on = buildLightMap({ ...night, lamps: [lamp] });
      const near = at(on, 560, yLamp); const nearOff = at(off, 560, yLamp);
      const far = at(on, 20, yLamp); const farOff = at(off, 20, yLamp);
      expect(near[3]!).toBeLessThan(nearOff[3]! - 20);
      expect(near[0]! - near[2]!).toBeGreaterThan(nearOff[0]! - nearOff[2]!);
      expect(far[3]!).toBe(farOff[3]);
    });
    it('en plein jour clair la même lampe ne change presque rien', () => {
      const off = buildLightMap(base);
      const on = buildLightMap({ ...base, lamps: [lamp] });
      for (const x of [560, 520]) expect(Math.abs(at(on, x, yLamp)[3]! - at(off, x, yLamp)[3]!) / 255).toBeLessThan(0.05);
    });
    it('sans soleil, les lampes éclairent quand même', () => {
      const nosun = { ...base, daylight: 0.5, sunFrac: null, sunX: null, cloud: 0.5 };
      const off = buildLightMap(nosun);
      const on = buildLightMap({ ...nosun, lamps: [lamp] });
      expect(at(on, 560, yLamp)[3]!).toBeLessThan(at(off, 560, yLamp)[3]!);
    });
  });
});

describe('buildLightMap avec des animaux', () => {
  const furniture: Box[] = [{ owner: 'f', x0: 400, x1: 440, d0: 40, d1: 70, z0: 0, z1: 20 }];
  const lamp: LampSource = { id: 'l', x: 300, d: 120, z: 60, box: 'l' };
  const wide = { ...base, sunFrac: 0.3, boxes: furniture, lamps: [lamp] };
  // Un animal sur la trajectoire du rayon (tache de soleil vers x 100-160, y 378-390), au sol, devant la fenêtre.
  const pet: Box[] = [{ owner: 'p1', x0: 110, x1: 150, d0: 120, d1: 160, z0: 0, z1: 36 }];

  it('est identique bit à bit sans animal, liste vide comprise', () => {
    const ref = buildLightMap(wide);
    expect(Array.from(buildLightMap({ ...wide, pets: [] }).rgba)).toEqual(Array.from(ref.rgba));
    expect(Array.from(buildLightMap({ ...wide, pets: undefined }).rgba)).toEqual(Array.from(ref.rgba));
  });
  it('ne change que des pixels : jamais ceux loin de l’animal et de son ombre', () => {
    const ref = buildLightMap(wide);
    const withPet = buildLightMap({ ...wide, pets: pet });
    expect(Array.from(withPet.rgba)).not.toEqual(Array.from(ref.rgba));
    // Le coin droit de la pièce, loin de la fenêtre et de l'animal, reste identique.
    expect(at(withPet, 580, 480)).toEqual(at(ref, 580, 480));
  });
  it('déplace l’ombre quand l’animal bouge', () => {
    const a = buildLightMap({ ...wide, pets: pet });
    const moved = pet.map((b) => ({ ...b, x0: b.x0 + 60, x1: b.x1 + 60 }));
    const b = buildLightMap({ ...wide, pets: moved });
    expect(Array.from(a.rgba)).not.toEqual(Array.from(b.rgba));
  });
  it('fonctionne sans meuble (animaux seuls) et avec une lampe seule', () => {
    const solo = buildLightMap({ ...base, sunFrac: 0.3, pets: pet });
    expect(solo.rgba.some((v) => v !== 0)).toBe(true);
    const lampOnly = buildLightMap({ ...base, sunFrac: null, sunX: null, lamps: [lamp], pets: pet });
    expect(Array.from(lampOnly.rgba)).not.toEqual(Array.from(buildLightMap({ ...base, sunFrac: null, sunX: null, lamps: [lamp] }).rgba));
  });
  it('assombrit derrière l’animal : l’alpha d’un pixel dans son ombre augmente', () => {
    const ref = buildLightMap({ ...wide, pets: undefined });
    const withPet = buildLightMap({ ...wide, pets: pet });
    let darker = 0;
    for (let y = 345; y < 510; y += LIGHT_SCALE) for (let x = 90; x < 200; x += LIGHT_SCALE) {
      if (at(withPet, x, y)[3]! > at(ref, x, y)[3]!) darker++;
    }
    expect(darker).toBeGreaterThan(0);
  });
  it('reste rapide : pièce de 96 colonnes, 3 meubles, 1 lampe, 3 animaux (< 60 ms à chaud)', () => {
    const big: LightInput = {
      ...base, width: 2880, sunFrac: 0.3,
      windows: [{ x: 400, y: 60, w: 60, h: 100 }, { x: 1400, y: 60, w: 60, h: 100 }],
      boxes: [
        { owner: 'a', x0: 400, x1: 440, d0: 40, d1: 70, z0: 0, z1: 20 },
        { owner: 'b', x0: 1000, x1: 1060, d0: 30, d1: 80, z0: 0, z1: 40 },
        { owner: 'c', x0: 2000, x1: 2050, d0: 50, d1: 90, z0: 0, z1: 30 },
      ],
      lamps: [{ id: 'l', x: 1200, d: 120, z: 60, box: 'l' }],
      pets: [
        { owner: 'p1', x0: 420, x1: 460, d0: 40, d1: 70, z0: 0, z1: 36 },
        { owner: 'p2', x0: 1420, x1: 1460, d0: 40, d1: 70, z0: 0, z1: 36 },
        { owner: 'p3', x0: 2200, x1: 2240, d0: 40, d1: 70, z0: 0, z1: 36 },
      ],
    };
    buildLightMap(big); // chauffe les caches mémorisés
    const t0 = performance.now();
    buildLightMap(big);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(60);
  });
});
