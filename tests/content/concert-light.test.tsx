// @vitest-environment jsdom
// tests/content/concert-light.test.tsx — vrai éclairage de concert de la Fête de la musique en Ghibli (G5, tâche 7) : faisceaux
// en polygones à dégradé, lyres balayées par la boucle (sans SMIL), hit / strobe, révélation colorée du plancher et du public.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConcertCrowd, ConcertLight, resetConcertLightForTests } from '../../src/content/concert-light';
import { InstallLayer } from '../../src/content/install-layer';
import { setLitPatchPainterForTests, type LitPatchPainter } from '../../src/content/painted-city';
import { PropContext, PropRegistry } from '../../src/content/prop/prop-host';
import type { YMD } from '../../src/core/library/city/calendar';
import { PALS, paletteIndex } from '../../src/core/library/city/concert';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
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
let frames: ((ms: number) => void)[];
let painter: ReturnType<typeof vi.fn<LitPatchPainter>>;
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: (ms: number) => void) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  resetConcertLightForTests();
  painter = vi.fn<LitPatchPainter>(() => 'data:image/png;base64,lit');
  setLitPatchPainterForTests(painter);
});
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  setLitPatchPainterForTests(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const W = 720;
const H = 340;
const SEED = 1;
const metrics = cityMetrics(H);
const times = sunTimes({ y: 2026, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const skyOf = (minutes: number) => skyAt(minutes, times);
const MUSIC: YMD = { y: 2026, m: 6, d: 21 };
const NOW = 1_790_000_000;
const count = (c: Element, sel: string): number => c.querySelectorAll(sel).length;

// Registre d'accessoires de test : chaque image est « url:clé » dès que la file est vidée.
class KeyedRegistry extends PropRegistry {
  override want(k: string, _paint: () => string, done: () => void): () => void {
    return super.want(k, () => `url:${k}`, done);
  }
}
const layer = (minutes: number, ghibli: boolean, still = false, nowS = NOW): { host: HTMLDivElement; jobs: (() => void)[] } => {
  vi.spyOn(Date, 'now').mockReturnValue(nowS * 1000);
  const jobs: (() => void)[] = [];
  const reg = new KeyedRegistry('t', { schedule: (cb) => jobs.push(cb) });
  const host = render(
    <PropContext.Provider value={reg}>
      <svg>
        <InstallLayer width={W} height={H} seed={SEED} sky={skyOf(minutes)} still={still} date={MUSIC} minutes={minutes} metrics={metrics} rainy={false} ghibli={ghibli} />
      </svg>
    </PropContext.Provider>,
  );
  return { host, jobs };
};
const plan = cityPaintPlan(W, H, SEED);
const light = (nowS: number, opts: { lit?: boolean; still?: boolean; two?: boolean } = {}): HTMLDivElement => {
  vi.spyOn(Date, 'now').mockReturnValue(nowS * 1000);
  const node = (k: number): ReactNode => (
    <ConcertLight key={k} stageX={300 + k * 200} base={metrics.curb - metrics.unit} unit={metrics.unit} lit={opts.lit ?? true} still={opts.still ?? false} />
  );
  return render(<svg>{node(0)}{opts.two ? node(1) : null}</svg>);
};
const crowd = (nowS: number, opts: { lit?: boolean; still?: boolean; withPlan?: boolean } = {}): HTMLDivElement => {
  vi.spyOn(Date, 'now').mockReturnValue(nowS * 1000);
  return render(
    <svg>
      <ConcertCrowd stageX={300} base={metrics.curb - metrics.unit} unit={metrics.unit} lit={opts.lit ?? true} still={opts.still ?? false} plan={opts.withPlan === false ? null : plan} seed={SEED} />
    </svg>,
  );
};
const lyrePoints = (c: Element): string[] => [...c.querySelectorAll('[data-concert-beam^="lyre"]')].map((p) => p.getAttribute('points') ?? '');

describe('ConcertLight dans le calque des installations (Ghibli)', () => {
  it('21/6 à 22 h 30 (nuit) : éclairage de concert à la place des faisceaux ; à 15 h rien', () => {
    const { host } = layer(22 * 60 + 30, true);
    expect(count(host, '[data-concert-light]')).toBe(1);
    expect(count(host, '[data-stage-beams], [data-stage-beam]')).toBe(0);
    expect(count(host, '[data-concert-light] animate, [data-concert-light] animateTransform')).toBe(0);
    // Spectacle devant les passants (crew) ; chaussée du public révélée SOUS eux (back), jamais par-dessus.
    expect(count(host, '[data-install-part="crew"] [data-concert-light]')).toBe(1);
    expect(count(host, '[data-install-part="back"] [data-concert-crowd-layer]')).toBe(1);
    expect(count(host, '[data-concert-light] [data-concert-crowd]')).toBe(0);
    expect(count(host, '[data-concert-crowd]')).toBe(4);
    // Extras de concert (façade son, retours, rampe LED, lyres, contre-jours) : une image allumée avec les projecteurs.
    expect(count(host, '[data-stage-extras]')).toBe(1);
    expect(count(layer(15 * 60, true).host, '[data-concert-light]')).toBe(0);
    // 18 h : structure posée, musiciens en place, jour : extras éteints présents, aucune lumière de concert.
    const day = layer(18 * 60, true);
    expect(count(day.host, '[data-concert-light]')).toBe(0);
    expect(count(day.host, '[data-stage-extras]')).toBe(1);
    expect(count(day.host, '[data-stage-band]')).toBe(3);
  });
  it('classique inchangé : faisceaux SMIL à 23 h, aucun éclairage de concert', () => {
    const { host } = layer(23 * 60, false);
    expect(count(host, '[data-stage-beam]')).toBe(3);
    expect(count(host, '[data-concert-light]')).toBe(0);
    expect(count(host, '[data-stage-extras]')).toBe(0);
  });
  it('mouvement réduit : présent, pose t = 0 (lyres au même endroit quelle que soit l’heure), jamais de voile blanc figé', () => {
    const a = layer(23 * 60, true, true, NOW);
    const b = layer(23 * 60, true, true, NOW + 1.3);
    expect(count(a.host, '[data-concert-light]')).toBe(1);
    expect(lyrePoints(a.host)).toEqual(lyrePoints(b.host));
    expect(a.host.querySelector('[data-concert-light]')!.getAttribute('data-concert-pal')).toBe('0');
    expect(a.host.querySelector('[data-concert-hit]')!.getAttribute('opacity')).toBe('0');
    expect(count(a.host, '[data-concert-crowd-layer]')).toBe(1);
  });
});

describe('ConcertLight : géométrie et boucle', () => {
  it('rien quand éteint', () => {
    expect(count(light(NOW, { lit: false }), '[data-concert-light]')).toBe(0);
    expect(count(crowd(NOW, { lit: false }), '[data-concert-crowd-layer]')).toBe(0);
  });
  it('mouvement réduit : voile à 0 (pas de hit + strobe de t = 0), aucune boucle rAF ; voile plafonné à 0,5 en strobe', () => {
    const c = light(NOW, { still: true });
    expect(c.querySelector('[data-concert-hit]')!.getAttribute('opacity')).toBe('0');
    expect(frames).toHaveLength(0);
    const s = light(Math.floor(NOW / 32) * 32 + 0.19);
    expect(s.querySelector('[data-concert-hit]')!.getAttribute('opacity')).toBe('0.5');
    expect(frames.length).toBeGreaterThan(0);
  });
  it('10 faisceaux (3 contre-jours, 3 PAR, 4 lyres) en deux polygones à dégradé screen, 4 têtes de lyre, hit, brume, débordement', () => {
    const c = light(NOW);
    expect(count(c, '[data-concert-beam]')).toBe(10);
    expect(count(c, '[data-concert-beam-core]')).toBe(10);
    expect(count(c, '[data-concert-beam^="lyre"]')).toBe(4);
    expect(count(c, '[data-concert-beam^="back"]')).toBe(3);
    expect(count(c, '[data-concert-beam^="par"]')).toBe(3);
    expect(count(c, 'linearGradient')).toBe(20);
    expect(count(c, '[data-concert-lyre-head]')).toBe(4);
    expect(count(c, '[data-concert-back-glow]')).toBe(3);
    expect(count(c, '[data-concert-hit]')).toBe(1);
    expect(count(c, '[data-concert-haze]')).toBe(1);
    expect(count(c, '[data-concert-spill]')).toBe(1);
    expect(count(c, 'animate, animateTransform, clipPath, mask')).toBe(0);
    // Un seul calque de mélange screen (brume, débordement, faisceaux, voile) : pas un par élément.
    expect(count(c, '[data-concert-screen]')).toBe(1);
    expect([...c.querySelectorAll('[style]')].filter((e) => (e as HTMLElement).style.mixBlendMode === 'screen')).toHaveLength(1);
    for (const sel of ['[data-concert-haze]', '[data-concert-spill]', '[data-concert-hit]', '[data-concert-beam]']) expect(count(c, `[data-concert-screen] ${sel}`)).toBeGreaterThan(0);
    for (const p of c.querySelectorAll('[data-concert-beam]')) expect(p.getAttribute('fill')).toMatch(/^url\(#/);
    // Les PAR partent des lentilles des projecteurs (y ≈ −52) et visent le plancher (y = −8) sous les musiciens.
    const par = c.querySelector('[data-concert-beam="par1"]')!.getAttribute('points')!;
    expect(par).toMatch(/-52\.00/);
    expect(par).toMatch(/-8\.00/);
  });
  it('ids uniques : deux scènes dans la même vue', () => {
    const c = light(NOW, { two: true });
    const ids = [...c.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('déterministe en t : même instant, mêmes points ; palette et couleurs d’après concertState', () => {
    const t = NOW + 9;
    const a = light(t);
    const b = light(t);
    expect(lyrePoints(a)).toEqual(lyrePoints(b));
    expect(a.querySelector('[data-concert-light]')!.getAttribute('data-concert-pal')).toBe(String(paletteIndex(t)));
    const c0 = PALS[paletteIndex(t)]![0];
    const stop = a.querySelector('[data-concert-grad="back0"] stop')!;
    expect(stop.getAttribute('stop-color')).toBe(c0);
    expect(lyrePoints(light(t + 1))).not.toEqual(lyrePoints(a));
  });
  it('boucle : à l’image suivante, les lyres ont bougé, la palette suit l’horloge, hit au temps fort ; rien d’écrit si rien ne change', () => {
    const t0 = Math.floor(NOW / 32) * 32 + 1;
    const c = light(t0);
    const before = lyrePoints(c);
    const root = c.querySelector('[data-concert-light]')!;
    expect(root.getAttribute('data-concert-pal')).toBe(String(paletteIndex(t0)));
    const tick = (s: number): void => {
      vi.spyOn(Date, 'now').mockReturnValue(s * 1000);
      const cbs = frames.splice(0);
      act(() => { for (const cb of cbs) cb(s * 1000); });
    };
    tick(t0 + 1);
    expect(lyrePoints(c)).not.toEqual(before);
    // Palette suivante (8 s) : groupes du plancher / public et dégradés changent.
    tick(t0 + 8);
    expect(root.getAttribute('data-concert-pal')).toBe(String(paletteIndex(t0 + 8)));
    const shown = [...c.querySelectorAll('[data-concert-floor]')].map((g) => g.getAttribute('opacity'));
    expect(shown.filter((o) => o === '1')).toHaveLength(1);
    expect(shown[paletteIndex(t0 + 8)]).toBe('1');
    // Hit : premier temps de la mesure (t multiple de 2, dans les 0,14 s).
    const bar = Math.ceil((t0 + 8) / 2) * 2;
    tick(bar + 0.05);
    expect(c.querySelector('[data-concert-hit]')!.getAttribute('opacity')).toBe('0.35');
    tick(bar + 0.5);
    expect(c.querySelector('[data-concert-hit]')!.getAttribute('opacity')).toBe('0');
  });
  it('révélation du public : 4 images peintes par le peintre de découpes (une par palette, teinte c0), posées dans le repère de la scène', async () => {
    const c = crowd(NOW);
    // Une peinture par image d'animation : vider la file.
    while (frames.length && painter.mock.calls.length < 4) {
      const cbs = frames.splice(0);
      await act(async () => { for (const cb of cbs) cb(0); });
    }
    expect(painter).toHaveBeenCalledTimes(4);
    const tints = painter.mock.calls.map((call) => call[3]?.screen);
    expect(tints).toEqual(PALS.map((p) => p[0]));
    expect(count(c, '[data-concert-crowd] image')).toBe(4);
    const img = c.querySelector('[data-concert-crowd="0"] image')!;
    expect(Number(img.getAttribute('width'))).toBeGreaterThan(100);
    const noPlan = crowd(NOW, { withPlan: false });
    expect(count(noPlan, '[data-concert-crowd] image')).toBe(0);
    // La palette courante seule visible ; la boucle suit le changement de palette.
    const tick = (s: number): void => {
      vi.spyOn(Date, 'now').mockReturnValue(s * 1000);
      const cbs = frames.splice(0);
      act(() => { for (const cb of cbs) cb(s * 1000); });
    };
    tick(NOW + 8);
    const shown = [...c.querySelectorAll('[data-concert-crowd]')].map((g) => g.getAttribute('opacity'));
    expect(shown.filter((o) => o === '1')).toHaveLength(1);
    expect(shown[paletteIndex(NOW + 8)]).toBe('1');
    // Plancher : 4 groupes d'images d'accessoire (une par palette) dans le spectacle.
    expect(count(light(NOW), '[data-concert-floor]')).toBe(4);
  });
});
