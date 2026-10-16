// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { HifiDisc, HifiFace, HifiGrille, HifiTop } from '../../src/content/hifi/hifi-art';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: (() => void)[] = [];
afterEach(() => { roots.forEach((u) => u()); roots = []; });

function mount(el: ReactElement): HTMLElement {
  const c = document.createElement('div');
  document.body.append(c);
  const root = createRoot(c);
  act(() => root.render(<svg>{el}</svg>));
  roots.push(() => act(() => root.unmount()));
  return c;
}
const COVER = 'https://exemple.org/pochette.jpg';

describe('dessin de la chaîne hi-fi', () => {
  it('disque qui tourne : calque intérieur animé, pochette sur l’étiquette, reflet hors du calque tournant', () => {
    const c = mount(<HifiDisc cover={COVER} color="#C0504D" spinning />);
    const spin = c.querySelector<SVGGElement>('[data-hifi-disc-spin]')!;
    expect(spin.style.animation).toContain('wmt-hifi-disc-spin');
    expect(spin.querySelector('image')!.getAttribute('href')).toBe(COVER);
    const glint = c.querySelector('[data-hifi-disc-glint]')!;
    expect(spin.contains(glint)).toBe(false);
  });

  it('disque à l’arrêt : immobile ; sans pochette : étiquette à la couleur de la carte', () => {
    const c = mount(<HifiDisc cover={null} color="#C0504D" spinning={false} />);
    expect(c.querySelector<SVGGElement>('[data-hifi-disc-spin]')!.style.animation).toBe('');
    expect(c.querySelector('image')).toBeNull();
    expect(c.querySelector('[fill="#C0504D"]')).not.toBeNull();
  });

  it('façade : l’afficheur fait défiler le titre de la piste, voyant allumé pendant la lecture', () => {
    const c = mount(<HifiFace w={300} h={120} title="One More Time — Daft Punk" playing />);
    const display = c.querySelector('[data-hifi-display]')!;
    expect(display.textContent).toContain('One More Time');
    expect(display.querySelector<SVGGElement>('[data-hifi-marquee]')!.style.animation).toContain('wmt-hifi-marquee');
    expect(c.querySelector('[data-hifi-led]')!.getAttribute('data-hifi-led')).toBe('on');
  });

  it('façade au repos : voyant éteint, rien ne défile', () => {
    const c = mount(<HifiFace w={300} h={120} title={null} playing={false} />);
    expect(c.querySelector('[data-hifi-led]')!.getAttribute('data-hifi-led')).toBe('off');
    expect(c.querySelector('[data-hifi-marquee]')).toBeNull();
  });

  it('dessus : platine et bras, puits CD ; le disque posé est centré dans son plateau', () => {
    const vinyl = mount(<HifiTop w={300} h={260} disc={{ kind: 'vinyl', cover: COVER, color: '#123456' }} spinning />);
    expect(vinyl.querySelector('[data-hifi-platter]')).not.toBeNull();
    expect(vinyl.querySelector('[data-hifi-tonearm]')!.getAttribute('data-hifi-tonearm')).toBe('play');
    const at = vinyl.querySelector('[data-hifi-disc-at="platter"]')!;
    const platter = vinyl.querySelector('[data-hifi-platter]')!;
    expect(at.getAttribute('transform')).toContain(`translate(${platter.getAttribute('data-cx')} ${platter.getAttribute('data-cy')})`);
    const cd = mount(<HifiTop w={300} h={260} disc={{ kind: 'cd', cover: COVER, color: '#123456' }} spinning={false} />);
    const well = cd.querySelector('[data-hifi-well]')!;
    expect(cd.querySelector('[data-hifi-disc-at="well"]')!.getAttribute('transform')).toContain(`translate(${well.getAttribute('data-cx')} ${well.getAttribute('data-cy')})`);
    expect(cd.querySelector('[data-hifi-lid]')!.getAttribute('data-hifi-lid')).toBe('open');
    const empty = mount(<HifiTop w={300} h={260} disc={null} spinning={false} />);
    expect(empty.querySelector('[data-hifi-disc-at]')).toBeNull();
    expect(empty.querySelector('[data-hifi-lid]')!.getAttribute('data-hifi-lid')).toBe('closed');
    expect(empty.querySelector('[data-hifi-tonearm]')!.getAttribute('data-hifi-tonearm')).toBe('rest');
  });

  it('enceintes : grille en tissu', () => {
    const c = mount(<HifiGrille w={130} h={180} />);
    expect(c.querySelector('[data-hifi-grille]')).not.toBeNull();
  });
});

describe('cartouche posée sur le poste', () => {
  it('couchée, jamais tournée ni animée ; étiquette = pochette', () => {
    const c = mount(<HifiDisc kind="cart" cover={COVER} color="#C0504D" spinning />);
    const cart = c.querySelector('[data-hifi-cart]')!;
    expect(cart).not.toBeNull();
    expect(c.innerHTML).not.toContain('rotate');
    expect(c.querySelector('[data-hifi-disc-spin]')).toBeNull();
    expect(cart.querySelector('image')!.getAttribute('href')).toBe(COVER);
  });
});
