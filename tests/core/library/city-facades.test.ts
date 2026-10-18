import { describe, expect, it } from 'vitest';
import { BUILDING_STRETCH, FAR_WINDOW, FAR_WINDOWS_MAX, GROUND_FLOOR, cityFacades, farWindowHidden, farWindows, stairsFor, type Facade } from '../../../src/core/library/city/facades';
import { facadeInputs, facadeLayout, podiumLayout } from '../../../src/core/library/city/facade-layout';
import { CITY_GROUND, DOOR_WIDTH, cityMetrics } from '../../../src/core/library/city/metrics';
import { doorsFor } from '../../../src/core/library/city/doors';
import { shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { PODIUM_H, citySkyline } from '../../../src/core/library/scene-world';
import empreinte from './fixtures/city-skyline-empreinte.json';

const ground = 340 * CITY_GROUND;
const near = (fs: readonly Facade[]): Facade[] => fs.filter((f) => !f.far);
// Fenêtres du socle portées par la 1re tour d'un jumeau (après celles de sa mise en page).
const podiumPart = (f: Facade): Facade['lamps'] => f.lamps.slice(f.layout?.windows.length ?? 0);

describe('cityFacades', () => {
  it('ne change pas le tirage de citySkyline (mêmes immeubles avant et après)', () => {
    const before = JSON.stringify(citySkyline(720, 340, 5));
    cityFacades(720, 340, 5);
    expect(JSON.stringify(citySkyline(720, 340, 5))).toBe(before);
  });
  it('mêmes immeubles que citySkyline, étirés', () => {
    const raw = citySkyline(720, 340, 5);
    const facades = cityFacades(720, 340, 5);
    expect(facades).toHaveLength(raw.length);
    facades.forEach((f, i) => {
      expect(f.x).toBe(raw[i]!.x);
      expect(f.w).toBe(raw[i]!.w);
      expect(f.far).toBe(raw[i]!.far);
      expect(f.h).toBeCloseTo(raw[i]!.h * BUILDING_STRETCH, 6);
    });
  });
  it('les fenêtres sont celles de la mise en page, socle à la suite', () => {
    for (let s = 1; s <= 10; s++) {
      const inputs = facadeInputs(1440, 340, s);
      const facades = cityFacades(1440, 340, s);
      for (const input of inputs) {
        const f = facades[input.index]!;
        expect(f.layout).toEqual(facadeLayout(input, ground, s));
        const n = f.layout!.windows.length;
        expect(f.lamps.slice(0, n)).toEqual(f.layout!.windows);
        expect(f.homes.slice(0, f.layout!.homes.length)).toEqual(f.layout!.homes);
        if (!f.podiumLayout) {
          expect(f.lamps).toHaveLength(n);
          continue;
        }
        const shift = f.layout!.homes.length;
        const visible = f.podiumLayout.windows.filter((w) => w.x >= 0 && w.x + w.w <= 1440);
        expect(podiumPart(f)).toEqual(visible.map((w) => ({ ...w, home: w.home + shift })));
        expect(f.homes.slice(shift)).toEqual(f.podiumLayout.homes);
      }
      // Chaque fenêtre de logement pointe sur un logement de la façade, avec sa clé et son seuil.
      for (const f of near(facades)) {
        for (const w of f.lamps) {
          if (w.home < 0) continue;
          expect(f.homes[w.home]!.key).toBe(w.key);
          expect(f.homes[w.home]!.u).toBe(w.u);
        }
      }
    }
  });
  it('immeubles du fond et immeubles sans mise en page : aucune fenêtre de façade', () => {
    for (let s = 1; s <= 10; s++) {
      const facades = cityFacades(1440, 340, s);
      const laid = new Set(facadeInputs(1440, 340, s).map((i) => i.index));
      facades.forEach((f, i) => {
        if (f.far) {
          expect(f.layout).toBeNull();
          expect(f.podiumLayout).toBeNull();
          expect(f.lamps).toEqual([]);
          expect(f.homes).toEqual([]);
          return;
        }
        expect(f.farWindows).toEqual([]);
        expect(f.homes.length).toBe((f.layout?.homes.length ?? 0) + (f.podiumLayout?.homes.length ?? 0));
        if (!laid.has(i)) {
          expect(f.layout).toBeNull();
          expect(f.lamps.every((w) => w.y >= ground - PODIUM_H)).toBe(true);
        }
      });
    }
  });
  it('aucune fenêtre du fond sous un immeuble proche', () => {
    for (const s of [1, 5, 7, 42, 99]) {
      const facades = cityFacades(1440, 340, s);
      const front = near(facades);
      const boxes = [
        ...front.map((f) => ({ x: f.x, w: f.w, top: ground - f.h })),
        ...front.filter((f) => f.podium).map((f) => ({ x: f.podium!.x, w: f.podium!.w, top: ground - PODIUM_H })),
      ];
      const raw = citySkyline(1440, 340, s);
      let kept = 0;
      for (const [i, f] of facades.entries()) {
        if (!f.far) continue;
        // Sous-ensemble des fenêtres tirées, dans le même ordre.
        const all = farWindows(raw[i]!, ground, s);
        const keys = new Set(f.farWindows.map((w) => `${w.x},${w.y}`));
        expect(all.filter((w) => keys.has(`${w.x},${w.y}`))).toEqual(f.farWindows);
        for (const w of f.farWindows) {
          kept++;
          for (const b of boxes) {
            const overlap = w.x < b.x + b.w && w.x + FAR_WINDOW.w > b.x && w.y + FAR_WINDOW.h > b.top;
            expect(overlap).toBe(false);
          }
        }
      }
      expect(kept).toBeGreaterThan(0);
    }
  });
  it('farWindowHidden : recoupe le rectangle de l’immeuble jusqu’au sol', () => {
    const b = [{ x: 100, w: 40, top: 150 }];
    expect(farWindowHidden({ x: 110, y: 160, u: 0.5, blue: false }, b)).toBe(true);
    expect(farWindowHidden({ x: 98, y: 146, u: 0.5, blue: false }, b)).toBe(true);
    expect(farWindowHidden({ x: 110, y: 140, u: 0.5, blue: false }, b)).toBe(false);
    expect(farWindowHidden({ x: 141, y: 160, u: 0.5, blue: false }, b)).toBe(false);
    expect(farWindowHidden({ x: 96.5, y: 160, u: 0.5, blue: false }, b)).toBe(false);
  });
  it('pièce élargie : les immeubles entièrement visibles gardent leurs fenêtres', () => {
    for (const s of [3, 5, 7]) {
      // Premier plan : préfixe stable quand la pièce s'élargit (le fond, devant dans la liste, a plus d'immeubles).
      const small = near(cityFacades(720, 340, s));
      const big = near(cityFacades(1440, 340, s));
      let checked = 0;
      small.forEach((f, i) => {
        const right = f.podium ? Math.max(f.x + f.w, f.podium.x + f.podium.w) : f.x + f.w;
        if (right > 700) return;
        expect(big[i]!.x).toBe(f.x);
        expect(big[i]!.lamps).toEqual(f.lamps);
        expect(big[i]!.homes).toEqual(f.homes);
        checked++;
      });
      expect(checked).toBeGreaterThan(3);
    }
  });
  it('lot coupé au bord : fenêtres dans la partie visible', () => {
    for (let s = 1; s <= 20; s++) {
      for (const width of [500, 720, 1000]) {
        for (const f of near(cityFacades(width, 340, s))) {
          for (const w of f.lamps) {
            expect(w.x).toBeGreaterThanOrEqual(0);
            expect(w.x + w.w).toBeLessThanOrEqual(width + 1e-6);
          }
        }
      }
    }
  });
  it('fenêtres sur la façade, au-dessus du rez-de-chaussée', () => {
    const { ground: g } = cityMetrics(340);
    for (const f of near(cityFacades(1440, 340, 42))) {
      for (const w of f.lamps) {
        expect(w.y).toBeGreaterThanOrEqual(g - f.h - 0.001);
        expect(w.y + w.h).toBeLessThanOrEqual(g - GROUND_FLOOR + 0.001);
      }
    }
  });
  it('jumeaux : tour hors porte sans cage, rangée du socle sous le haut du socle', () => {
    let twins = 0;
    for (let s = 1; s <= 20; s++) {
      for (const f of near(cityFacades(1440, 340, s))) {
        if (!f.podium || !f.layout) continue;
        twins++;
        if (f.layout.doorCx === null) expect(f.layout.stairBay).toBeNull();
        // Fenêtres de la tour au-dessus du socle.
        for (const w of f.layout.windows) expect(w.y + w.h).toBeLessThanOrEqual(ground - PODIUM_H + 1e-6);
        const first = f.x === f.podium.x;
        expect(f.podiumLayout !== null).toBe(first);
        for (const w of podiumPart(f)) {
          expect(w.y).toBeGreaterThanOrEqual(ground - PODIUM_H);
          expect(w.y + w.h).toBeLessThanOrEqual(ground - GROUND_FLOOR);
          expect(w.x).toBeGreaterThanOrEqual(f.podium.x);
          expect(w.x + w.w).toBeLessThanOrEqual(f.podium.x + f.podium.w);
        }
      }
    }
    expect(twins).toBeGreaterThan(0);
  });
  it('jumeaux : le socle est mis en page avec la porte du lot', () => {
    for (let s = 1; s <= 10; s++) {
      const facades = cityFacades(1440, 340, s);
      for (const f of facades) {
        if (!f.podium || f.x !== f.podium.x || !f.podiumLayout) continue;
        const towers = facades.filter((g) => g.podium?.id === f.podium!.id);
        const door = towers.map((g) => g.layout?.doorCx ?? null).find((d) => d !== null) ?? null;
        expect(f.podiumLayout).toEqual(podiumLayout(f.podium, ground, s, door));
      }
    }
  });
});

describe('stairsFor', () => {
  it('une entrée par porte qui a une cage, clé = centre de la porte', () => {
    let stairs = 0;
    for (let s = 1; s <= 10; s++) {
      const facades = cityFacades(1440, 340, s);
      const map = stairsFor(facades);
      const doors = new Set(doorsFor(1440, 340, s).map((d) => d.x + DOOR_WIDTH / 2));
      const withStair = near(facades).filter((f) => f.layout?.stairBay != null);
      expect(map.size).toBe(withStair.length);
      for (const [cx, wins] of map) {
        expect(doors.has(cx)).toBe(true);
        expect(wins.length).toBeGreaterThan(0);
        for (const w of wins) {
          expect(w.kind).toBe('stair');
          expect(w.home).toBe(-1);
          expect(Math.abs(w.x + w.w / 2 - cx)).toBeLessThan(1e-6);
        }
        for (let i = 1; i < wins.length; i++) expect(wins[i]!.y).toBeLessThan(wins[i - 1]!.y);
        stairs++;
      }
    }
    expect(stairs).toBeGreaterThan(0);
  });
});

describe('farWindows', () => {
  const far = citySkyline(1440, 340, 7).filter((b) => b.far);
  it('quelques fenêtres par immeuble du fond (au plus 8), dans l’immeuble, petites et déterministes', () => {
    for (const b of far) {
      const wins = farWindows(b, ground, 7);
      expect(wins).toEqual(farWindows(b, ground, 7));
      expect(wins.length).toBeGreaterThan(0);
      expect(wins.length).toBeLessThanOrEqual(FAR_WINDOWS_MAX);
      expect(new Set(wins.map((w) => `${w.x},${w.y}`)).size).toBe(wins.length);
      for (const w of wins) {
        expect(w.x).toBeGreaterThanOrEqual(b.x);
        expect(w.x + FAR_WINDOW.w).toBeLessThanOrEqual(b.x + b.w);
        expect(w.y).toBeGreaterThanOrEqual(ground - b.h * BUILDING_STRETCH);
        expect(w.y + FAR_WINDOW.h).toBeLessThan(ground);
        expect(w.u).toBeGreaterThanOrEqual(0);
        expect(w.u).toBeLessThan(1);
      }
    }
  });
  it('ne dépend que de l’immeuble et de la graine', () => {
    const b = far[0]!;
    expect(farWindows({ ...b, lamps: [] }, ground, 7)).toEqual(farWindows(b, ground, 7));
    expect(farWindows(b, ground, 8)).not.toEqual(farWindows(b, ground, 7));
  });
});

// Empreinte prise sur main avant les façades parisiennes : le tirage (immeubles, boutiques, portes) ne doit jamais bouger.
describe('empreinte du tirage', () => {
  for (const s of empreinte.seeds) {
    it(`graine ${s} : immeubles, boutiques et portes identiques à main`, () => {
      const key = String(s) as keyof typeof empreinte.skyline;
      expect(JSON.parse(JSON.stringify(citySkyline(1440, 340, s)))).toEqual(empreinte.skyline[key]);
      expect(shopSlotsFor(1440, 340, s)).toEqual(empreinte.slots[key]);
      expect(doorsFor(1440, 340, s)).toEqual(empreinte.doors[key]);
    });
  }
});
