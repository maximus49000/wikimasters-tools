// @vitest-environment jsdom
// tests/content/city-shops-life.test.tsx — personnel, gestes et rideau roulant (vague 1b-iv-b)
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY, writeArt } from '../../src/content/art-setting';
import { CityLifeLayer } from '../../src/content/city-life';
import { ShopCustomers, ShopWorks, StaffLayer, collectPosedStaff, collectStaffWalks, collectWorkers, countShopSprites, customerState, dayShifts, placeCustomers, placeStaff, placeStaffWalks, placeWorkers, staffCast } from '../../src/content/city-shops-life';
import { ghibliGesture } from '../../src/content/shop-gesture-sprites';
import { FigureContext, FigureRegistry } from '../../src/content/figure/figure-host';
import { THRESHOLD_S } from '../../src/core/library/city/doorway';
import { TURN_S } from '../../src/core/library/figure/gait';
import { DOOR_SILL_HALF, DOOR_SILL_TOP, sillBox } from '../../src/content/door-passage';
import { visitAt, visitsFor, type VisitLock } from '../../src/core/library/city/shops/customers';
import { addDays, dayContext, type YMD } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { SHOP_DEFS, SHOP_TYPE_IDS, type ShopTypeId } from '../../src/core/library/city/shops/catalog';
import { ACCESSORY, gestureAt, type Pose } from '../../src/core/library/city/shops/gestures';
import type { WorkStep } from '../../src/core/library/city/shops/works';
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
  const draw = (type: ShopTypeId, date: YMD, minutes: number, reduced: boolean, ghibli = false): HTMLDivElement =>
    render(
      <svg>
        <StaffLayer
          ghibli={ghibli}
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
  it('Ghibli : le rideau attend l’ouvreur (seuil + demi-tour), classique : il part tout de suite', () => {
    const [open] = rangesOf(SHOP_DEFS.bakery, TUESDAY)[0]!;
    const transitionOf = (c: HTMLElement): string => c.querySelector<SVGGElement>('[data-rolling-shutter] > g')!.style.transition;
    expect(transitionOf(draw('bakery', TUESDAY, open, false))).toMatch(/ 0s$/);
    expect(transitionOf(draw('bakery', TUESDAY, open, false, true))).toContain(`ease-in-out ${THRESHOLD_S + TURN_S}s`);
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

describe('clients : portes et verrou', () => {
  const frames = new Map(slots.map((s) => [s.id, shopFrame(s, metrics.ground)]));
  // Les trois nœuds d'une visite, comme les rend ShopCustomers (rue, porte du local, intérieur).
  const nodesOf = (id: string): Map<string, Element> => {
    const ns = 'http://www.w3.org/2000/svg';
    const make = (tag: string, life: string): Element => {
      const n = document.createElementNS(ns, tag);
      n.setAttribute('data-life-id', life);
      return n;
    };
    return new Map([[id, make('g', id)], [`${id}-door`, make('svg', `${id}-door`)], [`${id}-in`, make('g', `${id}-in`)]]);
  };
  const active = (nodes: Map<string, Element>): string[] => [...nodes.values()].filter((n) => n.getAttribute('data-active') === 'true').map((n) => n.getAttribute('data-life-id')!);
  // Nœud de porte complet (ombre + figure), comme le rend ShopCustomers.
  const withDoorParts = (nodes: Map<string, Element>, id: string): { svg: Element; dark: Element; fig: Element } => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = nodes.get(`${id}-door`)!;
    const dark = document.createElementNS(ns, 'rect');
    dark.setAttribute('data-door-dark', '');
    const fig = document.createElementNS(ns, 'g');
    fig.setAttribute('data-door-fig', '');
    svg.append(dark, fig);
    return { svg, dark, fig };
  };
  const translateOf = (n: Element): [number, number] => {
    const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(n.getAttribute('transform')!)!;
    return [Number(m[1]), Number(m[2])];
  };
  it('passage rue → porte du local : pieds sur m.doorY, cadre large sur le seuil puis resserré sur la porte, ombre sur la porte', () => {
    const v = visitsFor(slots, frames, SEED, () => 'bakery')[0]!;
    let c0 = 0;
    for (let n = 0; visitAt(v, W, c0 - v.phase)?.stage !== 'enter' && n < 200000; n++) c0 += 0.01;
    expect(visitAt(v, W, c0 - v.phase)?.stage).toBe('enter');
    // Début exact du seuil (dichotomie) : profondeur ≈ 0.
    let lo = c0 - 0.01;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + c0) / 2;
      if (visitAt(v, W, mid - v.phase)?.stage === 'enter') c0 = mid;
      else lo = mid;
    }
    const nodes = nodesOf(v.id);
    const { svg, dark, fig } = withDoorParts(nodes, v.id);
    const lock: VisitLock = new Map();
    const place = (c: number, first = false) => placeCustomers(nodes, [v], new Map([[v.slotId, 1]]), W, metrics, c - v.phase, first, new Set(), { lock });
    place(c0, true);
    const p0 = visitAt(v, W, c0 - v.phase)!.passage!;
    expect(p0.depth).toBeLessThan(1e-4);
    expect(svg.getAttribute('data-active')).toBe('true');
    // Pieds dans le repère du monde : y du <svg> + translation de la figure.
    const [fx, fy] = translateOf(fig);
    expect(Math.abs(Number(svg.getAttribute('y')) + fy - metrics.doorY)).toBeLessThan(0.1);
    expect(Math.abs(Number(svg.getAttribute('x')) + fx - v.doorX)).toBeLessThan(0.1);
    expect(Number(svg.getAttribute('width'))).toBeGreaterThanOrEqual(2 * DOOR_SILL_HALF);
    // En haut : toute la figure, parapluie compris.
    const k = metrics.unit * 0.55 * v.scale;
    expect(Number(svg.getAttribute('y'))).toBeLessThanOrEqual(metrics.doorY - DOOR_SILL_TOP * k + 0.01);
    // L'ombre reste exactement sur la porte du local.
    const darkAt = (): number => Number(svg.getAttribute('x')) + Number(dark.getAttribute('x'));
    const darkTop = (): number => Number(svg.getAttribute('y')) + Number(dark.getAttribute('y'));
    expect(Math.abs(darkTop() - v.shopDoor.y)).toBeLessThan(0.02);
    expect(Math.abs(darkAt() - v.shopDoor.x)).toBeLessThan(0.02);
    expect(Number(dark.getAttribute('width'))).toBeCloseTo(v.shopDoor.w, 2);
    // Au-delà de 0,4 de profondeur : le cadre est la porte.
    for (const dc of [0.45, 0.7, 0.95]) {
      place(c0 + dc);
      expect(visitAt(v, W, c0 + dc - v.phase)!.passage!.depth).toBeGreaterThanOrEqual(0.4);
      expect(Number(svg.getAttribute('width'))).toBeCloseTo(v.shopDoor.w, 2);
      expect(Number(svg.getAttribute('x'))).toBeCloseTo(v.shopDoor.x, 2);
      expect(Number(svg.getAttribute('y'))).toBeCloseTo(v.shopDoor.y, 2);
      expect(Math.abs(darkAt() - v.shopDoor.x)).toBeLessThan(0.02);
      expect(Math.abs(darkTop() - v.shopDoor.y)).toBeLessThan(0.02);
      // Pieds toujours sous la porte, sur la ligne de la rue moins l'enfoncement.
      expect(Number(svg.getAttribute('y')) + Number(svg.getAttribute('height'))).toBeCloseTo(metrics.doorY, 2);
    }
  });
  it('cadre de porte : à profondeur 0, ≥ 20 px de large et haut jusqu’au sommet du parapluie ; la porte dès 0,4', () => {
    const door = { x: 100, y: 220, w: 6, h: 18 };
    const k = 0.55;
    const z = sillBox(door, 0, metrics, k);
    expect(z.clip.w).toBeGreaterThanOrEqual(20);
    expect(z.clip.y).toBeLessThanOrEqual(metrics.doorY - DOOR_SILL_TOP * k);
    expect(z.clip.y + z.dark.y).toBeCloseTo(door.y, 6);
    for (const d of [0.4, 0.6, 1]) {
      const b = sillBox(door, d, metrics, k);
      expect(b.clip.x).toBeCloseTo(door.x, 6);
      expect(b.clip.y).toBeCloseTo(door.y, 6);
      expect(b.clip.w).toBeCloseTo(door.w, 6);
      expect(b.dark.x).toBeCloseTo(0, 6);
      expect(b.dark.y).toBeCloseTo(0, 6);
      expect([b.dark.w, b.dark.h]).toEqual([door.w, door.h]);
    }
    const mid = sillBox(door, 0.2, metrics, k).clip;
    expect(mid.w).toBeLessThan(z.clip.w);
    expect(mid.w).toBeGreaterThan(door.w);
    expect(mid.y).toBeGreaterThan(z.clip.y);
    expect(mid.y).toBeLessThan(door.y);
  });
  it('changement de minute pendant une visite : le client reste (verrou)', () => {
    const v = visitsFor(slots, frames, SEED, () => 'bakery')[0]!;
    const t0 = -v.phase;
    expect(visitAt(v, W, t0 + 10)?.stage).toBe('in');
    const nodes = nodesOf(v.id);
    const lock: VisitLock = new Map();
    placeCustomers(nodes, [v], new Map([[v.slotId, 1]]), W, metrics, t0, true, new Set(), { lock });
    expect(active(nodes)).toHaveLength(1);
    placeCustomers(nodes, [v], new Map([[v.slotId, 0]]), W, metrics, t0 + 10, false, new Set(), { lock });
    expect(active(nodes)).toEqual([v.id]);
    // Sans verrou, la probabilité nulle aurait retiré le client en pleine rue.
    const bare = nodesOf(v.id);
    placeCustomers(bare, [v], new Map([[v.slotId, 0]]), W, metrics, t0 + 10, true, new Set(), { lock: new Map() });
    expect(active(bare)).toHaveLength(0);
  });
  it('visite suspendue par le plafond au moment du verrou : absente tout le tour', () => {
    const v = visitsFor(slots, frames, SEED, () => 'bakery')[0]!;
    const t0 = -v.phase;
    const nodes = nodesOf(v.id);
    const lock: VisitLock = new Map();
    placeCustomers(nodes, [v], new Map([[v.slotId, 1]]), W, metrics, t0, true, new Set([v.id]), { lock });
    placeCustomers(nodes, [v], new Map([[v.slotId, 1]]), W, metrics, t0 + 10, false, new Set(), { lock });
    expect(active(nodes)).toHaveLength(0);
  });
  it('Ghibli : à chaque bascule, la figure du nœud éteint perd son href (symbole libéré), celle du nœud allumé le retrouve', () => {
    const v = visitsFor(slots, frames, SEED, () => 'bakery')[0]!;
    const nodes = nodesOf(v.id);
    const ns = 'http://www.w3.org/2000/svg';
    const figures = new FigureRegistry('tc', { perFrame: 50 });
    const palette = figures.addPalette({ 'f-ink': '#33241f' });
    for (const n of nodes.values()) {
      const fig = document.createElementNS(ns, 'g');
      fig.setAttribute('data-figure', '');
      fig.setAttribute('data-sig', 'short.long.pants.none.n');
      fig.setAttribute('data-palette', palette);
      const use = document.createElementNS(ns, 'image');
      use.setAttribute('href', 'data:image/png;base64,stale');
      fig.setAttribute('data-key', 'stale');
      fig.append(use);
      n.append(fig);
    }
    const lock: VisitLock = new Map();
    const writes = vi.spyOn(Element.prototype, 'removeAttribute');
    let toggles = 0;
    let was = '';
    for (let c = 0; c < 240; c += 0.25) {
      placeCustomers(nodes, [v], new Map([[v.slotId, 1]]), W, metrics, c - v.phase, c === 0, new Set(), { lock, ghibli: true, figures });
      figures.flush();
      for (const n of nodes.values()) {
        const use = n.querySelector('[data-figure] > image')!;
        expect(use.hasAttribute('href')).toBe(n.getAttribute('data-active') === 'true');
      }
      const now = active(nodes).join();
      if (now !== was) toggles++;
      was = now;
    }
    expect(toggles).toBeGreaterThan(2);
    // N'écrit qu'aux bascules : 2 retraits (href, data-key) par extinction, jamais à chaque image.
    expect(writes.mock.calls.filter(([a]) => a === 'href').length).toBeLessThanOrEqual(toggles + 3);
    writes.mockRestore();
  });
  it('un seul nœud actif à la fois : rue, porte du local (seuil) ou intérieur', () => {
    const v = visitsFor(slots, frames, SEED, () => 'bakery')[0]!;
    const nodes = nodesOf(v.id);
    const lock: VisitLock = new Map();
    const seen = new Set<string>();
    for (let c = 0; c < 240; c += 0.25) {
      placeCustomers(nodes, [v], new Map([[v.slotId, 1]]), W, metrics, c - v.phase, c === 0, new Set(), { lock });
      const on = active(nodes);
      expect(on.length).toBeLessThanOrEqual(1);
      on.forEach((id) => seen.add(id));
    }
    expect([...seen].sort()).toEqual([v.id, `${v.id}-door`, `${v.id}-in`].sort());
  });
  it('aucun client sans fondu : nœuds sans opacité intermédiaire ni transition', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    const c = life(600);
    const nodes = c.querySelectorAll('[data-customer], [data-customer-inside], svg[data-customer-door]');
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) {
      expect(['1.00', '0.00']).toContain(n.getAttribute('opacity'));
      expect((n as SVGElement).style.transition).toBe('');
    }
  });
  it('Ghibli : chaque client est un pantin (rue, porte, vitrine), sans miroir ni objet du dessin classique ; classique inchangé', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    try {
      writeArt('ghibli');
      const c = life(600);
      const nodes = [...c.querySelectorAll('[data-customer], [data-customer-inside], svg[data-customer-door]')];
      expect(nodes.length).toBeGreaterThan(0);
      for (const n of nodes) {
        expect(n.querySelector('[data-figure]')).not.toBeNull();
        expect(n.querySelector('[data-item], [data-pose-body]')).toBeNull();
        expect(n.getAttribute('transform') ?? '').not.toMatch(/scale\(-/);
        // Nœud inactif : <image> sans href (aucun sprite retenu).
        const use = n.querySelector('[data-figure] > image')!;
        expect(use.hasAttribute('href')).toBe(n.getAttribute('data-active') === 'true');
      }
    } finally {
      localStorage.removeItem(ART_KEY);
    }
    const classic = life(600);
    expect(classic.querySelectorAll('[data-customer] [data-figure], [data-customer-inside] [data-figure]')).toHaveLength(0);
  });
});

// ---------- G3b : gestes des commerces au pantin ----------
// Clé affichée d'une figure : palette # sig|yaw|gait|phase|head|arms|lean.
const keyOf = (fig: Element | null): string[] => (fig?.getAttribute('data-key') ?? '').split('#').pop()!.split('|');
const shown = (n: Element | null): boolean => !!n && n.getAttribute('visibility') !== 'hidden' && n.getAttribute('display') !== 'none';

describe('G3b : correspondance des gestes (ghibliGesture)', () => {
  const pose = (p: Partial<Pose>): Pose => ({ arms: 'down', lean: 0, head: 'front', item: 'none', sway: 0, ...p });
  it('bras : mêmes poses que le classique', () => {
    for (const arms of ['down', 'reach', 'hold', 'up', 'work'] as const) expect(ghibliGesture(pose({ arms })).arms).toBe(arms);
  });
  it('penché : round(lean × 4) borné à 0..2 ; tête baissée : +1 (borné)', () => {
    expect(ghibliGesture(pose({ lean: 0 })).lean).toBe(0);
    expect(ghibliGesture(pose({ lean: 0.2 })).lean).toBe(1);
    expect(ghibliGesture(pose({ lean: 0.5 })).lean).toBe(2);
    expect(ghibliGesture(pose({ lean: -0.4 })).lean).toBe(0);
    expect(ghibliGesture(pose({ lean: 0.1, head: 'down' })).lean).toBe(1);
    expect(ghibliGesture(pose({ lean: 0.45, head: 'down' })).lean).toBe(2);
    expect(ghibliGesture(pose({ head: 'down' })).head).toBe(0);
  });
  it('tête : de face 0, tournée de ±4 vers l’arrière (selon le côté regardé)', () => {
    expect(ghibliGesture(pose({ head: 'front' })).head).toBe(0);
    expect(ghibliGesture(pose({ head: 'turn' }), 1).head).toBe(4);
    expect(ghibliGesture(pose({ head: 'turn' }), -1).head).toBe(-4);
  });
});

describe('G3b : personnel, clients et chantier en pantins', () => {
  const frame = shopFrame(slots[0]!, metrics.ground);
  const NOW = 1_790_000_000_000;
  const T = NOW / 1000;
  const withFigures = (figures: FigureRegistry, node: ReactNode): ReactNode => <FigureContext.Provider value={figures}>{node}</FigureContext.Provider>;
  const staffDraw = (figures: FigureRegistry, type: ShopTypeId, date: YMD, minutes: number, ghibli: boolean): HTMLDivElement =>
    render(
      withFigures(
        figures,
        <svg>
          <StaffLayer
            view={viewOf(type, date, minutes)}
            shifts={staffShiftsAt(SHOP_DEFS[type], SEED, 'shop-0', date)}
            frame={frame}
            metrics={metrics}
            minutes={minutes}
            reduced={false}
            date={date}
            width={W}
            sky={skyAt(minutes, times)}
            rainy={false}
            umbrella={false}
            seed={SEED}
            seats={[frame.window.w * 0.35, frame.window.w * 0.7]}
            post={frame.window.w * 0.6}
            ghibli={ghibli}
          />
        </svg>,
      ),
    );
  // Pose deux fois, peinture entre les deux (poseFigure garde l'image tant que le sprite n'est pas peint).
  const settle = (figures: FigureRegistry, f: () => void): void => {
    f();
    figures.flush();
    f();
  };

  it('employé : pantin en tablier (métier de bouche), objet à la main pendant un geste « hold » ; classique inchangé', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('t3', { perFrame: 50 });
    const c = staffDraw(figures, 'bakery', TUESDAY, 600, true);
    const node = c.querySelector('[data-posed="staff"]')!;
    const fig = node.querySelector('[data-figure]')!;
    expect(fig.getAttribute('data-sig')!.endsWith('.a')).toBe(true);
    expect(node.getAttribute('transform') ?? '').not.toMatch(/scale\(-/);
    expect(node.querySelector('[data-arm], [data-pose-body]')).toBeNull();
    const seed = Number(node.getAttribute('data-gesture-seed'));
    let t = 0;
    const holdsBread = (x: number): boolean => gestureAt('bakery', 'staff', x, seed).arms === 'hold' && gestureAt('bakery', 'staff', x, seed).item === 'hand';
    for (let n = 0; !holdsBread(t) && n < 20000; n++) t += 0.1;
    expect(holdsBread(t)).toBe(true);
    const staff = collectPosedStaff(c);
    settle(figures, () => placeStaff(staff, t, figures));
    expect(keyOf(fig)[5]).toBe('hold');
    expect(['2', '6']).toContain(keyOf(fig)[1]);
    const hand = node.querySelector('[data-item-hand]')!;
    expect(hand.querySelector(`[data-accessory="${ACCESSORY.bakery}"]`)).not.toBeNull();
    expect(hand.closest('[data-held]')!.getAttribute('data-held')).toBe('handR');
    expect(shown(hand)).toBe(true);
    // Geste sans objet : la main est vide.
    let u = 0;
    for (let n = 0; gestureAt('bakery', 'staff', u, seed).item !== 'none' && n < 20000; n++) u += 0.1;
    expect(gestureAt('bakery', 'staff', u, seed).item).toBe('none');
    settle(figures, () => placeStaff(staff, u, figures));
    expect(shown(hand)).toBe(false);
    // Hors métier de bouche : sans tablier.
    const books = staffDraw(figures, 'bookshop', TUESDAY, 15 * 60, true).querySelector('[data-posed="staff"] [data-figure]');
    if (books) expect(books.getAttribute('data-sig')!.endsWith('.n')).toBe(true);
    // Classique : le passant en pose, sans pantin.
    const classic = staffDraw(figures, 'bakery', TUESDAY, 600, false);
    expect(classic.querySelector('[data-posed="staff"] [data-arm]')).not.toBeNull();
    expect(classic.querySelector('[data-figure]')).toBeNull();
  });

  it('employés à pied : sortent de la porte, rideau bras au-dessus de la tête, rentrent par la porte ; aucune opacité de fondu', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('t3w', { perFrame: 50 });
    const [open] = rangesOf(SHOP_DEFS.bakery, TUESDAY)[0]!;
    const c = staffDraw(figures, 'bakery', TUESDAY, open, true);
    const member = c.querySelector('[data-staff-where="opening"][data-active="true"]')!;
    expect(member).not.toBeNull();
    expect((member as SVGElement).style.transition).toBe('');
    expect(member.getAttribute('opacity')).toBeNull();
    const street = member.querySelector('[data-staff-street]')!;
    const door = member.querySelector('svg[data-staff-door]')!;
    const walks = collectStaffWalks(c);
    expect(walks.length).toBeGreaterThan(0);
    // Début : dans la porte du local (seuil), pas sur le trottoir.
    settle(figures, () => placeStaffWalks(walks, T + 0.3, metrics, figures));
    expect(shown(door)).toBe(true);
    expect(shown(street)).toBe(false);
    // Puis devant le rideau, de dos, bras au-dessus de la tête.
    settle(figures, () => placeStaffWalks(walks, T + 3, metrics, figures));
    expect(shown(street)).toBe(true);
    expect(shown(door)).toBe(false);
    const k = keyOf(street.querySelector('[data-figure]'));
    expect(k[5]).toBe('overhead');
    expect(k[1]).toBe('12');
    // Enfin rentré par la porte : plus rien de visible.
    settle(figures, () => placeStaffWalks(walks, T + 30, metrics, figures));
    expect(shown(street)).toBe(false);
    expect(shown(door)).toBe(false);
  });

  it('employé qui arrive : marche de profil, phase réglée sur la distance, puis entre par la porte du local', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('t3a', { perFrame: 50 });
    const shifts = staffShiftsAt(SHOP_DEFS.bakery, SEED, 'shop-0', TUESDAY);
    const sh = shifts.find((s) => s.arriveAt > 60 && s.shutterUp === undefined) ?? shifts.find((s) => s.arriveAt > 60)!;
    const m = Math.ceil(sh.arriveAt - 1);
    const c = staffDraw(figures, 'bakery', TUESDAY, m, true);
    const member = c.querySelector(`[data-staff-member="${sh.id}"][data-staff-where="walking-in"]`)!;
    expect(member.getAttribute('data-active')).toBe('true');
    const street = member.querySelector('[data-staff-street]')!;
    const walks = collectStaffWalks(c);
    const xs: number[] = [];
    for (const dt of [10, 20, 30]) {
      settle(figures, () => placeStaffWalks(walks, T + dt, metrics, figures));
      expect(shown(street)).toBe(true);
      const key = keyOf(street.querySelector('[data-figure]'));
      expect(key[2]).toBe('walk');
      expect(['0', '8']).toContain(key[1]);
      xs.push(Number(/translate\(([-\d.]+)/.exec(street.getAttribute('transform')!)![1]));
    }
    const doorX = frame.door.x + frame.door.w / 2;
    // Avance vers la porte, régulièrement.
    expect(Math.abs(xs[2]! - doorX)).toBeLessThan(Math.abs(xs[0]! - doorX));
    expect(Math.abs(xs[1]! - xs[0]! - (xs[2]! - xs[1]!))).toBeLessThan(0.5);
    // Fin de la minute : seuil de la porte du local, puis caché (dans le local).
    settle(figures, () => placeStaffWalks(walks, T + 58, metrics, figures));
    expect(shown(member.querySelector('svg[data-staff-door]'))).toBe(true);
    settle(figures, () => placeStaffWalks(walks, T + 61, metrics, figures));
    expect(shown(street) || shown(member.querySelector('svg[data-staff-door]'))).toBe(false);
  });

  it('client à l’intérieur : pantin qui fait le geste, objet à la main pendant « hold » ; dans la rue en repartant, l’objet emporté', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('t3c', { perFrame: 50 });
    const frames = new Map(slots.map((s) => [s.id, shopFrame(s, metrics.ground)]));
    const v = visitsFor(slots, frames, SEED, () => 'bakery')[0]!;
    const gates = new Map([[v.slotId, 1]]);
    const c = render(withFigures(figures, <svg><ShopCustomers visits={[v]} frames={frames} views={[]} gates={gates} width={W} metrics={metrics} t0={0} sky={skyAt(600, times)} rainy={false} umbrella={false} ghibli /></svg>));
    const nodes = new Map([...c.querySelectorAll('[data-life-id]')].map((n) => [n.getAttribute('data-life-id')!, n]));
    let hold: number | null = null;
    let carry: number | null = null;
    for (let t = 0; t < 400 && (hold === null || carry === null); t += 0.1) {
      const s = customerState(v, 1, W, t);
      if (hold === null && s.on && s.stage === 'inside' && s.gesture?.arms === 'hold' && s.gesture.item === 'hand') hold = t;
      if (carry === null && s.on && s.stage === 'out' && s.carry && s.passage?.stage === 'street') carry = t;
    }
    expect(hold).not.toBeNull();
    expect(carry).not.toBeNull();
    const inn = nodes.get(`${v.id}-in`)!;
    settle(figures, () => placeCustomers(nodes, [v], gates, W, metrics, hold!, true, new Set(), { ghibli: true, figures }));
    expect(inn.getAttribute('data-active')).toBe('true');
    expect(keyOf(inn.querySelector('[data-figure]'))[5]).toBe('hold');
    const hand = inn.querySelector('[data-item-hand]')!;
    expect(hand.querySelector(`[data-accessory="${ACCESSORY.bakery}"]`)).not.toBeNull();
    expect(shown(hand)).toBe(true);
    const out = nodes.get(v.id)!;
    settle(figures, () => placeCustomers(nodes, [v], gates, W, metrics, carry!, false, new Set(), { ghibli: true, figures }));
    expect(out.getAttribute('data-active')).toBe('true');
    const carried = out.querySelector('[data-item-carry]')!;
    expect(carried.closest('[data-held]')!.getAttribute('data-held')).toBe('handR');
    expect(shown(carried)).toBe(true);
    expect(out.querySelector('[data-item]')).toBeNull();
  });

  it('chantier : ouvriers en gilet, escalade de dos, enseigne posée bras au-dessus de la tête, ancienne portée ; marche réglée sur la distance', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const figures = new FigureRegistry('t3k', { perFrame: 50 });
    const view = (step: WorkStep, progress: number): ShopView => ({ ...viewOf('bakery', TUESDAY, 600), phase: 'works', works: { step, progress, kind: 'relet', carrying: 'sign' } });
    const works = (step: WorkStep, progress: number, ghibli: boolean): ReactNode =>
      withFigures(figures, <svg><ShopWorks view={view(step, progress)} frame={frame} change={null} width={W} metrics={metrics} sky={skyAt(600, times)} rainy={false} still={false} seed={SEED} ghibli={ghibli} /></svg>);
    const pose = (c: Element, i: number): string[] => keyOf(c.querySelectorAll('[data-worker]')[i]!.querySelector('[data-figure]'));
    const climb = render(works('climb', 0.5, true));
    const sigs = [...climb.querySelectorAll('[data-worker] [data-figure]')].map((f) => f.getAttribute('data-sig')!);
    expect(sigs).toHaveLength(2);
    for (const s of sigs) expect(s.endsWith('.v')).toBe(true);
    expect(pose(climb, 0)[2]).toBe('climb');
    expect(pose(climb, 0)[1]).toBe('12');
    const install = render(works('install', 0.5, true));
    expect(pose(install, 0)[5]).toBe('overhead');
    const leave = render(works('leave', 0.5, true));
    expect(pose(leave, 1)[5]).toBe('carry');
    for (const n of leave.querySelectorAll('[data-worker]')) expect(n.querySelector(':scope > g')!.getAttribute('transform') ?? '').not.toMatch(/scale\(-/);
    // Marche : deux minutes de suite (transition de 30 s), la boucle pose la marche puis l'arrêt.
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    act(() => root.render(works('arrive', 0.2, true)));
    act(() => root.render(works('arrive', 0.4, true)));
    const crew = collectWorkers(host);
    expect(crew).toHaveLength(2);
    settle(figures, () => placeWorkers(crew, T + 10, figures));
    expect(pose(host, 0)[2]).toBe('walk');
    expect(['0', '8']).toContain(pose(host, 0)[1]);
    settle(figures, () => placeWorkers(crew, T + 31, figures));
    expect(pose(host, 0)[2]).toBe('stand');
    // Classique inchangé.
    const classic = render(works('climb', 0.5, false));
    expect(classic.querySelector('[data-figure]')).toBeNull();
    expect(classic.querySelectorAll('[data-worker]')).toHaveLength(2);
  });
});
