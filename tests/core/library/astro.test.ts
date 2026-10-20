import { describe, expect, it } from 'vitest';
import { astroAt, moonPhase, skyPoint, withRealSky } from '../../../src/core/library/astro';
import { skyAt, sunTimes } from '../../../src/core/library/sky';
import { moonLitPath } from '../../../src/content/ghibli-sky';
import { moonBeam } from '../../../src/content/sky-place';

const TRELAZE = { lat: 47.45, lon: -0.47 };
const SYDNEY = { lat: -33.87, lon: 151.21 };
const DEG = Math.PI / 180;
// Crête la plus basse de la colline de la Ville (fraction de la hauteur) ; disque du soleil peint : rayon ≈ 20 px sur 340.
const CREST_LOW = 0.163;

describe('astroAt (soleil)', () => {
  it('Trélazé, 20 octobre 2026 à 12 h (heure d’été) : soleil au sud-est, ≈ 28° de haut, à gauche du milieu', () => {
    const a = astroAt({ y: 2026, m: 10, d: 20 }, 12 * 60, TRELAZE, 120);
    expect(a.sun.alt / DEG).toBeCloseTo(27.6, 0);
    expect(a.sun.az / DEG).toBeGreaterThan(145);
    expect(a.sun.az / DEG).toBeLessThan(155);
    expect(a.sunAt.x).toBeLessThan(0.45);
  });

  it('midi solaire à Trélazé (≈ 13 h 47 en octobre) : plein sud, au milieu du monde', () => {
    const a = astroAt({ y: 2026, m: 10, d: 20 }, 13 * 60 + 47, TRELAZE, 120);
    expect(Math.abs(a.sun.az / DEG - 180)).toBeLessThan(1.5);
    expect(Math.abs(a.sunAt.x - 0.5)).toBeLessThan(0.01);
  });

  it('hauteur de midi selon la saison : ≈ 66° en juin, ≈ 19° en décembre', () => {
    const june = astroAt({ y: 2026, m: 6, d: 21 }, 14 * 60, TRELAZE, 120);
    const dec = astroAt({ y: 2026, m: 12, d: 21 }, 13 * 60, TRELAZE, 60);
    expect(june.sun.alt / DEG).toBeCloseTo(66, 0);
    expect(dec.sun.alt / DEG).toBeCloseTo(19, 0);
    expect(june.sunAt.y).toBeLessThan(dec.sunAt.y);
  });

  it('le soleil se lève à gauche (est) et se couche à droite (ouest)', () => {
    const morning = astroAt({ y: 2026, m: 10, d: 20 }, 9 * 60 + 30, TRELAZE, 120);
    const evening = astroAt({ y: 2026, m: 10, d: 20 }, 18 * 60, TRELAZE, 120);
    expect(morning.sunAt.x).toBeLessThan(0.3);
    expect(evening.sunAt.x).toBeGreaterThan(0.7);
  });

  it('hémisphère sud : le décor regarde le nord, le soleil du matin est à droite', () => {
    const a = astroAt({ y: 2026, m: 10, d: 20 }, 9 * 60, SYDNEY, 660);
    expect(a.sunAt.x).toBeGreaterThan(0.6);
  });
});

describe('skyPoint (mise en scène)', () => {
  it('dès quelques degrés, le disque du soleil passe au-dessus de la colline', () => {
    const p = skyPoint({ alt: 6 * DEG, az: 120 * DEG }, 47);
    expect(p.y + 20 / 340).toBeLessThan(CREST_LOW + 0.06);
    expect(p.y).toBeLessThan(CREST_LOW + 0.02);
  });

  it('toute une journée d’octobre à Trélazé : soleil au-dessus de la crête entre 10 h et 18 h', () => {
    for (let h = 10; h <= 18; h++) {
      const a = astroAt({ y: 2026, m: 10, d: 20 }, h * 60, TRELAZE, 120);
      expect(a.sunAt.y, `${h} h`).toBeLessThan(CREST_LOW);
    }
  });

  it('à l’horizon l’astre est derrière la colline, sous l’horizon il continue de descendre', () => {
    expect(skyPoint({ alt: 0, az: Math.PI }, 47).y).toBeGreaterThan(0.2);
    expect(skyPoint({ alt: -10 * DEG, az: Math.PI }, 47).y).toBeGreaterThan(skyPoint({ alt: 0, az: Math.PI }, 47).y);
  });
});

describe('phase de la lune', () => {
  it('pleine lune le 26 octobre 2026, nouvelle lune le 10, gibbeuse croissante le 20', () => {
    const lit = (d: number, minutes = 0): number => astroAt({ y: 2026, m: 10, d }, minutes, TRELAZE, 120).phase.lit;
    expect(lit(26)).toBeGreaterThan(0.95);
    expect(lit(10, 14 * 60)).toBeLessThan(0.05);
    expect(lit(20)).toBeGreaterThan(0.6);
    expect(lit(20)).toBeLessThan(0.8);
  });

  it('croissant du soir : le bord éclairé regarde le soleil couché, à droite (ouest)', () => {
    const a = astroAt({ y: 2026, m: 10, d: 13 }, 19 * 60 + 30, TRELAZE, 120);
    expect(a.phase.lit).toBeLessThan(0.2);
    expect(Math.cos(a.phase.limb)).toBeGreaterThan(0.8);
  });

  it('dernier quartier au petit matin : bord éclairé à gauche (est, côté du soleil levant)', () => {
    const a = astroAt({ y: 2026, m: 11, d: 2 }, 6 * 60, TRELAZE, 60);
    expect(a.phase.lit).toBeGreaterThan(0.3);
    expect(a.phase.lit).toBeLessThan(0.7);
    expect(Math.cos(a.phase.limb)).toBeLessThan(-0.5);
  });

  it('soleil et lune opposés : pleine ; confondus : nouvelle', () => {
    expect(moonPhase({ alt: -0.2, az: 0 }, { alt: 0.2, az: Math.PI }).lit).toBeGreaterThan(0.95);
    expect(moonPhase({ alt: 0.3, az: 1 }, { alt: 0.3, az: 1 }).lit).toBeLessThan(0.01);
  });

  it('withRealSky : la lune n’apparaît que levée, et pas autour de la nouvelle lune', () => {
    const times = sunTimes({ y: 2026, m: 10, d: 20 }, TRELAZE, 120);
    const night = withRealSky(skyAt(21 * 60, times), astroAt({ y: 2026, m: 10, d: 20 }, 21 * 60, TRELAZE, 120));
    expect(night.moonFrac).not.toBeNull();
    expect(night.moonPhase?.lit).toBeGreaterThan(0.6);
    const set = withRealSky(skyAt(4 * 60, times), astroAt({ y: 2026, m: 10, d: 20 }, 4 * 60, TRELAZE, 120));
    expect(set.moonFrac).toBeNull();
    const newMoon = withRealSky(skyAt(23 * 60, times), astroAt({ y: 2026, m: 10, d: 10 }, 13 * 60, TRELAZE, 120));
    expect(newMoon.moonFrac).toBeNull();
  });
});

describe('moonLitPath', () => {
  it('croissant : terminateur bombé côté éclairé ; gibbeuse : côté sombre ; pleine : disque', () => {
    expect(moonLitPath(10, 0.2)).toBe('M0 -10A10 10 0 0 1 0 10A6 10 0 0 0 0 -10Z');
    expect(moonLitPath(10, 0.8)).toBe('M0 -10A10 10 0 0 1 0 10A6 10 0 0 1 0 -10Z');
    expect(moonLitPath(10, 1)).toBe('M0 -10A10 10 0 0 1 0 10A10 10 0 0 1 0 -10Z');
    expect(moonLitPath(10, 0.5)).toContain('A0 10');
  });
});

describe('moonBeam (clair de lune des fenêtres)', () => {
  const times = sunTimes({ y: 2026, m: 10, d: 20 }, TRELAZE, 120);
  const at = (d: number, minutes: number) => withRealSky(skyAt(minutes, sunTimes({ y: 2026, m: 10, d }, TRELAZE, 120)), astroAt({ y: 2026, m: 10, d }, minutes, TRELAZE, 120));
  it('la nuit, lune levée : un rayon dont la force suit la phase', () => {
    const gibbous = moonBeam(at(20, 21 * 60), 720, 340);
    expect(gibbous).not.toBeNull();
    expect(gibbous!.strength).toBeGreaterThan(0.3);
    const crescent = moonBeam(at(13, 19 * 60 + 50), 720, 340);
    if (crescent) expect(crescent.strength).toBeLessThan(gibbous!.strength * 0.3);
  });
  it('pas de clair de lune le jour, ni lune couchée', () => {
    expect(moonBeam(withRealSky(skyAt(15 * 60, times), astroAt({ y: 2026, m: 10, d: 20 }, 15 * 60, TRELAZE, 120)), 720, 340)).toBeNull();
    expect(moonBeam(at(20, 4 * 60), 720, 340)).toBeNull();
  });
});
