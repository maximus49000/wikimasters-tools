// @vitest-environment jsdom
// tests/content/install-layer.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { InstallLayer } from '../../src/content/install-layer';
import { dayContext, type YMD } from '../../src/core/library/city/calendar';
import { doorsFor } from '../../src/core/library/city/doors';
import { absMinute, decorSetsFor, footWindow, itemPhase } from '../../src/core/library/city/install';
import { lampsFor } from '../../src/core/library/city/lamps';
import { WALK_PACE, cityMetrics } from '../../src/core/library/city/metrics';
import { dayNumber } from '../../src/core/library/city/shops/hours';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { DARK } from '../../src/core/library/city/events';
import { BARRIER, STAGE } from '../../src/content/install-sprites';
import { barrierK } from '../../src/content/install-layer';
import { MUSICIANS, musicianAt } from '../../src/content/stage-band';
import { VAN_SPEED } from '../../src/core/library/city/van';

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
        const trucks = [...c.querySelectorAll('[data-lift-truck]')].map((t) => ({ el: t, x: Number(t.getAttribute('data-x')), park: Number(t.getAttribute('data-park')) }));
        for (const v of c.querySelectorAll('[data-install-van]')) {
          vans++;
          const x = Number(v.getAttribute('data-x'));
          const half = Number(v.getAttribute('data-half'));
          // Garée : jamais sur le pied d'un lampadaire (en roulant, elle passe devant).
          if (v.getAttribute('data-van-phase') === 'parked') for (const l of lampsFor(W, SEED)) expect(Math.abs(x - l.x), `${date.d}/${date.m} ${m} lampadaire`).toBeGreaterThanOrEqual(half);
          for (const t of trucks) {
            both++;
            expect(Math.abs(x - t.park), `${date.d}/${date.m} ${m} point de travail`).toBeGreaterThanOrEqual(60);
            // Elle ne recouvre jamais le camion dans la même file : quand il passe à sa hauteur le long du trottoir, il est
            // dessiné devant elle (elle ne passe devant lui que dans la file de circulation).
            if (Math.abs(x - t.x) < half + 27 && Number(v.getAttribute('data-van-lane')) < 0.5) {
              expect(v.compareDocumentPosition(t.el) & Node.DOCUMENT_POSITION_FOLLOWING, `${date.d}/${date.m} ${m} camion`).toBeTruthy();
            }
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

describe('camionnette et ouvriers : on arrive et on repart, rien n apparaît sur place', () => {
  type Snap = { van: { x: number; half: number; door: number; phase: string } | null; workers: Map<string, { x: number; y: number }>; opacity: number; step: string | null };
  const xy = (e: Element): { x: number; y: number } => {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec((e as HTMLElement).style.transform)!;
    return { x: Number(m[1]), y: Number(m[2]) };
  };
  const snap = (date: YMD, minute: number, setId: string): Snap => {
    const c = layer(date, minute);
    const v = c.querySelector(`[data-install-van="${setId}"]`);
    const crew = c.querySelector(`[data-crew="${setId}"]`);
    const workers = new Map<string, { x: number; y: number }>();
    // Équipe à pied (celle du camion élévateur sort de sa cabine : hors de ce relevé).
    const foot = crew?.getAttribute('data-equipment') !== 'lift';
    if (foot) for (const w of crew?.querySelectorAll('[data-worker]') ?? []) workers.set(w.getAttribute('data-worker-k') ?? '?', xy(w));
    // Fondu d'un humain : une opacité sur l'ouvrier lui-même ou sur le groupe de l'équipe (pas le détail du dessin).
    const faded = (e: Element): boolean => e.hasAttribute('opacity') || /opacity/.test((e as HTMLElement).style?.cssText ?? '');
    const out: Snap = {
      van: v ? { x: Number(v.getAttribute('data-x')), half: Number(v.getAttribute('data-half')), door: Number(v.getAttribute('data-door-x')), phase: v.getAttribute('data-van-phase')! } : null,
      workers,
      opacity: crew ? [crew, ...crew.querySelectorAll('[data-worker]'), ...[...crew.querySelectorAll('[data-worker]')].map((w) => w.firstElementChild!)].filter(faded).length : 0,
      step: crew?.getAttribute('data-step') ?? null,
    };
    for (const { root, host } of mounted.splice(0)) {
      act(() => root.unmount());
      host.remove();
    }
    return out;
  };
  const u = metrics.unit;
  const WALK = 24 * WALK_PACE * 60 * u; // px par minute : le passant le plus rapide (hors joggeurs)
  // `spans` : suite continue de (date, de, à) — un démontage de nuit commence la veille (le camion plateau arrive avant minuit).
  const check = (spans: readonly (readonly [YMD, number, number])[], setId: string, removing: boolean): void => {
    const set = decorSetsFor(spans[0]![0], W, H, SEED).find((s) => s.id === setId)!;
    const fw = footWindow(set, removing)!;
    // Vélo porteur : un seul ouvrier.
    const crewSize = set.transport === 'cargo-bike' ? 1 : 2;
    let prev: Snap | null = null;
    let appeared = 0;
    let atDoor = false;
    for (const [date, from, to] of spans) for (let m = from; m < to; m++) {
      const day = dayNumber(date);
      const s = snap(date, m, setId);
      const tag = `${setId} ${date.d}/${date.m} ${m}`;
      expect(s.opacity, `${tag} : opacité`).toBe(0);
      if (s.van && !prev?.van) {
        appeared++;
        expect(s.van.x + s.van.half < 0 || s.van.x - s.van.half > W, `${tag} : la camionnette arrive hors champ (${s.van.x})`).toBe(true);
      }
      if (!s.van && prev?.van) expect(prev.van.x + prev.van.half < 0 || prev.van.x - prev.van.half > W, `${tag} : repartie hors champ (${prev.van.x})`).toBe(true);
      if (s.van && prev?.van) expect(Math.abs(s.van.x - prev.van.x), `${tag} : saut de la camionnette`).toBeLessThanOrEqual(VAN_SPEED * u + 1e-6);
      for (const [k, w] of s.workers) {
        const before = prev?.workers.get(k);
        if (before) expect(Math.abs(w.x - before.x), `${tag} : ouvrier ${k} téléporté`).toBeLessThanOrEqual(WALK);
        else {
          // Apparition : derrière la camionnette garée (il en descend).
          expect(s.van?.phase, `${tag} : ouvrier ${k} sans camionnette`).toBe('parked');
          expect(Math.abs(w.x - s.van!.x), `${tag} : ouvrier ${k} apparu loin de la camionnette`).toBeLessThanOrEqual(s.van!.half);
        }
      }
      for (const [k, w] of prev?.workers ?? []) {
        if (s.workers.has(k)) continue;
        // Disparition : il est remonté (derrière la camionnette garée).
        expect(prev!.van?.phase, `${tag} : ouvrier ${k} disparu sans camionnette`).toBe('parked');
        expect(Math.abs(w.x - prev!.van!.x), `${tag} : ouvrier ${k} disparu loin de la camionnette`).toBeLessThanOrEqual(prev!.van!.half);
      }
      if (absMinute(day, m) === fw.first) {
        // Au début du créneau : à l'arrière de la camionnette, portière ouverte (les deux porteurs et leur charge, ou l'échelle
        // qu'ils descendent de la galerie, juste derrière la carrosserie).
        expect(s.workers.size, tag).toBe(crewSize);
        for (const w of s.workers.values()) expect(Math.abs(w.x - s.van!.door), `${tag} : à la portière`).toBeLessThanOrEqual(s.van!.half + 45 * u);
        atDoor = true;
      }
      prev = s;
    }
    expect(appeared, `${setId} : une seule arrivée`).toBe(1);
    expect(atDoor).toBe(true);
    expect(prev!.van, `${setId} : repartie à la fin`).toBeNull();
    expect(prev!.workers.size).toBe(0);
  };
  it('barrières du 14/7 : pose de 7 h à 8 h, dépose de 12 h 30 à 13 h 30', () => {
    check([[D14, 380, 520]], 'barriers-bastille', false);
    check([[D14, 710, 850]], 'barriers-bastille', true);
  });
  it('plancher de la scène (camion plateau, garé tout le montage) : montage le 21/6, démontage de nuit le 22/6', () => {
    check([[MUSIC, 500, 1000]], 'stage-music-0', false);
    check([[MUSIC, 1400, 1440], [MUSIC_NEXT, 0, 290]], 'stage-music-0', true);
  }, 60000);
  it('drapeaux d entrée à l échelle (vélo porteur, un ouvrier), 13/7 (début et fin de la journée)', () => {
    const set = decorSetsFor(D13, W, H, SEED).find((s) => s.id === 'doors-bastille')!;
    expect(footWindow(set, false)).not.toBeNull();
    check([[D13, 500, 1060]], 'doors-bastille', false);
  }, 60000);
  it('camion élévateur : arrive et repart hors champ, ses ouvriers sortent de la cabine et y rentrent', () => {
    const scan = (date: YMD, setId: string, from: number, to: number, arrives: boolean, leaves: boolean): void => {
      let prev: { x: number; workers: number[] } | null = null;
      let trips = 0;
      for (let m = from; m < to; m++) {
        const c = layer(date, m);
        const crew = c.querySelector(`[data-crew="${setId}"][data-equipment="lift"]`);
        const t = crew?.querySelector('[data-lift-truck]');
        const now = t ? { x: Number(t.getAttribute('data-x')), workers: [...crew!.querySelectorAll(':scope > [data-worker]')].map((w) => xy(w).x) } : null;
        const tag = `${setId} ${date.d}/${date.m} ${m}`;
        const off = (x: number): boolean => x < -30 * u || x > W + 30 * u;
        if (m === from) expect(now === null, `${tag} : état initial`).toBe(arrives);
        if (now && !prev && m > from) {
          trips++;
          expect(off(now.x), `${tag} : arrive hors champ (${now.x})`).toBe(true);
        }
        if (!now && prev && m > from) expect(off(prev.x), `${tag} : repart hors champ (${prev.x})`).toBe(true);
        if (now && prev) expect(Math.abs(now.x - prev.x), `${tag} : saut du camion`).toBeLessThanOrEqual(W / 2);
        // Un ouvrier au sol n'apparaît (ne disparaît) qu'à la cabine, caché par elle.
        if (now && prev && now.workers.length > prev.workers.length) for (const x of now.workers.slice(prev.workers.length)) expect(Math.abs(x - now.x), `${tag} : sort de la cabine`).toBeLessThanOrEqual(32 * u);
        if (now && prev && now.workers.length < prev.workers.length) for (const x of prev.workers.slice(now.workers.length)) expect(Math.abs(x - prev.x), `${tag} : rentre dans la cabine`).toBeLessThanOrEqual(32 * u);
        for (const { root, host } of mounted.splice(0)) {
          act(() => root.unmount());
          host.remove();
        }
        prev = now;
      }
      expect(trips).toBe(arrives ? 1 : 0);
      if (leaves) expect(prev).toBeNull();
    };
    // Début et fin de journée (le reste du trajet est continu : d'un lampadaire au milieu du chemin vers le suivant).
    scan(D13, 'lamps-bastille', 535, 600, true, false);
    scan(D13, 'lamps-bastille', 950, 1030, false, true);
    scan(MUSIC, 'stage-music-0', 670, 740, true, false);
    scan(MUSIC, 'stage-music-0', 900, 970, false, true);
  }, 40000);
  it('mouvement réduit : ni camionnette ni ouvrier', () => {
    expect(count(layer(D14, 425, true), '[data-install-van], [data-worker]')).toBe(0);
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

describe('décors entreposés dans un véhicule de transport (vélo porteur, camion plateau, camionnette)', () => {
  type St = 'none' | 'stored' | 'carried' | 'posed';
  type Veh = { x: number; half: number };
  const unmountAll = (): void => {
    for (const { root, host } of mounted.splice(0)) {
      act(() => root.unmount());
      host.remove();
    }
  };
  // État de chaque élément (`set/item`) à cette minute : posé, porté (`data-load-item`), entreposé dans un véhicule
  // (`data-stored-item`), sinon absent de la scène ; et le véhicule qui le contient.
  const statesAt = (date: YMD, m: number): { st: Map<string, St>; veh: Map<string, Veh> } => {
    const c = layer(date, m);
    const st = new Map<string, St>();
    const veh = new Map<string, Veh>();
    const tag = `${date.d}/${date.m} ${m}`;
    for (const e of c.querySelectorAll('[data-stored-item]')) {
      const key = e.getAttribute('data-stored-item')!;
      const v = e.closest('[data-install-van], [data-lift-truck]');
      expect(v, `${tag} ${key} entreposé hors véhicule`).not.toBeNull();
      expect(['van', 'bike', 'truck', 'lift']).toContain(e.getAttribute('data-carried'));
      expect(st.has(key), `${tag} ${key} deux fois`).toBe(false);
      st.set(key, 'stored');
      veh.set(key, { x: Number(v!.getAttribute('data-x')), half: Number(v!.getAttribute('data-half')) });
    }
    for (const e of c.querySelectorAll('[data-load-item]')) {
      const key = e.getAttribute('data-load-item')!;
      expect(st.has(key), `${tag} ${key} porté et ${st.get(key)}`).toBe(false);
      expect(e.closest('[data-crew]'), `${tag} ${key} porté sans équipe`).not.toBeNull();
      st.set(key, 'carried');
    }
    for (const e of c.querySelectorAll('[data-decor-item]')) {
      const key = `${e.getAttribute('data-decor-set')}/${e.getAttribute('data-decor-item')}`;
      expect(st.has(key), `${tag} ${key} posé et ${st.get(key)}`).toBe(false);
      st.set(key, 'posed');
    }
    unmountAll();
    return { st, veh };
  };
  const off = (v: Veh | undefined): boolean => !!v && (v.x + v.half < 0 || v.x - v.half > W);
  const ALLOWED = new Set(['none>stored', 'stored>none', 'stored>carried', 'carried>stored', 'carried>posed', 'posed>carried']);
  // Balayage minute par minute d'une suite continue de (date, minute) : un élément n'est jamais visible hors du décor posé sans
  // être porté ou dans un véhicule ; il n'entre en scène et n'en sort que dans un véhicule hors champ.
  const sweep = (spans: readonly (readonly [YMD, number, number])[]): { seq: Map<string, St[]>; moves: number } => {
    const seq = new Map<string, St[]>();
    let prev: { st: Map<string, St>; veh: Map<string, Veh> } | null = null;
    let moves = 0;
    let n = 0;
    for (const [date, from, to] of spans) {
      for (let m = from; m < to; m++) {
        const now = statesAt(date, m);
        const keys = new Set([...now.st.keys(), ...(prev?.st.keys() ?? [])]);
        for (const key of keys) {
          const a: St = prev ? prev.st.get(key) ?? 'none' : 'none';
          const b: St = now.st.get(key) ?? 'none';
          if (!seq.has(key)) seq.set(key, Array.from({ length: n }, () => 'none' as St));
          const tag = `${date.d}/${date.m} ${m} ${key} : ${a} → ${b}`;
          if (prev && a !== b) {
            moves++;
            expect(ALLOWED.has(`${a}>${b}`), tag).toBe(true);
            if (a === 'none') expect(off(now.veh.get(key)), `${tag} (véhicule dans le champ)`).toBe(true);
            if (b === 'none') expect(off(prev.veh.get(key)), `${tag} (véhicule dans le champ)`).toBe(true);
          }
        }
        for (const [key, list] of seq) list.push(now.st.get(key) ?? 'none');
        n++;
        prev = now;
      }
    }
    return { seq, moves };
  };
  // Pose : chaque élément posé a d'abord été entreposé ; dépose : il est rangé avant de quitter la scène avec le véhicule.
  const checkStory = (seq: Map<string, St[]>): number => {
    let posed = 0;
    for (const [key, list] of seq) {
      const firstPosed = list.indexOf('posed');
      if (firstPosed < 0) continue;
      posed++;
      if (list[0] === 'none') expect(list.slice(0, firstPosed).includes('stored'), `${key} posé sans avoir été dans un véhicule`).toBe(true);
      const lastPosed = list.lastIndexOf('posed');
      if (list[list.length - 1] === 'none') expect(list.slice(lastPosed).includes('stored'), `${key} parti sans être rangé`).toBe(true);
    }
    return posed;
  };
  it('13/7 : drapeaux d entrée sortis du vélo porteur, drapeaux de lampadaires pris sur le plateau du camion élévateur', () => {
    const { seq, moves } = sweep([[D13, 500, 1080]]);
    expect(moves).toBeGreaterThan(0);
    expect(checkStory(seq)).toBe(LAMPS + FLAG_DOORS);
  }, 240000);
  it('14/7 : barrières sorties de la camionnette et rangées', () => {
    const { seq } = sweep([[D14, 380, 880]]);
    expect(checkStory(seq)).toBeGreaterThan(0);
  }, 240000);
  it('15/7 : tout est rangé dans son véhicule avant son départ', () => {
    const { seq } = sweep([[D15, 500, 1080]]);
    expect(checkStory(seq)).toBe(LAMPS + FLAG_DOORS);
  }, 240000);
  it('21/6 : scène et stands sortis du camion plateau, barrières de la camionnette', () => {
    const { seq } = sweep([[MUSIC, 500, 1000]]);
    expect(checkStory(seq)).toBeGreaterThan(5);
  }, 240000);
  it('nuit du 21 au 22/6 : la dépose range tout dans les camions plateaux et la camionnette', () => {
    const { seq } = sweep([[MUSIC, 1380, 1440], [MUSIC_NEXT, 0, 330]]);
    expect(checkStory(seq)).toBeGreaterThan(5);
  }, 240000);

  it('vélo porteur pendant la pose des drapeaux d entrée, camion plateau pendant le montage de la scène', () => {
    const bike = layer(D13, 14 * 60);
    expect(count(bike, '[data-install-van="doors-bastille"] [data-cargo-bike]')).toBe(1);
    expect(count(bike, '[data-install-van="doors-bastille"][data-transport="cargo-bike"]')).toBe(1);
    expect(count(bike, '[data-van]')).toBe(0);
    const truck = layer(MUSIC, 10 * 60);
    expect(count(truck, '[data-install-van="stage-music-0"] [data-flatbed]')).toBe(1);
    // Les pièces encore à poser sont sur le plateau.
    expect(count(truck, '[data-install-van="stage-music-0"] [data-stored-item]')).toBeGreaterThan(0);
    const stands = layer(MUSIC, 13 * 60);
    expect(count(stands, '[data-install-van="beer-stands-music"] [data-flatbed]')).toBe(1);
    expect(count(stands, '[data-install-van="barriers-music"] [data-van]')).toBe(1);
  });
  it('drapeaux de lampadaires : une caisse sur le plateau du camion élévateur', () => {
    const c = layer(D13, 9 * 60 + 5);
    expect(count(c, '[data-crew="lamps-bastille"] [data-lift-truck] [data-stored-item]')).toBeGreaterThan(0);
  });
});
