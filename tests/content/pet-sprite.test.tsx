// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ROBOT_COAT_LABELS } from '../../src/content/robot-sprite';
import { COAT_COLORS, PetBubble, PetSprite, paletteOf } from '../../src/content/pet-sprite';
import { COATS, DOG_COATS, ROBOT_COATS } from '../../src/core/library/library-types';
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

  const ROBOT_POSES: Pose[] = [...POSES, 'scan', 'standby', 'charge', 'beep'];
  it.each(ROBOT_POSES)('dessine le robot en pose %s', (pose) => {
    const svg = draw({ species: 'robot', coat: 'blue', pose, facing: 'r', name: 'Robi' });
    expect(svg.querySelector(`[data-pet-pose="${pose}"]`)).not.toBeNull();
    expect(svg.querySelector('[data-robot-body]')!.children.length).toBeGreaterThan(0);
    expect(svg.querySelector('[data-cat-body]')).toBeNull();
  });

  it.each(ROBOT_COATS)('le coloris %s du robot a sa palette et son libellé', (coat) => {
    expect(paletteOf('robot', coat).body).toMatch(/^#/);
    expect(paletteOf('robot', coat).belly).toMatch(/^#/);
    expect(ROBOT_COAT_LABELS[coat].length).toBeGreaterThan(0);
    const svg = draw({ species: 'robot', coat, pose: 'sit', facing: 'r', name: 'x' });
    expect(svg.innerHTML.toLowerCase()).toContain(paletteOf('robot', coat).body.toLowerCase());
  });

  it('le robot roule sur des chenilles animées, figées en mouvement réduit', () => {
    expect(draw({ species: 'robot', coat: 'white', pose: 'walk', facing: 'r', name: 'x' }).querySelector('animateTransform')).not.toBeNull();
    for (const pose of ROBOT_POSES) expect(draw({ species: 'robot', coat: 'white', pose, facing: 'r', name: 'x', still: true }).querySelector('animate, animateTransform')).toBeNull();
  });

  it('les yeux du robot suivent l’état : cœur, avertissement, tirets, voyants', () => {
    const eyes = (pose: Pose) => draw({ species: 'robot', coat: 'white', pose, facing: 'r', name: 'x' }).querySelector('[data-robot-eyes]')!.getAttribute('data-robot-eyes');
    expect(eyes('beep')).toBe('heart');
    expect(eyes('cower')).toBe('warn');
    expect(eyes('standby')).toBe('dash');
    expect(eyes('charge')).toBe('dash');
    expect(eyes('scan')).toBe('scan');
    expect(eyes('sit')).toBe('normal');
    const led = (pose: Pose) => draw({ species: 'robot', coat: 'white', pose, facing: 'r', name: 'x' }).querySelector('[data-robot-led]')?.getAttribute('data-robot-led');
    expect(led('standby')).toBe('orange');
    expect(led('charge')).toBe('green');
    expect(led('sit')).toBeUndefined();
  });

  it('le dos du robot reste plat à y = -26 (hauteur de la sieste du chat)', () => {
    const svg = draw({ species: 'robot', coat: 'white', pose: 'standby', facing: 'r', name: 'x' });
    expect(svg.querySelector('[data-robot-back]')!.getAttribute('y')).toBe('-26');
  });
});

describe('poses de contexte (6d)', () => {
  const html = (species: 'dog' | 'robot', pose: Pose, still = false) =>
    renderToStaticMarkup(<svg><PetSprite species={species} coat={species === 'dog' ? 'brown' : 'blue'} pose={pose} facing="r" name="X" still={still} /></svg>);
  it.each([
    ['dog', 'howl'], ['dog', 'shake'], ['robot', 'umbrella'], ['robot', 'shortcircuit'], ['robot', 'reboot'],
  ] as const)('dessine la pose %s/%s distincte de la pose assise', (species, pose) => {
    expect(html(species, pose)).not.toBe(html(species, 'sit'));
  });
  it('les étincelles du court-circuit sont coupées en mouvement réduit', () => {
    expect(html('robot', 'shortcircuit', false)).toContain('<animate');
    const still = html('robot', 'shortcircuit', true);
    expect(still).not.toContain('<animate');
    expect(still).toContain('#ffd23a');
    expect(still).toContain('#d33');
  });
  it('hurlement, secouement, parapluie et redémarrage : animés seulement hors mouvement réduit', () => {
    expect(html('dog', 'howl', false)).toContain('<animate');
    expect(html('dog', 'howl', true)).not.toContain('<animate');
    expect(html('dog', 'shake', false)).toContain('<animateTransform');
    expect(html('dog', 'shake', false)).toContain('values="-6 0 -16');
    expect(html('dog', 'shake', true)).not.toContain('<animate');
    expect(html('robot', 'umbrella', false)).toContain('data-robot-umbrella');
    expect(html('robot', 'umbrella', true)).not.toContain('<animate');
    expect(html('robot', 'reboot', false)).toContain('<animate');
    expect(html('robot', 'reboot', false)).toContain('data-robot-reboot');
    expect(html('robot', 'reboot', true)).not.toContain('<animate');
    expect(html('robot', 'reboot', true)).not.toContain('data-robot-reboot');
  });
});
