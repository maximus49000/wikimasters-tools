// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { COAT_COLORS, PetBubble, PetSprite, paletteOf } from '../../src/content/pet-sprite';
import { COATS, DOG_COATS } from '../../src/core/library/library-types';
import type { Pose } from '../../src/core/library/pets/runner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function draw(props: Parameters<typeof PetSprite>[0]): SVGElement {
  const container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(<svg><PetSprite {...props} /></svg>));
  return container.querySelector('svg') as SVGElement;
}

const POSES: Pose[] = ['walk', 'jump', 'sit', 'groom', 'stretch', 'yawn', 'sleep', 'eat', 'scratch', 'hide', 'purr', 'pant', 'sniff', 'greet', 'play', 'hiss', 'cower'];
const DOG_POSES: Pose[] = [...POSES];

describe('PetSprite', () => {
  it.each(POSES)('dessine la pose %s', (pose) => {
    const svg = draw({ coat: 'orange', pose, facing: 'r', name: 'Minou' });
    expect(svg.querySelector(`[data-pet-pose="${pose}"]`)).not.toBeNull();
    expect(svg.querySelector('[data-cat-body]')!.children.length).toBeGreaterThan(0);
  });

  it('tourne le corps vers la gauche, sans nom dans le sprite', () => {
    const svg = draw({ coat: 'gray', pose: 'purr', facing: 'l', name: 'Pilou' });
    expect(svg.querySelector('[data-cat-body]')!.getAttribute('transform')).toBe('scale(-1 1)');
    expect(svg.querySelector('[data-pet-name]')).toBeNull();
  });

  it('la bulle (nom + cœurs) est un composant à part', () => {
    const container = document.createElement('div');
    document.body.append(container);
    act(() => createRoot(container).render(<svg><PetBubble name="Pilou" /></svg>));
    expect(container.querySelector('[data-pet-name]')!.textContent).toBe('Pilou');
    expect(container.textContent).toContain('♥');
  });

  it('sans animation quand still', () => {
    expect(draw({ coat: 'white', pose: 'walk', facing: 'r', name: 'x' }).querySelector('animateTransform')).not.toBeNull();
    expect(draw({ coat: 'white', pose: 'walk', facing: 'r', name: 'x', still: true }).querySelector('animateTransform')).toBeNull();
    expect(draw({ coat: 'white', pose: 'groom', facing: 'r', name: 'x', still: true }).querySelector('animateTransform')).toBeNull();
  });

  it.each(COATS)('le pelage %s a sa couleur', (coat) => {
    const svg = draw({ coat, pose: 'sit', facing: 'r', name: 'x' });
    expect(svg.innerHTML.toLowerCase()).toContain(COAT_COLORS[coat].body.toLowerCase());
  });

  it.each(DOG_POSES)('dessine le chien en pose %s', (pose) => {
    const svg = draw({ species: 'dog', coat: 'brown', pose, facing: 'r', name: 'Rex' });
    expect(svg.querySelector(`[data-pet-pose="${pose}"]`)).not.toBeNull();
    expect(svg.querySelector('[data-dog-body]')!.children.length).toBeGreaterThan(0);
    expect(svg.querySelector('[data-cat-body]')).toBeNull();
  });

  it('chaque pelage de chien a sa palette, et le chien tacheté a des taches', () => {
    for (const coat of DOG_COATS) expect(paletteOf('dog', coat).body).toMatch(/^#/);
    const svg = draw({ species: 'dog', coat: 'spotted', pose: 'sit', facing: 'r', name: 'Rex' });
    expect(svg.querySelector('[data-dog-spots]')).not.toBeNull();
  });

  it('le chien se retourne vers la gauche', () => {
    const svg = draw({ species: 'dog', coat: 'red', pose: 'walk', facing: 'l', name: 'Rex' });
    expect(svg.querySelector('[data-dog-body]')!.getAttribute('transform')).toBe('scale(-1 1)');
  });
});
