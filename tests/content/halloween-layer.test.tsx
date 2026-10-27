// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { HalloweenLayer } from '../../src/content/halloween-layer';
import { InstallLayer } from '../../src/content/install-layer';
import { buildSceneLife } from '../../src/content/use-scene-life';
import { dayContext, type YMD } from '../../src/core/library/city/calendar';
import { cityFacades } from '../../src/core/library/city/facades';
import { decorShown } from '../../src/core/library/city/halloween';
import { absMinute, crewAt, decorSetsFor } from '../../src/core/library/city/install';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { dayNumber } from '../../src/core/library/city/shops/hours';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; host: HTMLDivElement }[] = [];
const render = (node: ReactNode): HTMLDivElement => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  mounted.push({ root, host });
  return host;
};
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const W = 1440;
const H = 340;
const SEED = 3;
const facades = cityFacades(W, H, SEED);
const VAC = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
const dry = { precip: 0, snow: false, storm: false };
const lifeOn = (date: YMD) => buildSceneLife(facades, { ...dayContext(date, VAC), periods: VAC }, dry, SEED, false);
const skyOf = (date: YMD, minutes: number) => skyAt(minutes, sunTimes(date, { lat: 48.85, lon: 2.35 }, 60));
const OCT31: YMD = { y: 2026, m: 10, d: 31 };

describe('calque des décors d’Halloween des habitants', () => {
  it('hors de la période : aucun plan, rien de dessiné', () => {
    const life = lifeOn({ y: 2026, m: 10, d: 14 });
    expect(life.halloween).toBeNull();
    const host = render(<svg><HalloweenLayer facades={facades} life={life} sky={skyOf(OCT31, 1260)} minutes={1260} /></svg>);
    expect(host.querySelector('[data-halloween]')).toBeNull();
  });

  it('le 31 au soir : les décors posés sont dessinés, citrouilles allumées la nuit', () => {
    const life = lifeOn(OCT31);
    const plan = life.halloween!;
    expect(plan.items.length).toBeGreaterThan(0);
    const minute = 21 * 60;
    const host = render(<svg><HalloweenLayer facades={facades} life={life} sky={skyOf(OCT31, minute)} minutes={minute} /></svg>);
    const shown = plan.items.filter((it) => decorShown(it, dayNumber(OCT31), minute, life.today.get(it.dwelling) ?? null));
    const drawn = host.querySelectorAll('[data-hw-decor]');
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThanOrEqual(shown.length);
    const pumpkins = host.querySelectorAll('[data-hw-kind="pumpkin"] [data-pumpkin]');
    expect(pumpkins.length).toBeGreaterThan(0);
    expect([...pumpkins].every((p) => p.getAttribute('data-lit') === 'true')).toBe(true);
    // Nœuds à opacité 0 (visage sombre d'une citrouille allumée) cachés, lueurs et visage allumé montrés.
    for (const n of host.querySelectorAll('[data-pumpkin] > *')) expect(n.getAttribute('display') === 'none').toBe(n.getAttribute('opacity') === '0');
  });

  it('de jour, citrouilles éteintes ; après la nuit du 31, plus allumées', () => {
    const noon = render(<svg><HalloweenLayer facades={facades} life={lifeOn(OCT31)} sky={skyOf(OCT31, 720)} minutes={720} /></svg>);
    expect([...noon.querySelectorAll('[data-pumpkin]')].every((p) => p.getAttribute('data-lit') === 'false')).toBe(true);
    // Éteintes : lueurs et visage allumé (opacité 0) cachés.
    const dark = noon.querySelectorAll('[data-pumpkin] > [data-face-lit], [data-pumpkin] > circle');
    expect(dark.length).toBeGreaterThan(0);
    expect([...dark].every((n) => n.getAttribute('display') === 'none')).toBe(true);
    const NOV2: YMD = { y: 2026, m: 11, d: 2 };
    const late = render(<svg><HalloweenLayer facades={facades} life={lifeOn(NOV2)} sky={skyOf(NOV2, 1260)} minutes={1260} /></svg>);
    expect([...late.querySelectorAll('[data-pumpkin]')].every((p) => p.getAttribute('data-lit') === 'false')).toBe(true);
  });

  it('une sorcière est toujours redessinée derrière son garde-corps', () => {
    for (const d of [25, 28, 31]) {
      const date = { y: 2026, m: 10, d };
      const host = render(<svg><HalloweenLayer facades={facades} life={lifeOn(date)} sky={skyOf(date, 1200)} minutes={1200} /></svg>);
      for (const w of host.querySelectorAll('[data-hw-kind="witch"]')) expect(w.querySelector('path[stroke]')).not.toBeNull();
    }
  });
});

describe('entrées et lampadaires (install-layer)', () => {
  const metrics = cityMetrics(H);
  const layer = (date: YMD, minutes: number, part: 'back' | 'crew' | 'front') =>
    render(<svg><InstallLayer width={W} height={H} seed={SEED} sky={skyOf(date, minutes)} still={false} date={date} minutes={minutes} metrics={metrics} rainy={false} part={part} /></svg>);

  it('un habitant sort de l’immeuble avec sa petite échelle : aucun véhicule, fondu à la porte, tenue sans gilet', () => {
    const sets = decorSetsFor(OCT31, W, H, SEED).filter((s) => s.transport === 'door');
    const set = sets[0]!;
    const day = set.day + set.install.dayOffset;
    const t = new Date(day * 86_400_000);
    const date = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
    const minute = set.install.from + 5;
    expect(crewAt(set, absMinute(day, minute), set.day)).not.toBeNull();
    const crew = layer(date, minute, 'crew');
    const node = crew.querySelector(`[data-crew="${set.id}"]`);
    expect(node?.hasAttribute('data-door-resident')).toBe(true);
    expect(node?.querySelectorAll('[data-worker]').length).toBe(1);
    expect(node?.querySelector('[data-ladder]')).not.toBeNull();
    const front = layer(date, minute, 'front');
    expect(front.querySelector(`[data-install-van="${set.id}"]`)).toBeNull();
  });

  it('décors d’entrée en place pendant la période, contre la façade', () => {
    const back = layer(OCT31, 1200, 'back');
    const decor = back.querySelectorAll('[data-decor-kind="door-web"], [data-decor-kind="door-ghost"]');
    expect(decor.length).toBeGreaterThan(0);
  });

  it('lampadaires : lanterne allumée avec le lampadaire la nuit', () => {
    const front = layer(OCT31, 21 * 60, 'front');
    const lanterns = front.querySelectorAll('[data-decor-kind="lamp-pumpkin"] [data-pumpkin]');
    const bats = front.querySelectorAll('[data-decor-kind="lamp-bats"]');
    expect(lanterns.length + bats.length).toBeGreaterThan(0);
    for (const p of lanterns) expect(p.getAttribute('data-lit')).toBe('true');
  });

  // Bogue du 2026-10-24 : la nacelle posait des guirlandes de chauves-souris mais le plateau portait la caisse de drapeaux
  // tricolores. Le chargement suit le genre des décors encore dans le camion (art des décors tenus, réduit).
  const OCT24: YMD = { y: 2026, m: 10, d: 24 };
  const liftCargo = (ghibli: boolean): Element => {
    const minute = 9 * 60 + 5;
    const c = render(<svg><InstallLayer width={W} height={H} seed={SEED} sky={skyOf(OCT24, minute)} still={false} date={OCT24} minutes={minute} metrics={metrics} rainy={false} ghibli={ghibli} /></svg>);
    const truck = c.querySelector('[data-crew="lamps-halloween"] [data-lift-truck]');
    expect(truck, 'camion élévateur d’Halloween à l’œuvre le 24/10 à 9 h 05').not.toBeNull();
    return truck!;
  };
  for (const ghibli of [false, true]) {
    it(`camion élévateur d’Halloween (${ghibli ? 'Ghibli' : 'classique'}) : citrouilles et chauves-souris sur le plateau, aucun drapeau`, () => {
      const truck = liftCargo(ghibli);
      const stored = [...truck.querySelectorAll('[data-stored-item][data-carried="lift"]')];
      expect(stored.length).toBeGreaterThan(0);
      expect(truck.querySelector('[data-flag-art], [data-flag-wave], [data-held-flag]')).toBeNull();
      const kinds = new Set(stored.map((e) => e.getAttribute('data-stored-kind')));
      for (const k of kinds) expect(['lamp-pumpkin', 'lamp-bats']).toContain(k);
      expect(truck.querySelectorAll('[data-lamp-crate] [data-lamp-pumpkin="held"] [data-pumpkin], [data-lamp-crate] [data-lamp-bats="held"] [data-bats]').length).toBe(stored.length);
    });
  }
});
