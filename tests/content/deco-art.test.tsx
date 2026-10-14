// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ensureDecoFonts } from '../../src/content/deco-fonts';
import { DecoArt, TableFace, type DecoView } from '../../src/content/deco-art';
import { DECO_KINDS } from '../../src/core/library/deco';
import { STYLE_IDS } from '../../src/core/library/library-types';
import { paletteOf } from '../../src/core/library/styles';

// jsdom n'a pas de canevas : sans ce relais il le signale sur la console ; la mesure retombe alors sur la chasse moyenne.
HTMLCanvasElement.prototype.getContext = (() => null) as never;

const view: DecoView = { time: { h: 10, m: 10, s: 30 }, weather: { state: 'sun', label: 'Soleil', tempC: 18, night: false }, daylight: 1, editing: false };
const rect = { x: 0, y: 0, w: 120, h: 90 };
const draw = (placed: Parameters<typeof DecoArt>[0]['placed'], style = 'scandinave' as (typeof STYLE_IDS)[number], v = view) =>
  renderToStaticMarkup(<svg><DecoArt placed={placed} rect={rect} style={style} palette={paletteOf(style)} view={v} /></svg>);

describe('dessin des objets décoratifs', () => {
  it('chaque objet se dessine dans les 8 styles', () => {
    for (const style of STYLE_IDS) for (const deco of DECO_KINDS) {
      const html = draw({ id: 'f1', kind: 'deco', deco, col: 0, row: 0 }, style);
      expect(html).toContain(`data-deco="${deco}"`);
    }
  });
  it('le nom de la ville n apparaît que si elle est choisie', () => {
    expect(draw({ id: 'f1', kind: 'deco', deco: 'wall-clock', col: 0, row: 0 })).not.toContain('data-city');
    expect(draw({ id: 'f1', kind: 'deco', deco: 'wall-clock', col: 0, row: 0 }, 'scandinave', { ...view, city: 'Tokyo' })).toContain('TOKYO');
  });
  it('l horloge numérique a des tubes Nixie en Steampunk', () => {
    expect(draw({ id: 'f1', kind: 'deco', deco: 'digital-clock', col: 0, row: 0 }, 'steampunk')).toContain('data-nixie');
  });
  it('la station affiche la température et la lune la nuit', () => {
    const night = { ...view, weather: { ...view.weather, night: true } };
    const html = draw({ id: 'f1', kind: 'deco', deco: 'weather-station', col: 0, row: 0 }, 'scandinave', night);
    expect(html).toContain('18°');
    expect(html).toContain('data-icon="moon"');
  });
  it('le néon a un halo de sa couleur seulement quand il fait sombre', () => {
    const neon = { id: 'f1', kind: 'deco' as const, deco: 'panel-neon' as const, col: 0, row: 0, w: 5, h: 2, text: 'Hello', neon: 'cyan' as const };
    expect(draw(neon, 'scandinave', { ...view, daylight: 0 })).toMatch(/data-neon-halo[^>]*#00E5FF|#00E5FF[^>]*data-neon-halo/);
    expect(draw(neon, 'scandinave', { ...view, daylight: 1 })).not.toContain('data-neon-halo');
  });
  it('un panneau vide invite à écrire en Aménager seulement', () => {
    const empty = { id: 'f1', kind: 'deco' as const, deco: 'panel-chalk' as const, col: 0, row: 0, w: 4, h: 3 };
    expect(draw(empty, 'scandinave', { ...view, editing: true })).toContain('Touchez pour écrire');
    expect(draw(empty)).not.toContain('Touchez pour écrire');
  });
  it('le tableau à lettres écrit en capitales', () => {
    expect(draw({ id: 'f1', kind: 'deco', deco: 'panel-letter', col: 0, row: 0, w: 4, h: 3, text: 'Bienvenue' })).toContain('BIENVENUE');
  });
  it('les faces de table se dessinent', () => {
    for (const item of ['alarm', 'clock', 'station'] as const) {
      expect(renderToStaticMarkup(<svg><TableFace item={item} w={150} h={70} style="neon" view={view} /></svg>)).toContain(`data-table-face="${item}"`);
    }
  });
});

it('déclare les 4 polices une seule fois dans le document', () => {
  ensureDecoFonts(document);
  ensureDecoFonts(document);
  const styles = document.querySelectorAll('#wmt-deco-fonts');
  expect(styles).toHaveLength(1);
  for (const f of ['WMT Caveat', 'WMT Oswald', 'WMT Pacifico', 'WMT Patrick Hand']) expect(styles[0]!.textContent).toContain(f);
});
