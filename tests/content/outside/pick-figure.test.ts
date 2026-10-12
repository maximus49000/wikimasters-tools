// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isShown, pickFigure } from '../../../src/content/outside/pick-figure';

function rect(el: Element, x: number, y: number, w: number, h: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y }) });
}
function scene(): { root: SVGGElement; a: Element; b: Element; c: Element } {
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  root.innerHTML = '<g data-life-id="a"></g><g data-life-id="b"></g><g data-worker=""><g data-figure="" data-sig="s" data-key="k"></g></g>';
  document.body.append(root);
  const [a, b, c] = [root.children[0]!, root.children[1]!, root.querySelector('[data-figure]')!];
  rect(a, 100, 100, 20, 40);
  rect(b, 110, 100, 20, 40);
  rect(root.children[2]!, 300, 100, 20, 40);
  rect(c, 300, 100, 20, 40);
  return { root, a, b, c };
}

describe('pickFigure', () => {
  it('prend le personnage sous le doigt, le plus en avant', () => {
    const { root, b } = scene();
    expect(pickFigure(root, 115, 120)).toBe(b);
  });
  it('sinon le plus proche à moins de 24 px, rien au-delà', () => {
    const { root, a, c } = scene();
    expect(pickFigure(root, 90, 120)).toBe(a);
    expect(pickFigure(root, 330, 120)).toBe(c);
    expect(pickFigure(root, 200, 120)).toBeNull();
  });
  it('visibility : l’ancêtre masqué cache, un « visible » plus proche rend', () => {
    const { root, b } = scene();
    const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    b.replaceWith(wrap);
    wrap.append(b);
    rect(b, 110, 100, 20, 40);
    wrap.setAttribute('visibility', 'hidden');
    expect(isShown(b, root)).toBe(false);
    expect(pickFigure(root, 115, 120)).not.toBe(b);
    b.setAttribute('visibility', 'visible');
    expect(isShown(b, root)).toBe(true);
    b.removeAttribute('visibility');
    (wrap as SVGElement).style.visibility = 'collapse';
    expect(isShown(b, root)).toBe(false);
  });
  it('opacity 0, display none (attribut ou style) sur un ancêtre cachent', () => {
    const { root, b } = scene();
    const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    b.replaceWith(wrap);
    wrap.append(b);
    rect(b, 110, 100, 20, 40);
    wrap.setAttribute('opacity', '0');
    expect(isShown(b, root)).toBe(false);
    wrap.removeAttribute('opacity');
    wrap.setAttribute('display', 'none');
    expect(isShown(b, root)).toBe(false);
    wrap.removeAttribute('display');
    (wrap as SVGElement).style.display = 'none';
    expect(isShown(b, root)).toBe(false);
    (wrap as SVGElement).style.display = '';
    expect(isShown(b, root)).toBe(true);
  });
  it('ignore les personnages cachés', () => {
    const { root, a, b, c } = scene();
    b.setAttribute('opacity', '0.00');
    expect(pickFigure(root, 115, 120)).toBe(a);
    c.removeAttribute('data-key');
    expect(isShown(c, root)).toBe(false);
    rect(a, 0, 0, 0, 0);
    expect(isShown(a, root)).toBe(false);
  });
});
