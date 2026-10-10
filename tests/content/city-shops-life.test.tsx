// @vitest-environment jsdom
// tests/content/city-shops-life.test.tsx — personnel, gestes et rideau roulant (vague 1b-iv-b)
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { StaffLayer, dayShifts, staffCast } from '../../src/content/city-shops-life';
import { addDays, dayContext, type YMD } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { SHOP_DEFS, SHOP_TYPE_IDS, type ShopTypeId } from '../../src/core/library/city/shops/catalog';
import { ACCESSORY } from '../../src/core/library/city/shops/gestures';
import { dayNumber, isOpenAt, rangesOf, ymdOfDay } from '../../src/core/library/city/shops/hours';
import { streetOn } from '../../src/core/library/city/shops/lifecycle';
import { shopFrame, shopSlotsFor } from '../../src/core/library/city/shops/slots';
import { staffShiftsAt } from '../../src/core/library/city/shops/staff';
import { changePlans, shopViewAt, type ShopView } from '../../src/core/library/city/shops/view';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Rendu minimal (le dépôt n'a pas @testing-library/react) : un conteneur par appel, démonté après chaque test.
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
  vi.unstubAllGlobals();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const W = 720;
const H = 340;
const SEED = 1;
const TUESDAY = { y: 2026, m: 10, d: 6 };
const EPOCH = dayNumber(TUESDAY);
const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const slots = shopSlotsFor(W, H, SEED);
const metrics = cityMetrics(H);
const street = (ymd: YMD) => streetOn(slots, SEED, EPOCH, dayNumber(ymd), {});

const life = (minutes: number, ymd: YMD = TUESDAY): HTMLDivElement => {
  const sky = skyAt(minutes, times);
  const city: CityContext = { minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: sky.daylight, shops: { epochDay: EPOCH, names: {} } };
  return render(<svg><CityLifeLayer width={W} height={H} sky={sky} seed={SEED} city={city} rainy={false} /></svg>);
};
const reduceMotion = (): void => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
};
const staffOf = (c: Element, id: string): Element => c.querySelector(`[data-shop-staff="${id}"]`)!;

// Vue synthétique d'un local tenu par `type` (ouvert selon les horaires).
const viewOf = (type: ShopTypeId, date: YMD, minutes: number): ShopView => ({
  slot: slots[0]!,
  phase: isOpenAt(SHOP_DEFS[type], date, minutes) ? 'open' : 'closed',
  sign: { type, name: 'X' },
  placard: false,
  interior: type,
  works: null,
  moving: null,
  interiorStage: null,
});

describe('personnel : qui est visible (staffCast)', () => {
  it('pour chaque type, toute la journée : un local ouvert montre au moins une personne derrière la vitrine, jamais plus de trois visibles', () => {
    // Samedi (amplitudes longues, relais) et le dimanche qui suit (plages de la veille passées minuit).
    for (const date of [{ y: 2026, m: 10, d: 10 }, { y: 2026, m: 10, d: 11 }]) {
      for (const type of SHOP_TYPE_IDS) {
        const shifts = staffShiftsAt(SHOP_DEFS[type], SEED, 'shop-0', date);
        for (let m = 0; m < 1440; m++) {
          const view = viewOf(type, date, m);
          const cast = staffCast(view, shifts, date, m, false);
          const atDoor = cast.street.filter((s) => s.visible && s.atDoor).length;
          if (view.phase === 'open' && cast.shutter !== 'rising') expect(cast.inside.length, `${type} ${m}`).toBeGreaterThanOrEqual(1);
          expect(cast.inside.length + atDoor, `${type} ${m}`).toBeLessThanOrEqual(3);
          if (cast.shutter === 'down') expect(cast.inside).toHaveLength(0);
          if (view.phase === 'closed' && cast.shutter === 'down') expect(cast.street.filter((s) => s.visible && s.atDoor)).toHaveLength(0);
        }
      }
    }
  }, 30_000);
  it('mouvement réduit : exactement une personne si ouvert, aucune sinon, personne sur le trottoir, rideau selon l’heure', () => {
    const date = { y: 2026, m: 10, d: 10 };
    for (const type of SHOP_TYPE_IDS) {
      const shifts = staffShiftsAt(SHOP_DEFS[type], SEED, 'shop-0', date);
      for (let m = 0; m < 1440; m += 7) {
        const view = viewOf(type, date, m);
        const cast = staffCast(view, shifts, date, m, true);
        expect(cast.inside).toHaveLength(view.phase === 'open' ? 1 : 0);
        expect(cast.street).toHaveLength(0);
        expect(cast.shutter).toBe(view.phase === 'open' ? 'up' : 'down');
      }
    }
  });
  it('jour d’un changement : personne avant la fin du chantier d’enseigne', () => {
    for (let day = EPOCH + 1; day < EPOCH + 200; day++) {
      const ymd = ymdOfDay(day);
      for (const s of streetOn(slots, SEED, EPOCH, day, {})) {
        if (!s.change) continue;
        const end = changePlans(SEED, s.slot.id, day, s.change.kind).works.end;
        for (const sh of dayShifts(s, SEED, ymd)) {
          expect(sh.arriveAt).toBeGreaterThanOrEqual(end);
          if (sh.shutterUp !== undefined) expect(sh.shutterUp).toBeGreaterThanOrEqual(sh.arriveAt);
        }
        return;
      }
    }
    throw new Error('aucun changement en 200 jours');
  });
});

describe('personnel : rendu (StaffLayer)', () => {
  const frame = shopFrame(slots[0]!, metrics.ground);
  const draw = (type: ShopTypeId, date: YMD, minutes: number, reduced: boolean): HTMLDivElement =>
    render(
      <svg>
        <StaffLayer
          view={viewOf(type, date, minutes)}
          shifts={staffShiftsAt(SHOP_DEFS[type], SEED, 'shop-0', date)}
          frame={frame}
          metrics={metrics}
          minutes={minutes}
          reduced={reduced}
          date={date}
          width={W}
          sky={skyAt(minutes, times)}
          rainy={false}
          umbrella={false}
          seed={SEED}
          seats={[frame.window.w * 0.35, frame.window.w * 0.7]}
          post={frame.window.w * 0.6}
        />
      </svg>,
    );
  it('à l’ouverture, le rideau monte et l’ouvreur est à la porte, bras levés', () => {
    const [open] = rangesOf(SHOP_DEFS.bakery, TUESDAY)[0]!;
    const c = draw('bakery', TUESDAY, open, false);
    expect(c.querySelector('[data-shutter-state]')!.getAttribute('data-shutter-state')).toBe('rising');
    expect(c.querySelector('[data-rolling-shutter="rising"]')).not.toBeNull();
    expect(c.querySelector('[data-staff-where="opening"][data-active="true"] [data-arm]')).not.toBeNull();
  });
  it('à la fermeture, le rideau descend ; une heure après, il est baissé et personne n’est visible', () => {
    const [, close] = rangesOf(SHOP_DEFS.bakery, TUESDAY)[0]!;
    expect(draw('bakery', TUESDAY, close, false).querySelector('[data-shutter-state]')!.getAttribute('data-shutter-state')).toBe('falling');
    const later = draw('bakery', TUESDAY, close + 60, false);
    expect(later.querySelector('[data-shutter-state]')!.getAttribute('data-shutter-state')).toBe('down');
    expect(later.querySelectorAll('[data-staff-member][data-active="true"], [data-staff-where="inside"]')).toHaveLength(0);
  });
  it('ouvert : l’employé tient l’accessoire du commerce, devant lui le comptoir redessiné', () => {
    const c = draw('bakery', TUESDAY, 10 * 60, false);
    const inside = c.querySelectorAll('[data-staff-where="inside"]');
    expect(inside.length).toBeGreaterThanOrEqual(1);
    expect(inside[0]!.querySelector(`[data-accessory="${ACCESSORY.bakery}"]`)).not.toBeNull();
    expect(c.querySelector('[data-staff-window] [data-interior-front="bakery"]')).not.toBeNull();
    expect(c.querySelector('[id]')).toBeNull();
  });
  it('mouvement réduit : rideau sans transition', () => {
    const c = draw('bakery', TUESDAY, 10 * 60, true);
    const g = c.querySelector<SVGGElement>('[data-rolling-shutter] > g')!;
    expect(g.style.transition).toBe('');
  });
});

describe('CityLifeLayer : personnel et clients en geste', () => {
  it('mouvement réduit à 10 h : exactement une personne derrière chaque vitrine ouverte, rideau selon l’heure, personne en route', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    reduceMotion();
    const c = life(600);
    const views = street(TUESDAY).map((s) => shopViewAt(s, SEED, TUESDAY, 600));
    expect(views.some((v) => v.phase === 'open')).toBe(true);
    for (const v of views) {
      const g = staffOf(c, v.slot.id);
      expect(g.getAttribute('data-shutter-state')).toBe(v.phase === 'open' ? 'up' : 'down');
      expect(g.querySelectorAll('[data-staff-where="inside"]')).toHaveLength(v.phase === 'open' ? 1 : 0);
    }
    expect(c.querySelectorAll('[data-staff-where^="walking"]')).toHaveLength(0);
  });
  it('non réduit : à l’heure d’ouverture d’un local, son rideau monte', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    // Premier jour (à partir du départ) où un local ouvre à une heure entière de sa plage du jour, hors changement.
    for (let k = 0; k < 14; k++) {
      const ymd = addDays(TUESDAY, k);
      const s = street(ymd).find((x) => !x.change && x.tenant && rangesOf(SHOP_DEFS[x.tenant.type], ymd).length > 0);
      if (!s) continue;
      const [open] = rangesOf(SHOP_DEFS[s.tenant!.type], ymd)[0]!;
      const c = life(open, ymd);
      expect(staffOf(c, s.slot.id).getAttribute('data-shutter-state')).toBe('rising');
      return;
    }
    throw new Error('aucune ouverture trouvée');
  });
  it('à 3 h, un local fermé (hors commerces de nuit) n’affiche aucun personnel et a son rideau baissé', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    const c = life(180);
    let checked = 0;
    for (const s of street(TUESDAY)) {
      if (SHOP_DEFS[s.tenant!.type].crowd === 'night') continue;
      const g = staffOf(c, s.slot.id);
      expect(g.getAttribute('data-shutter-state')).toBe('down');
      expect(g.querySelectorAll('[data-staff-where="inside"], [data-staff-member][data-active="true"]')).toHaveLength(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('un client derrière la vitrine porte l’accessoire du type de son commerce', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    const c = life(600);
    for (const s of street(TUESDAY)) {
      const nodes = c.querySelectorAll(`[data-life-id="${s.slot.id}-v0-in"], [data-life-id="${s.slot.id}-v1-in"]`);
      expect(nodes).toHaveLength(2);
      for (const n of nodes) expect(n.querySelector(`[data-accessory="${ACCESSORY[s.tenant!.type]}"]`)).not.toBeNull();
    }
  });
});
