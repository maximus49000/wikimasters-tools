// @vitest-environment jsdom
// tests/content/stage-band.test.tsx — musiciens de la Fête de la musique au pantin (G3b) : guitare, micro sur pied, tambour ;
// arrivée à pied, montée sur la scène en marchant, demi-tour vers le public, balancement SMIL sur le groupe porteur.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MUSICIANS, PLAY_YAW, StageBand, musicianAt, type StageGeom } from '../../src/content/stage-band';
import { STAGE_STAND } from '../../src/content/install-sprites';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { outfitFor } from '../../src/core/library/city/people';
import { mulberry32 } from '../../src/core/library/scene-world';
import { anchorsOf, type FigureKey } from '../../src/core/library/figure/bake';
import { TURN_S, facingYaw, phaseIndexOf } from '../../src/core/library/figure/gait';
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const W = 720;
const M = cityMetrics(340);
const U = M.unit;
const BASE = M.curb - U;
const STAGE_X = 300;
const G: StageGeom = { stageX: STAGE_X, width: W, unit: U };
const D0 = Math.floor(1_790_000_000 / 60) * 60;
const times = sunTimes({ y: 2026, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const OUTFITS = [0, 1, 2].map((i) => outfitFor('ordinary', mulberry32(100 + i)));
const at = (h: number): number => D0 + h * 3600;

const mount = (t: number, ghibli: boolean, still = false): HTMLDivElement => {
  vi.spyOn(Date, 'now').mockReturnValue(t * 1000);
  if (still) vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  const minutes = Math.floor((t - D0) / 60);
  return render(
    <svg>
      <StageBand stageX={STAGE_X} base={BASE} unit={U} width={W} minutes={minutes} dayOffset={0} outfits={OUTFITS} sky={skyAt(minutes, times)} rainy={false} still={still} ghibli={ghibli} />
    </svg>,
  );
};
const keyOf = (fig: Element): FigureKey => {
  const [sig, yaw, gait, phase, head, arms, lean] = fig.getAttribute('data-key')!.split('#').pop()!.split('|');
  return { sig: sig!, yaw: Number(yaw), gait: gait as FigureKey['gait'], phase: Number(phase), head: Number(head), arms: arms as FigureKey['arms'], lean: Number(lean) };
};
const translateOf = (tr: string): [number, number] => {
  const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(tr)!;
  return [Number(m[1]), Number(m[2])];
};
// Premier instant (pas de 1 s) où le musicien i marche en montant sur le plancher.
function climbing(): { t: number; i: number } {
  for (let t = at(16.7); t < at(17); t += 1) {
    for (let i = 0; i < MUSICIANS.length; i++) {
      const p = musicianAt(i, t, D0, G);
      if (p.mode === 'walking' && p.lift > 0.2 && p.lift < 0.8) return { t, i };
    }
  }
  throw new Error('aucune montée');
}

describe('musiciens en Ghibli', () => {
  it('18 h : pantins sans miroir tournés vers le public, guitare, micro, tambour aux mains ; balancement sur le groupe porteur', () => {
    const c = mount(at(18), true);
    const nodes = [...c.querySelectorAll('[data-stage-band]')];
    expect(nodes).toHaveLength(3);
    nodes.forEach((n, i) => {
      const kind = MUSICIANS[i]!.instrument;
      expect(n.getAttribute('data-stage-band')).toBe(kind);
      expect(n.getAttribute('transform')).not.toMatch(/scale\(-/);
      const fig = n.querySelector('[data-figure]')!;
      const key = keyOf(fig);
      expect([key.yaw, key.gait, key.arms]).toEqual([PLAY_YAW[i], 'stand', kind]);
      const held = fig.querySelector(':scope > [data-held="handR"]')!;
      expect(held.querySelector(`[data-instrument="${kind}"]`)).not.toBeNull();
      expect(translateOf(held.getAttribute('transform')!)).toEqual([...anchorsOf(key).handR]);
      expect(n.querySelectorAll(':scope > g > animateTransform')).toHaveLength(1);
      expect(fig.querySelectorAll('animate, animateTransform')).toHaveLength(0);
    });
    // Micro sur pied : le pied descend de la main jusqu'au plancher (pieds du pantin à y = 0).
    const mic = c.querySelector('[data-stage-band="mic"]')!;
    const key = keyOf(mic.querySelector('[data-figure]')!);
    const pole = mic.querySelector('[data-mic-pole]')!;
    expect(Number(pole.getAttribute('y2'))).toBeCloseTo(-anchorsOf(key).handR[1], 1);
    expect(c.querySelectorAll('[id], clipPath, mask').length).toBe(0);
  });
  it('arrivée : marche en montant sur le plancher (pas réglés sur la distance), sans balancement, à la hauteur du moteur', () => {
    const { t, i } = climbing();
    const p = musicianAt(i, t, D0, G);
    const c = mount(t, true);
    const n = c.querySelector(`[data-stage-band="${MUSICIANS[i]!.instrument}"]`)!;
    expect(n.getAttribute('data-mode')).toBe('walking');
    const key = keyOf(n.querySelector('[data-figure]')!);
    expect([key.yaw, key.gait]).toEqual([facingYaw(p.dir), 'walk']);
    expect(key.phase).toBe(phaseIndexOf(p.walked / (U * 0.8)));
    expect(key.arms).toBe({ guitar: 'guitar', mic: 'hold', drum: 'drum' }[MUSICIANS[i]!.instrument]);
    const [x, y] = translateOf(n.getAttribute('transform')!);
    expect(x).toBeCloseTo(p.x, 0);
    expect(y).toBeCloseTo(BASE + p.lift * STAGE_STAND * U, 0);
    expect(n.getAttribute('transform')).not.toMatch(/scale\(-/);
    expect(n.querySelectorAll('animateTransform')).toHaveLength(0);
    expect(n.querySelector('[data-instrument]')).not.toBeNull();
  });
  it('musicianAt : demi-tour sur place vers le public au bout de l’arrivée, et vers la sortie avant le départ', () => {
    MUSICIANS.forEach((_, i) => {
      let lastWalk: ReturnType<typeof musicianAt> | null = null;
      for (let t = at(16.7); t < at(17); t += 0.05) {
        const p = musicianAt(i, t, D0, G);
        if (p.mode === 'walking') lastWalk = p;
        if (p.mode === 'playing') {
          expect([p.yaw, p.gait, p.lift]).toEqual([PLAY_YAW[i], 'stand', 1]);
          break;
        }
      }
      expect(lastWalk!.gait).toBe('step');
      // Départ : d'abord le demi-tour sur place, puis la marche vers la sortie.
      for (let t = at(24); t < at(24.3); t += 0.05) {
        const p = musicianAt(i, t, D0, G);
        if (p.mode !== 'walking') continue;
        expect(p.gait).toBe('step');
        const q = musicianAt(i, t + TURN_S + 0.1, D0, G);
        expect([q.gait, q.yaw]).toEqual(['walk', facingYaw(q.dir)]);
        break;
      }
    });
  });
  it('mouvement réduit : pantins immobiles, aucune animation', () => {
    const c = mount(at(18), true, true);
    expect(c.querySelectorAll('[data-stage-band] [data-figure]')).toHaveLength(3);
    expect(c.querySelectorAll('animate, animateTransform')).toHaveLength(0);
  });
  it('classique inchangé : dessin à plat, profil retourné, instrument à côté du corps', () => {
    const c = mount(at(18), false);
    expect(c.querySelectorAll('[data-figure]')).toHaveLength(0);
    expect(c.querySelectorAll('[data-stage-band] > g > [data-instrument]')).toHaveLength(3);
    const { t } = climbing();
    const d = mount(t, false);
    expect(d.querySelectorAll('[data-stage-band][data-mode="walking"] [data-stride]').length).toBeGreaterThan(0);
  });
});
