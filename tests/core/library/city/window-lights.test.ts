import { describe, expect, it } from 'vitest';
import { nightness, roomLit, roomTone, soloRoom, soloShare, windowLit, windowsLitFraction } from '../../../../src/core/library/city/window-lights';

const tuesday = { weekday: 2, kind: 'school' as const };
const friday = { weekday: 5, kind: 'school' as const };
const saturday = { weekday: 6, kind: 'weekend' as const };
const sunday = { weekday: 0, kind: 'weekend' as const };
const holidayMonday = { weekday: 1, kind: 'public-holiday' as const };
const h = (hours: number): number => Math.round(hours * 60);
// Part des fenêtres allumées sur une grille fine de seuils u (comme les fenêtres d'une ville).
const share = (minutes: number, day: Parameters<typeof windowLit>[2], daylight: number, gloom = false): number => {
  let n = 0;
  for (let i = 0; i < 1000; i++) if (windowLit((i + 0.5) / 1000, minutes, day, daylight, gloom)) n++;
  return n / 1000;
};

describe('fenêtres allumées des immeubles', () => {
  it('suit le tableau validé, de nuit noire, en semaine', () => {
    expect(windowsLitFraction(h(2), tuesday)).toBeCloseTo(0.02);
    expect(windowsLitFraction(h(3.5), tuesday)).toBeCloseTo(0.01);
    expect(windowsLitFraction(h(6), tuesday)).toBeCloseTo(0.2);
    expect(windowsLitFraction(h(8), tuesday)).toBeCloseTo(0.5);
    expect(windowsLitFraction(h(13), tuesday)).toBeCloseTo(0.25);
    expect(windowsLitFraction(h(21), tuesday)).toBeCloseTo(0.85);
    expect(windowsLitFraction(h(23), tuesday)).toBeCloseTo(0.4);
  });

  it('à 2 h en semaine, presque rien n’est allumé', () => {
    expect(share(h(2), tuesday, 0)).toBeLessThanOrEqual(0.03);
    expect(share(h(4), tuesday, 0)).toBeLessThanOrEqual(0.015);
  });

  it('le week-end, on se couche plus tard et on se lève plus tard', () => {
    // Nuit du vendredi au samedi et du samedi au dimanche : le matin du week-end.
    expect(windowsLitFraction(h(2), saturday)).toBeCloseTo(0.07);
    expect(windowsLitFraction(h(1), sunday)).toBeCloseTo(0.22);
    expect(windowsLitFraction(h(7), saturday)).toBeCloseTo(0.1);
    expect(windowsLitFraction(h(9), sunday)).toBeCloseTo(0.38);
    // Soirée du vendredi et du samedi : couche-tard.
    expect(windowsLitFraction(h(23), friday)).toBeCloseTo(0.65);
    expect(windowsLitFraction(h(23), saturday)).toBeCloseTo(0.65);
    // Dimanche soir : on reprend le rythme de semaine.
    expect(windowsLitFraction(h(23), sunday)).toBeCloseTo(0.4);
    // Jour férié : grasse matinée.
    expect(windowsLitFraction(h(7), holidayMonday)).toBeCloseTo(0.1);
  });

  it('montée le matin, puis extinction quand le jour se lève', () => {
    expect(share(h(5), tuesday, 0)).toBeLessThan(share(h(6), tuesday, 0));
    expect(share(h(6), tuesday, 0)).toBeLessThan(share(h(7), tuesday, 0));
    // Matin d'hiver encore sombre à 8 h : beaucoup d'allumées ; même heure en plein jour : tout est éteint.
    expect(share(h(8), tuesday, 0.1)).toBeGreaterThan(0.45);
    expect(share(h(8), tuesday, 0.45)).toBeLessThan(share(h(8), tuesday, 0.1));
    expect(share(h(8), tuesday, 1)).toBe(0);
    // Le jour qui se lève éteint d'abord les dernières allumées : une fenêtre éteinte ne se rallume pas.
    for (let u = 0.01; u < 1; u += 0.07) {
      let wasLit = true;
      for (let d = 0; d <= 1; d += 0.05) {
        const lit = windowLit(u, h(8), tuesday, d, false);
        if (!wasLit) expect(lit).toBe(false);
        wasLit = lit;
      }
    }
  });

  it('mauvais temps : on allume de jour comme s’il faisait sombre, mais rien de plus la nuit', () => {
    expect(share(h(13), tuesday, 1, false)).toBe(0);
    expect(share(h(13), tuesday, 1, true)).toBeCloseTo(0.25, 1);
    expect(share(h(2), tuesday, 0, true)).toBe(share(h(2), tuesday, 0, false));
  });

  it('sans jour connu : rythme de semaine', () => {
    expect(windowsLitFraction(h(2), undefined)).toBeCloseTo(0.02);
  });
});

describe('allumage par logement : pièce seule et télé', () => {
  it('pièce seule : ≈ 20 % au dîner, ≈ 50 % après 22 h', () => {
    expect(soloShare(h(20))).toBeCloseTo(0.2);
    expect(soloShare(h(22.5))).toBeCloseTo(0.5);
  });

  it('pièce seule déterministe et stable dans l’heure', () => {
    expect(soloRoom(123, h(22.1))).toBe(soloRoom(123, h(22.9)));
    expect(soloRoom(123, h(22.1))).toBe(soloRoom(123, h(22.1)));
  });

  it('un logement allumé allume toujours sa pièce principale ; les autres pièces suivent la pièce seule', () => {
    const m = h(22.5);
    for (let key = 0; key < 500; key++) {
      const u = (key * 0.618034) % 1;
      const lit = windowLit(u, m, tuesday, 0, false);
      expect(roomLit({ u, key, main: true }, m, tuesday, 0, false)).toBe(lit);
      expect(roomLit({ u, key, main: false }, m, tuesday, 0, false)).toBe(lit && !soloRoom(key, m));
    }
  });

  it('le soir, une part des logements allumés n’éclaire qu’une pièce', () => {
    let solo = 0;
    for (let key = 0; key < 1000; key++) if (soloRoom(key * 7919 + 13, h(22.5))) solo++;
    expect(solo / 1000).toBeGreaterThan(0.4);
    expect(solo / 1000).toBeLessThan(0.6);
  });

  it('télé seulement sur la pièce principale', () => {
    expect(roomTone({ key: 9, tone: 'tv' }, false, h(21))).not.toBe('tv');
    expect(roomTone({ key: 9, tone: 'tv' }, true, h(21))).toBe('tv');
    for (let key = 0; key < 300; key++) expect(roomTone({ key, tone: 'cream' }, false, h(22.5))).toBe('cream');
  });

  it('une pièce seule après 20 h regarde parfois la télé, jamais avant', () => {
    let tv = 0;
    let solo = 0;
    for (let key = 0; key < 2000; key++) {
      if (soloRoom(key, h(17.5))) expect(roomTone({ key, tone: 'warm' }, true, h(17.5))).toBe('warm');
      if (!soloRoom(key, h(22.5))) continue;
      solo++;
      if (roomTone({ key, tone: 'warm' }, true, h(22.5)) === 'tv') tv++;
    }
    expect(tv / solo).toBeGreaterThan(0.2);
    expect(tv / solo).toBeLessThan(0.4);
  });

  it('nightness : 1 de nuit, 0 en plein jour, sans le mauvais temps', () => {
    expect(nightness(0)).toBe(1);
    expect(nightness(1)).toBe(0);
    expect(nightness(0.45)).toBeCloseTo(0.5);
  });
});
