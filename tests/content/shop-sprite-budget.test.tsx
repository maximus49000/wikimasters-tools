// @vitest-environment jsdom
// tests/content/shop-sprite-budget.test.tsx — plafond global des figurants des commerces, dans la scène rendue (vague 1b-iv-b)
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { countShopSprites, shopSpriteBudget } from '../../src/content/city-shops-life';
import { GHIBLI_SHOP_SPRITE_CAP, SHOP_SPRITE_CAP, capFor, spriteBudget, type BudgetSprite } from '../../src/core/library/city/shops/sprite-budget';
import { dayContext } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { dayNumber } from '../../src/core/library/city/shops/hours';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { targetOf } from '../../src/core/library/weather/weather-types';

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
  vi.restoreAllMocks();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const W = 720;
const H = 340;
const SAT = { y: 2026, m: 10, d: 10 };
const times = sunTimes(SAT, { lat: 48.85, lon: 2.35 }, 120);

// Samedi midi et demi, plein soleil : graine 11, une rue animée avec des convives en terrasse.
const busy = (seed = 11, minutes = 12 * 60 + 30): HTMLDivElement => {
  vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
  const sky = skyAt(minutes, times);
  const city: CityContext = { minutes, day: dayContext(SAT, []), precip: 0, snow: false, storm: false, daylight: sky.daylight, shops: { epochDay: dayNumber(SAT), names: {} } };
  return render(<svg><CityLifeLayer width={W} height={H} sky={sky} seed={seed} city={city} rainy={false} weather={{ read: () => targetOf('sun') }} /></svg>);
};
const hiddenGuests = (c: Element): Element[] => [...c.querySelectorAll('[data-terrace-guest][visibility="hidden"]')];
const customerX = (c: Element, id: string): number => Number(c.querySelector(`[data-visit="${id}"]`)!.getAttribute('data-x'));

describe('plafond des figurants dans la scène (shopSpriteBudget)', () => {
  it('une rue de 720 px ordinaire tient sous 40 : la boucle a passé le plafond, rien n’est caché', () => {
    const c = busy();
    const n = countShopSprites(c);
    expect(n.guests).toBeGreaterThan(0);
    expect(n.customers).toBeGreaterThan(0);
    expect(n.keep + n.customers + n.guests).toBeLessThanOrEqual(40);
    // Passage du plafond au premier placement : chaque convive a reçu sa visibilité.
    const guests = c.querySelectorAll('[data-terrace-guest]');
    for (const g of guests) expect(g.getAttribute('visibility')).toBe('visible');
  });
  it('au-delà du plafond : les convives de terrasse partent avant le premier client', () => {
    const c = busy();
    const n = countShopSprites(c);
    // Plafond qui laisse tout le monde.
    expect(shopSpriteBudget(c, W, n.keep + n.customers + n.guests).size).toBe(0);
    expect(hiddenGuests(c)).toHaveLength(0);
    // Un de trop : un convive caché, aucun client suspendu.
    expect(shopSpriteBudget(c, W, n.keep + n.customers + n.guests - 1).size).toBe(0);
    expect(hiddenGuests(c)).toHaveLength(1);
    // Plus aucune place pour les terrasses : tous les convives cachés, tous les clients gardés.
    expect(shopSpriteBudget(c, W, n.keep + n.customers).size).toBe(0);
    expect(hiddenGuests(c)).toHaveLength(n.guests);
  });
  it('puis les clients les plus éloignés du centre ; personnel, videurs et déménageurs jamais retirés ; au plus le plafond', () => {
    const c = busy();
    const n = countShopSprites(c);
    const cap = n.keep + n.customers - 3;
    const muted = shopSpriteBudget(c, W, cap);
    expect(muted.size).toBe(3);
    expect(hiddenGuests(c)).toHaveLength(n.guests);
    const all = [...c.querySelectorAll('[data-customer-inside][data-may="true"]')].map((x) => x.getAttribute('data-visit')!);
    const far = (id: string): number => Math.abs(customerX(c, id) - W / 2);
    const kept = all.filter((id) => !muted.has(id));
    expect(Math.min(...[...muted].map(far))).toBeGreaterThanOrEqual(Math.max(...kept.map(far)));
    // Actifs possibles : personnel et compagnie + clients gardés + convives visibles.
    expect(n.keep + kept.length + (n.guests - hiddenGuests(c).length)).toBeLessThanOrEqual(cap);
    // La règle rend la main : plafond relâché, tout revient.
    expect(shopSpriteBudget(c, W, 1000).size).toBe(0);
    expect(hiddenGuests(c)).toHaveLength(0);
  });
});

// ---------- G4b : retrait par parti entier ----------
describe('plafond G4b : partis entiers (spriteBudget)', () => {
  const keep = (n: number): BudgetSprite[] => Array.from({ length: n }, (_, i): BudgetSprite => ({ id: `k${i}`, kind: 'keep', x: 360 }));
  const CAP = GHIBLI_SHOP_SPRITE_CAP;
  it('plafond Ghibli 52 par 720 px ; le classique garde 40', () => {
    expect(GHIBLI_SHOP_SPRITE_CAP).toBe(52);
    expect(capFor(720, GHIBLI_SHOP_SPRITE_CAP)).toBe(52);
    expect(capFor(1440, GHIBLI_SHOP_SPRITE_CAP)).toBe(104);
    expect(SHOP_SPRITE_CAP).toBe(40);
    expect(capFor(720)).toBe(40);
  });
  it('un couple au-delà du plafond est retiré entier, jamais à moitié', () => {
    const list: BudgetSprite[] = [
      ...keep(CAP - 2),
      { id: 'solo:0', kind: 'customer', x: 300, party: 'solo' },
      { id: 'couple:0', kind: 'customer', x: 20, party: 'couple' },
      { id: 'couple:1', kind: 'customer', x: 400, party: 'couple' },
    ];
    // Un de trop : quel que soit le parti retiré, le couple part ou reste entier.
    const drop = spriteBudget(list, 360, CAP);
    expect(drop.size).toBeGreaterThan(0);
    const coupleGone = ['couple:0', 'couple:1'].map((id) => drop.has(id));
    expect(coupleGone[0]).toBe(coupleGone[1]);
    expect(list.filter((s) => !drop.has(s.id)).length).toBeLessThanOrEqual(CAP);
  });
  it('le parti le plus loin du centre part en premier, avec tous ses membres', () => {
    const list: BudgetSprite[] = [
      ...keep(CAP - 1),
      { id: 'near:0', kind: 'customer', x: 350, party: 'near' },
      { id: 'far:0', kind: 'customer', x: 10, party: 'far' },
      { id: 'far:1', kind: 'customer', x: 14, party: 'far' },
    ];
    expect([...spriteBudget(list, 360, CAP)].sort()).toEqual(['far:0', 'far:1']);
  });
  it('un parti servi dans le tiers central n’est jamais retiré', () => {
    const list: BudgetSprite[] = [
      ...keep(CAP),
      { id: 'served:0', kind: 'customer', x: 340, party: 'served', served: true },
      { id: 'served:1', kind: 'customer', x: 344, party: 'served' },
      { id: 'idle:0', kind: 'customer', x: 380, party: 'idle' },
      { id: 'edge:0', kind: 'customer', x: 700, party: 'edge', served: true },
    ];
    const drop = spriteBudget(list, 360, CAP);
    expect(drop.has('served:0')).toBe(false);
    expect(drop.has('served:1')).toBe(false);
    // Servi mais hors du tiers central : retirable comme les autres.
    expect(drop.has('edge:0')).toBe(true);
    expect(drop.has('idle:0')).toBe(true);
  });
});
