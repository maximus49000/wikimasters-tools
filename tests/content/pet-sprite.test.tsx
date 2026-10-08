// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { COAT_COLORS, PetSprite } from '../../src/content/pet-sprite';
import { COATS } from '../../src/core/library/library-types';
import type { Pose } from '../../src/core/library/pets/runner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function draw(props: Parameters<typeof PetSprite>[0]): SVGElement {
  const container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(<svg><PetSprite {...props} /></svg>));
  return container.querySelector('svg') as SVGElement;
}

const POSES: Pose[] = ['walk', 'jump', 'sit', 'groom', 'stretch', 'yawn', 'sleep', 'eat', 'scratch', 'hide', 'purr'];

describe('PetSprite', () => {
  it.each(POSES)('dessine la pose %s', (pose) => {
    const svg = draw({ coat: 'orange', pose, facing: 'r', name: 'Minou' });
    expect(svg.querySelector(`[data-pet-pose="${pose}"]`)).not.toBeNull();
    expect(svg.querySelector('[data-cat-body]')!.children.length).toBeGreaterThan(0);
  });

  it('tourne le corps vers la gauche sans retourner le nom', () => {
    const svg = draw({ coat: 'gray', pose: 'purr', facing: 'l', name: 'Pilou' });
    expect(svg.querySelector('[data-cat-body]')!.getAttribute('transform')).toBe('scale(-1 1)');
    expect(svg.querySelector('[data-pet-name]')!.textContent).toBe('Pilou');
    expect(svg.querySelector('[data-pet-name]')!.closest('[data-cat-body]')).toBeNull();
  });

  it('montre le nom et des cœurs seulement quand il ronronne', () => {
    expect(draw({ coat: 'white', pose: 'sit', facing: 'r', name: 'Pilou' }).querySelector('[data-pet-name]')).toBeNull();
    expect(draw({ coat: 'white', pose: 'purr', facing: 'r', name: 'Pilou' }).textContent).toContain('♥');
  });

  it.each(COATS)('le pelage %s a sa couleur', (coat) => {
    const svg = draw({ coat, pose: 'sit', facing: 'r', name: 'x' });
    expect(svg.innerHTML.toLowerCase()).toContain(COAT_COLORS[coat].body.toLowerCase());
  });
});
