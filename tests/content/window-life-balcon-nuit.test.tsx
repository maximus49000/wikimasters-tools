// @vitest-environment jsdom
// tests/content/window-life-balcon-nuit.test.tsx — vie aux fenêtres (finitions du chantier « vie au-dessus de la rue ») :
// pantin au balcon la nuit, en couleurs sombres (bleu-gris) devant une pièce éteinte, silhouette unie devant une pièce allumée.
// Fichier à part : window-life.test.tsx est déjà au bord de la mémoire d'un processus de test.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WindowLifeLayer } from '../../src/content/window-life';
import { sharedSceneLife, type SceneLife } from '../../src/content/use-scene-life';
import { FigureContext, FigureRegistry } from '../../src/content/figure/figure-host';
import { dayContext } from '../../src/core/library/city/calendar';
import { cityFacades, type Facade } from '../../src/core/library/city/facades';
import { homeState } from '../../src/core/library/city/home-state';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const H = 340;
const SEED = 7;
// Mardi 20 octobre 2026.
const DATE = { y: 2026, m: 10, d: 20 };
const skyOf = (minutes: number, d = DATE) => skyAt(minutes, sunTimes(d, { lat: 48.85, lon: 2.35 }, 120));
const NOW_S = Math.floor(1.8e9 / 86400) * 86400;
const lifeOf = (facades: Facade[], d = DATE): SceneLife => sharedSceneLife(facades, dayContext(d, []), false, SEED, false);
const shown = (layer: Element): Element[] => [...layer.querySelectorAll('[data-wl-fig]')].filter((g) => g.getAttribute('display') !== 'none');

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  vi.restoreAllMocks();
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(width: number) {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_S * 1000);
  const reg = new FigureRegistry('twln', { perFrame: 400 });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const render = (o: { minutes: number; facades: Facade[]; life: SceneLife; d: typeof DATE }): void =>
    act(() =>
      root!.render(
        <FigureContext.Provider value={reg}>
          <svg>
            <WindowLifeLayer facades={o.facades} life={o.life} sky={skyOf(o.minutes, o.d)} minutes={o.minutes} still={false} width={width} />
          </svg>
        </FigureContext.Provider>,
      ),
    );
  return { render, layer: () => host!.querySelector('[data-window-life]')! };
}

describe('pantins au balcon la nuit', () => {
  it('au balcon : en couleurs teintées de nuit devant une pièce éteinte, silhouette unie devant une pièce allumée', () => {
    // 14 juillet : pendant le feu d'artifice, salons éteints (dim) et occupants aux balcons ; un soir ordinaire : fumeurs et
    // curieux au balcon d'un salon allumé. Les penchés à la fenêtre gardent la silhouette (en couleurs, chaque tenue serait
    // cuite à chaque palier de la nuit, sur toute la ville).
    const BASTILLE = { y: 2026, m: 7, d: 14 };
    const width = 1440;
    const m = mount(width);
    const facades = cityFacades(width, H, SEED);
    const palette = (g: Element): string[] => g.querySelector('[data-figure]')!.getAttribute('data-palette')!.split(',').filter(Boolean);
    const silh = (g: Element): boolean => {
      const colors = new Set(palette(g));
      return colors.size === 1 && colors.has('#1A1422');
    };
    // Pantin sombre (maquette) : chaque couleur est un bleu-gris sombre (somme des canaux ≤ 260 ; la seule teinte de nuit du
    // moteur laissait la peau à ≈ 312 et une chemise écrue à ≈ 360), et la palette garde plusieurs couleurs (pas la silhouette).
    const sum = (hex: string): number => [1, 3, 5].reduce((acc, i) => acc + parseInt(hex.slice(i, i + 2), 16), 0);
    const dim = (g: Element): boolean => {
      const colors = palette(g);
      return new Set(colors).size > 1 && colors.every((c) => /^#[0-9a-f]{6}$/i.test(c) && sum(c) <= 260);
    };
    let dimOut = 0, litOut = 0;
    const show = lifeOf(facades, BASTILLE).day.show!;
    const evenings = [
      ...Array.from({ length: Math.ceil((show.end - show.start + 30) / 2) }, (_, i) => ({ d: BASTILLE, t: show.start - 20 + i * 2 })),
      ...Array.from({ length: 60 }, (_, i) => ({ d: DATE, t: 19 * 60 + i * 4 })),
    ];
    for (const { d: day, t } of evenings) {
      const life = lifeOf(facades, day);
      m.render({ minutes: t, facades, life, d: day });
      for (const g of shown(m.layer())) {
        const where = g.getAttribute('data-where');
        if (g.getAttribute('data-slot') !== 'out' || where !== 'balcony') continue;
        const [id, room] = g.getAttribute('data-room')!.split('/') as [string, 'salon' | 'cuisine' | 'chambre'];
        const d = life.byFacadeHome.get(id)!;
        const lit = !!homeState(d, life.today.get(id)!, life.yesterday.get(id) ?? null, t).lit[room];
        if (lit) litOut++;
        else dimOut++;
        expect(silh(g), `${id}/${room} à ${t} (${lit ? 'allumée' : 'éteinte'})`).toBe(lit);
        if (!lit) expect(dim(g), `${id}/${room} à ${t} : pantin sombre ${palette(g).join(',')}`).toBe(true);
      }
    }
    expect(dimOut).toBeGreaterThan(0);
    expect(litOut).toBeGreaterThan(0);
  });
});
