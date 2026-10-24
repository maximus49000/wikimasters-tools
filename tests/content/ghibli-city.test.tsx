// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY } from '../../src/content/art-setting';
import { resetPaintedCacheForTests, setTilePainterForTests } from '../../src/content/painted-city';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { resetStreetTreesForTests, setRueSpritePainterForTests, type RueBakeJob } from '../../src/content/street-trees';
import { resetStreetTreesSlotForTests } from '../../src/content/street-trees-slot';
import { dayContext } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityFacades } from '../../src/core/library/city/facades';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
const render = async (minutes: number, width = 720) => {
  await act(async () => {
    root.render(
      <svg>
        <ScenePanorama scene="city" width={width} height={340} sky={skyAt(minutes, times)} minutes={minutes} seed={5} />
      </svg>,
    );
  });
  await settle();
};
const q = (s: string) => container.querySelector(s);
const qa = (s: string) => container.querySelectorAll(s);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('requestIdleCallback', (fn: () => void) => { fn(); return 1; });
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  resetPaintedCacheForTests();
  resetStreetTreesForTests();
  resetStreetTreesSlotForTests();
  setTilePainterForTests(null);
  setRueSpritePainterForTests(null);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.removeItem(ART_KEY);
  setTilePainterForTests(null);
  setRueSpritePainterForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ville peinte', () => {
  it('graphisme classique : aucune trace de la branche Ghibli', async () => {
    await render(12 * 60);
    expect(q('[data-painted-city]')).toBeNull();
    expect(q('[data-art="ghibli"]')).toBeNull();
    // Une fenêtre par fenêtre allumable (logement) : la cage et l'entresol ne s'allument pas avec les logements.
    const lamps = cityFacades(720, 340, 5).filter((b) => !b.far).reduce((n, b) => n + b.lamps.filter((l) => l.home >= 0).length, 0);
    expect(lamps).toBeLessThan(cityFacades(720, 340, 5).filter((b) => !b.far).reduce((n, b) => n + b.lamps.length, 0));
    expect(qa('[data-lamp]').length).toBe(lamps);
    // À la taille de chaque fenêtre.
    const sizes = new Set([...qa('[data-lamp]')].map((r) => `${r.getAttribute('width')}x${r.getAttribute('height')}`));
    expect(sizes.size).toBeGreaterThan(3);
  });

  it('graphisme classique : le socle d’un jumeau est dessiné avant les fenêtres (rien ne cache la rangée du socle)', async () => {
    await render(12 * 60, 2160);
    const podiums = [...qa('[data-podium]')];
    expect(podiums.length).toBeGreaterThan(0);
    const lamps = [...qa('[data-lamp]')];
    for (const p of podiums) for (const l of lamps) expect(p.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Ghibli sans canvas (jsdom) : la ville classique reste visible', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    await render(12 * 60);
    expect(q('[data-painted-city]')?.getAttribute('data-ready')).toBe('false');
    expect((q('[data-classic-city]') as HTMLElement).style.opacity).toBe('1');
  });

  it('Ghibli peint : images par tranche, fondu vers la peinture, fenêtres allumées', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    const painter = vi.fn(async (_plan: unknown, tile: number) => `blob:fake-${tile}`);
    setTilePainterForTests(painter);
    await render(23 * 60);
    expect(qa('[data-painted-tile]').length).toBe(2);
    expect(q('[data-painted-city]')?.getAttribute('data-ready')).toBe('true');
    expect((q('[data-painted-city]') as HTMLElement).style.opacity).toBe('1');
    expect((q('[data-classic-city]') as HTMLElement).style.opacity).toBe('0');
    expect(q('[data-ghibli-windows] [data-lamp][data-lit="true"]')).not.toBeNull();
    expect(painter).toHaveBeenCalledTimes(2);
  });

  it('agrandir la pièce ne peint que les nouvelles tranches', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    const painter = vi.fn(async (_plan: unknown, tile: number) => `blob:fake-${tile}`);
    setTilePainterForTests(painter);
    await render(12 * 60, 720);
    await render(12 * 60, 1080);
    // La 1re tranche n'est jamais repeinte ; la 2e peut l'être si un arbre ou une entrée change près de l'ancien bord.
    expect(painter.mock.calls.filter((c) => c[1] === 0).length).toBe(1);
    expect(painter.mock.calls.filter((c) => c[1] === 2).length).toBe(1);
    expect(qa('[data-painted-tile]').length).toBe(3);
  });

  it('l’étalonnage suit l’heure', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    setTilePainterForTests(async (_p, t) => `blob:fake-${t}`);
    await render(12 * 60);
    const noon = q('[data-painted-city] feColorMatrix')?.getAttribute('values');
    await render(23 * 60);
    const night = q('[data-painted-city] feColorMatrix')?.getAttribute('values');
    expect(noon).toBeTruthy();
    expect(night).not.toBe(noon);
  });

  it('nuit : flaques des lampadaires, fenêtres allumées et vitres sombres, hors filtre ; rien de visible à midi', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    setTilePainterForTests(async (_p, t) => `blob:fake-${t}`);
    await render(23 * 60);
    const night = q('[data-painted-city] [data-ghibli-night]');
    expect(night).not.toBeNull();
    expect(night!.closest('[filter]')).toBeNull();
    const lamps = qa('[data-ghibli-night] [data-night-lamp]');
    expect(lamps.length).toBeGreaterThan(0);
    expect([...lamps].every((l) => l.getAttribute('data-lit') === 'true' && Number(l.getAttribute('opacity')) > 0.5)).toBe(true);
    expect(qa('[data-ghibli-windows] [data-lamp][data-lit="true"] [data-figure]').length).toBeGreaterThan(0);
    const windows = q('[data-painted-city] [data-ghibli-windows]');
    expect(windows!.closest('[filter]')).toBeNull();
    expect([...qa('[data-ghibli-windows] [data-lamp][data-lit="true"]')].every((l) => Number(l.getAttribute('opacity')) > 0.5)).toBe(true);
    expect([...qa('[data-ghibli-windows] [data-night-glass]')].every((g) => g.getAttribute('opacity') === '1')).toBe(true);
    await render(12 * 60);
    expect([...qa('[data-ghibli-night] [data-night-lamp]')].every((l) => l.getAttribute('opacity') === '0')).toBe(true);
    expect([...qa('[data-ghibli-windows] [data-lamp]')].every((l) => l.getAttribute('opacity') === '0')).toBe(true);
    expect([...qa('[data-ghibli-windows] [data-night-glass]')].every((g) => g.getAttribute('opacity') === '0')).toBe(true);
  });

  it('une erreur de peinture sur une tranche n’arrête pas les autres', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    setTilePainterForTests(async (_p, t) => {
      if (t === 0) throw new Error('boom');
      return `blob:fake-${t}`;
    });
    await render(12 * 60);
    expect(qa('[data-painted-tile]').length).toBe(1);
    expect(q('[data-painted-city]')?.getAttribute('data-ready')).toBe('false');
  });

  describe('arbres de la rue : partie du décor', () => {
    const sprite = (job: RueBakeJob) => Object.fromEntries(job.layers.map((l) => [l, `data:${job.key}|${l}`]));
    const city = () => q('[data-painted-city]') as HTMLElement;
    it('la ville peinte attend les arbres cuits, puis entre en fondu avec eux', async () => {
      localStorage.setItem(ART_KEY, 'ghibli');
      setTilePainterForTests(async (_p, t) => `data:fake-${t}`);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => (release = r));
      setRueSpritePainterForTests(async (job) => {
        await gate;
        return sprite(job);
      });
      await render(12 * 60);
      expect(qa('[data-painted-tile]').length).toBe(2);
      expect(qa('[data-rue-arbre]').length).toBeGreaterThan(0);
      expect(city().getAttribute('data-ready')).toBe('false');
      expect(city().style.opacity).toBe('0');
      expect((q('[data-classic-city]') as HTMLElement).style.opacity).toBe('1');
      release();
      await settle();
      expect(city().getAttribute('data-ready')).toBe('true');
      expect(city().style.opacity).toBe('1');
      expect([...qa('[data-rue-arbre]')].every((g) => g.hasAttribute('data-rue-pret'))).toBe(true);
    });
    it('filet de sécurité : 8 s après les tranches, la ville est montrée et les arbres en retard entrent en fondu', async () => {
      localStorage.setItem(ART_KEY, 'ghibli');
      setTilePainterForTests(async (_p, t) => `data:fake-${t}`);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => (release = r));
      setRueSpritePainterForTests(async (job) => {
        await gate;
        return sprite(job);
      });
      const real = window.setTimeout.bind(window);
      const caps: (() => void)[] = [];
      vi.spyOn(window, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
        if (ms === 8000) {
          caps.push(fn);
          return 0;
        }
        return real(fn, ms);
      }) as typeof window.setTimeout);
      await render(12 * 60);
      expect(city().getAttribute('data-ready')).toBe('false');
      expect(caps.length).toBeGreaterThan(0);
      await act(async () => caps.at(-1)!());
      expect(city().getAttribute('data-ready')).toBe('true');
      expect(city().style.opacity).toBe('1');
      // Arbres pas encore cuits : pas dessinés ; cuits, ils entrent en fondu sur la toile (street-trees.test.tsx).
      const trees = [...qa('[data-rue-arbre]')];
      expect(trees.every((g) => !g.hasAttribute('data-rue-pret'))).toBe(true);
      release();
      await settle();
      expect(trees.every((g) => g.hasAttribute('data-rue-pret'))).toBe(true);
    });
  });

  describe('arbres de la rue : profondeur', () => {
    const before = (a: Element, b: Element): boolean => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const paintAll = () => {
      setTilePainterForTests(async (_p, t) => `data:fake-${t}`);
      setRueSpritePainterForTests(async (job) => Object.fromEntries(job.layers.map((l) => [l, `data:${job.key}|${l}`])));
    };
    it('avec la population : devant la vie des façades, les devantures et le trottoir des immeubles ; derrière lampadaires et circulation', async () => {
      localStorage.setItem(ART_KEY, 'ghibli');
      paintAll();
      const minutes = 21 * 60;
      const sky = skyAt(minutes, times);
      const city: CityContext = { minutes, day: dayContext({ y: 2024, m: 6, d: 21 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
      await act(async () => {
        root.render(
          <svg>
            <ScenePanorama scene="city" width={720} height={340} sky={sky} minutes={minutes} seed={5} city={city} />
          </svg>,
        );
      });
      await settle();
      const trees = [...qa('[data-rue-arbre]')];
      expect(trees.length).toBeGreaterThan(0);
      const first = trees[0]!;
      const last = trees.at(-1)!;
      const under = ['[data-scene-body]', '[data-window-life]', '[data-roof-life]', '[data-stair-lights]', '[data-hall-lights]', '[data-city-sidewalk]'];
      for (const sel of under) {
        const nodes = [...qa(sel)];
        expect(nodes.length, sel).toBeGreaterThan(0);
        for (const n of nodes) expect(before(n, first) && !n.contains(first), sel).toBe(true);
      }
      // Habitants et passants : dans le trottoir des immeubles, donc dessous.
      for (const n of qa('[data-resident], [data-city-sidewalk] [data-works]')) expect(before(n, first)).toBe(true);
      // 21 juin : la scène de la Fête de la musique (pied au bord de la chaussée, devant la ligne des fosses) est devant les
      // arbres ; les équipes des façades (partie `crew`, dans le trottoir des immeubles) restent dessous.
      const stage = q('[data-install-part="stage"]')!;
      expect(stage.closest('[data-city-curb]')).not.toBeNull();
      expect(stage.children.length).toBeGreaterThan(0);
      for (const n of qa('[data-install-part="crew"]')) expect(n.querySelector('[data-concert-light], [data-stage-band]')).toBeNull();
      const over = ['[data-city-curb]', '[data-street-lamps]', '[data-traffic-lane]'];
      for (const sel of over) {
        const nodes = [...qa(sel)];
        expect(nodes.length, sel).toBeGreaterThan(0);
        for (const n of nodes) expect(before(last, n), sel).toBe(true);
      }
      // Ils suivent la visibilité de la ville peinte.
      expect((q('[data-painted-city]') as HTMLElement).style.opacity).toBe('1');
      expect((q('[data-arbres-rue-scene]') as HTMLElement).style.opacity).toBe('1');
    });
    it('sans population : même profondeur (juste avant les lampadaires) ; passage au classique : fondu puis aucun arbre', async () => {
      localStorage.setItem(ART_KEY, 'ghibli');
      paintAll();
      await render(12 * 60);
      const trees = [...qa('[data-rue-arbre]')];
      expect(trees.length).toBeGreaterThan(0);
      expect(before(q('[data-scene-body]')!, trees[0]!)).toBe(true);
      expect(before(trees.at(-1)!, q('[data-street-lamps]')!)).toBe(true);
      // Passage au classique : les arbres s'effacent avec la ville peinte (fondu de 1 s), puis disparaissent avec elle.
      localStorage.removeItem(ART_KEY);
      await render(12 * 60);
      expect((q('[data-painted-city]') as HTMLElement).style.opacity).toBe('0');
      expect(qa('[data-rue-arbre]').length).toBeGreaterThan(0);
      expect((q('[data-arbres-rue-scene]') as HTMLElement).style.opacity).toBe('0');
      await act(async () => new Promise((r) => setTimeout(r, 1100)));
      await settle();
      expect(q('[data-painted-city]')).toBeNull();
      expect(qa('[data-rue-arbre]').length).toBe(0);
    });
    it('masqués tant que la ville peinte ne se montre pas', async () => {
      localStorage.setItem(ART_KEY, 'ghibli');
      setTilePainterForTests(async () => null);
      setRueSpritePainterForTests(async (job) => Object.fromEntries(job.layers.map((l) => [l, `data:${job.key}|${l}`])));
      await render(12 * 60);
      expect(q('[data-painted-city]')?.getAttribute('data-ready')).toBe('false');
      expect((q('[data-arbres-rue-scene]') as HTMLElement).style.opacity).toBe('0');
    });
  });
});
