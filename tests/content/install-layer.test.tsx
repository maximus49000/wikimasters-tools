// @vitest-environment jsdom
// tests/content/install-layer.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { InstallLayer } from '../../src/content/install-layer';
import { dayContext, type YMD } from '../../src/core/library/city/calendar';
import { doorsFor } from '../../src/core/library/city/doors';
import { absMinute, decorSetsFor, itemPhase } from '../../src/core/library/city/install';
import { lampsFor } from '../../src/core/library/city/lamps';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { dayNumber } from '../../src/core/library/city/shops/hours';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { DARK } from '../../src/core/library/city/events';
import { BARRIER, STAGE } from '../../src/content/install-sprites';
import { barrierK } from '../../src/content/install-layer';
import { MUSICIANS, musicianAt } from '../../src/content/stage-band';

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
  vi.unstubAllGlobals();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const W = 720;
const H = 340;
const SEED = 1;
const metrics = cityMetrics(H);
const times = sunTimes({ y: 2026, m: 7, d: 14 }, { lat: 48.85, lon: 2.35 }, 120);
const skyOf = (minutes: number) => skyAt(minutes, times);
const D13: YMD = { y: 2026, m: 7, d: 13 };
const D14: YMD = { y: 2026, m: 7, d: 14 };
const D15: YMD = { y: 2026, m: 7, d: 15 };
const ORDINARY: YMD = { y: 2026, m: 10, d: 10 };
const MUSIC: YMD = { y: 2026, m: 6, d: 21 };
const MUSIC_NEXT: YMD = { y: 2026, m: 6, d: 22 };

const layer = (date: YMD, minutes: number, still = false): HTMLDivElement =>
  render(
    <svg>
      <InstallLayer width={W} height={H} seed={SEED} sky={skyOf(minutes)} still={still} date={date} minutes={minutes} metrics={metrics} rainy={false} />
    </svg>,
  );
const count = (c: Element, sel: string): number => c.querySelectorAll(sel).length;
const LAMPS = lampsFor(W, SEED).length;
const FLAG_DOORS = doorsFor(W, H, SEED).filter((d) => d.hallU < 0.5).length;

describe('calque des équipes d’installation', () => {
  it('le banc est utile : il y a des lampadaires et des entrées pavoisables', () => {
    expect(LAMPS).toBeGreaterThan(1);
    expect(FLAG_DOORS).toBeGreaterThan(0);
  });

  it('13/7 à midi : une équipe à l’œuvre, des drapeaux déjà posés, d’autres pas encore', () => {
    const c = layer(D13, 720);
    expect(count(c, '[data-crew]')).toBeGreaterThan(0);
    expect(count(c, '[data-crew] [data-worker]')).toBeGreaterThan(0);
    const flags = count(c, '[data-decor-item][data-decor-kind="lamp-flag"]') + count(c, '[data-decor-item][data-decor-kind="door-flag"]');
    expect(flags).toBeGreaterThan(0);
    expect(flags).toBeLessThan(LAMPS + FLAG_DOORS);
  });

  it('14/7 à midi : tous les drapeaux de lampadaires et d’entrées sont posés, aucune équipe', () => {
    const c = layer(D14, 720);
    expect(count(c, '[data-decor-item][data-decor-kind="lamp-flag"]')).toBe(LAMPS);
    expect(count(c, '[data-decor-item][data-decor-kind="door-flag"]')).toBe(FLAG_DOORS);
    expect(count(c, '[data-decor-item][data-decor-kind="barrier"]')).toBeGreaterThan(0);
    expect(count(c, '[data-crew]')).toBe(0);
    expect(count(c, '[data-van], [data-lift]')).toBe(0);
  });

  it('15/7 à midi : une équipe dépose les drapeaux', () => {
    const c = layer(D15, 720);
    expect(count(c, '[data-crew][data-removing="true"]')).toBeGreaterThan(0);
    const flags = count(c, '[data-decor-item][data-decor-kind="lamp-flag"]') + count(c, '[data-decor-item][data-decor-kind="door-flag"]');
    expect(flags).toBeLessThan(LAMPS + FLAG_DOORS);
  });

  it('15/7 à 18 h : tout est retiré, plus personne', () => {
    const c = layer(D15, 18 * 60);
    expect(count(c, '[data-decor-item]')).toBe(0);
    expect(count(c, '[data-crew]')).toBe(0);
  });

  it('un jour ordinaire : rien', () => {
    const c = layer(ORDINARY, 720);
    expect(count(c, '[data-decor-item]')).toBe(0);
    expect(count(c, '[data-crew], [data-van], [data-lift], [data-ladder]')).toBe(0);
  });

  it('mouvement réduit : seuls les décors posés, aucune équipe ni animation', () => {
    const c = layer(D14, 720, true);
    expect(count(c, '[data-decor-item][data-decor-kind="lamp-flag"]')).toBe(LAMPS);
    expect(count(c, '[data-crew], [data-van], [data-lift], [data-ladder]')).toBe(0);
    expect(count(c, 'animate, animateTransform')).toBe(0);
    // En pleine pose : seuls les éléments « présents » (le décor en cours de pose n'est pas dessiné).
    const busy = layer(D13, 720, true);
    const today = dayNumber(D13);
    const present = decorSetsFor(D13, W, H, SEED)
      .flatMap((set) => set.items.map((item) => itemPhase(set, item, absMinute(today, 720), set.day)))
      .filter((p) => p.phase === 'present').length;
    expect(count(busy, '[data-decor-item]')).toBe(present);
    expect(count(busy, '[data-crew]')).toBe(0);
  });

  it('un élément en hauteur a toujours une échelle ou une nacelle ; à la main, jamais', () => {
    const seen = { high: 0, hand: 0, ladder: 0, lift: 0 };
    const check = (date: YMD, from: number, to: number, step: number): void => {
      for (let m = from; m < to; m += step) {
        const c = layer(date, m);
        for (const crew of c.querySelectorAll('[data-crew]')) {
          const tools = crew.querySelectorAll('[data-ladder], [data-lift]').length;
          if (crew.getAttribute('data-high') === 'true') {
            seen.high++;
            expect(tools, `${date.d}/${date.m} ${m} ${crew.getAttribute('data-crew')}`).toBeGreaterThan(0);
            if (crew.querySelector('[data-ladder]')) seen.ladder++;
            if (crew.querySelector('[data-lift]')) seen.lift++;
          }
          if (crew.getAttribute('data-equipment') === 'hand') {
            seen.hand++;
            expect(crew.getAttribute('data-high')).toBe('false');
            expect(tools).toBe(0);
          }
        }
        for (const { root, host } of mounted.splice(0)) {
          act(() => root.unmount());
          host.remove();
        }
      }
    };
    check(D13, 540, 1020, 11);
    check(D15, 540, 1020, 23);
    check(D14, 420, 480, 4);
    check(D14, 750, 810, 6);
    check(MUSIC, 540, 960, 13);
    check(MUSIC_NEXT, 0, 240, 13);
    expect(seen.high).toBeGreaterThan(0);
    expect(seen.ladder).toBeGreaterThan(0);
    expect(seen.lift).toBeGreaterThan(0);
    expect(seen.hand).toBeGreaterThan(0);
  });

  it('scène de la Fête de la musique : plancher, ossature et projecteurs posés le 21/6 au soir', () => {
    const c = layer(MUSIC, 20 * 60);
    for (const kind of ['stage-floor', 'stage-frame', 'stage-spots']) expect(count(c, `[data-decor-item][data-decor-kind="${kind}"]`)).toBe(1);
    expect(count(c, '[data-stage-spot]')).toBe(3);
  });

  it('14/7 : barrières sur la chaussée, jamais sur le pied d’un lampadaire', () => {
    const c = layer(D14, 9 * 60);
    const xs = [...c.querySelectorAll('[data-decor-kind="barrier"]')].map((e) => Number(e.getAttribute('data-x')));
    expect(xs.length).toBeGreaterThan(0);
    const half = BARRIER.half * barrierK(metrics.unit);
    for (const x of xs) for (const l of lampsFor(W, SEED)) expect(Math.abs(x - l.x), `barrière ${x} / lampadaire ${l.x}`).toBeGreaterThanOrEqual(half);
  });

  it('la camionnette ne se gare jamais sur le camion élévateur ni sur le pied d’un lampadaire', () => {
    let vans = 0;
    let both = 0;
    const scan = (date: YMD, from: number, to: number, step: number): void => {
      for (let m = from; m < to; m += step) {
        const c = layer(date, m);
        const trucks = [...c.querySelectorAll('[data-lift-truck]')].map((t) => ({ x: Number(t.getAttribute('data-x')), park: Number(t.getAttribute('data-park')) }));
        for (const v of c.querySelectorAll('[data-install-van]')) {
          vans++;
          const x = Number(v.getAttribute('data-x'));
          const half = Number(v.getAttribute('data-half'));
          for (const l of lampsFor(W, SEED)) expect(Math.abs(x - l.x), `${date.d}/${date.m} ${m} lampadaire`).toBeGreaterThanOrEqual(half);
          for (const t of trucks) {
            both++;
            expect(Math.abs(x - t.park), `${date.d}/${date.m} ${m} point de travail`).toBeGreaterThanOrEqual(60);
            expect(Math.abs(x - t.x), `${date.d}/${date.m} ${m} camion`).toBeGreaterThanOrEqual(half + 27);
          }
        }
        for (const { root, host } of mounted.splice(0)) {
          act(() => root.unmount());
          host.remove();
        }
      }
    };
    scan(D13, 520, 1040, 9);
    scan(MUSIC, 520, 980, 9);
    expect(vans).toBeGreaterThan(0);
    expect(both).toBeGreaterThan(0);
  });

  it('nacelle : l’ouvrier n’y est que levé ; scène montée avec une pièce de treillis ou un projecteur, jamais un drapeau', () => {
    const seen = { stow: 0, piece: 0 };
    const scan = (date: YMD, from: number, to: number, step: number): void => {
      for (let m = from; m < to; m += step) {
        const c = layer(date, m);
        for (const crew of c.querySelectorAll('[data-crew][data-equipment="lift"]')) {
          const step = crew.getAttribute('data-step')!;
          const inBucket = crew.querySelectorAll('[data-lift-bucket] [data-worker]').length;
          if (step === 'stow' || step === 'deploy') {
            seen.stow++;
            expect(inBucket, `${m} ${step}`).toBe(0);
            expect(crew.querySelectorAll('[data-worker]').length).toBe(2);
          }
          if ((crew.getAttribute('data-crew-item') ?? '').startsWith('stage-')) {
            expect(crew.querySelector('[data-held-flag]')).toBeNull();
            if (crew.querySelector('[data-held-piece]')) seen.piece++;
          }
        }
        for (const { root, host } of mounted.splice(0)) {
          act(() => root.unmount());
          host.remove();
        }
      }
    };
    scan(D13, 540, 1020, 7);
    scan(MUSIC, 540, 960, 5);
    scan(MUSIC_NEXT, 0, 240, 5);
    expect(seen.stow).toBeGreaterThan(0);
    expect(seen.piece).toBeGreaterThan(0);
  });

  it('aucun id SVG fixe', () => {
    for (const [d, m] of [[D13, 720], [D14, 450], [MUSIC, 700]] as const) expect(layer(d, m).querySelector('[id]')).toBeNull();
  });
});

describe('scène de la Fête de la musique : musiciens et faisceaux', () => {
  const num = (e: Element, a: string): number => Number(e.getAttribute(a));
  it('21/6 à 18 h : structure posée, musiciens présents, aucun faisceau (jour)', () => {
    expect(skyOf(18 * 60).daylight).toBeGreaterThanOrEqual(DARK);
    const c = layer(MUSIC, 18 * 60);
    expect(count(c, '[data-stage-spot]')).toBe(3);
    expect(count(c, '[data-stage-band]')).toBe(3);
    expect(count(c, '[data-stage-beam]')).toBe(0);
  });
  it('21/6 à 23 h : 3 faisceaux, chacun partant d’un projecteur de la traverse', () => {
    expect(skyOf(23 * 60).daylight).toBeLessThan(DARK);
    const c = layer(MUSIC, 23 * 60);
    const beams = [...c.querySelectorAll('[data-stage-beam]')];
    expect(beams).toHaveLength(3);
    beams.forEach((b, i) => {
      expect(Math.abs(num(b, 'data-origin-x') - STAGE.spotXs[i]!)).toBeLessThan(2);
      expect(Math.abs(num(b, 'data-origin-y') - (STAGE.spotY + 3))).toBeLessThan(1);
      expect(num(b, 'data-target-y')).toBe(-STAGE.floor);
    });
    expect(count(c, '[data-stage-band]')).toBe(3);
  });
  it('21/6 à 10 h : structure en pose, aucun musicien ni faisceau', () => {
    const c = layer(MUSIC, 10 * 60 + 30);
    expect(count(c, '[data-stage-band]')).toBe(0);
    expect(count(c, '[data-stage-beam]')).toBe(0);
  });
  it('22/6 à 2 h : dépose, ni faisceau ni musicien', () => {
    const c = layer(MUSIC_NEXT, 2 * 60);
    expect(count(c, '[data-stage-band]')).toBe(0);
    expect(count(c, '[data-stage-beam]')).toBe(0);
  });
  it('22/6 à 6 h : rien', () => {
    const c = layer(MUSIC_NEXT, 6 * 60);
    expect(count(c, '[data-stage-band], [data-stage-beam], [data-decor-item]')).toBe(0);
  });
  it('mouvement réduit : pas d’animation', () => {
    const c = layer(MUSIC, 23 * 60, true);
    expect(count(c, '[data-stage-beam]')).toBe(3);
    expect(count(c, '[data-stage-band]')).toBe(3);
    expect(count(c, 'animate, animateTransform')).toBe(0);
  });
  it('animé hors mouvement réduit', () => {
    expect(count(layer(MUSIC, 23 * 60), '[data-stage-band] animateTransform')).toBeGreaterThan(0);
  });
});

describe('musiciens : ils arrivent et repartent à pied', () => {
  // Horloge murale : début d'une minute + 10 s (la minute de la scène est donnée à part, comme dans la scène).
  const T = 1_790_000_040 + 10;
  const at = (date: YMD, minutes: number, still = false): HTMLDivElement => {
    vi.spyOn(Date, 'now').mockReturnValue(T * 1000);
    if (still) vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    return layer(date, minutes, still);
  };
  const mode = (c: Element, m: string): number => count(c, `[data-stage-band][data-mode="${m}"]`);
  it('16 h 50 : un musicien marche vers la scène (pas animé), aucun n est apparu d un coup', () => {
    const c = at(MUSIC, 16 * 60 + 50);
    expect(mode(c, 'walking')).toBeGreaterThan(0);
    expect(count(c, '[data-stage-band][data-mode="walking"][data-trip="in"] [data-stride]')).toBeGreaterThan(0);
    expect(count(c, '[data-stage-band][opacity]')).toBe(0);
  });
  it('18 h : les trois en place, aucun en marche', () => {
    const c = at(MUSIC, 18 * 60);
    expect(mode(c, 'playing')).toBe(3);
    expect(mode(c, 'walking')).toBe(0);
  });
  it('00 h 05 : en marche vers la sortie ; 00 h 30 : partis', () => {
    const c = at(MUSIC_NEXT, 5);
    expect(count(c, '[data-stage-band][data-mode="walking"][data-trip="out"]')).toBeGreaterThan(0);
    expect(count(at(MUSIC_NEXT, 30), '[data-stage-band]')).toBe(0);
  });
  it('16 h 30 : personne encore', () => {
    expect(count(at(MUSIC, 16 * 60 + 30), '[data-stage-band]')).toBe(0);
  });
  it('mouvement réduit à 16 h 50 : seulement ceux déjà en place, aucun marcheur', () => {
    const c = at(MUSIC, 16 * 60 + 50, true);
    expect(mode(c, 'walking')).toBe(0);
  });
  it('musicianAt : continu (jamais de saut), hors champ avant et après, en place de 17 h à minuit', () => {
    const D0 = 1_000_000 * 60;
    const g = { stageX: 300, width: W, unit: 1 };
    MUSICIANS.forEach((_, i) => {
      expect(musicianAt(i, D0 + 16.5 * 3600, D0, g).mode).toBe('absent');
      expect(musicianAt(i, D0 + 17 * 3600, D0, g).mode).toBe('playing');
      expect(musicianAt(i, D0 + 23.9 * 3600, D0, g).mode).toBe('playing');
      expect(musicianAt(i, D0 + 24.5 * 3600, D0, g).mode).toBe('absent');
      for (const [a, b] of [[16.7, 17.05], [23.95, 24.3]] as const) {
        let prev = musicianAt(i, D0 + a * 3600, D0, g);
        expect(prev.mode === 'playing' || prev.x < 0 || prev.x > W).toBe(true);
        for (let t = D0 + a * 3600 + 0.25; t < D0 + b * 3600; t += 0.25) {
          const p = musicianAt(i, t, D0, g);
          expect(Math.abs(p.x - prev.x)).toBeLessThanOrEqual(30 * 0.25);
          prev = p;
        }
        expect(prev.x < 0 || prev.x > W || prev.mode === 'playing').toBe(true);
      }
    });
  });
});

describe('branchement dans la vie de la ville', () => {
  const mount = (date: YMD, minutes: number): HTMLDivElement => {
    const sky = skyOf(minutes);
    const city = { minutes, day: dayContext(date, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
    return render(<svg><CityLifeLayer width={W} height={H} sky={sky} seed={SEED} city={city} rainy={false} /></svg>);
  };
  it('13/7 à midi : l’équipe est dans la scène, les drapeaux de lampadaires passent devant les lampadaires', () => {
    const c = mount(D13, 720);
    expect(count(c, '[data-crew]')).toBeGreaterThan(0);
    const lamps = c.querySelector('[data-street-lamps]')!;
    const front = c.querySelector('[data-install-part="front"]')!;
    const back = c.querySelector('[data-install-part="back"]')!;
    expect(lamps.compareDocumentPosition(front) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(back.closest('[data-city-sidewalk]')).not.toBeNull();
    // Équipes à pied et scène : après les passants (un passant passe toujours derrière une équipe).
    const crew = c.querySelector('[data-install-part="crew"]')!;
    expect(crew.closest('[data-city-sidewalk]')).not.toBeNull();
    const peds = c.querySelectorAll('[data-ped]');
    expect(peds.length).toBeGreaterThan(0);
    expect(peds[peds.length - 1]!.compareDocumentPosition(crew) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(crew.compareDocumentPosition(lamps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('14/7 à midi : drapeaux d’entrée posés', () => {
    expect(count(mount(D14, 720), '[data-decor-item][data-decor-kind="door-flag"]')).toBe(FLAG_DOORS);
  });
});
