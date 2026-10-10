// @vitest-environment jsdom
// tests/content/city-shops-life.test.tsx — personnel, gestes et rideau roulant (vague 1b-iv-b)
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { StaffLayer, countShopSprites, dayShifts, staffCast } from '../../src/content/city-shops-life';
import { addDays, dayContext, type YMD } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { SHOP_DEFS, SHOP_TYPE_IDS, type ShopTypeId } from '../../src/core/library/city/shops/catalog';
import { ACCESSORY } from '../../src/core/library/city/shops/gestures';
import { dayNumber, isOpenAt, rangesOf, ymdOfDay } from '../../src/core/library/city/shops/hours';
import { streetOn } from '../../src/core/library/city/shops/lifecycle';
import { shopFrame, shopSlotsFor } from '../../src/core/library/city/shops/slots';
import { WALK_MIN, staffShiftsAt, type StaffShift } from '../../src/core/library/city/shops/staff';
import { changePlans, movingOffsets, shopViewAt, type ShopView } from '../../src/core/library/city/shops/view';
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

// Minutes à vérifier pour un invariant sur la journée : celles où quelque chose change (arrivée et départ de chaque poste, début
// et fin de la marche, rideau, pauses, plus les bornes données : ouverture, fermeture, chantier), chacune à ±1, plus une minute
// sur sept. Remplace le balayage des 1440 minutes (trop lent sous la suite complète) sans perdre les transitions.
function criticalMinutes(shifts: StaffShift[], bounds: number[]): number[] {
  const marks = [...bounds];
  for (const sh of shifts) {
    marks.push(sh.arriveAt, sh.arriveAt - WALK_MIN, sh.leaveAt, sh.leaveAt + WALK_MIN);
    if (sh.shutterUp !== undefined) marks.push(sh.shutterUp);
    if (sh.shutterDown !== undefined) marks.push(sh.shutterDown);
    for (const [a, b] of sh.breaks) marks.push(a, b);
  }
  const out = new Set<number>();
  for (let m = 0; m < 1440; m += 7) out.add(m);
  for (const v of marks) {
    for (const base of [v, v - 1440]) {
      for (let m = Math.floor(base) - 1; m <= Math.ceil(base) + 1; m++) if (m >= 0 && m < 1440) out.add(m);
    }
  }
  return [...out].sort((a, b) => a - b);
}
// Ouvertures et fermetures du jour et de la veille (plages qui passent minuit).
const rangeBounds = (type: ShopTypeId, date: YMD): number[] =>
  [...rangesOf(SHOP_DEFS[type], date), ...rangesOf(SHOP_DEFS[type], addDays(date, -1)).map(([a, b]) => [a - 1440, b - 1440] as const)].flat();

describe('personnel : qui est visible (staffCast)', () => {
  it('pour chaque type, toute la journée : un local ouvert montre au moins une personne derrière la vitrine, jamais plus de trois visibles', () => {
    // Samedi (amplitudes longues, relais) et le dimanche qui suit (plages de la veille passées minuit).
    for (const date of [{ y: 2026, m: 10, d: 10 }, { y: 2026, m: 10, d: 11 }]) {
      for (const type of SHOP_TYPE_IDS) {
        const shifts = staffShiftsAt(SHOP_DEFS[type], SEED, 'shop-0', date);
        for (const m of criticalMinutes(shifts, rangeBounds(type, date))) {
          const view = viewOf(type, date, m);
          const cast = staffCast(view, shifts, date, m, false);
          const atDoor = cast.street.filter((s) => s.visible && s.atDoor).length;
          if (view.phase === 'open') expect(cast.inside.length, `${type} ${m}`).toBeGreaterThanOrEqual(1);
          expect(cast.inside.length + atDoor, `${type} ${m}`).toBeLessThanOrEqual(3);
          if (cast.shutter === 'down') expect(cast.inside).toHaveLength(0);
          if (view.phase === 'closed' && cast.shutter === 'down') expect(cast.street.filter((s) => s.visible && s.atDoor)).toHaveLength(0);
        }
      }
    }
  });
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
  it('jour d’un changement : personne avant la fin du chantier, puis jamais de local ouvert vide (plusieurs graines et jours)', () => {
    let changes = 0;
    let openMinutes = 0;
    let opensBeforeEnd = 0; // nouveaux occupants dont les horaires couvrent déjà la fin du chantier (arrivée repoussée)
    for (const seed of [1, 2, 3]) {
      const seedSlots = shopSlotsFor(W, H, seed);
      for (let day = EPOCH + 1; day < EPOCH + 120; day++) {
        const ymd = ymdOfDay(day);
        const street = streetOn(seedSlots, seed, EPOCH, day, {});
        // Décalages du déménagement (un seul camion à la fois) : le chantier, donc l'arrivée du personnel, suit.
        const offsets = movingOffsets(street, seed, day);
        for (const s of street) {
          if (!s.change) continue;
          changes++;
          const offset = offsets.get(s.slot.id) ?? 0;
          const end = changePlans(seed, s.slot.id, day, s.change.kind, offset).works.end;
          if (s.tenant && isOpenAt(SHOP_DEFS[s.tenant.type], ymd, Math.ceil(end))) opensBeforeEnd++;
          const shifts = dayShifts(s, seed, ymd, offset);
          const plans = changePlans(seed, s.slot.id, day, s.change.kind, offset);
          const bounds = [plans.moving.start, plans.moving.end, plans.works.start, plans.works.end, ...(s.tenant ? rangeBounds(s.tenant.type, ymd) : [])];
          for (const m of criticalMinutes(shifts, bounds)) {
            const view = shopViewAt(s, seed, ymd, m, offset);
            const cast = staffCast(view, shifts, ymd, m, false);
            const where = `graine ${seed} jour ${day} ${s.slot.id} ${m}`;
            if (m < end) {
              expect(cast.inside, where).toHaveLength(0);
              expect(cast.street.filter((x) => x.visible), where).toHaveLength(0);
              expect(cast.shutter === 'up' || cast.shutter === 'rising', where).toBe(false);
            }
            if (view.phase === 'open') {
              openMinutes++;
              expect(cast.inside.length, where).toBeGreaterThanOrEqual(1);
            }
          }
        }
      }
    }
    expect(changes).toBeGreaterThan(5);
    expect(openMinutes).toBeGreaterThan(0);
    expect(opensBeforeEnd).toBeGreaterThan(0);
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
    // Le local est ouvert : quelqu'un est derrière la vitrine (l'ouvreur seul y est relevé au bout du geste).
    expect(c.querySelectorAll('[data-staff-window] [data-staff-where="inside"]').length).toBeGreaterThanOrEqual(1);
  });
  it('ouvreur seul : il est à la porte puis derrière la vitrine (relève posée par la boucle)', () => {
    const date = { y: 2026, m: 10, d: 10 };
    for (const type of SHOP_TYPE_IDS) {
      const shifts = staffShiftsAt(SHOP_DEFS[type], SEED, 'shop-0', date);
      const opener = shifts.find((x) => x.shutterUp !== undefined && x.shutterUp >= 0);
      if (!opener) continue;
      const cast = staffCast(viewOf(type, date, opener.shutterUp!), shifts, date, opener.shutterUp!, false);
      if (cast.handover === null) continue;
      expect(cast.handover).toBe(opener.id);
      const c = draw(type, date, opener.shutterUp!, false);
      expect(c.querySelector('[data-swap="out"][data-staff-where="opening"]')).not.toBeNull();
      expect(c.querySelector('[data-swap="in"][data-staff-where="inside"]')).not.toBeNull();
      return;
    }
    throw new Error('aucune ouverture par une personne seule');
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
  it('plafond des figurants : chaque employé visible compte une fois (relève de l’ouvreur, nœud de sortie caché)', () => {
    const date = { y: 2026, m: 10, d: 10 };
    let handovers = 0;
    let hiddenExits = 0;
    for (const type of ['bakery', 'cafe', 'restaurant'] as const) {
      const shifts = staffShiftsAt(SHOP_DEFS[type], SEED, 'shop-0', date);
      // Minutes où un même employé pourrait avoir deux nœuds : lever du rideau (relève), minute avant la sortie ; plus midi.
      const minutes = new Set<number>([12 * 60]);
      for (const sh of shifts) {
        if (sh.shutterUp !== undefined) minutes.add(Math.floor(sh.shutterUp)).add(Math.ceil(sh.shutterUp));
        minutes.add(Math.floor(sh.leaveAt - 1)).add(Math.ceil(sh.leaveAt - 1));
      }
      for (const m of [...minutes].filter((x) => x >= 0 && x < 1440)) {
        const c = draw(type, date, m, false);
        if (c.querySelector('[data-swap="in"]')) handovers++;
        if (c.querySelector('[data-staff-member][data-staff-where="inside"][data-active="false"]')) hiddenExits++;
        const people = new Set([...c.querySelectorAll('[data-staff-member][data-active="true"], [data-posed="staff"]')].map((n) => n.getAttribute('data-staff-member')));
        expect(countShopSprites(c).keep, `${type} ${m}`).toBe(people.size);
        act(() => mounted.pop()!.root.unmount());
      }
    }
    expect(handovers).toBeGreaterThan(0);
    expect(hiddenExits).toBeGreaterThan(0);
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
