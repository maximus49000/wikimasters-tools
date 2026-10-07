// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TourOverlay } from '../../src/content/TourOverlay';
import { findTarget } from '../../src/content/tour-target';
import { bubbleTop, clampBubble, scaleToFit, spotlightBox } from '../../src/content/tour-geometry';

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

describe('bulle déplaçable', () => {
  it('reste dans l’écran, marge de 8 px, sur les quatre bords', () => {
    const size = { width: 200, height: 150 };
    const screen = { width: 400, height: 700 };
    expect(clampBubble({ left: -50, top: -20 }, size, screen)).toEqual({ left: 8, top: 8 });
    expect(clampBubble({ left: 390, top: 690 }, size, screen)).toEqual({ left: 192, top: 542 });
    expect(clampBubble({ left: 100, top: 300 }, size, screen)).toEqual({ left: 100, top: 300 });
  });
  it('une bulle plus grande que l’écran se cale en haut à gauche', () => {
    expect(clampBubble({ left: 50, top: 50 }, { width: 500, height: 900 }, { width: 400, height: 700 })).toEqual({ left: 8, top: 8 });
  });
  it('réduit un encart trop large sans jamais l’agrandir', () => {
    expect(scaleToFit(400, 100, 200, 90)).toBe(0.5);
    expect(scaleToFit(100, 200, 200, 90)).toBe(0.45);
    expect(scaleToFit(100, 40, 200, 90)).toBe(1);
    expect(scaleToFit(0, 0, 200, 90)).toBe(1);
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

  it('prépare chaque étape, affiche la note et la démonstration, et signale l’index', async () => {
    const prepare = vi.fn(async (step: { title: string }) =>
      step.title === 'Première' ? { note: { tone: 'real' as const, text: 'Carte de votre Collection : Hades' } } : { demo: 'game' as const },
    );
    const onIndex = vi.fn();
    await act(async () => root.render(<TourOverlay steps={steps} prepare={prepare} onIndex={onIndex} renderDemo={(card) => <div>démo {card}</div>} onDone={() => undefined} />));
    expect(prepare).toHaveBeenCalledWith(steps[0], 0);
    expect(onIndex).toHaveBeenCalledWith(0);
    expect(container.textContent).toContain('Carte de votre Collection : Hades');
    await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Suivant')!.click());
    expect(onIndex).toHaveBeenCalledWith(1);
    expect(container.textContent).toContain('démo game');
  });

  it('reprend à l’étape demandée et montre « Préparation… » tant que l’écran se prépare', async () => {
    let finish: (value: object) => void = () => undefined;
    const prepare = () => new Promise<object>((resolve) => (finish = resolve));
    await act(async () => root.render(<TourOverlay steps={steps} startIndex={1} prepare={prepare} onDone={() => undefined} />));
    expect(container.textContent).toContain('Seconde');
    expect(container.textContent).toContain('Préparation…');
    await act(async () => finish({ navigating: true }));
    expect(container.textContent).not.toContain('Préparation…');
    expect(container.textContent).toContain('Changement de page…');
  });

  it('découpe une étape en pages : une page par paragraphe titré, avec compteur et retour', () => {
    const detailed = [{ target: null, title: 'Prix', text: 'Sert à trier.', details: [{ label: 'D’où viennent les données', text: 'Du marché.' }, { label: 'À savoir', text: 'Délai de 30 min.' }] }];
    act(() => root.render(<TourOverlay steps={detailed} onDone={() => undefined} />));
    const click = (label: string) => act(() => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!.click());
    expect(container.textContent).toContain('Sert à trier.');
    expect(container.textContent).toContain('page 1/3');
    expect(container.textContent).not.toContain('Du marché.');
    click('Suivant');
    expect(container.textContent).toContain('D’où viennent les données');
    expect(container.textContent).toContain('Du marché.');
    expect(container.textContent).not.toContain('Sert à trier.');
    expect(container.textContent).toContain('page 2/3');
    click('Suivant');
    expect(container.textContent).toContain('Délai de 30 min.');
    expect(container.textContent).toContain('Terminer');
    click('Précédent');
    click('Précédent');
    expect(container.textContent).toContain('Sert à trier.');
  });

  it('passe à l’étape suivante après la dernière page, et revient à la dernière page de l’étape précédente', () => {
    const two = [
      { target: null, title: 'Un', text: 'Texte un.', details: [{ label: 'Détail', text: 'Détail un.' }] },
      { target: null, title: 'Deux', text: 'Texte deux.' },
    ];
    act(() => root.render(<TourOverlay steps={two} onDone={() => undefined} />));
    const click = (label: string) => act(() => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!.click());
    click('Suivant');
    click('Suivant');
    expect(container.textContent).toContain('Texte deux.');
    expect(container.textContent).toContain('Étape 2/2');
    click('Précédent');
    expect(container.textContent).toContain('Détail un.');
  });

  it('montre l’encart de l’interface sur la première page seulement : copie de l’élément, sinon le glyphe', () => {
    document.body.innerHTML = '<button id="cible" style="color: rgb(1, 2, 3)">Prix de vente décroissant</button>';
    const withTarget = [{ target: '#cible', title: 'Prix', text: 'Sert à trier.', details: [{ label: 'À savoir', text: 'Délai.' }] }];
    act(() => root.render(<TourOverlay steps={withTarget} onDone={() => undefined} />));
    expect(container.querySelector('[data-wmt-encart]')?.textContent).toContain('Prix de vente décroissant');
    act(() => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Suivant')!.click());
    expect(container.querySelector('[data-wmt-encart]')).toBeNull();

    const without = [{ target: '#absente', title: 'Prix', text: 'Sert à trier.', glyph: '📈' }];
    act(() => root.render(<TourOverlay steps={without} onDone={() => undefined} />));
    expect(container.querySelector('[data-wmt-encart]')?.textContent).toContain('📈');
  });

  it('la poignée déplace la bulle, qui reste dans l’écran', () => {
    act(() => root.render(<TourOverlay steps={steps} onDone={() => undefined} />));
    const grip = container.querySelector<HTMLElement>('[data-wmt-grip]')!;
    const bubble = grip.parentElement as HTMLElement;
    const fire = (type: string, x: number, y: number) => act(() => void grip.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })));
    fire('pointerdown', 100, 100);
    fire('pointermove', -5000, -5000);
    expect(parseFloat(bubble.style.left)).toBeGreaterThanOrEqual(8);
    expect(parseFloat(bubble.style.top)).toBeGreaterThanOrEqual(8);
    fire('pointermove', 9000, 9000);
    expect(parseFloat(bubble.style.left)).toBeLessThanOrEqual(window.innerWidth);
    expect(parseFloat(bubble.style.top)).toBeLessThanOrEqual(window.innerHeight);
    fire('pointerup', 9000, 9000);
  });
});
