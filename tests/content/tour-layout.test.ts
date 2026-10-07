// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dockTop, planLayout } from '../../src/content/tour-geometry';
import { scrollContainerOf, scrollTargetBy } from '../../src/content/tour-scroll';

describe('planLayout : la zone visée et la bulle tiennent ensemble à l’écran', () => {
  it('garde la bulle en bas quand la zone est déjà dans la partie haute, sans défiler', () => {
    expect(planLayout({ left: 0, top: 100, width: 80, height: 200 }, 300, 800)).toEqual({ dock: 'bottom', top: 488, scrollBy: 0 });
  });

  it('passe la bulle en haut quand la zone est déjà dans la partie basse, sans défiler', () => {
    expect(planLayout({ left: 0, top: 600, width: 80, height: 150 }, 300, 800)).toEqual({ dock: 'top', top: 12, scrollBy: 0 });
  });

  it('cas de la capture : bulle haute, fenêtre étroite — choisit le côté qui demande le moins de défilement', () => {
    // Bas : il faudrait défiler de 194 px ; haut : de -184 px (la page descend un peu).
    expect(planLayout({ left: 0, top: 280, width: 80, height: 240 }, 440, 790)).toEqual({ dock: 'top', top: 12, scrollBy: -184 });
  });

  it('défile pour ramener une zone hors de l’écran dans l’espace libre', () => {
    const plan = planLayout({ left: 0, top: 1500, width: 80, height: 100 }, 300, 800);
    expect(plan.dock).toBe('top');
    expect(plan.top).toBe(12);
    // Espace libre : de 324 à 788 ; la zone (1500 → 1600) doit remonter pour que son bas arrive à 788.
    expect(plan.scrollBy).toBe(812);
  });

  it('zone plus haute que l’espace libre : garde son haut visible, sans la rogner côté bulle', () => {
    expect(planLayout({ left: 0, top: 100, width: 80, height: 700 }, 300, 800)).toEqual({ dock: 'bottom', top: 488, scrollBy: 88 });
  });

  it('ne plante pas quand la bulle est plus haute que l’écran', () => {
    const plan = planLayout({ left: 0, top: 100, width: 80, height: 100 }, 900, 800);
    expect(plan.top).toBe(12);
    expect(Number.isFinite(plan.scrollBy)).toBe(true);
  });

  it('dockTop : bulle calée en haut ou en bas, avec marge, jamais au-dessus du bord', () => {
    expect(dockTop('top', 300, 800)).toBe(12);
    expect(dockTop('bottom', 300, 800)).toBe(488);
    expect(dockTop('bottom', 900, 800)).toBe(12);
  });
});

describe('défilement de la page vers la zone', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('défile le plus proche ancêtre qui défile, pas la fenêtre', () => {
    document.body.innerHTML = '<div id="scroller" style="overflow-y: auto"><div id="inner"><span id="cible">x</span></div></div>';
    const scroller = document.getElementById('scroller')!;
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true });
    scroller.scrollTop = 100;
    const target = document.getElementById('cible')!;
    expect(scrollContainerOf(target)).toBe(scroller);
    scrollTargetBy(target, 250);
    expect(scroller.scrollTop).toBe(350);
    scrollTargetBy(target, -50);
    expect(scroller.scrollTop).toBe(300);
  });

  it('retombe sur la page entière quand aucun ancêtre ne défile', () => {
    document.body.innerHTML = '<div><span id="cible">x</span></div>';
    expect(scrollContainerOf(document.getElementById('cible')!)).toBe(document.scrollingElement ?? document.documentElement);
  });

  it('traverse un shadow DOM pour trouver le conteneur qui défile', () => {
    document.body.innerHTML = '<div id="scroller" style="overflow-y: scroll"><div id="host"></div></div>';
    const scroller = document.getElementById('scroller')!;
    Object.defineProperty(scroller, 'scrollHeight', { value: 3000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 600, configurable: true });
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button id="deep">x</button>';
    expect(scrollContainerOf(shadow.getElementById('deep')!)).toBe(scroller);
  });

  it('utilise scrollBy (défilement doux) quand il existe', () => {
    document.body.innerHTML = '<div id="scroller" style="overflow-y: auto"><span id="cible">x</span></div>';
    const scroller = document.getElementById('scroller')!;
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true });
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy as unknown as typeof scroller.scrollBy;
    scrollTargetBy(document.getElementById('cible')!, 120);
    expect(scrollBy).toHaveBeenCalledWith({ top: 120, behavior: 'smooth' });
  });
});
