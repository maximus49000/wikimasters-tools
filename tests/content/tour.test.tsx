// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TourOverlay } from '../../src/content/TourOverlay';
import { findTarget } from '../../src/content/tour-target';
import { bubbleTop, spotlightBox } from '../../src/content/tour-geometry';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('findTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="a"></div><div id="host"></div>';
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button data-wmt-linked>cartes</button>';
  });
  it('trouve un élément du document', () => {
    expect(findTarget('#a')).toBe(document.getElementById('a'));
  });
  it('trouve un élément dans un shadow DOM ouvert', () => {
    expect(findTarget('[data-wmt-linked]')?.textContent).toBe('cartes');
  });
  it('rend null si rien ne correspond', () => {
    expect(findTarget('[data-wmt-absent]')).toBeNull();
  });
});

describe('géométrie', () => {
  it('élargit la zone éclairée de 6 px de chaque côté', () => {
    expect(spotlightBox({ left: 20, top: 30, width: 100, height: 40 })).toEqual({ left: 14, top: 24, width: 112, height: 52 });
  });
  it('place la bulle sous la cible quand elle tient', () => {
    expect(bubbleTop({ left: 0, top: 100, width: 50, height: 40 }, 800, 150)).toBe(152);
  });
  it('la place au-dessus quand elle ne tient pas dessous', () => {
    expect(bubbleTop({ left: 0, top: 600, width: 50, height: 40 }, 700, 150)).toBe(438);
  });
  it('la centre sans cible', () => {
    expect(bubbleTop(null, 800, 200)).toBe(300);
  });
  it('ne sort jamais de l’écran par le haut', () => {
    expect(bubbleTop({ left: 0, top: 10, width: 50, height: 600 }, 700, 300)).toBe(12);
  });
});

describe('TourOverlay', () => {
  let container: HTMLElement;
  let root: Root;
  const steps = [
    { target: '#cible', title: 'Première', text: 'Texte un' },
    { target: '#absente', title: 'Seconde', text: 'Texte deux' },
  ];
  beforeEach(() => {
    document.body.innerHTML = '<button id="cible">ok</button>';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => act(() => root.unmount()));

  it('affiche l’étape, avance, signale une cible absente puis se termine', () => {
    const done = vi.fn();
    act(() => root.render(<TourOverlay steps={steps} onDone={done} />));
    expect(container.textContent).toContain('Première');
    expect(container.textContent).toContain('1/2');
    const click = (label: string) => act(() => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!.click());
    click('Suivant');
    expect(container.textContent).toContain('Seconde');
    expect(container.textContent).toContain('Ouvrez la page concernée');
    click('Précédent');
    expect(container.textContent).toContain('Première');
    click('Suivant');
    click('Terminer');
    expect(done).toHaveBeenCalledOnce();
  });

  it('Quitter la visite appelle onDone', () => {
    const done = vi.fn();
    act(() => root.render(<TourOverlay steps={steps} onDone={done} />));
    act(() => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Quitter la visite')!.click());
    expect(done).toHaveBeenCalledOnce();
  });

  it('une étape sans cible (null) n’affiche pas l’indication de page', () => {
    act(() => root.render(<TourOverlay steps={[{ target: null, title: 'Texte', text: 'Seul' }]} onDone={() => undefined} />));
    expect(container.textContent).toContain('Seul');
    expect(container.textContent).not.toContain('Ouvrez la page concernée');
  });
});
