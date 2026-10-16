// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ItemCase } from '../../src/content/opened-item/item-case';
import type { Opening } from '../../src/core/library/opened-item';
import type { Box } from '../../src/core/library/zoom-target';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Opts = {
  opening?: Opening; phase?: 'opening' | 'open' | 'closing'; from?: Box | null; to?: Box | null; cover?: string | null;
  disc?: 'in' | 'spinning' | 'away'; reduced?: boolean; right?: ReactNode;
};

function mount(o: Opts = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    createRoot(container).render(
      <ItemCase opening={o.opening ?? 'jewel-cd'} phase={o.phase ?? 'open'} from={o.from ?? null} to={o.to ?? null} cover={o.cover ?? null}
        color="#C0504D" title="Discovery" disc={o.disc ?? 'in'} reduced={o.reduced ?? false}
        selector={<ul data-test-selector=""><li>Piste 1</li></ul>} {...(o.right !== undefined ? { right: o.right } : {})} />,
    );
  });
  return container;
}

const caseOf = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-item-case]')!;
// Translation (px) et agrandissement lus dans le transform du boîtier.
function poseOf(el: HTMLElement): { x: number; y: number; s: number } {
  const t = el.style.transform;
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\((-?[\d.]+)\)/.exec(t);
  if (!m) throw new Error(`transform inattendu : ${t}`);
  return { x: Number(m[1]), y: Number(m[2]), s: Number(m[3]) };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('boîtier ouvert', () => {
  it('ouvert : le couvercle a pivoté de 180° autour de sa charnière gauche, sa face intérieure montre le sélecteur', () => {
    const c = mount({ phase: 'open' });
    const box = caseOf(c);
    expect(box.getAttribute('data-phase')).toBe('open');
    const lid = c.querySelector<HTMLElement>('[data-case-lid]')!;
    expect(lid.style.transform).toContain('rotateY(-180deg)');
    expect(lid.style.transformOrigin).toContain('left');
    expect(lid.querySelector('[data-test-selector]')).not.toBeNull();
    // Le disque, centré dans son plateau.
    expect(c.querySelector('[data-case-disc][data-disc="in"]')).not.toBeNull();
  });

  it('ouverture avec `from` : le boîtier part du rectangle de départ puis rejoint le centre', async () => {
    const from: Box = { x: 10, y: 20, w: 40, h: 35 };
    const c = mount({ phase: 'opening', from });
    const box = caseOf(c);
    expect(box.style.transform).toMatch(/translate\(.+\) scale\(.+\)/);
    const start = poseOf(box);
    expect(start.x).toBeGreaterThanOrEqual(from.x - 1e-6);
    expect(start.x).toBeLessThanOrEqual(from.x + from.w);
    expect(start.y).toBeGreaterThanOrEqual(from.y - 1e-6);
    expect(start.y).toBeLessThanOrEqual(from.y + from.h);
    expect(start.s).toBeLessThan(1);
    // Fermé pendant le vol.
    expect(c.querySelector<HTMLElement>('[data-case-lid]')!.style.transform).toContain('rotateY(0deg)');
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    const end = poseOf(box);
    expect(end.s).toBe(1);
    expect(end.x).not.toBe(start.x);
    // Vol de 500 ms, puis pivot de 700 ms.
    expect(box.style.transition).toContain('500ms');
    const lid = c.querySelector<HTMLElement>('[data-case-lid]')!;
    expect(lid.style.transform).toContain('rotateY(-180deg)');
    expect(lid.style.transition).toContain('700ms');
    expect(lid.style.transition).toContain('500ms');
  });

  it('fermeture avec `to` : le couvercle se referme et le boîtier se dirige vers `to`', () => {
    const to: Box = { x: 300, y: 200, w: 50, h: 44 };
    const c = mount({ phase: 'closing', to });
    const end = poseOf(caseOf(c));
    expect(end.x).toBeGreaterThanOrEqual(to.x - 1e-6);
    expect(end.x).toBeLessThanOrEqual(to.x + to.w);
    expect(end.y).toBeGreaterThanOrEqual(to.y - 1e-6);
    expect(end.y).toBeLessThanOrEqual(to.y + to.h);
    expect(end.s).toBeLessThan(1);
    expect(c.querySelector<HTMLElement>('[data-case-lid]')!.style.transform).toContain('rotateY(0deg)');
  });

  it('disque qui tourne : la rotation est sur un calque intérieur, le conteneur du disque ne bouge pas', () => {
    const c = mount({ disc: 'spinning', cover: 'https://exemple.org/pochette.jpg' });
    const disc = c.querySelector<HTMLElement>('[data-case-disc]')!;
    expect(disc.getAttribute('data-disc')).toBe('spinning');
    expect(disc.getAttribute('style') ?? '').not.toContain('translate');
    expect(disc.style.transform).toBe('');
    const spin = disc.querySelector<HTMLElement>('[data-case-disc-spin]')!;
    expect(spin.style.animation).toContain('wmt-case-disc-spin');
    // La pochette sur l'étiquette du disque.
    expect(disc.querySelector('image')!.getAttribute('href')).toBe('https://exemple.org/pochette.jpg');
  });

  it('disque à l’arrêt : pas d’animation', () => {
    const c = mount({ disc: 'in' });
    expect(c.querySelector<HTMLElement>('[data-case-disc-spin]')!.style.animation).toBe('');
  });

  it('sans pochette : étiquette à la couleur, avec le titre', () => {
    const c = mount({ disc: 'in', cover: null });
    const disc = c.querySelector('[data-case-disc]')!;
    expect(disc.querySelector('image')).toBeNull();
    expect(disc.textContent).toContain('Discovery');
    expect(disc.querySelector('[fill="#C0504D"]')).not.toBeNull();
  });

  it('disque au poste : plateau vide avec le moyeu et « Le disque est sur le poste »', () => {
    const c = mount({ disc: 'away' });
    expect(c.querySelector('[data-case-disc]')).toBeNull();
    const empty = c.querySelector('[data-case-tray-empty]')!;
    expect(empty.textContent).toContain('Le disque est sur le poste');
  });

  it('livre : pas de disque, la couverture à droite', () => {
    const c = mount({ opening: 'book', cover: 'https://exemple.org/couv.jpg' });
    expect(c.querySelector('[data-case-disc]')).toBeNull();
    const right = c.querySelector('[data-case-right]')!;
    expect(right.querySelector('[data-case-cover]')).not.toBeNull();
    expect(right.querySelector('image')!.getAttribute('href')).toBe('https://exemple.org/couv.jpg');
  });

  it('`right` remplace le disque (vidéo)', () => {
    const c = mount({ opening: 'dvd-case', right: <div data-test-video="" /> });
    expect(c.querySelector('[data-case-disc]')).toBeNull();
    expect(c.querySelector('[data-case-right] [data-test-video]')).not.toBeNull();
  });

  it('mouvement réduit : ni pivot ni vol, fondu de 150 ms', () => {
    const c = mount({ phase: 'opening', from: { x: 10, y: 20, w: 40, h: 35 }, reduced: true });
    expect(c.innerHTML).not.toContain('rotateY');
    const box = caseOf(c);
    expect(box.style.transition).toContain('opacity 150ms');
    expect(box.style.transition).not.toContain('transform');
    expect(poseOf(box).s).toBe(1);
  });

  it.each<Opening>(['jewel-cd', 'vinyl-sleeve', 'dvd-case', 'game-case', 'book'])('%s : boîtier dessiné (trait encré, aplats)', (opening) => {
    const c = mount({ opening });
    expect(caseOf(c).getAttribute('data-opening')).toBe(opening);
    expect(c.querySelectorAll('svg [stroke-width="2"]').length).toBeGreaterThan(3);
  });
});
