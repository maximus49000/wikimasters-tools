// @vitest-environment jsdom
// tests/content/music-fest.test.tsx — rendu de la Fête de la musique (spec §7.6) et règle « tout est apporté par des humains ».
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY, writeArt } from '../../src/content/art-setting';
import { CityLifeLayer } from '../../src/content/city-life';
import { InstallLayer } from '../../src/content/install-layer';
import { dayContext, type YMD } from '../../src/core/library/city/calendar';
import { beerStandsFor, stageXs } from '../../src/core/library/city/install';
import { cityMetrics } from '../../src/core/library/city/metrics';
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
const unmountAll = (): void => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
};
afterEach(() => {
  localStorage.removeItem(ART_KEY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  unmountAll();
});

const W = 1080;
const H = 340;
const SEED = 1;
const metrics = cityMetrics(H);
const times = sunTimes({ y: 2026, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const skyOf = (minutes: number) => skyAt(minutes, times);
const MUSIC: YMD = { y: 2026, m: 6, d: 21 };
const NEXT: YMD = { y: 2026, m: 6, d: 22 };
const D14: YMD = { y: 2026, m: 7, d: 14 };
const ORDINARY: YMD = { y: 2026, m: 10, d: 10 };
// Horloge murale : début d'une minute + `s` secondes (la minute de la scène est donnée à part, comme dans la scène).
const T0 = 1_790_000_040;
const clock = (s = 10): void => {
  vi.spyOn(Date, 'now').mockReturnValue((T0 + s) * 1000);
};
const reduced = (): void => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
};

const layer = (date: YMD, minutes: number, still = false, width = W): HTMLDivElement =>
  render(
    <svg>
      <InstallLayer width={width} height={H} seed={SEED} sky={skyOf(minutes)} still={still} date={date} minutes={minutes} metrics={metrics} rainy={false} />
    </svg>,
  );
const city = (date: YMD, minutes: number): HTMLDivElement => {
  const sky = skyOf(minutes);
  const c = { minutes, day: dayContext(date, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
  return render(<svg><CityLifeLayer width={W} height={H} sky={sky} seed={SEED} city={c} rainy={false} /></svg>);
};
const count = (c: Element, sel: string): number => c.querySelectorAll(sel).length;
const STANDS = beerStandsFor(W, H, SEED).length;
const xyOf = (e: Element): { x: number; y: number } | null => {
  const t = e.getAttribute('transform') ?? (e as HTMLElement).style?.transform ?? '';
  const m = /translate\(([-\d.]+)(?:px)?[ ,]+([-\d.]+)/.exec(t);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};

describe('Fête de la musique : la rue le soir', () => {
  it('le banc est utile : deux scènes et plusieurs stands à 1080 px', () => {
    expect(stageXs(W, SEED).length).toBeGreaterThanOrEqual(2);
    expect(STANDS).toBeGreaterThanOrEqual(2);
  });

  it('21/6 à 20 h : stands, file, serveurs au comptoir, deux scènes jouent, foule dense qui danse, aucune voiture', () => {
    clock();
    const c = city(MUSIC, 20 * 60);
    expect(count(c, '[data-beer-stand]')).toBe(STANDS);
    expect(count(c, '[data-decor-kind="stand-awning"]')).toBe(STANDS);
    expect(count(c, '[data-queue-person]')).toBeGreaterThanOrEqual(1);
    expect(count(c, '[data-beer-server][data-serving]')).toBeGreaterThanOrEqual(1);
    expect(count(c, '[data-vehicle][data-active="true"]')).toBe(0);
    expect(count(c, '[data-stage-band-group]')).toBeGreaterThanOrEqual(2);
    expect(count(c, '[data-stage-band]')).toBeGreaterThanOrEqual(6);
    expect(count(c, '[data-music-spectator]')).toBeGreaterThanOrEqual(100);
    expect(count(c, '[data-music-spectator] animateTransform')).toBeGreaterThan(0);
    // La foule ne compte pas dans le plafond des figurants : aucun spectateur, serveur ou client n'est un « travailleur ».
    expect(count(c, '[data-music-spectator][data-worker], [data-beer-server][data-worker], [data-queue-person][data-worker]')).toBe(0);
  }, 20000);

  it('Ghibli : foule, serveurs, clients et musiciens au pantin dans la vie de la ville, sans miroir ni fondu', () => {
    clock();
    writeArt('ghibli');
    const c = city(MUSIC, 20 * 60);
    for (const sel of ['[data-music-spectator]', '[data-beer-server]', '[data-queue-person]', '[data-stage-band]']) {
      const nodes = [...c.querySelectorAll(sel)];
      expect(nodes.length, sel).toBeGreaterThan(0);
      for (const n of nodes) {
        expect(n.querySelector('[data-figure]'), sel).not.toBeNull();
        expect(n.getAttribute('opacity'), sel).toBeNull();
        expect(n.getAttribute('transform') ?? '', sel).not.toMatch(/scale\(-/);
      }
    }
  });

  it('profondeur : un serveur est derrière son comptoir, ses clients devant', () => {
    clock();
    const c = layer(MUSIC, 20 * 60);
    const counter = c.querySelector('[data-beer-stand="stand-0"]')!;
    const server = c.querySelector('[data-beer-server^="stand-0-server"]')!;
    const people = c.querySelector('[data-beer-queue="stand-0"]')!;
    expect(server.compareDocumentPosition(counter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(counter.compareDocumentPosition(people) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('13 h : l’équipe des barrières à l’œuvre, sa camionnette ; 13 h 45 : barrières en travers des deux files', () => {
    const c = layer(MUSIC, 13 * 60 + 2);
    expect(count(c, '[data-crew="barriers-music"]')).toBe(1);
    expect(count(c, '[data-install-van="barriers-music"]')).toBe(1);
    unmountAll();
    const d = layer(MUSIC, 13 * 60 + 50);
    const lanes = [...d.querySelectorAll('[data-decor-kind="barrier"][data-barrier-lane]')].map((e) => e.getAttribute('data-barrier-lane'));
    expect(lanes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(lanes)).toEqual(new Set(['far', 'near']));
  });

  it('14 h : route fermée, plus aucune voiture', () => {
    clock();
    expect(count(city(MUSIC, 14 * 60 + 30), '[data-vehicle][data-active="true"]')).toBe(0);
  });

  it('16 h : stands posés, pas encore de serveur ni de client', () => {
    clock();
    const c = layer(MUSIC, 16 * 60);
    expect(count(c, '[data-beer-stand]')).toBe(STANDS);
    expect(count(c, '[data-beer-server]')).toBe(0);
    expect(count(c, '[data-queue-person]')).toBe(0);
  });

  it('22/6 de 2 h 30 à 5 h : l’équipe de nuit dépose, l’auvent à l’échelle', () => {
    let ladder = 0;
    let counter = 0;
    for (let m = 150; m < 300; m += 4) {
      const c = layer(NEXT, m);
      for (const crew of c.querySelectorAll('[data-crew="beer-stands-music"]')) {
        expect(crew.getAttribute('data-removing'), `${m}`).toBe('true');
        if ((crew.getAttribute('data-crew-item') ?? '').endsWith('-awning') && crew.querySelector('[data-ladder]')) ladder++;
        if ((crew.getAttribute('data-crew-item') ?? '').endsWith('-counter')) counter++;
      }
      unmountAll();
    }
    expect(ladder).toBeGreaterThan(0);
    expect(counter).toBeGreaterThan(0);
  });

  it('22/6 à 5 h 30 : plus rien ; un jour ordinaire : rien', () => {
    clock();
    for (const [d, m] of [[NEXT, 5 * 60 + 30], [ORDINARY, 20 * 60]] as const) {
      const c = layer(d, m);
      expect(count(c, '[data-decor-item], [data-crew], [data-install-van], [data-music-spectator], [data-queue-person], [data-beer-server]'), `${d.d}/${d.m}`).toBe(0);
      unmountAll();
    }
  });

  it('mouvement réduit à 21 h : foule et stands figés, personne en marche, aucune animation', () => {
    clock();
    reduced();
    const c = layer(MUSIC, 21 * 60, true);
    expect(count(c, '[data-beer-stand]')).toBe(STANDS);
    expect(count(c, '[data-music-spectator]')).toBeGreaterThanOrEqual(100);
    expect(count(c, '[data-music-spectator][data-mode="walking"]')).toBe(0);
    expect(count(c, '[data-queue-person][data-mode="walking-in"], [data-queue-person][data-mode="leaving"]')).toBe(0);
    expect(count(c, '[data-beer-server][data-mode="walking"]')).toBe(0);
    expect(count(c, 'animate, animateTransform')).toBe(0);
  });

  it('continuité : clients et foule ne sautent jamais d’une seconde à l’autre', () => {
    const snap = (minutes: number, s: number): Map<string, { x: number; y: number }> => {
      clock(s);
      const c = layer(MUSIC, minutes, false, 720);
      const out = new Map<string, { x: number; y: number }>();
      for (const e of c.querySelectorAll('[data-queue-person], [data-music-spectator][data-mode="walking"], [data-beer-server]')) {
        // Au seuil d'une porte : <svg> rogné, placé par son cadre (door-passage.ts), pas par un translate.
        if (e.tagName === 'svg') continue;
        out.set(e.getAttribute('data-queue-person') ?? e.getAttribute('data-fan-id') ?? e.getAttribute('data-beer-server')!, xyOf(e)!);
      }
      unmountAll();
      return out;
    };
    let compared = 0;
    for (const minutes of [17 * 60 + 20, 20 * 60, 23 * 60 + 50]) {
      let prev = snap(minutes, 5);
      for (let s = 7; s < 30; s += 2) {
        const now = snap(minutes, s);
        for (const [id, p] of now) {
          const q = prev.get(id);
          if (!q) continue;
          compared++;
          expect(Math.hypot(p.x - q.x, p.y - q.y), `${minutes} ${s} ${id}`).toBeLessThanOrEqual(2 * 30 * metrics.unit);
        }
        prev = now;
      }
    }
    expect(compared).toBeGreaterThan(30);
  }, 120000);
});

describe('tout ce qui est porté est tenu par un humain ou rangé dans la camionnette', () => {
  type Obj = { x: number; carried: string | null; kind: string; key: string };
  const objectsAt = (date: YMD, m: number): { objs: Obj[]; workers: number[]; vans: { x: number; half: number }[] } => {
    const c = layer(date, m, false, 720);
    const objs = [...c.querySelectorAll('[data-crew] [data-carried-item], [data-crew] [data-ladder]')].map((e) => ({
      x: Number(e.getAttribute('data-x')),
      carried: e.getAttribute('data-carried'),
      kind: e.getAttribute('data-carried-item') ?? 'ladder',
      key: `${e.closest('[data-crew]')!.getAttribute('data-crew')}/${e.getAttribute('data-carried-item') ?? 'ladder'}`,
    }));
    // Ouvrier posé au terme de sa marche animée : sa position à la minute affichée est `data-at` (comme `data-x` des objets).
    const workers = [...c.querySelectorAll('[data-crew] [data-worker]')].map((w) => (w.hasAttribute('data-at') ? Number(w.getAttribute('data-at')!.split(',')[0]) : xyOf(w)?.x)).filter((x): x is number => x !== undefined);
    const vans = [...c.querySelectorAll('[data-install-van]')].map((v) => ({ x: Number(v.getAttribute('data-x')), half: Number(v.getAttribute('data-half')) }));
    unmountAll();
    return { objs, workers, vans };
  };
  const sweep = (date: YMD, from: number, to: number): number => {
    let seen = 0;
    let before = new Set<string>();
    for (let m = from; m < to; m++) {
      const { objs, workers, vans } = objectsAt(date, m);
      for (const o of objs) {
        seen++;
        expect(o.carried, `${date.d}/${date.m} ${m} ${o.kind} sans porteur`).not.toBeNull();
        expect(Number.isFinite(o.x), `${m} ${o.kind} data-x`).toBe(true);
        const near = workers.some((x) => Math.abs(x - o.x) <= 45 * metrics.unit) || vans.some((v) => Math.abs(v.x - o.x) <= v.half + 8);
        expect(near, `${date.d}/${date.m} ${m} ${o.kind} à ${o.x} loin de tout porteur`).toBe(true);
      }
      // Pendant la pose, un objet porté n'apparaît qu'à la camionnette (on le sort de l'arrière, on descend l'échelle de la galerie).
      for (const o of objs) if (!before.has(o.key)) expect(vans.some((v) => Math.abs(v.x - o.x) <= v.half + 50), `${m} ${o.key} surgi loin de la camionnette`).toBe(true);
      before = new Set(objs.map((o) => o.key));
    }
    return seen;
  };
  it('14/7 au matin : barrières sorties de la camionnette et portées', () => {
    expect(sweep(D14, 400, 500)).toBeGreaterThan(0);
  }, 60000);
  it('13/7 : échelles descendues de la galerie et portées', () => {
    expect(sweep({ y: 2026, m: 7, d: 13 }, 530, 640)).toBeGreaterThan(0);
  }, 60000);
  it('21/6 : comptoirs et auvents des stands', () => {
    expect(sweep(MUSIC, 715, 800)).toBeGreaterThan(0);
  }, 60000);

  it('22/6 : plusieurs camionnettes, jamais l’une sur l’autre dans la même rangée', () => {
    let pairs = 0;
    for (let m = 120; m < 320; m += 3) {
      const c = layer(NEXT, m);
      const vans = [...c.querySelectorAll('[data-install-van]')].map((v) => ({ x: Number(v.getAttribute('data-x')), half: Number(v.getAttribute('data-half')), row: v.getAttribute('data-van-row'), phase: v.getAttribute('data-van-phase') }));
      for (let i = 0; i < vans.length; i++) {
        for (let j = i + 1; j < vans.length; j++) {
          pairs++;
          const a = vans[i]!;
          const b = vans[j]!;
          if (a.row === b.row) expect(Math.abs(a.x - b.x), `${m}`).toBeGreaterThanOrEqual(a.half + b.half);
        }
      }
      unmountAll();
    }
    expect(pairs).toBeGreaterThan(0);
  }, 60000);
});
