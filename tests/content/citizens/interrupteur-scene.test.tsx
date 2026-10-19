// @vitest-environment jsdom
// tests/content/citizens/interrupteur-scene.test.tsx
// Interrupteur des habitants 3D coupé (CITIZENS_3D = false) = retour arrière de l'utilisateur : la scène Ghibli doit être
// EXACTEMENT celle d'avant la branche des habitants 3D. Ville vivante (passants, habitants, commerces, circulation, bus) un jour
// ordinaire et grand défilé du 14 juillet, image par image (100 ms) : empreintes du DOM relevées avec le code d'avant
// (e53e9565, même scénario ; relevées à nouveau sur la tête de G5 partie 2, 79bd348c, à sa fusion avec main, puis pour les
// cages d'escalier, la vie aux fenêtres et les toits vivants, voir ORDINARY) ; aucune
// demande d'avance, aucun portillon d'entrée, aucun attribut `visibility` posé.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY, writeArt } from '../../../src/content/art-setting';
import { CityLifeLayer } from '../../../src/content/city-life';
import { FigureContext, FigureRegistry } from '../../../src/content/figure/figure-host';
import { dayContext, type YMD } from '../../../src/core/library/city/calendar';
import type { CityContext } from '../../../src/core/library/city/intensity';
import { skyAt, sunTimes } from '../../../src/core/library/sky';
import * as figureMod from '../../../src/content/figure/ghibli-figure'; // [espions]
import * as shopsMod from '../../../src/content/city-shops-life'; // [espions]

vi.mock('../../../src/content/figure/citizen-config', async (orig) => ({ ...(await orig<object>()), CITIZENS_3D: false }));
// [espions] Fonctions des habitants 3D appelées par les boucles : jamais avec l'interrupteur coupé.
vi.mock('../../../src/content/figure/ghibli-figure', async (orig) => { // [espions]
  const m = await orig<typeof import('../../../src/content/figure/ghibli-figure')>(); // [espions]
  return { ...m, gateEntering: vi.fn(m.gateEntering), prewarmFigure: vi.fn(m.prewarmFigure), prewarmCitizen: vi.fn(m.prewarmCitizen) }; // [espions]
}); // [espions]
vi.mock('../../../src/content/city-shops-life', async (orig) => { // [espions]
  const m = await orig<typeof import('../../../src/content/city-shops-life')>(); // [espions]
  return { ...m, warmCustomers: vi.fn(m.warmCustomers) }; // [espions]
}); // [espions]

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; host: HTMLDivElement }[] = [];
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  localStorage.removeItem(ART_KEY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${s.length}:${(h >>> 0).toString(16)}`;
};
const T = 1_790_000_050;
// Scène Ghibli image par image : empreinte du DOM aux images `marks` (0 = montage), et nombre d'attributs `visibility` posés
// sur les véhicules et les unités du défilé.
function run(date: YMD, hours: number, frames: number, marks: readonly number[]): { prints: string[]; visibility: number; units: number[] } {
  writeArt('ghibli');
  let now = T * 1000;
  let perf = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const times = sunTimes(date, { lat: 48.85, lon: 2.35 }, 120);
  const minutes = Math.round(hours * 60);
  const sky = skyAt(minutes, times);
  const city: CityContext = { minutes, day: dayContext(date, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const reg = new FigureRegistry('t');
  act(() => root.render(<FigureContext.Provider value={reg}><svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg></FigureContext.Provider>));
  mounted.push({ root, host });
  const prints: string[] = [];
  const units: number[] = [];
  let visibility = 0;
  for (let f = 0; f <= frames; f++) {
    if (f > 0) {
      now += 100;
      perf += 100;
      const cbs = queue.splice(0);
      act(() => {
        for (const cb of cbs) cb(perf);
      });
    }
    visibility += host.querySelectorAll('[data-vehicle][visibility], [data-parade-id][visibility]').length;
    units.push(host.querySelectorAll('[data-parade-id]').length);
    if (marks.includes(f)) prints.push(fnv(host.innerHTML));
  }
  return { prints, visibility, units };
}

describe('interrupteur coupé : scène d’avant la branche', () => {
  it('jour ordinaire à midi (passants, habitants, commerces, circulation) : même DOM image par image', () => {
    const got = run({ y: 2026, m: 10, d: 9 }, 12, 80, [0, 10, 40, 80]);
    expect(got.visibility).toBe(0);
    expect(figureMod.gateEntering).not.toHaveBeenCalled(); // [espions]
    expect(figureMod.prewarmFigure).not.toHaveBeenCalled(); // [espions]
    expect(figureMod.prewarmCitizen).not.toHaveBeenCalled(); // [espions]
    expect(shopsMod.warmCustomers).not.toHaveBeenCalled(); // [espions]
    expect(got.prints).toEqual(ORDINARY);
  });
  it('14 juillet à 10 h 30 (défilé) : unités montées à leur entrée dans le champ (pas 6 s avant), même DOM image par image', () => {
    const got = run({ y: 2026, m: 7, d: 14 }, 10.5, 80, [0, 10, 40, 80]);
    expect(got.visibility).toBe(0);
    expect(figureMod.gateEntering).not.toHaveBeenCalled(); // [espions]
    expect(got.units).toEqual(PARADE_UNITS);
    expect(got.prints).toEqual(PARADE);
  });
});

// Relevés avec le code d'avant la branche (e53e9565), même scénario, puis relevés à nouveau (2026-10-19, chantier « vie
// au-dessus de la rue », tâche 9) pour deux ajouts voulus, hors des habitants 3D : les cages d'escalier allumées au passage
// (chantier 1 des façades, `StairLights` ; seul écart sur main, vérifié en les retirant) et le calque de la vie derrière
// les fenêtres (`WindowLifeLayer`, pantins toujours en 2D quel que soit l'interrupteur). Relevés encore (finitions du
// chantier, branche fix/ville-vie-finitions) pour les changements voulus du DOM des tâches 10 à 12, vérifiés commit par
// commit (l'empreinte d'avant tient jusqu'à b3c0ac00) : silhouettes de la cage d'escalier (8df72a9b), réactions des
// habitants aux événements (04678a68) et calque des toits vivants (bd57a856, edce0c22) ; stables sur deux passages.
const ORDINARY = ['1445691:1b4d5da5', '1442528:2b8bc9e2', '1435932:569eca10', '1436193:8018b532'];
const PARADE = ['1734098:a83d8ab4', '1734229:f4e25933', '1722458:2c157bcd', '1722441:4312da29'];
// Unités du défilé montées à chaque image.
const PARADE_UNITS = [
  ...Array<number>(39).fill(10), 9, 9, 9, 9, ...Array<number>(8).fill(10), ...Array<number>(18).fill(11), ...Array<number>(11).fill(10), 9,
];
